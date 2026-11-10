// Reporte de ventas (RF9) y la definicion de "dia del negocio".
//
// Esta bateria existe por un error que se detecto al generar las evidencias:
// el modelo de lectura agrupaba por dia UTC. Para un local en Chile eso parte
// la jornada en dos a partir de las 21:00, porque ahi ya es "manana" en UTC.
// El dia del negocio es el dia LOCAL.
//
// Requiere el sistema levantado: npm start

import test, { before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pedir, iniciarSesion, notificarPago, sistemaArriba, reponerStockDePrueba } from './ayuda.js';

const hoyLocal = () => new Date().toLocaleDateString('en-CA');

before(async () => {
  assert.ok(await sistemaArriba(), 'El sistema no responde. Ejecute: npm start');
  // Repone la produccion del dia: asi la bateria se puede correr las veces
  // que haga falta sin quedarse sin stock.
  await reponerStockDePrueba();
});

describe('RF9 - Reporte de ventas', () => {
  let tokenDueno;
  let montoDeLaVenta;

  test('una venta pagada ahora entra en el reporte del dia local', async () => {
    // 1. Un invitado compra y paga.
    const sesion = await pedir('/api/v1/auth/invitado', {
      metodo: 'POST', cuerpo: { correo: `reporte.${Date.now()}@ejemplo.cl` },
    });
    const token = sesion.datos.accessToken;

    await pedir('/api/v1/cart/items', {
      metodo: 'POST', token, cuerpo: { productoId: 'prd_tortellini', cantidad: 1 },
    });
    const pedido = await pedir('/api/v1/orders', {
      metodo: 'POST', token,
      cuerpo: { direccionEntrega: 'Av. Pajaritos 999', comuna: 'Maipu' },
    });
    assert.equal(pedido.estado, 201);
    montoDeLaVenta = pedido.datos.total;

    const pago = await pedir('/api/v1/payments', {
      metodo: 'POST', token, cuerpo: { pedidoId: pedido.datos.pedidoId, medio: 'servipag' },
    });
    const aviso = await notificarPago({
      pagoId: pago.datos.pagoId, pedidoId: pedido.datos.pedidoId,
      estado: 'aprobado', montoConfirmado: pedido.datos.total,
      claveIdempotencia: randomUUID(),
    });
    assert.equal(aviso.estado, 200);

    // 2. El dueno consulta el reporte del dia de hoy, en hora local.
    tokenDueno = await iniciarSesion('dueno@lanonna.cl', 'DuenoNonna2026!');
    const hoy = hoyLocal();
    const reporte = await pedir(`/api/v1/reports/sales?from=${hoy}&to=${hoy}`, { token: tokenDueno });

    assert.equal(reporte.estado, 200);
    assert.equal(reporte.datos.desde, hoy);
    assert.ok(reporte.datos.totalVentas >= montoDeLaVenta,
      `la venta de ${montoDeLaVenta} deberia estar incluida en el total del dia`);
    assert.ok(reporte.datos.series.some((s) => s.periodo === hoy),
      'la jornada de hoy debe aparecer como una sola fila, no partida por el cambio de dia UTC');
  });

  test('el reporte no entrega datos personales de clientes', async () => {
    const hoy = hoyLocal();
    const reporte = await pedir(`/api/v1/reports/sales?from=${hoy}&to=${hoy}`, { token: tokenDueno });
    const texto = JSON.stringify(reporte.datos);

    for (const dato of ['correo', '@ejemplo.cl', 'direccion', 'run', 'clienteId']) {
      assert.equal(texto.includes(dato), false,
        `el reporte no puede incluir "${dato}": es informacion de gestion, no de clientes`);
    }
  });

  test('el rango de consulta esta acotado', async () => {
    const invertido = await pedir('/api/v1/reports/sales?from=2026-12-01&to=2026-01-01', { token: tokenDueno });
    assert.equal(invertido.estado, 400);
    assert.equal(invertido.datos.error, 'rango_invalido');

    const excesivo = await pedir('/api/v1/reports/sales?from=2020-01-01&to=2026-12-31', { token: tokenDueno });
    assert.equal(excesivo.estado, 400);
    assert.equal(excesivo.datos.error, 'rango_excedido');
  });

  test('un cliente no puede ver el reporte', async () => {
    const token = await iniciarSesion('ana.perez@ejemplo.cl', 'pastaFresca2026!');
    const hoy = hoyLocal();
    const r = await pedir(`/api/v1/reports/sales?from=${hoy}&to=${hoy}`, { token });
    assert.equal(r.estado, 403);
  });
});
