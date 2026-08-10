const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/push.controller');

router.get('/push/vapid-public-key', ctrl.clavePublica);
router.post('/tienda/pedidos/:id/push-subscripcion', ctrl.suscribir);

module.exports = router;
