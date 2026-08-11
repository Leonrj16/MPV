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

// Los GET públicos de la tienda (catálogo, destacados, detalle, categorías)
// no tenían ningún freno, a diferencia del resto de endpoints públicos de
// este archivo — cualquiera podía golpearlos sin límite. El máximo es
// generoso (es tráfico de navegación normal, no una acción sensible como
// login) para no afectar a un visitante real cargando la tienda.
const limiteCatalogoTienda = crearLimitador({
    ventanaMinutos: 5,
    maximo: 300,
    mensaje: 'Demasiadas solicitudes en poco tiempo. Intenta de nuevo en unos minutos.',
});

// Este endpoint requiere sesión (admin/operador), así que el riesgo no es
// abuso anónimo sino gastar CPU/RAM de más lanzando Chromium repetidas
// veces en poco tiempo en un VPS chico — nadie necesita generar el
// catálogo más de un puñado de veces en 15 minutos.
const limiteCatalogoPdf = crearLimitador({
    ventanaMinutos: 15,
    maximo: 6,
    mensaje: 'Ya generaste el catálogo varias veces seguidas. Espera unos minutos antes de volver a intentarlo.',
});

module.exports = { limiteLogin, limitePedidos, limiteResenas, limiteCupones, limiteCatalogoPdf, limiteCatalogoTienda };
