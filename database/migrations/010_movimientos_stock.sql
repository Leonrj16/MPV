-- ============================================================================
-- MPV Dental — Migración 010
-- Fase F: Historial de movimientos de stock
-- Complementa a la bitácora genérica (acciones del sistema en general) con
-- un registro específico de cada cambio de cantidad por producto, para
-- poder reconstruir por qué el stock quedó en el número que quedó.
-- ============================================================================

CREATE TABLE movimientos_stock (
    id                  SERIAL PRIMARY KEY,
    producto_id         INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    tipo                VARCHAR(20) NOT NULL CHECK (tipo IN ('venta', 'ajuste_manual')),
    -- Negativo = salida (venta), positivo = entrada/corrección (ajuste manual).
    cantidad_delta      INTEGER NOT NULL,
    stock_resultante    INTEGER NOT NULL,
    venta_id            INTEGER REFERENCES ventas(id) ON DELETE SET NULL,
    usuario_id          INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    motivo              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movimientos_producto ON movimientos_stock (producto_id, created_at DESC);
