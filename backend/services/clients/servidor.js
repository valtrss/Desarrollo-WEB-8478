// Microservicio privado: clients
//
// Autoridad sobre: cuentas, credenciales y estado de verificacion.
// Servicios del Modulo 1: S09, S10, S13, S14, S15.
// Requisitos: RF5, RF6, RF10, RF11.

import { randomUUID, randomBytes } from 'node:crypto';
import { abrirBase } from '../../shared/db.js';
import { crearApp, montarManejadorDeErrores, escucharPrivado, ruta, fallar } from '../../shared/http.js';
import { exigirIdentidadInterna, exigirRol } from '../../shared/identidad.js';
import { hashearClave, verificarClave } from '../../shared/clave.js';
import {
  exigirTexto, exigirCorreo, exigirRun, exigirFechaIso, exigirUnoDe, edadEnAnios,
} from '../../shared/validacion.js';

const NOMBRE = 'clients';
const PUERTO = 4001;

const db = abrirBase(NOMBRE);
const app = crearApp(NOMBRE);

// Toda ruta exige identidad emitida por el gateway. Un navegador que apunte
// directo a 127.0.0.1:4001 no tiene como fabricarla.
app.use(exigirIdentidadInterna(NOMBRE));

const ahora = () => new Date().toISOString();

// Representacion publica de un cliente: lo minimo necesario.
// Nunca devuelve clave_hash, y el RUN solo sale enmascarado.
function aDto(fila, { incluirDatosPersonales = false } = {}) {
  const base = {
    id: fila.id,
    nombreCompleto: fila.nombre_completo,
    correo: fila.correo,
    rol: fila.rol,
    estadoVerificacion: fila.estado_verificacion,
  };
  if (!incluirDatosPersonales) return base;
  return {
    ...base,
    run: fila.run.slice(0, 2) + '.***.***-' + fila.run.slice(-1),
    telefono: fila.telefono,
    direccion: fila.direccion,
    comuna: fila.comuna,
    provincia: fila.provincia,
    region: fila.region,
  };
}

