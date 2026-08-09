-- ============================================================================
-- MPV Dental — Migración 005
-- Fase A: cierra el hueco entre "venta real" (Punto de Venta) y "pedido que
-- llegó por la tienda virtual" (hasta ahora solo vivía en WhatsApp, sin
-- ningún rastro en el sistema). pedidos_web es deliberadamente una tabla
-- separada de ventas: un pedido es una intención de compra (todavía no
-- descuenta stock), una venta es un hecho ya ocurrido.
-- Requiere haber aplicado antes schema.sql y las migraciones 002-004.
-- ============================================================================

CREATE TABLE pedidos_web (
    id              SERIAL PRIMARY KEY,
    cliente         VARCHAR(150),
    telefono        VARCHAR(30),
    total           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'atendido', 'cancelado')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_pedidos_web_updated_at
    BEFORE UPDATE ON pedidos_web
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_pedidos_web_created_at ON pedidos_web (created_at DESC);
CREATE INDEX idx_pedidos_web_estado ON pedidos_web (estado);

CREATE TABLE pedido_web_detalle (
    id              SERIAL PRIMARY KEY,
    pedido_id       INTEGER NOT NULL REFERENCES pedidos_web(id) ON DELETE CASCADE,
    producto_id     INTEGER NOT NULL REFERENCES productos(id),
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
    subtotal        NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX idx_pedido_web_detalle_pedido ON pedido_web_detalle (pedido_id);
