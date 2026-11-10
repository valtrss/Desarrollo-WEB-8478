-- Sistema: analytics
-- Servicio de naturaleza analitica, separado de las transacciones.
-- No es autoridad de ningun dato de negocio: guarda un modelo de lectura
-- derivado de orders, con un retraso aceptado de hasta 5 minutos.
-- No almacena datos personales: solo totales agregados.

CREATE TABLE IF NOT EXISTS ventas_por_dia (
  dia           TEXT PRIMARY KEY,
  total_ventas  INTEGER NOT NULL DEFAULT 0,
  cantidad_pedidos INTEGER NOT NULL DEFAULT 0,
  actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ventas_por_producto (
  dia           TEXT NOT NULL,
  producto_id   TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  unidades      INTEGER NOT NULL DEFAULT 0,
  monto         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, producto_id)
);

-- Deja constancia de cuando se recalculo el modelo de lectura.
CREATE TABLE IF NOT EXISTS actualizaciones (
  id           TEXT PRIMARY KEY,
  desde        TEXT NOT NULL,
  hasta        TEXT NOT NULL,
  filas        INTEGER NOT NULL,
  duracion_ms  INTEGER NOT NULL,
  ejecutada_en TEXT NOT NULL
);
