(function () {
    let productos = [];
    /** carrito: Map<productoId, { producto, cantidad }> */
    const carrito = new Map();

    const grid = document.getElementById('posGrid');
    const resultCount = document.getElementById('posResultCount');
    const buscador = document.getElementById('posBuscador');
    const cartItemsEl = document.getElementById('posCartItems');
    const cartCountEl = document.getElementById('posCartCount');
    const totalEl = document.getElementById('posTotal');
    const btnRegistrar = document.getElementById('btnRegistrarVenta');
    const errorBox = document.getElementById('posError');
    const exitoBox = document.getElementById('posExito');
    const escaner = document.getElementById('posEscaner');
    const escanerError = document.getElementById('posEscanerError');

    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    function ocultarMensajes() {
        errorBox.classList.add('d-none');
        exitoBox.classList.add('d-none');
    }

    function tarjetaProductoHtml(p) {
        const enCarrito = carrito.get(p.id)?.cantidad || 0;
        const disponible = p.stockActual - enCarrito;
        const sinStock = disponible <= 0;
        const sinPrecio = !p.vendible;
        const deshabilitado = sinStock || sinPrecio;

        return `
            <div class="pos-product-card ${deshabilitado ? 'disabled' : ''}">
                <div class="d-flex justify-content-between align-items-start gap-2">
                    <div>
                        <div class="product-name">${p.nombre}</div>
                        <div class="product-sku">${p.sku} · ${p.categoria || 'Sin categoría'}</div>
                    </div>
                    <span class="badge-margin ${p.stockActual > 0 ? 'alto' : 'bajo'}">${p.stockActual} ${p.unidadMedida}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-2">
                    <div class="pvp-value">${sinPrecio ? '—' : MPV.formatCurrency(p.pvpSugerido)}</div>
                    <button class="btn btn-mpv-outline btn-sm" data-add="${p.id}" ${deshabilitado ? 'disabled' : ''}>
                        <i class="bi bi-plus-lg me-1"></i> Agregar
                    </button>
                </div>
                ${sinPrecio ? '<div class="pvp-sub mt-1">Sin proveedor activo, no se puede vender</div>' : ''}
                ${!sinPrecio && sinStock ? '<div class="pvp-sub mt-1">Sin stock disponible</div>' : ''}
            </div>
        `;
    }

    function renderGrid() {
        const texto = buscador.value.trim().toLowerCase();
        const filtrados = !texto
            ? productos
            : productos.filter((p) => p.nombre.toLowerCase().includes(texto) || p.sku.toLowerCase().includes(texto));

        resultCount.textContent = `${filtrados.length} producto${filtrados.length === 1 ? '' : 's'} activo${filtrados.length === 1 ? '' : 's'}`;

        if (filtrados.length === 0) {
            grid.innerHTML = `<div class="mpv-empty"><i class="bi bi-search"></i>No se encontraron productos.</div>`;
            return;
        }
        grid.innerHTML = `<div class="pos-grid">${filtrados.map(tarjetaProductoHtml).join('')}</div>`;
    }

    function filaCarritoHtml(entrada) {
        const { producto, cantidad } = entrada;
        const subtotal = producto.pvpSugerido * cantidad;
        return `
            <div class="pos-cart-item">
                <div class="flex-grow-1">
                    <div class="product-name" style="font-size:0.85rem;">${producto.nombre}</div>
                    <div class="pvp-sub">${MPV.formatCurrency(producto.pvpSugerido)} c/u</div>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <button class="btn-icon-sm" data-decr="${producto.id}" title="Quitar uno"><i class="bi bi-dash"></i></button>
                    <input type="number" class="form-control form-control-sm text-center" style="width:52px;" min="1" max="${producto.stockActual}" value="${cantidad}" data-qty="${producto.id}">
                    <button class="btn-icon-sm" data-incr="${producto.id}" title="Agregar uno"><i class="bi bi-plus"></i></button>
                </div>
                <div class="pvp-value" style="min-width:78px; text-align:right;">${MPV.formatCurrency(subtotal)}</div>
                <button class="btn-icon-sm" data-remove="${producto.id}" title="Quitar del carrito"><i class="bi bi-x-lg"></i></button>
            </div>
        `;
    }

    function renderCarrito() {
        const entradas = [...carrito.values()];
        cartCountEl.textContent = `${entradas.length} producto${entradas.length === 1 ? '' : 's'}`;

        if (entradas.length === 0) {
            cartItemsEl.innerHTML = `<div class="mpv-empty"><i class="bi bi-cart"></i>Agrega productos del catálogo para empezar la venta.</div>`;
        } else {
            cartItemsEl.innerHTML = entradas.map(filaCarritoHtml).join('');
        }

        const total = entradas.reduce((acc, e) => acc + e.producto.pvpSugerido * e.cantidad, 0);
        totalEl.textContent = MPV.formatCurrency(total);
        btnRegistrar.disabled = entradas.length === 0;
    }

    function agregarAlCarrito(productoId) {
        const producto = productos.find((p) => p.id === productoId);
        if (!producto || !producto.vendible) return;

        const entrada = carrito.get(productoId);
        const cantidadActual = entrada?.cantidad || 0;
        if (cantidadActual >= producto.stockActual) return;

        carrito.set(productoId, { producto, cantidad: cantidadActual + 1 });
        ocultarMensajes();
        renderGrid();
        renderCarrito();
    }

    function mostrarErrorEscaner(mensaje) {
        escanerError.textContent = mensaje;
        escanerError.classList.remove('d-none');
    }

    function procesarEscaneo(codigo) {
        escanerError.classList.add('d-none');
        const valor = codigo.trim();
        if (!valor) return;

        const producto = productos.find((p) => p.codigoBarras === valor);
        if (!producto) {
            mostrarErrorEscaner(`Ningún producto tiene el código "${valor}".`);
        } else if (!producto.vendible) {
            mostrarErrorEscaner(`"${producto.nombre}" no tiene proveedor activo, no se puede vender.`);
        } else if ((carrito.get(producto.id)?.cantidad || 0) >= producto.stockActual) {
            mostrarErrorEscaner(`"${producto.nombre}" no tiene stock disponible.`);
        } else {
            agregarAlCarrito(producto.id);
        }

        escaner.value = '';
        escaner.focus();
    }

    function cambiarCantidad(productoId, nuevaCantidad) {
        const entrada = carrito.get(productoId);
        if (!entrada) return;

        const cantidad = Math.max(1, Math.min(Math.round(nuevaCantidad), entrada.producto.stockActual));
        carrito.set(productoId, { ...entrada, cantidad });
        ocultarMensajes();
        renderGrid();
        renderCarrito();
    }

    function quitarDelCarrito(productoId) {
        carrito.delete(productoId);
        ocultarMensajes();
        renderGrid();
        renderCarrito();
    }

    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-add]');
        if (btn) agregarAlCarrito(Number(btn.dataset.add));
    });

    cartItemsEl.addEventListener('click', (e) => {
        const incr = e.target.closest('[data-incr]');
        const decr = e.target.closest('[data-decr]');
        const remove = e.target.closest('[data-remove]');
        if (incr) {
            const id = Number(incr.dataset.incr);
            const entrada = carrito.get(id);
            if (entrada) cambiarCantidad(id, entrada.cantidad + 1);
        } else if (decr) {
            const id = Number(decr.dataset.decr);
            const entrada = carrito.get(id);
            if (entrada) {
                if (entrada.cantidad <= 1) quitarDelCarrito(id);
                else cambiarCantidad(id, entrada.cantidad - 1);
            }
        } else if (remove) {
            quitarDelCarrito(Number(remove.dataset.remove));
        }
    });

    cartItemsEl.addEventListener('change', (e) => {
        const input = e.target.closest('[data-qty]');
        if (!input) return;
        const id = Number(input.dataset.qty);
        cambiarCantidad(id, Number(input.value) || 1);
    });

    document.getElementById('btnVaciarCarrito').addEventListener('click', () => {
        carrito.clear();
        ocultarMensajes();
        renderGrid();
        renderCarrito();
    });

    buscador.addEventListener('input', renderGrid);

    escaner.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        procesarEscaneo(escaner.value);
    });

    document.getElementById('btnEscanearPos').addEventListener('click', () => {
        BarcodeScanner.abrir({ onDetectado: (codigo) => procesarEscaneo(codigo) });
    });

    escaner.focus();

    async function cargarProductos() {
        try {
            const { data } = await MPV.getProductosDisponiblesVenta();
            productos = data;
            renderGrid();
        } catch (err) {
            grid.innerHTML = `<div class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</div>`;
            resultCount.textContent = 'Sin conexión';
        }
    }

    btnRegistrar.addEventListener('click', async () => {
        ocultarMensajes();
        btnRegistrar.disabled = true;

        const items = [...carrito.values()].map((e) => ({ productoId: e.producto.id, cantidad: e.cantidad }));

        try {
            const { data: venta } = await MPV.crearVenta({
                items,
                cliente: document.getElementById('posCliente').value.trim() || undefined,
                metodoPago: document.getElementById('posMetodoPago').value,
            });
            exitoBox.innerHTML = `
                Venta #${venta.id} registrada por ${MPV.formatCurrency(venta.total)}.
                <button type="button" class="btn btn-link btn-sm p-0 ms-1 align-baseline" id="btnVerBoleta">
                    <i class="bi bi-receipt me-1"></i>Ver / imprimir boleta
                </button>
            `;
            exitoBox.classList.remove('d-none');
            carrito.clear();
            document.getElementById('posCliente').value = '';
            renderCarrito();
            await cargarProductos(); // refresca stock real tras la venta

            // Comprobante provisional: se abre solo (mientras el negocio no
            // tenga RUC/registro SUNAT, no es una boleta electrónica válida,
            // solo un recibo para el cliente). Si el navegador bloquea el
            // popup, queda el botón "Ver / imprimir boleta" como respaldo.
            const abrir = () => MPV.abrirBoleta(venta.id).catch((err) => {
                errorBox.textContent = err.message;
                errorBox.classList.remove('d-none');
            });
            document.getElementById('btnVerBoleta')?.addEventListener('click', abrir);
            abrir();
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.classList.remove('d-none');
            btnRegistrar.disabled = carrito.size === 0;
        }
    });

    cargarProductos();
    renderCarrito();
})();
