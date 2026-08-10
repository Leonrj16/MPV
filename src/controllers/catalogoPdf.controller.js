const { generarCatalogoPdfBuffer, obtenerDatosCatalogo, URL_INTERNA } = require('../services/catalogoPdf');
const { construirHtmlCatalogo } = require('../templates/catalogoPdf');
const { registrarEvento } = require('../services/bitacora');

/** GET /api/catalogo/pdf — genera el catálogo bajo demanda (no se cachea: refleja precios y catálogo activo del momento). */
async function generarPdf(req, res) {
    try {
        const pdf = await generarCatalogoPdfBuffer();

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

/**
 * GET /internal/catalogo-pdf-html — solo la usa Puppeteer, navegando desde
 * el mismo servidor (ver soloLocalhost en el middleware de la ruta). No se
 * llama nunca desde el navegador de un cliente ni está enlazada en ningún
 * lado del frontend.
 */
async function renderHtml(req, res) {
    try {
        const datos = await obtenerDatosCatalogo();
        const html = construirHtmlCatalogo({ ...datos, baseUrl: URL_INTERNA });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error generando el catálogo');
    }
}

module.exports = { generarPdf, renderHtml };
