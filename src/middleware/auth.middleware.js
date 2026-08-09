const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mpv-dental-dev-secret-change-in-production';

function verificarToken(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ ok: false, error: 'Token de autenticación no provisto' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload; // { sub, nombre, email, rol }
        next();
    } catch (err) {
        return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
    }
}

function requiereRol(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
            return res.status(403).json({ ok: false, error: 'No tienes permisos para realizar esta acción' });
        }
        next();
    };
}

module.exports = { verificarToken, requiereRol, JWT_SECRET };
