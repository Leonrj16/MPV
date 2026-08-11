const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tienda.controller');
const configCtrl = require('../controllers/configuracionTienda.controller');
const { verificarToken, requiereRol } = require('../middleware/auth.middleware');
const { limiteCatalogoTienda } = require('../middleware/rateLimit.middleware');

// Rutas públicas: sin verificarToken. Consumidas por la tienda virtual
// (public/tienda.html), no requieren sesión de staff. Llevan rate limit
// porque son las únicas rutas públicas del sistema que antes no lo tenían.
router.get('/tienda/productos', limiteCatalogoTienda, ctrl.listarCatalogo);
router.get('/tienda/destacados', limiteCatalogoTienda, ctrl.obtenerDestacados);
router.get('/tienda/productos/:id', limiteCatalogoTienda, ctrl.obtenerProductoDetalle);
router.get('/tienda/categorias', limiteCatalogoTienda, ctrl.listarCategoriasConStock);

// La configuración de marca de la tienda (logo, imagen, textos, contacto)
// se lee sin token —la consume la propia tienda pública— pero solo un
// admin puede editarla, desde configuracion.html.
router.get('/tienda/configuracion', limiteCatalogoTienda, configCtrl.obtenerConfiguracionTienda);
router.put('/tienda/configuracion', verificarToken, requiereRol('admin'), configCtrl.actualizarConfiguracionTienda);

module.exports = router;
