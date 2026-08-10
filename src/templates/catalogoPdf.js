// Construye el HTML del catálogo PDF (Fase F/G — "generar un catálogo en
// PDF para enviar a clientes, bien diseñado"). Función pura a propósito:
// no toca la base de datos ni lanza Puppeteer, solo arma el documento a
// partir de datos ya resueltos — así se puede probar con Jest sin un
// navegador real, igual que el resto del proyecto evita mockear cosas que
// no hace falta mockear.
//
// Segunda vuelta de diseño: la primera versión (degradado azul→verde,
// insignias translúcidas, íconos por todos lados) se sentía "landing page
// de SaaS", no un catálogo de productos real. Se rehizo con un lenguaje
// más editorial/impreso: color sólido de marca (sin degradados), tipografía
// Inter como protagonista, sin íconos decorativos ni tarjetas flotantes con
// sombra — filas de producto tipo lista de precios, que además llenan
// mejor la página cuando hay pocos productos por categoría (el otro
// problema real de la v1: se veía vacía).

const COLOR_VERDE_OSCURO = '#1e7e34';
const COLOR_INK = '#14181f';
const COLOR_INK_SUAVE = '#5b6472';
const COLOR_CREMA = '#faf8f4';
const COLOR_LINEA = '#e2ddd2';

