// Genera los archivos de secretos para el entorno local.
//
// Crea valores aleatorios nuevos en backend/secrets/, que esta en .gitignore.
// Los valores NO se imprimen en pantalla ni quedan en el historial del shell.

import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INVENTARIO } from '../shared/secretos.js';

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), '..', 'secrets');
mkdirSync(CARPETA, { recursive: true });

const forzar = process.argv.includes('--rotar');
let creados = 0;
let conservados = 0;

for (const referencia of Object.keys(INVENTARIO)) {
  const ruta = join(CARPETA, referencia);
  if (existsSync(ruta) && !forzar) {
    conservados++;
    continue;
  }
  writeFileSync(ruta, randomBytes(48).toString('base64url'), { mode: 0o600 });
  chmodSync(ruta, 0o600);
  creados++;
}

// Deja un ejemplo versionable que documenta la referencia SIN el valor.
writeFileSync(
  join(CARPETA, 'README.example'),
  [
    'Cada archivo de esta carpeta contiene UN secreto, sin nombre de variable ni comillas.',
    'Los valores no se versionan: .gitignore excluye todo salvo los archivos .example.',
    '',
    'Referencias declaradas:',
    ...Object.entries(INVENTARIO).map(([r, d]) => `  ${r} -> ${d.finalidad} (consumidor: ${d.consumidor})`),
    '',
    'Rotacion: npm run secrets -- --rotar',
  ].join('\n')
);

console.log(`Secretos listos. Creados: ${creados}. Conservados: ${conservados}.`);
console.log('Los valores quedaron en backend/secrets/ con permisos 600 y no se imprimen.');
