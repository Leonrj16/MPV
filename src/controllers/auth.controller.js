const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth.middleware');
const { registrarEvento } = require('../services/bitacora');

const TOKEN_TTL = '8h';

async function login(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ ok: false, error: 'Email y contraseña son obligatorios' });
        }

        const { rows } = await pool.query(
            `SELECT * FROM usuarios WHERE LOWER(email) = LOWER($1) AND activo = TRUE`,
            [email]
        );
        const usuario = rows[0];

        if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
            return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
        }

        await pool.query(`UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1`, [usuario.id]);

        const payload = { sub: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });

        await registrarEvento({
            usuarioId: usuario.id,
            usuarioNombre: usuario.nombre,
            accion: 'iniciar_sesion',
            entidad: 'sesion',
            entidadId: usuario.id,
            detalle: `Inicio de sesión: ${usuario.email}`,
        });

        res.json({ ok: true, data: { token, usuario: payload } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function me(req, res) {
    res.json({ ok: true, data: req.user });
}

module.exports = { login, me };
