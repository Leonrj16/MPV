const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/catalogoPdf.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');
const { limiteCatalogoPdf } = require('../middleware/rateLimit.middleware');

router.get('/catalogo/pdf', verificarToken, requiereRol('admin', 'operador'), limiteCatalogoPdf, ctrl.generarPdf);

module.exports = router;
