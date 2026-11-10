// Microservicio privado: orders
//
// Autoridad sobre: carrito, pedido y su ciclo de vida.
// Servicios del Modulo 1: S16 a S26. Requisitos: RF1, RF2, RF3, RF4, RF13.
//
// Regla central: el navegador no aporta precios, totales ni estados.
// Los precios se piden a inventory y el total lo calcula este servicio.

import { randomUUID } from 'node:crypto';
import { abrirBase, enTransaccion } from '../../shared/db.js';
import { crearApp, montarManejadorDeErrores, escucharPrivado, ruta, fallar } from '../../shared/http.js';
import { exigirIdentidadInterna, exigirRol, llamarServicio } from '../../shared/identidad.js';
import { exigirTexto, exigirEntero } from '../../shared/validacion.js';
import { reservarStockPorGrpc } from './cliente-grpc.js';

const NOMBRE = 'orders';
const PUERTO = 4003;
const INVENTORY = 'http://127.0.0.1:4002';
const HORA_CORTE = 16; // RF propio del rubro: pasta fresca del dia

const db = abrirBase(NOMBRE);
const app = crearApp(NOMBRE);
app.use(exigirIdentidadInterna(NOMBRE));

const ahora = () => new Date().toISOString();

// Transiciones permitidas. RF2: nada entra a preparacion sin pago confirmado.
const TRANSICIONES = {
  pendiente_pago: ['pagado', 'anulado'],
  pagado: ['en_preparacion', 'anulado'],
  en_preparacion: ['en_despacho', 'anulado'],
  en_despacho: ['entregado'],
  entregado: [],
  anulado: [],
};

function registrarTransicion(pedidoId, desde, hacia, identidad) {
  db.prepare(
    'INSERT INTO transiciones (id, pedido_id, desde, hacia, actor, rol, fecha) VALUES (?,?,?,?,?,?,?)'
  ).run('trn_' + randomUUID().slice(0, 8), pedidoId, desde, hacia,
        identidad.usuarioId ?? 'sistema', identidad.rol, ahora());
}

function obtenerCarrito(clienteId) {
  let carrito = db.prepare('SELECT * FROM carritos WHERE cliente_id = ?').get(clienteId);
  if (!carrito) {
    const id = 'car_' + randomUUID().slice(0, 8);
    db.prepare('INSERT INTO carritos (id, cliente_id, creado_en, actualizado_en) VALUES (?,?,?,?)')
      .run(id, clienteId, ahora(), ahora());
    carrito = db.prepare('SELECT * FROM carritos WHERE id = ?').get(id);
  }
  return carrito;
}

// Arma la vista del carrito pidiendo los precios autorizados a inventory.
async function componerCarrito(carrito, identidad) {
  const items = db.prepare('SELECT * FROM carrito_items WHERE carrito_id = ?').all(carrito.id);
  if (items.length === 0) {
    return { carritoId: carrito.id, items: [], subtotal: 0, despacho: 0, total: 0 };
  }

  const respuesta = await llamarServicio(INVENTORY + '/internal/precios', {
    metodo: 'POST',
    cuerpo: { productoIds: items.map((i) => i.producto_id) },
    identidad, destino: 'inventory',
  });
  if (!respuesta.ok) {
    fallar(503, 'catalogo_no_disponible',
      'No se puede mostrar el carrito porque el catalogo no responde.');
  }

  const porId = new Map(respuesta.datos.data.map((p) => [p.id, p]));
  const detalle = [];
  let subtotal = 0;

  for (const item of items) {
    const producto = porId.get(item.producto_id);
    if (!producto) continue; // descontinuado: se omite y el total se recalcula
    const sub = producto.precio * item.cantidad;
    subtotal += sub;
    detalle.push({
      id: item.id,
      productoId: producto.id,
      nombre: producto.nombre,
      formato: producto.formato,
      precioUnitario: producto.precio,
      cantidad: item.cantidad,
      subtotal: sub,
      disponible: producto.disponible,
      stockLibre: producto.stockLibre,
    });
  }
  return { carritoId: carrito.id, items: detalle, subtotal, despacho: 0, total: subtotal };
}

