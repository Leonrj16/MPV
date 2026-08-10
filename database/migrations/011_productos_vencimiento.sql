-- ============================================================================
-- MPV Dental — Migración 011
-- Fase F: Fecha de vencimiento por producto
-- Alcance reducido a propósito: una sola fecha por producto (no lotes
-- múltiples con salida FEFO) — para un negocio de este tamaño alcanza con
-- saber "este producto tiene unidades por vencer pronto" sin rediseñar cómo
-- se descuenta el stock en cada venta.
-- ============================================================================

ALTER TABLE productos ADD COLUMN fecha_vencimiento DATE;
