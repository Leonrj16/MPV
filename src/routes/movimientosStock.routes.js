const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/movimientosStock.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.get('/productos/:productoId/movimientos', verificarToken, ctrl.listar);
router.post('/productos/:productoId/movimientos', verificarToken, requiereRol('admin', 'operador'), ctrl.ajustar);

module.exports = router;
