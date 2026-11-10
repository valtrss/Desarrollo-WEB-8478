// GraphQL Gateway privado (Modulo 8).
//
// Escucha en 127.0.0.1: el navegador NO lo alcanza. Llega a traves del API
// Gateway, que valida la sesion y propaga la identidad verificada.
//
// Lo que este gateway hace:
//  - compone lecturas que necesitan varios subsistemas;
//  - autoriza por recurso y por campo, no solo por ruta;
//  - limita profundidad y cantidad de nodos de la consulta;
//  - agrupa las llamadas a inventory en una sola (batching).
//
// Lo que NO hace: escribir. Ni toca las bases de los otros servicios.

import express from 'express';
import { buildSchema, graphql, parse, validate, specifiedRules } from 'graphql';
import { SDL } from './esquema.js';
import { exigirIdentidadInterna, llamarServicio } from '../../shared/identidad.js';
import { crearApp, montarManejadorDeErrores, escucharPrivado } from '../../shared/http.js';

const NOMBRE = 'graphql-gateway';
const PUERTO = 4100;
const ORDERS = 'http://127.0.0.1:4003';
const INVENTORY = 'http://127.0.0.1:4002';
const CLIENTS = 'http://127.0.0.1:4001';
const ANALYTICS = 'http://127.0.0.1:4005';

const PROFUNDIDAD_MAXIMA = 8;
const NODOS_MAXIMOS = 200;

const schema = buildSchema(SDL);

// --- limites de costo -------------------------------------------------------
function medirConsulta(documento) {
  let profundidadMaxima = 0;
  let nodos = 0;

  const recorrer = (nodo, nivel) => {
    if (!nodo) return;
    if (nodo.kind === 'Field') {
      nodos++;
      profundidadMaxima = Math.max(profundidadMaxima, nivel);
    }
    const hijos = nodo.selectionSet?.selections ?? [];
    for (const hijo of hijos) recorrer(hijo, nivel + 1);
  };

  for (const definicion of documento.definitions) {
    for (const seleccion of definicion.selectionSet?.selections ?? []) {
      recorrer(seleccion, 1);
    }
  }
  return { profundidadMaxima, nodos };
}

// --- acceso a los subsistemas ----------------------------------------------
// Una sola llamada a inventory para todos los productos de la consulta:
// evita el patron de una peticion por item.
async function cargarProductos(ids, identidad) {
  const unicos = [...new Set(ids)].slice(0, 50);
  if (unicos.length === 0) return new Map();

  const respuesta = await llamarServicio(INVENTORY + '/internal/precios', {
    metodo: 'POST',
    cuerpo: { productoIds: unicos },
    identidad: { ...identidad, rol: 'servicio' },
    destino: 'inventory',
  });
  if (!respuesta.ok) return new Map(); // error parcial: el campo sale en null
  return new Map(respuesta.datos.data.map((p) => [p.id, p]));
}

function aProductoGraphql(p) {
  if (!p) return null;
  return {
    id: p.id, nombre: p.nombre, formato: p.formato, precio: p.precio,
    disponible: p.disponible, stockDelDia: p.stockLibre ?? p.stockDelDia ?? 0,
    imagenUrl: p.imagenUrl ?? null,
  };
}

async function componerResumen(pedido, identidad, { incluirDatosPersonales }) {
  const productos = await cargarProductos(pedido.items.map((i) => i.productoId), identidad);

  let nombreCliente = null;
  if (incluirDatosPersonales) {
    const cliente = await llamarServicio(CLIENTS + '/internal/clients/' + (pedido.clienteId ?? ''), {
      identidad: { ...identidad, rol: 'servicio' }, destino: 'clients',
    });
    if (cliente.ok) nombreCliente = cliente.datos.nombre;
  }

  return {
    id: pedido.id,
    estado: pedido.estado,
    subtotal: pedido.subtotal,
    costoDespacho: pedido.costoDespacho,
    total: pedido.total,
    ventanaDespacho: pedido.ventanaDespacho,
    creadoEn: pedido.creadoEn,
    anulacion: pedido.anulacion
      ? { motivo: pedido.anulacion.motivo, fecha: pedido.anulacion.fecha } : null,
    items: pedido.items.map((i) => ({
      ...i,
      productoVigente: aProductoGraphql(productos.get(i.productoId)),
    })),
    // Campos restringidos: solo si el solicitante tiene derecho a verlos.
    nombreCliente: incluirDatosPersonales ? nombreCliente : null,
    direccionEntrega: incluirDatosPersonales ? pedido.direccionEntrega : null,
  };
}

