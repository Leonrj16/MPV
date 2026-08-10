const { crearResena, listarResenasPendientes, moderarResena } = require('../services/resenas');
const { registrarEvento } = require('../services/bitacora');

/** POST /api/tienda/productos/:id/resenas — pública. Queda pendiente de moderación. */
async function crear(req, res) {
    try {
        const { clienteNombre, calificacion, comentario } = req.body;
        const resena = await crearResena({ productoId: Number(req.params.id), clienteNombre, calificacion, comentario });
        res.status(201).json({ ok: true, data: resena });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
}

/** GET /api/resenas/pendientes — admin. */
async function pendientes(req, res) {
    try {
        const data = await listarResenasPendientes();
        res.json({ ok: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/** PUT /api/resenas/:id/moderar — admin. Body: { aprobado: boolean }. */
async function moderar(req, res) {
    try {
        const resena = await moderarResena(req.params.id, Boolean(req.body.aprobado));
        if (!resena) return res.status(404).json({ ok: false, error: 'Reseña no encontrada' });
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: req.body.aprobado ? 'actualizar' : 'eliminar',
            entidad: 'resena',
            entidadId: resena.id,
            detalle: req.body.aprobado
                ? `Aprobó una reseña de "${resena.cliente_nombre}"`
                : `Rechazó una reseña de "${resena.cliente_nombre}"`,
        });
        res.json({ ok: true, data: resena });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { crear, pendientes, moderar };
