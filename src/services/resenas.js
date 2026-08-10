const pool = require('../config/db');

async function crearResena({ productoId, clienteNombre, calificacion, comentario }) {
    if (!productoId) throw new Error('productoId es obligatorio');
    if (!clienteNombre || !clienteNombre.trim()) throw new Error('Tu nombre es obligatorio');
    const cal = Number(calificacion);
    if (!Number.isInteger(cal) || cal < 1 || cal > 5) throw new Error('La calificación debe ser un número entero entre 1 y 5');

    const { rows } = await pool.query(
        `INSERT INTO resenas_producto (producto_id, cliente_nombre, calificacion, comentario)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [productoId, clienteNombre.trim(), cal, comentario ? comentario.trim() : null]
    );
    return rows[0];
}

/** Solo reseñas aprobadas — es lo que se muestra públicamente en la tienda. */
async function listarResenasAprobadas(productoId) {
    const { rows } = await pool.query(
        `SELECT id, cliente_nombre, calificacion, comentario, created_at
         FROM resenas_producto WHERE producto_id = $1 AND aprobado = TRUE
         ORDER BY created_at DESC`,
        [productoId]
    );
    const promedio = rows.length
        ? Math.round((rows.reduce((s, r) => s + r.calificacion, 0) / rows.length) * 10) / 10
        : null;
    return { resenas: rows, promedio, total: rows.length };
}

async function listarResenasPendientes() {
    const { rows } = await pool.query(
        `SELECT r.*, p.nombre AS producto_nombre, p.sku
         FROM resenas_producto r
         JOIN productos p ON p.id = r.producto_id
         WHERE r.aprobado = FALSE
         ORDER BY r.created_at ASC`
    );
    return rows;
}

/** aprobado=true la publica; aprobado=false la descarta (no existe un estado "rechazada" que mostrar en ningún lado). */
async function moderarResena(id, aprobado) {
    if (aprobado) {
        const { rows } = await pool.query('UPDATE resenas_producto SET aprobado = TRUE WHERE id = $1 RETURNING *', [id]);
        return rows[0] || null;
    }
    const { rows } = await pool.query('DELETE FROM resenas_producto WHERE id = $1 RETURNING *', [id]);
    return rows[0] || null;
}

module.exports = { crearResena, listarResenasAprobadas, listarResenasPendientes, moderarResena };
