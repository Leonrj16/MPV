(function () {
    let ventasCompletas = [];
    let pedidosCompletos = [];

    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    function escaparHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto ?? '';
        return div.innerHTML;
    }

    // escaparHtml() sirve para texto entre etiquetas, pero deja las comillas
    // tal cual — un textContent con comillas no las codifica porque no hacen
    // falta ahí. Puesto dentro de un atributo (data-*, aria-label) eso sí
    // permite escapar el atributo, así que acá se codifican comillas también.
    function escaparAtributo(texto) {
        return escaparHtml(texto).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

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
    const tabClientesFrecuentes = document.getElementById('tabClientesFrecuentes');
    const panelMostrador = document.getElementById('panelMostrador');
    const panelPedidosWeb = document.getElementById('panelPedidosWeb');
    const panelClientesFrecuentes = document.getElementById('panelClientesFrecuentes');

    let clientesFrecuentesCargados = false;

    function mostrarTab(tab) {
        panelMostrador.classList.toggle('d-none', tab !== 'mostrador');
        panelPedidosWeb.classList.toggle('d-none', tab !== 'pedidos');
        panelClientesFrecuentes.classList.toggle('d-none', tab !== 'clientes');
        tabMostrador.className = tab === 'mostrador' ? 'btn btn-mpv-primary' : 'btn btn-mpv-outline';
        tabPedidosWeb.className = tab === 'pedidos' ? 'btn btn-mpv-primary' : 'btn btn-mpv-outline';
        tabClientesFrecuentes.className = tab === 'clientes' ? 'btn btn-mpv-primary' : 'btn btn-mpv-outline';
        if (tab === 'clientes' && !clientesFrecuentesCargados) {
            clientesFrecuentesCargados = true;
            cargarClientesFrecuentes();
        }
    }
    tabMostrador.addEventListener('click', () => mostrarTab('mostrador'));
    tabPedidosWeb.addEventListener('click', () => mostrarTab('pedidos'));
    tabClientesFrecuentes.addEventListener('click', () => mostrarTab('clientes'));

    // -------- Clientes Frecuentes --------
    const clientesFrecuentesTableBody = document.getElementById('clientesFrecuentesTableBody');

    function celdaFidelizacionHtml(c) {
        if (c.nivelFidelizacion === 0) return '<span class="pvp-sub">—</span>';
        if (c.cuponFidelidadDisponible) {
            return `<button class="btn btn-mpv-primary btn-sm" data-generar-cupon-fidelidad="${escaparAtributo(c.clave)}"><i class="bi bi-gift-fill me-1"></i> Generar cupón (nivel ${c.nivelFidelizacion})</button>`;
        }
        return `<span class="supplier-badge optimo"><span class="dot"></span> Cupón nivel ${c.nivelFidelizacion} ya generado</span>`;
    }

    function filaClienteFrecuenteHtml(c) {
        return `
            <tr>
                <td data-label="Cliente">${escaparHtml(c.nombre)}</td>
                <td data-label="Teléfono">${c.telefono ? escaparHtml(c.telefono) : '<span class="pvp-sub">Sin teléfono</span>'}</td>
                <td data-label="Compras">
                    <span class="supplier-badge optimo"><span class="dot"></span> ${c.cantidadCompras} compras</span>
                </td>
                <td data-label="Total Gastado" class="text-end">${MPV.formatCurrency(c.totalGastado)}</td>
                <td data-label="Ticket Promedio" class="text-end">${MPV.formatCurrency(c.ticketPromedio)}</td>
                <td data-label="Última Compra">${formatearFecha(c.ultimaCompra)}</td>
                <td data-label="Fidelización">${celdaFidelizacionHtml(c)}</td>
            </tr>
        `;
    }

    async function cargarClientesFrecuentes() {
        try {
            const { data } = await MPV.getClientesFrecuentes();
            document.getElementById('clientesFrecuentesCantidad').textContent = data.totales.clientesFrecuentes;
            document.getElementById('clientesFrecuentesTotal').textContent = MPV.formatCurrency(data.totales.totalGastado);
            document.getElementById('clientesResultCount').textContent =
                `${data.clientes.length} cliente${data.clientes.length === 1 ? '' : 's'} con más de una compra`;
            clientesFrecuentesTableBody.innerHTML = data.clientes.length
                ? data.clientes.map(filaClienteFrecuenteHtml).join('')
                : `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-people"></i>Todavía no hay clientes con más de una compra.</td></tr>`;
        } catch (err) {
            clientesFrecuentesTableBody.innerHTML = `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
            document.getElementById('clientesResultCount').textContent = 'Sin conexión';
        }
    }

    clientesFrecuentesTableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-generar-cupon-fidelidad]');
        if (!btn) return;
        btn.disabled = true;
        try {
            const { data: cupon } = await MPV.generarCuponFidelidad(btn.dataset.generarCuponFidelidad);
            alert(`Cupón "${cupon.codigo}" generado: S/ ${Number(cupon.valor).toFixed(2)} de descuento, válido hasta ${new Date(cupon.fecha_expiracion).toLocaleDateString('es-PE')}.`);
            await cargarClientesFrecuentes();
        } catch (err) {
            alert(err.message);
            btn.disabled = false;
        }
    });

    document.getElementById('exportarClientesExcel').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        try {
            await MPV.exportarClientesFrecuentesExcel();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    });

    // -------- Ventas de Mostrador --------
    const ventasTableBody = document.getElementById('ventasTableBody');
    const mostradorResultCount = document.getElementById('mostradorResultCount');

    function filaVentaHtml(v) {
        return `
            <tr>
                <td data-label="Fecha">${formatearFecha(v.created_at)}</td>
                <td data-label="Cliente">${v.cliente ? escaparHtml(v.cliente) : 'Cliente varios'}</td>
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

    function renderVentas(ventas, total) {
        mostradorResultCount.textContent = `${total} venta${total === 1 ? '' : 's'}`;
        if (ventas.length === 0) {
            ventasTableBody.innerHTML = `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-receipt"></i>No hay ventas registradas con estos filtros.</td></tr>`;
            return;
        }
        ventasTableBody.innerHTML = ventas.map(filaVentaHtml).join('');
    }

    let paginaActualVentas = 1;

    function renderPagerVentas(paginacion) {
        document.getElementById('ventasPagerInfo').textContent =
            `Página ${paginacion.pagina} de ${paginacion.totalPaginas} (${paginacion.total} venta${paginacion.total === 1 ? '' : 's'} en total)`;
        document.getElementById('ventasPagerAnterior').disabled = paginacion.pagina <= 1;
        document.getElementById('ventasPagerSiguiente').disabled = paginacion.pagina >= paginacion.totalPaginas;
    }

    // reinicia a la página 1 cada vez que cambia un filtro — quedarse en la
    // página 5 de un resultado filtrado que ahora tiene 2 páginas mostraría
    // la tabla vacía sin explicación.
    async function cargarVentas({ reiniciarPagina = true } = {}) {
        if (reiniciarPagina) paginaActualVentas = 1;
        try {
            const params = { pagina: paginaActualVentas };
            const cliente = document.getElementById('filtroCliente').value.trim();
            const desde = document.getElementById('filtroDesde').value;
            const hasta = document.getElementById('filtroHasta').value;
            const metodoPago = document.getElementById('filtroMetodoPago').value;
            if (cliente) params.cliente = cliente;
            if (desde) params.desde = desde;
            if (hasta) params.hasta = hasta;
            if (metodoPago) params.metodoPago = metodoPago;

            const { data, paginacion } = await MPV.getVentas(params);
            ventasCompletas = data;
            renderVentas(ventasCompletas, paginacion.total);
            renderPagerVentas(paginacion);
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
    document.getElementById('ventasPagerAnterior').addEventListener('click', () => {
        paginaActualVentas -= 1;
        cargarVentas({ reiniciarPagina: false });
    });
    document.getElementById('ventasPagerSiguiente').addEventListener('click', () => {
        paginaActualVentas += 1;
        cargarVentas({ reiniciarPagina: false });
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
                <td data-label="Cliente">${p.cliente ? escaparHtml(p.cliente) : 'Cliente web'}${p.telefono ? `<div class="pvp-sub">${escaparHtml(p.telefono)}</div>` : ''}${p.direccion ? `<div class="pvp-sub">${escaparHtml(p.direccion)}</div>` : ''}</td>
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
