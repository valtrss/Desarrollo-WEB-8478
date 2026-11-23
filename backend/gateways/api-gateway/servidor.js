// API Gateway (Modulo 5 y 6).
//
// Unica superficie publica del sistema. Es el unico proceso que escucha en una
// interfaz accesible desde fuera; todos los demas estan en 127.0.0.1.
//
// Responsabilidades:
//  1. publicar SOLO las rutas declaradas en rutas.js;
//  2. validar la sesion del usuario y su revocacion;
//  3. descartar cabeceras de identidad que venga inventando el navegador;
//  4. propagar identidad verificada y correlacion hacia el servicio destino;
//  5. aplicar limites de solicitudes y plazos maximos;
//  6. devolver errores controlados, sin filtrar detalles internos.
//
// Lo que NO hace: decidir si un pedido es de quien lo pide. Esa comprobacion
// pertenece al servicio dueno del dato y se hace alli otra vez.

import express from 'express';
import { randomUUID } from 'node:crypto';
import { RUTAS, DESTINOS, NO_PUBLICADAS } from './rutas.js';
import { verificar } from '../../shared/jwt.js';
import { obtenerSecreto, describirInventario } from '../../shared/secretos.js';
import { emitirIdentidadInterna, CABECERA } from '../../shared/identidad.js';
import { anotar, contexto, cabecera } from '../../shared/bitacora.js';

