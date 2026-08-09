const { obtenerAlertas } = require('../services/alertas');

/** GET /api/alertas — cualquier usuario autenticado (admin u operador). */
async function obtener(req, res) {
    try {
        const data = await obtenerAlertas();
        res.json({ ok: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { obtener };
