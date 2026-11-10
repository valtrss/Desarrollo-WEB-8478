// Compra sin cuenta y promocion de primera compra.
//
// El caso de referencia pide que la venta se realice sobre pedidos de clientes
// registrados. Aqui se implementa ademas la compra de invitado, que el negocio
// pidio expresamente: el invitado entrega solo un correo de contacto y la
// cuenta deja de ser obligatoria para pagar.
//
// Lo que se conserva: el correo es dato de CONTACTO, no identidad. El
// identificador de la sesion de invitado es aleatorio, asi que escribir el
// correo de otra persona no da acceso a ningun historial.
//
// Requiere el sistema levantado: npm start

import test, { before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pedir, iniciarSesion, notificarPago, sistemaArriba, reponerStockDePrueba } from './ayuda.js';

before(async () => {
  assert.ok(await sistemaArriba(), 'El sistema no responde. Ejecute: npm start');
  // Repone la produccion del dia: asi la bateria se puede correr las veces
  // que haga falta sin quedarse sin stock.
  await reponerStockDePrueba();
});

// Calcula el digito verificador para poder registrar cuentas de prueba.
function conDigito(cuerpo) {
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  return cuerpo + '-' + (resto === 11 ? '0' : resto === 10 ? 'K' : String(resto));
}

async function abrirSesionInvitado(correo) {
  const r = await pedir('/api/v1/auth/invitado', { metodo: 'POST', cuerpo: { correo } });
  assert.equal(r.estado, 201);
  return r.datos.accessToken;
}

describe('Compra como invitado', () => {

  test('el correo de contacto se valida', async () => {
    const r = await pedir('/api/v1/auth/invitado', {
      metodo: 'POST', cuerpo: { correo: 'esto-no-es-un-correo' },
    });
    assert.equal(r.estado, 400);
    assert.equal(r.datos.error, 'correo_invalido');
  });

  test('un invitado compra sin cuenta y recibe su boleta', async () => {
    const token = await abrirSesionInvitado('invitada@ejemplo.cl');

    const carrito = await pedir('/api/v1/cart/items', {
      metodo: 'POST', token, cuerpo: { productoId: 'prd_linguine', cantidad: 2 },
    });
    assert.equal(carrito.estado, 200);

    const pedido = await pedir('/api/v1/orders', {
      metodo: 'POST', token,
      cuerpo: { direccionEntrega: 'Camino Rinconada 2200', comuna: 'Maipu' },
    });
    assert.equal(pedido.estado, 201);
    // Un invitado no recibe la promocion de primera compra.
    assert.equal(pedido.datos.descuento, 0);

    const pago = await pedir('/api/v1/payments', {
      metodo: 'POST', token, cuerpo: { pedidoId: pedido.datos.pedidoId, medio: 'servipag' },
    });
    assert.equal(pago.estado, 201);

    const aviso = await notificarPago({
      pagoId: pago.datos.pagoId, pedidoId: pedido.datos.pedidoId,
      estado: 'aprobado', montoConfirmado: pedido.datos.total,
      claveIdempotencia: randomUUID(),
    });
    assert.equal(aviso.estado, 200);

    const boleta = await pedir(`/api/v1/invoices/${pedido.datos.pedidoId}`, { token });
    assert.equal(boleta.estado, 200);
    assert.equal(boleta.datos.monto, pedido.datos.total);
  });

  test('dos invitados con el mismo correo no comparten historial', async () => {
    const primero = await abrirSesionInvitado('misma.casilla@ejemplo.cl');
    await pedir('/api/v1/cart/items', {
      metodo: 'POST', token: primero, cuerpo: { productoId: 'prd_pesto', cantidad: 1 },
    });
    const pedido = await pedir('/api/v1/orders', {
      metodo: 'POST', token: primero,
      cuerpo: { direccionEntrega: 'Los Pajaritos 100', comuna: 'Maipu' },
    });
    assert.equal(pedido.estado, 201);

    // Otra persona escribe el mismo correo en otra sesion.
    const segundo = await abrirSesionInvitado('misma.casilla@ejemplo.cl');
    const suyos = await pedir('/api/v1/orders', { token: segundo });
    assert.equal(suyos.estado, 200);
    assert.equal(suyos.datos.data.length, 0,
      'escribir el correo de otro no puede dar acceso a sus pedidos');

    const ajeno = await pedir(`/api/v1/orders/${pedido.datos.pedidoId}`, { token: segundo });
    assert.equal(ajeno.estado, 404);
  });

  test('un invitado no puede entrar al panel de administracion', async () => {
    const token = await abrirSesionInvitado('curiosa@ejemplo.cl');
    const r = await pedir('/api/v1/clients', { token });
    assert.equal(r.estado, 403);
  });
});

