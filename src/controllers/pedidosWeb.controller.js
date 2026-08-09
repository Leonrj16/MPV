const { registrarPedidoWeb, listarPedidosWeb, actualizarEstadoPedido } = require('../services/pedidosWeb');

/** POST /api/tienda/pedidos — pública, la llama la tienda antes de abrir WhatsApp. */
async function crearPedido(req, res) {
    try {
        const { items, cliente, telefono } = req.body;
        const pedido = await registrarPedidoWeb({ items, cliente, telefono });
        res.status(201).json({ ok: true, data: pedido });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
}

async function listar(req, res) {
    try {
        const { estado } = req.query;
        const pedidos = await listarPedidosWeb({ estado });
        res.json({ ok: true, data: pedidos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function actualizarEstado(req, res) {
    try {
        const pedido = await actualizarEstadoPedido(req.params.id, req.body.estado);
        if (!pedido) {
            return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
        }
        res.json({ ok: true, data: pedido });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
}

module.exports = { crearPedido, listar, actualizarEstado };
