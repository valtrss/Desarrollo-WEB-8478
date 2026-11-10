// Arranque reproducible de todo el sistema.
//
// Equivale al "docker compose up" que pide el Modulo 10, pero sin contenedores:
// un proceso por servicio, con la separacion publica/privada hecha por binding.
//
//   publico  -> api-gateway en 0.0.0.0:8080 y el sitio estatico en 8081
//   privado  -> todo lo demas en 127.0.0.1
//
// Ctrl+C detiene todo el conjunto.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const PROCESOS = [
  { nombre: 'clients',         archivo: 'services/clients/servidor.js',          puerto: 4001, visibilidad: 'privado' },
  { nombre: 'auth',            archivo: 'services/auth/servidor.js',             puerto: 4000, visibilidad: 'privado' },
  { nombre: 'inventory',       archivo: 'services/inventory/servidor.js',        puerto: 4002, visibilidad: 'privado (+ gRPC 50051)' },
  { nombre: 'orders',          archivo: 'services/orders/servidor.js',           puerto: 4003, visibilidad: 'privado' },
  { nombre: 'payments',        archivo: 'services/payments/servidor.js',         puerto: 4004, visibilidad: 'privado' },
  { nombre: 'analytics',       archivo: 'services/analytics/servidor.js',        puerto: 4005, visibilidad: 'privado' },
  { nombre: 'graphql-gateway', archivo: 'gateways/graphql-gateway/servidor.js',  puerto: 4100, visibilidad: 'privado' },
  { nombre: 'api-gateway',     archivo: 'gateways/api-gateway/servidor.js',      puerto: 8080, visibilidad: 'PUBLICO' },
  { nombre: 'frontend',        archivo: 'scripts/servir-frontend.js',            puerto: 8081, visibilidad: 'PUBLICO' },
];

const hijos = [];
let deteniendo = false;

function arrancar(definicion) {
  const hijo = spawn(process.execPath, [join(RAIZ, definicion.archivo)], {
    cwd: RAIZ,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  const etiquetar = (flujo, destino) => {
    flujo.setEncoding('utf8');
    flujo.on('data', (texto) => {
      for (const linea of texto.split('\n')) {
        if (linea.trim()) destino.write(`[${definicion.nombre}] ${linea}\n`);
      }
    });
  };
  etiquetar(hijo.stdout, process.stdout);
  etiquetar(hijo.stderr, process.stderr);

  hijo.on('exit', (codigo) => {
    if (deteniendo) return;
    console.error(`[arranque] ${definicion.nombre} termino con codigo ${codigo}`);
  });

  hijos.push({ ...definicion, proceso: hijo });
}

function detenerTodo() {
  if (deteniendo) return;
  deteniendo = true;
  console.log('\n[arranque] deteniendo servicios...');
  for (const h of hijos) h.proceso.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', detenerTodo);
process.on('SIGTERM', detenerTodo);

console.log('Levantando La Nonna\n');
for (const definicion of PROCESOS) {
  arrancar(definicion);
}

// Comprobacion de salud: avisa cuando el conjunto esta arriba.
setTimeout(async () => {
  console.log('\n--- estado de los servicios ---');
  for (const definicion of PROCESOS) {
    if (definicion.nombre === 'frontend') continue;
    const anfitrion = definicion.visibilidad === 'PUBLICO' ? 'localhost' : '127.0.0.1';
    try {
      const respuesta = await fetch(`http://${anfitrion}:${definicion.puerto}/health`);
      console.log(`  ${respuesta.ok ? 'OK  ' : 'FALLA'} ${definicion.nombre.padEnd(16)} ${definicion.puerto}  ${definicion.visibilidad}`);
    } catch {
      console.log(`  FALLA ${definicion.nombre.padEnd(16)} ${definicion.puerto}  ${definicion.visibilidad}`);
    }
  }
  console.log('\n  Sitio:    http://localhost:8081');
  console.log('  API:      http://localhost:8080/api/v1/products');
  console.log('  Rutas:    http://localhost:8080/api/v1/_rutas');
  console.log('\n  Ctrl+C para detener todo.\n');
}, 1800);
