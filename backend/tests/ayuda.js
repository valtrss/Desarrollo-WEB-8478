// Utilidades para las pruebas. Hablan con el sistema por donde habla el
// navegador: el API Gateway publico. Nada de atajos por la base de datos.

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const API = 'http://localhost:8080';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function enviar(ruta, { metodo, cuerpo, token, cabeceras }) {
  const respuesta = await fetch(API + ruta, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...cabeceras,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { estado: respuesta.status, datos };
}

// Si el gateway responde 429, la bateria NO falla: espera a la siguiente
// ventana de un minuto y reintenta.
//
// Esto no debilita el control, lo respeta. El limite existe para frenar abuso
// desde una IP, y una bateria que corre varias veces seguidas desde localhost
// se parece bastante a eso. Correrla una vez nunca lo toca; correrla tres
// veces en un minuto si, porque crea unos siete pedidos por vuelta y el tope
// de POST /api/v1/orders es veinte por minuto.
export async function pedir(ruta, { metodo = 'GET', cuerpo, token, cabeceras = {} } = {}) {
  let r = await enviar(ruta, { metodo, cuerpo, token, cabeceras });
  if (r.estado === 429) {
    const faltanMs = 60_000 - (Date.now() % 60_000) + 500;
    console.error(`  (limite de solicitudes en ${ruta}; esperando ${Math.ceil(faltanMs / 1000)} s)`);
    await esperar(faltanMs);
    r = await enviar(ruta, { metodo, cuerpo, token, cabeceras });
  }
  return r;
}

// Las sesiones se reutilizan entre pruebas y ENTRE CORRIDAS.
//
// Por que: el gateway limita el login a 30 por minuto y por IP, y `node --test`
// levanta un proceso por archivo, asi que cada corrida pedia una decena de
// sesiones. Tres corridas seguidas agotaban el limite y la bateria se hacia
// fallar a si misma. El control esta bien; lo que estaba mal era la prueba.
//
// Los tokens duran 15 minutos, asi que se guardan en un archivo temporal y se
// reutilizan mientras les quede vida. Si rota el secreto de firma, hay que
// borrar ese archivo: la ruta se imprime en el error.

const CACHE = join(tmpdir(), 'lanonna-sesiones-prueba.json');
const sesiones = new Map();

function leerCache() {
  try {
    return existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  } catch {
    return {};
  }
}

function guardarEnCache(correo, token, expiraEn) {
  try {
    const datos = leerCache();
    datos[correo] = { token, vence: Date.now() + (expiraEn - 120) * 1000 };
    writeFileSync(CACHE, JSON.stringify(datos));
  } catch { /* si no se puede escribir, se vuelve a iniciar sesion y ya */ }
}

export function limpiarCacheDeSesiones() {
  try { unlinkSync(CACHE); } catch { /* no existia */ }
  sesiones.clear();
}

export async function iniciarSesion(correo, password, { nuevo = false } = {}) {
  if (!nuevo) {
    if (sesiones.has(correo)) return sesiones.get(correo);
    const guardada = leerCache()[correo];
    if (guardada && guardada.vence > Date.now()) {
      sesiones.set(correo, guardada.token);
      return guardada.token;
    }
  }

  const r = await pedir('/api/v1/auth/login', { metodo: 'POST', cuerpo: { correo, password } });
  if (r.estado !== 200) {
    throw new Error(
      `No se pudo iniciar sesion como ${correo}: ${JSON.stringify(r.datos)}. ` +
      `Si rotó el secreto de firma, borre ${CACHE}`
    );
  }
  if (!nuevo) {
    sesiones.set(correo, r.datos.accessToken);
    guardarEnCache(correo, r.datos.accessToken, r.datos.expiraEn ?? 900);
  }
  return r.datos.accessToken;
}

// Repone la produccion del dia de los productos que usa la bateria.
//
// Hace falta porque cada corrida consume stock de verdad: a partir de la
// septima, los 12 ravioles que siembra `npm run seed` se acaban y los pedidos
// empiezan a fallar con 409. Eso es correcto —no se puede vender lo que no
// hay— pero convierte la bateria en algo que solo corre unas pocas veces.
//
// Se repone por la API del administrador (S07), que es como lo haria el local
// cada manana. `prd_pomodoro` se deja en cero a proposito: es el caso AGOTADO.
const PRODUCTOS_DE_PRUEBA = [
  'prd_ravioles', 'prd_linguine', 'prd_pesto', 'prd_tortellini',
  'prd_pappardelle', 'prd_tagliatelle', 'prd_noquis', 'prd_agnolotti',
];

export async function reponerStockDePrueba(stock = 80) {
  const token = await iniciarSesion('admin@lanonna.cl', 'AdminNonna2026!');
  for (const id of PRODUCTOS_DE_PRUEBA) {
    await pedir(`/api/v1/products/${id}/stock`, {
      metodo: 'PUT', token, cuerpo: { stockDelDia: stock },
    });
  }
}

export async function consultarGraphql(consulta, { token, variables } = {}) {
  return pedir('/graphql', { metodo: 'POST', token, cuerpo: { query: consulta, variables } });
}

// Adaptador de prueba del proveedor de pagos: firma la notificacion igual que
// lo haria el proveedor real. Preserva contrato, firma e idempotencia.
export async function notificarPago({ pagoId, pedidoId, estado, montoConfirmado, claveIdempotencia, firmaRota = false }) {
  const cuerpo = { pagoId, pedidoId, estado, montoConfirmado, referenciaExterna: 'TRX-' + randomUUID().slice(0, 8) };
  const crudo = JSON.stringify(cuerpo);
  const secreto = readFileSync(join(RAIZ, 'secrets', 'pagos-webhook'), 'utf8').trim();
  const firma = createHmac('sha256', secreto).update(crudo).digest('hex');

  return pedir('/api/v1/payments/webhook', {
    metodo: 'POST',
    cuerpo,
    cabeceras: {
      'x-signature': firmaRota ? 'f'.repeat(64) : firma,
      'x-idempotency-key': claveIdempotencia ?? randomUUID(),
    },
  });
}

export async function sistemaArriba() {
  try {
    const r = await fetch(API + '/health');
    return r.ok;
  } catch {
    return false;
  }
}
