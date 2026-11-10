// Prueba de integracion del flujo principal del caso (Modulo 10).
//
// Recorre: catalogo -> carrito -> pedido -> pago -> boleta -> agregacion
// GraphQL, pasando siempre por el API Gateway.
//
// Requiere el sistema levantado: npm start

import test, { before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pedir, iniciarSesion, consultarGraphql, notificarPago, sistemaArriba, reponerStockDePrueba } from './ayuda.js';

before(async () => {
  assert.ok(await sistemaArriba(), 'El sistema no responde. Ejecute: npm start');
  // Repone la produccion del dia: asi la bateria se puede correr las veces
  // que haga falta sin quedarse sin stock.
  await reponerStockDePrueba();
});

describe('Flujo de compra completo', () => {
  let token;
  let pedidoId;
  let pagoId;
  let totalEsperado;

  test('RF1 - el catalogo es publico y anonimo', async () => {
    const r = await pedir('/api/v1/products?available=true');
    assert.equal(r.estado, 200);
    assert.ok(r.datos.data.length > 0, 'deberia haber productos disponibles');
    // El catalogo no filtra datos internos.
    assert.equal(r.datos.data[0].costo, undefined);
  });

  test('RF12 - inicio de sesion del cliente', async () => {
    token = await iniciarSesion('ana.perez@ejemplo.cl', 'pastaFresca2026!');
    assert.ok(token.length > 20);
  });

  test('RF1 - agregar al carrito usa el precio del servidor', async () => {
    const r = await pedir('/api/v1/cart/items', {
      metodo: 'POST', token,
      // El navegador manda un precio falso. El servidor debe ignorarlo.
      cuerpo: { productoId: 'prd_ravioles', cantidad: 2, precioUnitario: 1 },
    });
    assert.equal(r.estado, 200);
    const linea = r.datos.items.find((i) => i.productoId === 'prd_ravioles');
    assert.equal(linea.precioUnitario, 4990, 'el precio debe venir de inventory');
    assert.equal(linea.subtotal, 9980);
    totalEsperado = r.datos.total;
  });

  test('RF7 - no se puede agregar un producto agotado', async () => {
    const r = await pedir('/api/v1/cart/items', {
      metodo: 'POST', token, cuerpo: { productoId: 'prd_pomodoro', cantidad: 1 },
    });
    assert.equal(r.estado, 409);
    assert.equal(r.datos.error, 'stock_insuficiente');
  });

  test('despacho - una comuna fuera del radio rechaza el pedido', async () => {
    const r = await pedir('/api/v1/orders', {
      metodo: 'POST', token,
      cuerpo: { direccionEntrega: 'Av. Apoquindo 1234', comuna: 'Las Condes' },
    });
    assert.equal(r.estado, 409);
    assert.equal(r.datos.error, 'fuera_de_radio');
  });

  test('RF1 - confirmar pedido reserva stock y queda pendiente de pago', async () => {
    const r = await pedir('/api/v1/orders', {
      metodo: 'POST', token,
      cuerpo: { direccionEntrega: 'Av. Pajaritos 1234', comuna: 'Maipu' },
    });
    assert.equal(r.estado, 201);
    assert.equal(r.datos.estado, 'pendiente_pago');
    assert.ok(r.datos.expiraReserva, 'la reserva debe tener vencimiento');

    // Si es la primera compra de esta cuenta, el servidor aplica el 5%. La
    // prueba no puede dar por hecho que no hay descuento: con base recien
    // sembrada SI lo hay, y con base ya usada no. Se comprueba la resta.
    assert.equal(r.datos.total, totalEsperado - r.datos.descuento,
      'el total debe ser el subtotal menos el descuento que decidio el servidor');

    // De aqui en adelante el monto oficial es el del pedido, no el del carrito.
    totalEsperado = r.datos.total;
    pedidoId = r.datos.pedidoId;
  });

  test('RF2 - el pedido no entra a preparacion antes del pago', async () => {
    const tokenAdmin = await iniciarSesion('admin@lanonna.cl', 'AdminNonna2026!');
    const r = await pedir(`/api/v1/orders/${pedidoId}/status`, {
      metodo: 'PUT', token: tokenAdmin, cuerpo: { estado: 'en_preparacion' },
    });
    assert.equal(r.estado, 409);
    assert.equal(r.datos.error, 'transicion_invalida');
  });

  test('RF2 - iniciar pago toma el monto de orders, no del navegador', async () => {
    const r = await pedir('/api/v1/payments', {
      metodo: 'POST', token,
      cuerpo: { pedidoId, medio: 'servipag', monto: 1 }, // monto falso
    });
    assert.equal(r.estado, 201);
    assert.equal(r.datos.monto, totalEsperado, 'el monto no puede venir del navegador');
    pagoId = r.datos.pagoId;
  });

  test('seguridad - una notificacion con firma invalida se rechaza', async () => {
    const r = await notificarPago({
      pagoId, pedidoId, estado: 'aprobado', montoConfirmado: totalEsperado, firmaRota: true,
    });
    assert.equal(r.estado, 401);
    assert.equal(r.datos.error, 'firma_invalida');
  });

  test('seguridad - una notificacion con monto alterado se rechaza', async () => {
    const r = await notificarPago({
      pagoId, pedidoId, estado: 'aprobado', montoConfirmado: 100,
    });
    assert.equal(r.estado, 409);
    assert.equal(r.datos.error, 'monto_no_coincide');
  });

  const claveIdempotencia = randomUUID();

  test('RF2 - el pago confirmado pasa el pedido a pagado', async () => {
    const r = await notificarPago({
      pagoId, pedidoId, estado: 'aprobado', montoConfirmado: totalEsperado,
      claveIdempotencia,
    });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.resultado, 'aprobado');

    const pedido = await pedir(`/api/v1/orders/${pedidoId}`, { token });
    assert.equal(pedido.datos.estado, 'pagado');
  });

  test('idempotencia - la misma notificacion repetida no hace nada nuevo', async () => {
    const r = await notificarPago({
      pagoId, pedidoId, estado: 'aprobado', montoConfirmado: totalEsperado,
      claveIdempotencia,
    });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.estado, 'ya_procesada');
  });

  test('RF8 - se emitio la boleta del pedido', async () => {
    const r = await pedir(`/api/v1/invoices/${pedidoId}`, { token });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.monto, totalEsperado);
    assert.equal(r.datos.emitidaPor, 'cajero_virtual');
  });

  test('RF13 - el pedido pagado aparece en la cola de despacho', async () => {
    const tokenDespacho = await iniciarSesion('despacho@lanonna.cl', 'DespachoNonna2026!');
    const r = await pedir('/api/v1/dispatch/orders', { token: tokenDespacho });
    assert.equal(r.estado, 200);
    assert.ok(r.datos.data.some((p) => p.pedidoId === pedidoId));
  });

  test('Modulo 8 - resumenPedido agrega orders, inventory y clients', async () => {
    const r = await consultarGraphql(`
      query($id: ID!) {
        resumenPedido(id: $id) {
          id estado total nombreCliente
          items { nombre cantidad precioUnitario productoVigente { nombre disponible stockDelDia } }
        }
      }
    `, { token, variables: { id: pedidoId } });

    assert.equal(r.estado, 200);
    const resumen = r.datos.data.resumenPedido;
    assert.equal(resumen.id, pedidoId);
    assert.equal(resumen.estado, 'pagado');
    // Dato que solo puede venir de clients:
    assert.ok(resumen.nombreCliente, 'el nombre del cliente viene de clients');
    // Dato que solo puede venir de inventory:
    assert.ok(resumen.items[0].productoVigente, 'la descripcion vigente viene de inventory');
  });

  test('RF3 - anular conserva el pedido y registra el motivo', async () => {
    const tokenAdmin = await iniciarSesion('admin@lanonna.cl', 'AdminNonna2026!');
    const r = await pedir(`/api/v1/orders/${pedidoId}/cancellation`, {
      metodo: 'POST', token: tokenAdmin,
      cuerpo: { motivo: 'El cliente llamo para cancelar el pedido' },
    });
    assert.equal(r.estado, 200);

    const pedido = await pedir(`/api/v1/orders/${pedidoId}`, { token });
    assert.equal(pedido.estado, 200, 'el pedido sigue existiendo despues de anular');
    assert.equal(pedido.datos.estado, 'anulado');
    assert.ok(pedido.datos.anulacion.motivo.length > 0);
  });
});