// --- resolvers --------------------------------------------------------------
const resolvers = {
  async resumenPedido({ id }, contexto) {
    const identidad = contexto.identidad;
    if (!identidad.usuarioId) {
      throw new Error('Debe iniciar sesion para ver un pedido.');
    }

    // orders aplica su propia comprobacion de propiedad: si el pedido no es de
    // este usuario responde 404 y aqui no hay nada que componer.
    const respuesta = await llamarServicio(ORDERS + '/orders/' + encodeURIComponent(id), {
      identidad, destino: 'orders',
    });
    if (respuesta.estado === 404) return null;
    if (!respuesta.ok) throw new Error('No se pudo obtener el pedido.');

    // Si orders devolvio el pedido, el solicitante ya pasó su comprobacion de
    // propiedad: es el dueno o es personal autorizado. Recien entonces se
    // componen los campos restringidos.
    return componerResumen(respuesta.datos, identidad, { incluirDatosPersonales: true });
  },

  async portada(args, contexto) {
    const identidad = contexto.identidad;

    const [productos, categorias] = await Promise.all([
      llamarServicio(INVENTORY + '/products/today', { identidad, destino: 'inventory' }),
      llamarServicio(INVENTORY + '/categories', { identidad, destino: 'inventory' }),
    ]);

    let misPedidos = [];
    if (identidad.rol === 'cliente' && identidad.usuarioId) {
      const pedidos = await llamarServicio(ORDERS + '/orders', { identidad, destino: 'orders' });
      if (pedidos.ok) {
        const ultimos = pedidos.datos.data.slice(0, 3);
        misPedidos = await Promise.all(
          ultimos.map((p) => componerResumen(p, identidad, { incluirDatosPersonales: true }))
        );
      }
    }

    return {
      // Error parcial: si inventory no responde, la home muestra lista vacia
      // en vez de caerse entera.
      productosDelDia: productos.ok ? productos.datos.data.map(aProductoGraphql) : [],
      categorias: categorias.ok ? categorias.datos.data : [],
      horaCorte: productos.ok ? (productos.datos.horaCorte ?? '16:00') : '16:00',
      misUltimosPedidos: misPedidos,
    };
  },

  async panelDueno(args, contexto) {
    const identidad = contexto.identidad;
    if (!['dueno', 'administrador'].includes(identidad.rol)) {
      throw new Error('Su perfil no tiene permiso para este panel.');
    }
    const [resumen, cola] = await Promise.all([
      llamarServicio(ANALYTICS + '/internal/resumen-hoy', {
        identidad: { ...identidad, rol: 'servicio' }, destino: 'analytics', plazoMs: 8000,
      }),
      llamarServicio(ORDERS + '/dispatch/orders', { identidad, destino: 'orders' }),
    ]);
    if (!resumen.ok) throw new Error('El servicio de analitica no respondio.');

    return {
      dia: resumen.datos.dia,
      totalVentas: resumen.datos.totalVentas,
      cantidadPedidos: resumen.datos.cantidadPedidos,
      pedidosEnCola: cola.ok ? cola.datos.data.length : 0,
    };
  },
};

// --- servidor ---------------------------------------------------------------
const app = crearApp(NOMBRE);
app.use(exigirIdentidadInterna(NOMBRE));

app.post('/graphql', async (req, res) => {
  const consulta = req.body?.query;
  if (typeof consulta !== 'string' || consulta.length > 8000) {
    return res.status(400).json({ errors: [{ message: 'Consulta ausente o demasiado larga.' }] });
  }

  let documento;
  try {
    documento = parse(consulta);
  } catch (error) {
    return res.status(400).json({ errors: [{ message: 'La consulta no es valida.' }] });
  }

  const erroresDeValidacion = validate(schema, documento, specifiedRules);
  if (erroresDeValidacion.length > 0) {
    return res.status(400).json({
      errors: erroresDeValidacion.map((e) => ({ message: e.message })),
    });
  }

  const { profundidadMaxima, nodos } = medirConsulta(documento);
  if (profundidadMaxima > PROFUNDIDAD_MAXIMA || nodos > NODOS_MAXIMOS) {
    return res.status(400).json({
      errors: [{ message: `Consulta demasiado costosa (profundidad ${profundidadMaxima}, nodos ${nodos}).` }],
    });
  }

  const resultado = await graphql({
    schema,
    source: consulta,
    rootValue: resolvers,
    variableValues: req.body?.variables ?? {},
    contextValue: { identidad: req.identidad },
  });

  // Los errores de resolver salen con su mensaje de negocio, sin stack.
  res.json({
    data: resultado.data ?? null,
    errors: resultado.errors?.map((e) => ({ message: e.message, path: e.path })),
  });
});

montarManejadorDeErrores(app, NOMBRE);
escucharPrivado(app, PUERTO, NOMBRE);
