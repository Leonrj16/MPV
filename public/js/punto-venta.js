(function () {
    let productos = [];
    /** carrito: Map<productoId, { producto, cantidad }> */
    const carrito = new Map();
    let dividiendoPago = false;
    /** lineasPago: Array<{ metodoPago:string, monto:number }>, solo se usa mientras dividiendoPago === true */
    let lineasPago = [];
    let categoriaFiltro = null;

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

    const btnCaja = document.getElementById('btnCaja');
    const cajaEstadoTexto = document.getElementById('cajaEstadoTexto');
    const modalAbrirCaja = new bootstrap.Modal(document.getElementById('modalAbrirCaja'));
    const modalCerrarCajaEl = document.getElementById('modalCerrarCaja');
    const modalCerrarCaja = new bootstrap.Modal(modalCerrarCajaEl);
    let cajaFueCerradaAhora = false;

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
        const filtrados = productos.filter((p) => {
            const coincideTexto = !texto || p.nombre.toLowerCase().includes(texto) || p.sku.toLowerCase().includes(texto);
            const coincideCategoria = !categoriaFiltro || (p.categoria || 'Sin categoría') === categoriaFiltro;
            return coincideTexto && coincideCategoria;
        });

        resultCount.textContent = `${filtrados.length} producto${filtrados.length === 1 ? '' : 's'} activo${filtrados.length === 1 ? '' : 's'}`;

        if (filtrados.length === 0) {
            grid.innerHTML = `<div class="mpv-empty"><i class="bi bi-search"></i>No se encontraron productos.</div>`;
            return;
        }
        grid.innerHTML = `<div class="pos-grid">${filtrados.map(tarjetaProductoHtml).join('')}</div>`;
    }

    function renderCategoriaChips() {
        const contenedor = document.getElementById('posCategoriaChips');
        const categorias = [...new Set(productos.map((p) => p.categoria || 'Sin categoría'))].sort();
        const chip = (valor, etiqueta) => `
            <button type="button" class="btn btn-sm ${categoriaFiltro === valor ? 'btn-mpv-primary' : 'btn-mpv-outline'}" data-categoria-chip="${valor || ''}">${etiqueta}</button>
        `;
        contenedor.innerHTML = chip(null, 'Todas') + categorias.map((c) => chip(c, c)).join('');
    }

    document.getElementById('posCategoriaChips').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-categoria-chip]');
        if (!btn) return;
        categoriaFiltro = btn.dataset.categoriaChip || null;
        renderCategoriaChips();
        renderGrid();
    });

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

    function calcularTotalCarrito() {
        return [...carrito.values()].reduce((acc, e) => acc + e.producto.pvpSugerido * e.cantidad, 0);
    }

    function actualizarBotonRegistrar() {
        if (carrito.size === 0) {
            btnRegistrar.disabled = true;
            return;
        }
        if (dividiendoPago) {
            const total = Math.round(calcularTotalCarrito() * 100) / 100;
            const asignado = Math.round(lineasPago.reduce((s, p) => s + (Number(p.monto) || 0), 0) * 100) / 100;
            btnRegistrar.disabled = asignado !== total;
            return;
        }
        btnRegistrar.disabled = false;
    }

    function renderCarrito() {
        const entradas = [...carrito.values()];
        cartCountEl.textContent = `${entradas.length} producto${entradas.length === 1 ? '' : 's'}`;

        if (entradas.length === 0) {
            cartItemsEl.innerHTML = `<div class="mpv-empty"><i class="bi bi-cart"></i>Agrega productos del catálogo para empezar la venta.</div>`;
        } else {
            cartItemsEl.innerHTML = entradas.map(filaCarritoHtml).join('');
        }

        totalEl.textContent = MPV.formatCurrency(calcularTotalCarrito());
        if (dividiendoPago) renderPagosDivididos();
        actualizarBotonRegistrar();
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

    // Feedback sonoro sintetizado con Web Audio (sin archivos de audio que
    // vendorizar): un tono agudo corto para "agregado", uno grave para "no
    // se pudo". Si el navegador bloquea audio sin interacción previa o no
    // soporta la API, falla en silencio — el escaneo sigue funcionando
    // igual, el sonido es solo un plus.
    let audioCtx;
    function reproducirTono(frecuencia, duracionMs, tipo) {
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = tipo;
            osc.frequency.value = frecuencia;
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duracionMs / 1000);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duracionMs / 1000);
        } catch (err) {
            // sin sonido disponible, no interrumpe el flujo de venta
        }
    }
    const sonidoExito = () => reproducirTono(880, 120, 'sine');
    const sonidoError = () => reproducirTono(220, 220, 'square');

    function procesarEscaneo(codigo) {
        escanerError.classList.add('d-none');
        const valor = codigo.trim();
        if (!valor) return;

        const producto = productos.find((p) => p.codigoBarras === valor);
        if (!producto) {
            mostrarErrorEscaner(`Ningún producto tiene el código "${valor}".`);
            sonidoError();
        } else if (!producto.vendible) {
            mostrarErrorEscaner(`"${producto.nombre}" no tiene proveedor activo, no se puede vender.`);
            sonidoError();
        } else if ((carrito.get(producto.id)?.cantidad || 0) >= producto.stockActual) {
            mostrarErrorEscaner(`"${producto.nombre}" no tiene stock disponible.`);
            sonidoError();
        } else {
            agregarAlCarrito(producto.id);
            sonidoExito();
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
        cancelarPagoDividido();
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

    const ETIQUETAS_METODO_PAGO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', yape_plin: 'Yape / Plin', transferencia: 'Transferencia' };

    const posMetodoPago = document.getElementById('posMetodoPago');
    const posPagosDivididos = document.getElementById('posPagosDivididos');
    const posPagosLista = document.getElementById('posPagosLista');
    const posPagosFaltante = document.getElementById('posPagosFaltante');
    const posPagosFaltanteLabel = document.getElementById('posPagosFaltanteLabel');

    function lineaPagoHtml(pago, indice) {
        const opciones = Object.entries(ETIQUETAS_METODO_PAGO)
            .map(([valor, etiqueta]) => `<option value="${valor}" ${pago.metodoPago === valor ? 'selected' : ''}>${etiqueta}</option>`)
            .join('');
        return `
            <div class="d-flex gap-2 align-items-center mb-2" data-pago-linea="${indice}">
                <select class="form-select form-select-sm" data-pago-metodo>${opciones}</select>
                <input type="number" class="form-control form-control-sm" data-pago-monto min="0" step="0.10" value="${pago.monto || ''}" placeholder="Monto">
                <button type="button" class="btn-icon-sm flex-shrink-0" data-pago-quitar title="Quitar línea"><i class="bi bi-x-lg"></i></button>
            </div>
        `;
    }

    function actualizarPagosFaltante() {
        const total = Math.round(calcularTotalCarrito() * 100) / 100;
        const asignado = Math.round(lineasPago.reduce((s, p) => s + (Number(p.monto) || 0), 0) * 100) / 100;
        const diferencia = Math.round((total - asignado) * 100) / 100;

        posPagosFaltanteLabel.textContent = diferencia === 0 ? 'Pagos completos' : (diferencia > 0 ? 'Falta asignar' : 'Sobra asignado');
        posPagosFaltante.textContent = MPV.formatCurrency(Math.abs(diferencia));
        posPagosFaltante.parentElement.className = `d-flex justify-content-between small mt-2 ${diferencia === 0 ? 'text-success' : ''}`;
    }

    function renderPagosDivididos() {
        posPagosLista.innerHTML = lineasPago.map(lineaPagoHtml).join('');
        actualizarPagosFaltante();
    }

    const posMetodoPagoHeader = document.getElementById('posMetodoPagoHeader');

    function mostrarUiPagoDividido() {
        posMetodoPagoHeader.classList.add('d-none');
        posMetodoPago.classList.add('d-none');
        posPagosDivididos.classList.remove('d-none');
    }

    function iniciarPagoDividido() {
        dividiendoPago = true;
        const total = Math.round(calcularTotalCarrito() * 100) / 100;
        lineasPago = [{ metodoPago: posMetodoPago.value, monto: total }];
        mostrarUiPagoDividido();
        renderPagosDivididos();
        actualizarBotonRegistrar();
    }

    function cancelarPagoDividido() {
        dividiendoPago = false;
        lineasPago = [];
        posMetodoPagoHeader.classList.remove('d-none');
        posMetodoPago.classList.remove('d-none');
        posPagosDivididos.classList.add('d-none');
        actualizarBotonRegistrar();
    }

    document.getElementById('btnDividirPago').addEventListener('click', iniciarPagoDividido);
    document.getElementById('btnCancelarDividirPago').addEventListener('click', cancelarPagoDividido);

    document.getElementById('btnAgregarLineaPago').addEventListener('click', () => {
        lineasPago.push({ metodoPago: 'efectivo', monto: 0 });
        renderPagosDivididos();
        actualizarBotonRegistrar();
    });

    posPagosLista.addEventListener('input', (e) => {
        const fila = e.target.closest('[data-pago-linea]');
        if (!fila) return;
        const indice = Number(fila.dataset.pagoLinea);
        if (e.target.matches('[data-pago-metodo]')) lineasPago[indice].metodoPago = e.target.value;
        if (e.target.matches('[data-pago-monto]')) lineasPago[indice].monto = Number(e.target.value) || 0;
        actualizarPagosFaltante();
        actualizarBotonRegistrar();
    });

    posPagosLista.addEventListener('click', (e) => {
        const quitar = e.target.closest('[data-pago-quitar]');
        if (!quitar) return;
        const fila = quitar.closest('[data-pago-linea]');
        const indice = Number(fila.dataset.pagoLinea);
        if (lineasPago.length <= 1) return; // siempre queda al menos una línea
        lineasPago.splice(indice, 1);
        renderPagosDivididos();
        actualizarBotonRegistrar();
    });

    function resumenCierreHtml(resumen, montoApertura, montoEsperado) {
        const filas = resumen.porMetodo.length
            ? resumen.porMetodo.map((m) => `
                <div class="d-flex justify-content-between">
                    <span class="pvp-sub">${ETIQUETAS_METODO_PAGO[m.metodoPago] || m.metodoPago} (${m.cantidad})</span>
                    <span>${MPV.formatCurrency(m.total)}</span>
                </div>
            `).join('')
            : '<div class="pvp-sub">Sin ventas registradas en este turno.</div>';

        return `
            <div class="d-flex justify-content-between fw-semibold">
                <span>Monto de apertura</span>
                <span>${MPV.formatCurrency(montoApertura)}</span>
            </div>
            <div class="mt-2">${filas}</div>
            <div class="d-flex justify-content-between fw-semibold mt-2 pt-2" style="border-top: 1px solid var(--mpv-gray-100);">
                <span>Efectivo esperado en caja</span>
                <span>${MPV.formatCurrency(montoEsperado)}</span>
            </div>
        `;
    }

    async function refrescarEstadoCaja() {
        try {
            const { data: estado } = await MPV.getCajaActual();
            if (!estado.abierta) {
                cajaEstadoTexto.textContent = 'Caja cerrada';
                btnCaja.disabled = true;
                modalAbrirCaja.show();
                return null;
            }
            btnCaja.disabled = false;
            cajaEstadoTexto.textContent = `Caja abierta · ${MPV.formatCurrency(estado.montoEfectivoEsperado)}`;
            modalAbrirCaja.hide();
            return estado;
        } catch (err) {
            cajaEstadoTexto.textContent = 'Caja: sin conexión';
            return null;
        }
    }

    document.getElementById('formAbrirCaja').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorBox = document.getElementById('cajaAbrirError');
        const btn = document.getElementById('btnConfirmarAbrirCaja');
        errorBox.classList.add('d-none');
        btn.disabled = true;
        try {
            await MPV.abrirCaja({
                montoApertura: Number(document.getElementById('cajaMontoApertura').value) || 0,
                notas: document.getElementById('cajaNotasApertura').value.trim() || undefined,
            });
            document.getElementById('formAbrirCaja').reset();
            await refrescarEstadoCaja();
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.classList.remove('d-none');
        } finally {
            btn.disabled = false;
        }
    });

    btnCaja.addEventListener('click', async () => {
        document.getElementById('cajaResumenCierre').innerHTML = `<div class="mpv-empty"><i class="bi bi-hourglass-split"></i>Cargando…</div>`;
        document.getElementById('cajaFormCierre').classList.remove('d-none');
        document.getElementById('cajaFooterCierre').classList.remove('d-none');
        document.getElementById('cajaCierreResultado').classList.add('d-none');
        document.getElementById('cajaMontoContado').value = '';
        document.getElementById('cajaNotasCierre').value = '';
        modalCerrarCaja.show();

        const estado = await refrescarEstadoCaja();
        if (estado) {
            document.getElementById('cajaResumenCierre').innerHTML =
                resumenCierreHtml(estado.resumen, estado.caja.montoApertura, estado.montoEfectivoEsperado);
        }
    });

    document.getElementById('btnConfirmarCerrarCaja').addEventListener('click', async () => {
        const errorBox = document.getElementById('cajaCerrarError');
        const btn = document.getElementById('btnConfirmarCerrarCaja');
        errorBox.classList.add('d-none');
        btn.disabled = true;
        try {
            const { data: resultado } = await MPV.cerrarCaja({
                montoContado: Number(document.getElementById('cajaMontoContado').value) || 0,
                notas: document.getElementById('cajaNotasCierre').value.trim() || undefined,
            });

            document.getElementById('cajaFormCierre').classList.add('d-none');
            document.getElementById('cajaFooterCierre').classList.add('d-none');
            const resultadoBox = document.getElementById('cajaCierreResultado');
            const diferencia = resultado.diferencia;
            const claseAlerta = diferencia === 0 ? 'alert-success' : (diferencia > 0 ? 'alert-info' : 'alert-warning');
            const textoDiferencia = diferencia === 0
                ? 'Cuadró exacto, sin diferencias.'
                : diferencia > 0
                    ? `Sobran ${MPV.formatCurrency(diferencia)} respecto a lo esperado.`
                    : `Faltan ${MPV.formatCurrency(Math.abs(diferencia))} respecto a lo esperado.`;
            resultadoBox.className = `alert py-2 small mt-3 ${claseAlerta}`;
            resultadoBox.innerHTML = `
                <div class="fw-semibold mb-1">Caja cerrada</div>
                Esperado: ${MPV.formatCurrency(resultado.montoEfectivoEsperado)} ·
                Contado: ${MPV.formatCurrency(resultado.monto_cierre_contado)}<br>
                ${textoDiferencia}
            `;
            cajaFueCerradaAhora = true;
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.classList.remove('d-none');
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('btnCerrarModalCaja').addEventListener('click', () => modalCerrarCaja.hide());

    modalCerrarCajaEl.addEventListener('hidden.bs.modal', () => {
        if (cajaFueCerradaAhora) {
            cajaFueCerradaAhora = false;
            refrescarEstadoCaja();
        }
    });

    // Ventas en espera ("parking"): se guardan solo en este navegador — no
    // hace falta backend porque son borradores de venta, no ventas
    // registradas (no tocan stock ni caja hasta que se reanudan y se
    // confirman). Se guardan como {productoId, cantidad}, no el objeto
    // producto completo, porque precio/stock pueden cambiar mientras la
    // venta está en espera — al reanudar se resuelve contra el catálogo
    // vigente, no contra una foto vieja.
    const CLAVE_VENTAS_EN_ESPERA = 'mpv_pos_ventas_en_espera';
    const badgeVentasEnEspera = document.getElementById('badgeVentasEnEspera');
    const ventasEnEsperaContenido = document.getElementById('ventasEnEsperaContenido');

    function cargarVentasEnEspera() {
        try {
            return JSON.parse(localStorage.getItem(CLAVE_VENTAS_EN_ESPERA) || '[]');
        } catch {
            return [];
        }
    }

    function guardarVentasEnEspera(lista) {
        localStorage.setItem(CLAVE_VENTAS_EN_ESPERA, JSON.stringify(lista));
    }

    function filaVentaEnEsperaHtml(v) {
        const hora = new Date(v.creadoEn).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="d-flex justify-content-between align-items-center p-2" style="border-bottom: 1px solid var(--mpv-gray-100);" data-espera-id="${v.id}">
                <div>
                    <div class="fw-semibold small">${v.nombre}</div>
                    <div class="pvp-sub">${v.items.length} producto${v.items.length === 1 ? '' : 's'} · ${hora}</div>
                </div>
                <div class="d-flex gap-1">
                    <button class="btn-icon-sm" data-espera-reanudar title="Reanudar"><i class="bi bi-play-fill"></i></button>
                    <button class="btn-icon-sm" data-espera-eliminar title="Eliminar"><i class="bi bi-trash3"></i></button>
                </div>
            </div>
        `;
    }

    function renderVentasEnEspera() {
        const lista = cargarVentasEnEspera();
        badgeVentasEnEspera.textContent = lista.length;
        badgeVentasEnEspera.classList.toggle('d-none', lista.length === 0);

        ventasEnEsperaContenido.innerHTML = lista.length === 0
            ? `<div class="p-3 text-center text-muted small">No hay ventas en espera.</div>`
            : lista.map(filaVentaEnEsperaHtml).join('');
    }

    document.getElementById('btnPonerEnEspera').addEventListener('click', () => {
        if (carrito.size === 0) return;
        const clienteActual = document.getElementById('posCliente').value.trim();
        const sugerido = clienteActual || `Venta ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
        const nombre = (prompt('Nombre para identificar esta venta en espera:', sugerido) || '').trim();
        if (!nombre) return;

        const lista = cargarVentasEnEspera();
        lista.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            nombre,
            cliente: clienteActual,
            dividiendoPago,
            metodoPago: posMetodoPago.value,
            pagos: dividiendoPago ? lineasPago.map((p) => ({ ...p })) : null,
            items: [...carrito.values()].map((e) => ({ productoId: e.producto.id, cantidad: e.cantidad })),
            creadoEn: new Date().toISOString(),
        });
        guardarVentasEnEspera(lista);
        renderVentasEnEspera();

        carrito.clear();
        cancelarPagoDividido();
        document.getElementById('posCliente').value = '';
        ocultarMensajes();
        renderGrid();
        renderCarrito();
    });

    ventasEnEsperaContenido.addEventListener('click', (e) => {
        const fila = e.target.closest('[data-espera-id]');
        if (!fila) return;
        const id = fila.dataset.esperaId;
        const lista = cargarVentasEnEspera();
        const indice = lista.findIndex((v) => v.id === id);
        if (indice === -1) return;

        if (e.target.closest('[data-espera-eliminar]')) {
            lista.splice(indice, 1);
            guardarVentasEnEspera(lista);
            renderVentasEnEspera();
            return;
        }

        if (e.target.closest('[data-espera-reanudar]')) {
            if (carrito.size > 0 && !confirm('Hay productos en la venta actual. ¿Reemplazarlos por la venta en espera?')) {
                return;
            }

            const ticket = lista[indice];
            lista.splice(indice, 1);
            guardarVentasEnEspera(lista);
            renderVentasEnEspera();

            carrito.clear();
            cancelarPagoDividido();

            const avisos = [];
            ticket.items.forEach((it) => {
                const producto = productos.find((p) => p.id === it.productoId);
                if (!producto) {
                    avisos.push(`Un producto de "${ticket.nombre}" ya no existe o está inactivo.`);
                    return;
                }
                if (!producto.vendible) {
                    avisos.push(`"${producto.nombre}" ya no tiene proveedor activo.`);
                    return;
                }
                const cantidad = Math.min(it.cantidad, producto.stockActual);
                if (cantidad <= 0) {
                    avisos.push(`"${producto.nombre}" ya no tiene stock disponible.`);
                    return;
                }
                if (cantidad < it.cantidad) {
                    avisos.push(`"${producto.nombre}": stock reducido a ${cantidad} (tenía ${it.cantidad}).`);
                }
                carrito.set(producto.id, { producto, cantidad });
            });

            document.getElementById('posCliente').value = ticket.cliente || '';
            renderGrid();
            renderCarrito();

            if (ticket.dividiendoPago && ticket.pagos && ticket.pagos.length) {
                dividiendoPago = true;
                lineasPago = ticket.pagos.map((p) => ({ ...p }));
                mostrarUiPagoDividido();
                renderPagosDivididos();
                actualizarBotonRegistrar();
            } else if (ticket.metodoPago) {
                posMetodoPago.value = ticket.metodoPago;
            }

            if (avisos.length) {
                errorBox.textContent = avisos.join(' ');
                errorBox.classList.remove('d-none');
            }
        }
    });

    async function cargarProductos() {
        try {
            const { data } = await MPV.getProductosDisponiblesVenta();
            productos = data;
            renderCategoriaChips();
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
        const payload = { items, cliente: document.getElementById('posCliente').value.trim() || undefined };
        if (dividiendoPago) {
            payload.pagos = lineasPago.map((p) => ({ metodoPago: p.metodoPago, monto: Number(p.monto) || 0 }));
        } else {
            payload.metodoPago = posMetodoPago.value;
        }

        try {
            const { data: venta } = await MPV.crearVenta(payload);
            exitoBox.innerHTML = `
                Venta #${venta.id} registrada por ${MPV.formatCurrency(venta.total)}.
                <button type="button" class="btn btn-link btn-sm p-0 ms-1 align-baseline" id="btnVerBoleta">
                    <i class="bi bi-receipt me-1"></i>Ver / imprimir boleta
                </button>
            `;
            exitoBox.classList.remove('d-none');
            carrito.clear();
            cancelarPagoDividido();
            document.getElementById('posCliente').value = '';
            renderCarrito();
            await cargarProductos(); // refresca stock real tras la venta
            refrescarEstadoCaja(); // el efectivo esperado cambia con cada venta en efectivo

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
            actualizarBotonRegistrar();
        }
    });

    // Atajos de teclado para agilizar el mostrador — se ignoran mientras hay
    // un modal abierto (apertura/cierre de caja) para no interferir con esos
    // formularios, y no se usa Esc para vaciar el carrito a propósito: una
    // tecla que borra la venta por error de un toque es un riesgo que no
    // vale la pena para el atajo que ahorra.
    document.addEventListener('keydown', (e) => {
        if (document.querySelector('.modal.show')) return;
        if (e.key === 'F2') {
            e.preventDefault();
            buscador.focus();
        } else if (e.key === 'F3') {
            e.preventDefault();
            escaner.focus();
        } else if (e.key === 'F8') {
            e.preventDefault();
            if (!btnRegistrar.disabled) btnRegistrar.click();
        } else if (e.key === 'F9') {
            e.preventDefault();
            document.getElementById('btnPonerEnEspera').click();
        }
    });

    cargarProductos();
    renderCarrito();
    refrescarEstadoCaja();
    renderVentasEnEspera();
})();
