const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { registrarEvento } = require('../services/bitacora');

async function listarUsuarios(req, res) {
    try {
        const { rows } = await pool.query(
            `SELECT id, nombre, email, rol, activo, ultimo_acceso, created_at
             FROM usuarios ORDER BY nombre ASC`
        );
        res.json({ ok: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function crearUsuario(req, res) {
    try {
        const { nombre, email, password, rol } = req.body;
        if (!nombre || !email || !password) {
            return res.status(400).json({ ok: false, error: 'Nombre, email y contraseña son obligatorios' });
        }
        if (password.length < 8) {
            return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });
        }
        if (rol && !['admin', 'operador'].includes(rol)) {
            return res.status(400).json({ ok: false, error: 'Rol inválido' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const { rows } = await pool.query(
            `INSERT INTO usuarios (nombre, email, password_hash, rol)
             VALUES ($1, $2, $3, COALESCE($4, 'operador'))
             RETURNING id, nombre, email, rol, activo, created_at`,
            [nombre, email, passwordHash, rol]
        );
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'crear',
            entidad: 'usuario',
            entidadId: rows[0].id,
            detalle: `Creó al usuario "${rows[0].nombre}" (${rows[0].email}, rol ${rows[0].rol})`,
        });
        res.status(201).json({ ok: true, data: rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ ok: false, error: 'Ya existe un usuario con ese email' });
        }
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function actualizarUsuario(req, res) {
    try {
        const { id } = req.params;
        const { nombre, rol, activo } = req.body;

        if (Number(id) === req.user.sub && (activo === false || (rol && rol !== 'admin'))) {
            return res.status(400).json({ ok: false, error: 'No puedes desactivarte ni quitarte el rol de administrador a ti mismo' });
        }
        if (rol && !['admin', 'operador'].includes(rol)) {
            return res.status(400).json({ ok: false, error: 'Rol inválido' });
        }

        const { rows } = await pool.query(
            `UPDATE usuarios
             SET nombre = COALESCE($1, nombre),
                 rol = COALESCE($2, rol),
                 activo = COALESCE($3, activo)
             WHERE id = $4
             RETURNING id, nombre, email, rol, activo, ultimo_acceso, created_at`,
            [nombre, rol, activo, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
        }
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'actualizar',
            entidad: 'usuario',
            entidadId: rows[0].id,
            detalle: `Actualizó al usuario "${rows[0].nombre}"`,
        });
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function cambiarPassword(req, res) {
    try {
        const { id } = req.params;
        const { password } = req.body;
        if (!password || password.length < 8) {
            return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const { rows } = await pool.query(
            `UPDATE usuarios SET password_hash = $1 WHERE id = $2 RETURNING id, nombre`,
            [passwordHash, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
        }
        // Nunca se registra la contraseña en sí, solo el hecho del cambio.
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'actualizar',
            entidad: 'usuario',
            entidadId: rows[0].id,
            detalle: `Cambió la contraseña de "${rows[0].nombre}"`,
        });
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { listarUsuarios, crearUsuario, actualizarUsuario, cambiarPassword };
