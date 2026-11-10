-- Sistema: auth-service
-- Autoridad sobre: emision y revocacion de sesiones. No guarda credenciales:
-- esas pertenecen a clients, que es su custodio.

CREATE TABLE IF NOT EXISTS sesiones_revocadas (
  jti        TEXT PRIMARY KEY,   -- identificador del token revocado
  usuario_id TEXT NOT NULL,
  expira_en  INTEGER NOT NULL,   -- epoch; pasada esa fecha la fila se puede purgar
  revocado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revocadas_expira ON sesiones_revocadas(expira_en);
