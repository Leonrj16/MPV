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

    try {
        const { data: tablero } = await MPV.getTableroPrecios();
        const tbody = document.getElementById('actividadTableBody');
        const recientes = [...tablero]
            .sort((a, b) => new Date(b.fechaActualizacion) - new Date(a.fechaActualizacion))
            .slice(0, 6);

        if (recientes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-inbox"></i>No hay datos de precios registrados aún.</td></tr>`;
            return;
        }

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
    } catch (err) {
        console.error('Error cargando tablero:', err);
        document.getElementById('actividadTableBody').innerHTML =
            `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-plug-fill"></i>No se pudo conectar con la API. Verifica que el servidor esté activo.</td></tr>`;
    }
})();
