const { listarBitacora } = require('../services/bitacora');

/** GET /api/bitacora — solo admin. */
async function listar(req, res) {
    try {
        const { entidad, accion, desde, hasta, limite } = req.query;
        const pagina = req.query.pagina ? Number(req.query.pagina) : 1;
        const limiteAplicado = limite ? Number(limite) : 50;
        const { eventos, total } = await listarBitacora({ limite: limiteAplicado, pagina, entidad, accion, desde, hasta });
        res.json({
            ok: true,
            data: eventos,
            paginacion: { pagina, limite: limiteAplicado, total, totalPaginas: Math.max(1, Math.ceil(total / limiteAplicado)) },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { listar };
