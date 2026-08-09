const pool = require('../config/db');
const { calcularPVP } = require('./pricingEngine');
const { obtenerConfigActiva } = require('./tableroPrecios');

const ESTADOS_VALIDOS = ['pendiente', 'atendido', 'cancelado'];

/**
 * Registra un pedido que llegó desde la tienda virtual. A diferencia de
 * registrarVenta() (Punto de Venta), esto NO toca stock — es un registro de
 * intención de compra, no un hecho consumado. Si el negocio lo atiende, el
 * staff lo procesa como una venta real desde Punto de Venta (ahí sí se
 * valida y descuenta stock); este registro solo existe para que la
 * solicitud no se pierda en el chat de WhatsApp.
 */
async function registrarPedidoWeb({ items, cliente, telefono }) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('El pedido debe incluir al menos un producto');
    }

    const config = await obtenerConfigActiva();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const detalle = [];
        let total = 0;

        for (const item of items) {
            const productoId = Number(item.productoId);
            const cantidad = Number(item.cantidad);

            if (!Number.isInteger(productoId) || productoId <= 0) {
                throw new Error('Cada línea del pedido requiere un producto válido');
            }
            if (!Number.isInteger(cantidad) || cantidad <= 0) {
                throw new Error('La cantidad debe ser un número entero mayor a 0');
            }

            const { rows: productoRows } = await client.query(
                'SELECT id, nombre FROM productos WHERE id = $1 AND activo = TRUE',
                [productoId]
            );
            if (productoRows.length === 0) {
                throw new Error(`Producto #${productoId} no encontrado`);
            }

            const { rows: optimoRows } = await client.query(
                'SELECT precio_compra_unitario FROM vw_proveedor_optimo WHERE producto_id = $1',
                [productoId]
            );
            if (optimoRows.length === 0) {
                throw new Error(`"${productoRows[0].nombre}" ya no tiene un precio disponible`);
            }

            const { pvpSugerido } = calcularPVP({
                precioCompra: Number(optimoRows[0].precio_compra_unitario),
                config,
            });

            const subtotal = Math.round(pvpSugerido * cantidad * 100) / 100;
            detalle.push({ productoId, nombre: productoRows[0].nombre, cantidad, precioUnitario: pvpSugerido, subtotal });
            total += subtotal;
        }

        total = Math.round(total * 100) / 100;

        const { rows: pedidoRows } = await client.query(
            `INSERT INTO pedidos_web (cliente, telefono, total) VALUES ($1, $2, $3) RETURNING *`,
            [cliente || null, telefono || null, total]
        );
        const pedido = pedidoRows[0];

        for (const linea of detalle) {
            await client.query(
                `INSERT INTO pedido_web_detalle (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [pedido.id, linea.productoId, linea.cantidad, linea.precioUnitario, linea.subtotal]
            );
        }

        await client.query('COMMIT');
        return { ...pedido, items: detalle };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function listarPedidosWeb({ estado } = {}) {
    const condiciones = [];
    const valores = [];
    if (estado) {
        valores.push(estado);
        condiciones.push(`p.estado = $${valores.length}`);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const { rows } = await pool.query(
        `SELECT p.*,
                COALESCE(json_agg(json_build_object(
                    'productoId', pd.producto_id,
                    'producto', pr.nombre,
                    'sku', pr.sku,
                    'cantidad', pd.cantidad,
                    'precioUnitario', pd.precio_unitario,
                    'subtotal', pd.subtotal
                ) ORDER BY pd.id) FILTER (WHERE pd.id IS NOT NULL), '[]') AS items
         FROM pedidos_web p
         LEFT JOIN pedido_web_detalle pd ON pd.pedido_id = p.id
         LEFT JOIN productos pr ON pr.id = pd.producto_id
         ${where}
         GROUP BY p.id
         ORDER BY p.created_at DESC`,
        valores
    );
    return rows;
}

async function actualizarEstadoPedido(id, estado) {
    if (!ESTADOS_VALIDOS.includes(estado)) {
        throw new Error(`Estado inválido: debe ser uno de ${ESTADOS_VALIDOS.join(', ')}`);
    }
    const { rows } = await pool.query(
        'UPDATE pedidos_web SET estado = $1 WHERE id = $2 RETURNING *',
        [estado, id]
    );
    return rows[0] || null;
}

module.exports = { registrarPedidoWeb, listarPedidosWeb, actualizarEstadoPedido };
