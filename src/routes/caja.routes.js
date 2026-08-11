const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/caja.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.get('/caja/actual', verificarToken, ctrl.estadoActual);
router.get('/caja/historial', verificarToken, requiereRol('admin'), ctrl.historial);
router.post('/caja/abrir', verificarToken, requiereRol('admin', 'operador'), ctrl.abrir);
router.post('/caja/cerrar', verificarToken, requiereRol('admin', 'operador'), ctrl.cerrar);

module.exports = router;
