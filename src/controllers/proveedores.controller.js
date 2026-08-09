const pool = require('../config/db');
const { registrarEvento } = require('../services/bitacora');

async function listarProveedores(req, res) {
    try {
        const { rows } = await pool.query(
            `SELECT pv.*, COUNT(pp.id) FILTER (WHERE pp.activo) AS productos_count
             FROM proveedores pv
             LEFT JOIN proveedor_producto pp ON pp.proveedor_id = pv.id
             GROUP BY pv.id
             ORDER BY pv.nombre ASC`
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
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'crear',
            entidad: 'proveedor',
            entidadId: rows[0].id,
            detalle: `Creó el proveedor "${rows[0].nombre}"`,
        });
        res.status(201).json({ ok: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function actualizarProveedor(req, res) {
    try {
        const { id } = req.params;
        const { nombre, contacto, telefono, email, direccion, rucNit, calificacion, activo } = req.body;
        const { rows } = await pool.query(
            `UPDATE proveedores
             SET nombre = COALESCE($1, nombre),
                 contacto = COALESCE($2, contacto),
                 telefono = COALESCE($3, telefono),
                 email = COALESCE($4, email),
                 direccion = COALESCE($5, direccion),
                 ruc_nit = COALESCE($6, ruc_nit),
                 calificacion = COALESCE($7, calificacion),
                 activo = COALESCE($8, activo)
             WHERE id = $9
             RETURNING *`,
            [nombre, contacto, telefono, email, direccion, rucNit, calificacion, activo, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
        }
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'actualizar',
            entidad: 'proveedor',
            entidadId: rows[0].id,
            detalle: `Actualizó el proveedor "${rows[0].nombre}"`,
        });
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { listarProveedores, crearProveedor, actualizarProveedor };
