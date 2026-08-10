const { listarMovimientos, ajustarStock } = require('../services/movimientosStock');
const { registrarEvento } = require('../services/bitacora');

async function listar(req, res) {
    try {
        const movimientos = await listarMovimientos(req.params.productoId, { limite: req.query.limite ? Number(req.query.limite) : 50 });
        res.json({ ok: true, data: movimientos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function ajustar(req, res) {
    try {
        const { delta, motivo } = req.body;
        const movimiento = await ajustarStock({
            productoId: req.params.productoId,
            delta,
            motivo,
            usuarioId: req.user?.sub,
        });
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'actualizar',
            entidad: 'stock',
            entidadId: movimiento.producto_id,
            detalle: `Ajuste manual de stock: ${movimiento.cantidad_delta > 0 ? '+' : ''}${movimiento.cantidad_delta} (${movimiento.motivo})`,
        });
        res.status(201).json({ ok: true, data: movimiento });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
}

module.exports = { listar, ajustar };
