const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/backups.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');

router.get('/backups', verificarToken, requiereRol('admin'), ctrl.listar);
router.post('/backups', verificarToken, requiereRol('admin'), ctrl.generar);
router.get('/backups/:nombre/descargar', verificarToken, requiereRol('admin'), ctrl.descargar);

module.exports = router;
