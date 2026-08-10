const pool = require('../config/db');

/**
 * Agrega las señales que ya existen en la base de datos (stock, historial de
 * precios, pedidos web) en un solo lugar accionable, en vez de que el staff
 * tenga que ir a revisar cada página por separado para notar que algo
 * necesita atención.
 */
async function obtenerAlertas() {
    const [{ rows: stockBajo }, { rows: stockAgotado }, { rows: subidasPrecio }, { rows: pendientes }, { rows: reabastecimiento }, { rows: vencimiento }] = await Promise.all([
        pool.query(
            `SELECT id, nombre, sku, stock_actual, stock_minimo
             FROM productos
             WHERE activo = TRUE AND stock_actual > 0 AND stock_actual <= stock_minimo AND stock_minimo > 0
             ORDER BY stock_actual ASC
             LIMIT 10`
        ),
        pool.query(
            `SELECT id, nombre, sku
             FROM productos
             WHERE activo = TRUE AND stock_actual <= 0
             ORDER BY nombre ASC
             LIMIT 10`
        ),
        pool.query(
            `SELECT producto_id, producto_nombre, sku, proveedor_nombre, precio_compra_unitario, precio_compra_anterior
             FROM vw_tablero_precios
             WHERE alerta_subida_precio = TRUE
             ORDER BY producto_nombre ASC
             LIMIT 10`
        ),
        pool.query(`SELECT COUNT(*)::int AS total FROM pedidos_web WHERE estado = 'pendiente'`),
        // Velocidad de venta de los últimos 30 días: si al ritmo actual el
        // stock se agota en 7 días o menos, hay que reabastecer ya. Se
        // excluye a los que ya están en "stock bajo/agotado" arriba para no
        // duplicar la misma alerta con otro ícono.
        pool.query(
            `SELECT p.id, p.nombre, p.sku, p.stock_actual,
                    SUM(vd.cantidad)::numeric / 30 AS velocidad_diaria
             FROM productos p
             JOIN venta_detalle vd ON vd.producto_id = p.id
             JOIN ventas v ON v.id = vd.venta_id AND v.created_at >= CURRENT_DATE - INTERVAL '30 days'
             WHERE p.activo = TRUE AND p.stock_actual > p.stock_minimo
             GROUP BY p.id, p.nombre, p.sku, p.stock_actual
             HAVING p.stock_actual / (SUM(vd.cantidad)::numeric / 30) <= 7
             ORDER BY p.stock_actual / (SUM(vd.cantidad)::numeric / 30) ASC
             LIMIT 10`
        ),
        pool.query(
            `SELECT id, nombre, sku, fecha_vencimiento
             FROM productos
             WHERE activo = TRUE AND fecha_vencimiento IS NOT NULL
                   AND fecha_vencimiento <= CURRENT_DATE + INTERVAL '30 days'
             ORDER BY fecha_vencimiento ASC
             LIMIT 10`
        ),
    ]);

    const stockBajoData = stockBajo.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        sku: p.sku,
        stockActual: p.stock_actual,
        stockMinimo: p.stock_minimo,
    }));
    const stockAgotadoData = stockAgotado.map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku }));
    const subidasPrecioData = subidasPrecio.map((f) => ({
        productoId: f.producto_id,
        nombre: f.producto_nombre,
        sku: f.sku,
        proveedor: f.proveedor_nombre,
        precioAnterior: Number(f.precio_compra_anterior),
        precioActual: Number(f.precio_compra_unitario),
    }));
    const pedidosPendientes = pendientes[0].total;
    const reabastecimientoData = reabastecimiento.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        sku: p.sku,
        stockActual: p.stock_actual,
        diasRestantes: Math.floor(p.stock_actual / Number(p.velocidad_diaria)),
    }));
    const vencimientoData = vencimiento.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        sku: p.sku,
        // pg devuelve DATE como objeto Date; se serializa como YYYY-MM-DD
        // (no ISO completo) para que el frontend no tenga que lidiar con
        // desfases de huso horario al reconstruirla.
        fechaVencimiento: p.fecha_vencimiento.toLocaleDateString('sv-SE'),
        vencido: p.fecha_vencimiento < new Date(new Date().toDateString()),
    }));

    return {
        stockBajo: stockBajoData,
        stockAgotado: stockAgotadoData,
        subidasPrecio: subidasPrecioData,
        pedidosPendientes,
        reabastecimiento: reabastecimientoData,
        vencimiento: vencimientoData,
        total: stockBajoData.length + stockAgotadoData.length + subidasPrecioData.length + pedidosPendientes
            + reabastecimientoData.length + vencimientoData.length,
    };
}

module.exports = { obtenerAlertas };
