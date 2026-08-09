const pool = require('../config/db');
const { calcularPVP } = require('../services/pricingEngine');
const { obtenerConfigActiva } = require('../services/tableroPrecios');

/**
 * GET /api/tienda/productos
 * Catálogo público (sin autenticación) para la tienda virtual. Por cada
 * producto activo elige UNA oferta representativa (el proveedor marcado
 * como principal si existe, si no el de menor precio) y expone solo los
 * campos seguros de cara al cliente — nunca costo de compra, proveedor,
 * margen ni datos internos.
 */
async function listarCatalogo(req, res) {
    try {
        const { categoria, busqueda } = req.query;
        const config = await obtenerConfigActiva();

        const condiciones = ['pr.activo = TRUE'];
        const valores = [];

        if (categoria) {
            valores.push(categoria);
            condiciones.push(`c.nombre = $${valores.length}`);
        }
        if (busqueda) {
            valores.push(`%${busqueda}%`);
            condiciones.push(`(pr.nombre ILIKE $${valores.length} OR pr.descripcion ILIKE $${valores.length})`);
        }

        const { rows } = await pool.query(
            `SELECT DISTINCT ON (pr.id)
                pr.id, pr.sku, pr.nombre, pr.descripcion, pr.imagen_url, pr.unidad_medida,
                c.nombre AS categoria_nombre,
                pp.precio_compra_unitario
             FROM productos pr
             JOIN proveedor_producto pp ON pp.producto_id = pr.id AND pp.activo = TRUE
             JOIN proveedores pv ON pv.id = pp.proveedor_id AND pv.activo = TRUE
             LEFT JOIN categorias c ON c.id = pr.categoria_id
             WHERE ${condiciones.join(' AND ')}
             ORDER BY pr.id, pp.es_proveedor_principal DESC, pp.precio_compra_unitario ASC`,
            valores
        );

        const productos = rows.map((fila) => {
            const { pvpSugerido } = calcularPVP({ precioCompra: Number(fila.precio_compra_unitario), config });
            return {
                id: fila.id,
                sku: fila.sku,
                nombre: fila.nombre,
                descripcion: fila.descripcion,
                categoria: fila.categoria_nombre,
                unidadMedida: fila.unidad_medida,
                imagenUrl: fila.imagen_url,
                precio: pvpSugerido,
            };
        });

        res.json({ ok: true, data: productos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/**
 * GET /api/tienda/categorias
 * Solo las categorías que tienen al menos un producto activo con oferta
 * vigente, para no mostrar filtros que devolverían un catálogo vacío.
 */
async function listarCategoriasConStock(req, res) {
    try {
        const { rows } = await pool.query(
            `SELECT DISTINCT c.id, c.nombre
             FROM categorias c
             JOIN productos pr ON pr.categoria_id = c.id AND pr.activo = TRUE
             JOIN proveedor_producto pp ON pp.producto_id = pr.id AND pp.activo = TRUE
             ORDER BY c.nombre ASC`
        );
        res.json({ ok: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { listarCatalogo, listarCategoriasConStock };
