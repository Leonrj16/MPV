/**
 * Restringe una ruta a pedidos que llegan por loopback — pensada para
 * rutas internas que solo debería llamar el propio servidor (ver
 * routes/catalogoPdf.routes.js: Puppeteer navegando contra sí mismo para
 * renderizar el catálogo), nunca un navegador externo. No depende de
 * TRUST_PROXY: Puppeteer conecta directo a 127.0.0.1, sin pasar por nginx,
 * así que req.ip siempre es la IP real de loopback sin importar cómo esté
 * configurado el resto de la app.
 */
function soloLocalhost(req, res, next) {
    const ip = req.ip;
    const esLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!esLocal) {
        return res.status(403).json({ ok: false, error: 'No autorizado' });
    }
    next();
}

module.exports = { soloLocalhost };
