// Cliente gRPC de orders hacia inventory (Modulo 9).
//
// Reservar stock es una llamada unary, interna y en el camino critico de
// confirmar un pedido: contrato tipado y plazo maximo estricto.
// Si el canal gRPC no esta disponible, se degrada al mismo contrato por HTTP
// en vez de dejar caer la compra.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

import { emitirIdentidadInterna, llamarServicio } from '../../shared/identidad.js';

const RUTA_PROTO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'proto', 'inventario.proto');
const DESTINO_GRPC = '127.0.0.1:50051';
const INVENTORY_HTTP = 'http://127.0.0.1:4002';
const PLAZO_MS = 2000;

const definicion = protoLoader.loadSync(RUTA_PROTO, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const paquete = grpc.loadPackageDefinition(definicion).lanonna.inventario;

let clienteCache = null;
function cliente() {
  if (!clienteCache) {
    clienteCache = new paquete.Inventario(DESTINO_GRPC, grpc.credentials.createInsecure());
  }
  return clienteCache;
}

export class ErrorReserva extends Error {
  constructor(codigo, detalle) {
    super(codigo);
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

function metadatos(identidad) {
  const meta = new grpc.Metadata();
  meta.set('x-identidad-interna', emitirIdentidadInterna({
    usuarioId: identidad?.usuarioId,
    rol: 'servicio',
    correlacion: identidad?.correlacion,
    destino: 'inventory',
  }));
  return meta;
}

function reservarPorGrpc({ pedidoId, items, identidad }) {
  return new Promise((resolver, rechazar) => {
    const plazo = new Date(Date.now() + PLAZO_MS);
    cliente().ReservarStock(
      {
        pedido_id: pedidoId,
        correlacion: identidad?.correlacion ?? '',
        items: items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad })),
      },
      metadatos(identidad),
      { deadline: plazo },
      (error, respuesta) => {
        if (error) return rechazar(error);
        if (!respuesta.ok) {
          return rechazar(new ErrorReserva(respuesta.codigo, {
            productoId: respuesta.producto_id_problema,
            disponible: Number(respuesta.disponible),
          }));
        }
        resolver({
          canal: 'grpc',
          expiraEn: respuesta.expira_en,
          reservas: respuesta.reservas,
        });
      }
    );
  });
}

async function reservarPorHttp({ pedidoId, items, identidad }) {
  const respuesta = await llamarServicio(INVENTORY_HTTP + '/internal/reservas', {
    metodo: 'POST',
    cuerpo: { pedidoId, items },
    identidad: { ...identidad, rol: 'servicio' },
    destino: 'inventory',
  });
  if (respuesta.estado === 409) {
    throw new ErrorReserva(respuesta.datos?.error ?? 'stock_insuficiente', respuesta.datos?.detalle);
  }
  if (!respuesta.ok) {
    throw new ErrorReserva('inventario_no_disponible', null);
  }
  return { canal: 'http', expiraEn: respuesta.datos.expiraEn, reservas: respuesta.datos.reservas };
}

export async function reservarStockPorGrpc({ pedidoId, items, identidad }) {
  try {
    return await reservarPorGrpc({ pedidoId, items, identidad });
  } catch (error) {
    // Un rechazo de negocio NO se reintenta por el otro canal: la respuesta
    // ya es definitiva y repetirla podria reservar dos veces.
    if (error instanceof ErrorReserva) throw error;

    console.warn(JSON.stringify({
      servicio: 'orders',
      evento: 'grpc_degradado_a_http',
      motivo: error.details ?? error.message,
    }));
    return reservarPorHttp({ pedidoId, items, identidad });
  }
}
