(function () {
    let tableroCompleto = [];
    let categorias = [];
    let proveedores = [];

    const tbody = document.getElementById('preciosTableBody');
    const resultCount = document.getElementById('resultCount');
    const buscador = document.getElementById('buscador');
    const filtroCategoria = document.getElementById('filtroCategoria');
    const filtroProveedor = document.getElementById('filtroProveedor');
    const filtroRentabilidad = document.getElementById('filtroRentabilidad');

    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    function renderSkeleton() {
        tbody.innerHTML = Array.from({ length: 4 }).map(() => `
            <tr class="skeleton-row"><td colspan="7"><div class="skeleton-bar" style="width:100%"></div></td></tr>
        `).join('');
    }

    function filaHtml(fila) {
        return `
            <tr data-producto-id="${fila.productoId}">
                <td>
                    <div class="product-cell">
                        <div class="product-thumb"><i class="bi bi-capsule"></i></div>
                        <div>
                            <div class="product-name">${fila.producto}</div>
                            <div class="product-sku">${fila.sku} · ${fila.categoria ?? 'Sin categoría'}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="supplier-badge ${fila.esProveedorOptimo ? 'optimo' : ''}">
                        <span class="dot"></span> ${fila.proveedor}
                        ${fila.esProveedorOptimo ? '<i class="bi bi-patch-check-fill" title="Proveedor óptimo"></i>' : ''}
                    </span><br>
                    ${fila.alertaSubidaPrecio ? '<span class="alert-price-up"><i class="bi bi-arrow-up-short"></i>Precio subió</span>' : ''}
                </td>
                <td>${MPV.formatCurrency(fila.precioCompra)}</td>
                <td>
                    ${MPV.formatCurrency(fila.costoTotalUnitario)}
                    <div class="pvp-sub">incl. logística ${MPV.formatCurrency(fila.costoLogisticoUnitario)}</div>
                </td>
                <td><span class="badge-margin ${fila.rentabilidad}"><i class="bi bi-graph-up"></i> ${fila.margenRealPct.toFixed(1)}%</span></td>
                <td>
                    <div class="pvp-value">${MPV.formatCurrency(fila.pvpSugerido)}</div>
                    <div class="pvp-sub">+ impuesto ${MPV.formatCurrency(fila.montoImpuesto)}</div>
                </td>
                <td>
                    <div class="row-actions">
                        <button class="btn-icon-sm" title="Comparar proveedores" onclick="PricingUI.abrirComparar(${fila.productoId})">
                            <i class="bi bi-bar-chart-steps"></i>
                        </button>
                        <button class="btn-icon-sm" title="Ver historial de precios" onclick="PricingUI.abrirHistorial(${fila.proveedorProductoId})">
                            <i class="bi bi-graph-up-arrow"></i>
                        </button>
                        <button class="btn-icon-sm" title="Actualizar precio" onclick="PricingUI.abrirActualizar(${fila.proveedorProductoId}, '${fila.producto.replace(/'/g, "\\'")}', '${fila.proveedor.replace(/'/g, "\\'")}', ${fila.precioCompra})">
                            <i class="bi bi-pencil-fill"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    function aplicarFiltros() {
        const texto = buscador.value.trim().toLowerCase();
        const cat = filtroCategoria.value;
        const prov = filtroProveedor.value;
        const rent = filtroRentabilidad.value;

        const filtradas = tableroCompleto.filter((f) => {
            const matchTexto = !texto || f.producto.toLowerCase().includes(texto) || f.sku.toLowerCase().includes(texto);
            const matchCat = !cat || f.categoria === cat;
            const matchProv = !prov || String(f.proveedorId) === prov;
            const matchRent = !rent || f.rentabilidad === rent;
            return matchTexto && matchCat && matchProv && matchRent;
        });

        renderTabla(filtradas);
    }

    function renderTabla(filas) {
        resultCount.textContent = `${filas.length} producto${filas.length === 1 ? '' : 's'} encontrado${filas.length === 1 ? '' : 's'}`;
        if (filas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-search"></i>No se encontraron resultados con los filtros aplicados.</td></tr>`;
            return;
        }
        tbody.innerHTML = filas.map(filaHtml).join('');
    }

    function poblarFiltros() {
        filtroCategoria.innerHTML = '<option value="">Todas las categorías</option>' +
            [...new Set(tableroCompleto.map((f) => f.categoria).filter(Boolean))]
                .map((c) => `<option value="${c}">${c}</option>`).join('');

        filtroProveedor.innerHTML = '<option value="">Todos los proveedores</option>' +
            proveedores.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('');
    }

    async function cargarDatos() {
        renderSkeleton();
        try {
            const [tableroRes, provRes] = await Promise.all([
                MPV.getTableroPrecios(),
                MPV.getProveedores(),
            ]);
            tableroCompleto = tableroRes.data;
            proveedores = provRes.data;
            poblarFiltros();
            renderTabla(tableroCompleto);
        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-plug-fill"></i>No se pudo conectar con la API. Verifica que el servidor esté activo.</td></tr>`;
            resultCount.textContent = 'Sin conexión';
        }
    }

    [buscador, filtroCategoria, filtroProveedor, filtroRentabilidad].forEach((el) =>
        el.addEventListener('input', aplicarFiltros)
    );

    // -------- Modales --------
    const modalActualizar = new bootstrap.Modal(document.getElementById('modalActualizarPrecio'));
    const modalComparar = new bootstrap.Modal(document.getElementById('modalComparar'));
    const modalHistorial = new bootstrap.Modal(document.getElementById('modalHistorial'));
    let chartHistorialInstancia = null;

    window.PricingUI = {
        abrirActualizar(proveedorProductoId, producto, proveedor, precioActual) {
            document.getElementById('inputProveedorProductoId').value = proveedorProductoId;
            document.getElementById('inputNuevoPrecio').value = precioActual;
            document.getElementById('modalProductoInfo').textContent = `${producto} — Proveedor actual: ${proveedor}`;
            modalActualizar.show();
        },
        async abrirComparar(productoId) {
            modalComparar.show();
            const body = document.getElementById('modalCompararBody');
            body.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>`;
            try {
                const { ofertasOrdenadas } = await MPV.compararProveedores(productoId);
                if (!ofertasOrdenadas.length) {
                    body.innerHTML = `<p class="text-muted mb-0">No hay proveedores registrados para este producto.</p>`;
                    return;
                }
                body.innerHTML = ofertasOrdenadas.map((o) => `
                    <div class="d-flex align-items-center justify-content-between p-3 mb-2 rounded-3 ${o.esOptimo ? 'bg-light border border-2' : 'border'}" style="border-color: ${o.esOptimo ? 'var(--mpv-emerald)' : 'var(--mpv-gray-200)'} !important;">
                        <div>
                            <div class="fw-semibold">${o.proveedorNombre} ${o.esOptimo ? '<span class="badge-margin alto ms-1"><i class="bi bi-patch-check-fill"></i> Óptimo</span>' : ''}</div>
                            <div class="pvp-sub">Entrega en ${o.tiempoEntregaDias} días</div>
                        </div>
                        <div class="pvp-value">${MPV.formatCurrency(o.precioCompra)}</div>
                    </div>
                `).join('');
            } catch (err) {
                body.innerHTML = `<p class="text-danger mb-0">Error al comparar proveedores: ${err.message}</p>`;
            }
        },
        async abrirHistorial(proveedorProductoId) {
            modalHistorial.show();
            const body = document.getElementById('modalHistorialBody');
            const subtitulo = document.getElementById('modalHistorialSubtitulo');
            body.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>`;
            subtitulo.textContent = '';

            try {
                const { producto, sku, proveedor, data } = await MPV.getHistorialPrecio(proveedorProductoId);
                subtitulo.textContent = `${producto} (${sku}) — ${proveedor}`;

                if (!data.length) {
                    body.innerHTML = `<p class="text-muted mb-0">Aún no hay historial registrado para este producto.</p>`;
                    return;
                }

                body.innerHTML = `<div style="height: 280px;"><canvas id="chartHistorial"></canvas></div>`;

                const labels = data.map((d) => new Date(d.fechaRegistro).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }));
                const valores = data.map((d) => d.precioCompraUnitario);

                if (chartHistorialInstancia) {
                    chartHistorialInstancia.destroy();
                }

                const ctx = document.getElementById('chartHistorial').getContext('2d');
                chartHistorialInstancia = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Precio de compra (USD)',
                            data: valores,
                            borderColor: '#2563eb',
                            backgroundColor: 'rgba(37, 99, 235, 0.08)',
                            borderWidth: 2.5,
                            pointBackgroundColor: '#2563eb',
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            tension: 0.3,
                            fill: true,
                        }],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { ticks: { callback: (v) => `$${Number(v).toFixed(2)}` }, grid: { color: '#f1f5f9' } },
                            x: { grid: { display: false } },
                        },
                    },
                });
            } catch (err) {
                body.innerHTML = `<p class="text-danger mb-0">Error al cargar el historial: ${err.message}</p>`;
            }
        },
    };

    document.getElementById('btnGuardarPrecio').addEventListener('click', async () => {
        const id = document.getElementById('inputProveedorProductoId').value;
        const nuevoPrecio = parseFloat(document.getElementById('inputNuevoPrecio').value);
        if (isNaN(nuevoPrecio) || nuevoPrecio < 0) return;

        const btn = document.getElementById('btnGuardarPrecio');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando…';
        try {
            await MPV.actualizarPrecio(id, nuevoPrecio);
            modalActualizar.hide();
            await cargarDatos();
        } catch (err) {
            alert(`Error al actualizar el precio: ${err.message}`);
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Guardar Cambios';
        }
    });

    cargarDatos();
})();
