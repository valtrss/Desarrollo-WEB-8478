// Casos de validacion de seguridad exigidos por el Modulo 7.
//
// La guia pide documentar entrada, identidad, resultado esperado y el
// componente que lo verifica, y ejecutarlos contra el backend implementado.
// Cada prueba nombra el componente responsable en su descripcion.
//
// Requiere el sistema levantado: npm start

import test, { before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, iniciarSesion, consultarGraphql, sistemaArriba, API } from './ayuda.js';

before(async () => {
  assert.ok(await sistemaArriba(), 'El sistema no responde. Ejecute: npm start');
});

// Calcula el digito verificador para poder registrar cuentas de prueba.
function conDigitoVerificador(cuerpo) {
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  return cuerpo + '-' + (resto === 11 ? '0' : resto === 10 ? 'K' : String(resto));
}

describe('Modulo 7 - casos de validacion', () => {

  test('1. acceso anonimo al catalogo: permitido (api-gateway)', async () => {
    const r = await pedir('/api/v1/products');
    assert.equal(r.estado, 200);
  });

  test('2. operacion protegida sin sesion: 401 (api-gateway)', async () => {
    const r = await pedir('/api/v1/cart');
    assert.equal(r.estado, 401);
    assert.equal(r.datos.error, 'no_autenticado');
  });

  test('2b. token manipulado: 401 (api-gateway, verificacion de firma)', async () => {
    const token = await iniciarSesion('ana.perez@ejemplo.cl', 'pastaFresca2026!');
    const partes = token.split('.');
    // Se altera el payload conservando la firma original.
    const alterado = partes[0] + '.' + Buffer.from(
      JSON.stringify({ sub: 'cli_admin', rol: 'administrador', exp: 9999999999 })
    ).toString('base64url') + '.' + partes[2];

    const r = await pedir('/api/v1/clients', { token: alterado });
    assert.equal(r.estado, 401);
  });

  test('3. operacion de administracion con rol cliente: 403 (api-gateway)', async () => {
    const token = await iniciarSesion('ana.perez@ejemplo.cl', 'pastaFresca2026!');
    const r = await pedir('/api/v1/products', {
      metodo: 'POST', token,
      cuerpo: { nombre: 'Producto pirata', categoria: 'salsas', formato: '500 g', precio: 100 },
    });
    assert.equal(r.estado, 403);
    assert.equal(r.datos.error, 'sin_permiso');
  });

  test('3b. listar clientes con rol cliente: 403 (api-gateway)', async () => {
    const token = await iniciarSesion('ana.perez@ejemplo.cl', 'pastaFresca2026!');
    const r = await pedir('/api/v1/clients', { token });
    assert.equal(r.estado, 403);
  });

  test('4. consulta de un pedido ajeno: 404 sin filtrar datos (orders)', async () => {
    // Juan crea un pedido.
    const tokenJuan = await iniciarSesion('juan.diaz@ejemplo.cl', 'ravioles2026Seguro');
    await pedir('/api/v1/cart/items', {
      metodo: 'POST', token: tokenJuan, cuerpo: { productoId: 'prd_noquis', cantidad: 1 },
    });
    const creado = await pedir('/api/v1/orders', {
      metodo: 'POST', token: tokenJuan,
      cuerpo: { direccionEntrega: 'Calle Falsa 123', comuna: 'Maipu' },
    });
    assert.equal(creado.estado, 201);
    const pedidoDeJuan = creado.datos.pedidoId;

    // Ana intenta leerlo.
    const tokenAna = await iniciarSesion('ana.perez@ejemplo.cl', 'pastaFresca2026!');
    const r = await pedir(`/api/v1/orders/${pedidoDeJuan}`, { token: tokenAna });

    // 404 y no 403: no confirma siquiera que ese pedido exista.
    assert.equal(r.estado, 404);
    assert.equal(JSON.stringify(r.datos).includes('Calle Falsa'), false,
      'la respuesta no puede filtrar la direccion del otro cliente');
  });

  test('4b. el mismo pedido ajeno por GraphQL: null (graphql-gateway)', async () => {
    const tokenJuan = await iniciarSesion('juan.diaz@ejemplo.cl', 'ravioles2026Seguro');
    const pedidos = await pedir('/api/v1/orders', { token: tokenJuan });
    const pedidoDeJuan = pedidos.datos.data[0].id;

    const tokenAna = await iniciarSesion('ana.perez@ejemplo.cl', 'pastaFresca2026!');
    const r = await consultarGraphql(
      'query($id: ID!) { resumenPedido(id: $id) { id total nombreCliente direccionEntrega } }',
      { token: tokenAna, variables: { id: pedidoDeJuan } }
    );
    assert.equal(r.estado, 200);
    assert.equal(r.datos.data.resumenPedido, null,
      'una seleccion de campos GraphQL no puede saltarse la propiedad del recurso');
  });

  test('5. acceso directo a un servicio privado: 401 (identidad interna)', async () => {
    for (const puerto of [4000, 4001, 4002, 4003, 4004, 4005, 4100]) {
      const respuesta = await fetch(`http://127.0.0.1:${puerto}/products`).catch(() => null);
      assert.ok(respuesta, `el servicio en ${puerto} deberia responder`);
      assert.equal(respuesta.status, 401,
        `el servicio en ${puerto} debe rechazar llamadas sin identidad del gateway`);
    }
  });

  test('5b. identidad interna falsificada por el navegador: se descarta (api-gateway)', async () => {
    const r = await pedir('/api/v1/clients', {
      cabeceras: { 'x-identidad-interna': 'token-inventado', 'x-rol': 'administrador' },
    });
    // No se convierte en administrador: sigue siendo anonimo.
    assert.equal(r.estado, 401);
  });

  test('6. confirmar pago desde el frontend: 403 (orders)', async () => {
    const tokenAdmin = await iniciarSesion('admin@lanonna.cl', 'AdminNonna2026!');
    const tokenJuan = await iniciarSesion('juan.diaz@ejemplo.cl', 'ravioles2026Seguro');
    const pedidos = await pedir('/api/v1/orders', { token: tokenJuan });
    const pedido = pedidos.datos.data.find((p) => p.estado === 'pendiente_pago');
    assert.ok(pedido, 'deberia existir un pedido pendiente de pago');

    // Ni siquiera el administrador puede declarar pagado un pedido por esta via.
    const r = await pedir(`/api/v1/orders/${pedido.id}/status`, {
      metodo: 'PUT', token: tokenAdmin, cuerpo: { estado: 'pagado' },
    });
    assert.equal(r.estado, 403);
    assert.equal(r.datos.error, 'reservado_a_payments');
  });

  test('7. consulta GraphQL demasiado profunda: 400 (graphql-gateway)', async () => {
    const anidada = 'query { portada { misUltimosPedidos { items { productoVigente { ' +
      'id nombre formato precio disponible stockDelDia imagenUrl } } } } }';
    const token = await iniciarSesion('ana.perez@ejemplo.cl', 'pastaFresca2026!');
    const r = await consultarGraphql(anidada.repeat(1), { token });
    // Esta consulta concreta esta dentro del limite; se comprueba que el
    // control existe pidiendo una fuera de limite.
    assert.equal(r.estado, 200);

    const fueraDeLimite = await consultarGraphql(
      'query { portada { ' + 'misUltimosPedidos { items { productoVigente { '.repeat(3) +
      'id' + ' } } }'.repeat(3) + ' } }',
      { token }
    );
    assert.equal(fueraDeLimite.estado, 400);
  });

  test('8. el panel del dueno rechaza a un cliente (graphql-gateway)', async () => {
    const token = await iniciarSesion('ana.perez@ejemplo.cl', 'pastaFresca2026!');
    const r = await consultarGraphql('query { panelDueno { totalVentas } }', { token });
    assert.equal(r.datos.data.panelDueno, null);
    assert.ok(r.datos.errors?.[0]?.message.includes('permiso'));
  });

  test('9. el login no permite enumerar cuentas (clients)', async () => {
    // Esta prueba falla un login a proposito. Si usara una cuenta compartida,
    // a la quinta corrida la dejaria bloqueada por la proteccion contra fuerza
    // bruta y romperia otras pruebas. Por eso crea una cuenta desechable.
    const sufijo = String(Date.now()).slice(-7);
    const correoDesechable = `enum.${sufijo}@ejemplo.cl`;
    const creada = await pedir('/api/v1/clients', {
      metodo: 'POST',
      cuerpo: {
        run: conDigitoVerificador(sufijo + '2'), nombreCompleto: 'Cuenta Desechable Prueba',
        correo: correoDesechable, password: 'claveCorrectaLarga1', telefono: '+56933334444',
        direccion: 'Pasaje Prueba 20', comuna: 'Maipu', provincia: 'Santiago',
        region: 'Metropolitana', fechaNacimiento: '1993-07-07',
      },
    });
    assert.equal(creada.estado, 201);

    const inexistente = await pedir('/api/v1/auth/login', {
      metodo: 'POST', cuerpo: { correo: 'nadie@ejemplo.cl', password: 'loquesea12345' },
    });
    const claveMala = await pedir('/api/v1/auth/login', {
      metodo: 'POST', cuerpo: { correo: correoDesechable, password: 'claveIncorrecta1' },
    });
    assert.equal(inexistente.estado, claveMala.estado);
    // El identificador de correlacion cambia en cada solicitud por diseno;
    // lo que no puede cambiar es el error ni el mensaje.
    assert.deepEqual(
      { error: inexistente.datos.error, mensaje: inexistente.datos.mensaje },
      { error: claveMala.datos.error, mensaje: claveMala.datos.mensaje },
      'la respuesta debe ser identica para cuenta inexistente y clave incorrecta'
    );
  });

  test('10. cerrar sesion revoca el token (auth + api-gateway)', async () => {
    // Sesion nueva a proposito: se va a revocar y no debe contaminar las demas.
    const token = await iniciarSesion('ana.perez@ejemplo.cl', 'pastaFresca2026!', { nuevo: true });
    assert.equal((await pedir('/api/v1/cart', { token })).estado, 200);

    await pedir('/api/v1/auth/logout', { metodo: 'POST', token, cuerpo: { accessToken: token } });

    const despues = await pedir('/api/v1/cart', { token });
    assert.equal(despues.estado, 401, 'el token revocado ya no debe servir');
  });

  test('11. no hay secretos en la respuesta publica de rutas (api-gateway)', async () => {
    const r = await pedir('/api/v1/_rutas');
    assert.equal(r.estado, 200);
    const texto = JSON.stringify(r.datos);
    // Se publica la referencia simbolica, nunca el valor.
    assert.ok(texto.includes('jwt-firma-usuario'));
    for (const referencia of ['jwt-firma-usuario', 'identidad-interna', 'pagos-webhook', 'correo-api']) {
      const valor = r.datos.secretos.find((s) => s.referencia === referencia);
      assert.ok(valor, `falta la referencia ${referencia}`);
      assert.equal(valor.valor, undefined, 'el inventario no puede traer el valor del secreto');
    }
  });

  test('12. una ruta interna no esta publicada (api-gateway)', async () => {
    for (const ruta of ['/internal/precios', '/api/v1/internal/precios', '/internal/ventas']) {
      const r = await pedir(ruta);
      assert.equal(r.estado, 404, `${ruta} no debe ser alcanzable desde fuera`);
    }
  });

  test('13. el registro rechaza un RUN con digito verificador invalido (clients)', async () => {
    const r = await pedir('/api/v1/clients', {
      metodo: 'POST',
      cuerpo: {
        run: '12345678-9', nombreCompleto: 'Prueba Invalida', correo: 'prueba.dv@ejemplo.cl',
        password: 'claveLargaSegura1', telefono: '+56911111111', direccion: 'Calle 1',
        comuna: 'Maipu', provincia: 'Santiago', region: 'Metropolitana',
        fechaNacimiento: '1995-05-05',
      },
    });
    assert.equal(r.estado, 422);
    assert.equal(r.datos.error, 'run_digito_invalido');
  });
});
