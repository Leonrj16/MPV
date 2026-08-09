const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tienda.controller');

// Rutas públicas: sin verificarToken. Consumidas por la tienda virtual
// (public/tienda.html), no requieren sesión de staff.
router.get('/tienda/productos', ctrl.listarCatalogo);
router.get('/tienda/categorias', ctrl.listarCategoriasConStock);

module.exports = router;
