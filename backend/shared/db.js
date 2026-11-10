// Persistencia. Cada microservicio abre SU PROPIO archivo de base de datos.
//
// Modulo 3: cada servicio administra unicamente los datos bajo su autoridad.
// Aqui eso es literal: inventory no puede leer orders.db, porque nunca lo abre.
// La colaboracion entre servicios ocurre por contrato HTTP, nunca por la base.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CARPETA_DATOS = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

export function abrirBase(nombreServicio) {
  mkdirSync(CARPETA_DATOS, { recursive: true });
  const db = new DatabaseSync(join(CARPETA_DATOS, nombreServicio + '.db'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

// Helper para transacciones. Si la funcion lanza, se revierte todo.
export function enTransaccion(db, fn) {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
