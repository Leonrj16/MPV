const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/proveedores.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.get('/proveedores', verificarToken, ctrl.listarProveedores);
router.post('/proveedores', verificarToken, requiereRol('admin'), ctrl.crearProveedor);
router.put('/proveedores/:id', verificarToken, requiereRol('admin'), ctrl.actualizarProveedor);

module.exports = router;
