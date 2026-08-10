// Campana de alertas del topbar — compartida por las 9 páginas del panel
// interno. Agrega señales que ya existen en la base de datos (stock,
// historial de precios, pedidos web) en un solo lugar, para no depender de
// que el staff entre a revisar cada página por separado.
(function () {
    const btn = document.getElementById('btnAlertas');
    if (!btn) return;

    const badge = document.getElementById('badgeAlertas');
    const contenido = document.getElementById('alertasContenido');

    function escaparHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto ?? '';
        return div.innerHTML;
    }

    function itemHtml({ href, icono, claseIcono, titulo, desc }) {
        return `
            <a href="${href}" class="alerta-item">
                <div class="icono ${claseIcono}"><i class="bi ${icono}"></i></div>
                <div>
                    <div class="titulo">${escaparHtml(titulo)}</div>
                    <div class="desc">${escaparHtml(desc)}</div>
                </div>
            </a>
        `;
    }

    function render(data) {
        const grupos = [];

        if (data.stockAgotado.length) {
            grupos.push('<div class="alertas-grupo-titulo">Sin stock</div>');
            grupos.push(data.stockAgotado.map((p) => itemHtml({
                href: 'productos.html',
                icono: 'bi-x-octagon-fill',
                claseIcono: 'agotado',
                titulo: p.nombre,
                desc: `SKU ${p.sku} — sin unidades disponibles`,
            })).join(''));
        }
        if (data.stockBajo.length) {
            grupos.push('<div class="alertas-grupo-titulo">Stock bajo</div>');
            grupos.push(data.stockBajo.map((p) => itemHtml({
                href: 'productos.html',
                icono: 'bi-exclamation-triangle-fill',
                claseIcono: 'stock-bajo',
                titulo: p.nombre,
                desc: `Quedan ${p.stockActual} unidades (mínimo ${p.stockMinimo})`,
            })).join(''));
        }
        if (data.subidasPrecio.length) {
            grupos.push('<div class="alertas-grupo-titulo">Subida de precio</div>');
            grupos.push(data.subidasPrecio.map((p) => itemHtml({
                href: 'pricing.html',
                icono: 'bi-graph-up-arrow',
                claseIcono: 'precio',
                titulo: p.nombre,
                desc: `${p.proveedor}: ${MPV.formatCurrency(p.precioAnterior)} → ${MPV.formatCurrency(p.precioActual)}`,
            })).join(''));
        }
        if (data.reabastecimiento && data.reabastecimiento.length) {
            grupos.push('<div class="alertas-grupo-titulo">Reabastecer pronto</div>');
            grupos.push(data.reabastecimiento.map((p) => itemHtml({
                href: 'productos.html',
                icono: 'bi-arrow-repeat',
                claseIcono: 'stock-bajo',
                titulo: p.nombre,
                desc: `Se agotaría en ${p.diasRestantes} día${p.diasRestantes === 1 ? '' : 's'} al ritmo de venta actual`,
            })).join(''));
        }
        if (data.vencimiento && data.vencimiento.length) {
            grupos.push('<div class="alertas-grupo-titulo">Por vencer</div>');
            grupos.push(data.vencimiento.map((p) => itemHtml({
                href: 'productos.html',
                icono: 'bi-calendar-x-fill',
                claseIcono: 'agotado',
                titulo: p.nombre,
                desc: p.vencido
                    ? `Vencido el ${new Date(`${p.fechaVencimiento}T00:00:00`).toLocaleDateString('es-PE')}`
                    : `Vence el ${new Date(`${p.fechaVencimiento}T00:00:00`).toLocaleDateString('es-PE')}`,
            })).join(''));
        }
        if (data.pedidosPendientes > 0) {
            grupos.push('<div class="alertas-grupo-titulo">Tienda virtual</div>');
            grupos.push(itemHtml({
                href: 'ventas.html',
                icono: 'bi-globe',
                claseIcono: 'pedido',
                titulo: `${data.pedidosPendientes} pedido${data.pedidosPendientes === 1 ? '' : 's'} web pendiente${data.pedidosPendientes === 1 ? '' : 's'}`,
                desc: 'Esperando ser atendidos',
            }));
        }

        contenido.innerHTML = grupos.length
            ? grupos.join('')
            : `<div class="p-4 text-center text-muted small">
                   <i class="bi bi-check-circle-fill d-block mb-2" style="font-size:1.4rem;color:var(--mpv-emerald);"></i>
                   Todo en orden, sin alertas pendientes.
               </div>`;

        badge.textContent = data.total > 9 ? '9+' : data.total;
        badge.classList.toggle('d-none', data.total === 0);
    }

    async function cargar() {
        try {
            const { data } = await MPV.getAlertas();
            render(data);
        } catch {
            contenido.innerHTML = `<div class="p-3 text-center text-muted small">No se pudieron cargar las alertas.</div>`;
        }
    }

    cargar();
    // Refresca cada 2 minutos para que el contador no quede desactualizado
    // en una sesión larga sin recargar la página.
    setInterval(cargar, 120000);
})();
