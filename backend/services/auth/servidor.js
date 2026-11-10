// Servicio privado: auth-service
//
// Unico emisor de sesiones del sistema (RF12). No almacena contrasenas:
// le pide a clients, que es el custodio, que verifique la credencial.
// Servicios del Modulo 1: S11, S12.

import { randomUUID } from 'node:crypto';
import { abrirBase } from '../../shared/db.js';
import { crearApp, montarManejadorDeErrores, escucharPrivado, ruta, fallar } from '../../shared/http.js';
import { exigirIdentidadInterna, llamarServicio } from '../../shared/identidad.js';
import { emitir, verificar } from '../../shared/jwt.js';
import { obtenerSecreto } from '../../shared/secretos.js';
import { exigirCorreo, exigirTexto } from '../../shared/validacion.js';

const NOMBRE = 'auth';
const PUERTO = 4000;
const CLIENTS = 'http://127.0.0.1:4001';
const VIDA_SESION_SEGUNDOS = 900;            // 15 minutos para una cuenta
const VIDA_SESION_INVITADO_SEGUNDOS = 3600; // 1 hora para completar una compra sin cuenta

const db = abrirBase(NOMBRE);
const app = crearApp(NOMBRE);
app.use(exigirIdentidadInterna(NOMBRE));

// ---------------------------------------------------------------------------
// S11 Iniciar sesion
// ---------------------------------------------------------------------------
app.post('/auth/login', ruta(async (req, res) => {
  const correo = exigirCorreo(req.body?.correo);
  const password = exigirTexto(req.body?.password, 'password', { min: 1, max: 128 });

  const respuesta = await llamarServicio(CLIENTS + '/internal/credenciales/verificar', {
    metodo: 'POST',
    cuerpo: { correo, password },
    identidad: { rol: 'servicio', correlacion: req.identidad.correlacion },
    destino: 'clients',
  });

  if (respuesta.estado === 429) {
    fallar(429, 'demasiados_intentos', 'Demasiados intentos. Intente nuevamente en unos minutos.');
  }
  if (!respuesta.ok) {
    // Mismo mensaje para correo inexistente y clave incorrecta.
    fallar(401, 'credenciales_invalidas', 'Correo o contrasena incorrectos.');
  }

  const cuenta = respuesta.datos;
  if (cuenta.estadoVerificacion !== 'verificado') {
    fallar(403, 'correo_no_verificado',
      'Debe confirmar su correo antes de iniciar sesion.');
  }

  const accessToken = emitir(
    { sub: cuenta.id, rol: cuenta.rol, nombre: cuenta.nombre },
    obtenerSecreto('jwt-firma-usuario'),
    VIDA_SESION_SEGUNDOS
  );

  res.json({
    accessToken,
    expiraEn: VIDA_SESION_SEGUNDOS,
    perfil: { id: cuenta.id, nombre: cuenta.nombre, rol: cuenta.rol },
  });
}));

// ---------------------------------------------------------------------------
// S32 Sesion de invitado
//
// Permite comprar entregando solo un correo de contacto, sin crear cuenta.
//
// Decision de seguridad: el identificador del invitado es ALEATORIO y nuevo en
// cada sesion. No se busca ni se crea ninguna cuenta a partir del correo, asi
// que escribir el correo de otra persona no da acceso a su historial: el
// invitado solo ve los pedidos que hizo en esta misma sesion. El correo viaja
// como dato de contacto para la boleta, no como identidad.
// ---------------------------------------------------------------------------
app.post('/auth/invitado', ruta((req, res) => {
  const correo = exigirCorreo(req.body?.correo);

  const accessToken = emitir(
    { sub: 'inv_' + randomUUID(), rol: 'invitado', nombre: 'Invitado', correo },
    obtenerSecreto('jwt-firma-usuario'),
    VIDA_SESION_INVITADO_SEGUNDOS
  );

  res.status(201).json({
    accessToken,
    expiraEn: VIDA_SESION_INVITADO_SEGUNDOS,
    perfil: { id: null, nombre: 'Invitado', rol: 'invitado', correo },
  });
}));

// ---------------------------------------------------------------------------
// S12 Cerrar sesion: revoca el token por su jti hasta que expire
// ---------------------------------------------------------------------------
app.post('/auth/logout', ruta((req, res) => {
  const token = exigirTexto(req.body?.accessToken, 'accessToken', { min: 10, max: 4096 });
  const payload = verificar(token, obtenerSecreto('jwt-firma-usuario'));
  if (!payload) {
    // Un token ya invalido no es un error para quien cierra sesion.
    return res.json({ estado: 'sesion_cerrada' });
  }
  db.prepare(
    'INSERT OR IGNORE INTO sesiones_revocadas (jti, usuario_id, expira_en, revocado_en) VALUES (?,?,?,?)'
  ).run(payload.jti, payload.sub, payload.exp, new Date().toISOString());

  res.json({ estado: 'sesion_cerrada' });
}));

// ---------------------------------------------------------------------------
// Interno: el gateway consulta si un jti fue revocado antes de dejar pasar.
// ---------------------------------------------------------------------------
app.get('/internal/revocada/:jti', ruta((req, res) => {
  const fila = db.prepare('SELECT 1 AS existe FROM sesiones_revocadas WHERE jti = ?').get(req.params.jti);
  res.json({ revocada: Boolean(fila) });
}));

// Purga periodica de tokens ya expirados: no aportan nada despues de su exp.
setInterval(() => {
  db.prepare('DELETE FROM sesiones_revocadas WHERE expira_en < ?').run(Math.floor(Date.now() / 1000));
}, 60_000).unref();

montarManejadorDeErrores(app, NOMBRE);
escucharPrivado(app, PUERTO, NOMBRE);
