const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reportes.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.get('/reportes/inventario', verificarToken, ctrl.obtenerInventario);
router.get('/reportes/inventario/exportar/excel', verificarToken, ctrl.exportarInventarioExcel);
router.get('/reportes/inventario/exportar/pdf', verificarToken, ctrl.exportarInventarioPDF);
router.get('/reportes/clientes-frecuentes', verificarToken, ctrl.obtenerClientesFrecuentesCtrl);
router.get('/reportes/clientes-frecuentes/exportar/excel', verificarToken, ctrl.exportarClientesFrecuentesExcel);
router.post('/reportes/clientes-frecuentes/cupon-fidelidad', verificarToken, requiereRol('admin', 'operador'), ctrl.generarCuponFidelidadCtrl);
router.get('/reportes/rentabilidad', verificarToken, ctrl.rentabilidad);
router.get('/reportes/baja-rotacion', verificarToken, ctrl.bajaRotacion);

module.exports = router;
