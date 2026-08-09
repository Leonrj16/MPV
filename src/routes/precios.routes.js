const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/precios.controller');
const exportCtrl = require('../controllers/export.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.get('/precios', verificarToken, ctrl.listarTableroPrecios);
router.get('/precios/exportar/excel', verificarToken, exportCtrl.exportarExcel);
router.get('/precios/exportar/pdf', verificarToken, exportCtrl.exportarPDF);
router.get('/precios/comparar/:productoId', verificarToken, ctrl.compararProveedoresProducto);
router.get('/precios/historial/:proveedorProductoId', verificarToken, ctrl.obtenerHistorialPrecio);
router.put('/precios/:proveedorProductoId', verificarToken, requiereRol('admin', 'operador'), ctrl.actualizarPrecioCompra);
router.put('/precios/:proveedorProductoId/proveedor-principal', verificarToken, requiereRol('admin', 'operador'), ctrl.marcarProveedorPrincipal);
router.get('/dashboard/kpis', verificarToken, ctrl.obtenerKpis);

module.exports = router;