describe('Promocion de primera compra', () => {
  const sufijo = String(Date.now()).slice(-7);
  const correo = `nueva.${sufijo}@ejemplo.cl`;
  const clave = 'primeraCompra2026!';
  let token;

  test('se crea y verifica una cuenta nueva', async () => {
    const creado = await pedir('/api/v1/clients', {
      metodo: 'POST',
      cuerpo: {
        run: conDigito(sufijo + '1'), nombreCompleto: 'Clienta Nueva Prueba',
        correo, password: clave, telefono: '+56911112222',
        direccion: 'Pasaje Prueba 10', comuna: 'Maipu', provincia: 'Santiago',
        region: 'Metropolitana', fechaNacimiento: '1994-03-21',
      },
    });
    assert.equal(creado.estado, 201);

    const verificado = await pedir('/api/v1/clients/verify-email', {
      metodo: 'POST', cuerpo: { token: creado.datos.tokenVerificacionPrueba },
    });
    assert.equal(verificado.estado, 200);

    token = await iniciarSesion(correo, clave);
  });

  test('la primera compra lleva 5% de descuento', async () => {
    const carrito = await pedir('/api/v1/cart/items', {
      metodo: 'POST', token, cuerpo: { productoId: 'prd_pappardelle', cantidad: 2 },
    });
    const subtotal = carrito.datos.subtotal;

    const pedido = await pedir('/api/v1/orders', {
      metodo: 'POST', token,
      cuerpo: { direccionEntrega: 'Pasaje Prueba 10', comuna: 'Maipu' },
    });
    assert.equal(pedido.estado, 201);
    assert.equal(pedido.datos.descuento, Math.round(subtotal * 0.05));
    assert.equal(pedido.datos.total, subtotal - pedido.datos.descuento);
  });

  test('la segunda compra ya no lleva descuento', async () => {
    await pedir('/api/v1/cart/items', {
      metodo: 'POST', token, cuerpo: { productoId: 'prd_tagliatelle', cantidad: 1 },
    });
    const pedido = await pedir('/api/v1/orders', {
      metodo: 'POST', token,
      cuerpo: { direccionEntrega: 'Pasaje Prueba 10', comuna: 'Maipu' },
    });
    assert.equal(pedido.estado, 201);
    assert.equal(pedido.datos.descuento, 0, 'la promocion es solo para la primera compra');
  });

  test('el descuento no se puede reclamar desde el navegador', async () => {
    await pedir('/api/v1/cart/items', {
      metodo: 'POST', token, cuerpo: { productoId: 'prd_noquis', cantidad: 1 },
    });
    const pedido = await pedir('/api/v1/orders', {
      metodo: 'POST', token,
      cuerpo: {
        direccionEntrega: 'Pasaje Prueba 10', comuna: 'Maipu',
        descuento: 999999, total: 1, // el navegador intenta fijar el total
      },
    });
    assert.equal(pedido.estado, 201);
    assert.equal(pedido.datos.descuento, 0);
    assert.notEqual(pedido.datos.total, 1);
  });
});
