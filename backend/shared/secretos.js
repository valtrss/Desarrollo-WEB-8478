// Administrador de secretos.
//
// Regla del Modulo 6: el codigo y el informe solo conocen REFERENCIAS SIMBOLICAS
// (por ejemplo "jwt-firma-usuario"). El valor vive en un archivo fuera del
// repositorio, en backend/secrets/, que esta en .gitignore.
//
// Un valor nunca se imprime, nunca viaja al navegador y nunca se escribe en logs.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), '..', 'secrets');
const cache = new Map();

// Inventario declarado. Cada referencia dice quien la emite, quien la consume,
// para que sirve y como se rota. Esta tabla es la que va en el informe.
export const INVENTARIO = {
  'jwt-firma-usuario': {
    tipo: 'clave simetrica HS256',
    emisor: 'auth-service',
    consumidor: 'auth-service, api-gateway',
    finalidad: 'firmar y validar el token de sesion del usuario',
    alcance: 'solo tokens de sesion; no sirve para llamadas entre servicios',
    rotacion: 'cada 90 dias o ante incidente, con periodo de gracia de 15 minutos',
  },
  'identidad-interna': {
    tipo: 'clave simetrica HS256',
    emisor: 'api-gateway',
    consumidor: 'api-gateway y microservicios privados',
    finalidad: 'propagar identidad verificada desde el gateway hacia los servicios internos',
    alcance: 'red privada; un token interno no es valido como sesion de usuario',
    rotacion: 'cada 30 dias; los servicios aceptan la clave anterior durante 10 minutos',
  },
  'pagos-webhook': {
    tipo: 'secreto compartido HMAC',
    emisor: 'proveedor de pagos',
    consumidor: 'payments',
    finalidad: 'verificar la firma de la notificacion de pago',
    alcance: 'solo verificacion de firma entrante; no autoriza cobrar',
    rotacion: 'la define el proveedor; revocacion inmediata ante filtracion',
  },
  'correo-api': {
    tipo: 'credencial de servicio',
    emisor: 'proveedor de correo',
    consumidor: 'clients (verificacion RF11) y payments (boletas RF8)',
    finalidad: 'validar casillas y enviar boletas',
    alcance: 'permisos minimos de envio y validacion, sin acceso a la bandeja',
    rotacion: 'cada 180 dias',
  },
};

export function obtenerSecreto(referencia) {
  if (!INVENTARIO[referencia]) {
    throw new Error(`Referencia de secreto no declarada en el inventario: ${referencia}`);
  }
  if (cache.has(referencia)) return cache.get(referencia);

  const ruta = join(CARPETA, referencia);
  if (!existsSync(ruta)) {
    throw new Error(`Falta el secreto "${referencia}". Ejecute: npm run secrets`);
  }
  const valor = readFileSync(ruta, 'utf8').trim();
  if (!valor) throw new Error(`El secreto "${referencia}" esta vacio.`);
  cache.set(referencia, valor);
  return valor;
}

// Para el informe y para /health: lista las referencias SIN los valores.
export function describirInventario() {
  return Object.entries(INVENTARIO).map(([referencia, datos]) => ({ referencia, ...datos }));
}
