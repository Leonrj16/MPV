// Construye el HTML del catálogo PDF (Fase F/G — "generar un catálogo en
// PDF para enviar a clientes, bien diseñado"). Función pura a propósito:
// no toca la base de datos ni lanza Puppeteer, solo arma el documento a
// partir de datos ya resueltos — así se puede probar con Jest sin un
// navegador real, igual que el resto del proyecto evita mockear cosas que
// no hace falta mockear.
//
// El diseño reutiliza la identidad visual real del negocio: la tipografía
// Inter y los íconos de Bootstrap Icons que ya usa toda la app (vendorizados
// localmente, se cargan por URL absoluta contra el propio servidor — ver
// baseUrl más abajo), y la paleta azul→verde de la tienda virtual
// (public/css/tienda.css), para que el catálogo se sienta parte del mismo
// negocio y no un reporte administrativo genérico como las boletas/exportes
// en PDFKit.

const COLOR_AZUL = '#007bff';
const COLOR_VERDE = '#28a745';
const COLOR_VERDE_OSCURO = '#1e7e34';
const COLOR_TEAL = '#0aa389'; // punto medio del degradado azul→verde, para acentos y el ícono de marca
const COLOR_INK = '#14181f';
const COLOR_INK_SUAVE = '#5b6472';
const COLOR_GRIS_50 = '#f7f9fc';
const COLOR_GRIS_100 = '#eef1f6';
const COLOR_GRIS_200 = '#e2e6ed';

