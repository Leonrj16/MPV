const pool = require('../config/db');
const { calcularPVP, compararProveedores } = require('../services/pricingEngine');
const { obtenerConfigActiva, obtenerTablero } = require('../services/tableroPrecios');

/**
 * GET /api/precios
 * Tablero completo: producto + proveedor + costos + margen + PVP sugerido.
 * Soporta filtros ?categoria=&proveedor=&busqueda=
 */
async function listarTableroPrecios(req, res) {
    try {
        const { categoria, proveedor, busqueda } = req.query;
        const { config, tablero } = await obtenerTablero({ categoria, proveedor, busqueda });

        res.json({ ok: true, config: { margenDefecto: config.margen_utilidad_defecto_pct, impuesto: config.porcentaje_impuesto }, data: tablero });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/**
 * GET /api/precios/comparar/:productoId
 * Compara proveedores de un producto y marca el óptimo.
 */
async function compararProveedoresProducto(req, res) {
    try {
        const { productoId } = req.params;
        const { rows } = await pool.query(
            `SELECT pv.id AS proveedor_id, pv.nombre AS proveedor_nombre,
                    pp.precio_compra_unitario, pp.tiempo_entrega_dias
             FROM proveedor_producto pp
             JOIN proveedores pv ON pv.id = pp.proveedor_id
             WHERE pp.producto_id = $1 AND pp.activo = TRUE`,
            [productoId]
        );

        const ofertas = rows.map((r) => ({
            proveedorId: r.proveedor_id,
            proveedorNombre: r.proveedor_nombre,
            precioCompra: Number(r.precio_compra_unitario),
            tiempoEntregaDias: r.tiempo_entrega_dias,
        }));

        const resultado = compararProveedores(ofertas);
        res.json({ ok: true, ...resultado });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/**
 * PUT /api/precios/:proveedorProductoId
 * Actualiza el precio de compra de un proveedor para un producto.
 * El trigger de BD respalda automáticamente el precio_compra_anterior.
 */
async function actualizarPrecioCompra(req, res) {
    try {
        const { proveedorProductoId } = req.params;
        const { precioCompraUnitario } = req.body;

        if (precioCompraUnitario === undefined || precioCompraUnitario < 0) {
            return res.status(400).json({ ok: false, error: 'precioCompraUnitario inválido' });
        }

        const { rows } = await pool.query(
            `UPDATE proveedor_producto
             SET precio_compra_unitario = $1
             WHERE id = $2
             RETURNING *`,
            [precioCompraUnitario, proveedorProductoId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
        }

        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/**
 * PUT /api/precios/:proveedorProductoId/proveedor-principal
 * Marca un proveedor como el proveedor principal para ese producto.
 */
async function marcarProveedorPrincipal(req, res) {
    const client = await pool.connect();
    try {
        const { proveedorProductoId } = req.params;
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT producto_id FROM proveedor_producto WHERE id = $1`,
            [proveedorProductoId]
        );
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
        }
        const { producto_id } = rows[0];

        await client.query(
            `UPDATE proveedor_producto SET es_proveedor_principal = FALSE WHERE producto_id = $1`,
            [producto_id]
        );
        await client.query(
            `UPDATE proveedor_producto SET es_proveedor_principal = TRUE WHERE id = $1`,
            [proveedorProductoId]
        );

        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    } finally {
        client.release();
    }
}

/**
 * GET /api/precios/historial/:proveedorProductoId
 * Serie histórica de precios de compra para graficar la tendencia.
 */
async function obtenerHistorialPrecio(req, res) {
    try {
        const { proveedorProductoId } = req.params;

        const { rows: contexto } = await pool.query(
            `SELECT pr.nombre AS producto_nombre, pr.sku, pv.nombre AS proveedor_nombre
             FROM proveedor_producto pp
             JOIN productos pr ON pr.id = pp.producto_id
             JOIN proveedores pv ON pv.id = pp.proveedor_id
             WHERE pp.id = $1`,
            [proveedorProductoId]
        );

        if (contexto.length === 0) {
            return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
        }

        const { rows: historial } = await pool.query(
            `SELECT precio_compra_unitario, fecha_registro
             FROM historial_precios
             WHERE proveedor_producto_id = $1
             ORDER BY fecha_registro ASC`,
            [proveedorProductoId]
        );

        res.json({
            ok: true,
            producto: contexto[0].producto_nombre,
            sku: contexto[0].sku,
            proveedor: contexto[0].proveedor_nombre,
            data: historial.map((h) => ({
                precioCompraUnitario: Number(h.precio_compra_unitario),
                fechaRegistro: h.fecha_registro,
            })),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/**
 * GET /api/dashboard/kpis
 */
async function obtenerKpis(req, res) {
    try {
        const config = await obtenerConfigActiva();

        const [{ rows: totalProductos }, { rows: proveedoresActivos }, { rows: filas }, { rows: alzas }] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS total FROM productos WHERE activo = TRUE`),
            pool.query(`SELECT COUNT(*)::int AS total FROM proveedores WHERE activo = TRUE`),
            pool.query(`SELECT precio_compra_unitario FROM vw_tablero_precios`),
            pool.query(`SELECT COUNT(*)::int AS total FROM vw_tablero_precios WHERE alerta_subida_precio = TRUE`),
        ]);

        const margenes = filas.map((f) =>
            calcularPVP({ precioCompra: Number(f.precio_compra_unitario), config }).margenRealPct
        );
        const margenPromedio = margenes.length
            ? margenes.reduce((a, b) => a + b, 0) / margenes.length
            : 0;

        res.json({
            ok: true,
            data: {
                totalProductos: totalProductos[0].total,
                proveedoresActivos: proveedoresActivos[0].total,
                margenPromedioPct: Math.round(margenPromedio * 100) / 100,
                alertasSubidaPrecio: alzas[0].total,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = {
    listarTableroPrecios,
    compararProveedoresProducto,
    obtenerHistorialPrecio,
    actualizarPrecioCompra,
    marcarProveedorPrincipal,
    obtenerKpis,
};
