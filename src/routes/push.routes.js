const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/push.controller');
const { limitePedidos } = require('../middleware/rateLimit.middleware');

router.get('/push/vapid-public-key', ctrl.clavePublica);
router.post('/tienda/pedidos/:id/push-subscripcion', limitePedidos, ctrl.suscribir);

module.exports = router;