// ---------------------------------------------------------------------------
// S33 Listar comunas con despacho declarado
// ---------------------------------------------------------------------------
app.get('/delivery/comunas', ruta((req, res) => {
  const filas = db.prepare(
    'SELECT comuna, dentro_radio, costo, region FROM comunas_despacho ORDER BY dentro_radio DESC, comuna'
  ).all();
  res.json({
    data: filas.map((f) => ({
      comuna: f.comuna, region: f.region,
      dentroDelRadio: f.dentro_radio === 1, costo: f.costo,
    })),
    radioKm: 3,
  });
}));

// ---------------------------------------------------------------------------
// S16 Validar comuna de despacho
// ---------------------------------------------------------------------------
app.post('/delivery/check', ruta((req, res) => {
  const comuna = exigirTexto(req.body?.comuna, 'comuna', { max: 80 });
  const fila = db.prepare('SELECT * FROM comunas_despacho WHERE LOWER(comuna) = ?')
    .get(comuna.toLowerCase());

  if (!fila || fila.dentro_radio === 0) {
    return res.json({
      comuna, dentroDelRadio: false, costo: null,
      mensaje: 'Por ahora solo despachamos dentro de 3 km del local.',
    });
  }
  res.json({ comuna: fila.comuna, dentroDelRadio: true, costo: fila.costo });
}));

// ---------------------------------------------------------------------------
// S17 a S20 Carrito
// ---------------------------------------------------------------------------
app.get('/cart', exigirRol('cliente', 'invitado'), ruta(async (req, res) => {
  const carrito = obtenerCarrito(req.identidad.usuarioId);
  res.json(await componerCarrito(carrito, req.identidad));
}));

app.post('/cart/items', exigirRol('cliente', 'invitado'), ruta(async (req, res) => {
  const productoId = exigirTexto(req.body?.productoId, 'productoId', { max: 40 });
  const cantidad = exigirEntero(req.body?.cantidad ?? 1, 'cantidad', { min: 1, max: 20 });

  // Verifica contra inventory, que es la autoridad sobre disponibilidad.
  const consulta = await llamarServicio(INVENTORY + '/internal/precios', {
    metodo: 'POST', cuerpo: { productoIds: [productoId] },
    identidad: req.identidad, destino: 'inventory',
  });
  if (!consulta.ok) fallar(503, 'catalogo_no_disponible', 'El catalogo no responde.');

  const producto = consulta.datos.data[0];
  if (!producto) fallar(404, 'no_encontrado', 'El producto no existe o fue descontinuado.');
  if (!producto.disponible || producto.stockLibre < cantidad) {
    fallar(409, 'stock_insuficiente', 'No queda stock del dia suficiente de ese producto.',
      { disponible: producto.stockLibre });
  }

  const carrito = obtenerCarrito(req.identidad.usuarioId);
  const existente = db.prepare(
    'SELECT * FROM carrito_items WHERE carrito_id = ? AND producto_id = ?'
  ).get(carrito.id, productoId);

  if (existente) {
    const nueva = Math.min(20, existente.cantidad + cantidad);
    if (nueva > producto.stockLibre) {
      fallar(409, 'stock_insuficiente', 'No queda stock del dia suficiente de ese producto.',
        { disponible: producto.stockLibre });
    }
    db.prepare('UPDATE carrito_items SET cantidad = ? WHERE id = ?').run(nueva, existente.id);
  } else {
    db.prepare('INSERT INTO carrito_items (id, carrito_id, producto_id, cantidad) VALUES (?,?,?,?)')
      .run('it_' + randomUUID().slice(0, 8), carrito.id, productoId, cantidad);
  }
  db.prepare('UPDATE carritos SET actualizado_en = ? WHERE id = ?').run(ahora(), carrito.id);

  res.json(await componerCarrito(carrito, req.identidad));
}));

