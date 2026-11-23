// Identidad verificada entre el gateway y los servicios privados.
//
// Modulo 5: "Los servicios internos deben rechazar llamadas no autorizadas y
// conservar las comprobaciones de negocio y propiedad."
//
// El navegador NUNCA puede fabricar esta identidad: va firmada con el secreto
// "identidad-interna", que solo conocen el gateway y los servicios. El gateway
// descarta cualquier cabecera x-identidad-interna que venga del navegador.

import { emitir, verificar } from './jwt.js';
import { obtenerSecreto } from './secretos.js';
import { fallar } from './http.js';
import { anotar } from './bitacora.js';

export const CABECERA = 'x-identidad-interna';

// Lo usa el API Gateway al reenviar una solicitud hacia un servicio privado.
export function emitirIdentidadInterna({ usuarioId, rol, correo, correlacion, destino }) {
  return emitir(
    {
      sub: usuarioId ?? null,
      rol: rol ?? 'anonimo',
      // Correo de contacto de un invitado. No identifica una cuenta: es el
      // destinatario de la boleta y nada mas.
      correo: correo ?? null,
      correlacion,
      aud: destino,
    },
    obtenerSecreto('identidad-interna'),
    60 // vida corta: solo tiene que durar el salto gateway -> servicio
  );
}

// Middleware para los servicios privados.
// nombreServicio debe coincidir con el "aud" que puso el gateway.
export function exigirIdentidadInterna(nombreServicio) {
  return (req, res, next) => {
    const token = req.get(CABECERA);

    if (!token) {
      anotar(nombreServicio, 'RECHAZO',
        'llamada SIN identidad interna: no pasó por el gateway',
        { origen: req.ip, resultado: '401' });
      return fallar(401, 'sin_identidad_interna',
        'Este servicio solo acepta llamadas del gateway.');
    }

    // Aqui es donde el backend verifica el secreto: comprueba que la identidad
    // viene firmada con «identidad-interna», que solo conoce el gateway.
    const payload = verificar(token, obtenerSecreto('identidad-interna'));

    if (!payload) {
      anotar(nombreServicio, 'RECHAZO',
        'identidad interna con firma inválida o expirada',
        { secreto: 'identidad-interna', resultado: '401' });
      return fallar(401, 'identidad_invalida', 'Identidad interna invalida o expirada.');
    }
    if (payload.aud !== nombreServicio) {
      anotar(nombreServicio, 'RECHAZO',
        'identidad emitida para otro servicio',
        { aud: payload.aud, esperado: nombreServicio, resultado: '403' });
      return fallar(403, 'identidad_para_otro_servicio',
        'La identidad fue emitida para otro servicio.');
    }

    anotar(nombreServicio, 'IDENTIDAD',
      'firma verificada con «identidad-interna» → ACEPTADA',
      { sub: payload.sub ?? 'anonimo', rol: payload.rol, aud: payload.aud });
    req.identidad = {
      usuarioId: payload.sub, rol: payload.rol, aud: payload.aud,
      correo: payload.correo ?? null, correlacion: payload.correlacion,
    };
    next();
  };
}

// Autorizacion por rol dentro del servicio.
export function exigirRol(...rolesPermitidos) {
  return (req, res, next) => {
    const rol = req.identidad?.rol;
    const servicio = req.identidad?.aud ?? 'servicio';

    if (!rol || rol === 'anonimo') {
      anotar(servicio, 'RECHAZO', 'operación protegida sin sesión', { resultado: '401' });
      return fallar(401, 'no_autenticado', 'Debe iniciar sesion.');
    }
    if (!rolesPermitidos.includes(rol)) {
      anotar(servicio, 'RECHAZO', 'rol sin permiso para esta operación',
        { rol, permitidos: rolesPermitidos.join('|'), resultado: '403' });
      return fallar(403, 'sin_permiso', 'Su perfil no tiene permiso para esta operacion.');
    }
    anotar(servicio, 'AUTORIZA', 'rol habilitado para la operación',
      { rol, permitidos: rolesPermitidos.join('|') });
    next();
  };
}

// Cliente HTTP para llamadas entre servicios privados.
// Propaga identidad y correlacion, y aplica un plazo maximo.
export async function llamarServicio(url, { metodo = 'GET', cuerpo, identidad, destino, plazoMs = 3000 } = {}) {
  const quien = identidad?.aud ?? 'servicio';
  anotar(quien, 'LLAMA', `${metodo} ${url}`, { destino, plazoMs });
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), plazoMs);
  try {
    const respuesta = await fetch(url, {
      method: metodo,
      signal: control.signal,
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': identidad?.correlacion ?? '',
        [CABECERA]: emitirIdentidadInterna({
          usuarioId: identidad?.usuarioId,
          rol: identidad?.rol ?? 'servicio',
          correo: identidad?.correo,
          correlacion: identidad?.correlacion,
          destino,
        }),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await respuesta.text();
    const datos = texto ? JSON.parse(texto) : null;
    return { ok: respuesta.ok, estado: respuesta.status, datos };
  } catch (error) {
    // Modulo 3: el fallo de comunicacion es parte del diseno, no un imprevisto.
    return { ok: false, estado: 503, datos: { error: 'dependencia_no_disponible', mensaje: error.message } };
  } finally {
    clearTimeout(temporizador);
  }
}
