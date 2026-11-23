// Estudio de grabacion: un solo comando para el video de la demostracion.
//
//   npm run estudio
//
// Levanta los nueve procesos, y en vez de mezclar sus bitacoras en una sola
// columna las reparte en cinco franjas, una por cada contenedor que pide la
// evaluacion. Despues va ejecutando el guion paso a paso, pero NO avanza solo:
// espera que se apriete la barra espaciadora. Asi se puede ir narrando con
// calma y disparar el paso siguiente cuando corresponda.
//
// Al empezar cada paso las franjas se vacian, de modo que lo que queda en
// pantalla es exactamente la evidencia de ese paso y nada mas.
//
// Teclas:  [espacio] paso siguiente   [r] repetir el paso   [l] limpiar
//          [q] salir
//
// Los servicios se arrancan con BITACORA=json y este programa se encarga de
// darle formato. Es el mismo evento que se ve en color cuando se corre un
// servicio por separado; lo unico que cambia es donde se dibuja.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PASOS, SITIO, API } from './guion.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const PROCESOS = [
  { nombre: 'clients',         archivo: 'services/clients/servidor.js' },
  { nombre: 'auth',            archivo: 'services/auth/servidor.js' },
  { nombre: 'inventory',       archivo: 'services/inventory/servidor.js' },
  { nombre: 'orders',          archivo: 'services/orders/servidor.js' },
  { nombre: 'payments',        archivo: 'services/payments/servidor.js' },
  { nombre: 'analytics',       archivo: 'services/analytics/servidor.js' },
  { nombre: 'graphql-gateway', archivo: 'gateways/graphql-gateway/servidor.js' },
  { nombre: 'api-gateway',     archivo: 'gateways/api-gateway/servidor.js' },
  { nombre: 'frontend',        archivo: 'scripts/servir-frontend.js' },
];

// Las cinco franjas son los cinco contenedores que pide la evaluacion.
// `peso` reparte el alto disponible: las que reciben mas lineas son mas altas.
const BANDAS = [
  { id: 'frontend', num: '1', titulo: 'FRONTEND',
    detalle: 'el sitio estatico · la evidencia principal va en la pestana Red del navegador', peso: 1,
    vacio: 'sin peticiones todavia · navegue en ' + SITIO + ' para que aparezcan aqui' },
  { id: 'gateway', num: '2', titulo: 'API GATEWAY',
    detalle: 'puerto 8080 · unica puerta publica · pide el secreto, valida y enruta', peso: 1.5,
    vacio: 'sin trafico · ninguna llamada ha pasado por la puerta publica' },
  { id: 'auth', num: '3', titulo: 'AUTH SERVICE',
    detalle: 'puerto 4000 · valida credenciales, emite y revoca sesiones', peso: 1,
    vacio: 'sin trafico' },
  { id: 'backend', num: '4', titulo: 'BACKEND',
    detalle: 'clients · inventory · orders · payments · analytics · graphql', peso: 1.5,
    vacio: 'sin trafico' },
  { id: 'persistencia', num: '5', titulo: 'PERSISTENCIA',
    detalle: 'cada servicio escribe UNICAMENTE en su propia base de datos', peso: 1.6,
    vacio: 'ninguna consulta todavia' },
];

const C = {
  reset: '\x1b[0m', negrita: '\x1b[1m', tenue: '\x1b[2m', invertido: '\x1b[7m',
  rojo: '\x1b[31m', verde: '\x1b[32m', amarillo: '\x1b[33m', azul: '\x1b[34m',
  magenta: '\x1b[35m', cian: '\x1b[36m', gris: '\x1b[90m',
  rojoFuerte: '\x1b[91m', verdeFuerte: '\x1b[92m', blanco: '\x1b[97m',
};

const COLOR_BANDA = {
  frontend: C.gris, gateway: C.magenta, auth: C.azul,
  backend: C.amarillo, persistencia: C.verde,
};

const COLOR_EVENTO = {
  PETICION: C.blanco, RESPUESTA: C.tenue, RUTA: C.magenta, SECRETO: C.amarillo,
  AUTENTICA: C.azul, AUTORIZA: C.azul, IDENTIDAD: C.cian, CREDENCIAL: C.azul,
  TOKEN: C.azul, LIMITE: C.amarillo, ENRUTA: C.magenta, LLAMA: C.cian,
  SQL: C.verde, GRPC: C.cian, FIRMA: C.rojo, NEGOCIO: C.verdeFuerte,
  RECHAZO: C.rojoFuerte, AVISO: C.amarillo,
};

