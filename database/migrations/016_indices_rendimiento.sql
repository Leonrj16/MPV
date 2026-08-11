-- Índices agregados tras una auditoría de rendimiento del hot-path de
-- precios y de algunas foreign keys sin índice propio.

-- vw_proveedor_optimo (database/schema.sql) hace
-- `DISTINCT ON (producto_id) ... WHERE activo = TRUE ORDER BY producto_id,
-- precio_compra_unitario, tiempo_entrega_dias` sobre proveedor_producto —
-- se consulta en el camino crítico de registrarVenta, registrarPedidoWeb,
-- listarProductosDisponibles y el catálogo público. Antes solo existían
-- idx_pp_producto e idx_pp_activo por separado; este índice compuesto
-- cubre exactamente el filtro + orden de la vista, columna por columna.
CREATE INDEX idx_pp_optimo ON proveedor_producto (producto_id, precio_compra_unitario, tiempo_entrega_dias)
    WHERE activo = TRUE;

-- Foreign keys sin índice propio — bajo volumen hoy, pero consultas de
-- historial/auditoría por usuario o por venta escanean toda la tabla sin
-- esto a medida que crece.
CREATE INDEX idx_pedido_web_detalle_producto ON pedido_web_detalle (producto_id);
CREATE INDEX idx_movimientos_venta ON movimientos_stock (venta_id);
CREATE INDEX idx_movimientos_usuario ON movimientos_stock (usuario_id);
CREATE INDEX idx_bitacora_usuario ON bitacora (usuario_id);
CREATE INDEX idx_bitacora_entidad_id ON bitacora (entidad_id);
