const pool = require('../config/db');

/**
 * Agrega las señales que ya existen en la base de datos (stock, historial de
 * precios, pedidos web) en un solo lugar accionable, en vez de que el staff
 * tenga que ir a revisar cada página por separado para notar que algo
 * necesita atención.
 */
async function obtenerAlertas() {
    const [{ rows: stockBajo }, { rows: stockAgotado }, { rows: subidasPrecio }, { rows: pendientes }] = await Promise.all([
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

    return {
        stockBajo: stockBajoData,
        stockAgotado: stockAgotadoData,
        subidasPrecio: subidasPrecioData,
        pedidosPendientes,
        total: stockBajoData.length + stockAgotadoData.length + subidasPrecioData.length + pedidosPendientes,
    };
}

module.exports = { obtenerAlertas };