// --- estado -----------------------------------------------------------------

const lineas = new Map(BANDAS.map((b) => [b.id, []]));
const hijos = [];
const estadoGuion = {};

let pasoActual = -1;          // -1 = todavia no arranca el guion
let corriendo = false;        // un paso en ejecucion
let resultados = [];
let aviso = 'Levantando los nueve procesos...';
let sucio = true;
let saliendo = false;

// --- utilidades de dibujo ---------------------------------------------------

const cols = () => process.stdout.columns || 100;
const filas = () => process.stdout.rows || 30;

/**
 * Une segmentos {t, c} recortando por ancho VISIBLE, sin contar los codigos
 * de color. Hace falta porque un `padEnd` sobre texto con color cuenta los
 * codigos de escape y descuadra las columnas.
 */
function componer(segmentos, ancho) {
  let visible = 0;
  let salida = '';
  for (const { t, c } of segmentos) {
    if (visible >= ancho) break;
    const texto = String(t);
    const cabe = texto.length <= ancho - visible ? texto : texto.slice(0, ancho - visible);
    salida += (c ?? '') + cabe + (c ? C.reset : '');
    visible += cabe.length;
  }
  return salida + ' '.repeat(Math.max(0, ancho - visible));
}

function escribir(fila, texto) {
  process.stdout.write(`\x1b[${fila};1H${texto}\x1b[K`);
}

function hora(iso) {
  const d = iso ? new Date(iso) : new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

const corto = (c) => (c ? String(c).replace(/-/g, '').slice(0, 8) : '········');

// --- recepcion de eventos ---------------------------------------------------

function bandaDe(evento) {
  if (evento.evento === 'SQL') return 'persistencia';
  if (evento.servicio === 'frontend') return 'frontend';
  if (evento.servicio === 'api-gateway') return 'gateway';
  if (evento.servicio === 'auth') return 'auth';
  return 'backend';
}

function agregar(bandaId, segmentos) {
  const buffer = lineas.get(bandaId);
  buffer.push(segmentos);
  if (buffer.length > 400) buffer.splice(0, buffer.length - 400);
  sucio = true;
}

function recibir(nombreProceso, texto) {
  for (const cruda of texto.split('\n')) {
    const linea = cruda.trim();
    if (!linea) continue;

    // Las lineas que no son JSON son avisos sueltos del proceso; se muestran
    // igual, para no esconder un problema durante la grabacion.
    if (!linea.startsWith('{')) {
      agregar(nombreProceso === 'frontend' ? 'frontend' : 'backend', [
        { t: hora() + '  ', c: C.gris },
        { t: nombreProceso.padEnd(16), c: C.gris },
        { t: linea, c: C.tenue },
      ]);
      continue;
    }

    let e;
    try { e = JSON.parse(linea); } catch { continue; }

    const banda = bandaDe(e);
    const { hora: cuando, servicio, evento, correlacion, mensaje, ...datos } = e;
    const colorEvento = COLOR_EVENTO[evento] ?? C.reset;

    // En las franjas de un solo servicio el nombre es redundante.
    const mostrarServicio = banda === 'backend' || banda === 'persistencia';

    // Un solo campo largo (por ejemplo «finalidad», que es una frase entera)
    // se come la linea y tapa los demas. Se recorta el valor, no la clave.
    const extra = Object.entries(datos)
      .map(([k, v]) => {
        const t = String(v);
        return `${k}=${t.length > 44 ? t.slice(0, 43) + '…' : t}`;
      })
      .join(' · ');

    agregar(banda, [
      { t: hora(cuando) + '  ', c: C.gris },
      { t: corto(correlacion) + '  ', c: C.gris },
      ...(mostrarServicio ? [{ t: servicio.padEnd(16), c: COLOR_BANDA[banda] }] : []),
      { t: String(evento).padEnd(10), c: colorEvento },
      { t: mensaje ?? '' },
      ...(extra ? [{ t: '  ' + extra, c: C.gris }] : []),
    ]);
  }
}

// --- arranque de los procesos ----------------------------------------------

function arrancar(definicion) {
  const hijo = spawn(process.execPath, [join(RAIZ, definicion.archivo)], {
    cwd: RAIZ,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BITACORA: 'json', NO_COLOR: '1' },
  });
  for (const flujo of [hijo.stdout, hijo.stderr]) {
    flujo.setEncoding('utf8');
    flujo.on('data', (t) => recibir(definicion.nombre, t));
  }
  hijo.on('exit', (codigo) => {
    if (saliendo) return;
    agregar('backend', [
      { t: hora() + '  ', c: C.gris },
      { t: `${definicion.nombre} termino con codigo ${codigo}`, c: C.rojoFuerte },
    ]);
  });
  hijos.push(hijo);
}

