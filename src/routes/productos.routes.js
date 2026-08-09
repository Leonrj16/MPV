const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/productos.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.get('/productos', verificarToken, ctrl.listarProductos);
router.post('/productos', verificarToken, requiereRol('admin'), ctrl.crearProducto);
router.put('/productos/:id', verificarToken, requiereRol('admin'), ctrl.actualizarProducto);
router.get('/categorias', verificarToken, ctrl.listarCategorias);
router.post('/categorias', verificarToken, requiereRol('admin'), ctrl.crearCategoria);
router.put('/categorias/:id', verificarToken, requiereRol('admin'), ctrl.actualizarCategoria);
router.delete('/categorias/:id', verificarToken, requiereRol('admin'), ctrl.eliminarCategoria);

module.exports = router;
