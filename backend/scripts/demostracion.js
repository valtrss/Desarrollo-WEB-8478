// Guion ejecutable para la demostracion en video.
//
// Dispara, en orden y con pausas, las llamadas que hacen aparecer la evidencia
// de los cinco contenedores. Va narrando en pantalla que hay que mirar en cada
// paso, para poder grabar sin ir recordando los comandos.
//
//   node scripts/demostracion.js            recorrido completo
//   node scripts/demostracion.js --rapido   sin pausas
//
// Los pasos 1 a 3 son el camino feliz. Los pasos 4 a 6 son los RECHAZOS, que
// es donde se ve que cada capa comprueba de verdad y no deja pasar.

import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'http://localhost:8080';
const INVENTORY_DIRECTO = 'http://127.0.0.1:4002';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAPIDO = process.argv.includes('--rapido');

const C = {
  reset: '\x1b[0m', negrita: '\x1b[1m', gris: '\x1b[90m',
  verde: '\x1b[32m', rojo: '\x1b[31m', amarillo: '\x1b[33m', cian: '\x1b[36m',
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const pausa = () => (RAPIDO ? Promise.resolve() : esperar(2600));

function paso(numero, titulo, queMirar) {
  console.log('');
  console.log(C.negrita + C.cian + `━━━ PASO ${numero} · ${titulo} ` + '━'.repeat(Math.max(0, 52 - titulo.length)) + C.reset);
  for (const l of queMirar) console.log(C.gris + '    mirar → ' + C.reset + l);
  console.log('');
}

const ok = (t) => console.log(C.verde + '    ✓ ' + C.reset + t);
const no = (t) => console.log(C.rojo + '    ✗ ' + C.reset + t);
const nota = (t) => console.log(C.amarillo + '    · ' + C.reset + t);

async function pedir(ruta, { metodo = 'GET', cuerpo, token, cabeceras = {} } = {}) {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...cabeceras,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { estado: r.status, datos };
}

const salud = await fetch(API + '/health').then((r) => r.ok).catch(() => false);
if (!salud) {
  console.error('\nEl sistema no responde en ' + API);
  console.error('Levante los contenedores primero (npm start, o una ventana por servicio).\n');
  process.exit(1);
}

console.log('');
console.log(C.negrita + '  DEMOSTRACION — Pastas Frescas «La Nonna» · Caso 33' + C.reset);
console.log(C.gris + '  Cada paso deja rastro en la bitacora de uno o mas contenedores.' + C.reset);
console.log(C.gris + '  El codigo de correlacion (8 caracteres) es el mismo en todos.' + C.reset);

// ---------------------------------------------------------------------------
paso(1, 'Autenticacion', [
  'api-gateway: RUTA S11 · ENRUTA hacia auth',
  'auth:        CREDENCIAL · LLAMA a clients · TOKEN emitido',
  'clients:     IDENTIDAD aceptada · SQL sobre clientes · CREDENCIAL verificada',
]);
const acceso = await pedir('/api/v1/auth/login', {
  metodo: 'POST',
  cuerpo: { correo: 'ana.perez@ejemplo.cl', password: 'pastaFresca2026!' },
});
if (acceso.estado !== 200) {
  no(`login fallido (${acceso.estado}): ${JSON.stringify(acceso.datos)}`);
  process.exit(1);
}
const token = acceso.datos.accessToken;
ok(`sesion iniciada · rol=${acceso.datos.perfil.rol} · vence en ${acceso.datos.expiraEn}s`);
await pausa();

// ---------------------------------------------------------------------------
paso(2, 'Agregar al carrito', [
  'api-gateway: SECRETO «jwt-firma-usuario» · AUTENTICA · AUTORIZA · ENRUTA',
  'orders:      IDENTIDAD aceptada · SQL sobre carritos y carrito_items',
  'inventory:   IDENTIDAD aceptada · SQL sobre productos (el precio sale de aqui)',
]);
const carrito = await pedir('/api/v1/cart/items', {
  metodo: 'POST', token,
  cuerpo: { productoId: 'prd_ravioles', cantidad: 2, precioUnitario: 1 },
});
if (carrito.estado === 200) {
  const linea = carrito.datos.items.find((i) => i.productoId === 'prd_ravioles');
  ok(`carrito actualizado · total ${carrito.datos.total}`);
  nota(`el navegador mando precioUnitario=1 y el servidor uso ${linea.precioUnitario}`);
} else {
  no(`${carrito.estado}: ${JSON.stringify(carrito.datos)}`);
}
await pausa();

// ---------------------------------------------------------------------------
paso(3, 'Confirmar el pedido', [
  'api-gateway: RUTA S21 · consulta revocacion a auth-service · ENRUTA',
  'orders:      IDENTIDAD · SQL INSERT en pedidos y pedido_items · NEGOCIO',
  'inventory:   GRPC ReservarStock · SQL sobre reservas y productos',
]);
const pedido = await pedir('/api/v1/orders', {
  metodo: 'POST', token,
  cuerpo: { direccionEntrega: 'Av. Pajaritos 1234', comuna: 'Maipu' },
});
if (pedido.estado === 201) {
  ok(`pedido ${pedido.datos.pedidoId} · estado ${pedido.datos.estado} · total ${pedido.datos.total}`);
  nota('el stock quedo reservado; el pedido NO esta pagado todavia');
} else {
  no(`${pedido.estado}: ${JSON.stringify(pedido.datos)}`);
}
await pausa();

// ---------------------------------------------------------------------------
paso(4, 'RECHAZO · llamada directa al backend, sin pasar por el gateway', [
  'inventory:   RECHAZO «llamada SIN identidad interna»',
  'api-gateway: no aparece nada, porque la llamada nunca paso por el',
]);
const directo = await fetch(INVENTORY_DIRECTO + '/products').catch(() => null);
if (directo && directo.status === 401) {
  ok(`inventory respondio ${directo.status}: llegar al puerto no basta`);
  nota('falta la identidad firmada con «identidad-interna», que solo emite el gateway');
} else {
  no(`se esperaba 401, llego ${directo ? directo.status : 'sin respuesta'}`);
}
await pausa();

// ---------------------------------------------------------------------------
paso(5, 'RECHAZO · token manipulado', [
  'api-gateway: RECHAZO «token invalido, alterado o expirado»',
  'ningun backend recibe la llamada',
]);
const partes = token.split('.');
const alterado = partes[0] + '.' +
  Buffer.from(JSON.stringify({ sub: 'cli_admin', rol: 'administrador', exp: 9999999999 })).toString('base64url') +
  '.' + partes[2];
const suplantacion = await pedir('/api/v1/clients', { token: alterado });
if (suplantacion.estado === 401) {
  ok('el gateway rechazo el token con el payload cambiado a rol=administrador');
  nota('la firma no cuadra: cambiar el contenido invalida el token');
} else {
  no(`se esperaba 401, llego ${suplantacion.estado}`);
}
await pausa();

// ---------------------------------------------------------------------------
paso(6, 'RECHAZO · aviso de pago con firma falsa', [
  'payments:    RECHAZO «firma HMAC del proveedor INVALIDA»',
  'orders:      no cambia el estado del pedido',
]);
const cuerpoAviso = {
  pagoId: 'pag_inventado', pedidoId: pedido.datos?.pedidoId ?? 'ped_x',
  estado: 'aprobado', montoConfirmado: 1,
};
const falso = await pedir('/api/v1/payments/webhook', {
  metodo: 'POST', cuerpo: cuerpoAviso,
  cabeceras: { 'x-signature': 'f'.repeat(64), 'x-idempotency-key': randomUUID() },
});
if (falso.estado === 401) {
  ok('payments descarto el aviso antes de leer el cuerpo');
  nota('el frontend nunca puede declarar un pedido como pagado');
} else {
  no(`se esperaba 401, llego ${falso.estado}`);
}
await pausa();

// ---------------------------------------------------------------------------
paso(7, 'Pago legitimo del proveedor y persistencia final', [
  'payments:    FIRMA verificada · SQL sobre pagos y boletas · NEGOCIO',
  'orders:      SQL UPDATE pedidos a «pagado» · SQL sobre transiciones',
  'inventory:   SQL que descuenta el stock del dia',
]);
if (pedido.estado === 201) {
  const pago = await pedir('/api/v1/payments', {
    metodo: 'POST', token, cuerpo: { pedidoId: pedido.datos.pedidoId, medio: 'servipag' },
  });
  if (pago.estado === 201) {
    ok(`pago iniciado ${pago.datos.pagoId} · monto ${pago.datos.monto} (lo fijo orders, no el navegador)`);

    // Adaptador del proveedor: firma el aviso igual que lo haria el banco.
    const cuerpo = {
      pagoId: pago.datos.pagoId, pedidoId: pedido.datos.pedidoId,
      estado: 'aprobado', montoConfirmado: pago.datos.monto,
      referenciaExterna: 'TRX-' + randomUUID().slice(0, 8),
    };
    const secreto = readFileSync(join(RAIZ, 'secrets', 'pagos-webhook'), 'utf8').trim();
    const firma = createHmac('sha256', secreto).update(JSON.stringify(cuerpo)).digest('hex');
    const clave = randomUUID();

    const aviso = await pedir('/api/v1/payments/webhook', {
      metodo: 'POST', cuerpo,
      cabeceras: { 'x-signature': firma, 'x-idempotency-key': clave },
    });
    ok(`aviso del proveedor procesado: ${JSON.stringify(aviso.datos)}`);

    const repetido = await pedir('/api/v1/payments/webhook', {
      metodo: 'POST', cuerpo,
      cabeceras: { 'x-signature': firma, 'x-idempotency-key': clave },
    });
    nota(`mismo aviso reenviado → ${JSON.stringify(repetido.datos)} (idempotencia)`);

    const final = await pedir(`/api/v1/orders/${pedido.datos.pedidoId}`, { token });
    ok(`estado final del pedido: ${final.datos.estado}`);
  }
}

console.log('');
console.log(C.negrita + '  Fin del recorrido.' + C.reset);
console.log(C.gris + '  Para el punto 1 (frontend), abra http://localhost:8081 con la pestana' + C.reset);
console.log(C.gris + '  Red del inspector abierta y repita el flujo desde la interfaz.' + C.reset);
console.log('');
