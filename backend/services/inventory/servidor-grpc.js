// Servidor gRPC de inventory (Modulo 9).
//
// Expone solo las operaciones de reserva de stock, que son internas y estan en
// el camino critico de confirmar un pedido. El navegador no habla gRPC ni
// alcanza este puerto: escucha en 127.0.0.1 y exige identidad de servicio.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

import { reservarStock, liberarReservasDePedido, consumirReservasDePedido, ErrorStock } from './stock.js';
import { verificar } from '../../shared/jwt.js';
import { obtenerSecreto } from '../../shared/secretos.js';
import { anotar, contexto } from '../../shared/bitacora.js';

const RUTA_PROTO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'proto', 'inventario.proto');
const PUERTO_GRPC = 50051;

const definicion = protoLoader.loadSync(RUTA_PROTO, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const paquete = grpc.loadPackageDefinition(definicion).lanonna.inventario;

// Autorizacion por metodo: la misma identidad interna que usa el canal HTTP.
// Un llamante sin credencial valida recibe UNAUTHENTICATED, no un error de negocio.
function identidadDe(llamada) {
  const token = llamada.metadata.get('x-identidad-interna')[0];
  if (!token) return null;
  const payload = verificar(String(token), obtenerSecreto('identidad-interna'));
  if (!payload || payload.aud !== 'inventory') return null;
  return payload;
}

function exigirIdentidad(llamada, callback) {
  const identidad = identidadDe(llamada);
  if (!identidad) {
    anotar('inventory', 'RECHAZO',
      'llamada gRPC sin identidad de servicio válida', { resultado: 'UNAUTHENTICATED' });
    callback({
      code: grpc.status.UNAUTHENTICATED,
      message: 'Identidad de servicio invalida o ausente.',
    });
    return null;
  }
  return identidad;
}

// El canal gRPC vive fuera del ciclo HTTP, asi que no hereda el contexto de
// correlacion. Se reconstruye desde el campo `correlacion` del propio mensaje
// .proto, para que la reserva se pueda seguir junto al resto de la llamada.
function enContexto(llamada, identidad, fn) {
  const correlacion = llamada.request?.correlacion || identidad?.correlacion || null;
  return contexto.run({ correlacion, servicio: 'inventory' }, fn);
}

const servicio = {
  ReservarStock(llamada, callback) {
    const identidad = exigirIdentidad(llamada, callback);
    if (!identidad) return;
    return enContexto(llamada, identidad, () => {

    const { pedido_id: pedidoId, items } = llamada.request;
    anotar('inventory', 'GRPC', 'ReservarStock (unary) recibida por el canal interno',
      { pedido: pedidoId, items: items?.length ?? 0 });
    if (!pedidoId || !Array.isArray(items) || items.length === 0) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Debe indicar pedido_id y al menos un item.',
      });
    }

    try {
      const resultado = reservarStock({
        pedidoId,
        items: items.map((i) => ({ productoId: i.producto_id, cantidad: Number(i.cantidad) })),
      });
      callback(null, {
        ok: true,
        codigo: '',
        reservas: resultado.reservas.map((r) => ({
          reserva_id: r.reservaId, producto_id: r.productoId, cantidad: r.cantidad,
        })),
        expira_en: resultado.expiraEn,
        producto_id_problema: '',
        disponible: 0,
      });
    } catch (error) {
      if (error instanceof ErrorStock) {
        // Falla de negocio: se responde en el mensaje, no como error de transporte.
        return callback(null, {
          ok: false,
          codigo: error.codigo,
          reservas: [],
          expira_en: '',
          producto_id_problema: error.detalle?.productoId ?? '',
          disponible: error.detalle?.disponible ?? 0,
        });
      }
      callback({ code: grpc.status.INTERNAL, message: 'No se pudo reservar el stock.' });
    }
    });
  },

  // Idempotente: repetir la liberacion de un pedido ya liberado devuelve 0.
  LiberarReserva(llamada, callback) {
    const identidad = exigirIdentidad(llamada, callback);
    if (!identidad) return;
    return enContexto(llamada, identidad, () => {
      anotar('inventory', 'GRPC', 'LiberarReserva (unary)', { pedido: llamada.request.pedido_id });
      const afectadas = liberarReservasDePedido(llamada.request.pedido_id);
      callback(null, { ok: true, afectadas });
    });
  },

  ConsumirReserva(llamada, callback) {
    const identidad = exigirIdentidad(llamada, callback);
    if (!identidad) return;
    return enContexto(llamada, identidad, () => {
      anotar('inventory', 'GRPC', 'ConsumirReserva (unary): el stock sale de bodega',
        { pedido: llamada.request.pedido_id });
      const afectadas = consumirReservasDePedido(llamada.request.pedido_id);
      callback(null, { ok: true, afectadas });
    });
  },
};

export function iniciarServidorGrpc() {
  const servidor = new grpc.Server();
  servidor.addService(paquete.Inventario.service, servicio);
  servidor.bindAsync(
    `127.0.0.1:${PUERTO_GRPC}`,
    grpc.ServerCredentials.createInsecure(), // red de loopback; en produccion: mTLS
    (error) => {
      if (error) {
        console.error('[inventory] no se pudo abrir el canal gRPC:', error.message);
        return;
      }
      anotar('inventory', 'GRPC', `canal interno escuchando en 127.0.0.1:${PUERTO_GRPC}`,
        { contrato: 'lanonna.inventario.Inventario' });
    }
  );
  return servidor;
}
