const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/ordenesCompra.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.get('/ordenes-compra/sugerencias', verificarToken, ctrl.sugerencias);
router.get('/ordenes-compra', verificarToken, ctrl.listar);
router.get('/ordenes-compra/:id', verificarToken, ctrl.obtener);
router.get('/ordenes-compra/:id/pdf', verificarToken, ctrl.exportarPDF);
router.post('/ordenes-compra', verificarToken, requiereRol('admin', 'operador'), ctrl.crear);
router.put('/ordenes-compra/:id/estado', verificarToken, requiereRol('admin', 'operador'), ctrl.cambiarEstado);

module.exports = router;
