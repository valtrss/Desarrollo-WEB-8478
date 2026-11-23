// El guion de la demostracion, como datos.
//
// Vive separado para que lo consuman dos presentaciones distintas sin duplicar
// la logica:
//
//   scripts/demostracion.js  lo imprime en una terminal normal, en texto plano
//   scripts/estudio.js       lo muestra dentro del panel de grabacion
//
// Cada paso declara QUE mirar en cada contenedor y COMO dispararlo. El estado
// (token, pedido, pago) se va acumulando en el objeto que recibe `ejecutar`.

import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API = 'http://localhost:8080';
export const SITIO = 'http://localhost:8081';
const INVENTORY_DIRECTO = 'http://127.0.0.1:4002';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CUENTA_DEMO = { correo: 'ana.perez@ejemplo.cl', password: 'pastaFresca2026!' };

/** Llamada al API Gateway, que es la unica puerta publica. */
export async function pedir(ruta, { metodo = 'GET', cuerpo, token, cabeceras = {} } = {}) {
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
  return { estado: r.status, datos, correlacion: r.headers.get('x-correlation-id') };
}

export async function sistemaResponde() {
  return fetch(API + '/health').then((r) => r.ok).catch(() => false);
}

// Atajos para construir el resultado de un paso. `nota` explica, `ok` confirma
// lo esperado y `no` avisa que algo no salio como dice el guion.
const ok = (texto) => ({ tipo: 'ok', texto });
const no = (texto) => ({ tipo: 'no', texto });
const nota = (texto) => ({ tipo: 'nota', texto });

