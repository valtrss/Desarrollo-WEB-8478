// Utilidades comunes de HTTP: errores controlados, logs con identificador de
// correlacion y sin secretos, y arranque de un servicio privado.

import express from 'express';
import { randomUUID } from 'node:crypto';

// Error de negocio con codigo HTTP. Lo que llega al cliente es el mensaje,
// nunca el stack ni el detalle interno.
export class ErrorHttp extends Error {
  constructor(estado, codigo, mensaje, detalle) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

export const fallar = (estado, codigo, mensaje, detalle) => {
  throw new ErrorHttp(estado, codigo, mensaje, detalle);
};

// Envuelve un handler async para que los errores lleguen al middleware de errores.
export const ruta = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

// Campos que jamas se escriben en un log.
const PROHIBIDOS = /password|clave|token|secret|authorization|firma|run/i;

export function limpiarParaLog(objeto) {
  if (!objeto || typeof objeto !== 'object') return objeto;
  const salida = {};
  for (const [k, v] of Object.entries(objeto)) {
    salida[k] = PROHIBIDOS.test(k) ? '[omitido]' : v;
  }
  return salida;
}

export function crearApp(nombreServicio) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.disable('x-powered-by');

  // Identificador de correlacion: permite seguir una solicitud por todos los servicios.
  app.use((req, res, next) => {
    req.correlacion = req.get('x-correlation-id') || randomUUID();
    res.set('x-correlation-id', req.correlacion);
    const inicio = Date.now();
    res.on('finish', () => {
      console.log(
        JSON.stringify({
          servicio: nombreServicio,
          correlacion: req.correlacion,
          metodo: req.method,
          ruta: req.path,
          estado: res.statusCode,
          ms: Date.now() - inicio,
        })
      );
    });
    next();
  });

  app.get('/health', (req, res) => res.json({ servicio: nombreServicio, estado: 'ok' }));
  return app;
}

export function montarManejadorDeErrores(app, nombreServicio) {
  app.use((req, res) => {
    res.status(404).json({ error: 'no_encontrado', mensaje: 'Recurso no encontrado.' });
  });

  app.use((error, req, res, next) => {
    if (error instanceof ErrorHttp) {
      return res.status(error.estado).json({
        error: error.codigo,
        mensaje: error.message,
        detalle: error.detalle,
        correlacion: req.correlacion,
      });
    }
    // Error no previsto: se registra completo en el servidor, pero el cliente
    // recibe un mensaje generico para no filtrar informacion interna.
    console.error(
      JSON.stringify({
        servicio: nombreServicio,
        correlacion: req.correlacion,
        error: error.message,
      })
    );
    res.status(500).json({
      error: 'error_interno',
      mensaje: 'No se pudo procesar la solicitud.',
      correlacion: req.correlacion,
    });
  });
}

// Los servicios privados se enlazan SOLO a la interfaz de loopback.
// Desde otra maquina de la red no son alcanzables: esa es la frontera privada
// que el Modulo 10 pide demostrar sin contenedores.
export function escucharPrivado(app, puerto, nombreServicio) {
  return app.listen(puerto, '127.0.0.1', () => {
    console.log(`[${nombreServicio}] privado en http://127.0.0.1:${puerto}`);
  });
}
