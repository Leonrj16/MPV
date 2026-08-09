const pool = require('../config/db');

function mapRow(row) {
    return {
        nombreNegocio: row.nombre_negocio,
        eslogan: row.eslogan,
        heroTitulo: row.hero_titulo,
        heroDescripcion: row.hero_descripcion,
        logoUrl: row.logo_url,
        heroImagenUrl: row.hero_imagen_url,
        telefono: row.telefono,
        whatsappNumero: row.whatsapp_numero,
        direccion: row.direccion,
        horarioAtencion: row.horario_atencion,
        emailContacto: row.email_contacto,
        facebookUrl: row.facebook_url,
        instagramUrl: row.instagram_url,
        actualizadoEn: row.updated_at,
    };
}

/**
 * GET /api/tienda/configuracion — pública, sin token. La consumen tanto
 * tienda.html (para pintar marca/textos/contacto) como configuracion.html
 * (para precargar el formulario de edición): no es información sensible,
 * es exactamente lo que ya se muestra en la portada de la tienda.
 */
async function obtenerConfiguracionTienda(req, res) {
    try {
        const { rows } = await pool.query('SELECT * FROM configuracion_tienda WHERE id = 1');
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'No existe configuración de la tienda' });
        }
        res.json({ ok: true, data: mapRow(rows[0]) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/** PUT /api/tienda/configuracion — solo admin. */
async function actualizarConfiguracionTienda(req, res) {
    try {
        const {
            nombreNegocio, eslogan, heroTitulo, heroDescripcion,
            logoUrl, heroImagenUrl, telefono, whatsappNumero,
            direccion, horarioAtencion, emailContacto, facebookUrl, instagramUrl,
        } = req.body;

        if (!nombreNegocio || !nombreNegocio.trim()) {
            return res.status(400).json({ ok: false, error: 'El nombre del negocio es obligatorio' });
        }
        if (!heroTitulo || !heroTitulo.trim()) {
            return res.status(400).json({ ok: false, error: 'El título principal de la portada es obligatorio' });
        }

        // wa.me solo funciona con dígitos (código de país + número): se limpia
        // cualquier '+', espacio o guión que el admin haya tipeado, en vez de
        // fallar en silencio el día que alguien haga clic en "Escríbenos".
        const numeroLimpio = whatsappNumero ? whatsappNumero.replace(/\D/g, '') : null;

        const { rows } = await pool.query(
            `UPDATE configuracion_tienda
             SET nombre_negocio = $1,
                 eslogan = $2,
                 hero_titulo = $3,
                 hero_descripcion = $4,
                 logo_url = $5,
                 hero_imagen_url = $6,
                 telefono = $7,
                 whatsapp_numero = $8,
                 direccion = $9,
                 horario_atencion = $10,
                 email_contacto = $11,
                 facebook_url = $12,
                 instagram_url = $13
             WHERE id = 1
             RETURNING *`,
            [
                nombreNegocio.trim(),
                eslogan || null,
                heroTitulo.trim(),
                heroDescripcion || null,
                logoUrl || null,
                heroImagenUrl || null,
                telefono || null,
                numeroLimpio,
                direccion || null,
                horarioAtencion || null,
                emailContacto || null,
                facebookUrl || null,
                instagramUrl || null,
            ]
        );

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'No existe configuración de la tienda' });
        }
        res.json({ ok: true, data: mapRow(rows[0]) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { obtenerConfiguracionTienda, actualizarConfiguracionTienda };
