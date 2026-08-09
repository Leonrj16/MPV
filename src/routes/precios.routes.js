const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/precios.controller');

router.get('/precios', ctrl.listarTableroPrecios);
router.get('/precios/comparar/:productoId', ctrl.compararProveedoresProducto);
router.put('/precios/:proveedorProductoId', ctrl.actualizarPrecioCompra);
router.put('/precios/:proveedorProductoId/proveedor-principal', ctrl.marcarProveedorPrincipal);
router.get('/dashboard/kpis', ctrl.obtenerKpis);

module.exports = router;
