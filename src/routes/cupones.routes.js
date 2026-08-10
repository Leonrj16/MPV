const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/cupones.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');
const { limiteCupones } = require('../middleware/rateLimit.middleware');

// Pública: la usa el carrito de la tienda antes de confirmar el pedido.
router.post('/tienda/cupones/validar', limiteCupones, ctrl.validar);

router.get('/cupones', verificarToken, requiereRol('admin'), ctrl.listar);
router.post('/cupones', verificarToken, requiereRol('admin'), ctrl.crear);
router.put('/cupones/:id', verificarToken, requiereRol('admin'), ctrl.actualizar);

module.exports = router;
