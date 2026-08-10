-- ============================================================================
-- MPV Dental — Migración 007
-- Fase G: Cupones de descuento internos para la tienda virtual
-- Sin pasarela de pago: el cupón solo ajusta el total que se envía por
-- WhatsApp, el pago se sigue coordinando manualmente con el cliente.
-- ============================================================================

CREATE TABLE cupones (
    id                  SERIAL PRIMARY KEY,
    codigo              VARCHAR(30) NOT NULL UNIQUE,
    tipo                VARCHAR(10) NOT NULL CHECK (tipo IN ('porcentaje', 'monto_fijo')),
    valor               NUMERIC(10,2) NOT NULL CHECK (valor > 0),
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_expiracion    DATE,
    usos_maximos        INTEGER,
    usos_actuales       INTEGER NOT NULL DEFAULT 0,
    monto_minimo        NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_cupones_codigo ON cupones (UPPER(codigo));

CREATE TRIGGER trg_cupones_updated_at
    BEFORE UPDATE ON cupones
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
