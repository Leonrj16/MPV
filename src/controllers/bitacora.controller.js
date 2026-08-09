const { listarBitacora } = require('../services/bitacora');

/** GET /api/bitacora — solo admin. */
async function listar(req, res) {
    try {
        const { entidad, accion, desde, hasta, limite } = req.query;
        const eventos = await listarBitacora({ limite, entidad, accion, desde, hasta });
        res.json({ ok: true, data: eventos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { listar };
