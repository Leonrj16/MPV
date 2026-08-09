const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/productos.controller');

router.get('/productos', ctrl.listarProductos);
router.post('/productos', ctrl.crearProducto);
router.get('/categorias', ctrl.listarCategorias);

module.exports = router;
