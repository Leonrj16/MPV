const pool = require('../config/db');

async function listarCupones() {
    const { rows } = await pool.query('SELECT * FROM cupones ORDER BY created_at DESC');
    return rows;
}

async function crearCupon({ codigo, tipo, valor, fechaExpiracion, usosMaximos, montoMinimo }) {
    if (!codigo || !codigo.trim()) throw new Error('El código es obligatorio');
    if (!['porcentaje', 'monto_fijo'].includes(tipo)) throw new Error('El tipo debe ser "porcentaje" o "monto_fijo"');
    if (!valor || valor <= 0) throw new Error('El valor debe ser mayor a 0');
    if (tipo === 'porcentaje' && valor > 100) throw new Error('Un descuento porcentual no puede superar 100%');

    const { rows } = await pool.query(
        `INSERT INTO cupones (codigo, tipo, valor, fecha_expiracion, usos_maximos, monto_minimo)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [codigo.trim().toUpperCase(), tipo, valor, fechaExpiracion || null, usosMaximos || null, montoMinimo || 0]
    );
    return rows[0];
}

async function actualizarCupon(id, { activo, fechaExpiracion, usosMaximos, valor }) {
    const { rows } = await pool.query(
        `UPDATE cupones SET
            activo = COALESCE($1, activo),
            fecha_expiracion = COALESCE($2, fecha_expiracion),
            usos_maximos = COALESCE($3, usos_maximos),
            valor = COALESCE($4, valor)
         WHERE id = $5 RETURNING *`,
        [activo, fechaExpiracion || null, usosMaximos || null, valor || null, id]
    );
    return rows[0] || null;
}

/**
 * Valida un cupón contra un subtotal y devuelve el descuento resultante —
 * no lo marca como usado todavía (eso pasa recién cuando el pedido se
 * confirma de verdad, en incrementarUso).
 */
async function validarCupon(codigo, subtotal) {
    if (!codigo) throw new Error('Ingresa un código de cupón');
    const { rows } = await pool.query('SELECT * FROM cupones WHERE UPPER(codigo) = UPPER($1)', [codigo]);
    const cupon = rows[0];

    if (!cupon) throw new Error('Cupón no válido');
    if (!cupon.activo) throw new Error('Este cupón ya no está activo');
    if (cupon.fecha_expiracion && new Date(cupon.fecha_expiracion) < new Date()) throw new Error('Este cupón expiró');
    if (cupon.usos_maximos !== null && cupon.usos_actuales >= cupon.usos_maximos) {
        throw new Error('Este cupón alcanzó su límite de usos');
    }
    if (Number(cupon.monto_minimo) > 0 && subtotal < Number(cupon.monto_minimo)) {
        throw new Error(`Este cupón requiere un mínimo de compra de S/ ${Number(cupon.monto_minimo).toFixed(2)}`);
    }

    const descuento = cupon.tipo === 'porcentaje'
        ? Math.round(subtotal * (Number(cupon.valor) / 100) * 100) / 100
        : Math.min(Number(cupon.valor), subtotal);

    return { codigo: cupon.codigo, tipo: cupon.tipo, valor: Number(cupon.valor), descuento };
}

async function incrementarUso(codigo) {
    await pool.query('UPDATE cupones SET usos_actuales = usos_actuales + 1 WHERE UPPER(codigo) = UPPER($1)', [codigo]);
}

module.exports = { listarCupones, crearCupon, actualizarCupon, validarCupon, incrementarUso };
