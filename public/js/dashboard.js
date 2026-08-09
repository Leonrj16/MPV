(async function initDashboard() {
    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    async function exportar(formato, link) {
        const textoOriginal = link.innerHTML;
        link.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando…';
        try {
            await (formato === 'excel' ? MPV.exportarExcel() : MPV.exportarPDF());
        } catch (err) {
            alert(`No se pudo generar el archivo: ${err.message}`);
        } finally {
            link.innerHTML = textoOriginal;
        }
    }
    document.getElementById('exportarExcel')?.addEventListener('click', (e) => {
        e.preventDefault();
        exportar('excel', e.currentTarget);
    });
    document.getElementById('exportarPdf')?.addEventListener('click', (e) => {
        e.preventDefault();
        exportar('pdf', e.currentTarget);
    });

    try {
        const { data: kpis } = await MPV.getKpis();
        document.querySelector('[data-kpi="totalProductos"]').textContent = kpis.totalProductos;
        document.querySelector('[data-kpi="proveedoresActivos"]').textContent = kpis.proveedoresActivos;
        document.querySelector('[data-kpi="margenPromedioPct"]').textContent = kpis.margenPromedioPct.toFixed(1);
        document.querySelector('[data-kpi="alertasSubidaPrecio"]').textContent = kpis.alertasSubidaPrecio;
    } catch (err) {
        console.error('Error cargando KPIs:', err);
    }

    let tablero = [];
    try {
        ({ data: tablero } = await MPV.getTableroPrecios());
        renderGraficoCategorias(tablero);
        renderDonutsRentabilidad(tablero);
    } catch (err) {
        console.error('Error cargando gráficos:', err);
        document.getElementById('donutsRentabilidad').innerHTML =
            `<div class="mpv-empty w-100"><i class="bi bi-plug-fill"></i>No se pudieron cargar los gráficos.</div>`;
    }

    try {
        const tbody = document.getElementById('actividadTableBody');
        const recientes = [...tablero]
            .sort((a, b) => new Date(b.fechaActualizacion) - new Date(a.fechaActualizacion))
            .slice(0, 6);

        if (recientes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-inbox"></i>No hay datos de precios registrados aún.</td></tr>`;
        } else {
            tbody.innerHTML = recientes.map((fila) => `
                <tr>
                    <td>
                        <div class="product-cell">
                            <div class="product-thumb"><i class="bi bi-capsule"></i></div>
                            <div>
                                <div class="product-name">${fila.producto}</div>
                                <div class="product-sku">${fila.sku}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="supplier-badge ${fila.esProveedorOptimo ? 'optimo' : ''}">
                            <span class="dot"></span> ${fila.proveedor}
                        </span>
                        ${fila.alertaSubidaPrecio ? '<span class="alert-price-up"><i class="bi bi-arrow-up-short"></i>Subió</span>' : ''}
                    </td>
                    <td>${MPV.formatCurrency(fila.precioCompra)}</td>
                    <td>
                        <div class="pvp-value">${MPV.formatCurrency(fila.pvpSugerido)}</div>
                        <div class="pvp-sub">antes de impuestos: ${MPV.formatCurrency(fila.subtotalSinImpuesto)}</div>
                    </td>
                    <td><span class="badge-margin ${fila.rentabilidad}">${fila.margenRealPct.toFixed(1)}%</span></td>
                    <td class="text-end"><a href="pricing.html" class="btn-icon-sm"><i class="bi bi-arrow-up-right"></i></a></td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error('Error cargando tablero:', err);
        document.getElementById('actividadTableBody').innerHTML =
            `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-plug-fill"></i>No se pudo conectar con la API. Verifica que el servidor esté activo.</td></tr>`;
    }

    /**
     * Barras: número de productos distintos por categoría, a partir del
     * tablero real (deduplicado por producto, ya que una categoría puede
     * tener varias filas si un producto tiene más de un proveedor).
     */
    function renderGraficoCategorias(tablero) {
        const productosVistos = new Set();
        const conteoPorCategoria = {};

        tablero.forEach((fila) => {
            if (productosVistos.has(fila.productoId)) return;
            productosVistos.add(fila.productoId);
            const categoria = fila.categoria || 'Sin categoría';
            conteoPorCategoria[categoria] = (conteoPorCategoria[categoria] || 0) + 1;
        });

        const entradas = Object.entries(conteoPorCategoria).sort((a, b) => b[1] - a[1]);
        const canvas = document.getElementById('chartCategorias');
        if (!canvas || entradas.length === 0) return;

        new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: entradas.map(([nombre]) => nombre),
                datasets: [{
                    data: entradas.map(([, total]) => total),
                    backgroundColor: '#3f9c72',
                    borderRadius: 8,
                    maxBarThickness: 44,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eaf0ea' } },
                    x: { grid: { display: false } },
                },
            },
        });
    }

    /**
     * Donas: % de combinaciones producto-proveedor en cada nivel de
     * rentabilidad (mismo cálculo que los badges de la tabla de precios).
     */
    function renderDonutsRentabilidad(tablero) {
        const contenedor = document.getElementById('donutsRentabilidad');
        if (!contenedor) return;
        if (tablero.length === 0) {
            contenedor.innerHTML = `<div class="mpv-empty w-100"><i class="bi bi-pie-chart"></i>Sin datos suficientes todavía.</div>`;
            return;
        }

        const niveles = [
            { clave: 'alto', etiqueta: 'Margen alto', color: '#3f9c72' },
            { clave: 'medio', etiqueta: 'Margen medio', color: '#e8935c' },
            { clave: 'bajo', etiqueta: 'Margen bajo', color: '#e0574c' },
        ];

        contenedor.innerHTML = niveles.map((n) => `
            <div class="text-center" style="width: 110px;">
                <div style="position: relative; width: 100px; height: 100px; margin: 0 auto;">
                    <canvas id="donut-${n.clave}"></canvas>
                    <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.05rem;" id="donutLabel-${n.clave}">—</div>
                </div>
                <div class="pvp-sub mt-2">${n.etiqueta}</div>
            </div>
        `).join('');

        niveles.forEach((n) => {
            const cantidad = tablero.filter((f) => f.rentabilidad === n.clave).length;
            const pct = Math.round((cantidad / tablero.length) * 100);
            document.getElementById(`donutLabel-${n.clave}`).textContent = `${pct}%`;

            new Chart(document.getElementById(`donut-${n.clave}`).getContext('2d'), {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: [pct, 100 - pct],
                        backgroundColor: [n.color, '#eaf0ea'],
                        borderWidth: 0,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                },
            });
        });
    }
})();
