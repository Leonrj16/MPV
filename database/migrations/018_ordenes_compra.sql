-- ============================================================================
-- MPV Dental — Migración 018
-- Órdenes de compra a proveedores
-- Cierra el círculo entre las alertas de reabastecimiento (F3) y la
-- comparación de proveedores (Fase 1): en vez de solo avisar que hay que
-- reponer stock, genera el documento real para mandarle al proveedor y
-- registra la recepción cuando llega la mercadería.
-- ============================================================================

CREATE TABLE ordenes_compra (
    id              SERIAL PRIMARY KEY,
    proveedor_id    INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
    estado          VARCHAR(20) NOT NULL DEFAULT 'borrador'
                        CHECK (estado IN ('borrador', 'enviada', 'recibida', 'cancelada')),
    total           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    notas           TEXT,
    usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_ordenes_compra_updated_at
    BEFORE UPDATE ON ordenes_compra
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_ordenes_compra_proveedor ON ordenes_compra (proveedor_id);
CREATE INDEX idx_ordenes_compra_estado ON ordenes_compra (estado);
CREATE INDEX idx_ordenes_compra_created_at ON ordenes_compra (created_at DESC);

CREATE TABLE orden_compra_detalle (
    id                      SERIAL PRIMARY KEY,
    orden_id                INTEGER NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
    producto_id             INTEGER NOT NULL REFERENCES productos(id),
    cantidad                INTEGER NOT NULL CHECK (cantidad > 0),
    precio_compra_unitario  NUMERIC(12,4) NOT NULL CHECK (precio_compra_unitario >= 0),
    subtotal                NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX idx_orden_compra_detalle_orden ON orden_compra_detalle (orden_id);

-- La recepción de una orden de compra es un tipo más de movimiento de stock
-- (igual que 'venta' o 'ajuste_manual'), con su propia referencia para poder
-- rastrear qué orden generó qué entrada.
ALTER TABLE movimientos_stock DROP CONSTRAINT movimientos_stock_tipo_check;
ALTER TABLE movimientos_stock ADD CONSTRAINT movimientos_stock_tipo_check
    CHECK (tipo IN ('venta', 'ajuste_manual', 'recepcion_compra'));
ALTER TABLE movimientos_stock ADD COLUMN orden_compra_id INTEGER REFERENCES ordenes_compra(id) ON DELETE SET NULL;
