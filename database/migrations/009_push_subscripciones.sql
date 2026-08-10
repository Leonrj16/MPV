-- ============================================================================
-- MPV Dental — Migración 009
-- Fase G: Notificaciones push del navegador para pedidos web
-- La suscripción queda ligada a UN pedido específico (no a una cuenta de
-- cliente, que no existe todavía): el cliente se suscribe justo al hacer el
-- pedido, y el servidor le avisa cuando el staff cambia su estado.
-- ============================================================================

CREATE TABLE push_subscripciones (
    id              SERIAL PRIMARY KEY,
    pedido_id       INTEGER NOT NULL REFERENCES pedidos_web(id) ON DELETE CASCADE,
    endpoint        TEXT NOT NULL,
    p256dh          TEXT NOT NULL,
    auth            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_subscripciones_pedido ON push_subscripciones (pedido_id);
