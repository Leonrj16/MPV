-- ============================================================================
-- MPV Dental — Migración 006
-- Fase D: Bitácora de auditoría (quién hizo qué y cuándo)
-- ============================================================================

CREATE TABLE bitacora (
    id              SERIAL PRIMARY KEY,
    usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    -- Snapshot del nombre al momento del evento: si el usuario se borra o se
    -- renombra después, el registro histórico sigue siendo legible.
    usuario_nombre  VARCHAR(150),
    accion          VARCHAR(30) NOT NULL,
    entidad         VARCHAR(40) NOT NULL,
    entidad_id      INTEGER,
    detalle         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bitacora_created_at ON bitacora (created_at DESC);
CREATE INDEX idx_bitacora_entidad ON bitacora (entidad);
