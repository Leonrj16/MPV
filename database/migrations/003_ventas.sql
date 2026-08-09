-- ============================================================================
-- MPV Dental — Migración 003
-- Fase 5: Punto de Venta — registra ventas en mostrador y descuenta stock real
-- Requiere haber aplicado antes schema.sql y 002_auth_historial.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STOCK: hasta ahora productos solo tenía stock_minimo (umbral de reposición),
-- sin ningún contador de existencias reales. Se agrega stock_actual, que es lo
-- que el punto de venta valida y descuenta en cada venta.
-- ----------------------------------------------------------------------------
ALTER TABLE productos ADD COLUMN stock_actual INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0);

-- ----------------------------------------------------------------------------
-- VENTAS (encabezado) + VENTA_DETALLE (líneas)
-- ----------------------------------------------------------------------------
CREATE TABLE ventas (
    id              SERIAL PRIMARY KEY,
    usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    cliente         VARCHAR(150),
    metodo_pago     VARCHAR(30) NOT NULL DEFAULT 'efectivo'
                        CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'yape_plin', 'transferencia')),
    total           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ventas_created_at ON ventas (created_at DESC);
CREATE INDEX idx_ventas_usuario ON ventas (usuario_id);

CREATE TABLE venta_detalle (
    id              SERIAL PRIMARY KEY,
    venta_id        INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id     INTEGER NOT NULL REFERENCES productos(id),
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
    subtotal        NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX idx_venta_detalle_venta ON venta_detalle (venta_id);
CREATE INDEX idx_venta_detalle_producto ON venta_detalle (producto_id);

-- ----------------------------------------------------------------------------
-- Datos de demostración: stock inicial para los productos sembrados en
-- schema.sql (los creados luego desde la UI de Productos arrancan en 0 y se
-- ajustan manualmente desde ahí).
-- ----------------------------------------------------------------------------
UPDATE productos SET stock_actual = 40 WHERE sku = 'RES-001';
UPDATE productos SET stock_actual = 15 WHERE sku = 'FRE-014';
UPDATE productos SET stock_actual = 25 WHERE sku = 'ANE-007';
UPDATE productos SET stock_actual = 60 WHERE sku = 'GUA-100';
UPDATE productos SET stock_actual = 8  WHERE sku = 'BRA-220';
