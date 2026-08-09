const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/usuarios.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.use('/usuarios', verificarToken, requiereRol('admin'));

router.get('/usuarios', ctrl.listarUsuarios);
router.post('/usuarios', ctrl.crearUsuario);
router.put('/usuarios/:id', ctrl.actualizarUsuario);
router.put('/usuarios/:id/password', ctrl.cambiarPassword);

module.exports = router;
