const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/ventas.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.get('/ventas', verificarToken, ctrl.listar);
router.get('/ventas/productos-disponibles', verificarToken, ctrl.listarDisponibles);
router.post('/ventas', verificarToken, requiereRol('admin', 'operador'), ctrl.crearVenta);

module.exports = router;
