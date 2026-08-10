const puppeteer = require('puppeteer');
const pool = require('../config/db');
const { calcularPVP } = require('./pricingEngine');
const { obtenerConfigActiva } = require('./tableroPrecios');
const { construirHtmlCatalogo, escaparHtml } = require('../templates/catalogoPdf');

/**
 * Productos activos agrupados por categoría, con precio calculado con el
 * mismo motor que la tienda y el punto de venta (proveedor principal, o el
 * de menor precio de compra si no hay uno marcado). Un producto sin
 * proveedor activo no tiene PVP calculable y no tiene sentido publicarlo
 * en un catálogo para clientes, así que se excluye — mismo criterio que
 * "vendible" en listarProductosDisponibles.
 */
async function obtenerDatosCatalogo() {
    const config = await obtenerConfigActiva();

    const { rows } = await pool.query(
        `SELECT DISTINCT ON (pr.id)
            pr.id, pr.nombre, pr.imagen_url, pr.unidad_medida,
            COALESCE(c.nombre, 'Otros') AS categoria_nombre,
            pp.precio_compra_unitario
         FROM productos pr
         JOIN proveedor_producto pp ON pp.producto_id = pr.id AND pp.activo = TRUE
         JOIN proveedores pv ON pv.id = pp.proveedor_id AND pv.activo = TRUE
         LEFT JOIN categorias c ON c.id = pr.categoria_id
         WHERE pr.activo = TRUE
         ORDER BY pr.id, pp.es_proveedor_principal DESC, pp.precio_compra_unitario ASC`
    );

    const porCategoria = new Map();
    for (const fila of rows) {
        const { pvpSugerido } = calcularPVP({ precioCompra: Number(fila.precio_compra_unitario), config });
        const producto = {
            id: fila.id,
            nombre: fila.nombre,
            imagenUrl: fila.imagen_url,
            unidadMedida: fila.unidad_medida,
            precio: pvpSugerido,
        };
        if (!porCategoria.has(fila.categoria_nombre)) porCategoria.set(fila.categoria_nombre, []);
        porCategoria.get(fila.categoria_nombre).push(producto);
    }

    const categorias = [...porCategoria.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'es'))
        .map(([nombre, productos]) => ({ nombre, productos }));

    const { rows: cfgRows } = await pool.query('SELECT * FROM configuracion_tienda WHERE id = 1');
    const cfgTienda = cfgRows[0] || {};

    return {
        categorias,
        config: {
            nombreNegocio: cfgTienda.nombre_negocio || 'Mi Negocio',
            eslogan: cfgTienda.eslogan || null,
            logoUrl: cfgTienda.logo_url || null,
            telefono: cfgTienda.telefono || null,
            emailContacto: cfgTienda.email_contacto || null,
            direccion: cfgTienda.direccion || null,
        },
    };
}

/**
 * Resuelve imagen_url/logoUrl (rutas relativas tipo /uploads/x.jpg) a URLs
 * absolutas contra el propio servidor — Puppeteer navega en un proceso de
 * Chromium aparte que no comparte el origin implícito del request HTTP
 * original, así que una ruta relativa simplemente no cargaría nada.
 */
function absolutizarUrls(datos, baseUrl) {
    const conBase = (ruta) => (ruta && ruta.startsWith('/') ? `${baseUrl}${ruta}` : ruta);
    return {
        ...datos,
        config: { ...datos.config, logoUrl: conBase(datos.config.logoUrl) },
        categorias: datos.categorias.map((c) => ({
            ...c,
            productos: c.productos.map((p) => ({ ...p, imagenUrl: conBase(p.imagenUrl) })),
        })),
    };
}

/** Genera el PDF del catálogo y devuelve el Buffer listo para descargar. */
async function generarCatalogoPdfBuffer({ baseUrl }) {
    const datosCrudos = await obtenerDatosCatalogo();
    const datos = absolutizarUrls(datosCrudos, baseUrl);
    const html = construirHtmlCatalogo(datos);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate: `
                <div style="width:100%; font-size:8px; color:#5b6472; padding:0 42px; display:flex; justify-content:space-between; font-family:Arial, sans-serif;">
                    <span>${escaparHtml(datos.config.nombreNegocio)}</span>
                    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
                </div>
            `,
            margin: { top: '0mm', bottom: '16mm', left: '0mm', right: '0mm' },
        });
        // page.pdf() devuelve un Uint8Array, no un Buffer real de Node —
        // Express no lo reconoce como binario y lo manda como JSON
        // (un objeto {"0":37,"1":80,...}) si se le pasa tal cual a res.send().
        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
}

module.exports = { obtenerDatosCatalogo, generarCatalogoPdfBuffer };
