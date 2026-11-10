-- Sistema: payments
-- Autoridad sobre: el estado de un pago y la emision de la boleta.
-- Es el unico que puede declarar que un pedido fue pagado.

CREATE TABLE IF NOT EXISTS pagos (
  id            TEXT PRIMARY KEY,
  pedido_id     TEXT NOT NULL,
  cliente_id    TEXT NOT NULL,
  monto         INTEGER NOT NULL CHECK (monto > 0),   -- lo fija orders, no el navegador
  medio         TEXT NOT NULL CHECK (medio IN ('servipag','transferencia')),
  estado        TEXT NOT NULL CHECK (estado IN ('iniciado','aprobado','rechazado','expirado')),
  referencia_externa TEXT,
  correo_contacto TEXT,   -- destinatario de la boleta cuando la compra es de invitado
  creado_en     TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pagos_pedido ON pagos(pedido_id);

-- Idempotencia del webhook: una misma notificacion no se procesa dos veces,
-- aunque el proveedor la reenvie.
CREATE TABLE IF NOT EXISTS notificaciones (
  idempotency_key TEXT PRIMARY KEY,
  pago_id         TEXT,
  resultado       TEXT NOT NULL,
  recibida_en     TEXT NOT NULL
);

-- RF8: boleta digital enviada al correo del cliente.
CREATE TABLE IF NOT EXISTS boletas (
  id           TEXT PRIMARY KEY,
  pedido_id    TEXT NOT NULL UNIQUE,
  pago_id      TEXT NOT NULL,
  monto        INTEGER NOT NULL,
  enviada_a    TEXT NOT NULL,        -- correo: dato restringido
  emitida_por  TEXT NOT NULL,        -- cajero virtual
  emitida_en   TEXT NOT NULL
);
