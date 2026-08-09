const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/configuracion.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.use('/configuracion', verificarToken, requiereRol('admin'));

router.get('/configuracion', ctrl.obtenerConfiguracion);
router.put('/configuracion', ctrl.actualizarConfiguracion);

module.exports = router;
