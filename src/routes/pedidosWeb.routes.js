const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/pedidosWeb.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');
const { limitePedidos } = require('../middleware/rateLimit.middleware');

// Pública: la tienda virtual la llama justo antes de abrir WhatsApp, sin sesión de staff.
router.post('/tienda/pedidos', limitePedidos, ctrl.crearPedido);

router.get('/pedidos-web', verificarToken, ctrl.listar);
router.get('/pedidos-web/exportar/excel', verificarToken, ctrl.exportarExcel);
router.put('/pedidos-web/:id/estado', verificarToken, requiereRol('admin', 'operador'), ctrl.actualizarEstado);

module.exports = router;
