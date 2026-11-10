// JWT HS256 minimo, construido con node:crypto. Sin dependencias externas.
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

function aBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function desdeBase64Url(texto) {
  return Buffer.from(texto, 'base64url');
}

function firmar(contenido, clave) {
  return aBase64Url(createHmac('sha256', clave).update(contenido).digest());
}

export function emitir(payload, clave, segundosDeVida) {
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = { ...payload, iat: ahora, exp: ahora + segundosDeVida, jti: randomUUID() };
  const cabecera = aBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const datos = cabecera + '.' + aBase64Url(JSON.stringify(cuerpo));
  return datos + '.' + firmar(datos, clave);
}

// Devuelve el payload, o null si el token es invalido, fue alterado o expiro.
// No lanza excepciones: quien llama decide el codigo de respuesta.
export function verificar(token, clave) {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;

  const datos = partes[0] + '.' + partes[1];
  const esperada = desdeBase64Url(firmar(datos, clave));
  const recibida = desdeBase64Url(partes[2]);
  if (esperada.length !== recibida.length) return null;
  if (!timingSafeEqual(esperada, recibida)) return null;

  let cuerpo;
  try {
    cuerpo = JSON.parse(desdeBase64Url(partes[1]).toString('utf8'));
  } catch {
    return null;
  }
  if (typeof cuerpo.exp !== 'number') return null;
  if (cuerpo.exp < Math.floor(Date.now() / 1000)) return null;
  return cuerpo;
}
