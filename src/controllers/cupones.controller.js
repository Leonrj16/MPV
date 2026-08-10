const { listarCupones, crearCupon, actualizarCupon, validarCupon } = require('../services/cupones');
const { registrarEvento } = require('../services/bitacora');

async function listar(req, res) {
    try {
        const data = await listarCupones();
        res.json({ ok: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function crear(req, res) {
    try {
        const cupon = await crearCupon(req.body);
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'crear',
            entidad: 'cupon',
            entidadId: cupon.id,
            detalle: `Creó el cupón "${cupon.codigo}" (${cupon.tipo === 'porcentaje' ? cupon.valor + '%' : 'S/ ' + cupon.valor})`,
        });
        res.status(201).json({ ok: true, data: cupon });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
}

async function actualizar(req, res) {
    try {
        const cupon = await actualizarCupon(req.params.id, req.body);
        if (!cupon) return res.status(404).json({ ok: false, error: 'Cupón no encontrado' });
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'actualizar',
            entidad: 'cupon',
            entidadId: cupon.id,
            detalle: `Actualizó el cupón "${cupon.codigo}"`,
        });
        res.json({ ok: true, data: cupon });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
}

/** POST /api/tienda/cupones/validar — pública, la llama el carrito antes de confirmar el pedido. */
async function validar(req, res) {
    try {
        const { codigo, subtotal } = req.body;
        const resultado = await validarCupon(codigo, Number(subtotal) || 0);
        res.json({ ok: true, data: resultado });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
}

module.exports = { listar, crear, actualizar, validar };
