const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/proveedores.controller');

router.get('/proveedores', ctrl.listarProveedores);
router.post('/proveedores', ctrl.crearProveedor);
router.put('/proveedores/:id', ctrl.actualizarProveedor);

module.exports = router;
