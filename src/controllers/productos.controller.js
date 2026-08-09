const pool = require('../config/db');

async function listarProductos(req, res) {
    try {
        const { rows } = await pool.query(
            `SELECT p.*, c.nombre AS categoria_nombre
             FROM productos p
             LEFT JOIN categorias c ON c.id = p.categoria_id
             WHERE p.activo = TRUE
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
        const { sku, nombre, descripcion, categoriaId, unidadMedida } = req.body;
        if (!sku || !nombre) {
            return res.status(400).json({ ok: false, error: 'sku y nombre son obligatorios' });
        }
        const { rows } = await pool.query(
            `INSERT INTO productos (sku, nombre, descripcion, categoria_id, unidad_medida)
             VALUES ($1, $2, $3, $4, COALESCE($5, 'unidad'))
             RETURNING *`,
            [sku, nombre, descripcion || null, categoriaId || null, unidadMedida]
        );
        res.status(201).json({ ok: true, data: rows[0] });
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

module.exports = { listarProductos, crearProducto, listarCategorias };
