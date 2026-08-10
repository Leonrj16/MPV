const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/resenas.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');
const { limiteResenas } = require('../middleware/rateLimit.middleware');

// Pública: cualquier visitante de la tienda puede dejar una reseña, sin sesión.
router.post('/tienda/productos/:id/resenas', limiteResenas, ctrl.crear);

router.get('/resenas/pendientes', verificarToken, requiereRol('admin'), ctrl.pendientes);
router.put('/resenas/:id/moderar', verificarToken, requiereRol('admin'), ctrl.moderar);

module.exports = router;
