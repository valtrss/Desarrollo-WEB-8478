// Bitacora comun a todos los servicios.
//
// Existe para que los logs se puedan LEER en pantalla durante la demostracion:
// una linea por evento, con hora, servicio, identificador de correlacion y el
// tipo de evento en una columna fija.
//
// El identificador de correlacion viaja por AsyncLocalStorage, asi que una
// consulta SQL hecha tres capas mas abajo sigue mostrando el mismo codigo que
// la peticion que la origino. Eso es lo que permite seguir UNA llamada por los
// cinco contenedores.
//
// Para logs en JSON (produccion, agregadores) basta con BITACORA=json.

import { AsyncLocalStorage } from 'node:async_hooks';

export const contexto = new AsyncLocalStorage();

const JSON_PURO = process.env.BITACORA === 'json';
const SIN_COLOR = process.env.NO_COLOR !== undefined || !process.stdout.isTTY;

const C = {
  reset: '\x1b[0m', negrita: '\x1b[1m', tenue: '\x1b[2m',
  rojo: '\x1b[31m', verde: '\x1b[32m', amarillo: '\x1b[33m',
  azul: '\x1b[34m', magenta: '\x1b[35m', cian: '\x1b[36m', gris: '\x1b[90m',
  rojoFuerte: '\x1b[91m', verdeFuerte: '\x1b[92m',
};

const pintar = (color, texto) => (SIN_COLOR ? texto : color + texto + C.reset);

// Un color por servicio, para distinguirlos de un vistazo si se ven juntos.
const COLOR_SERVICIO = {
  'api-gateway': C.magenta,
  'graphql-gateway': C.cian,
  auth: C.azul,
  clients: C.azul,
  inventory: C.verde,
  orders: C.amarillo,
  payments: C.rojo,
  analytics: C.gris,
  frontend: C.gris,
};

// Tipos de evento. El ancho fijo es a proposito: en el video las columnas
// quedan alineadas y se puede seguir la secuencia sin leer cada linea entera.
const EVENTOS = {
  PETICION:  { color: C.negrita, ancho: 9 },
  RESPUESTA: { color: C.tenue,   ancho: 9 },
  RUTA:      { color: C.magenta, ancho: 9 },
  SECRETO:   { color: C.amarillo, ancho: 9 },
  AUTENTICA: { color: C.azul,    ancho: 9 },
  AUTORIZA:  { color: C.azul,    ancho: 9 },
  IDENTIDAD: { color: C.cian,    ancho: 9 },
  CREDENCIAL:{ color: C.azul,    ancho: 9 },
  TOKEN:     { color: C.azul,    ancho: 9 },
  LIMITE:    { color: C.amarillo, ancho: 9 },
  ENRUTA:    { color: C.magenta, ancho: 9 },
  LLAMA:     { color: C.cian,    ancho: 9 },
  SQL:       { color: C.verde,   ancho: 9 },
  GRPC:      { color: C.cian,    ancho: 9 },
  FIRMA:     { color: C.rojo,    ancho: 9 },
  NEGOCIO:   { color: C.verdeFuerte, ancho: 9 },
  RECHAZO:   { color: C.rojoFuerte,  ancho: 9 },
  AVISO:     { color: C.amarillo, ancho: 9 },
};

function hora() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export function correlacionActual() {
  return contexto.getStore()?.correlacion ?? null;
}

// Codigo corto y estable para mostrar en pantalla.
const corto = (c) => (c ? String(c).replace(/-/g, '').slice(0, 8) : '········');

/**
 * Escribe una linea de bitacora.
 *
 * @param {string} servicio  nombre del microservicio
 * @param {string} evento    una de las claves de EVENTOS
 * @param {string} mensaje   texto legible
 * @param {object} [datos]   pares clave=valor que se muestran al final
 */
export function anotar(servicio, evento, mensaje, datos) {
  const correlacion = correlacionActual();

  if (JSON_PURO) {
    console.log(JSON.stringify({
      hora: new Date().toISOString(), servicio, evento, correlacion, mensaje, ...datos,
    }));
    return;
  }

  const def = EVENTOS[evento] ?? { color: C.reset, ancho: 9 };
  const extra = datos
    ? ' ' + Object.entries(datos)
        .map(([k, v]) => pintar(C.gris, `${k}=`) + String(v))
        .join(pintar(C.gris, ' · '))
    : '';

  const linea = [
    pintar(C.gris, hora()),
    pintar(COLOR_SERVICIO[servicio] ?? C.reset, servicio.padEnd(15)),
    pintar(C.gris, corto(correlacion)),
    pintar(def.color, evento.padEnd(def.ancho)),
    mensaje + extra,
  ].join('  ');

  const salida = evento === 'RECHAZO' || evento === 'AVISO' ? console.error : console.log;
  salida(linea);
}

// Cabecera al arrancar cada servicio, para que se vea de que contenedor es
// la ventana que se esta mostrando.
export function cabecera(servicio, detalle) {
  if (JSON_PURO) return;
  const color = COLOR_SERVICIO[servicio] ?? C.reset;
  const titulo = ` ${servicio.toUpperCase()} `;
  const raya = '─'.repeat(Math.max(0, 62 - titulo.length));
  console.log('');
  console.log(pintar(color, `┌─${titulo}${raya}┐`));
  for (const l of detalle) console.log(pintar(color, '│ ') + l);
  console.log(pintar(color, `└${'─'.repeat(64)}┘`));
  console.log('');
}
