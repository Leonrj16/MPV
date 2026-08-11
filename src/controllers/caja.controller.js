const { abrirCaja, cerrarCaja, obtenerEstadoActual, listarSesiones } = require('../services/caja');
const { registrarEvento } = require('../services/bitacora');

async function abrir(req, res) {
    try {
        const caja = await abrirCaja({
            usuarioId: req.user?.sub,
            montoApertura: req.body.montoApertura,
            notas: req.body.notas,
        });
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'crear',
            entidad: 'caja_sesion',
            entidadId: caja.id,
            detalle: `Abrió caja con S/ ${Number(caja.monto_apertura).toFixed(2)}`,
        });
        res.status(201).json({ ok: true, data: caja });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
}

async function cerrar(req, res) {
    try {
        const resultado = await cerrarCaja({
            usuarioId: req.user?.sub,
            montoContado: req.body.montoContado,
            notas: req.body.notas,
        });
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'actualizar',
            entidad: 'caja_sesion',
            entidadId: resultado.id,
            detalle: `Cerró caja: contado S/ ${Number(resultado.monto_cierre_contado).toFixed(2)}, diferencia S/ ${resultado.diferencia.toFixed(2)}`,
        });
        res.json({ ok: true, data: resultado });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
}

async function estadoActual(req, res) {
    try {
        const estado = await obtenerEstadoActual();
        res.json({ ok: true, data: estado });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function historial(req, res) {
    try {
        const limite = req.query.limite ? Number(req.query.limite) : 30;
        const sesiones = await listarSesiones({ limite });
        res.json({ ok: true, data: sesiones });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { abrir, cerrar, estadoActual, historial };
