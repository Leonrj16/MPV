const pool = require('../config/db');

async function listarProveedores(req, res) {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM proveedores WHERE activo = TRUE ORDER BY nombre ASC`
        );
        res.json({ ok: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function crearProveedor(req, res) {
    try {
        const { nombre, contacto, telefono, email, direccion, rucNit } = req.body;
        if (!nombre) {
            return res.status(400).json({ ok: false, error: 'nombre es obligatorio' });
        }
        const { rows } = await pool.query(
            `INSERT INTO proveedores (nombre, contacto, telefono, email, direccion, ruc_nit)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [nombre, contacto || null, telefono || null, email || null, direccion || null, rucNit || null]
        );
        res.status(201).json({ ok: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function actualizarProveedor(req, res) {
    try {
        const { id } = req.params;
        const { nombre, contacto, telefono, email, direccion } = req.body;
        const { rows } = await pool.query(
            `UPDATE proveedores
             SET nombre = COALESCE($1, nombre),
                 contacto = COALESCE($2, contacto),
                 telefono = COALESCE($3, telefono),
                 email = COALESCE($4, email),
                 direccion = COALESCE($5, direccion)
             WHERE id = $6
             RETURNING *`,
            [nombre, contacto, telefono, email, direccion, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
        }
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { listarProveedores, crearProveedor, actualizarProveedor };
