// Recorrido del guion en una terminal normal, en texto plano.
//
// Sirve cuando se quiere ver una ventana por servicio, cada una con su propia
// bitacora en color. Este script solo dispara las llamadas y narra que mirar.
//
//   node scripts/demostracion.js            con pausas
//   node scripts/demostracion.js --rapido   sin pausas
//
// Si lo que se busca es grabar el video con todo en una sola pantalla, use
// `npm run estudio`, que levanta los servicios y dibuja los cinco
// contenedores uno sobre otro.

import { PASOS, SITIO, sistemaResponde, API } from './guion.js';

const RAPIDO = process.argv.includes('--rapido');

const C = {
  reset: '\x1b[0m', negrita: '\x1b[1m', gris: '\x1b[90m',
  verde: '\x1b[32m', rojo: '\x1b[31m', amarillo: '\x1b[33m', cian: '\x1b[36m',
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const pausa = () => (RAPIDO ? Promise.resolve() : esperar(2600));

const MARCA = {
  ok: C.verde + '    ✓ ' + C.reset,
  no: C.rojo + '    ✗ ' + C.reset,
  nota: C.amarillo + '    · ' + C.reset,
};

if (!(await sistemaResponde())) {
  console.error('\nEl sistema no responde en ' + API);
  console.error('Levante los contenedores primero (npm start, o una ventana por servicio).\n');
  process.exit(1);
}

console.log('');
console.log(C.negrita + '  DEMOSTRACION — Pastas Frescas «La Nonna» · Caso 33' + C.reset);
console.log(C.gris + '  Cada paso deja rastro en la bitacora de uno o mas contenedores.' + C.reset);
console.log(C.gris + '  El codigo de correlacion (8 caracteres) es el mismo en todos.' + C.reset);

const estado = {};
let numero = 0;

for (const paso of PASOS) {
  numero += 1;
  console.log('');
  const relleno = '━'.repeat(Math.max(0, 56 - paso.titulo.length));
  console.log(C.negrita + C.cian + `━━━ PASO ${numero} · ${paso.titulo} ` + relleno + C.reset);
  for (const l of paso.mirar) console.log(C.gris + '    mirar → ' + C.reset + l);
  console.log('');

  const resultados = await paso.ejecutar(estado);
  for (const r of resultados) console.log((MARCA[r.tipo] ?? '      ') + r.texto);

  await pausa();
}

console.log('');
console.log(C.negrita + '  Fin del recorrido.' + C.reset);
console.log(C.gris + '  Para el punto 1 (frontend), abra ' + SITIO + ' con la pestana' + C.reset);
console.log(C.gris + '  Red del inspector abierta y repita el flujo desde la interfaz.' + C.reset);
console.log('');
