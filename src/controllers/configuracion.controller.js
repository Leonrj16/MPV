const pool = require('../config/db');

async function obtenerConfiguracion(req, res) {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM configuracion_margenes WHERE es_config_activa = TRUE LIMIT 1`
        );
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'No existe una configuración de márgenes activa' });
        }
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function actualizarConfiguracion(req, res) {
    try {
        const {
            margenUtilidadDefectoPct,
            costoOperativoMensual,
            unidadesEstimadasMensual,
            porcentajeImpuesto,
        } = req.body;

        if (margenUtilidadDefectoPct === undefined || margenUtilidadDefectoPct < 0 || margenUtilidadDefectoPct >= 100) {
            return res.status(400).json({ ok: false, error: 'El margen de utilidad debe estar entre 0 y 99.99%' });
        }
        if (costoOperativoMensual === undefined || costoOperativoMensual < 0) {
            return res.status(400).json({ ok: false, error: 'El costo operativo mensual debe ser mayor o igual a 0' });
        }
        if (!unidadesEstimadasMensual || unidadesEstimadasMensual <= 0) {
            return res.status(400).json({ ok: false, error: 'Las unidades estimadas mensuales deben ser mayores a 0' });
        }
        if (porcentajeImpuesto === undefined || porcentajeImpuesto < 0) {
            return res.status(400).json({ ok: false, error: 'El porcentaje de impuesto debe ser mayor o igual a 0' });
        }

        const { rows } = await pool.query(
            `UPDATE configuracion_margenes
             SET margen_utilidad_defecto_pct = $1,
                 costo_operativo_mensual = $2,
                 unidades_estimadas_mensual = $3,
                 porcentaje_impuesto = $4
             WHERE es_config_activa = TRUE
             RETURNING *`,
            [margenUtilidadDefectoPct, costoOperativoMensual, unidadesEstimadasMensual, porcentajeImpuesto]
        );

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'No existe una configuración de márgenes activa' });
        }
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { obtenerConfiguracion, actualizarConfiguracion };