const NOMBRE = 'api-gateway';
const PUERTO = 8080;
const ORIGEN_FRONTEND = 'http://localhost:8081';
const PLAZO_MS = 5000;
const AUTH = DESTINOS.auth;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// --- CORS acotado al frontend propio ---------------------------------------
app.use((req, res, next) => {
  const origen = req.get('origin');
  if (origen === ORIGEN_FRONTEND) {
    res.set('access-control-allow-origin', origen);
    res.set('access-control-allow-headers', 'content-type, authorization, x-idempotency-key, x-signature');
    res.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.set('vary', 'origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// --- cabeceras de seguridad -------------------------------------------------
app.use((req, res, next) => {
  res.set('x-content-type-options', 'nosniff');
  res.set('x-frame-options', 'DENY');
  res.set('referrer-policy', 'no-referrer');
  next();
});

// --- frontera de confianza --------------------------------------------------
// Si el navegador manda una identidad interna, se descarta aqui mismo.
app.use((req, res, next) => {
  const intentoDeSuplantacion = Boolean(
    req.headers[CABECERA] || req.headers['x-user-id'] || req.headers['x-rol']
  );
  delete req.headers[CABECERA];
  delete req.headers['x-user-id'];
  delete req.headers['x-rol'];

  req.correlacion = randomUUID();
  res.set('x-correlation-id', req.correlacion);

  contexto.run({ correlacion: req.correlacion, servicio: NOMBRE }, () => {
    if (req.path !== '/health') {
      anotar(NOMBRE, 'PETICION', `${req.method} ${req.originalUrl}`, { origen: req.ip });
    }
    if (intentoDeSuplantacion) {
      anotar(NOMBRE, 'RECHAZO',
        'el navegador envió cabeceras de identidad interna: DESCARTADAS');
    }
    next();
  });
});

// --- limite de solicitudes por ruta e IP ------------------------------------
const contadores = new Map();
function dentroDelLimite(clave, limitePorMinuto) {
  const ahora = Date.now();
  const ventana = Math.floor(ahora / 60_000);
  const id = clave + '|' + ventana;
  const usado = (contadores.get(id) ?? 0) + 1;
  contadores.set(id, usado);
  if (contadores.size > 10_000) {
    for (const k of contadores.keys()) {
      if (!k.endsWith('|' + ventana)) contadores.delete(k);
    }
  }
  return usado <= limitePorMinuto;
}

// --- validacion de sesion ---------------------------------------------------
async function sesionDe(req) {
  const autorizacion = req.get('authorization') ?? '';
  if (!autorizacion.startsWith('Bearer ')) return null;

  // AuthenticationPolicy: valida la firma del token con la clave que entrega
  // el administrador de secretos.
  const payload = verificar(autorizacion.slice(7), obtenerSecreto('jwt-firma-usuario'));
  if (!payload) {
    anotar(NOMBRE, 'RECHAZO', 'token inválido, alterado o expirado',
      { politica: 'AuthenticationPolicy' });
    return null;
  }
  anotar(NOMBRE, 'AUTENTICA', 'firma HS256 del token verificada',
    { politica: 'AuthenticationPolicy', sub: payload.sub, rol: payload.rol });

  // Un token cerrado por el usuario ya no sirve, aunque no haya expirado.
  try {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), 1500);
    anotar(NOMBRE, 'LLAMA', 'consulta a auth-service si la sesión fue revocada',
      { destino: 'auth :4000', jti: String(payload.jti).slice(0, 8) });
    const respuesta = await fetch(`${AUTH}/internal/revocada/${payload.jti}`, {
      signal: control.signal,
      headers: {
        // La correlacion va tambien como cabecera, no solo dentro de la
        // identidad firmada: el servicio la lee al recibir la peticion, antes
        // de verificar la firma, y sin esto se inventaria un codigo nuevo y se
        // perderia el rastro de la llamada en el log de auth.
        'x-correlation-id': req.correlacion,
        [CABECERA]: emitirIdentidadInterna({
          usuarioId: payload.sub, rol: 'servicio',
          correlacion: req.correlacion, destino: 'auth',
        }),
      },
    });
    clearTimeout(temporizador);
    if (respuesta.ok) {
      const datos = await respuesta.json();
      if (datos.revocada) {
        anotar(NOMBRE, 'RECHAZO', 'auth-service responde: sesión REVOCADA');
        return null;
      }
      anotar(NOMBRE, 'AUTENTICA', 'auth-service responde: sesión vigente');
    }
  } catch {
    // Si auth no responde, se deja pasar el token firmado y vigente.
    // Se registra para auditoria; negarlo dejaria caer todo el sitio.
    anotar(NOMBRE, 'AVISO', 'auth-service no respondió: no se pudo comprobar revocación');
  }
  return {
    usuarioId: payload.sub, rol: payload.rol,
    nombre: payload.nombre, correo: payload.correo ?? null,
  };
}

function autorizado(acceso, sesion) {
  if (acceso === 'anonimo' || acceso === 'proveedor') return true;
  if (!sesion) return false;
  if (acceso === 'autenticado') return true;
  return Array.isArray(acceso) && acceso.includes(sesion.rol);
}

// --- registro de cada ruta declarada ----------------------------------------
for (const definicion of RUTAS) {
  const metodo = definicion.metodo.toLowerCase();

  app[metodo](definicion.externa, async (req, res) => {
    // RouteDefinition: la ruta existe en la tabla publicada.
    anotar(NOMBRE, 'RUTA', `${definicion.id} ${definicion.metodo} ${definicion.externa}`, {
      destino: definicion.destino,
      interna: definicion.interna,
      acceso: Array.isArray(definicion.acceso) ? definicion.acceso.join('|') : definicion.acceso,
    });

    const clave = `${definicion.id}|${req.ip}`;
    if (!dentroDelLimite(clave, definicion.limite)) {
      anotar(NOMBRE, 'RECHAZO', 'límite de solicitudes excedido',
        { ruta: definicion.id, tope: `${definicion.limite}/min`, resultado: '429' });
      return res.status(429).json({ error: 'limite_excedido', mensaje: 'Demasiadas solicitudes.' });
    }

    const sesion = await sesionDe(req);
    if (!autorizado(definicion.acceso, sesion)) {
      anotar(NOMBRE, 'RECHAZO',
        sesion ? 'AuthorizationPolicy: el rol no puede usar este verbo'
               : 'AuthenticationPolicy: operación protegida sin sesión',
        { rol: sesion?.rol ?? 'anonimo', resultado: sesion ? '403' : '401' });
      return res.status(sesion ? 403 : 401).json({
        error: sesion ? 'sin_permiso' : 'no_autenticado',
        mensaje: sesion
          ? 'Su perfil no tiene permiso para esta operacion.'
          : 'Debe iniciar sesion.',
      });
    }

    anotar(NOMBRE, 'AUTORIZA', 'AuthorizationPolicy: acceso permitido',
      { rol: sesion?.rol ?? 'anonimo' });

    // Reconstruye la ruta interna con los parametros de la externa.
    let rutaInterna = definicion.interna;
    for (const [parametro, valor] of Object.entries(req.params)) {
      rutaInterna = rutaInterna.replace(':' + parametro, encodeURIComponent(valor));
    }
    const consulta = new URL(req.originalUrl, 'http://local').search;
    const url = DESTINOS[definicion.destino] + rutaInterna + consulta;

    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), PLAZO_MS);
    const inicio = Date.now();

    try {
      const cabeceras = {
        'content-type': 'application/json',
        'x-correlation-id': req.correlacion,
        [CABECERA]: emitirIdentidadInterna({
          usuarioId: sesion?.usuarioId,
          rol: sesion?.rol ?? 'anonimo',
          correo: sesion?.correo,
          correlacion: req.correlacion,
          destino: definicion.destino,
        }),
      };
      // El webhook necesita que su firma e idempotencia lleguen intactas.
      if (definicion.acceso === 'proveedor') {
        if (req.get('x-signature')) cabeceras['x-signature'] = req.get('x-signature');
        if (req.get('x-idempotency-key')) cabeceras['x-idempotency-key'] = req.get('x-idempotency-key');
      }

      anotar(NOMBRE, 'ENRUTA', `hacia ${definicion.destino} → ${url}`,
        { identidad: 'firmada con «identidad-interna»', rol: sesion?.rol ?? 'anonimo' });

      const respuesta = await fetch(url, {
        method: definicion.metodo,
        signal: control.signal,
        headers: cabeceras,
        body: ['GET', 'DELETE'].includes(definicion.metodo) ? undefined : JSON.stringify(req.body ?? {}),
      });

      const texto = await respuesta.text();
      anotar(NOMBRE, 'RESPUESTA', `${respuesta.status} ${definicion.id} ${definicion.externa}`,
        { destino: definicion.destino, ms: Date.now() - inicio });

      res.status(respuesta.status);
      res.set('content-type', 'application/json');
      res.send(texto || '{}');
    } catch {
      anotar(NOMBRE, 'RECHAZO', 'el servicio de destino no respondió a tiempo',
        { destino: definicion.destino, plazoMs: PLAZO_MS, resultado: '504' });
      res.status(504).json({
        error: 'destino_no_disponible',
        mensaje: 'El servicio no respondio a tiempo.',
        correlacion: req.correlacion,
      });
    } finally {
      clearTimeout(temporizador);
    }
  });
}

