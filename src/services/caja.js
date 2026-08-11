const pool = require('../config/db');

async function obtenerCajaAbierta() {
    const { rows } = await pool.query(
        `SELECT cs.*, u.nombre AS usuario_apertura_nombre
         FROM caja_sesiones cs
         LEFT JOIN usuarios u ON u.id = cs.usuario_apertura_id
         WHERE cs.estado = 'abierta'
         LIMIT 1`
    );
    return rows[0] || null;
}

async function abrirCaja({ usuarioId, montoApertura, notas }) {
    const monto = Number(montoApertura);
    if (!Number.isFinite(monto) || monto < 0) {
        throw new Error('El monto de apertura debe ser un número mayor o igual a 0');
    }
    const existente = await obtenerCajaAbierta();
    if (existente) {
        throw new Error('Ya hay una caja abierta — hay que cerrarla antes de abrir otra');
    }
    const { rows } = await pool.query(
        `INSERT INTO caja_sesiones (usuario_apertura_id, monto_apertura, notas_apertura)
         VALUES ($1, $2, $3) RETURNING *`,
        [usuarioId || null, monto, notas || null]
    );
    return rows[0];
}

/**
 * Resumen de ventas de una sesión, agrupado por método de pago. Se arma
 * desde `venta_pagos` (no desde `ventas.metodo_pago`) porque una venta con
 * pago dividido tiene ahí varias líneas — una venta mitad efectivo, mitad
 * tarjeta, queda marcada como 'mixto' en `ventas` pero su parte en efectivo
 * sigue sumando al arqueo. El total y la cantidad de ventas de la sesión se
 * calculan aparte, directo de `ventas`, para no duplicar el conteo cuando
 * una venta tiene más de una línea de pago.
 */
async function obtenerResumenSesion(cajaSesionId) {
    const { rows: porMetodoRows } = await pool.query(
        `SELECT vp.metodo_pago, COUNT(*) AS cantidad, COALESCE(SUM(vp.monto), 0) AS total
         FROM venta_pagos vp
         JOIN ventas v ON v.id = vp.venta_id
         WHERE v.caja_sesion_id = $1
         GROUP BY vp.metodo_pago`,
        [cajaSesionId]
    );
    const { rows: totalesRows } = await pool.query(
        `SELECT COUNT(*) AS cantidad_ventas, COALESCE(SUM(total), 0) AS total_ventas
         FROM ventas
         WHERE caja_sesion_id = $1`,
        [cajaSesionId]
    );

    const porMetodo = porMetodoRows.map((f) => ({ metodoPago: f.metodo_pago, cantidad: Number(f.cantidad), total: Number(f.total) }));
    const totalEfectivo = porMetodo.find((m) => m.metodoPago === 'efectivo')?.total || 0;

    return {
        porMetodo,
        totalVentas: Number(totalesRows[0].total_ventas),
        totalEfectivo,
        cantidadVentas: Number(totalesRows[0].cantidad_ventas),
    };
}

async function obtenerEstadoActual() {
    const caja = await obtenerCajaAbierta();
    if (!caja) return { abierta: false };

    const resumen = await obtenerResumenSesion(caja.id);
    const montoEfectivoEsperado = Number(caja.monto_apertura) + resumen.totalEfectivo;

    return {
        abierta: true,
        caja: {
            id: caja.id,
            montoApertura: Number(caja.monto_apertura),
            notasApertura: caja.notas_apertura,
            abiertaEn: caja.abierta_en,
            usuarioAperturaNombre: caja.usuario_apertura_nombre,
        },
        resumen,
        montoEfectivoEsperado,
    };
}

async function cerrarCaja({ usuarioId, montoContado, notas }) {
    const monto = Number(montoContado);
    if (!Number.isFinite(monto) || monto < 0) {
        throw new Error('El monto contado debe ser un número mayor o igual a 0');
    }
    const caja = await obtenerCajaAbierta();
    if (!caja) {
        throw new Error('No hay ninguna caja abierta para cerrar');
    }

    const resumen = await obtenerResumenSesion(caja.id);
    const montoEfectivoEsperado = Number(caja.monto_apertura) + resumen.totalEfectivo;
    const diferencia = Math.round((monto - montoEfectivoEsperado) * 100) / 100;

    const { rows } = await pool.query(
        `UPDATE caja_sesiones
         SET estado = 'cerrada', usuario_cierre_id = $1, monto_cierre_contado = $2,
             notas_cierre = $3, cerrada_en = NOW()
         WHERE id = $4
         RETURNING *`,
        [usuarioId || null, monto, notas || null, caja.id]
    );

    return { ...rows[0], resumen, montoEfectivoEsperado, diferencia };
}

async function listarSesiones({ limite = 30 } = {}) {
    const { rows } = await pool.query(
        `SELECT cs.*, ua.nombre AS usuario_apertura_nombre, uc.nombre AS usuario_cierre_nombre
         FROM caja_sesiones cs
         LEFT JOIN usuarios ua ON ua.id = cs.usuario_apertura_id
         LEFT JOIN usuarios uc ON uc.id = cs.usuario_cierre_id
         ORDER BY cs.abierta_en DESC
         LIMIT $1`,
        [limite]
    );
    return rows;
}

module.exports = { obtenerCajaAbierta, abrirCaja, cerrarCaja, obtenerEstadoActual, obtenerResumenSesion, listarSesiones };
