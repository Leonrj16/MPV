const pool = require('../config/db');

/**
 * Sugerencias de orden de compra: toma los mismos productos que ya
 * dispararían una alerta de reabastecimiento (stock <= stock_minimo, o
 * agotado) y los agrupa por proveedor óptimo vigente, con una cantidad
 * sugerida simple — reponer hasta el doble del stock mínimo configurado.
 * Productos sin stock mínimo configurado o sin proveedor activo no se
 * pueden sugerir automáticamente (no hay de dónde sacar la cantidad ni a
 * quién pedirle) y se excluyen en vez de adivinar un número.
 */
async function sugerirOrdenesCompra() {
    const { rows } = await pool.query(
        `SELECT p.id AS producto_id, p.nombre, p.sku, p.stock_actual, p.stock_minimo,
                opt.proveedor_id, pv.nombre AS proveedor_nombre, opt.precio_compra_unitario
         FROM productos p
         JOIN vw_proveedor_optimo opt ON opt.producto_id = p.id
         JOIN proveedores pv ON pv.id = opt.proveedor_id AND pv.activo = TRUE
         WHERE p.activo = TRUE AND p.stock_minimo > 0 AND p.stock_actual <= p.stock_minimo
         ORDER BY pv.nombre ASC, p.nombre ASC`
    );

    const porProveedor = new Map();
    for (const fila of rows) {
        const cantidadSugerida = Math.max(fila.stock_minimo * 2 - fila.stock_actual, fila.stock_minimo);
        const precioUnitario = Number(fila.precio_compra_unitario);
        const item = {
            productoId: fila.producto_id,
            nombre: fila.nombre,
            sku: fila.sku,
            stockActual: fila.stock_actual,
            stockMinimo: fila.stock_minimo,
            cantidadSugerida,
            precioCompraUnitario: precioUnitario,
            subtotal: Math.round(cantidadSugerida * precioUnitario * 100) / 100,
        };
        if (!porProveedor.has(fila.proveedor_id)) {
            porProveedor.set(fila.proveedor_id, {
                proveedorId: fila.proveedor_id,
                proveedorNombre: fila.proveedor_nombre,
                items: [],
                total: 0,
            });
        }
        const grupo = porProveedor.get(fila.proveedor_id);
        grupo.items.push(item);
        grupo.total = Math.round((grupo.total + item.subtotal) * 100) / 100;
    }

    return [...porProveedor.values()];
}