// ---------------------------------------------------------------------------
// S09 Registrar cliente (RF5, RF6, RF11)
// ---------------------------------------------------------------------------
app.post('/clients', ruta((req, res) => {
  const cuerpo = req.body ?? {};

  const run = exigirRun(cuerpo.run);
  const nombreCompleto = exigirTexto(cuerpo.nombreCompleto, 'nombreCompleto', { min: 3, max: 120 });
  const correo = exigirCorreo(cuerpo.correo);
  const password = exigirTexto(cuerpo.password, 'password', { min: 10, max: 128 });
  const telefono = exigirTexto(cuerpo.telefono, 'telefono', { min: 8, max: 20 });
  const direccion = exigirTexto(cuerpo.direccion, 'direccion', { min: 5, max: 160 });
  const comuna = exigirTexto(cuerpo.comuna, 'comuna', { max: 80 });
  const provincia = exigirTexto(cuerpo.provincia, 'provincia', { max: 80 });
  const region = exigirTexto(cuerpo.region, 'region', { max: 80 });
  const fechaNacimiento = exigirFechaIso(cuerpo.fechaNacimiento, 'fechaNacimiento');
  const sexo = cuerpo.sexo ? exigirUnoDe(cuerpo.sexo, 'sexo', ['F', 'M', 'otro']) : null;

  if (edadEnAnios(fechaNacimiento) < 18) {
    fallar(422, 'menor_de_edad', 'El titular de la cuenta debe ser mayor de 18 anios.');
  }

  // RF6: el administrador puede registrar desde el local y asignar perfil.
  // Un visitante anonimo solo puede crearse a si mismo como cliente.
  const rolSolicitado = cuerpo.rol ?? 'cliente';
  if (rolSolicitado !== 'cliente' && req.identidad.rol !== 'administrador') {
    fallar(403, 'sin_permiso', 'Solo un administrador puede crear cuentas con otro perfil.');
  }

  const duplicado = db.prepare(
    'SELECT 1 FROM clientes WHERE run = ? OR correo = ?'
  ).get(run, correo);
  if (duplicado) {
    // Mensaje unico: no revela cual de los dos ya existe.
    fallar(409, 'cuenta_existente', 'Ya existe una cuenta con esos datos.');
  }

  const id = 'cli_' + randomUUID().slice(0, 8);
  const tokenVerificacion = randomBytes(24).toString('base64url');
  const momento = ahora();

  db.prepare(`
    INSERT INTO clientes (id, run, nombre_completo, correo, clave_hash, telefono,
      direccion, comuna, provincia, region, fecha_nacimiento, sexo, rol,
      estado_verificacion, token_verificacion, creado_en, actualizado_en)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, run, nombreCompleto, correo, hashearClave(password), telefono,
    direccion, comuna, provincia, region, fechaNacimiento, sexo, rolSolicitado,
    'pendiente_verificacion', tokenVerificacion, momento, momento
  );

  // RF11: aqui se solicita al proveedor de correo que confirme la casilla.
  // El adaptador de prueba conserva el contrato sin enviar correo real.
  console.log(JSON.stringify({
    servicio: NOMBRE, correlacion: req.identidad.correlacion,
    evento: 'solicitud_verificacion_correo', clienteId: id,
  }));

  res.status(201).json({
    ...aDto({ id, nombre_completo: nombreCompleto, correo, rol: rolSolicitado,
              estado_verificacion: 'pendiente_verificacion' }),
    // En un entorno real este token viaja solo por correo. Se expone aqui
    // porque el adaptador de prueba reemplaza al proveedor.
    tokenVerificacionPrueba: tokenVerificacion,
  });
}));

// ---------------------------------------------------------------------------
// S10 Confirmar correo (RF11)
// ---------------------------------------------------------------------------
app.post('/clients/verify-email', ruta((req, res) => {
  const token = exigirTexto(req.body?.token, 'token', { min: 10, max: 120 });
  const fila = db.prepare('SELECT * FROM clientes WHERE token_verificacion = ?').get(token);
  if (!fila) fallar(400, 'token_invalido', 'El enlace de verificacion no es valido o ya fue usado.');

  db.prepare(
    'UPDATE clientes SET estado_verificacion = ?, token_verificacion = NULL, actualizado_en = ? WHERE id = ?'
  ).run('verificado', ahora(), fila.id);

  res.json({ id: fila.id, estadoVerificacion: 'verificado' });
}));

// ---------------------------------------------------------------------------
// S13 Consultar mi perfil
// ---------------------------------------------------------------------------
app.get('/clients/me', exigirRol('cliente', 'administrador', 'cajero', 'despacho', 'dueno'),
  ruta((req, res) => {
    const fila = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.identidad.usuarioId);
    if (!fila) fallar(404, 'no_encontrado', 'La cuenta no existe.');
    res.json(aDto(fila, { incluirDatosPersonales: true }));
  }));

// ---------------------------------------------------------------------------
// S14 Actualizar mi perfil
// ---------------------------------------------------------------------------
app.put('/clients/me', exigirRol('cliente', 'administrador', 'cajero', 'despacho', 'dueno'),
  ruta((req, res) => {
    const fila = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.identidad.usuarioId);
    if (!fila) fallar(404, 'no_encontrado', 'La cuenta no existe.');

    const cuerpo = req.body ?? {};
    const direccion = exigirTexto(cuerpo.direccion ?? fila.direccion, 'direccion', { min: 5, max: 160 });
    const comuna = exigirTexto(cuerpo.comuna ?? fila.comuna, 'comuna', { max: 80 });
    const telefono = exigirTexto(cuerpo.telefono ?? fila.telefono, 'telefono', { min: 8, max: 20 });

    // El RUN, el correo y el rol NO se modifican por esta via: cambiarlos
    // requiere verificacion aparte o intervencion del administrador.
    db.prepare(
      'UPDATE clientes SET direccion = ?, comuna = ?, telefono = ?, actualizado_en = ? WHERE id = ?'
    ).run(direccion, comuna, telefono, ahora(), fila.id);

    const actualizado = db.prepare('SELECT * FROM clientes WHERE id = ?').get(fila.id);
    res.json(aDto(actualizado, { incluirDatosPersonales: true }));
  }));

// ---------------------------------------------------------------------------
// S15 Listar clientes (RF10, solo administrador)
// ---------------------------------------------------------------------------
app.get('/clients', exigirRol('administrador'), ruta((req, res) => {
  const filas = db.prepare(
    'SELECT * FROM clientes ORDER BY creado_en DESC LIMIT 100'
  ).all();
  res.json({ data: filas.map((f) => aDto(f, { incluirDatosPersonales: true })) });
}));

// ---------------------------------------------------------------------------
// Interno: verificacion de credenciales. Lo llama auth-service, nadie mas.
// clients es la autoridad sobre la credencial, asi que la comprobacion vive aqui.
// ---------------------------------------------------------------------------
app.post('/internal/credenciales/verificar', ruta((req, res) => {
  if (req.identidad.rol !== 'servicio') {
    fallar(403, 'sin_permiso', 'Operacion reservada a servicios internos.');
  }
  const correo = exigirCorreo(req.body?.correo);
  const password = exigirTexto(req.body?.password, 'password', { min: 1, max: 128 });

  const desde = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const fallidos = db.prepare(
    "SELECT COUNT(*) AS n FROM intentos_login WHERE correo = ? AND resultado = 'fallo' AND momento > ?"
  ).get(correo, desde).n;

  if (fallidos >= 5) {
    db.prepare('INSERT INTO intentos_login (correo, momento, resultado) VALUES (?,?,?)')
      .run(correo, ahora(), 'fallo');
    fallar(429, 'demasiados_intentos', 'Demasiados intentos. Intente nuevamente en unos minutos.');
  }

  const fila = db.prepare('SELECT * FROM clientes WHERE correo = ?').get(correo);
  const valida = fila ? verificarClave(password, fila.clave_hash) : false;

  db.prepare('INSERT INTO intentos_login (correo, momento, resultado) VALUES (?,?,?)')
    .run(correo, ahora(), valida ? 'exito' : 'fallo');

  // Respuesta identica para "no existe" y "clave incorrecta":
  // asi no se puede enumerar que correos estan registrados.
  if (!valida) {
    return res.status(401).json({ error: 'credenciales_invalidas' });
  }
  res.json({
    id: fila.id,
    nombre: fila.nombre_completo.split(' ')[0],
    rol: fila.rol,
    estadoVerificacion: fila.estado_verificacion,
  });
}));

// Interno: datos minimos de un cliente para otros servicios (boleta, GraphQL).
app.get('/internal/clients/:id', ruta((req, res) => {
  if (!['servicio', 'administrador'].includes(req.identidad.rol)) {
    fallar(403, 'sin_permiso', 'Operacion reservada a servicios internos.');
  }
  const fila = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!fila) fallar(404, 'no_encontrado', 'La cuenta no existe.');
  res.json({
    id: fila.id,
    nombre: fila.nombre_completo,
    correo: fila.correo,
    comuna: fila.comuna,
    direccion: fila.direccion,
  });
}));

montarManejadorDeErrores(app, NOMBRE);
escucharPrivado(app, PUERTO, NOMBRE);
