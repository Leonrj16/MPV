const pool = require('../config/db');

async function listarProductos(req, res) {
    try {
        const { rows } = await pool.query(
            `SELECT p.*, c.nombre AS categoria_nombre,
                    COUNT(pp.id) FILTER (WHERE pp.activo) AS proveedores_count
             FROM productos p
             LEFT JOIN categorias c ON c.id = p.categoria_id
             LEFT JOIN proveedor_producto pp ON pp.producto_id = p.id
             GROUP BY p.id, c.nombre
             ORDER BY p.nombre ASC`
        );
        res.json({ ok: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function crearProducto(req, res) {
    try {
        const { sku, nombre, descripcion, categoriaId, unidadMedida, imagenUrl, stockActual } = req.body;
        if (!sku || !nombre) {
            return res.status(400).json({ ok: false, error: 'sku y nombre son obligatorios' });
        }
        const { rows } = await pool.query(
            `INSERT INTO productos (sku, nombre, descripcion, categoria_id, unidad_medida, imagen_url, stock_actual)
             VALUES ($1, $2, $3, $4, COALESCE($5, 'unidad'), $6, COALESCE($7, 0))
             RETURNING *`,
            [sku, nombre, descripcion || null, categoriaId || null, unidadMedida, imagenUrl || null, stockActual ?? null]
        );
        res.status(201).json({ ok: true, data: rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ ok: false, error: 'Ya existe un producto con ese SKU' });
        }
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function actualizarProducto(req, res) {
    try {
        const { id } = req.params;
        const { nombre, descripcion, categoriaId, unidadMedida, stockMinimo, stockActual, activo, imagenUrl } = req.body;

        const { rows } = await pool.query(
            `UPDATE productos
             SET nombre = COALESCE($1, nombre),
                 descripcion = COALESCE($2, descripcion),
                 categoria_id = COALESCE($3, categoria_id),
                 unidad_medida = COALESCE($4, unidad_medida),
                 stock_minimo = COALESCE($5, stock_minimo),
                 stock_actual = COALESCE($6, stock_actual),
                 activo = COALESCE($7, activo),
                 imagen_url = COALESCE($8, imagen_url)
             WHERE id = $9
             RETURNING *`,
            [nombre, descripcion, categoriaId, unidadMedida, stockMinimo, stockActual ?? null, activo, imagenUrl, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
        }
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function listarCategorias(req, res) {
    try {
        const { rows } = await pool.query('SELECT * FROM categorias ORDER BY nombre ASC');
        res.json({ ok: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { listarProductos, crearProducto, actualizarProducto, listarCategorias };
