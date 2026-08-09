(function () {
    // Valor de reserva si /api/tienda/configuracion no llega a cargar — el
    // número real se administra desde Configuración > Tienda Virtual.
    const CONFIG = { WHATSAPP_NUMERO: '51999000111' };

    const formatCurrency = (n) =>
        new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n ?? 0);

    function escaparHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto ?? '';
        return div.innerHTML;
    }

    window.manejarErrorImagen = function (img) {
        img.parentElement.innerHTML = '<i class="bi bi-capsule placeholder-icono"></i>';
    };
    window.manejarErrorLogo = function (img) {
        img.parentElement.innerHTML = '<i class="bi bi-clipboard2-pulse"></i>';
    };

    const listaEl = document.getElementById('listaCarritoPagina');
    const vacioEl = document.getElementById('carritoPaginaVacio');
    const contenidoEl = document.getElementById('carritoPaginaContenido');

    function itemHtml(item) {
        const imagenHtml = item.imagenUrl
            ? `<img src="${escaparHtml(item.imagenUrl)}" alt="${escaparHtml(item.nombre)}" onerror="manejarErrorImagen(this)">`
            : `<i class="bi bi-capsule"></i>`;
        const tope = typeof item.stockActual === 'number' && item.stockActual > 0;
        const alTope = tope && item.cantidad >= item.stockActual;
        return `
            <div class="item-carrito-pagina">
                <div class="item-carrito-imagen">${imagenHtml}</div>
                <div class="flex-grow-1">
                    <div class="fw-semibold">${escaparHtml(item.nombre)}</div>
                    <div class="text-muted small mb-2">${formatCurrency(item.precio)} por ${escaparHtml(item.unidadMedida || 'unidad')}</div>
                    <div class="d-flex align-items-center gap-3">
                        <div class="stepper-cantidad">
                            <button class="btn-restar" data-id="${item.id}" aria-label="Restar">−</button>
                            <span>${item.cantidad}</span>
                            <button class="btn-sumar" data-id="${item.id}" aria-label="Sumar" ${alTope ? 'disabled' : ''}>+</button>
                        </div>
                        ${alTope ? `<span class="small text-warning-emphasis">Máximo disponible</span>` : ''}
                    </div>
                </div>
                <div class="text-end">
                    <div class="fw-bold mb-2">${formatCurrency(item.precio * item.cantidad)}</div>
                    <button class="btn-eliminar-item" data-id="${item.id}" title="Eliminar"><i class="bi bi-trash3"></i></button>
                </div>
            </div>
        `;
    }

    function renderCarritoPagina(items) {
        const vacio = items.length === 0;
        vacioEl.classList.toggle('d-none', !vacio);
        contenidoEl.classList.toggle('d-none', vacio);
        if (vacio) return;

        listaEl.innerHTML = items.map(itemHtml).join('');

        const cantidadTotal = items.reduce((s, i) => s + i.cantidad, 0);
        const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
        document.getElementById('resumenCantidadItems').textContent = `${cantidadTotal} producto${cantidadTotal === 1 ? '' : 's'}`;
        document.getElementById('resumenSubtotal').textContent = formatCurrency(total);
        document.getElementById('resumenTotal').textContent = formatCurrency(total);
    }

    listaEl.addEventListener('click', (e) => {
        const btnSumar = e.target.closest('.btn-sumar');
        const btnRestar = e.target.closest('.btn-restar');
        const btnEliminar = e.target.closest('.btn-eliminar-item');
        if (btnSumar) Carrito.actualizarCantidad(Number(btnSumar.dataset.id), 1);
        if (btnRestar) Carrito.actualizarCantidad(Number(btnRestar.dataset.id), -1);
        if (btnEliminar) Carrito.eliminar(Number(btnEliminar.dataset.id));
    });

    document.getElementById('btnVaciarCarritoPagina').addEventListener('click', () => {
        if (confirm('¿Vaciar todo el carrito?')) Carrito.vaciar();
    });

    document.getElementById('btnFinalizarPedidoPagina').addEventListener('click', () => {
        const items = Carrito.obtener();
        if (items.length === 0) return;

        const lineas = items.map((i) => `• ${i.cantidad} x ${i.nombre} — ${formatCurrency(i.precio * i.cantidad)}`);
        const mensaje = [
            'Hola, quisiera hacer el siguiente pedido:',
            '',
            ...lineas,
            '',
            `Total: ${formatCurrency(Carrito.calcularTotal())}`,
        ].join('\n');

        // window.open() va primero y sin await para que el navegador lo
        // reconozca como iniciado por el usuario (mismo patrón que tienda.js).
        window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener');

        const nombreCliente = document.getElementById('carritoPaginaNombre')?.value.trim();
        fetch('/api/tienda/pedidos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: items.map((i) => ({ productoId: i.id, cantidad: i.cantidad })),
                cliente: nombreCliente || undefined,
            }),
        }).catch(() => {});
    });

    Carrito.suscribir(renderCarritoPagina);

    // -------- Configuración de marca (misma lógica reducida que tienda.js) --------
    function setTexto(id, valor) {
        const el = document.getElementById(id);
        if (el && valor) el.textContent = valor;
    }

    async function cargarConfiguracionTienda() {
        try {
            const res = await fetch('/api/tienda/configuracion').then((r) => r.json());
            if (!res.ok) return;
            const data = res.data;
            const nombreCompleto = [data.nombreNegocio, data.eslogan].filter(Boolean).join(' ');

            setTexto('brandTitulo', data.nombreNegocio);
            setTexto('brandEslogan', data.eslogan);
            setTexto('footerBrandTitulo', data.nombreNegocio);
            setTexto('footerBrandEslogan', data.eslogan);
            if (nombreCompleto) setTexto('footerCopyrightNombre', nombreCompleto);
            setTexto('topstripTelefono', data.telefono);
            setTexto('topstripHorario', data.horarioAtencion);
            setTexto('topstripDireccion', data.direccion);
            setTexto('footerDireccion', data.direccion);
            setTexto('footerTelefono', data.telefono);
            setTexto('footerEmail', data.emailContacto);
            setTexto('footerHorario', data.horarioAtencion);

            if (data.logoUrl) {
                const logoHtml = `<img src="${escaparHtml(data.logoUrl)}" alt="${escaparHtml(nombreCompleto || 'Logo')}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" onerror="manejarErrorLogo(this)">`;
                const headerLogo = document.getElementById('logoBadge');
                const footerLogo = document.getElementById('footerLogoBadge');
                if (headerLogo) headerLogo.innerHTML = logoHtml;
                if (footerLogo) footerLogo.innerHTML = logoHtml;
            }

            if (data.whatsappNumero) {
                CONFIG.WHATSAPP_NUMERO = data.whatsappNumero;
                const footerBtn = document.getElementById('footerWhatsapp');
                if (footerBtn) footerBtn.href = `https://wa.me/${data.whatsappNumero}`;
            }

            const facebook = document.getElementById('footerFacebook');
            if (facebook) {
                if (data.facebookUrl) { facebook.href = data.facebookUrl; facebook.classList.remove('d-none'); }
                else facebook.classList.add('d-none');
            }
            const instagram = document.getElementById('footerInstagram');
            if (instagram) {
                if (data.instagramUrl) { instagram.href = data.instagramUrl; instagram.classList.remove('d-none'); }
                else instagram.classList.add('d-none');
            }
        } catch {
            // Sin conexión: la página se queda con los textos de reserva del HTML.
        }
    }

    document.getElementById('anioActual').textContent = new Date().getFullYear();
    cargarConfiguracionTienda();
})();
