const pool = require('../config/db');
const { registrarEvento } = require('../services/bitacora');

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
        const { sku, nombre, descripcion, categoriaId, unidadMedida, imagenUrl, stockActual, fechaVencimiento } = req.body;
        if (!sku || !nombre) {
            return res.status(400).json({ ok: false, error: 'sku y nombre son obligatorios' });
        }
        const { rows } = await pool.query(
            `INSERT INTO productos (sku, nombre, descripcion, categoria_id, unidad_medida, imagen_url, stock_actual, fecha_vencimiento)
             VALUES ($1, $2, $3, $4, COALESCE($5, 'unidad'), $6, COALESCE($7, 0), $8)
             RETURNING *`,
            [sku, nombre, descripcion || null, categoriaId || null, unidadMedida, imagenUrl || null, stockActual ?? null, fechaVencimiento || null]
        );
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'crear',
            entidad: 'producto',
            entidadId: rows[0].id,
            detalle: `Creó el producto "${rows[0].nombre}" (SKU ${rows[0].sku})`,
        });
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
        const { nombre, descripcion, categoriaId, unidadMedida, stockMinimo, stockActual, activo, imagenUrl, fechaVencimiento } = req.body;

        const { rows } = await pool.query(
            `UPDATE productos
             SET nombre = COALESCE($1, nombre),
                 descripcion = COALESCE($2, descripcion),
                 categoria_id = COALESCE($3, categoria_id),
                 unidad_medida = COALESCE($4, unidad_medida),
                 stock_minimo = COALESCE($5, stock_minimo),
                 stock_actual = COALESCE($6, stock_actual),
                 activo = COALESCE($7, activo),
                 imagen_url = COALESCE($8, imagen_url),
                 fecha_vencimiento = COALESCE($9, fecha_vencimiento)
             WHERE id = $10
             RETURNING *`,
            [nombre, descripcion, categoriaId, unidadMedida, stockMinimo, stockActual ?? null, activo, imagenUrl, fechaVencimiento || null, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
        }
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'actualizar',
            entidad: 'producto',
            entidadId: rows[0].id,
            detalle: `Actualizó el producto "${rows[0].nombre}"`,
        });
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function listarCategorias(req, res) {
    try {
        // productos_count incluye inactivos a propósito: es la señal para
        // advertir antes de borrar ("esta categoría tiene 3 productos").
        const { rows } = await pool.query(
            `SELECT c.*, COUNT(p.id) AS productos_count
             FROM categorias c
             LEFT JOIN productos p ON p.categoria_id = c.id
             GROUP BY c.id
             ORDER BY c.nombre ASC`
        );
        res.json({ ok: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function crearCategoria(req, res) {
    try {
        const nombre = (req.body.nombre || '').trim();
        if (!nombre) {
            return res.status(400).json({ ok: false, error: 'El nombre de la categoría es obligatorio' });
        }
        const { rows } = await pool.query(
            'INSERT INTO categorias (nombre, descripcion) VALUES ($1, $2) RETURNING *',
            [nombre, req.body.descripcion || null]
        );
        res.status(201).json({ ok: true, data: { ...rows[0], productos_count: 0 } });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ ok: false, error: 'Ya existe una categoría con ese nombre' });
        }
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function actualizarCategoria(req, res) {
    try {
        const { id } = req.params;
        const nombre = (req.body.nombre ?? '').trim();
        const { descripcion } = req.body;

        const { rows } = await pool.query(
            `UPDATE categorias
             SET nombre = COALESCE(NULLIF($1, ''), nombre),
                 descripcion = COALESCE($2, descripcion)
             WHERE id = $3
             RETURNING *`,
            [nombre, descripcion ?? null, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Categoría no encontrada' });
        }
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ ok: false, error: 'Ya existe una categoría con ese nombre' });
        }
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function eliminarCategoria(req, res) {
    try {
        const { id } = req.params;
        // ON DELETE SET NULL en productos.categoria_id: los productos de esta
        // categoría quedan "Sin categoría" en vez de bloquear el borrado.
        const { rows } = await pool.query('DELETE FROM categorias WHERE id = $1 RETURNING *', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Categoría no encontrada' });
        }
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = {
    listarProductos,
    crearProducto,
    actualizarProducto,
    listarCategorias,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
};
