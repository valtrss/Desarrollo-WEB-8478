// Microservicio privado: analytics
//
// Separa el procesamiento analitico de las transacciones (Modulo 8 y 9).
// Mantiene un modelo de lectura propio alimentado desde orders por contrato
// interno: no abre la base de orders ni es autoridad sobre las ventas.
//
// Servicio del Modulo 1: S31. Requisito: RF9.

import { randomUUID } from 'node:crypto';
import { abrirBase, enTransaccion } from '../../shared/db.js';
import { crearApp, montarManejadorDeErrores, escucharPrivado, ruta, fallar } from '../../shared/http.js';
import { exigirIdentidadInterna, exigirRol, llamarServicio } from '../../shared/identidad.js';
import { exigirFechaIso, exigirUnoDe } from '../../shared/validacion.js';

const NOMBRE = 'analytics';
const PUERTO = 4005;
const ORDERS = 'http://127.0.0.1:4003';
const RETRASO_ACEPTADO_MS = 5 * 60 * 1000;

const db = abrirBase(NOMBRE);
const app = crearApp(NOMBRE);
app.use(exigirIdentidadInterna(NOMBRE));

const ahora = () => new Date().toISOString();

// El dia del negocio es el dia LOCAL del local, no el dia UTC. Si se agrupa
// por UTC, en Chile toda venta posterior a las 21:00 cae en la jornada
// siguiente y el reporte del RF9 parte la jornada en dos.
const diaLocal = (iso) => new Date(iso).toLocaleDateString('en-CA');

// Convierte un dia local (AAAA-MM-DD) en el instante en que empieza y termina
// ese dia aqui, para poder pedirle a orders el rango correcto.
function limitesDelDia(diaDesde, diaHasta) {
  const inicio = new Date(`${diaDesde}T00:00:00`);
  const fin = new Date(`${diaHasta}T23:59:59.999`);
  return { desdeIso: inicio.toISOString(), hastaIso: fin.toISOString() };
}

// Recalcula el modelo de lectura para un rango. Es idempotente: reescribe
// las filas del rango en vez de acumularlas.
async function actualizarModelo(desde, hasta, identidad) {
  const inicio = Date.now();
  const { desdeIso, hastaIso } = limitesDelDia(desde, hasta);
  const respuesta = await llamarServicio(
    `${ORDERS}/internal/ventas?desde=${encodeURIComponent(desdeIso)}&hasta=${encodeURIComponent(hastaIso)}`,
    { identidad: { ...identidad, rol: 'servicio' }, destino: 'orders', plazoMs: 10_000 }
  );
  if (!respuesta.ok) return { ok: false, filas: 0 };

  const filas = respuesta.datos.data ?? [];
  const porDia = new Map();
  const porProducto = new Map();

  for (const f of filas) {
    const dia = diaLocal(f.creado_en);

    if (!porDia.has(dia)) porDia.set(dia, { total: 0, pedidos: new Set() });
    const acumuladoDia = porDia.get(dia);
    acumuladoDia.pedidos.add(f.id);
    acumuladoDia.total += f.subtotal;

    const clave = dia + '|' + f.producto_id;
    if (!porProducto.has(clave)) {
      porProducto.set(clave, { dia, productoId: f.producto_id, nombre: f.nombre_producto, unidades: 0, monto: 0 });
    }
    const acumuladoProducto = porProducto.get(clave);
    acumuladoProducto.unidades += f.cantidad;
    acumuladoProducto.monto += f.subtotal;
  }

  enTransaccion(db, () => {
    for (const [dia, datos] of porDia) {
      db.prepare(`
        INSERT INTO ventas_por_dia (dia, total_ventas, cantidad_pedidos, actualizado_en)
        VALUES (?,?,?,?)
        ON CONFLICT(dia) DO UPDATE SET
          total_ventas = excluded.total_ventas,
          cantidad_pedidos = excluded.cantidad_pedidos,
          actualizado_en = excluded.actualizado_en
      `).run(dia, datos.total, datos.pedidos.size, ahora());
    }
    for (const datos of porProducto.values()) {
      db.prepare(`
        INSERT INTO ventas_por_producto (dia, producto_id, nombre, unidades, monto)
        VALUES (?,?,?,?,?)
        ON CONFLICT(dia, producto_id) DO UPDATE SET
          unidades = excluded.unidades, monto = excluded.monto, nombre = excluded.nombre
      `).run(datos.dia, datos.productoId, datos.nombre, datos.unidades, datos.monto);
    }
    db.prepare(
      'INSERT INTO actualizaciones (id, desde, hasta, filas, duracion_ms, ejecutada_en) VALUES (?,?,?,?,?,?)'
    ).run('act_' + randomUUID().slice(0, 8), desde, hasta, filas.length, Date.now() - inicio, ahora());
  });

  return { ok: true, filas: filas.length, duracionMs: Date.now() - inicio };
}

