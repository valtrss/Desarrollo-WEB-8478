// Hash adaptativo con sal para contrasenas (Modulo 7).
//
// scrypt viene incluido en node:crypto. El hash es irreversible por diseno:
// NO se cifra la contrasena, porque cifrar implica poder descifrar.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Parametros de costo. Subirlos encarece el ataque por fuerza bruta.
const COSTO = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LARGO_HASH = 32;

export function hashearClave(claroTexto) {
  const sal = randomBytes(16);
  const hash = scryptSync(claroTexto, sal, LARGO_HASH, COSTO);
  return ['scrypt', COSTO.N, COSTO.r, COSTO.p, sal.toString('hex'), hash.toString('hex')].join('$');
}

export function verificarClave(claroTexto, almacenado) {
  try {
    const [algoritmo, n, r, p, salHex, hashHex] = String(almacenado).split('$');
    if (algoritmo !== 'scrypt') return false;

    const sal = Buffer.from(salHex, 'hex');
    const esperado = Buffer.from(hashHex, 'hex');
    const calculado = scryptSync(claroTexto, sal, esperado.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqual(esperado, calculado);
  } catch {
    return false;
  }
}
