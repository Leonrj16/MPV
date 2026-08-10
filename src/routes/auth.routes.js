const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auth.controller');
const { verificarToken } = require('../middleware/auth.middleware');
const { limiteLogin } = require('../middleware/rateLimit.middleware');

router.post('/auth/login', limiteLogin, ctrl.login);
router.get('/auth/me', verificarToken, ctrl.me);

module.exports = router;
