// Crea el esquema de cada microservicio.
//
// Cada servicio tiene su propio archivo esquema.sql y su propia base.
// Ejecutar este script varias veces es seguro: todo usa IF NOT EXISTS.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBase } from '../shared/db.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVICIOS = ['auth', 'clients', 'inventory', 'orders', 'payments', 'analytics'];

for (const servicio of SERVICIOS) {
  const ruta = join(RAIZ, 'services', servicio, 'esquema.sql');
  if (!existsSync(ruta)) {
    console.warn(`  - ${servicio}: sin esquema.sql, se omite`);
    continue;
  }
  const db = abrirBase(servicio);
  db.exec(readFileSync(ruta, 'utf8'));

  const tablas = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map((f) => f.name);

  db.close();
  console.log(`  + ${servicio}: ${tablas.length} tablas (${tablas.join(', ')})`);
}

// Columnas agregadas despues de la primera version. SQLite no tiene
// "ADD COLUMN IF NOT EXISTS", asi que se intenta y se ignora si ya esta.
const AGREGADAS = [
  ['orders', 'ALTER TABLE pedidos ADD COLUMN descuento INTEGER NOT NULL DEFAULT 0'],
  ['orders', 'ALTER TABLE pedidos ADD COLUMN correo_contacto TEXT'],
  ['orders', "ALTER TABLE comunas_despacho ADD COLUMN region TEXT NOT NULL DEFAULT 'Metropolitana'"],
  ['payments', 'ALTER TABLE pagos ADD COLUMN correo_contacto TEXT'],
];

for (const [servicio, sentencia] of AGREGADAS) {
  const db = abrirBase(servicio);
  try {
    db.exec(sentencia);
    console.log(`  ~ ${servicio}: ${sentencia.split(' ADD COLUMN ')[1]}`);
  } catch (error) {
    if (!String(error.message).includes('duplicate column')) throw error;
  }
  db.close();
}

console.log('\nEsquemas creados en backend/data/, una base por servicio.');
