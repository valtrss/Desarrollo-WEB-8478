-- Sistema: inventory
-- Autoridad sobre: catalogo, precios y stock del dia.
-- Decide que esta disponible. orders NUNCA escribe aqui: pide una reserva.

CREATE TABLE IF NOT EXISTS categorias (
  id     TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS productos (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  descripcion    TEXT NOT NULL DEFAULT '',
  categoria_id   TEXT NOT NULL REFERENCES categorias(id),
  formato        TEXT NOT NULL,                  -- "500 g", "1 kg"
  porciones      INTEGER NOT NULL DEFAULT 1,
  precio         INTEGER NOT NULL CHECK (precio > 0),   -- pesos, sin decimales
  imagen_url     TEXT NOT NULL DEFAULT '',
  -- Produccion del dia: la pasta fresca es perecible.
  stock_del_dia  INTEGER NOT NULL DEFAULT 0 CHECK (stock_del_dia >= 0),
  stock_reservado INTEGER NOT NULL DEFAULT 0 CHECK (stock_reservado >= 0),
  descontinuado  INTEGER NOT NULL DEFAULT 0,     -- retiro logico: conserva historial
  actualizado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);

-- Reservas de stock. Una reserva vencida se libera sola: evita que un carrito
-- abandonado deje produccion bloqueada todo el dia.
CREATE TABLE IF NOT EXISTS reservas (
  id          TEXT PRIMARY KEY,
  pedido_id   TEXT NOT NULL,
  producto_id TEXT NOT NULL REFERENCES productos(id),
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0),
  estado      TEXT NOT NULL CHECK (estado IN ('activa','consumida','liberada')),
  creada_en   TEXT NOT NULL,
  expira_en   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reservas_pedido ON reservas(pedido_id);
CREATE INDEX IF NOT EXISTS idx_reservas_estado ON reservas(estado, expira_en);
