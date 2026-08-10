const { generarCatalogoPdfBuffer } = require('../services/catalogoPdf');
const { registrarEvento } = require('../services/bitacora');

/** GET /api/catalogo/pdf — genera el catálogo bajo demanda (no se cachea: refleja precios y catálogo activo del momento). */
async function generarPdf(req, res) {
    try {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const pdf = await generarCatalogoPdfBuffer({ baseUrl });

        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'crear',
            entidad: 'catalogo_pdf',
            detalle: 'Generó el catálogo de productos en PDF',
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="catalogo-${new Date().toISOString().slice(0, 10)}.pdf"`);
        res.send(pdf);
    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'No se pudo generar el catálogo: ' + err.message });
        } else {
            res.end();
        }
    }
}

module.exports = { generarPdf };
