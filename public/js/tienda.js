(function () {
    // TODO: reemplazar por el número de WhatsApp real del consultorio (formato: código país + número, sin '+' ni espacios).
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

    function tarjetaProductoHtml(p) {
        const nombre = escaparHtml(p.nombre);
        const imagenHtml = p.imagenUrl
            ? `<img src="${escaparHtml(p.imagenUrl)}" alt="${nombre}" loading="lazy" onerror="manejarErrorImagen(this)">`
            : `<i class="bi bi-capsule placeholder-icono"></i>`;

        return `
            <div class="col">
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
            renderCategorias(resCategorias.ok ? resCategorias.data : []);
            renderGrid(catalogoCompleto);
        } catch (err) {
            grid.innerHTML = `<div class="col-12"><div class="mpv-empty"><i class="bi bi-plug-fill"></i>No se pudo cargar el catálogo. Intenta de nuevo más tarde.</div></div>`;
            resultCount.textContent = 'Sin conexión';
        }
    }

    document.getElementById('anioActual').textContent = new Date().getFullYear();
    cargar();
})();
