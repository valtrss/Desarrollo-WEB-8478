// Logica de stock de inventory, compartida por su API REST y su servidor gRPC.
// Vive aparte para que ambos caminos apliquen exactamente las mismas reglas.

import { randomUUID } from 'node:crypto';
import { abrirBase, enTransaccion } from '../../shared/db.js';

export const db = abrirBase('inventory');

const MINUTOS_RESERVA = 20;
const ahora = () => new Date().toISOString();

// Una reserva vencida se libera sola: un carrito abandonado no puede dejar
// la produccion del dia bloqueada.
export function liberarReservasVencidas() {
  const vencidas = db.prepare(
    "SELECT * FROM reservas WHERE estado = 'activa' AND expira_en < ?"
  ).all(ahora());
  for (const r of vencidas) {
    enTransaccion(db, () => {
      db.prepare("UPDATE reservas SET estado = 'liberada' WHERE id = ?").run(r.id);
      db.prepare('UPDATE productos SET stock_reservado = stock_reservado - ? WHERE id = ?')
        .run(r.cantidad, r.producto_id);
    });
  }
  return vencidas.length;
}

export class ErrorStock extends Error {
  constructor(codigo, detalle) {
    super(codigo);
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

export function reservarStock({ pedidoId, items }) {
  liberarReservasVencidas();
  return enTransaccion(db, () => {
    const expiraEn = new Date(Date.now() + MINUTOS_RESERVA * 60_000).toISOString();
    const reservas = [];

    for (const item of items) {
      const p = db.prepare('SELECT * FROM productos WHERE id = ? AND descontinuado = 0')
        .get(item.productoId);
      if (!p) {
        throw new ErrorStock('producto_no_disponible', { productoId: item.productoId, disponible: 0 });
      }
      const libre = p.stock_del_dia - p.stock_reservado;
      if (libre < item.cantidad) {
        throw new ErrorStock('stock_insuficiente', {
          productoId: item.productoId, solicitado: item.cantidad, disponible: libre,
        });
      }
      const id = 'res_' + randomUUID().slice(0, 8);
      db.prepare(
        'INSERT INTO reservas (id, pedido_id, producto_id, cantidad, estado, creada_en, expira_en) VALUES (?,?,?,?,?,?,?)'
      ).run(id, pedidoId, item.productoId, item.cantidad, 'activa', ahora(), expiraEn);
      db.prepare('UPDATE productos SET stock_reservado = stock_reservado + ? WHERE id = ?')
        .run(item.cantidad, item.productoId);
      reservas.push({ reservaId: id, productoId: item.productoId, cantidad: item.cantidad });
    }
    return { reservas, expiraEn };
  });
}

// Idempotente: si no hay reservas activas, no hace nada y devuelve 0.
export function liberarReservasDePedido(pedidoId) {
  const activas = db.prepare(
    "SELECT * FROM reservas WHERE pedido_id = ? AND estado = 'activa'"
  ).all(pedidoId);
  enTransaccion(db, () => {
    for (const r of activas) {
      db.prepare("UPDATE reservas SET estado = 'liberada' WHERE id = ?").run(r.id);
      db.prepare('UPDATE productos SET stock_reservado = stock_reservado - ? WHERE id = ?')
        .run(r.cantidad, r.producto_id);
    }
  });
  return activas.length;
}

// El pago se confirmo: la produccion sale del stock del dia de verdad.
export function consumirReservasDePedido(pedidoId) {
  const activas = db.prepare(
    "SELECT * FROM reservas WHERE pedido_id = ? AND estado = 'activa'"
  ).all(pedidoId);
  enTransaccion(db, () => {
    for (const r of activas) {
      db.prepare("UPDATE reservas SET estado = 'consumida' WHERE id = ?").run(r.id);
      db.prepare(
        'UPDATE productos SET stock_reservado = stock_reservado - ?, stock_del_dia = stock_del_dia - ? WHERE id = ?'
      ).run(r.cantidad, r.cantidad, r.producto_id);
    }
  });
  return activas.length;
}
