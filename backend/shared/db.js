// Persistencia. Cada microservicio abre SU PROPIO archivo de base de datos.
//
// Modulo 3: cada servicio administra unicamente los datos bajo su autoridad.
// Aqui eso es literal: inventory no puede leer orders.db, porque nunca lo abre.
// La colaboracion entre servicios ocurre por contrato HTTP, nunca por la base.
//
// Toda sentencia queda anotada en la bitacora con el identificador de
// correlacion de la peticion que la origino, para poder demostrar que la
// llamada llego hasta la base y que fila toco.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anotar } from './bitacora.js';

const CARPETA_DATOS = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

// Deja la sentencia en una linea y la recorta: en el video importa ver la
// operacion y la tabla, no el SQL entero.
function resumir(sql) {
  const limpio = String(sql).replace(/\s+/g, ' ').trim();
  return limpio.length > 96 ? limpio.slice(0, 93) + '...' : limpio;
}

function operacionYTabla(sql) {
  const limpio = String(sql).replace(/\s+/g, ' ').trim();
  const m = limpio.match(/^(SELECT|INSERT|UPDATE|DELETE)\b/i);
  const operacion = m ? m[1].toUpperCase() : 'SQL';
  const t = limpio.match(/\b(?:FROM|INTO|UPDATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  return { operacion, tabla: t ? t[1] : '—' };
}

function describirResultado(operacion, resultado) {
  if (operacion === 'SELECT') {
    if (Array.isArray(resultado)) return { filas: resultado.length };
    return { filas: resultado === undefined ? 0 : 1 };
  }
  if (resultado && typeof resultado === 'object' && 'changes' in resultado) {
    return { filasAfectadas: Number(resultado.changes) };
  }
  return {};
}

export function abrirBase(nombreServicio) {
  mkdirSync(CARPETA_DATOS, { recursive: true });
  const db = new DatabaseSync(join(CARPETA_DATOS, nombreServicio + '.db'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  const prepararOriginal = db.prepare.bind(db);
  const ejecutarOriginal = db.exec.bind(db);

  db.prepare = (sql) => {
    const sentencia = prepararOriginal(sql);
    const { operacion, tabla } = operacionYTabla(sql);

    const envolver = (nombreMetodo) => (...args) => {
      const inicio = performance.now();
      const resultado = sentencia[nombreMetodo](...args);
      anotar(nombreServicio, 'SQL',
        `${operacion} sobre ${tabla} · ${resumir(sql)}`,
        {
          base: `${nombreServicio}.db`,
          ...describirResultado(operacion, resultado),
          ms: (performance.now() - inicio).toFixed(1),
        });
      return resultado;
    };

    return {
      run: envolver('run'),
      get: envolver('get'),
      all: envolver('all'),
      iterate: (...a) => sentencia.iterate(...a),
      columns: () => sentencia.columns?.(),
      sourceSQL: sql,
    };
  };

  // Las transacciones y el DDL tambien se anotan, salvo los PRAGMA de arranque.
  db.exec = (sql) => {
    const limpio = String(sql).replace(/\s+/g, ' ').trim();
    const resultado = ejecutarOriginal(sql);
    if (!/^PRAGMA/i.test(limpio) && !/^CREATE|^ALTER/i.test(limpio)) {
      anotar(nombreServicio, 'SQL', limpio, { base: `${nombreServicio}.db` });
    }
    return resultado;
  };

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
