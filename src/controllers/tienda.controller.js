const pool = require('../config/db');
const { calcularPVP } = require('../services/pricingEngine');
const { obtenerConfigActiva } = require('../services/tableroPrecios');
const { listarResenasAprobadas } = require('../services/resenas');

function mapearFila(fila, config) {
    const { pvpSugerido } = calcularPVP({ precioCompra: Number(fila.precio_compra_unitario), config });
    return {
        id: fila.id,
        sku: fila.sku,
        nombre: fila.nombre,
        descripcion: fila.descripcion,
        categoria: fila.categoria_nombre,
        unidadMedida: fila.unidad_medida,
        imagenUrl: fila.imagen_url,
        stockActual: fila.stock_actual,
        precio: pvpSugerido,
    };
}

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
                pr.id, pr.sku, pr.nombre, pr.descripcion, pr.imagen_url, pr.unidad_medida, pr.stock_actual,
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

        // El catálogo se carga una sola vez en la tienda y todo el
        // filtrado/orden ocurre en el cliente (sin ida y vuelta al
        // servidor por cada tecla o cambio de orden) — vendidosTotal viaja
        // con cada producto para poder ordenar por popularidad ahí mismo.
        const { rows: ventasRows } = await pool.query(
            'SELECT producto_id, SUM(cantidad) AS total FROM venta_detalle GROUP BY producto_id'
        );
        const vendidosPorProducto = new Map(ventasRows.map((f) => [f.producto_id, Number(f.total)]));

        const productos = rows.map((fila) => ({
            ...mapearFila(fila, config),
            vendidosTotal: vendidosPorProducto.get(fila.id) || 0,
        }));

        res.json({ ok: true, data: productos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/**
 * GET /api/tienda/productos/:id — detalle de un producto para la vista
 * ampliada (modal), con hasta 4 productos relacionados de la misma
 * categoría.
 */
async function obtenerProductoDetalle(req, res) {
    try {
        const { id } = req.params;
        const config = await obtenerConfigActiva();

        const { rows } = await pool.query(
            `SELECT DISTINCT ON (pr.id)
                pr.id, pr.sku, pr.nombre, pr.descripcion, pr.imagen_url, pr.unidad_medida, pr.stock_actual,
                pr.categoria_id, c.nombre AS categoria_nombre,
                pp.precio_compra_unitario
             FROM productos pr
             JOIN proveedor_producto pp ON pp.producto_id = pr.id AND pp.activo = TRUE
             JOIN proveedores pv ON pv.id = pp.proveedor_id AND pv.activo = TRUE
             LEFT JOIN categorias c ON c.id = pr.categoria_id
             WHERE pr.id = $1 AND pr.activo = TRUE
             ORDER BY pr.id, pp.es_proveedor_principal DESC, pp.precio_compra_unitario ASC`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
        }

        const fila = rows[0];
        const producto = mapearFila(fila, config);

        let relacionados = [];
        if (fila.categoria_id) {
            const { rows: relFilas } = await pool.query(
                `SELECT DISTINCT ON (pr.id)
                    pr.id, pr.sku, pr.nombre, pr.descripcion, pr.imagen_url, pr.unidad_medida, pr.stock_actual,
                    pp.precio_compra_unitario
                 FROM productos pr
                 JOIN proveedor_producto pp ON pp.producto_id = pr.id AND pp.activo = TRUE
                 JOIN proveedores pv ON pv.id = pp.proveedor_id AND pv.activo = TRUE
                 WHERE pr.categoria_id = $1 AND pr.activo = TRUE AND pr.id != $2
                 ORDER BY pr.id, pp.es_proveedor_principal DESC, pp.precio_compra_unitario ASC
                 LIMIT 4`,
                [fila.categoria_id, id]
            );
            relacionados = relFilas.map((f) => mapearFila(f, config));
        }

        const { resenas, promedio, total: totalResenas } = await listarResenasAprobadas(id);

        res.json({ ok: true, data: { ...producto, relacionados, resenas, calificacionPromedio: promedio, totalResenas } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/**
 * GET /api/tienda/destacados — sección "Los Más Vendidos" de la portada.
 * Usa ventas reales (venta_detalle), no una bandera manual de "destacado"
 * que no existe todavía; si aún no hay ventas registradas, cae a los
 * productos activos más recientes para que la sección nunca aparezca vacía.
 */
async function obtenerDestacados(req, res) {
    try {
        const config = await obtenerConfigActiva();
        const limite = 8;

        const { rows: masVendidos } = await pool.query(
            `SELECT pr.id
             FROM venta_detalle vd
             JOIN productos pr ON pr.id = vd.producto_id AND pr.activo = TRUE
             GROUP BY pr.id
             ORDER BY SUM(vd.cantidad) DESC
             LIMIT $1`,
            [limite]
        );

        let idsDestacados = masVendidos.map((f) => f.id);
        const criterio = idsDestacados.length > 0 ? 'mas_vendidos' : 'recientes';

        if (idsDestacados.length === 0) {
            const { rows: recientes } = await pool.query(
                'SELECT id FROM productos WHERE activo = TRUE ORDER BY created_at DESC LIMIT $1',
                [limite]
            );
            idsDestacados = recientes.map((f) => f.id);
        }

        if (idsDestacados.length === 0) {
            return res.json({ ok: true, data: { productos: [], criterio: 'ninguno' } });
        }

        const { rows } = await pool.query(
            `SELECT DISTINCT ON (pr.id)
                pr.id, pr.sku, pr.nombre, pr.descripcion, pr.imagen_url, pr.unidad_medida, pr.stock_actual,
                c.nombre AS categoria_nombre,
                pp.precio_compra_unitario
             FROM productos pr
             JOIN proveedor_producto pp ON pp.producto_id = pr.id AND pp.activo = TRUE
             JOIN proveedores pv ON pv.id = pp.proveedor_id AND pv.activo = TRUE
             LEFT JOIN categorias c ON c.id = pr.categoria_id
             WHERE pr.id = ANY($1::int[])
             ORDER BY pr.id, pp.es_proveedor_principal DESC, pp.precio_compra_unitario ASC`,
            [idsDestacados]
        );

        const porId = new Map(rows.map((fila) => [fila.id, mapearFila(fila, config)]));
        // Conserva el orden de popularidad/recencia calculado arriba (la
        // segunda consulta no garantiza ese orden), y descarta silenciosamente
        // cualquier id que ya no tenga una oferta activa hoy.
        const productos = idsDestacados.map((id) => porId.get(id)).filter(Boolean);

        res.json({ ok: true, data: { productos, criterio } });
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

module.exports = { listarCatalogo, obtenerProductoDetalle, obtenerDestacados, listarCategoriasConStock };
