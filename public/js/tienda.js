(function () {
    // Valor de reserva si /api/tienda/configuracion no llega a cargar — el
    // número real se administra desde Configuración > Tienda Virtual (panel interno).
    const CONFIG = { WHATSAPP_NUMERO: '51999000111' };

    const formatCurrency = (n) =>
        new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n ?? 0);

    let catalogoCompleto = [];
    let categoriaActiva = '';

    const grid = document.getElementById('gridProductos');
    const resultCount = document.getElementById('resultCount');
    const buscador = document.getElementById('buscador');
    const categoriasNav = document.getElementById('categoriasNav');

    function escaparHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto ?? '';
        return div.innerHTML;
    }

    // Si la URL de imagen del producto falla al cargar, cae a un ícono genérico.
    window.manejarErrorImagen = function (img) {
        img.parentElement.innerHTML = '<i class="bi bi-capsule placeholder-icono"></i>';
    };

    // Si la URL del logo (configurable desde el panel interno) falla al cargar,
    // cae al ícono de marca por defecto en vez de dejar un ícono roto.
    window.manejarErrorLogo = function (img) {
        img.parentElement.innerHTML = '<i class="bi bi-clipboard2-pulse"></i>';
    };

    // Si la URL de la imagen de portada falla, cae a la ilustración compuesta
    // (emblema + íconos de categoría) que ya usa el hero por defecto.
    window.manejarErrorHeroImagen = function (img) {
        img.closest('.hero-media-card').innerHTML = '<div class="hero-media-emblem"><i class="bi bi-clipboard2-pulse"></i></div>';
    };

    function tarjetaProductoHtml(p) {
        const nombre = escaparHtml(p.nombre);
        const imagenHtml = p.imagenUrl
            ? `<img src="${escaparHtml(p.imagenUrl)}" alt="${nombre}" loading="lazy" onerror="manejarErrorImagen(this)">`
            : `<i class="bi bi-capsule placeholder-icono"></i>`;

        return `
            <div class="col reveal">
                <div class="card-producto">
                    <div class="card-producto-imagen">
                        ${p.categoria ? `<span class="card-producto-categoria">${escaparHtml(p.categoria)}</span>` : ''}
                        ${imagenHtml}
                    </div>
                    <div class="card-producto-body">
                        <div class="card-producto-nombre">${nombre}</div>
                        <div class="card-producto-desc">${escaparHtml(p.descripcion) || 'Producto dental de calidad, con precio verificado.'}</div>
                        <div class="d-flex align-items-end justify-content-between mt-auto">
                            <div>
                                <div class="card-producto-precio">${formatCurrency(p.precio)}</div>
                                <div class="card-producto-unidad">por ${escaparHtml(p.unidadMedida)}</div>
                            </div>
                        </div>
                        <button class="btn-agregar" data-id="${p.id}">
                            <i class="bi bi-bag-plus-fill me-1"></i>Agregar al Carrito
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderGrid(productos) {
        resultCount.textContent = `${productos.length} producto${productos.length === 1 ? '' : 's'} disponible${productos.length === 1 ? '' : 's'}`;
        if (productos.length === 0) {
            grid.innerHTML = `<div class="col-12"><div class="mpv-empty"><i class="bi bi-search"></i>No encontramos productos con ese criterio.</div></div>`;
            return;
        }
        grid.innerHTML = productos.map(tarjetaProductoHtml).join('');
        window.MPVScrollReveal?.iniciar();
    }

    function aplicarFiltros() {
        const texto = buscador.value.trim().toLowerCase();
        const filtrados = catalogoCompleto.filter((p) => {
            const matchTexto = !texto ||
                p.nombre.toLowerCase().includes(texto) ||
                (p.descripcion || '').toLowerCase().includes(texto);
            const matchCat = !categoriaActiva || p.categoria === categoriaActiva;
            return matchTexto && matchCat;
        });
        renderGrid(filtrados);
    }

    function renderCategorias(categorias) {
        const chips = ['<button class="chip-categoria activo" data-categoria="">Todos los productos</button>']
            .concat(categorias.map((c) => `<button class="chip-categoria" data-categoria="${escaparHtml(c.nombre)}">${escaparHtml(c.nombre)}</button>`));
        categoriasNav.innerHTML = chips.join('');
    }

    categoriasNav.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip-categoria');
        if (!btn) return;
        categoriaActiva = btn.dataset.categoria;
        categoriasNav.querySelectorAll('.chip-categoria').forEach((c) => c.classList.remove('activo'));
        btn.classList.add('activo');
        aplicarFiltros();
    });

    buscador.addEventListener('input', aplicarFiltros);

    // -------- Toast de confirmación --------
    let toastTimeout;
    function mostrarToast(texto) {
        const toast = document.getElementById('toastAgregado');
        document.getElementById('toastAgregadoTexto').textContent = texto;
        toast.classList.add('mostrar');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove('mostrar'), 2200);
    }

    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-agregar');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const producto = catalogoCompleto.find((p) => p.id === id);
        if (!producto) return;

        Carrito.agregar(producto, 1);
        mostrarToast(`${producto.nombre} agregado al carrito`);

        const textoOriginal = btn.innerHTML;
        btn.classList.add('agregado');
        btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Agregado';
        setTimeout(() => {
            btn.classList.remove('agregado');
            btn.innerHTML = textoOriginal;
        }, 1200);
    });

    // -------- Carrito: badge + offcanvas --------
    function itemCarritoHtml(item) {
        const imagenHtml = item.imagenUrl
            ? `<img src="${escaparHtml(item.imagenUrl)}" alt="${escaparHtml(item.nombre)}" onerror="manejarErrorImagen(this)">`
            : `<i class="bi bi-capsule"></i>`;
        return `
            <div class="item-carrito">
                <div class="item-carrito-imagen">${imagenHtml}</div>
                <div class="flex-grow-1">
                    <div class="fw-semibold small">${escaparHtml(item.nombre)}</div>
                    <div class="text-muted" style="font-size:0.76rem;">${formatCurrency(item.precio)} c/u</div>
                    <div class="d-flex align-items-center justify-content-between mt-2">
                        <div class="stepper-cantidad">
                            <button class="btn-restar" data-id="${item.id}" aria-label="Restar">−</button>
                            <span>${item.cantidad}</span>
                            <button class="btn-sumar" data-id="${item.id}" aria-label="Sumar">+</button>
                        </div>
                        <div class="fw-bold small">${formatCurrency(item.precio * item.cantidad)}</div>
                    </div>
                </div>
                <button class="btn-eliminar-item" data-id="${item.id}" title="Eliminar"><i class="bi bi-trash3"></i></button>
            </div>
        `;
    }

    function renderCarrito(items) {
        const badge = document.getElementById('badgeCarrito');
        const cantidadTotal = items.reduce((s, i) => s + i.cantidad, 0);
        badge.textContent = cantidadTotal;
        badge.classList.remove('pulso');
        void badge.offsetWidth; // fuerza reflow para reiniciar la animación
        badge.classList.add('pulso');

        const lista = document.getElementById('listaCarrito');
        lista.innerHTML = items.length === 0
            ? `<div class="carrito-vacio"><i class="bi bi-bag-x"></i>Tu carrito está vacío</div>`
            : items.map(itemCarritoHtml).join('');

        const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
        document.getElementById('totalCarrito').textContent = formatCurrency(total);
        document.getElementById('btnFinalizarPedido').disabled = items.length === 0;
        document.getElementById('btnVaciarCarrito').disabled = items.length === 0;
    }

    document.getElementById('listaCarrito').addEventListener('click', (e) => {
        const btnSumar = e.target.closest('.btn-sumar');
        const btnRestar = e.target.closest('.btn-restar');
        const btnEliminar = e.target.closest('.btn-eliminar-item');
        if (btnSumar) Carrito.actualizarCantidad(Number(btnSumar.dataset.id), 1);
        if (btnRestar) Carrito.actualizarCantidad(Number(btnRestar.dataset.id), -1);
        if (btnEliminar) Carrito.eliminar(Number(btnEliminar.dataset.id));
    });

    document.getElementById('btnVaciarCarrito').addEventListener('click', () => {
        if (confirm('¿Vaciar todo el carrito?')) Carrito.vaciar();
    });

    document.getElementById('btnFinalizarPedido').addEventListener('click', () => {
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

        window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener');
    });

    Carrito.suscribir(renderCarrito);

    // -------- Carga inicial del catálogo (API pública, sin autenticación) --------
    async function cargar() {
        try {
            const [resProductos, resCategorias] = await Promise.all([
                fetch('/api/tienda/productos').then((r) => r.json()),
                fetch('/api/tienda/categorias').then((r) => r.json()),
            ]);
            if (!resProductos.ok) throw new Error(resProductos.error || 'No se pudo cargar el catálogo');

            catalogoCompleto = resProductos.data;
            const categorias = resCategorias.ok ? resCategorias.data : [];
            renderCategorias(categorias);
            renderGrid(catalogoCompleto);

            document.getElementById('statProductos').textContent = catalogoCompleto.length;
            document.getElementById('statCategorias').textContent = categorias.length;
        } catch (err) {
            grid.innerHTML = `<div class="col-12"><div class="mpv-empty"><i class="bi bi-plug-fill"></i>No se pudo cargar el catálogo. Intenta de nuevo más tarde.</div></div>`;
            resultCount.textContent = 'Sin conexión';
        }
    }

    // -------- Configuración de marca (Configuración > Tienda Virtual en el panel interno) --------
    function setTexto(id, valor) {
        const el = document.getElementById(id);
        if (el && valor) el.textContent = valor;
    }

    function aplicarConfiguracionTienda(data) {
        const nombreCompleto = [data.nombreNegocio, data.eslogan].filter(Boolean).join(' ');
        if (nombreCompleto) document.title = `${nombreCompleto} | Tienda Virtual`;

        setTexto('brandTitulo', data.nombreNegocio);
        setTexto('brandEslogan', data.eslogan);
        setTexto('footerBrandTitulo', data.nombreNegocio);
        setTexto('footerBrandEslogan', data.eslogan);
        if (nombreCompleto) setTexto('footerCopyrightNombre', nombreCompleto);

        setTexto('heroTitulo', data.heroTitulo);
        setTexto('heroDescripcion', data.heroDescripcion);

        setTexto('topstripTelefono', data.telefono);
        setTexto('topstripHorario', data.horarioAtencion);
        setTexto('topstripDireccion', data.direccion);
        setTexto('footerDireccion', data.direccion);
        setTexto('footerTelefono', data.telefono);
        setTexto('footerEmail', data.emailContacto);
        setTexto('footerHorario', data.horarioAtencion);

        // Logo: si hay logoUrl, reemplaza el ícono de marca por la imagen real.
        if (data.logoUrl) {
            const logoHtml = `<img src="${escaparHtml(data.logoUrl)}" alt="${escaparHtml(nombreCompleto || 'Logo')}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" onerror="manejarErrorLogo(this)">`;
            const headerLogo = document.getElementById('logoBadge');
            const footerLogo = document.getElementById('footerLogoBadge');
            if (headerLogo) headerLogo.innerHTML = logoHtml;
            if (footerLogo) footerLogo.innerHTML = logoHtml;
        }

        // Imagen de portada: si hay heroImagenUrl, reemplaza la ilustración
        // compuesta (emblema + íconos flotantes) por la imagen real.
        if (data.heroImagenUrl) {
            const card = document.getElementById('heroMediaCard');
            if (card) {
                card.innerHTML = `<img src="${escaparHtml(data.heroImagenUrl)}" alt="${escaparHtml(nombreCompleto || 'Portada')}" class="hero-media-img" onerror="manejarErrorHeroImagen(this)">`;
            }
        }

        // WhatsApp: botón del hero, ícono social del footer y el número usado al finalizar el pedido.
        if (data.whatsappNumero) {
            CONFIG.WHATSAPP_NUMERO = data.whatsappNumero;
            const heroBtn = document.getElementById('heroWhatsapp');
            if (heroBtn) heroBtn.href = `https://wa.me/${data.whatsappNumero}`;
            const footerBtn = document.getElementById('footerWhatsapp');
            if (footerBtn) footerBtn.href = `https://wa.me/${data.whatsappNumero}`;
        }

        // Redes sociales: el ícono solo se muestra si hay una URL configurada.
        const facebook = document.getElementById('footerFacebook');
        if (facebook) {
            if (data.facebookUrl) {
                facebook.href = data.facebookUrl;
                facebook.classList.remove('d-none');
            } else {
                facebook.classList.add('d-none');
            }
        }
        const instagram = document.getElementById('footerInstagram');
        if (instagram) {
            if (data.instagramUrl) {
                instagram.href = data.instagramUrl;
                instagram.classList.remove('d-none');
            } else {
                instagram.classList.add('d-none');
            }
        }
    }

    async function cargarConfiguracionTienda() {
        try {
            const res = await fetch('/api/tienda/configuracion').then((r) => r.json());
            if (res.ok) aplicarConfiguracionTienda(res.data);
        } catch {
            // Sin conexión: la página se queda con el nombre/textos de reserva del HTML.
        }
    }

    // -------- Header compacto al hacer scroll --------
    const header = document.querySelector('.tienda-header');
    if (header) {
        window.addEventListener('scroll', () => {
            header.classList.toggle('compacto', window.scrollY > 24);
        }, { passive: true });
    }

    document.getElementById('anioActual').textContent = new Date().getFullYear();
    cargarConfiguracionTienda();
    cargar();
})();
