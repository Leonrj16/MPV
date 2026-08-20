const pool = require('../config/db');

/**
 * Registra un evento de auditoría. Es best-effort a propósito: la bitácora
 * nunca debe poder tumbar la acción real que la originó (crear un producto,
 * registrar una venta, etc.), así que cualquier error se atrapa y se
 * registra en consola en vez de propagarse.
 */
async function registrarEvento({ usuarioId, usuarioNombre, accion, entidad, entidadId, detalle }) {
    try {
        await pool.query(
            `INSERT INTO bitacora (usuario_id, usuario_nombre, accion, entidad, entidad_id, detalle)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [usuarioId || null, usuarioNombre || null, accion, entidad, entidadId || null, detalle || null]
        );
    } catch (err) {
        console.error('No se pudo registrar en la bitácora:', err.message);
    }
}

async function listarBitacora({ limite = 100, pagina = 1, entidad, accion, desde, hasta } = {}) {
    const condiciones = [];
    const valores = [];

    if (entidad) {
        valores.push(entidad);
        condiciones.push(`entidad = $${valores.length}`);
    }
    if (accion) {
        valores.push(accion);
        condiciones.push(`accion = $${valores.length}`);
    }
    if (desde) {
        valores.push(desde);
        condiciones.push(`created_at >= $${valores.length}::date`);
    }
    if (hasta) {
        valores.push(hasta);
        condiciones.push(`created_at < ($${valores.length}::date + interval '1 day')`);
    }

    const whereSql = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const limiteAplicado = Math.min(Number(limite) || 100, 500);
    const offset = (Math.max(1, Number(pagina) || 1) - 1) * limiteAplicado;
    valores.push(limiteAplicado, offset);

    const { rows } = await pool.query(
        `SELECT *, COUNT(*) OVER() AS total_count
         FROM bitacora ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${valores.length - 1}
         OFFSET $${valores.length}`,
        valores
    );

    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
    const eventos = rows.map(({ total_count, ...evento }) => evento);
    return { eventos, total };
}

module.exports = { registrarEvento, listarBitacora };
