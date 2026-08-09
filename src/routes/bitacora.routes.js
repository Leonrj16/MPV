const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bitacora.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.get('/bitacora', verificarToken, requiereRol('admin'), ctrl.listar);

module.exports = router;