function escaparHtml(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const formatCurrency = (n) => `S/ ${Number(n).toFixed(2)}`;

/**
 * Un ícono de Bootstrap Icons por categoría, por palabra clave en el
 * nombre — cosmético nada más: si no matchea nada usa el mismo ícono de
 * marca del sidebar/topbar (bi-clipboard2-pulse), nunca falla ni deja algo
 * vacío. No es exhaustivo a propósito: cubre las categorías reales del
 * negocio y cualquier categoría nueva cae en el ícono genérico, correcto.
 */
function iconoCategoria(nombre) {
    const n = (nombre || '').toLowerCase();
    if (n.includes('anestes')) return 'bi-capsule';
    if (n.includes('biosegur')) return 'bi-shield-fill-check';
    if (n.includes('instrumental') || n.includes('rotator')) return 'bi-tools';
    if (n.includes('ortodon')) return 'bi-grid-3x3-gap-fill';
    if (n.includes('resina') || n.includes('composite')) return 'bi-droplet-half';
    if (n === 'otros') return 'bi-box-seam-fill';
    return 'bi-clipboard2-pulse';
}

function placeholderImagenHtml() {
    return `
        <div class="producto-imagen-placeholder">
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="${COLOR_AZUL}" stroke-width="1.6">
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
                <div class="producto-fila-inferior">
                    <span class="producto-unidad">${escaparHtml(p.unidadMedida || 'unidad')}</span>
                    <span class="producto-precio">${formatCurrency(p.precio)}</span>
                </div>
            </div>
        </div>
    `;
}

function categoriaSeccionHtml(categoria) {
    return `
        <section class="categoria-seccion">
            <div class="categoria-header">
                <div class="categoria-header-izq">
                    <span class="categoria-icono"><i class="bi ${iconoCategoria(categoria.nombre)}"></i></span>
                    <h2>${escaparHtml(categoria.nombre)}</h2>
                </div>
                <span class="categoria-cantidad">${categoria.productos.length} producto${categoria.productos.length === 1 ? '' : 's'}</span>
            </div>
            <div class="productos-grid">
                ${categoria.productos.map(productoCardHtml).join('')}
            </div>
        </section>
    `;
}

/** Fila de contacto para la portada y la contratapa — mismo formato, dos lugares. */
function filaContacto(icono, texto) {
    if (!texto) return '';
    return `<div class="contacto-fila"><i class="bi ${icono}"></i><span>${escaparHtml(texto)}</span></div>`;
}

/**
 * @param {Object} params
 * @param {Object} params.config - configuracion_tienda ya en camelCase (nombreNegocio, eslogan, logoUrl, telefono, whatsappNumero, direccion, emailContacto).
 * @param {Array<{nombre:string, productos:Array}>} params.categorias - productos ya agrupados y con precio calculado.
 * @param {string} params.baseUrl - origin del propio servidor (http://host:puerto), para cargar la tipografía e íconos vendorizados por URL absoluta.
 * @param {Date} [params.generadoEl]
 */
function construirHtmlCatalogo({ config, categorias, baseUrl = '', generadoEl = new Date() }) {
    const nombreCompleto = [config.nombreNegocio, config.eslogan].filter(Boolean).join(' — ');
    const fechaTexto = generadoEl.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
    const totalProductos = categorias.reduce((s, c) => s + c.productos.length, 0);

    const logoHtml = config.logoUrl
        ? `<img src="${escaparHtml(config.logoUrl)}" alt="" class="portada-logo-img">`
        : `<div class="portada-logo-generico">${escaparHtml((config.nombreNegocio || 'M')[0])}</div>`;

    // Textura de fondo de la portada: el ícono de marca repetido, gigante y
    // casi transparente — un recurso clásico de portada editorial, sin
    // depender de ninguna foto de stock que no tenemos.
    const marcaAguaHtml = Array.from({ length: 6 }, (_, i) => `
        <i class="bi bi-clipboard2-pulse portada-marca-agua pos-${i}"></i>
    `).join('');

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Catálogo — ${escaparHtml(nombreCompleto)}</title>
<link rel="stylesheet" href="${baseUrl}/vendor/bootstrap-icons/font/bootstrap-icons.css">
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
        background:
            radial-gradient(circle at 24% 18%, rgba(255,255,255,0.22), transparent 42%),
            linear-gradient(155deg, ${COLOR_AZUL} 0%, ${COLOR_TEAL} 52%, ${COLOR_VERDE} 100%);
        color: #fff;
        padding: 40px;
        overflow: hidden;
    }
    .portada-marca-agua {
        position: absolute;
        font-size: 200px;
        color: rgba(255,255,255,0.07);
        transform: rotate(-14deg);
    }
    .portada-marca-agua.pos-0 { top: -60px; left: -50px; }
    .portada-marca-agua.pos-1 { top: 40px; right: -70px; font-size: 160px; }
    .portada-marca-agua.pos-2 { bottom: -50px; left: 18%; font-size: 180px; }
    .portada-marca-agua.pos-3 { bottom: 120px; right: -60px; font-size: 130px; transform: rotate(10deg); }
    .portada-marca-agua.pos-4 { top: 46%; left: -90px; font-size: 150px; transform: rotate(6deg); }
    .portada-marca-agua.pos-5 { top: -40px; right: 22%; font-size: 110px; transform: rotate(-24deg); }

    .portada-contenido { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; }
    .portada-logo-img {
        width: 108px;
        height: 108px;
        border-radius: 26px;
        object-fit: cover;
        margin-bottom: 30px;
        box-shadow: 0 24px 48px -14px rgba(0,0,0,0.4);
        border: 3px solid rgba(255,255,255,0.85);
    }
    .portada-logo-generico {
        width: 108px;
        height: 108px;
        border-radius: 26px;
        margin-bottom: 30px;
        background: rgba(255,255,255,0.16);
        border: 2px solid rgba(255,255,255,0.55);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.8rem;
        font-weight: 800;
        box-shadow: 0 24px 48px -14px rgba(0,0,0,0.4);
    }
    .portada-marca { font-size: 3rem; font-weight: 800; letter-spacing: -0.02em; margin: 0; line-height: 1.08; }
    .portada-eslogan {
        font-size: 1.05rem;
        opacity: 0.94;
        margin: 10px 0 36px;
        font-weight: 500;
        letter-spacing: 0.02em;
    }
    .portada-regla { width: 64px; height: 3px; background: rgba(255,255,255,0.55); border-radius: 3px; margin-bottom: 28px; }
    .portada-titulo {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.92rem;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-weight: 700;
        background: rgba(255,255,255,0.14);
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 999px;
        padding: 11px 28px;
        margin-bottom: 20px;
    }
    .portada-meta { font-size: 0.85rem; opacity: 0.88; font-weight: 500; }

    .portada-contacto {
        position: absolute;
        z-index: 1;
        bottom: 42px;
        left: 42px;
        right: 42px;
        display: flex;
        justify-content: center;
        gap: 28px;
        flex-wrap: wrap;
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.22);
        border-radius: 14px;
        padding: 14px 20px;
    }
    .contacto-fila { display: flex; align-items: center; gap: 7px; font-size: 0.76rem; font-weight: 500; }
    .contacto-fila i { font-size: 0.85rem; }

    /* ---------- Secciones por categoría ---------- */
    /* Flujo continuo a propósito, sin salto de página forzado por
       categoría: con pocos productos por categoría (catálogos chicos,
       típico de un negocio recién empezando) forzar una página nueva por
       cada una deja hojas casi vacías. break-after:avoid en el header evita
       que quede "huérfano" solo al final de una página. */
    .categoria-seccion:first-of-type { padding-top: 44px; }
    .categoria-seccion { padding: 26px 42px 10px; }
    .categoria-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 14px;
        margin-bottom: 20px;
        border-bottom: 1px solid ${COLOR_GRIS_200};
        break-after: avoid;
        page-break-after: avoid;
    }
    .categoria-header-izq { display: flex; align-items: center; gap: 12px; }
    .categoria-icono {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: linear-gradient(155deg, ${COLOR_AZUL}, ${COLOR_VERDE});
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.95rem;
        flex-shrink: 0;
    }
    .categoria-header h2 {
        margin: 0;
        font-size: 1.28rem;
        font-weight: 800;
        letter-spacing: -0.01em;
        color: ${COLOR_INK};
    }
    .categoria-cantidad {
        font-size: 0.72rem;
        color: ${COLOR_INK_SUAVE};
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    .productos-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 14px;
        margin-bottom: 16px;
    }
    .producto-card {
        break-inside: avoid;
        border-radius: 14px;
        overflow: hidden;
        background: #fff;
        border: 1px solid ${COLOR_GRIS_100};
        box-shadow: 0 1px 2px rgba(20,24,31,0.03), 0 8px 20px -14px rgba(20,24,31,0.25);
    }
    .producto-imagen {
        height: 104px;
        background: linear-gradient(160deg, ${COLOR_GRIS_50}, ${COLOR_GRIS_100});
        display: flex;
        align-items: center;
        justify-content: center;
        border-bottom: 1px solid ${COLOR_GRIS_100};
    }
    .producto-imagen img { width: 100%; height: 100%; object-fit: cover; }
    .producto-imagen-placeholder { display: flex; align-items: center; justify-content: center; }
    .producto-info { padding: 11px 12px 12px; }
    .producto-nombre {
        font-size: 0.8rem;
        font-weight: 700;
        line-height: 1.28;
        margin-bottom: 8px;
        /* hasta 2 líneas, con "…" si no entra — evita que un nombre largo
           desarme la altura pareja de las tarjetas de la grilla */
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: 2.05em;
    }
    .producto-fila-inferior { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .producto-unidad { font-size: 0.66rem; color: ${COLOR_INK_SUAVE}; font-weight: 500; }
    .producto-precio {
        font-size: 0.82rem;
        font-weight: 800;
        color: ${COLOR_VERDE_OSCURO};
        background: rgba(30,126,55,0.09);
        border-radius: 7px;
        padding: 3px 8px;
        white-space: nowrap;
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
        background: linear-gradient(155deg, ${COLOR_VERDE} 0%, ${COLOR_TEAL} 48%, ${COLOR_AZUL} 100%);
        color: #fff;
        padding: 40px;
    }
    .contratapa-icono {
        width: 76px;
        height: 76px;
        border-radius: 50%;
        background: rgba(255,255,255,0.16);
        border: 1px solid rgba(255,255,255,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.9rem;
        margin-bottom: 26px;
    }
    .contratapa h2 { font-size: 1.9rem; font-weight: 800; margin: 0 0 12px; letter-spacing: -0.01em; }
    .contratapa p { font-size: 0.95rem; opacity: 0.92; margin: 0 0 34px; max-width: 440px; }
    .contratapa-contacto {
        display: flex;
        flex-direction: column;
        gap: 14px;
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.22);
        border-radius: 16px;
        padding: 26px 34px;
        min-width: 320px;
    }
    .contratapa-contacto .contacto-fila { font-size: 0.88rem; justify-content: center; }
    .contratapa-contacto .contacto-fila i { font-size: 1rem; }
</style>
</head>
<body>

    <div class="portada">
        ${marcaAguaHtml}
        <div class="portada-contenido">
            ${logoHtml}
            <h1 class="portada-marca">${escaparHtml(config.nombreNegocio)}</h1>
            ${config.eslogan ? `<div class="portada-eslogan">${escaparHtml(config.eslogan)}</div>` : ''}
            <div class="portada-regla"></div>
            <div class="portada-titulo"><i class="bi bi-clipboard2-pulse"></i> Catálogo de Productos</div>
            <div class="portada-meta">${totalProductos} productos · Generado el ${fechaTexto}</div>
        </div>
        <div class="portada-contacto">
            ${filaContacto('bi-telephone-fill', config.telefono)}
            ${filaContacto('bi-envelope-fill', config.emailContacto)}
            ${filaContacto('bi-geo-alt-fill', config.direccion)}
        </div>
    </div>

    ${categorias.map((c) => categoriaSeccionHtml(c)).join('')}

    <div class="contratapa">
        <div class="contratapa-icono"><i class="bi bi-whatsapp"></i></div>
        <h2>¿Listo para hacer tu pedido?</h2>
        <p>Escríbenos con el código o nombre del producto que necesitas y coordinamos el pago y la entrega.</p>
        <div class="contratapa-contacto">
            ${filaContacto('bi-telephone-fill', config.telefono)}
            ${filaContacto('bi-envelope-fill', config.emailContacto)}
            ${filaContacto('bi-geo-alt-fill', config.direccion)}
        </div>
    </div>

</body>
</html>`;
}

module.exports = { construirHtmlCatalogo, escaparHtml };
