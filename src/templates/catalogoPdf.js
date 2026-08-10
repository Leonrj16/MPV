// Construye el HTML del catálogo PDF (Fase F/G — "generar un catálogo en
// PDF para enviar a clientes"). Función pura a propósito: no toca la base
// de datos ni lanza Puppeteer, solo arma el documento a partir de datos ya
// resueltos — así se puede probar con Jest sin un navegador real, igual
// que el resto del proyecto evita mockear cosas que no hace falta mockear.
//
// El diseño reutiliza la paleta de marca de la tienda virtual
// (public/css/tienda.css: azul→verde en el degradado, verde oscuro como
// acento) para que el catálogo se sienta parte del mismo negocio, no un
// reporte administrativo genérico como las boletas/exportes en PDFKit.

const COLOR_AZUL = '#007bff';
const COLOR_VERDE = '#28a745';
const COLOR_VERDE_OSCURO = '#1e7e34';
const COLOR_INK = '#14181f';
const COLOR_INK_SUAVE = '#5b6472';
const COLOR_GRIS_50 = '#f7f9fc';
const COLOR_GRIS_100 = '#eef1f6';

function escaparHtml(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const formatCurrency = (n) => `S/ ${Number(n).toFixed(2)}`;

/** Ícono de cápsula en SVG inline — mismo look que el placeholder de la tienda, sin depender de una fuente de íconos externa dentro del PDF. */
function placeholderImagenHtml() {
    return `
        <div class="producto-imagen-placeholder">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="${COLOR_AZUL}" stroke-width="1.6">
                <rect x="3" y="10.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/>
                <line x1="9.5" y1="14.5" x2="14.5" y2="9.5" stroke="${COLOR_VERDE}"/>
            </svg>
        </div>
    `;
}

function productoCardHtml(p) {
    const imagenHtml = p.imagenUrl
        ? `<img src="${escaparHtml(p.imagenUrl)}" alt="">`
        : placeholderImagenHtml();
    return `
        <div class="producto-card">
            <div class="producto-imagen">${imagenHtml}</div>
            <div class="producto-info">
                <div class="producto-nombre">${escaparHtml(p.nombre)}</div>
                <div class="producto-unidad">${escaparHtml(p.unidadMedida || 'unidad')}</div>
                <div class="producto-precio">${formatCurrency(p.precio)}</div>
            </div>
        </div>
    `;
}

function categoriaSeccionHtml(categoria) {
    return `
        <section class="categoria-seccion">
            <div class="categoria-header">
                <h2>${escaparHtml(categoria.nombre)}</h2>
                <span class="categoria-cantidad">${categoria.productos.length} producto${categoria.productos.length === 1 ? '' : 's'}</span>
            </div>
            <div class="productos-grid">
                ${categoria.productos.map(productoCardHtml).join('')}
            </div>
        </section>
    `;
}

/**
 * @param {Object} params
 * @param {Object} params.config - configuracion_tienda ya en camelCase (nombreNegocio, eslogan, logoUrl, telefono, whatsappNumero, direccion, emailContacto).
 * @param {Array<{nombre:string, productos:Array}>} params.categorias - productos ya agrupados y con precio calculado.
 * @param {Date} [params.generadoEl]
 */
function construirHtmlCatalogo({ config, categorias, generadoEl = new Date() }) {
    const nombreCompleto = [config.nombreNegocio, config.eslogan].filter(Boolean).join(' — ');
    const fechaTexto = generadoEl.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
    const totalProductos = categorias.reduce((s, c) => s + c.productos.length, 0);

    const logoHtml = config.logoUrl
        ? `<img src="${escaparHtml(config.logoUrl)}" alt="" class="portada-logo-img">`
        : `<div class="portada-logo-generico">${escaparHtml((config.nombreNegocio || 'M')[0])}</div>`;

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Catálogo — ${escaparHtml(nombreCompleto)}</title>
<style>
    * { box-sizing: border-box; }
    body {
        margin: 0;
        font-family: 'Helvetica Neue', Arial, sans-serif;
        color: ${COLOR_INK};
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    /* ---------- Portada ---------- */
    .portada {
        height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        background: linear-gradient(155deg, ${COLOR_AZUL} 0%, ${COLOR_VERDE} 100%);
        color: #fff;
        padding: 40px;
    }
    .portada-logo-img {
        width: 96px;
        height: 96px;
        border-radius: 22px;
        object-fit: cover;
        margin-bottom: 28px;
        box-shadow: 0 20px 40px -12px rgba(0,0,0,0.35);
    }
    .portada-logo-generico {
        width: 96px;
        height: 96px;
        border-radius: 22px;
        margin-bottom: 28px;
        background: rgba(255,255,255,0.18);
        border: 2px solid rgba(255,255,255,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.6rem;
        font-weight: 800;
        box-shadow: 0 20px 40px -12px rgba(0,0,0,0.35);
    }
    .portada-marca { font-size: 2.3rem; font-weight: 800; letter-spacing: -0.01em; margin: 0; }
    .portada-eslogan { font-size: 1.1rem; opacity: 0.92; margin: 6px 0 40px; font-weight: 500; }
    .portada-titulo {
        font-size: 1rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-weight: 700;
        background: rgba(255,255,255,0.16);
        border-radius: 999px;
        padding: 10px 26px;
        margin-bottom: 18px;
    }
    .portada-meta { font-size: 0.85rem; opacity: 0.85; }
    .portada-contacto {
        position: absolute;
        bottom: 40px;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 0.78rem;
        opacity: 0.9;
        line-height: 1.7;
    }

    /* ---------- Secciones por categoría ---------- */
    /* Flujo continuo a propósito, sin salto de página forzado por
       categoría: con pocos productos por categoría (catálogos chicos,
       típico de un negocio recién empezando) forzar una página nueva por
       cada una deja hojas casi vacías. break-after:avoid en el header evita
       que quede "huérfano" solo al final de una página. */
    .categoria-seccion:first-of-type { padding-top: 40px; }
    .categoria-seccion { padding: 30px 42px 6px; }
    .categoria-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        border-bottom: 3px solid ${COLOR_VERDE_OSCURO};
        padding-bottom: 10px;
        margin-bottom: 22px;
        break-after: avoid;
        page-break-after: avoid;
    }
    .categoria-header h2 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 800;
        color: ${COLOR_INK};
    }
    .categoria-cantidad {
        font-size: 0.78rem;
        color: ${COLOR_INK_SUAVE};
        font-weight: 600;
    }

    .productos-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
    }
    .producto-card {
        break-inside: avoid;
        border: 1px solid ${COLOR_GRIS_100};
        border-radius: 12px;
        overflow: hidden;
        background: #fff;
    }
    .producto-imagen {
        height: 108px;
        background: linear-gradient(160deg, ${COLOR_GRIS_50}, ${COLOR_GRIS_100});
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .producto-imagen img { width: 100%; height: 100%; object-fit: cover; }
    .producto-imagen-placeholder { display: flex; align-items: center; justify-content: center; }
    .producto-info { padding: 10px 12px 12px; }
    .producto-nombre {
        font-size: 0.82rem;
        font-weight: 700;
        line-height: 1.25;
        margin-bottom: 2px;
        /* hasta 2 líneas, con "…" si no entra — evita que un nombre largo
           desarme la altura pareja de las tarjetas de la grilla */
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: 2.1em;
    }
    .producto-unidad { font-size: 0.68rem; color: ${COLOR_INK_SUAVE}; margin-bottom: 6px; }
    .producto-precio { font-size: 1rem; font-weight: 800; color: ${COLOR_VERDE_OSCURO}; }
</style>
</head>
<body>

    <div class="portada">
        ${logoHtml}
        <h1 class="portada-marca">${escaparHtml(config.nombreNegocio)}</h1>
        ${config.eslogan ? `<div class="portada-eslogan">${escaparHtml(config.eslogan)}</div>` : ''}
        <div class="portada-titulo">Catálogo de Productos</div>
        <div class="portada-meta">${totalProductos} productos · Generado el ${fechaTexto}</div>
        <div class="portada-contacto">
            ${config.telefono ? escaparHtml(config.telefono) : ''}
            ${config.telefono && config.emailContacto ? ' · ' : ''}
            ${config.emailContacto ? escaparHtml(config.emailContacto) : ''}
            ${config.direccion ? `<br>${escaparHtml(config.direccion)}` : ''}
        </div>
    </div>

    ${categorias.map((c) => categoriaSeccionHtml(c)).join('')}

</body>
</html>`;
}

module.exports = { construirHtmlCatalogo, escaparHtml };