export const PASOS = [
  // -------------------------------------------------------------------------
  {
    titulo: 'Punto 1 · Contenedor Frontend',
    manual: true,
    mirar: [
      'navegador:   abra ' + SITIO + ' con el inspector en la pestana Red',
      'navegador:   marque «conservar registro» y deje la sesion cerrada',
      'frontend:    abajo se ven las peticiones que sirve el sitio estatico',
    ],
    async ejecutar() {
      return [
        nota('Inicie sesion desde la interfaz con ' + CUENTA_DEMO.correo),
        nota('Senale que TODAS las peticiones van a localhost:8080 y ninguna a 4000-4005'),
        nota('En la respuesta del login, la cabecera x-correlation-id'),
        nota('En cart/items, la carga util NO lleva precio'),
      ];
    },
  },

  // -------------------------------------------------------------------------
  {
    titulo: 'Punto 2 y 3 · El gateway pide el secreto y consulta al auth service',
    mirar: [
      'api-gateway: RUTA S11 · SECRETO «jwt-firma-usuario» · ENRUTA hacia auth',
      'auth:        CREDENCIAL · LLAMA a clients · TOKEN emitido',
      'backend:     clients confirma la credencial (el es el custodio del hash)',
      'persistencia: SELECT sobre clientes en clients.db',
    ],
    async ejecutar(estado) {
      const r = await pedir('/api/v1/auth/login', { metodo: 'POST', cuerpo: CUENTA_DEMO });
      if (r.estado !== 200) return [no(`login fallido (${r.estado}): ${JSON.stringify(r.datos)}`)];
      estado.token = r.datos.accessToken;
      estado.correlacion = r.correlacion;
      return [
        ok(`sesion iniciada · rol=${r.datos.perfil.rol} · vence en ${r.datos.expiraEn}s`),
        nota(`correlacion de esta llamada: ${r.correlacion ?? 'sin cabecera'}`),
        nota('el auth service no guarda contrasenas: le pide a clients que verifique el hash'),
      ];
    },
  },

  // -------------------------------------------------------------------------
  {
    titulo: 'El servidor decide el precio, no el navegador',
    mirar: [
      'api-gateway: AUTENTICA · AUTORIZA · ENRUTA hacia orders',
      'backend:     orders pregunta el precio a inventory',
      'persistencia: SQL sobre carritos y carrito_items en orders.db',
    ],
    async ejecutar(estado) {
      const r = await pedir('/api/v1/cart/items', {
        metodo: 'POST', token: estado.token,
        cuerpo: { productoId: 'prd_ravioles', cantidad: 2, precioUnitario: 1 },
      });
      if (r.estado !== 200) return [no(`${r.estado}: ${JSON.stringify(r.datos)}`)];
      const linea = r.datos.items.find((i) => i.productoId === 'prd_ravioles');
      return [
        ok(`carrito actualizado · total ${r.datos.total}`),
        nota(`el navegador mando precioUnitario=1 y el servidor uso ${linea.precioUnitario}`),
      ];
    },
  },

  // -------------------------------------------------------------------------
  {
    titulo: 'Punto 5 · Contenedor Persistencia: la transaccion del pedido',
    mirar: [
      'api-gateway: RUTA S21 · LLAMA a auth para consultar revocacion · ENRUTA',
      'backend:     orders IDENTIDAD aceptada · gRPC ReservarStock hacia inventory',
      'persistencia: BEGIN · INSERT pedidos · INSERT pedido_items · DELETE carrito · COMMIT',
      'persistencia: fijese que orders escribe en orders.db e inventory en inventory.db',
    ],
    async ejecutar(estado) {
      const r = await pedir('/api/v1/orders', {
        metodo: 'POST', token: estado.token,
        cuerpo: { direccionEntrega: 'Av. Pajaritos 1234', comuna: 'Maipu' },
      });
      if (r.estado !== 201) return [no(`${r.estado}: ${JSON.stringify(r.datos)}`)];
      estado.pedidoId = r.datos.pedidoId;
      return [
        ok(`pedido ${r.datos.pedidoId} · estado ${r.datos.estado} · total ${r.datos.total}`),
        nota('la transaccion vacia el carrito en el mismo COMMIT: no puede quedar a medias'),
        nota('el stock quedo reservado; el pedido NO esta pagado todavia'),
      ];
    },
  },

  // -------------------------------------------------------------------------
  {
    titulo: 'Punto 4 · El backend IMPIDE una llamada directa',
    mirar: [
      'backend:     inventory RECHAZO «llamada SIN identidad interna»',
      'api-gateway: no aparece NADA, porque la llamada nunca paso por el',
    ],
    async ejecutar() {
      const r = await fetch(INVENTORY_DIRECTO + '/products').catch(() => null);
      if (!r || r.status !== 401) {
        return [no(`se esperaba 401, llego ${r ? r.status : 'sin respuesta'}`)];
      }
      return [
        ok(`inventory respondio ${r.status}: llegar al puerto no basta`),
        nota('falta la identidad firmada con «identidad-interna», que solo emite el gateway'),
        nota('el backend no confia en que alguien ya reviso por el'),
      ];
    },
  },

  // -------------------------------------------------------------------------
  {
    titulo: 'RECHAZO · token manipulado para subir de rol',
    mirar: [
      'api-gateway: RECHAZO «token invalido, alterado o expirado»',
      'backend:     ningun backend recibe la llamada',
    ],
    async ejecutar(estado) {
      const partes = estado.token.split('.');
      const alterado = partes[0] + '.' +
        Buffer.from(JSON.stringify({ sub: 'cli_admin', rol: 'administrador', exp: 9999999999 }))
          .toString('base64url') + '.' + partes[2];
      const r = await pedir('/api/v1/clients', { token: alterado });
      if (r.estado !== 401) return [no(`se esperaba 401, llego ${r.estado}`)];
      return [
        ok('el gateway rechazo el token con el payload cambiado a rol=administrador'),
        nota('la firma no cuadra: cambiar el contenido invalida el token'),
      ];
    },
  },

  // -------------------------------------------------------------------------
  {
    titulo: 'RECHAZO · aviso de pago con firma falsa',
    mirar: [
      'backend:     payments RECHAZO «firma HMAC del proveedor INVALIDA»',
      'persistencia: no se escribe nada, el aviso se descarta antes de leer el cuerpo',
    ],
    async ejecutar(estado) {
      const r = await pedir('/api/v1/payments/webhook', {
        metodo: 'POST',
        cuerpo: {
          pagoId: 'pag_inventado', pedidoId: estado.pedidoId ?? 'ped_x',
          estado: 'aprobado', montoConfirmado: 1,
        },
        cabeceras: { 'x-signature': 'f'.repeat(64), 'x-idempotency-key': randomUUID() },
      });
      if (r.estado !== 401) return [no(`se esperaba 401, llego ${r.estado}`)];
      return [
        ok('payments descarto el aviso antes de leer el cuerpo'),
        nota('el frontend nunca puede declarar un pedido como pagado'),
      ];
    },
  },

  // -------------------------------------------------------------------------
  {
    titulo: 'Pago legitimo del proveedor, y el mismo aviso repetido',
    mirar: [
      'backend:     payments FIRMA verificada · NEGOCIO pago aprobado',
      'persistencia: UPDATE pedidos a «pagado» · INSERT boletas · descuento de stock',
      'backend:     el aviso repetido responde «ya_procesada» sin tocar la base',
    ],
    async ejecutar(estado) {
      if (!estado.pedidoId) return [no('no hay pedido: el paso del pedido no alcanzo a crearlo')];

      const pago = await pedir('/api/v1/payments', {
        metodo: 'POST', token: estado.token,
        cuerpo: { pedidoId: estado.pedidoId, medio: 'servipag' },
      });
      if (pago.estado !== 201) return [no(`${pago.estado}: ${JSON.stringify(pago.datos)}`)];

      // Adaptador del proveedor: firma el aviso igual que lo haria el banco.
      const cuerpo = {
        pagoId: pago.datos.pagoId, pedidoId: estado.pedidoId,
        estado: 'aprobado', montoConfirmado: pago.datos.monto,
        referenciaExterna: 'TRX-' + randomUUID().slice(0, 8),
      };
      const secreto = readFileSync(join(RAIZ, 'secrets', 'pagos-webhook'), 'utf8').trim();
      const firma = createHmac('sha256', secreto).update(JSON.stringify(cuerpo)).digest('hex');
      const clave = randomUUID();
      const cabeceras = { 'x-signature': firma, 'x-idempotency-key': clave };

      const aviso = await pedir('/api/v1/payments/webhook', { metodo: 'POST', cuerpo, cabeceras });
      const repetido = await pedir('/api/v1/payments/webhook', { metodo: 'POST', cuerpo, cabeceras });
      const final = await pedir(`/api/v1/orders/${estado.pedidoId}`, { token: estado.token });

      return [
        ok(`pago ${pago.datos.pagoId} · monto ${pago.datos.monto} (lo fijo orders, no el navegador)`),
        ok(`aviso del proveedor: ${JSON.stringify(aviso.datos)}`),
        nota(`mismo aviso reenviado → ${JSON.stringify(repetido.datos)} (idempotencia)`),
        ok(`estado final del pedido: ${final.datos?.estado}`),
      ];
    },
  },

  // -------------------------------------------------------------------------
  {
    titulo: 'EXTRA · el gateway descarta una identidad interna inventada',
    mirar: [
      'api-gateway: RECHAZO «cabeceras de identidad interna DESCARTADAS»',
      'backend:     no llega nada con esa identidad falsa',
    ],
    async ejecutar() {
      const r = await pedir('/api/v1/clients', {
        cabeceras: { 'x-identidad-interna': 'inventado' },
      });
      return [
        ok(`el gateway respondio ${r.estado} y dejo anotado el intento`),
        nota('una cabecera de identidad interna que venga de afuera se bota siempre'),
      ];
    },
  },
];
