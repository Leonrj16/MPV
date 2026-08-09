const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/alertas.controller');
const { verificarToken } = require('../middleware/auth.middleware');

router.get('/alertas', verificarToken, ctrl.obtener);

module.exports = router;