app.put('/cart/items/:id', exigirRol('cliente', 'invitado'), ruta(async (req, res) => {
  const cantidad = exigirEntero(req.body?.cantidad, 'cantidad', { min: 1, max: 20 });
  const carrito = obtenerCarrito(req.identidad.usuarioId);
  const item = db.prepare('SELECT * FROM carrito_items WHERE id = ? AND carrito_id = ?')
    .get(req.params.id, carrito.id);
  if (!item) fallar(404, 'no_encontrado', 'Ese producto no esta en su carrito.');

  db.prepare('UPDATE carrito_items SET cantidad = ? WHERE id = ?').run(cantidad, item.id);
  res.json(await componerCarrito(carrito, req.identidad));
}));

app.delete('/cart/items/:id', exigirRol('cliente', 'invitado'), ruta(async (req, res) => {
  const carrito = obtenerCarrito(req.identidad.usuarioId);
  const item = db.prepare('SELECT * FROM carrito_items WHERE id = ? AND carrito_id = ?')
    .get(req.params.id, carrito.id);
  if (!item) fallar(404, 'no_encontrado', 'Ese producto no esta en su carrito.');

  db.prepare('DELETE FROM carrito_items WHERE id = ?').run(item.id);
  res.json(await componerCarrito(carrito, req.identidad));
}));

