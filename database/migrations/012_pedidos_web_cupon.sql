-- ============================================================================
-- MPV Dental — Migración 012
-- Fase G: registra qué cupón (si hubo) se aplicó a un pedido web, para que
-- el descuento quede visible en el historial y no solo en el mensaje de
-- WhatsApp que ya se envió.
-- ============================================================================

ALTER TABLE pedidos_web ADD COLUMN cupon_codigo VARCHAR(30);
ALTER TABLE pedidos_web ADD COLUMN descuento NUMERIC(10,2) NOT NULL DEFAULT 0;
