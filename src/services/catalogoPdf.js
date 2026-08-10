const puppeteer = require('puppeteer');
const pool = require('../config/db');
const { calcularPVP } = require('./pricingEngine');
const { obtenerConfigActiva } = require('./tableroPrecios');
const { escaparHtml } = require('../templates/catalogoPdf');

// Puppeteer y Express corren en el mismo proceso/máquina, así que Puppeteer
// siempre puede llegar a la app por loopback sin pasar por nginx/DNS/TLS —
// más simple y más rápido que reconstruir la URL pública, y evita que la
// generación del catálogo dependa de que el propio dominio público
// resuelva y responda (ver también el middleware soloLocalhost en
// routes/catalogoPdf.routes.js, que exige que el pedido venga de acá).
const URL_INTERNA = `http://127.0.0.1:${process.env.PORT || 3000}`;

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
            // Rutas relativas (/uploads/x.jpg) resueltas contra el propio
            // servidor — el documento que Puppeteer renderiza vive en
            // URL_INTERNA, no en el origin del navegador del admin.
            imagenUrl: fila.imagen_url ? `${URL_INTERNA}${fila.imagen_url}` : null,
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
            logoUrl: cfgTienda.logo_url ? `${URL_INTERNA}${cfgTienda.logo_url}` : null,
            telefono: cfgTienda.telefono || null,
            emailContacto: cfgTienda.email_contacto || null,
            direccion: cfgTienda.direccion || null,
        },
    };
}

/**
 * Genera el PDF del catálogo y devuelve el Buffer listo para descargar.
 *
 * Puppeteer navega (page.goto) a una ruta interna que sirve el HTML real
 * en vez de inyectarlo con page.setContent(): un documento cargado con
 * setContent() tiene origin "null", y tanto el header
 * Cross-Origin-Resource-Policy de helmet como la restricción de CORS que
 * todo navegador aplica a @font-face cross-origin bloquean silenciosamente
 * la carga de la tipografía y los íconos (se detectó así: el PDF salía
 * bien pero sin ningún ícono ni la fuente Inter). Navegando a una URL real
 * del propio servidor, el documento y sus recursos comparten el mismo
 * origin de verdad y esas restricciones no aplican.
 */
async function generarCatalogoPdfBuffer() {
    const { config } = await obtenerDatosCatalogo();

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
        const page = await browser.newPage();
        await page.goto(`${URL_INTERNA}/api/internal/catalogo-pdf-html`, { waitUntil: 'networkidle0' });
        // networkidle0 solo garantiza que las descargas terminaron, no que
        // el navegador ya intercambió la fuente por defecto por Inter/los
        // íconos — sin este await, page.pdf() a veces capturaba la página
        // un instante antes del font-swap.
        await page.evaluate(() => document.fonts.ready);
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate: `
                <div style="width:100%; font-size:8px; color:#5b6472; padding:0 42px; display:flex; justify-content:space-between; font-family:Arial, sans-serif;">
                    <span>${escaparHtml(config.nombreNegocio)}</span>
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

module.exports = { obtenerDatosCatalogo, generarCatalogoPdfBuffer, URL_INTERNA };
