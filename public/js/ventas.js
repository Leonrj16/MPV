(function () {
    let ventasCompletas = [];
    let pedidosCompletos = [];

    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    function debounce(fn, ms) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), ms);
        };
    }

    const ETIQUETAS_METODO_PAGO = {
        efectivo: 'Efectivo',
        tarjeta: 'Tarjeta',
        yape_plin: 'Yape / Plin',
        transferencia: 'Transferencia',
        mixto: 'Pago dividido',
    };

    function formatearFecha(iso) {
        return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
    }

    function resumenProductos(items) {
        if (!items || items.length === 0) return '—';
        const nombres = items.map((i) => `${i.producto} x${i.cantidad}`);
        if (nombres.length <= 2) return nombres.join(', ');
        return `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} más`;
    }

    // -------- Selector de pestaña --------
    const tabMostrador = document.getElementById('tabMostrador');
    const tabPedidosWeb = document.getElementById('tabPedidosWeb');
    const panelMostrador = document.getElementById('panelMostrador');
    const panelPedidosWeb = document.getElementById('panelPedidosWeb');

    function mostrarTab(tab) {
        const esMostrador = tab === 'mostrador';
        panelMostrador.classList.toggle('d-none', !esMostrador);
        panelPedidosWeb.classList.toggle('d-none', esMostrador);
        tabMostrador.className = esMostrador ? 'btn btn-mpv-primary' : 'btn btn-mpv-outline';
        tabPedidosWeb.className = esMostrador ? 'btn btn-mpv-outline' : 'btn btn-mpv-primary';
    }
    tabMostrador.addEventListener('click', () => mostrarTab('mostrador'));
    tabPedidosWeb.addEventListener('click', () => mostrarTab('pedidos'));

    // -------- Ventas de Mostrador --------
    const ventasTableBody = document.getElementById('ventasTableBody');
    const mostradorResultCount = document.getElementById('mostradorResultCount');

    function filaVentaHtml(v) {
        return `
            <tr>
                <td data-label="Fecha">${formatearFecha(v.created_at)}</td>
                <td data-label="Cliente">${v.cliente || 'Cliente varios'}</td>
                <td data-label="Productos"><span class="pvp-sub">${resumenProductos(v.items)}</span></td>
                <td data-label="Método de Pago">${ETIQUETAS_METODO_PAGO[v.metodo_pago] || v.metodo_pago}</td>
                <td data-label="Atendido por">${v.usuario_nombre || '—'}</td>
                <td class="text-end pvp-value" data-label="Total">${MPV.formatCurrency(v.total)}</td>
                <td class="text-end">
                    <button class="btn-icon-sm" title="Ver boleta" data-ver-boleta="${v.id}"><i class="bi bi-receipt"></i></button>
                </td>
            </tr>
        `;
    }

    function renderVentas(ventas) {
        mostradorResultCount.textContent = `${ventas.length} venta${ventas.length === 1 ? '' : 's'}`;
        if (ventas.length === 0) {
            ventasTableBody.innerHTML = `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-receipt"></i>No hay ventas registradas con estos filtros.</td></tr>`;
            return;
        }
        ventasTableBody.innerHTML = ventas.map(filaVentaHtml).join('');
    }

    async function cargarVentas() {
        try {
            const params = {};
            const cliente = document.getElementById('filtroCliente').value.trim();
            const desde = document.getElementById('filtroDesde').value;
            const hasta = document.getElementById('filtroHasta').value;
            const metodoPago = document.getElementById('filtroMetodoPago').value;
            if (cliente) params.cliente = cliente;
            if (desde) params.desde = desde;
            if (hasta) params.hasta = hasta;
            if (metodoPago) params.metodoPago = metodoPago;

            const { data } = await MPV.getVentas(params);
            ventasCompletas = data;
            renderVentas(ventasCompletas);
        } catch (err) {
            ventasTableBody.innerHTML = `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
            mostradorResultCount.textContent = 'Sin conexión';
        }
    }

    document.getElementById('filtroCliente').addEventListener('input', debounce(cargarVentas, 400));
    document.getElementById('filtroDesde').addEventListener('change', cargarVentas);
    document.getElementById('filtroHasta').addEventListener('change', cargarVentas);
    document.getElementById('filtroMetodoPago').addEventListener('change', cargarVentas);
    document.getElementById('btnLimpiarFiltros').addEventListener('click', () => {
        document.getElementById('filtroCliente').value = '';
        document.getElementById('filtroDesde').value = '';
        document.getElementById('filtroHasta').value = '';
        document.getElementById('filtroMetodoPago').value = '';
        cargarVentas();
    });

    // -------- Exportar (respeta los filtros activos de cada panel) --------
    function filtrosVentasActivos() {
        const params = {};
        const cliente = document.getElementById('filtroCliente').value.trim();
        const desde = document.getElementById('filtroDesde').value;
        const hasta = document.getElementById('filtroHasta').value;
        const metodoPago = document.getElementById('filtroMetodoPago').value;
        if (cliente) params.cliente = cliente;
        if (desde) params.desde = desde;
        if (hasta) params.hasta = hasta;
        if (metodoPago) params.metodoPago = metodoPago;
        return params;
    }

    async function exportarVentas(formato, link) {
        const textoOriginal = link.innerHTML;
        link.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando…';
        try {
            await (formato === 'excel'
                ? MPV.exportarVentasExcel(filtrosVentasActivos())
                : MPV.exportarVentasPDF(filtrosVentasActivos()));
        } catch (err) {
            alert(`No se pudo generar el archivo: ${err.message}`);
        } finally {
            link.innerHTML = textoOriginal;
        }
    }
    document.getElementById('exportarVentasExcel')?.addEventListener('click', (e) => {
        e.preventDefault();
        exportarVentas('excel', e.currentTarget);
    });
    document.getElementById('exportarVentasPdf')?.addEventListener('click', (e) => {
        e.preventDefault();
        exportarVentas('pdf', e.currentTarget);
    });

    ventasTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ver-boleta]');
        if (!btn) return;
        MPV.abrirBoleta(Number(btn.dataset.verBoleta)).catch((err) => alert(err.message));
    });

    // -------- Pedidos Web --------
    const pedidosTableBody = document.getElementById('pedidosTableBody');
    const pedidosResultCount = document.getElementById('pedidosResultCount');
    const badgePendientes = document.getElementById('badgePendientes');

    const ESTADO_BADGE_CLASE = { pendiente: 'medio', atendido: 'alto', cancelado: 'bajo' };
    const ESTADO_LABEL = { pendiente: 'Pendiente', atendido: 'Atendido', cancelado: 'Cancelado' };

    function filaPedidoHtml(p) {
        return `
            <tr>
                <td data-label="Fecha">${formatearFecha(p.created_at)}</td>
                <td data-label="Cliente">${p.cliente || 'Cliente web'}${p.telefono ? `<div class="pvp-sub">${p.telefono}</div>` : ''}</td>
                <td data-label="Productos"><span class="pvp-sub">${resumenProductos(p.items)}</span></td>
                <td data-label="Estado"><span class="badge-margin ${ESTADO_BADGE_CLASE[p.estado]}">${ESTADO_LABEL[p.estado]}</span></td>
                <td class="text-end pvp-value" data-label="Total">${MPV.formatCurrency(p.total)}</td>
                <td class="text-end">
                    <select class="form-select form-select-sm d-inline-block" style="width:auto;" data-cambiar-estado="${p.id}">
                        <option value="pendiente" ${p.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="atendido" ${p.estado === 'atendido' ? 'selected' : ''}>Atendido</option>
                        <option value="cancelado" ${p.estado === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                    </select>
                </td>
            </tr>
        `;
    }

    function renderPedidos(pedidos) {
        pedidosResultCount.textContent = `${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'}`;
        if (pedidos.length === 0) {
            pedidosTableBody.innerHTML = `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-inbox"></i>No hay pedidos con este filtro.</td></tr>`;
            return;
        }
        pedidosTableBody.innerHTML = pedidos.map(filaPedidoHtml).join('');
    }

    async function cargarPedidos() {
        try {
            const estado = document.getElementById('filtroEstadoPedido').value;
            const { data } = await MPV.getPedidosWeb(estado ? { estado } : {});
            pedidosCompletos = data;
            renderPedidos(pedidosCompletos);
        } catch (err) {
            pedidosTableBody.innerHTML = `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
            pedidosResultCount.textContent = 'Sin conexión';
        }
    }

    async function actualizarBadgePendientes() {
        try {
            const { data } = await MPV.getPedidosWeb({ estado: 'pendiente' });
            badgePendientes.textContent = data.length;
            badgePendientes.classList.toggle('d-none', data.length === 0);
        } catch {
            // El badge es un aviso extra, no crítico: si falla, no se muestra y ya.
        }
    }

    document.getElementById('filtroEstadoPedido').addEventListener('change', cargarPedidos);

    document.getElementById('exportarPedidosExcel')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando…';
        try {
            const estado = document.getElementById('filtroEstadoPedido').value;
            await MPV.exportarPedidosWebExcel(estado ? { estado } : {});
        } catch (err) {
            alert(`No se pudo generar el archivo: ${err.message}`);
        } finally {
            btn.innerHTML = textoOriginal;
        }
    });

    pedidosTableBody.addEventListener('change', async (e) => {
        const select = e.target.closest('[data-cambiar-estado]');
        if (!select) return;
        const id = Number(select.dataset.cambiarEstado);
        try {
            await MPV.actualizarEstadoPedidoWeb(id, select.value);
            await cargarPedidos();
            await actualizarBadgePendientes();
        } catch (err) {
            alert(err.message);
            await cargarPedidos(); // revierte el select visualmente
        }
    });

    cargarVentas();
    cargarPedidos();
    actualizarBadgePendientes();
})();