// --- GraphQL: una sola ruta externa, muchas operaciones controladas ---------
// POST /graphql no autoriza por si mismo: el GraphQL Gateway vuelve a
// comprobar operacion, recurso y campo con la identidad que se le propaga.
app.post('/graphql', async (req, res) => {
  if (!dentroDelLimite('graphql|' + req.ip, 60)) {
    return res.status(429).json({ error: 'limite_excedido', mensaje: 'Demasiadas solicitudes.' });
  }
  const sesion = await sesionDe(req);
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), PLAZO_MS);

  try {
    const respuesta = await fetch('http://127.0.0.1:4100/graphql', {
      method: 'POST',
      signal: control.signal,
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': req.correlacion,
        [CABECERA]: emitirIdentidadInterna({
          usuarioId: sesion?.usuarioId,
          rol: sesion?.rol ?? 'anonimo',
          correo: sesion?.correo,
          correlacion: req.correlacion,
          destino: 'graphql-gateway',
        }),
      },
      body: JSON.stringify(req.body ?? {}),
    });
    const texto = await respuesta.text();
    res.status(respuesta.status).set('content-type', 'application/json').send(texto || '{}');
  } catch {
    res.status(504).json({ error: 'destino_no_disponible', mensaje: 'El servicio no respondio a tiempo.' });
  } finally {
    clearTimeout(temporizador);
  }
});

// --- utilidades publicas de diagnostico -------------------------------------
app.get('/health', (req, res) => res.json({ servicio: NOMBRE, estado: 'ok' }));

// Expone la tabla de rutas y el inventario de secretos SIN VALORES.
// Sirve de evidencia para los Modulos 5 y 6.
app.get('/api/v1/_rutas', (req, res) => {
  res.json({
    publicadas: RUTAS.map((r) => ({
      id: r.id, metodo: r.metodo, externa: r.externa,
      destino: r.destino, interna: r.interna, acceso: r.acceso, limitePorMinuto: r.limite,
    })),
    noPublicadas: NO_PUBLICADAS,
    secretos: describirInventario(),
  });
});

app.use((req, res) => {
  // Cualquier cosa fuera de la tabla no existe para el mundo exterior.
  res.status(404).json({ error: 'ruta_no_publicada', mensaje: 'Recurso no encontrado.' });
});

app.listen(PUERTO, () => {
  cabecera(NOMBRE, [
    `PUBLICO en http://localhost:${PUERTO}  ·  unica superficie expuesta`,
    `${RUTAS.length} rutas publicadas · ${NO_PUBLICADAS.length} rutas internas NO publicadas`,
    `valida sesion, rol y limite; firma la identidad interna y enruta`,
  ]);
});
