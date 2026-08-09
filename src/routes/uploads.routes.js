const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();
const ctrl = require('../controllers/uploads.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

const TIPOS_PERMITIDOS = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '..', '..', 'public', 'uploads')),
    // Nombre aleatorio (no el original): evita colisiones entre dos admins
    // subiendo "logo.png" el mismo día y cualquier intento de path traversal
    // vía el nombre de archivo que mande el cliente.
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${crypto.randomUUID()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
    fileFilter: (req, file, cb) => {
        if (!TIPOS_PERMITIDOS.has(file.mimetype)) {
            return cb(new Error('Formato de imagen no soportado. Usa PNG, JPG, WEBP o GIF.'));
        }
        cb(null, true);
    },
});

// multer reporta sus propios errores (archivo muy grande, tipo no permitido)
// vía next(err); sin este wrapper, Express los serviría con su página de
// error HTML por defecto en vez de JSON, rompiendo el contrato de /api.
function subirConManejoDeErrores(req, res, next) {
    upload.single('imagen')(req, res, (err) => {
        if (err) return res.status(400).json({ ok: false, error: err.message });
        next();
    });
}

router.post('/uploads/imagen', verificarToken, requiereRol('admin'), subirConManejoDeErrores, ctrl.subirImagen);

module.exports = router;