// ---------------------------------------------------------------------------
// S21 Confirmar pedido (RF1, RF4)
// ---------------------------------------------------------------------------
app.post('/orders', exigirRol('cliente', 'invitado'), ruta(async (req, res) => {
  const direccion = exigirTexto(req.body?.direccionEntrega, 'direccionEntrega', { min: 5, max: 160 });
  const comuna = exigirTexto(req.body?.comuna, 'comuna', { max: 80 });
  const observaciones = req.body?.observaciones
    ? exigirTexto(req.body.observaciones, 'observaciones', { max: 300 }) : null;

  const zona = db.prepare('SELECT * FROM comunas_despacho WHERE LOWER(comuna) = ?')
    .get(comuna.toLowerCase());
  if (!zona || zona.dentro_radio === 0) {
    fallar(409, 'fuera_de_radio', 'La comuna indicada queda fuera del radio de despacho de 3 km.');
  }

  const carrito = obtenerCarrito(req.identidad.usuarioId);
  const vista = await componerCarrito(carrito, req.identidad);
  if (vista.items.length === 0) fallar(409, 'carrito_vacio', 'Su carrito esta vacio.');

  const pedidoId = 'ped_' + randomUUID().slice(0, 10);

  // Reserva el stock ANTES de aceptar el pedido. Se hace por gRPC
  // (Modulo 9) con respaldo por HTTP si el canal no esta disponible.
  let reserva;
  try {
    reserva = await reservarStockPorGrpc({
      pedidoId,
      items: vista.items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
      identidad: req.identidad,
    });
  } catch (error) {
    if (error.codigo === 'stock_insuficiente') {
      fallar(409, 'stock_insuficiente',
        'Alguno de los productos perdio stock mientras compraba.', error.detalle);
    }
    fallar(503, 'inventario_no_disponible',
      'No se pudo confirmar el pedido porque el inventario no responde.');
  }

  // El total lo calcula este servicio, con los precios de inventory.
  const costoDespacho = zona.costo;

  // Promocion: 5% en la primera compra de una cuenta registrada. Un invitado
  // no la recibe, y por eso la pantalla lo invita a crear cuenta. La regla
  // vive aqui, no en el navegador: no se puede reclamar desde el cliente.
  const esInvitado = req.identidad.rol === 'invitado';
  const comprasPrevias = esInvitado ? 1 : db.prepare(
    "SELECT COUNT(*) AS n FROM pedidos WHERE cliente_id = ? AND estado <> 'anulado'"
  ).get(req.identidad.usuarioId).n;

  const descuento = comprasPrevias === 0 ? Math.round(vista.subtotal * 0.05) : 0;
  const total = vista.subtotal + costoDespacho - descuento;

  // Un invitado compra entregando solo su correo de contacto (RF4 adaptado).
  const correoContacto = esInvitado ? req.identidad.correo : null;
  if (esInvitado && !correoContacto) {
    fallar(400, 'correo_requerido',
      'Para comprar como invitado necesitamos un correo de contacto.');
  }
  const ventana = new Date();
  if (ventana.getHours() >= HORA_CORTE) ventana.setDate(ventana.getDate() + 1);
  ventana.setHours(18, 0, 0, 0);

  enTransaccion(db, () => {
    db.prepare(`
      INSERT INTO pedidos (id, cliente_id, estado, subtotal, costo_despacho, descuento,
        total, correo_contacto, direccion_entrega, comuna, observaciones,
        ventana_despacho, creado_en, actualizado_en)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(pedidoId, req.identidad.usuarioId, 'pendiente_pago', vista.subtotal,
           costoDespacho, descuento, total, correoContacto, direccion, zona.comuna,
           observaciones, ventana.toISOString(), ahora(), ahora());

    for (const item of vista.items) {
      db.prepare(`
        INSERT INTO pedido_items (id, pedido_id, producto_id, nombre_producto,
          formato, precio_unitario, cantidad, subtotal)
        VALUES (?,?,?,?,?,?,?,?)
      `).run('pit_' + randomUUID().slice(0, 8), pedidoId, item.productoId, item.nombre,
             item.formato, item.precioUnitario, item.cantidad, item.subtotal);
    }
    db.prepare('DELETE FROM carrito_items WHERE carrito_id = ?').run(carrito.id);
  });

  registrarTransicion(pedidoId, 'nuevo', 'pendiente_pago', req.identidad);

  res.status(201).json({
    pedidoId, estado: 'pendiente_pago', subtotal: vista.subtotal,
    costoDespacho, descuento, total, ventanaDespacho: ventana.toISOString(),
    expiraReserva: reserva.expiraEn,
  });
}));

// ---------------------------------------------------------------------------
// S22 Mis pedidos / S23 Un pedido
// ---------------------------------------------------------------------------
function pedidoCompleto(fila) {
  const items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(fila.id);
  const anulacion = db.prepare('SELECT * FROM anulaciones WHERE pedido_id = ?').get(fila.id);
  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    estado: fila.estado,
    subtotal: fila.subtotal,
    costoDespacho: fila.costo_despacho,
    descuento: fila.descuento ?? 0,
    total: fila.total,
    comuna: fila.comuna,
    direccionEntrega: fila.direccion_entrega,
    ventanaDespacho: fila.ventana_despacho,
    creadoEn: fila.creado_en,
    items: items.map((i) => ({
      productoId: i.producto_id, nombre: i.nombre_producto, formato: i.formato,
      precioUnitario: i.precio_unitario, cantidad: i.cantidad, subtotal: i.subtotal,
    })),
    anulacion: anulacion
      ? { motivo: anulacion.motivo, fecha: anulacion.fecha, rol: anulacion.rol }
      : null,
  };
}

app.get('/orders', exigirRol('cliente', 'invitado'), ruta((req, res) => {
  const filas = db.prepare(
    'SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY creado_en DESC LIMIT 50'
  ).all(req.identidad.usuarioId);
  res.json({ data: filas.map(pedidoCompleto) });
}));

app.get('/orders/:id', ruta((req, res) => {
  const fila = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!fila) fallar(404, 'no_encontrado', 'El pedido no existe.');

  // Comprobacion de propiedad: un cliente solo ve SUS pedidos.
  // Que la ruta sea alcanzable no significa que el recurso sea suyo.
  const esDuenoDelPedido = fila.cliente_id === req.identidad.usuarioId;
  const esPersonal = ['administrador', 'cajero', 'despacho', 'dueno'].includes(req.identidad.rol);
  if (!esDuenoDelPedido && !esPersonal) {
    // 404 y no 403: no confirma que el pedido exista.
    fallar(404, 'no_encontrado', 'El pedido no existe.');
  }
  res.json(pedidoCompleto(fila));
}));

// ---------------------------------------------------------------------------
// S24 Anular pedido (RF3). No borra: cambia de estado y registra el motivo.
// ---------------------------------------------------------------------------
app.post('/orders/:id/cancellation', ruta(async (req, res) => {
  const motivo = exigirTexto(req.body?.motivo, 'motivo', { min: 10, max: 300 });
  const fila = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!fila) fallar(404, 'no_encontrado', 'El pedido no existe.');

  const esDuenoDelPedido = fila.cliente_id === req.identidad.usuarioId;
  const esAdministrador = req.identidad.rol === 'administrador';
  if (!esDuenoDelPedido && !esAdministrador) {
    fallar(404, 'no_encontrado', 'El pedido no existe.');
  }
  if (!TRANSICIONES[fila.estado].includes('anulado')) {
    fallar(409, 'estado_no_permite_anular',
      `Un pedido en estado "${fila.estado}" ya no se puede anular.`);
  }
  // Una vez en preparacion, solo el administrador puede anular: la pasta ya se hizo.
  if (fila.estado === 'en_preparacion' && !esAdministrador) {
    fallar(409, 'ya_en_preparacion',
      'El pedido ya entro a cocina. Comuniquese con el local para anularlo.');
  }

  enTransaccion(db, () => {
    db.prepare('UPDATE pedidos SET estado = ?, actualizado_en = ? WHERE id = ?')
      .run('anulado', ahora(), fila.id);
    db.prepare(
      'INSERT INTO anulaciones (pedido_id, motivo, anulado_por, rol, fecha) VALUES (?,?,?,?,?)'
    ).run(fila.id, motivo, req.identidad.usuarioId, req.identidad.rol, ahora());
  });
  registrarTransicion(fila.id, fila.estado, 'anulado', req.identidad);

  // Devuelve la produccion reservada al stock del dia.
  await llamarServicio(INVENTORY + `/internal/reservas/${fila.id}/liberar`, {
    metodo: 'POST', identidad: req.identidad, destino: 'inventory',
  });

  res.json({ pedidoId: fila.id, estado: 'anulado', motivo, fecha: ahora() });
}));

// ---------------------------------------------------------------------------
// S25 Cambiar estado (admin o cajero)
// ---------------------------------------------------------------------------
app.put('/orders/:id/status', exigirRol('administrador', 'cajero'), ruta((req, res) => {
  const hacia = exigirTexto(req.body?.estado, 'estado', { max: 30 });
  const fila = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!fila) fallar(404, 'no_encontrado', 'El pedido no existe.');

  if (!TRANSICIONES[fila.estado]?.includes(hacia)) {
    fallar(409, 'transicion_invalida',
      `No se puede pasar de "${fila.estado}" a "${hacia}".`,
      { permitidas: TRANSICIONES[fila.estado] });
  }
  // RF2: el paso a pagado lo decide payments, nunca una persona por esta ruta.
  if (hacia === 'pagado') {
    fallar(403, 'reservado_a_payments',
      'El estado de pago lo confirma el servicio de pagos, no esta ruta.');
  }

  db.prepare('UPDATE pedidos SET estado = ?, actualizado_en = ? WHERE id = ?')
    .run(hacia, ahora(), fila.id);
  registrarTransicion(fila.id, fila.estado, hacia, req.identidad);

  res.json({ pedidoId: fila.id, estado: hacia });
}));

// ---------------------------------------------------------------------------
// S26 Cola de despacho (RF13): pedidos pagados, en orden de llegada
// ---------------------------------------------------------------------------
app.get('/dispatch/orders', exigirRol('despacho', 'administrador'), ruta((req, res) => {
  const filas = db.prepare(
    "SELECT * FROM pedidos WHERE estado IN ('pagado','en_preparacion') ORDER BY creado_en ASC LIMIT 50"
  ).all();
  res.json({
    data: filas.map((f) => ({
      pedidoId: f.id,
      estado: f.estado,
      creadoEn: f.creado_en,
      comuna: f.comuna,
      direccionEntrega: f.direccion_entrega,
      items: db.prepare('SELECT nombre_producto, formato, cantidad FROM pedido_items WHERE pedido_id = ?')
        .all(f.id)
        .map((i) => ({ nombre: i.nombre_producto, formato: i.formato, cantidad: i.cantidad })),
    })),
  });
}));

// ---------------------------------------------------------------------------
// Interno: payments confirma el pago. Unico camino a "pagado" (RF2).
// ---------------------------------------------------------------------------
app.post('/internal/orders/:id/pagado', ruta(async (req, res) => {
  if (req.identidad.rol !== 'servicio') {
    fallar(403, 'sin_permiso', 'Operacion reservada al servicio de pagos.');
  }
  const fila = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!fila) fallar(404, 'no_encontrado', 'El pedido no existe.');

  // Idempotencia: una segunda notificacion del mismo pago no hace nada.
  if (fila.estado !== 'pendiente_pago') {
    return res.json({ pedidoId: fila.id, estado: fila.estado, cambio: false });
  }
  const montoConfirmado = exigirEntero(req.body?.montoConfirmado, 'montoConfirmado', { min: 1 });
  if (montoConfirmado !== fila.total) {
    fallar(409, 'monto_no_coincide',
      'El monto confirmado no corresponde al total del pedido.');
  }

  db.prepare('UPDATE pedidos SET estado = ?, actualizado_en = ? WHERE id = ?')
    .run('pagado', ahora(), fila.id);
  registrarTransicion(fila.id, 'pendiente_pago', 'pagado', { usuarioId: 'payments', rol: 'servicio' });

  // El pago se concreto: la produccion reservada sale del stock.
  await llamarServicio(INVENTORY + `/internal/reservas/${fila.id}/consumir`, {
    metodo: 'POST', identidad: req.identidad, destino: 'inventory',
  });

  res.json({ pedidoId: fila.id, estado: 'pagado', cambio: true });
}));

// Interno: payments necesita el monto oficial. No lo recibe del navegador.
app.get('/internal/orders/:id', ruta((req, res) => {
  if (!['servicio', 'administrador', 'dueno'].includes(req.identidad.rol)) {
    fallar(403, 'sin_permiso', 'Operacion reservada a servicios internos.');
  }
  const fila = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!fila) fallar(404, 'no_encontrado', 'El pedido no existe.');
  res.json({
    id: fila.id, clienteId: fila.cliente_id, estado: fila.estado, total: fila.total,
    correoContacto: fila.correo_contacto,
  });
}));

// Interno: analytics lee ventas agregadas. No recibe datos personales.
app.get('/internal/ventas', ruta((req, res) => {
  if (!['servicio', 'administrador', 'dueno'].includes(req.identidad.rol)) {
    fallar(403, 'sin_permiso', 'Operacion reservada a servicios internos.');
  }
  // Llegan como instantes ISO completos: quien llama ya resolvio el huso.
  const desde = exigirTexto(req.query.desde, 'desde', { max: 40 });
  const hasta = exigirTexto(req.query.hasta, 'hasta', { max: 40 });

  const filas = db.prepare(`
    SELECT p.id, p.creado_en, p.total, i.producto_id, i.nombre_producto, i.cantidad, i.subtotal
    FROM pedidos p
    JOIN pedido_items i ON i.pedido_id = p.id
    WHERE p.estado IN ('pagado','en_preparacion','en_despacho','entregado')
      AND p.creado_en >= ? AND p.creado_en <= ?
  `).all(desde, hasta);

  res.json({ data: filas });
}));

montarManejadorDeErrores(app, NOMBRE);
escucharPrivado(app, PUERTO, NOMBRE);
