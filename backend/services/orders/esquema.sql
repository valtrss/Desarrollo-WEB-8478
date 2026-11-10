-- Sistema: orders
-- Autoridad sobre: carrito, pedido, su ciclo de vida y las anulaciones.
-- Es el unico que decide el estado oficial de un pedido.

CREATE TABLE IF NOT EXISTS comunas_despacho (
  comuna        TEXT PRIMARY KEY,
  dentro_radio  INTEGER NOT NULL,   -- 1 si queda dentro de los 3 km del local
  costo         INTEGER NOT NULL DEFAULT 0,
  region        TEXT NOT NULL DEFAULT 'Metropolitana'
);

CREATE TABLE IF NOT EXISTS carritos (
  id          TEXT PRIMARY KEY,
  cliente_id  TEXT NOT NULL UNIQUE,
  creado_en   TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS carrito_items (
  id          TEXT PRIMARY KEY,
  carrito_id  TEXT NOT NULL REFERENCES carritos(id) ON DELETE CASCADE,
  producto_id TEXT NOT NULL,
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0 AND cantidad <= 20),
  UNIQUE (carrito_id, producto_id)
);

CREATE TABLE IF NOT EXISTS pedidos (
  id               TEXT PRIMARY KEY,
  cliente_id       TEXT NOT NULL,
  estado           TEXT NOT NULL CHECK (estado IN
                     ('pendiente_pago','pagado','en_preparacion','en_despacho','entregado','anulado')),
  subtotal         INTEGER NOT NULL,
  costo_despacho   INTEGER NOT NULL DEFAULT 0,
  descuento        INTEGER NOT NULL DEFAULT 0,
  total            INTEGER NOT NULL,
  -- Compra sin cuenta: destinatario de la boleta. Es dato de contacto,
  -- no una identidad ni una cuenta.
  correo_contacto  TEXT,
  direccion_entrega TEXT NOT NULL,     -- dato restringido
  comuna           TEXT NOT NULL,
  observaciones    TEXT,
  ventana_despacho TEXT,
  creado_en        TEXT NOT NULL,
  actualizado_en   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado, creado_en);

-- Los precios se congelan al confirmar el pedido: el historial no cambia
-- aunque despues cambie el precio del producto en el catalogo.
CREATE TABLE IF NOT EXISTS pedido_items (
  id              TEXT PRIMARY KEY,
  pedido_id       TEXT NOT NULL REFERENCES pedidos(id),
  producto_id     TEXT NOT NULL,
  nombre_producto TEXT NOT NULL,
  formato         TEXT NOT NULL,
  precio_unitario INTEGER NOT NULL,
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  subtotal        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_pedido ON pedido_items(pedido_id);

-- RF3: anular NO es borrar. El pedido se conserva y gana este registro.
CREATE TABLE IF NOT EXISTS anulaciones (
  pedido_id   TEXT PRIMARY KEY REFERENCES pedidos(id),
  motivo      TEXT NOT NULL,
  anulado_por TEXT NOT NULL,
  rol         TEXT NOT NULL,
  fecha       TEXT NOT NULL
);

-- Bitacora de transiciones: deja evidencia de quien cambio que y cuando.
CREATE TABLE IF NOT EXISTS transiciones (
  id          TEXT PRIMARY KEY,
  pedido_id   TEXT NOT NULL REFERENCES pedidos(id),
  desde       TEXT NOT NULL,
  hacia       TEXT NOT NULL,
  actor       TEXT NOT NULL,
  rol         TEXT NOT NULL,
  fecha       TEXT NOT NULL
);
