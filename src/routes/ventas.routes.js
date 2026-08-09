const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/ventas.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.get('/ventas', verificarToken, ctrl.listar);
router.get('/ventas/productos-disponibles', verificarToken, ctrl.listarDisponibles);
router.get('/ventas/:id/boleta', verificarToken, ctrl.generarBoletaPdf);
router.post('/ventas', verificarToken, requiereRol('admin', 'operador'), ctrl.crearVenta);

module.exports = router;
