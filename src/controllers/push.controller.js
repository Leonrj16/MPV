const { guardarSuscripcion, obtenerClavePublica, estaConfigurado } = require('../services/push');

/** GET /api/push/vapid-public-key — pública. */
function clavePublica(req, res) {
    res.json({ ok: true, data: { publicKey: obtenerClavePublica(), configurado: estaConfigurado() } });
}

/** POST /api/tienda/pedidos/:id/push-subscripcion — pública. */
async function suscribir(req, res) {
    try {
        await guardarSuscripcion(Number(req.params.id), req.body);
        res.status(201).json({ ok: true });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
}

module.exports = { clavePublica, suscribir };
