const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auth.controller');
const { verificarToken } = require('../middleware/auth.middleware');

router.post('/auth/login', ctrl.login);
router.get('/auth/me', verificarToken, ctrl.me);

module.exports = router;
