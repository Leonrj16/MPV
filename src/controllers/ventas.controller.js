const { registrarVenta, listarVentas, listarProductosDisponibles } = require('../services/ventas');

async function crearVenta(req, res) {
    try {
        const { items, cliente, metodoPago } = req.body;
        const venta = await registrarVenta({ items, cliente, metodoPago, usuarioId: req.user?.sub });
        res.status(201).json({ ok: true, data: venta });
    } catch (err) {
        // Errores de negocio (stock insuficiente, producto sin proveedor, etc.)
        // se devuelven como 400 para que el frontend muestre el motivo real.
        res.status(400).json({ ok: false, error: err.message });
    }
}

async function listar(req, res) {
    try {
        const limite = req.query.limite ? Number(req.query.limite) : 20;
        const ventas = await listarVentas({ limite });
        res.json({ ok: true, data: ventas });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function listarDisponibles(req, res) {
    try {
        const productos = await listarProductosDisponibles();
        res.json({ ok: true, data: productos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { crearVenta, listar, listarDisponibles };
