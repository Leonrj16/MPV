const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/catalogoPdf.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');
const { limiteCatalogoPdf } = require('../middleware/rateLimit.middleware');
const { soloLocalhost } = require('../middleware/soloLocalhost.middleware');

router.get('/catalogo/pdf', verificarToken, requiereRol('admin', 'operador'), limiteCatalogoPdf, ctrl.generarPdf);

// Interna: solo la navega Puppeteer contra sí mismo (ver services/catalogoPdf.js) para
// que el HTML del catálogo se renderice en un documento same-origin de verdad — nunca
// se llama desde un navegador externo ni está enlazada en el frontend.
router.get('/internal/catalogo-pdf-html', soloLocalhost, ctrl.renderHtml);

module.exports = router;
