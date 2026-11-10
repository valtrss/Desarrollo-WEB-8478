// Prueba de carga reproducible (Modulo 9).
//
// Mide tres cosas y las compara con los objetivos declarados:
//
//   A. Catalogo publico a traves del API Gateway (el camino del navegador).
//   B. Reserva de stock por gRPC   (canal interno elegido).
//   C. La MISMA reserva por REST   (la alternativa que se descarto).
//
// B y C son la medicion que respalda el ADR: sin ella, decir que gRPC conviene
// seria una afirmacion sin evidencia.
//
// Uso:  node scripts/prueba-carga.js [--concurrencia 100] [--duracion 10]
//
// No usa herramientas externas a proposito: cualquiera puede repetirla con
// solo tener Node y el sistema levantado.

import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

import { emitirIdentidadInterna } from '../shared/identidad.js';
import { abrirBase } from '../shared/db.js';

const argumento = (nombre, pordefecto) => {
  const i = process.argv.indexOf('--' + nombre);
  return i === -1 ? pordefecto : Number(process.argv[i + 1]);
};

const CONCURRENCIA = argumento('concurrencia', 100);
const DURACION_S = argumento('duracion', 10);
const OBJETIVOS = { p95Ms: 200, throughput: 500, erroresPct: 0, concurrencia: 100 };

const API = 'http://localhost:8080';
const INVENTORY_HTTP = 'http://127.0.0.1:4002';
const GRPC_DESTINO = '127.0.0.1:50051';
const PRODUCTO_CARGA = 'prd_carga_prueba';

// --- estadistica ------------------------------------------------------------
function resumir(muestras, duracionMs, errores, limitados = 0) {
  const ordenadas = [...muestras].sort((a, b) => a - b);
  const percentil = (p) => ordenadas.length === 0 ? 0
    : ordenadas[Math.min(ordenadas.length - 1, Math.floor((p / 100) * ordenadas.length))];
  const total = muestras.length + errores + limitados;
  return {
    solicitudes: total,
    exitosas: muestras.length,
    errores,
    limitados,
    limitadosPct: total === 0 ? 0 : Number(((limitados / total) * 100).toFixed(2)),
    erroresPct: total === 0 ? 0 : Number(((errores / total) * 100).toFixed(2)),
    p50: Number(percentil(50).toFixed(2)),
    p95: Number(percentil(95).toFixed(2)),
    p99: Number(percentil(99).toFixed(2)),
    max: Number((ordenadas.at(-1) ?? 0).toFixed(2)),
    throughput: Number((total / (duracionMs / 1000)).toFixed(1)),
  };
}

// Ejecuta `tarea` con N trabajadores en paralelo durante `segundos`.
async function correr(nombre, tarea, { concurrencia, segundos }) {
  const muestras = [];
  let errores = 0;
  let limitados = 0;
  const hasta = Date.now() + segundos * 1000;
  const inicio = Date.now();

  const trabajador = async () => {
    while (Date.now() < hasta) {
      const t0 = performance.now();
      try {
        await tarea();
        muestras.push(performance.now() - t0);
      } catch (error) {
        // Un 429 no es una falla: es el limite de solicitudes del gateway
        // rechazando trafico, que es exactamente lo que debe hacer.
        if (error?.limitado) limitados++;
        else errores++;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrencia }, trabajador));
  const resultado = resumir(muestras, Date.now() - inicio, errores, limitados);
  console.log(`\n  ${nombre}`);
  console.log(`    solicitudes ${resultado.solicitudes}  aceptadas ${resultado.exitosas}  ` +
    `rechazadas por limite ${resultado.limitados} (${resultado.limitadosPct}%)  ` +
    `errores ${resultado.errores} (${resultado.erroresPct}%)`);
  console.log(`    p50 ${resultado.p50} ms   p95 ${resultado.p95} ms   p99 ${resultado.p99} ms   max ${resultado.max} ms`);
  console.log(`    throughput ${resultado.throughput} req/s`);
  return resultado;
}

