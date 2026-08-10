-- ============================================================================
-- MPV Dental — Migración 008
-- Fase G: Reseñas y calificaciones de producto (tienda virtual)
-- Se publican en la tienda solo tras moderación de un admin, para evitar
-- que un formulario público sin sesión permita publicar spam directamente.
-- ============================================================================

CREATE TABLE resenas_producto (
    id              SERIAL PRIMARY KEY,
    producto_id     INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    cliente_nombre  VARCHAR(150) NOT NULL,
    calificacion    SMALLINT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
    comentario      TEXT,
    aprobado        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resenas_producto ON resenas_producto (producto_id, aprobado);
