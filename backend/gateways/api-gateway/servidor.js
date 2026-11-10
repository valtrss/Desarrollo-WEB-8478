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
  delete req.headers[CABECERA];
  delete req.headers['x-user-id'];
  delete req.headers['x-rol'];
  req.correlacion = randomUUID();
  res.set('x-correlation-id', req.correlacion);
  next();
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
  const cabecera = req.get('authorization') ?? '';
  if (!cabecera.startsWith('Bearer ')) return null;

  const payload = verificar(cabecera.slice(7), obtenerSecreto('jwt-firma-usuario'));
  if (!payload) return null;

  // Un token cerrado por el usuario ya no sirve, aunque no haya expirado.
  try {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), 1500);
    const respuesta = await fetch(`${AUTH}/internal/revocada/${payload.jti}`, {
      signal: control.signal,
      headers: {
        [CABECERA]: emitirIdentidadInterna({
          usuarioId: payload.sub, rol: 'servicio',
          correlacion: req.correlacion, destino: 'auth',
        }),
      },
    });
    clearTimeout(temporizador);
    if (respuesta.ok) {
      const datos = await respuesta.json();
      if (datos.revocada) return null;
    }
  } catch {
    // Si auth no responde, se deja pasar el token firmado y vigente.
    // Se registra para auditoria; negarlo dejaria caer todo el sitio.
    console.warn(JSON.stringify({
      servicio: NOMBRE, correlacion: req.correlacion, evento: 'revocacion_no_verificable',
    }));
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
    const clave = `${definicion.id}|${req.ip}`;
    if (!dentroDelLimite(clave, definicion.limite)) {
      return res.status(429).json({ error: 'limite_excedido', mensaje: 'Demasiadas solicitudes.' });
    }

    const sesion = await sesionDe(req);
    if (!autorizado(definicion.acceso, sesion)) {
      return res.status(sesion ? 403 : 401).json({
        error: sesion ? 'sin_permiso' : 'no_autenticado',
        mensaje: sesion
          ? 'Su perfil no tiene permiso para esta operacion.'
          : 'Debe iniciar sesion.',
      });
    }

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

      const respuesta = await fetch(url, {
        method: definicion.metodo,
        signal: control.signal,
        headers: cabeceras,
        body: ['GET', 'DELETE'].includes(definicion.metodo) ? undefined : JSON.stringify(req.body ?? {}),
      });

      const texto = await respuesta.text();
      console.log(JSON.stringify({
        servicio: NOMBRE, correlacion: req.correlacion, servicioId: definicion.id,
        metodo: definicion.metodo, externa: definicion.externa,
        destino: definicion.destino, estado: respuesta.status, ms: Date.now() - inicio,
        rol: sesion?.rol ?? 'anonimo',
      }));

      res.status(respuesta.status);
      res.set('content-type', 'application/json');
      res.send(texto || '{}');
    } catch {
      console.error(JSON.stringify({
        servicio: NOMBRE, correlacion: req.correlacion, servicioId: definicion.id,
        evento: 'destino_no_disponible', destino: definicion.destino,
      }));
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
  console.log(`[${NOMBRE}] PUBLICO en http://localhost:${PUERTO}`);
  console.log(`[${NOMBRE}] ${RUTAS.length} rutas publicadas; ${NO_PUBLICADAS.length} internas no publicadas`);
});
