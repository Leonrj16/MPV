(function () {
    // Valor de reserva si /api/tienda/configuracion no llega a cargar — el
    // número real se administra desde Configuración > Tienda Virtual (panel interno).
    const CONFIG = { WHATSAPP_NUMERO: '51999000111' };

    const formatCurrency = (n) =>
        new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n ?? 0);

    let catalogoCompleto = [];
    let categoriaActiva = '';
    let soloFavoritosActivo = false;

    const grid = document.getElementById('gridProductos');
    const resultCount = document.getElementById('resultCount');
    const buscador = document.getElementById('buscador');
    const categoriasNav = document.getElementById('categoriasNav');
    const ordenSelect = document.getElementById('ordenSelect');

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

    // "Últimas unidades" a partir de este umbral (inclusive) y hasta 1; en 0
    // o menos el producto se considera agotado.
    const UMBRAL_STOCK_BAJO = 5;

    function badgeStockHtml(p) {
        if (typeof p.stockActual !== 'number') return '';
        if (p.stockActual <= 0) return '<span class="badge-stock badge-agotado">Agotado</span>';
        if (p.stockActual <= UMBRAL_STOCK_BAJO) return `<span class="badge-stock badge-pocas">Últimas ${p.stockActual} unidades</span>`;
        return '';
    }

    function tarjetaProductoHtml(p) {
        const nombre = escaparHtml(p.nombre);
        const imagenHtml = p.imagenUrl
            ? `<img src="${escaparHtml(p.imagenUrl)}" alt="${nombre}" loading="lazy" onerror="manejarErrorImagen(this)">`
            : `<i class="bi bi-capsule placeholder-icono"></i>`;
        const agotado = typeof p.stockActual === 'number' && p.stockActual <= 0;
        const esFavorito = window.Favoritos?.tieneId(p.id);

        return `
            <div class="col reveal">
                <div class="card-producto" data-id="${p.id}">
                    <div class="card-producto-imagen">
                        ${p.categoria ? `<span class="card-producto-categoria">${escaparHtml(p.categoria)}</span>` : ''}
                        <button class="btn-favorito${esFavorito ? ' activo' : ''}" data-id="${p.id}" aria-label="Marcar como favorito">
                            <i class="bi ${esFavorito ? 'bi-heart-fill' : 'bi-heart'}"></i>
                        </button>
                        ${badgeStockHtml(p)}
                        ${imagenHtml}
                    </div>
                    <div class="card-producto-body">
                        <button type="button" class="card-producto-nombre" data-id="${p.id}">${nombre}</button>
                        <div class="card-producto-desc">${escaparHtml(p.descripcion) || 'Producto dental de calidad, con precio verificado.'}</div>
                        <div class="d-flex align-items-end justify-content-between mt-auto">
                            <div>
                                <div class="card-producto-precio">${formatCurrency(p.precio)}</div>
                                <div class="card-producto-unidad">por ${escaparHtml(p.unidadMedida)}</div>
                            </div>
                        </div>
                        <button class="btn-agregar${agotado ? ' agotado' : ''}" data-id="${p.id}" ${agotado ? 'disabled' : ''}>
                            <i class="bi ${agotado ? 'bi-x-circle' : 'bi-bag-plus-fill'} me-1"></i>${agotado ? 'Agotado' : 'Agregar al Carrito'}
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

    // Todo el orden ocurre en el cliente (el catálogo ya viaja completo con
    // precio y vendidosTotal), sin volver a pedir nada al servidor.
    function ordenarProductos(lista, orden) {
        const copia = [...lista];
        switch (orden) {
            case 'precio_asc': return copia.sort((a, b) => a.precio - b.precio);
            case 'precio_desc': return copia.sort((a, b) => b.precio - a.precio);
            case 'nombre': return copia.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
            case 'vendidos': return copia.sort((a, b) => (b.vendidosTotal || 0) - (a.vendidosTotal || 0));
            default: return copia;
        }
    }

    function aplicarFiltros() {
        const texto = buscador.value.trim().toLowerCase();
        const idsFavoritos = new Set(Favoritos.obtener());
        const filtrados = catalogoCompleto.filter((p) => {
            const matchTexto = !texto ||
                p.nombre.toLowerCase().includes(texto) ||
                (p.descripcion || '').toLowerCase().includes(texto);
            const matchCat = !categoriaActiva || p.categoria === categoriaActiva;
            const matchFavorito = !soloFavoritosActivo || idsFavoritos.has(p.id);
            return matchTexto && matchCat && matchFavorito;
        });
        renderGrid(ordenarProductos(filtrados, ordenSelect ? ordenSelect.value : ''));
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
    ordenSelect?.addEventListener('change', aplicarFiltros);

    // -------- Toast de confirmación --------
    let toastTimeout;
    function mostrarToast(texto) {
        const toast = document.getElementById('toastAgregado');
        document.getElementById('toastAgregadoTexto').textContent = texto;
        toast.classList.add('mostrar');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove('mostrar'), 2200);
    }

    function agregarAlCarritoConTope(producto, btn) {
        const enCarrito = Carrito.obtener().find((i) => i.id === producto.id);
        const cantidadActual = enCarrito ? enCarrito.cantidad : 0;
        if (typeof producto.stockActual === 'number' && producto.stockActual > 0 && cantidadActual >= producto.stockActual) {
            mostrarToast(`Ya tienes las ${producto.stockActual} unidades disponibles en tu carrito`);
            return;
        }

        Carrito.agregar(producto, 1);
        mostrarToast(`${producto.nombre} agregado al carrito`);

        if (btn) {
            const textoOriginal = btn.innerHTML;
            btn.classList.add('agregado');
            btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Agregado';
            setTimeout(() => {
                btn.classList.remove('agregado');
                btn.innerHTML = textoOriginal;
            }, 1200);
        }
    }

    // Alterna el favorito sin re-renderizar toda la grilla: solo actualiza el
    // corazón que se clickeó (igual que el "Agregado" del botón de carrito).
    // Si el filtro "solo favoritos" está activo, sí hace falta re-filtrar
    // para que el producto desaparezca al desmarcarlo.
    function alternarFavorito(id, corazonEl) {
        const activo = Favoritos.alternar(id);
        if (corazonEl) {
            corazonEl.classList.toggle('activo', activo);
            const icono = corazonEl.querySelector('i');
            if (icono) icono.className = activo ? 'bi bi-heart-fill' : 'bi bi-heart';
        }
        if (soloFavoritosActivo) aplicarFiltros();
    }

    function actualizarBadgeFavoritos(ids) {
        const badge = document.getElementById('badgeFavoritos');
        if (badge) badge.textContent = ids.length;
    }
    Favoritos.suscribir(actualizarBadgeFavoritos);

    document.getElementById('btnFavoritos')?.addEventListener('click', function () {
        soloFavoritosActivo = !soloFavoritosActivo;
        this.classList.toggle('activo', soloFavoritosActivo);
        aplicarFiltros();
    });

    // Se reutiliza tanto para el grid principal como para "Los Más Vendidos":
    // ambos usan las mismas tarjetas (tarjetaProductoHtml) y solo cambia de
    // qué lista viva se toma el producto al hacer clic.
    function crearManejadorGrid(obtenerListaActual) {
        return (e) => {
            const btnFav = e.target.closest('.btn-favorito');
            if (btnFav) {
                alternarFavorito(Number(btnFav.dataset.id), btnFav);
                return;
            }

            const btn = e.target.closest('.btn-agregar');
            if (btn) {
                if (btn.disabled) return;
                const producto = obtenerListaActual().find((p) => p.id === Number(btn.dataset.id));
                if (producto) agregarAlCarritoConTope(producto, btn);
                return;
            }

            const card = e.target.closest('.card-producto');
            if (card) abrirDetalle(Number(card.dataset.id));
        };
    }

    grid.addEventListener('click', crearManejadorGrid(() => catalogoCompleto));

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

        // window.open() va primero y sin await: tiene que ejecutarse en el
        // mismo turno síncrono del click o algunos navegadores (Safari) lo
        // bloquean por no "parecer" iniciado por el usuario.
        window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener');

        // Registro best-effort en el panel interno (Ventas > Pedidos Web),
        // para que el pedido no exista solo dentro del chat de WhatsApp. Si
        // esto falla, no debe afectar el pedido real: ya se abrió WhatsApp.
        const nombreCliente = document.getElementById('carritoNombreCliente')?.value.trim();
        fetch('/api/tienda/pedidos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: items.map((i) => ({ productoId: i.id, cantidad: i.cantidad })),
                cliente: nombreCliente || undefined,
            }),
        }).catch(() => {});
    });

    Carrito.suscribir(renderCarrito);

    // -------- "Los Más Vendidos" (portada) --------
    let destacadosProductos = [];
    const seccionDestacados = document.getElementById('seccionDestacados');
    const gridDestacados = document.getElementById('gridDestacados');
    const tituloDestacados = document.getElementById('tituloDestacados');

    async function cargarDestacados() {
        if (!seccionDestacados || !gridDestacados) return;
        try {
            const res = await fetch('/api/tienda/destacados').then((r) => r.json());
            if (!res.ok || res.data.criterio === 'ninguno' || res.data.productos.length === 0) {
                seccionDestacados.classList.add('d-none');
                return;
            }
            destacadosProductos = res.data.productos;
            if (tituloDestacados) {
                tituloDestacados.textContent = res.data.criterio === 'mas_vendidos' ? 'Los Más Vendidos' : 'Recién Llegados';
            }
            gridDestacados.innerHTML = destacadosProductos.map(tarjetaProductoHtml).join('');
            seccionDestacados.classList.remove('d-none');
            window.MPVScrollReveal?.iniciar();
        } catch {
            seccionDestacados.classList.add('d-none');
        }
    }

    gridDestacados?.addEventListener('click', crearManejadorGrid(() => destacadosProductos));

    // -------- Modal de detalle de producto --------
    let productoDetalleActual = null;
    let modalDetalleInstance = null;

    function getModalDetalle() {
        if (!modalDetalleInstance) {
            const el = document.getElementById('modalDetalleProducto');
            modalDetalleInstance = new bootstrap.Modal(el);
        }
        return modalDetalleInstance;
    }

    function miniProductoHtml(p) {
        const imagenHtml = p.imagenUrl
            ? `<img src="${escaparHtml(p.imagenUrl)}" alt="${escaparHtml(p.nombre)}" loading="lazy" onerror="manejarErrorImagen(this)">`
            : `<i class="bi bi-capsule"></i>`;
        return `
            <div class="mini-producto" data-id="${p.id}" role="button" tabindex="0" aria-label="Ver detalle de ${escaparHtml(p.nombre)}">
                <div class="mini-producto-imagen">${imagenHtml}</div>
                <div class="mini-producto-nombre">${escaparHtml(p.nombre)}</div>
                <div class="mini-producto-precio">${formatCurrency(p.precio)}</div>
            </div>
        `;
    }

    function estrellasHtml(calificacion, tamano) {
        const llenas = Math.round(calificacion);
        return Array.from({ length: 5 }, (_, i) =>
            `<i class="bi ${i < llenas ? 'bi-star-fill' : 'bi-star'}" style="font-size:${tamano || '0.85rem'};color:#e8935c;"></i>`
        ).join('');
    }

    function resenaItemHtml(r) {
        return `
            <div class="py-2" style="border-top:1px solid var(--tienda-gray-100);">
                <div class="d-flex justify-content-between align-items-center">
                    <span class="fw-semibold small">${escaparHtml(r.cliente_nombre)}</span>
                    <span>${estrellasHtml(r.calificacion)}</span>
                </div>
                ${r.comentario ? `<p class="text-muted small mb-0 mt-1">${escaparHtml(r.comentario)}</p>` : ''}
            </div>
        `;
    }

    function resenasSeccionHtml(p) {
        const promedioHtml = p.totalResenas > 0
            ? `${estrellasHtml(p.calificacionPromedio, '1rem')} <span class="fw-semibold ms-1">${p.calificacionPromedio}</span> <span class="text-muted small">(${p.totalResenas} reseña${p.totalResenas === 1 ? '' : 's'})</span>`
            : `<span class="text-muted small">Sé el primero en dejar una reseña.</span>`;

        return `
            <hr class="my-4">
            <div class="fw-bold mb-2">Reseñas</div>
            <div class="mb-3">${promedioHtml}</div>
            <div id="listaResenas">${(p.resenas || []).map(resenaItemHtml).join('')}</div>
            <div class="mt-3">
                <button type="button" class="btn btn-hero-outline btn-sm" id="btnMostrarFormResena">
                    <i class="bi bi-pencil-fill me-1"></i>Escribir una reseña
                </button>
                <form id="formResena" class="d-none mt-3">
                    <div class="row g-2">
                        <div class="col-12 col-sm-6">
                            <input type="text" class="form-control form-control-sm" id="resenaNombre" placeholder="Tu nombre" required>
                        </div>
                        <div class="col-12 col-sm-6">
                            <select class="form-select form-select-sm" id="resenaCalificacion" required>
                                <option value="5">5 estrellas — Excelente</option>
                                <option value="4">4 estrellas — Muy bueno</option>
                                <option value="3">3 estrellas — Bueno</option>
                                <option value="2">2 estrellas — Regular</option>
                                <option value="1">1 estrella — Malo</option>
                            </select>
                        </div>
                    </div>
                    <textarea class="form-control form-control-sm mt-2" id="resenaComentario" rows="2" placeholder="Comentario (opcional)"></textarea>
                    <div class="small text-danger d-none mt-2" id="resenaError"></div>
                    <div class="small text-success d-none mt-2" id="resenaExito">¡Gracias! Tu reseña quedará visible luego de ser revisada.</div>
                    <button type="submit" class="btn btn-agregar btn-sm mt-2">Enviar reseña</button>
                </form>
            </div>
        `;
    }

    function renderDetalleModal(p) {
        productoDetalleActual = p;
        const content = document.getElementById('modalDetalleContent');
        const imagenHtml = p.imagenUrl
            ? `<img src="${escaparHtml(p.imagenUrl)}" alt="${escaparHtml(p.nombre)}" onerror="manejarErrorImagen(this)">`
            : `<i class="bi bi-capsule placeholder-icono"></i>`;
        const agotado = typeof p.stockActual === 'number' && p.stockActual <= 0;
        const esFavorito = Favoritos.tieneId(p.id);

        content.innerHTML = `
            <div class="modal-header border-0 pb-0">
                <button class="btn-favorito${esFavorito ? ' activo' : ''}" id="btnFavoritoDetalle" data-id="${p.id}" aria-label="Marcar como favorito" style="position:static;">
                    <i class="bi ${esFavorito ? 'bi-heart-fill' : 'bi-heart'}"></i>
                </button>
                <button type="button" class="btn-close ms-2" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body pt-0">
                <div class="row g-4">
                    <div class="col-12 col-md-5">
                        <div class="detalle-imagen">
                            ${badgeStockHtml(p)}
                            ${imagenHtml}
                        </div>
                    </div>
                    <div class="col-12 col-md-7">
                        ${p.categoria ? `<span class="card-producto-categoria detalle-categoria">${escaparHtml(p.categoria)}</span>` : ''}
                        <h3 class="fw-bold mt-2" id="modalDetalleProductoTitulo">${escaparHtml(p.nombre)}</h3>
                        <p class="text-muted">${escaparHtml(p.descripcion) || 'Producto dental de calidad, con precio verificado.'}</p>
                        <div class="card-producto-precio mb-1" style="font-size:1.7rem;">${formatCurrency(p.precio)}</div>
                        <div class="card-producto-unidad mb-4">por ${escaparHtml(p.unidadMedida)}</div>
                        <div class="d-flex flex-wrap gap-2">
                            <button class="btn-agregar${agotado ? ' agotado' : ''}" id="btnAgregarDetalle" ${agotado ? 'disabled' : ''} style="max-width:320px;">
                                <i class="bi ${agotado ? 'bi-x-circle' : 'bi-bag-plus-fill'} me-1"></i>${agotado ? 'Agotado' : 'Agregar al Carrito'}
                            </button>
                            <button class="btn-hero-outline" id="btnCompartirDetalle" data-id="${p.id}">
                                <i class="bi bi-share-fill me-1"></i>Compartir
                            </button>
                        </div>
                    </div>
                </div>
                ${p.relacionados && p.relacionados.length ? `
                    <hr class="my-4">
                    <div class="fw-bold mb-3">También te puede interesar</div>
                    <div class="mini-productos-grid">${p.relacionados.map(miniProductoHtml).join('')}</div>
                ` : ''}
                ${resenasSeccionHtml(p)}
            </div>
        `;
    }

    async function abrirDetalle(id) {
        try {
            const res = await fetch(`/api/tienda/productos/${id}`).then((r) => r.json());
            if (!res.ok) return;
            renderDetalleModal(res.data);
            getModalDetalle().show();
        } catch {
            // Silencioso: si falla la carga del detalle, el usuario simplemente no ve el modal.
        }
    }

    // -------- Compartir producto --------
    async function compartirProducto(p) {
        const url = `${location.origin}${location.pathname}?producto=${p.id}#catalogo`;
        const texto = `${p.nombre} — ${formatCurrency(p.precio)} en San Judas Tadeo Botica Dental`;

        if (navigator.share) {
            try {
                await navigator.share({ title: p.nombre, text: texto, url });
            } catch {
                // El usuario canceló el diálogo nativo de compartir: no es un error.
            }
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            mostrarToast('Enlace copiado al portapapeles');
        } catch {
            mostrarToast('No se pudo copiar el enlace');
        }
    }

    // Si la URL trae ?producto=ID (por ejemplo, al abrir un enlace
    // compartido), abre directamente el modal de detalle de ese producto.
    function abrirDetalleDesdeUrl() {
        const id = new URLSearchParams(location.search).get('producto');
        if (id) abrirDetalle(Number(id));
    }

    document.getElementById('modalDetalleContent')?.addEventListener('click', (e) => {
        const btnAgregar = e.target.closest('#btnAgregarDetalle');
        if (btnAgregar) {
            if (btnAgregar.disabled || !productoDetalleActual) return;
            agregarAlCarritoConTope(productoDetalleActual, btnAgregar);
            return;
        }
        const btnFav = e.target.closest('#btnFavoritoDetalle');
        if (btnFav) {
            alternarFavorito(Number(btnFav.dataset.id), btnFav);
            return;
        }
        const btnCompartir = e.target.closest('#btnCompartirDetalle');
        if (btnCompartir && productoDetalleActual) {
            compartirProducto(productoDetalleActual);
            return;
        }
        const mini = e.target.closest('.mini-producto');
        if (mini) abrirDetalle(Number(mini.dataset.id));
        const btnMostrarFormResena = e.target.closest('#btnMostrarFormResena');
        if (btnMostrarFormResena) {
            document.getElementById('formResena')?.classList.remove('d-none');
            btnMostrarFormResena.classList.add('d-none');
        }
    });

    document.getElementById('modalDetalleContent')?.addEventListener('submit', async (e) => {
        const form = e.target.closest('#formResena');
        if (!form || !productoDetalleActual) return;
        e.preventDefault();

        const errorBox = document.getElementById('resenaError');
        const exitoBox = document.getElementById('resenaExito');
        errorBox.classList.add('d-none');
        exitoBox.classList.add('d-none');

        try {
            const res = await fetch(`/api/tienda/productos/${productoDetalleActual.id}/resenas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clienteNombre: document.getElementById('resenaNombre').value,
                    calificacion: Number(document.getElementById('resenaCalificacion').value),
                    comentario: document.getElementById('resenaComentario').value,
                }),
            }).then((r) => r.json());
            if (!res.ok) throw new Error(res.error || 'No se pudo enviar la reseña');
            form.reset();
            form.classList.add('d-none');
            exitoBox.classList.remove('d-none');
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.classList.remove('d-none');
        }
    });

    // .mini-producto es un <div role="button"> (no un elemento nativo), así
    // que necesita su propio manejo de Enter/Espacio para ser operable con
    // teclado — los <button> reales (Agregar, Favorito, Compartir) ya lo
    // hacen de forma nativa.
    document.getElementById('modalDetalleContent')?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const mini = e.target.closest('.mini-producto');
        if (!mini) return;
        e.preventDefault();
        abrirDetalle(Number(mini.dataset.id));
    });

    // -------- SEO: datos estructurados del catálogo real ya renderizado --------
    // A diferencia del JSON-LD de identidad del negocio (estático, en el
    // <head> del HTML), este refleja el catálogo que el usuario ve de verdad
    // en cada carga — se reconstruye cada vez que cambia catalogoCompleto.
    function inyectarJsonLdProductos(productos) {
        const data = {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            itemListElement: productos.slice(0, 40).map((p, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                item: {
                    '@type': 'Product',
                    name: p.nombre,
                    description: p.descripcion || undefined,
                    image: p.imagenUrl || undefined,
                    sku: p.sku,
                    offers: {
                        '@type': 'Offer',
                        price: p.precio,
                        priceCurrency: 'PEN',
                        availability: p.stockActual > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                    },
                },
            })),
        };
        let script = document.getElementById('jsonLdProductos');
        if (!script) {
            script = document.createElement('script');
            script.type = 'application/ld+json';
            script.id = 'jsonLdProductos';
            document.head.appendChild(script);
        }
        script.textContent = JSON.stringify(data);
    }

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
            inyectarJsonLdProductos(catalogoCompleto);
            abrirDetalleDesdeUrl();

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
    cargarDestacados();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js').catch(() => {});
        });
    }
})();
