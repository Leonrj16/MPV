const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reportes.controller');
const { verificarToken } = require('../middleware/auth.middleware');

router.get('/reportes/inventario', verificarToken, ctrl.obtenerInventario);
router.get('/reportes/inventario/exportar/excel', verificarToken, ctrl.exportarInventarioExcel);
router.get('/reportes/inventario/exportar/pdf', verificarToken, ctrl.exportarInventarioPDF);
router.get('/reportes/clientes-frecuentes', verificarToken, ctrl.obtenerClientesFrecuentesCtrl);
router.get('/reportes/clientes-frecuentes/exportar/excel', verificarToken, ctrl.exportarClientesFrecuentesExcel);

module.exports = router;