// --- preparacion ------------------------------------------------------------
// Un producto propio de la prueba, con stock alto, para no alterar el catalogo
// real ni dejar reservas colgadas sobre productos del negocio.
function prepararProductoDeCarga() {
  const db = abrirBase('inventory');
  db.prepare(`
    INSERT INTO productos (id, nombre, descripcion, categoria_id, formato, porciones,
      precio, imagen_url, stock_del_dia, stock_reservado, descontinuado, actualizado_en)
    VALUES (?,?,?,?,?,?,?,?,?,0,0,?)
    ON CONFLICT(id) DO UPDATE SET stock_del_dia = excluded.stock_del_dia, stock_reservado = 0
  `).run(PRODUCTO_CARGA, 'Producto de prueba de carga', 'No se vende: solo para medir.',
         'pastas-largas', '500 g', 1, 1000, '', 10_000_000, new Date().toISOString());
  // Tiene que estar activo (descontinuado = 0) para que se pueda reservar.
  // Se borra al terminar la prueba.
  db.close();
}

function limpiarProductoDeCarga() {
  const db = abrirBase('inventory');
  db.prepare('DELETE FROM reservas WHERE producto_id = ?').run(PRODUCTO_CARGA);
  db.prepare('DELETE FROM productos WHERE id = ?').run(PRODUCTO_CARGA);
  db.close();
}

// --- clientes ---------------------------------------------------------------
const definicion = protoLoader.loadSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'proto', 'inventario.proto'),
  { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
);
const paquete = grpc.loadPackageDefinition(definicion).lanonna.inventario;
const clienteGrpc = new paquete.Inventario(GRPC_DESTINO, grpc.credentials.createInsecure());

function metadatos() {
  const meta = new grpc.Metadata();
  meta.set('x-identidad-interna', emitirIdentidadInterna({
    usuarioId: 'carga', rol: 'servicio', correlacion: 'carga', destino: 'inventory',
  }));
  return meta;
}

function reservarPorGrpc() {
  const pedidoId = 'carga_' + randomUUID().slice(0, 12);
  return new Promise((resolver, rechazar) => {
    clienteGrpc.ReservarStock(
      { pedido_id: pedidoId, correlacion: 'carga', items: [{ producto_id: PRODUCTO_CARGA, cantidad: 1 }] },
      metadatos(), { deadline: new Date(Date.now() + 5000) },
      (error, respuesta) => {
        if (error || !respuesta.ok) return rechazar(error ?? new Error(respuesta.codigo));
        // Se libera enseguida: la prueba mide el canal, no acumula reservas.
        clienteGrpc.LiberarReserva({ pedido_id: pedidoId }, metadatos(),
          { deadline: new Date(Date.now() + 5000) }, () => resolver());
      }
    );
  });
}

async function reservarPorRest() {
  const pedidoId = 'carga_' + randomUUID().slice(0, 12);
  const cabeceras = {
    'content-type': 'application/json',
    'x-identidad-interna': emitirIdentidadInterna({
      usuarioId: 'carga', rol: 'servicio', correlacion: 'carga', destino: 'inventory',
    }),
  };
  const r = await fetch(INVENTORY_HTTP + '/internal/reservas', {
    method: 'POST', headers: cabeceras,
    body: JSON.stringify({ pedidoId, items: [{ productoId: PRODUCTO_CARGA, cantidad: 1 }] }),
  });
  if (!r.ok) throw new Error('reserva rest fallida');
  await r.json();
  await fetch(`${INVENTORY_HTTP}/internal/reservas/${pedidoId}/liberar`, {
    method: 'POST', headers: cabeceras,
  });
}

async function catalogoPorGateway() {
  const r = await fetch(API + '/api/v1/products?limit=12');
  if (r.status === 429) {
    const limite = new Error('limite de solicitudes');
    limite.limitado = true;
    throw limite;
  }
  if (!r.ok) throw new Error('catalogo ' + r.status);
  await r.json();
}