/** Crea una orden de compra en estado 'borrador' a partir de items ya decididos por el usuario. */
async function crearOrdenCompra({ proveedorId, items, notas, usuarioId }) {
    if (!proveedorId) {
        throw new Error('proveedorId es obligatorio');
    }
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('La orden necesita al menos un producto');
    }
    for (const item of items) {
        if (!Number.isInteger(Number(item.productoId)) || Number(item.productoId) <= 0) {
            throw new Error('Cada item necesita un productoId válido');
        }
        if (!Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) <= 0) {
            throw new Error('Cada item necesita una cantidad entera mayor a 0');
        }
        if (Number(item.precioCompraUnitario) < 0 || Number.isNaN(Number(item.precioCompraUnitario))) {
            throw new Error('Cada item necesita un precio de compra válido');
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const total = Math.round(
            items.reduce((acc, item) => acc + Number(item.cantidad) * Number(item.precioCompraUnitario), 0) * 100
        ) / 100;

        const { rows: ordenRows } = await client.query(
            `INSERT INTO ordenes_compra (proveedor_id, total, notas, usuario_id)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [proveedorId, total, notas || null, usuarioId || null]
        );
        const orden = ordenRows[0];

        for (const item of items) {
            const subtotal = Math.round(Number(item.cantidad) * Number(item.precioCompraUnitario) * 100) / 100;
            await client.query(
                `INSERT INTO orden_compra_detalle (orden_id, producto_id, cantidad, precio_compra_unitario, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [orden.id, item.productoId, item.cantidad, item.precioCompraUnitario, subtotal]
            );
        }

        await client.query('COMMIT');
        return orden;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function listarOrdenesCompra({ estado } = {}) {
    const condiciones = [];
    const valores = [];
    if (estado) {
        valores.push(estado);
        condiciones.push(`oc.estado = $${valores.length}`);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const { rows } = await pool.query(
        `SELECT oc.id, oc.estado, oc.total, oc.notas, oc.created_at, oc.updated_at,
                pv.id AS proveedor_id, pv.nombre AS proveedor_nombre,
                COUNT(ocd.id)::int AS cantidad_items
         FROM ordenes_compra oc
         JOIN proveedores pv ON pv.id = oc.proveedor_id
         LEFT JOIN orden_compra_detalle ocd ON ocd.orden_id = oc.id
         ${where}
         GROUP BY oc.id, pv.id
         ORDER BY oc.created_at DESC`,
        valores
    );
    return rows;
}

async function obtenerOrdenCompra(id) {
    const { rows: ordenRows } = await pool.query(
        `SELECT oc.*, pv.nombre AS proveedor_nombre, pv.contacto, pv.telefono, pv.email, pv.direccion
         FROM ordenes_compra oc
         JOIN proveedores pv ON pv.id = oc.proveedor_id
         WHERE oc.id = $1`,
        [id]
    );
    if (ordenRows.length === 0) return null;

    const { rows: items } = await pool.query(
        `SELECT ocd.*, p.nombre AS producto_nombre, p.sku
         FROM orden_compra_detalle ocd
         JOIN productos p ON p.id = ocd.producto_id
         WHERE ocd.orden_id = $1
         ORDER BY p.nombre ASC`,
        [id]
    );

    return { ...ordenRows[0], items };
}

const TRANSICIONES_VALIDAS = {
    borrador: ['enviada', 'cancelada'],
    enviada: ['recibida', 'cancelada'],
    recibida: [],
    cancelada: [],
};

/**
 * Cambia el estado de una orden. Al pasar a 'recibida' se suma el stock
 * recibido a cada producto y queda registrado en movimientos_stock — la
 * misma tabla que ya usan las ventas y los ajustes manuales — para que el
 * historial de un producto muestre de dónde salió cada cambio de stock.
 */
async function actualizarEstadoOrdenCompra(id, nuevoEstado, usuarioId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query('SELECT * FROM ordenes_compra WHERE id = $1 FOR UPDATE', [id]);
        if (rows.length === 0) {
            throw new Error('Orden de compra no encontrada');
        }
        const orden = rows[0];

        const permitidos = TRANSICIONES_VALIDAS[orden.estado] || [];
        if (!permitidos.includes(nuevoEstado)) {
            throw new Error(`No se puede pasar una orden de "${orden.estado}" a "${nuevoEstado}"`);
        }

        await client.query('UPDATE ordenes_compra SET estado = $1 WHERE id = $2', [nuevoEstado, id]);

        if (nuevoEstado === 'recibida') {
            const { rows: items } = await client.query(
                'SELECT producto_id, cantidad FROM orden_compra_detalle WHERE orden_id = $1',
                [id]
            );
            for (const item of items) {
                const { rows: prodRows } = await client.query(
                    'SELECT stock_actual FROM productos WHERE id = $1 FOR UPDATE',
                    [item.producto_id]
                );
                const stockResultante = prodRows[0].stock_actual + item.cantidad;
                await client.query('UPDATE productos SET stock_actual = $1 WHERE id = $2', [stockResultante, item.producto_id]);
                await client.query(
                    `INSERT INTO movimientos_stock (producto_id, tipo, cantidad_delta, stock_resultante, usuario_id, motivo, orden_compra_id)
                     VALUES ($1, 'recepcion_compra', $2, $3, $4, $5, $6)`,
                    [item.producto_id, item.cantidad, stockResultante, usuarioId || null, `Recepción de orden de compra #${id}`, id]
                );
            }
        }

        await client.query('COMMIT');
        return { ...orden, estado: nuevoEstado };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    sugerirOrdenesCompra,
    crearOrdenCompra,
    listarOrdenesCompra,
    obtenerOrdenCompra,
    actualizarEstadoOrdenCompra,
};