async function esperarSalud() {
  for (let intento = 0; intento < 60; intento += 1) {
    const arriba = await fetch(API + '/health').then((r) => r.ok).catch(() => false);
    if (arriba) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// --- el guion ---------------------------------------------------------------

function limpiarBandas() {
  for (const b of BANDAS) lineas.set(b.id, []);
  sucio = true;
}

async function siguientePaso() {
  if (corriendo) return;
  if (pasoActual + 1 >= PASOS.length) {
    aviso = 'Fin del guion. [r] repite el ultimo paso · [q] sale.';
    sucio = true;
    return;
  }
  pasoActual += 1;
  await ejecutarPaso();
}

async function ejecutarPaso() {
  const paso = PASOS[pasoActual];
  corriendo = true;
  resultados = [];
  limpiarBandas();
  aviso = paso.manual
    ? 'Paso manual: hagalo en el navegador y despues apriete la barra espaciadora.'
    : 'Disparando...';
  sucio = true;

  try {
    resultados = await paso.ejecutar(estadoGuion);
  } catch (error) {
    resultados = [{ tipo: 'no', texto: 'fallo el paso: ' + error.message }];
  }

  corriendo = false;
  aviso = pasoActual + 1 >= PASOS.length
    ? 'Ultimo paso. [r] lo repite · [q] sale.'
    : '[espacio] siguiente paso · [r] repetir este · [l] limpiar franjas';
  sucio = true;
}

// --- dibujo completo --------------------------------------------------------

function dibujar() {
  const ancho = cols() - 2;
  const alto = filas();

  // Reparto vertical: cabecera, caja de narracion, franjas, pie.
  const ALTO_NARRACION = 9;
  const disponible = alto - 1 - ALTO_NARRACION - 1;
  const contenidoTotal = disponible - BANDAS.length;   // una fila de titulo por franja
  const pesoTotal = BANDAS.reduce((s, b) => s + b.peso, 0);

  let repartidas = 0;
  const altoDe = BANDAS.map((b, i) => {
    if (i === BANDAS.length - 1) return Math.max(2, contenidoTotal - repartidas);
    const n = Math.max(2, Math.floor((contenidoTotal * b.peso) / pesoTotal));
    repartidas += n;
    return n;
  });

  let fila = 1;

  // --- cabecera
  const etiquetaPaso = pasoActual < 0
    ? 'sin empezar'
    : `paso ${pasoActual + 1} de ${PASOS.length}`;
  escribir(fila++, componer([
    { t: ' ESTUDIO ', c: C.invertido + C.negrita },
    { t: '  Pastas Frescas «La Nonna» · Caso 33 · Desarrollo Web 8478', c: C.negrita },
    { t: '   ' + etiquetaPaso, c: C.cian },
    { t: '   sitio: ' + SITIO, c: C.gris },
  ], ancho + 2));

  // --- caja de narracion
  const paso = pasoActual >= 0 ? PASOS[pasoActual] : null;
  escribir(fila++, componer([{ t: '─'.repeat(ancho + 2), c: C.gris }], ancho + 2));

  if (!paso) {
    escribir(fila++, componer([
      { t: '  Apriete la barra espaciadora para empezar el guion.', c: C.negrita },
    ], ancho + 2));
  } else {
    escribir(fila++, componer([
      { t: `  PASO ${pasoActual + 1} · `, c: C.cian + C.negrita },
      { t: paso.titulo, c: C.negrita },
    ], ancho + 2));
  }

  const narracion = [];
  if (paso) {
    for (const m of paso.mirar) narracion.push({ marca: '    mirar → ', color: C.gris, texto: m });
    for (const r of resultados) {
      const marca = r.tipo === 'ok' ? '    ✓ ' : r.tipo === 'no' ? '    ✗ ' : '    · ';
      const color = r.tipo === 'ok' ? C.verde : r.tipo === 'no' ? C.rojoFuerte : C.amarillo;
      narracion.push({ marca, color, texto: r.texto });
    }
  }
  const visibles = narracion.slice(-(ALTO_NARRACION - 3));
  for (let i = 0; i < ALTO_NARRACION - 3; i += 1) {
    const n = visibles[i];
    escribir(fila++, n
      ? componer([{ t: n.marca, c: n.color }, { t: n.texto }], ancho + 2)
      : componer([{ t: '' }], ancho + 2));
  }

  escribir(fila++, componer([
    { t: '  ' + aviso, c: corriendo ? C.amarillo : C.tenue },
  ], ancho + 2));

  // --- las cinco franjas
  BANDAS.forEach((banda, i) => {
    const color = COLOR_BANDA[banda.id];
    escribir(fila++, componer([
      { t: `─ ${banda.num} ${banda.titulo} `, c: color + C.negrita },
      { t: `· ${banda.detalle} `, c: C.gris },
      { t: '─'.repeat(Math.max(0, ancho + 2)), c: C.gris },
    ], ancho + 2));

    const buffer = lineas.get(banda.id);
    const ultimas = buffer.slice(-altoDe[i]);
    for (let j = 0; j < altoDe[i]; j += 1) {
      const linea = ultimas[j];
      if (linea) {
        escribir(fila++, componer([{ t: ' ' }, ...linea], ancho + 2));
      } else if (j === 0 && buffer.length === 0) {
        // Una franja en blanco parece un servicio caido. Se dice que esta
        // vacia a proposito.
        escribir(fila++, componer([{ t: '   ' + banda.vacio, c: C.tenue }], ancho + 2));
      } else {
        escribir(fila++, componer([{ t: '' }], ancho + 2));
      }
    }
  });

  // --- pie
  escribir(alto, componer([
    { t: ' [espacio] ', c: C.invertido }, { t: ' paso siguiente   ', c: C.gris },
    { t: ' [r] ', c: C.invertido }, { t: ' repetir   ', c: C.gris },
    { t: ' [l] ', c: C.invertido }, { t: ' limpiar franjas   ', c: C.gris },
    { t: ' [q] ', c: C.invertido }, { t: ' salir', c: C.gris },
  ], ancho + 2));
}

// --- ciclo de vida ----------------------------------------------------------

function restaurarTerminal() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write('\x1b[?25h');      // cursor visible
  process.stdout.write('\x1b[?1049l');    // pantalla normal
}

function salir() {
  if (saliendo) return;
  saliendo = true;
  for (const h of hijos) h.kill('SIGTERM');
  restaurarTerminal();
  console.log('Estudio cerrado. Los nueve procesos quedaron detenidos.\n');
  setTimeout(() => process.exit(0), 300);
}

if (!process.stdout.isTTY) {
  console.error('El estudio necesita una terminal de verdad (dibuja sobre la pantalla).');
  console.error('Para una salida en texto plano use: npm run demo:guion\n');
  process.exit(1);
}

if (filas() < 30 || cols() < 100) {
  console.error(`\nLa ventana es de ${cols()}x${filas()} y el estudio necesita al menos 100x30.`);
  console.error('Agrande la ventana de la terminal (o baje el tamano de la letra) y vuelva a correrlo.\n');
  process.exit(1);
}

process.stdout.write('\x1b[?1049h');   // pantalla alterna: no ensucia el historial
process.stdout.write('\x1b[?25l');     // esconder el cursor
process.stdout.write('\x1b[2J');

process.on('SIGINT', salir);
process.on('SIGTERM', salir);
process.on('exit', restaurarTerminal);

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (tecla) => {
  if (tecla === 'q' || tecla === '\x03') return salir();
  if (tecla === ' ') return void siguientePaso();
  if (tecla === 'r' && pasoActual >= 0) return void ejecutarPaso();
  if (tecla === 'l') return limpiarBandas();
});

process.stdout.on('resize', () => {
  process.stdout.write('\x1b[2J');
  sucio = true;
});

setInterval(() => {
  if (!sucio || saliendo) return;
  sucio = false;
  dibujar();
}, 120);

for (const definicion of PROCESOS) arrancar(definicion);

const arriba = await esperarSalud();
aviso = arriba
  ? 'Todo arriba. Abra ' + SITIO + ' en el navegador y apriete la barra espaciadora.'
  : 'El gateway no respondio en 30 s. Revise las franjas de abajo para ver que fallo.';
sucio = true;