// Mismo trabajo, pero contra el servicio interno: mide la capacidad del
// backend sin el tope por IP que el gateway aplica a proposito.
async function catalogoInterno() {
  const r = await fetch(INVENTORY_HTTP + '/products?limit=12', {
    headers: {
      'x-identidad-interna': emitirIdentidadInterna({
        usuarioId: 'carga', rol: 'anonimo', correlacion: 'carga', destino: 'inventory',
      }),
    },
  });
  if (!r.ok) throw new Error('catalogo interno ' + r.status);
  await r.json();
}

// --- ejecucion --------------------------------------------------------------
console.log('Prueba de carga - Pastas Frescas La Nonna');
console.log(`  entorno: Node ${process.version} sobre ${os.type()} ${os.release()} (${os.arch()})`);
console.log(`  maquina: ${os.cpus().length} nucleos, ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB de RAM`);
console.log(`  parametros: concurrencia ${CONCURRENCIA}, duracion ${DURACION_S} s por escenario`);
console.log(`  objetivos: p95 < ${OBJETIVOS.p95Ms} ms, ${OBJETIVOS.throughput} req/s, ${OBJETIVOS.erroresPct}% errores`);

const salud = await fetch(API + '/health').then((r) => r.ok).catch(() => false);
if (!salud) {
  console.error('\nEl sistema no responde. Ejecute: npm start');
  process.exit(1);
}

prepararProductoDeCarga();
const cpuAntes = process.cpuUsage();
const memAntes = process.memoryUsage().rss;

const resultados = {
  catalogo: await correr('A1. Catalogo por el API Gateway (con limite de solicitudes activo)',
    catalogoPorGateway, { concurrencia: CONCURRENCIA, segundos: DURACION_S }),
  catalogoInterno: await correr('A2. Catalogo en el servicio interno (capacidad sin el limite)',
    catalogoInterno, { concurrencia: CONCURRENCIA, segundos: DURACION_S }),
  grpc: await correr('B. Reserva de stock por gRPC (unary, con deadline)',
    reservarPorGrpc, { concurrencia: CONCURRENCIA, segundos: DURACION_S }),
  rest: await correr('C. La misma reserva por REST (alternativa descartada)',
    reservarPorRest, { concurrencia: CONCURRENCIA, segundos: DURACION_S }),
};

const cpu = process.cpuUsage(cpuAntes);
const memDespues = process.memoryUsage().rss;
limpiarProductoDeCarga();

// --- veredicto --------------------------------------------------------------
const marca = (ok) => (ok ? 'CUMPLE' : 'NO CUMPLE');
console.log('\n--- comparacion con los objetivos declarados ---');
for (const [nombre, r] of Object.entries(resultados)) {
  console.log(`  ${nombre.padEnd(9)} p95 ${String(r.p95).padStart(7)} ms  ${marca(r.p95 < OBJETIVOS.p95Ms).padEnd(10)}` +
    `throughput ${String(r.throughput).padStart(8)} req/s  ${marca(r.throughput >= OBJETIVOS.throughput).padEnd(10)}` +
    `errores ${r.erroresPct}%  ${marca(r.erroresPct <= OBJETIVOS.erroresPct)}`);
}

const diferencia = ((resultados.rest.p95 - resultados.grpc.p95) / resultados.rest.p95) * 100;
console.log(`\n  gRPC vs REST en la misma operacion: p95 ${resultados.grpc.p95} ms contra ${resultados.rest.p95} ms ` +
  `(${diferencia >= 0 ? '-' : '+'}${Math.abs(diferencia).toFixed(1)}% para gRPC)`);
console.log(`  CPU del proceso de prueba: ${(cpu.user / 1000).toFixed(0)} ms usuario, ${(cpu.system / 1000).toFixed(0)} ms sistema`);
console.log(`  Memoria RSS del proceso de prueba: ${(memAntes / 1024 ** 2).toFixed(0)} MB -> ${(memDespues / 1024 ** 2).toFixed(0)} MB`);

console.log('\nNota: la medicion corre en la misma maquina que los servicios, asi que');
console.log('incluye el costo del propio generador de carga. Sirve para comparar los');
console.log('tres escenarios entre si, no como cifra de produccion.');
