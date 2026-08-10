const webpush = require('web-push');
const pool = require('../config/db');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contacto@example.com';

const configurado = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (configurado) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

async function guardarSuscripcion(pedidoId, subscription) {
    const { endpoint, keys } = subscription || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        throw new Error('Suscripción de notificaciones inválida');
    }
    await pool.query(
        `INSERT INTO push_subscripciones (pedido_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)`,
        [pedidoId, endpoint, keys.p256dh, keys.auth]
    );
}

const MENSAJES_ESTADO = {
    atendido: 'Tu pedido fue confirmado. ¡Gracias por tu compra!',
    cancelado: 'Tu pedido fue cancelado. Escríbenos si tienes dudas.',
};

/**
 * Notifica a quien se suscribió a un pedido específico cuando cambia su
 * estado. Best-effort a propósito: una suscripción caducada no debe romper
 * el flujo real de atender el pedido, solo se descarta.
 */
async function notificarCambioEstado(pedidoId, estado) {
    if (!configurado) return;

    const mensaje = MENSAJES_ESTADO[estado];
    if (!mensaje) return; // "pendiente" no genera notificación

    const { rows } = await pool.query('SELECT * FROM push_subscripciones WHERE pedido_id = $1', [pedidoId]);
    if (rows.length === 0) return;

    const payload = JSON.stringify({
        titulo: 'San Judas Tadeo Botica Dental',
        cuerpo: mensaje,
        url: '/tienda.html',
    });

    await Promise.all(rows.map(async (sub) => {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload
            );
        } catch (err) {
            // 404/410 = el navegador del cliente ya invalidó esa suscripción.
            if (err.statusCode === 404 || err.statusCode === 410) {
                await pool.query('DELETE FROM push_subscripciones WHERE id = $1', [sub.id]).catch(() => {});
            } else {
                console.error('No se pudo enviar la notificación push:', err.message);
            }
        }
    }));
}

module.exports = {
    guardarSuscripcion,
    notificarCambioEstado,
    obtenerClavePublica: () => VAPID_PUBLIC_KEY || null,
    estaConfigurado: () => configurado,
};
