// Microservicio privado: payments
//
// Autoridad sobre: el estado del pago y la boleta.
// Servicios del Modulo 1: S27, S28, S29, S30. Requisitos: RF2, RF8.
//
// Dos reglas que la guia subraya:
//  - el monto lo determina orders, nunca el navegador;
//  - una notificacion del proveedor se verifica por firma y no se procesa dos veces.

import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { abrirBase, enTransaccion } from '../../shared/db.js';
import { crearApp, montarManejadorDeErrores, escucharPrivado, ruta, fallar } from '../../shared/http.js';
import { exigirIdentidadInterna, exigirRol, llamarServicio } from '../../shared/identidad.js';
import { obtenerSecreto } from '../../shared/secretos.js';
import { exigirTexto, exigirUnoDe } from '../../shared/validacion.js';

const NOMBRE = 'payments';
const PUERTO = 4004;
const ORDERS = 'http://127.0.0.1:4003';
const CLIENTS = 'http://127.0.0.1:4001';

const db = abrirBase(NOMBRE);
const app = crearApp(NOMBRE);
app.use(exigirIdentidadInterna(NOMBRE));

const ahora = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// S27 Iniciar pago
// ---------------------------------------------------------------------------
app.post('/payments', exigirRol('cliente', 'invitado'), ruta(async (req, res) => {
  const pedidoId = exigirTexto(req.body?.pedidoId, 'pedidoId', { max: 40 });
  const medio = exigirUnoDe(req.body?.medio, 'medio', ['servipag', 'transferencia']);

  // El monto se consulta a orders. Si viniera en el cuerpo, se ignora.
  const pedido = await llamarServicio(ORDERS + '/internal/orders/' + pedidoId, {
    identidad: { ...req.identidad, rol: 'servicio' }, destino: 'orders',
  });
  if (!pedido.ok) {
    fallar(pedido.estado === 404 ? 404 : 503,
      pedido.estado === 404 ? 'no_encontrado' : 'pedidos_no_disponible',
      pedido.estado === 404 ? 'El pedido no existe.' : 'No se pudo consultar el pedido.');
  }

  // Propiedad del recurso: solo el dueno del pedido puede pagarlo.
  if (pedido.datos.clienteId !== req.identidad.usuarioId) {
    fallar(404, 'no_encontrado', 'El pedido no existe.');
  }
  if (pedido.datos.estado !== 'pendiente_pago') {
    fallar(409, 'pedido_no_pagable',
      `El pedido esta en estado "${pedido.datos.estado}" y ya no admite pago.`);
  }

  const vigente = db.prepare(
    "SELECT * FROM pagos WHERE pedido_id = ? AND estado = 'iniciado'"
  ).get(pedidoId);
  if (vigente) {
    return res.status(200).json({
      pagoId: vigente.id, estado: vigente.estado,
      urlRedireccion: `https://sandbox.proveedor-pagos.cl/checkout/${vigente.id}`,
      monto: vigente.monto, reutilizado: true,
    });
  }

  const id = 'pag_' + randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO pagos (id, pedido_id, cliente_id, monto, medio, estado, correo_contacto, creado_en, actualizado_en)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(id, pedidoId, req.identidad.usuarioId, pedido.datos.total, medio, 'iniciado',
         pedido.datos.correoContacto ?? null, ahora(), ahora());

  res.status(201).json({
    pagoId: id,
    estado: 'iniciado',
    monto: pedido.datos.total,
    // En el entorno de prueba del proveedor. La credencial de comercio nunca
    // viaja al navegador: solo este identificador de transaccion.
    urlRedireccion: `https://sandbox.proveedor-pagos.cl/checkout/${id}`,
  });
}));

// ---------------------------------------------------------------------------
// S29 Consultar estado de un pago
// ---------------------------------------------------------------------------
app.get('/payments/:id', ruta((req, res) => {
  const fila = db.prepare('SELECT * FROM pagos WHERE id = ?').get(req.params.id);
  if (!fila) fallar(404, 'no_encontrado', 'El pago no existe.');

  const esPropietario = fila.cliente_id === req.identidad.usuarioId;
  const esPersonal = ['administrador', 'cajero'].includes(req.identidad.rol);
  if (!esPropietario && !esPersonal) fallar(404, 'no_encontrado', 'El pago no existe.');

  res.json({
    pagoId: fila.id, pedidoId: fila.pedido_id, estado: fila.estado,
    monto: fila.monto, medio: fila.medio, actualizadoEn: fila.actualizado_en,
  });
}));

