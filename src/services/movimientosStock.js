const pool = require('../config/db');

/** Historial de movimientos de un producto, más reciente primero. */
async function listarMovimientos(productoId, { limite = 50 } = {}) {
    const { rows } = await pool.query(
        `SELECT m.*, u.nombre AS usuario_nombre
         FROM movimientos_stock m
         LEFT JOIN usuarios u ON u.id = m.usuario_id
         WHERE m.producto_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2`,
        [productoId, limite]
    );
    return rows;
}

/**
 * Ajuste manual de stock (conteo físico, merma, corrección de error, etc.).
 * A diferencia de una venta, aquí el delta puede ser positivo o negativo y
 * requiere un motivo — queda registrado en movimientos_stock para poder
 * explicar después por qué el stock no cuadra con las ventas registradas.
 */
async function ajustarStock({ productoId, delta, motivo, usuarioId }) {
    const id = Number(productoId);
    const cambio = Number(delta);

    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('Producto inválido');
    }
    if (!Number.isInteger(cambio) || cambio === 0) {
        throw new Error('El ajuste debe ser un número entero distinto de 0');
    }
    if (!motivo || !motivo.trim()) {
        throw new Error('El ajuste manual de stock requiere un motivo');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            'SELECT id, nombre, stock_actual FROM productos WHERE id = $1 FOR UPDATE',
            [id]
        );
        if (rows.length === 0) {
            throw new Error('Producto no encontrado');
        }
        const producto = rows[0];
        const stockResultante = producto.stock_actual + cambio;
        if (stockResultante < 0) {
            throw new Error(
                `El ajuste dejaría el stock en negativo: actual ${producto.stock_actual}, ajuste ${cambio}`
            );
        }

        await client.query('UPDATE productos SET stock_actual = $1 WHERE id = $2', [stockResultante, id]);

        const { rows: movRows } = await client.query(
            `INSERT INTO movimientos_stock (producto_id, tipo, cantidad_delta, stock_resultante, usuario_id, motivo)
             VALUES ($1, 'ajuste_manual', $2, $3, $4, $5) RETURNING *`,
            [id, cambio, stockResultante, usuarioId || null, motivo.trim()]
        );

        await client.query('COMMIT');
        return movRows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { listarMovimientos, ajustarStock };
