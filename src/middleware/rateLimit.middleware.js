const rateLimit = require('express-rate-limit');

/**
 * Limitadores para endpoints públicos (sin sesión) que cualquier visitante
 * de internet puede llamar directamente — sin esto, alguien podía probar
 * códigos de cupón por fuerza bruta, inundar de pedidos/reseñas falsas, o
 * intentar adivinar contraseñas de login sin ningún freno.
 */
function crearLimitador({ ventanaMinutos, maximo, mensaje }) {
    return rateLimit({
        windowMs: ventanaMinutos * 60 * 1000,
        max: maximo,
        standardHeaders: true,
        legacyHeaders: false,
        message: { ok: false, error: mensaje },
    });
}

const limiteLogin = crearLimitador({
    ventanaMinutos: 15,
    maximo: 10,
    mensaje: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.',
});

const limitePedidos = crearLimitador({
    ventanaMinutos: 15,
    maximo: 20,
    mensaje: 'Demasiados pedidos en poco tiempo. Intenta de nuevo en unos minutos.',
});

const limiteResenas = crearLimitador({
    ventanaMinutos: 15,
    maximo: 10,
    mensaje: 'Demasiadas reseñas enviadas en poco tiempo. Intenta de nuevo más tarde.',
});

const limiteCupones = crearLimitador({
    ventanaMinutos: 15,
    maximo: 30,
    mensaje: 'Demasiados intentos de cupón en poco tiempo. Intenta de nuevo en unos minutos.',
});

module.exports = { limiteLogin, limitePedidos, limiteResenas, limiteCupones };