// ---------------------------------------------------------------------------
// S28 Webhook del proveedor de pagos.
//
// Esta ruta NO lleva sesion de usuario: la identidad es la firma HMAC.
// Se verifica la firma ANTES de confiar en el cuerpo.
// ---------------------------------------------------------------------------
function firmaValida(cuerpoCrudo, firmaRecibida) {
  if (!firmaRecibida) return false;
  const esperada = createHmac('sha256', obtenerSecreto('pagos-webhook'))
    .update(cuerpoCrudo).digest('hex');
  const a = Buffer.from(esperada, 'utf8');
  const b = Buffer.from(String(firmaRecibida), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

app.post('/payments/webhook', ruta(async (req, res) => {
  const cuerpoCrudo = JSON.stringify(req.body ?? {});
  if (!firmaValida(cuerpoCrudo, req.get('x-signature'))) {
    console.warn(JSON.stringify({
      servicio: NOMBRE, correlacion: req.identidad.correlacion,
      evento: 'webhook_firma_invalida',
    }));
    fallar(401, 'firma_invalida', 'Firma de la notificacion invalida.');
  }

  const clave = exigirTexto(req.get('x-idempotency-key'), 'x-idempotency-key', { max: 100 });
  const yaProcesada = db.prepare('SELECT * FROM notificaciones WHERE idempotency_key = ?').get(clave);
  if (yaProcesada) {
    // Segunda entrega de la misma notificacion: se acepta y no se repite nada.
    return res.json({ estado: 'ya_procesada', resultado: yaProcesada.resultado });
  }

  const pagoId = exigirTexto(req.body?.pagoId, 'pagoId', { max: 40 });
  const estado = exigirUnoDe(req.body?.estado, 'estado', ['aprobado', 'rechazado']);

  const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(pagoId);
  if (!pago) fallar(404, 'no_encontrado', 'El pago no existe.');

  // El monto informado debe coincidir con el que este servicio registro.
  const montoInformado = Number(req.body?.montoConfirmado);
  if (estado === 'aprobado' && montoInformado !== pago.monto) {
    db.prepare('INSERT INTO notificaciones (idempotency_key, pago_id, resultado, recibida_en) VALUES (?,?,?,?)')
      .run(clave, pagoId, 'rechazada_monto', ahora());
    fallar(409, 'monto_no_coincide', 'El monto informado no corresponde al pago.');
  }

  enTransaccion(db, () => {
    db.prepare('UPDATE pagos SET estado = ?, referencia_externa = ?, actualizado_en = ? WHERE id = ?')
      .run(estado, req.body?.referenciaExterna ?? null, ahora(), pagoId);
    db.prepare('INSERT INTO notificaciones (idempotency_key, pago_id, resultado, recibida_en) VALUES (?,?,?,?)')
      .run(clave, pagoId, estado, ahora());
  });

  if (estado !== 'aprobado') {
    return res.json({ estado: 'procesada', resultado: estado });
  }

  // RF2: recien aqui orders puede pasar el pedido a "pagado".
  const confirmacion = await llamarServicio(ORDERS + `/internal/orders/${pago.pedido_id}/pagado`, {
    metodo: 'POST',
    cuerpo: { montoConfirmado: pago.monto },
    identidad: { rol: 'servicio', correlacion: req.identidad.correlacion },
    destino: 'orders',
  });
  if (!confirmacion.ok) {
    console.error(JSON.stringify({
      servicio: NOMBRE, evento: 'confirmacion_pedido_fallida', pagoId,
      estado: confirmacion.estado,
    }));
  }

  // RF8: emitir la boleta y enviarla al correo del cliente.
  await emitirBoleta(pago, req.identidad);

  res.json({ estado: 'procesada', resultado: 'aprobado' });
}));

// ---------------------------------------------------------------------------
// S30 Emision de boleta (RF8). La ejecuta el cajero virtual tras el pago.
// ---------------------------------------------------------------------------
async function emitirBoleta(pago, identidad) {
  const existente = db.prepare('SELECT 1 FROM boletas WHERE pedido_id = ?').get(pago.pedido_id);
  if (existente) return; // idempotente: una boleta por pedido

  // Compra sin cuenta: el destinatario es el correo de contacto del pedido.
  // Compra con cuenta: se lo pregunta a clients, que es su custodio.
  let destinatario = pago.correo_contacto;
  if (!destinatario) {
    const cliente = await llamarServicio(CLIENTS + '/internal/clients/' + pago.cliente_id, {
      identidad: { rol: 'servicio', correlacion: identidad.correlacion }, destino: 'clients',
    });
    if (cliente.ok) destinatario = cliente.datos.correo;
  }
  if (!destinatario) {
    console.error(JSON.stringify({ servicio: NOMBRE, evento: 'boleta_sin_destinatario', pagoId: pago.id }));
    return;
  }

  db.prepare(`
    INSERT INTO boletas (id, pedido_id, pago_id, monto, enviada_a, emitida_por, emitida_en)
    VALUES (?,?,?,?,?,?,?)
  `).run('bol_' + randomUUID().slice(0, 8), pago.pedido_id, pago.id, pago.monto,
         destinatario, 'cajero_virtual', ahora());

  // Envio por el proveedor de correo, con la credencial "correo-api".
  // El adaptador de prueba conserva el contrato sin enviar correo real.
  console.log(JSON.stringify({
    servicio: NOMBRE, evento: 'boleta_emitida', pedidoId: pago.pedido_id,
    // El correo del cliente NO se escribe en el log: es dato restringido.
    destinatario: '[omitido]',
  }));
}

app.get('/invoices/:pedidoId', ruta((req, res) => {
  const fila = db.prepare('SELECT * FROM boletas WHERE pedido_id = ?').get(req.params.pedidoId);
  if (!fila) fallar(404, 'no_encontrado', 'No hay boleta emitida para ese pedido.');

  const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(fila.pago_id);
  const esPropietario = pago?.cliente_id === req.identidad.usuarioId;
  if (!esPropietario && !['administrador', 'cajero'].includes(req.identidad.rol)) {
    fallar(404, 'no_encontrado', 'No hay boleta emitida para ese pedido.');
  }
  res.json({
    boletaId: fila.id, pedidoId: fila.pedido_id, monto: fila.monto,
    emitidaEn: fila.emitida_en, emitidaPor: fila.emitida_por,
  });
}));

montarManejadorDeErrores(app, NOMBRE);
escucharPrivado(app, PUERTO, NOMBRE);