// ---------------------------------------------------------------------------
// S31 Reporte de ventas por periodo (RF9)
// ---------------------------------------------------------------------------
app.get('/reports/sales', exigirRol('dueno', 'administrador'), ruta(async (req, res) => {
  const desde = exigirFechaIso(req.query.from, 'from');
  const hasta = exigirFechaIso(req.query.to, 'to');
  const agrupacion = exigirUnoDe(req.query.agrupacion ?? 'dia', 'agrupacion', ['dia', 'semana', 'mes']);

  if (desde > hasta) fallar(400, 'rango_invalido', 'La fecha inicial no puede ser posterior a la final.');
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
  if (dias > 366) fallar(400, 'rango_excedido', 'El rango maximo de consulta es de un anio.');

  // Si el modelo de lectura esta mas atrasado que el retraso aceptado, se refresca.
  const ultima = db.prepare('SELECT * FROM actualizaciones ORDER BY ejecutada_en DESC LIMIT 1').get();
  const vencido = !ultima || Date.now() - Date.parse(ultima.ejecutada_en) > RETRASO_ACEPTADO_MS;
  if (vencido) await actualizarModelo(desde, hasta, req.identidad);

  const filas = db.prepare(
    'SELECT * FROM ventas_por_dia WHERE dia >= ? AND dia <= ? ORDER BY dia'
  ).all(desde, hasta);

  const agrupar = (dia) => {
    if (agrupacion === 'dia') return dia;
    if (agrupacion === 'mes') return dia.slice(0, 7);
    const fecha = new Date(dia);
    const lunes = new Date(fecha);
    lunes.setDate(fecha.getDate() - ((fecha.getDay() + 6) % 7));
    return diaLocal(lunes.toISOString());
  };

  const series = new Map();
  for (const f of filas) {
    const clave = agrupar(f.dia);
    if (!series.has(clave)) series.set(clave, { periodo: clave, ventas: 0, pedidos: 0 });
    series.get(clave).ventas += f.total_ventas;
    series.get(clave).pedidos += f.cantidad_pedidos;
  }

  const productos = db.prepare(`
    SELECT producto_id, nombre, SUM(unidades) AS unidades, SUM(monto) AS monto
    FROM ventas_por_producto WHERE dia >= ? AND dia <= ?
    GROUP BY producto_id, nombre ORDER BY monto DESC LIMIT 10
  `).all(desde, hasta);

  // El reporte entrega totales. Nunca incluye quien compro: eso es dato
  // restringido y no es necesario para responder el RF9.
  res.json({
    desde, hasta, agrupacion,
    totalVentas: filas.reduce((a, f) => a + f.total_ventas, 0),
    cantidadPedidos: filas.reduce((a, f) => a + f.cantidad_pedidos, 0),
    series: [...series.values()],
    masVendidos: productos,
    modeloActualizadoEn: ultima?.ejecutada_en ?? null,
    retrasoAceptadoMinutos: RETRASO_ACEPTADO_MS / 60000,
  });
}));

// Interno: lo usa el GraphQL Gateway para el panel del dueno.
app.get('/internal/resumen-hoy', ruta(async (req, res) => {
  const hoy = diaLocal(ahora());
  await actualizarModelo(hoy, hoy, req.identidad);
  const fila = db.prepare('SELECT * FROM ventas_por_dia WHERE dia = ?').get(hoy);
  res.json({
    dia: hoy,
    totalVentas: fila?.total_ventas ?? 0,
    cantidadPedidos: fila?.cantidad_pedidos ?? 0,
  });
}));

montarManejadorDeErrores(app, NOMBRE);
escucharPrivado(app, PUERTO, NOMBRE);
