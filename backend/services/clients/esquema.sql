-- Sistema: clients
-- Autoridad sobre: cuentas de clientes y personal, credenciales y estado de verificacion.
-- Ningun otro servicio lee esta base.

CREATE TABLE IF NOT EXISTS clientes (
  id                  TEXT PRIMARY KEY,
  run                 TEXT NOT NULL UNIQUE,          -- dato restringido
  nombre_completo     TEXT NOT NULL,
  correo              TEXT NOT NULL UNIQUE,          -- dato restringido
  clave_hash          TEXT NOT NULL,                 -- credencial: scrypt con sal
  telefono            TEXT NOT NULL,                 -- dato restringido
  direccion           TEXT NOT NULL,                 -- dato restringido
  comuna              TEXT NOT NULL,
  provincia           TEXT NOT NULL,
  region              TEXT NOT NULL,
  fecha_nacimiento    TEXT NOT NULL,                 -- dato restringido
  sexo                TEXT,
  rol                 TEXT NOT NULL DEFAULT 'cliente'
                      CHECK (rol IN ('cliente','administrador','cajero','despacho','dueno')),
  estado_verificacion TEXT NOT NULL DEFAULT 'pendiente_verificacion'
                      CHECK (estado_verificacion IN ('pendiente_verificacion','verificado','suspendido')),
  token_verificacion  TEXT,
  creado_en           TEXT NOT NULL,
  actualizado_en      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clientes_correo ON clientes(correo);

-- Limite de intentos de inicio de sesion (Modulo 7: evitar fuerza bruta).
CREATE TABLE IF NOT EXISTS intentos_login (
  correo      TEXT NOT NULL,
  momento     TEXT NOT NULL,
  resultado   TEXT NOT NULL CHECK (resultado IN ('exito','fallo'))
);

CREATE INDEX IF NOT EXISTS idx_intentos_correo ON intentos_login(correo, momento);