function escaparHtml(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const formatCurrency = (n) => `S/ ${Number(n).toFixed(2)}`;

function placeholderImagenHtml() {
    return `
        <div class="producto-imagen-placeholder">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="${COLOR_INK_SUAVE}" stroke-width="1.4">
                <rect x="3" y="10.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/>
                <line x1="9.5" y1="14.5" x2="14.5" y2="9.5"/>
            </svg>
        </div>
    `;
}

function productoFilaHtml(p) {
    const imagenHtml = p.imagenUrl
        ? `<img src="${escaparHtml(p.imagenUrl)}" alt="">`
        : placeholderImagenHtml();
    return `
        <div class="producto-fila">
            <div class="producto-imagen">${imagenHtml}</div>
            <div class="producto-datos">
                <div class="producto-nombre">${escaparHtml(p.nombre)}</div>
                <div class="producto-unidad">${escaparHtml(p.unidadMedida || 'unidad')}</div>
            </div>
            <div class="producto-precio">${formatCurrency(p.precio)}</div>
        </div>
    `;
}

function categoriaSeccionHtml(categoria, indice) {
    const numero = String(indice + 1).padStart(2, '0');
    return `
        <section class="categoria-seccion">
            <div class="categoria-header">
                <span class="categoria-numero">${numero}</span>
                <h2>${escaparHtml(categoria.nombre)}</h2>
            </div>
            <div class="productos-lista">
                ${categoria.productos.map(productoFilaHtml).join('')}
            </div>
        </section>
    `;
}

function filaContacto(etiqueta, texto) {
    if (!texto) return '';
    return `<div class="contacto-fila"><span class="contacto-etiqueta">${etiqueta}</span><span>${escaparHtml(texto)}</span></div>`;
}

/**
 * @param {Object} params
 * @param {Object} params.config - configuracion_tienda ya en camelCase (nombreNegocio, eslogan, logoUrl, telefono, whatsappNumero, direccion, emailContacto).
 * @param {Array<{nombre:string, productos:Array}>} params.categorias - productos ya agrupados y con precio calculado.
 * @param {string} params.baseUrl - origin del propio servidor (http://host:puerto), para cargar la tipografía vendorizada por URL absoluta.
 * @param {Date} [params.generadoEl]
 */
function construirHtmlCatalogo({ config, categorias, baseUrl = '', generadoEl = new Date() }) {
    const nombreCompleto = [config.nombreNegocio, config.eslogan].filter(Boolean).join(' — ');
    const fechaTexto = generadoEl.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
    const totalProductos = categorias.reduce((s, c) => s + c.productos.length, 0);

    const logoHtml = config.logoUrl
        ? `<img src="${escaparHtml(config.logoUrl)}" alt="" class="portada-logo-img">`
        : '';

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Catálogo — ${escaparHtml(nombreCompleto)}</title>
<style>
    @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 100 900;
        src: url('${baseUrl}/vendor/fonts/inter/Inter-Variable.woff2') format('woff2');
    }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
        color: ${COLOR_INK};
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    /* ---------- Portada ---------- */
    .portada {
        position: relative;
        height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        background: ${COLOR_VERDE_OSCURO};
        color: #fff;
        padding: 40px;
    }
    .portada-logo-img {
        width: 84px;
        height: 84px;
        border-radius: 18px;
        object-fit: cover;
        margin-bottom: 32px;
    }
    .portada-marca {
        font-size: 2.9rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        margin: 0;
        line-height: 1.08;
    }
    .portada-eslogan {
        font-size: 0.85rem;
        opacity: 0.82;
        margin: 14px 0 0;
        font-weight: 500;
        letter-spacing: 0.12em;
        text-transform: uppercase;
    }
    .portada-regla { width: 40px; height: 1px; background: rgba(255,255,255,0.4); margin: 34px 0; }
    .portada-titulo {
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.22em;
        font-weight: 700;
    }
    .portada-meta { font-size: 0.78rem; opacity: 0.75; font-weight: 500; margin-top: 10px; }

    .portada-contacto {
        position: absolute;
        z-index: 1;
        bottom: 48px;
        left: 42px;
        right: 42px;
        display: flex;
        justify-content: center;
        gap: 22px;
        flex-wrap: wrap;
        font-size: 0.74rem;
        font-weight: 500;
        opacity: 0.85;
    }

    /* ---------- Secciones por categoría ---------- */
    /* Flujo continuo a propósito, sin salto de página forzado por
       categoría: con pocos productos por categoría (catálogos chicos,
       típico de un negocio recién empezando) forzar una página nueva por
       cada una deja hojas casi vacías. break-after:avoid en el header evita
       que quede "huérfano" solo al final de una página. Filas en vez de
       tarjetas en grilla: llenan mejor el ancho de la página incluso con
       una sola categoría de un solo producto. */
    body { background: ${COLOR_CREMA}; }
    .categoria-seccion:first-of-type { padding-top: 46px; }
    .categoria-seccion { padding: 30px 46px 8px; }
    .categoria-header {
        display: flex;
        align-items: baseline;
        gap: 14px;
        padding-bottom: 12px;
        margin-bottom: 4px;
        border-bottom: 1px solid ${COLOR_INK};
        break-after: avoid;
        page-break-after: avoid;
    }
    .categoria-numero {
        font-size: 0.95rem;
        font-weight: 600;
        color: ${COLOR_INK_SUAVE};
        letter-spacing: 0.04em;
    }
    .categoria-header h2 {
        margin: 0;
        font-size: 1.32rem;
        font-weight: 800;
        letter-spacing: -0.01em;
        color: ${COLOR_INK};
    }

    .productos-lista { }
    .producto-fila {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 14px 0;
        border-bottom: 1px solid ${COLOR_LINEA};
        break-inside: avoid;
    }
    .producto-imagen {
        width: 52px;
        height: 52px;
        border-radius: 8px;
        background: #fff;
        border: 1px solid ${COLOR_LINEA};
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        overflow: hidden;
    }
    .producto-imagen img { width: 100%; height: 100%; object-fit: cover; }
    .producto-datos { flex: 1; min-width: 0; }
    .producto-nombre { font-size: 0.88rem; font-weight: 700; line-height: 1.3; }
    .producto-unidad { font-size: 0.72rem; color: ${COLOR_INK_SUAVE}; margin-top: 1px; }
    .producto-precio {
        font-size: 0.92rem;
        font-weight: 800;
        color: ${COLOR_INK};
        white-space: nowrap;
        flex-shrink: 0;
    }

    /* ---------- Contratapa ---------- */
    .contratapa {
        break-before: page;
        page-break-before: always;
        height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        background: ${COLOR_INK};
        color: #fff;
        padding: 40px;
    }
    .contratapa h2 { font-size: 1.7rem; font-weight: 800; margin: 0 0 12px; letter-spacing: -0.01em; }
    .contratapa p { font-size: 0.9rem; opacity: 0.72; margin: 0 0 40px; max-width: 420px; line-height: 1.5; }
    .contratapa-regla { width: 40px; height: 1px; background: rgba(255,255,255,0.3); margin-bottom: 40px; }
    .contratapa-contacto { display: flex; flex-direction: column; gap: 10px; }
    .contratapa-contacto .contacto-fila { font-size: 0.85rem; justify-content: center; opacity: 0.9; }

    .contacto-fila { display: flex; align-items: baseline; gap: 8px; }
    .contacto-etiqueta { text-transform: uppercase; font-size: 0.62rem; letter-spacing: 0.1em; opacity: 0.7; }
</style>
</head>
<body>

    <div class="portada">
        ${logoHtml}
        <h1 class="portada-marca">${escaparHtml(config.nombreNegocio)}</h1>
        ${config.eslogan ? `<div class="portada-eslogan">${escaparHtml(config.eslogan)}</div>` : ''}
        <div class="portada-regla"></div>
        <div class="portada-titulo">Catálogo de Productos</div>
        <div class="portada-meta">${totalProductos} productos · Generado el ${fechaTexto}</div>
        <div class="portada-contacto">
            ${filaContacto('Tel', config.telefono)}
            ${filaContacto('Email', config.emailContacto)}
            ${filaContacto('Dirección', config.direccion)}
        </div>
    </div>

    ${categorias.map((c, i) => categoriaSeccionHtml(c, i)).join('')}

    <div class="contratapa">
        <h2>¿Listo para hacer tu pedido?</h2>
        <p>Escríbenos con el código o nombre del producto que necesitas y coordinamos el pago y la entrega.</p>
        <div class="contratapa-regla"></div>
        <div class="contratapa-contacto">
            ${filaContacto('Tel', config.telefono)}
            ${filaContacto('Email', config.emailContacto)}
            ${filaContacto('Dirección', config.direccion)}
        </div>
    </div>

</body>
</html>`;
}

module.exports = { construirHtmlCatalogo, escaparHtml };
