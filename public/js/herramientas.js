(function () {
    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    function escaparHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto ?? '';
        return div.innerHTML;
    }

    // -------- Catálogo PDF --------
    document.getElementById('btnGenerarCatalogo').addEventListener('click', async () => {
        const btn = document.getElementById('btnGenerarCatalogo');
        const original = btn.innerHTML;
        btn.disabled = true;
        // Genera un PDF real con Puppeteer del lado del servidor — puede
        // tardar unos segundos, no es instantáneo como los demás reportes.
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando…';
        try {
            await MPV.descargarCatalogoPdf();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    });

    // -------- Inventario valorizado --------
    function filaInventarioHtml(p) {
        return `
            <tr>
                <td data-label="Producto"><span class="fw-semibold${p.sinPrecio ? ' text-danger' : ''}">${escaparHtml(p.nombre)}</span> <span class="pvp-sub">${escaparHtml(p.sku)}</span></td>
                <td data-label="Categoría">${escaparHtml(p.categoria)}</td>
                <td data-label="Stock">${p.stock}</td>
                <td data-label="P. Compra">${p.sinPrecio ? '<span class="pvp-sub">Sin proveedor</span>' : MPV.formatCurrency(p.precioCompraUnitario)}</td>
                <td data-label="Valor Compra">${MPV.formatCurrency(p.valorCompra)}</td>
                <td data-label="Valor Venta Pot.">${MPV.formatCurrency(p.valorVentaPotencial)}</td>
            </tr>
        `;
    }

    async function cargarInventarioValorizado() {
        const tbody = document.getElementById('inventarioTableBody');
        try {
            const { data } = await MPV.getInventarioValorizado();
            document.getElementById('inventarioValorCompra').textContent = MPV.formatCurrency(data.totales.valorCompra);
            document.getElementById('inventarioValorVenta').textContent = MPV.formatCurrency(data.totales.valorVentaPotencial);
            document.getElementById('inventarioMargenPotencial').textContent = MPV.formatCurrency(data.totales.margenPotencial);

            const aviso = document.getElementById('inventarioAvisoSinPrecio');
            if (data.totales.productosSinPrecio > 0) {
                aviso.textContent = `${data.totales.productosSinPrecio} producto${data.totales.productosSinPrecio === 1 ? '' : 's'} con stock no se pudo${data.totales.productosSinPrecio === 1 ? '' : 'n'} valorizar por no tener proveedor activo — no suma${data.totales.productosSinPrecio === 1 ? '' : 'n'} al total.`;
                aviso.classList.remove('d-none');
            } else {
                aviso.classList.add('d-none');
            }

            tbody.innerHTML = data.productos.length
                ? data.productos.map(filaInventarioHtml).join('')
                : `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-box"></i>No hay productos activos.</td></tr>`;
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
        }
    }

    async function exportarInventario(boton, exportador) {
        const original = boton.innerHTML;
        boton.disabled = true;
        boton.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        try {
            await exportador();
        } catch (err) {
            alert(err.message);
        } finally {
            boton.disabled = false;
            boton.innerHTML = original;
        }
    }

    document.getElementById('btnExportarInventarioExcel').addEventListener('click', (e) => exportarInventario(e.currentTarget, MPV.exportarInventarioExcel));
    document.getElementById('btnExportarInventarioPDF').addEventListener('click', (e) => exportarInventario(e.currentTarget, MPV.exportarInventarioPDF));

    // -------- Rentabilidad y rotación --------
    function nombreMes(mesYYYYMM) {
        return new Date(`${mesYYYYMM}-01T00:00:00`).toLocaleDateString('es-PE', { month: 'short', year: '2-digit' });
    }

    function renderGraficoRentabilidad(totalesPorMes) {
        const canvas = document.getElementById('chartRentabilidadMensual');
        if (!canvas || totalesPorMes.length === 0) return;

        new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: totalesPorMes.map((m) => nombreMes(m.mes)),
                datasets: [
                    {
                        label: 'Ingresos',
                        data: totalesPorMes.map((m) => m.ingresos),
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.08)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2,
                    },
                    {
                        label: 'Margen estimado',
                        data: totalesPorMes.map((m) => m.margen),
                        borderColor: '#3f9c72',
                        backgroundColor: 'rgba(63, 156, 114, 0.12)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${MPV.formatCurrency(ctx.parsed.y)}` } },
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: (v) => MPV.formatCurrency(v) }, grid: { color: '#eaf0ea' } },
                    x: { grid: { display: false } },
                },
            },
        });
    }

    function filaCategoriaRentabilidadHtml(c) {
        return `
            <tr>
                <td data-label="Categoría">${escaparHtml(c.categoria)}</td>
                <td data-label="Ingresos" class="text-end">${MPV.formatCurrency(c.ingresos)}</td>
                <td data-label="Margen" class="text-end">${MPV.formatCurrency(c.margen)}</td>
                <td data-label="%" class="text-end">${c.margenPct}%</td>
            </tr>
        `;
    }

    async function cargarRentabilidad() {
        try {
            const { data } = await MPV.getRentabilidad(6);
            renderGraficoRentabilidad(data.totalesPorMes);
            const tbody = document.getElementById('rentabilidadCategoriaTableBody');
            tbody.innerHTML = data.porCategoria.length
                ? data.porCategoria.map(filaCategoriaRentabilidadHtml).join('')
                : `<tr><td colspan="4" class="mpv-empty"><i class="bi bi-graph-up"></i>Sin ventas en el período.</td></tr>`;
        } catch (err) {
            document.getElementById('rentabilidadCategoriaTableBody').innerHTML =
                `<tr><td colspan="4" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
        }
    }

    function filaBajaRotacionHtml(p) {
        return `
            <tr>
                <td data-label="Producto"><span class="fw-semibold">${escaparHtml(p.nombre)}</span> <span class="pvp-sub">${escaparHtml(p.sku)}</span></td>
                <td data-label="Categoría">${escaparHtml(p.categoria)}</td>
                <td data-label="Stock">${p.stock}</td>
                <td data-label="Vendidos (90 días)">${p.unidadesVendidasPeriodo}</td>
                <td data-label="Última venta">${p.ultimaVenta ? new Date(p.ultimaVenta).toLocaleDateString('es-PE') : '<span class="pvp-sub">Nunca</span>'}</td>
                <td data-label="Valor inmovilizado" class="text-end">${p.sinPrecio ? '<span class="pvp-sub">Sin proveedor</span>' : MPV.formatCurrency(p.valorInmovilizado)}</td>
            </tr>
        `;
    }

    async function cargarBajaRotacion() {
        const tbody = document.getElementById('bajaRotacionTableBody');
        try {
            const { data } = await MPV.getBajaRotacion(90);
            const aviso = document.getElementById('bajaRotacionAviso');
            if (data.totales.cantidadProductos > 0) {
                aviso.textContent = `${data.totales.cantidadProductos} producto${data.totales.cantidadProductos === 1 ? '' : 's'} casi sin movimiento — ${MPV.formatCurrency(data.totales.valorInmovilizado)} parados en el estante.`;
                aviso.classList.remove('d-none');
            } else {
                aviso.classList.add('d-none');
            }
            tbody.innerHTML = data.productos.length
                ? data.productos.map(filaBajaRotacionHtml).join('')
                : `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-check-circle"></i>Todo el stock activo tuvo movimiento reciente.</td></tr>`;
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
        }
    }

    // -------- Cupones --------
    const ETIQUETAS_TIPO_CUPON = { porcentaje: '%', monto_fijo: 'S/' };

    function formatearDescuentoCupon(c) {
        return c.tipo === 'porcentaje' ? `${Number(c.valor)}%` : MPV.formatCurrency(c.valor);
    }

    function filaCuponHtml(c) {
        const usos = c.usos_maximos !== null ? `${c.usos_actuales} / ${c.usos_maximos}` : `${c.usos_actuales} (sin límite)`;
        const expira = c.fecha_expiracion ? new Date(`${c.fecha_expiracion}`).toLocaleDateString('es-PE') : 'No expira';
        return `
            <tr>
                <td data-label="Código"><span class="fw-semibold">${escaparHtml(c.codigo)}</span></td>
                <td data-label="Descuento">${formatearDescuentoCupon(c)}${Number(c.monto_minimo) > 0 ? ` <span class="pvp-sub">mín. ${MPV.formatCurrency(c.monto_minimo)}</span>` : ''}</td>
                <td data-label="Usos">${usos}</td>
                <td data-label="Expira">${expira}</td>
                <td data-label="Estado">${c.activo ? '<span class="supplier-badge optimo"><span class="dot"></span> Activo</span>' : '<span class="supplier-badge"><span class="dot"></span> Inactivo</span>'}</td>
                <td class="text-end">
                    <button class="btn-icon-sm" title="${c.activo ? 'Desactivar' : 'Activar'}" data-alternar-cupon="${c.id}" data-activo="${c.activo}">
                        <i class="bi ${c.activo ? 'bi-toggle-on' : 'bi-toggle-off'}"></i>
                    </button>
                </td>
            </tr>
        `;
    }

    async function cargarCupones() {
        const tbody = document.getElementById('cuponesTableBody');
        try {
            const { data: cupones } = await MPV.getCupones();
            tbody.innerHTML = cupones.length
                ? cupones.map(filaCuponHtml).join('')
                : `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-ticket-perforated"></i>Aún no hay cupones creados.</td></tr>`;
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
        }
    }

    document.getElementById('cuponesTableBody').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-alternar-cupon]');
        if (!btn) return;
        const id = btn.dataset.alternarCupon;
        const activo = btn.dataset.activo === 'true';
        try {
            await MPV.actualizarCupon(id, { activo: !activo });
            await cargarCupones();
        } catch (err) {
            alert(err.message);
        }
    });

    document.getElementById('formNuevoCupon').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorBox = document.getElementById('nuevoCuponError');
        errorBox.classList.add('d-none');
        try {
            await MPV.crearCupon({
                codigo: document.getElementById('cuponCodigo').value.trim(),
                tipo: document.getElementById('cuponTipo').value,
                valor: Number(document.getElementById('cuponValor').value),
                usosMaximos: document.getElementById('cuponUsosMaximos').value ? Number(document.getElementById('cuponUsosMaximos').value) : null,
                fechaExpiracion: document.getElementById('cuponExpiracion').value || null,
                montoMinimo: Number(document.getElementById('cuponMontoMinimo').value) || 0,
            });
            bootstrap.Modal.getInstance(document.getElementById('modalNuevoCupon')).hide();
            document.getElementById('formNuevoCupon').reset();
            await cargarCupones();
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.classList.remove('d-none');
        }
    });

    // -------- Reseñas pendientes --------
    function filaResenaHtml(r) {
        const estrellas = Array.from({ length: 5 }, (_, i) => `<i class="bi ${i < r.calificacion ? 'bi-star-fill' : 'bi-star'}" style="color:#e8935c;"></i>`).join('');
        return `
            <tr>
                <td data-label="Producto">${escaparHtml(r.producto_nombre)} <span class="pvp-sub">${escaparHtml(r.sku)}</span></td>
                <td data-label="Cliente">${escaparHtml(r.cliente_nombre)}</td>
                <td data-label="Calificación">${estrellas}</td>
                <td data-label="Comentario">${r.comentario ? escaparHtml(r.comentario) : '<span class="pvp-sub">Sin comentario</span>'}</td>
                <td class="text-end">
                    <button class="btn-icon-sm" title="Aprobar" data-moderar-resena="${r.id}" data-aprobado="true"><i class="bi bi-check-lg text-success"></i></button>
                    <button class="btn-icon-sm" title="Rechazar" data-moderar-resena="${r.id}" data-aprobado="false"><i class="bi bi-x-lg text-danger"></i></button>
                </td>
            </tr>
        `;
    }

    async function cargarResenas() {
        const tbody = document.getElementById('resenasTableBody');
        try {
            const { data: resenas } = await MPV.getResenasPendientes();
            tbody.innerHTML = resenas.length
                ? resenas.map(filaResenaHtml).join('')
                : `<tr><td colspan="5" class="mpv-empty"><i class="bi bi-check-circle"></i>No hay reseñas pendientes de moderación.</td></tr>`;
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
        }
    }

    document.getElementById('resenasTableBody').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-moderar-resena]');
        if (!btn) return;
        try {
            await MPV.moderarResena(btn.dataset.moderarResena, btn.dataset.aprobado === 'true');
            await cargarResenas();
        } catch (err) {
            alert(err.message);
        }
    });

    // -------- Backups --------
    function formatearTamano(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function filaBackupHtml(b) {
        return `
            <tr>
                <td data-label="Archivo">${b.nombre}</td>
                <td data-label="Fecha">${new Date(b.fecha).toLocaleString('es-PE')}</td>
                <td data-label="Tamaño">${formatearTamano(b.tamanoBytes)}</td>
                <td class="text-end"><button class="btn-icon-sm" title="Descargar" data-descargar-backup="${b.nombre}"><i class="bi bi-download"></i></button></td>
            </tr>
        `;
    }

    async function cargarBackups() {
        const tbody = document.getElementById('backupsTableBody');
        try {
            const { data: backups } = await MPV.getBackups();
            tbody.innerHTML = backups.length
                ? backups.map(filaBackupHtml).join('')
                : `<tr><td colspan="4" class="mpv-empty"><i class="bi bi-database"></i>Aún no hay copias de seguridad generadas.</td></tr>`;
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="4" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
        }
    }

    document.getElementById('backupsTableBody').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-descargar-backup]');
        if (!btn) return;
        try {
            await MPV.descargarBackup(btn.dataset.descargarBackup);
        } catch (err) {
            alert(err.message);
        }
    });

    document.getElementById('btnGenerarBackup').addEventListener('click', async () => {
        const btn = document.getElementById('btnGenerarBackup');
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando…';
        try {
            await MPV.generarBackup();
            await cargarBackups();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    });

    cargarInventarioValorizado();
    cargarRentabilidad();
    cargarBajaRotacion();
    cargarCupones();
    cargarResenas();
    cargarBackups();
})();
