(function () {
    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    function escaparHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto ?? '';
        return div.innerHTML;
    }

    // escaparHtml() no codifica comillas (no hace falta en texto entre
    // etiquetas) — puesto dentro de un atributo eso sí permite escapar el
    // atributo, así que acá se codifican también.
    function escaparAtributo(texto) {
        return escaparHtml(texto).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatearFecha(iso) {
        return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
    }

    const ESTADO_BADGE_CLASE = { borrador: 'medio', enviada: 'medio', recibida: 'alto', cancelada: 'bajo' };
    const ESTADO_LABEL = { borrador: 'Borrador', enviada: 'Enviada', recibida: 'Recibida', cancelada: 'Cancelada' };
    const TRANSICIONES = { borrador: ['enviada', 'cancelada'], enviada: ['recibida', 'cancelada'] };

    // -------- Listado de órdenes --------
    const ordenesTableBody = document.getElementById('ordenesTableBody');
    const ordenesResultCount = document.getElementById('ordenesResultCount');
    const filtroEstadoOrden = document.getElementById('filtroEstadoOrden');

    function filaOrdenHtml(o) {
        return `
            <tr>
                <td data-label="#">#${o.id}</td>
                <td data-label="Proveedor">${escaparHtml(o.proveedor_nombre)}</td>
                <td data-label="Items">${o.cantidad_items} producto${o.cantidad_items === 1 ? '' : 's'}</td>
                <td data-label="Total" class="text-end">${MPV.formatCurrency(o.total)}</td>
                <td data-label="Estado"><span class="badge-margin ${ESTADO_BADGE_CLASE[o.estado]}">${ESTADO_LABEL[o.estado]}</span></td>
                <td data-label="Fecha">${formatearFecha(o.created_at)}</td>
                <td class="text-end">
                    <button class="btn-icon-sm" title="Ver detalle" data-ver-orden="${o.id}"><i class="bi bi-eye-fill"></i></button>
                </td>
            </tr>
        `;
    }

    async function cargarOrdenes() {
        try {
            const estado = filtroEstadoOrden.value;
            const { data } = await MPV.getOrdenesCompra(estado ? { estado } : {});
            ordenesResultCount.textContent = `${data.length} orden${data.length === 1 ? '' : 'es'}`;
            ordenesTableBody.innerHTML = data.length
                ? data.map(filaOrdenHtml).join('')
                : `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-bag"></i>No hay órdenes de compra con este filtro.</td></tr>`;
        } catch (err) {
            ordenesTableBody.innerHTML = `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
            ordenesResultCount.textContent = 'Sin conexión';
        }
    }

    filtroEstadoOrden.addEventListener('change', cargarOrdenes);

    ordenesTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ver-orden]');
        if (!btn) return;
        abrirDetalleOrden(Number(btn.dataset.verOrden));
    });

    // -------- Detalle de una orden --------
    const modalDetalleOrden = new bootstrap.Modal(document.getElementById('modalDetalleOrden'));
    const detalleOrdenContenido = document.getElementById('detalleOrdenContenido');

    function filaItemOrdenHtml(item) {
        return `
            <tr>
                <td data-label="Producto">${escaparHtml(item.producto_nombre)} <span class="pvp-sub">${escaparHtml(item.sku)}</span></td>
                <td data-label="Cantidad" class="text-end">${item.cantidad}</td>
                <td data-label="P. Unit." class="text-end">${MPV.formatCurrency(item.precio_compra_unitario)}</td>
                <td data-label="Subtotal" class="text-end">${MPV.formatCurrency(item.subtotal)}</td>
            </tr>
        `;
    }

    function botonesTransicion(orden) {
        const permitidos = TRANSICIONES[orden.estado] || [];
        if (permitidos.length === 0) return '';
        const etiquetaBoton = { enviada: 'Marcar como enviada', recibida: 'Marcar como recibida', cancelada: 'Cancelar orden' };
        const claseBoton = { enviada: 'btn-mpv-primary', recibida: 'btn-mpv-primary', cancelada: 'btn-mpv-outline' };
        return permitidos
            .map((estado) => `<button class="btn ${claseBoton[estado]} btn-sm me-2" data-cambiar-estado-orden="${estado}">${etiquetaBoton[estado]}</button>`)
            .join('');
    }

    async function abrirDetalleOrden(id) {
        detalleOrdenContenido.innerHTML = `<div class="mpv-empty"><i class="bi bi-hourglass-split"></i>Cargando…</div>`;
        modalDetalleOrden.show();
        try {
            const { data: orden } = await MPV.getOrdenCompra(id);
            document.getElementById('modalDetalleOrdenTitulo').textContent = `Orden de Compra #${orden.id}`;
            detalleOrdenContenido.innerHTML = `
                <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
                    <div>
                        <div class="fw-semibold">${escaparHtml(orden.proveedor_nombre)}</div>
                        <div class="pvp-sub">${orden.telefono ? escaparHtml(orden.telefono) : 'Sin teléfono'}${orden.email ? ` · ${escaparHtml(orden.email)}` : ''}</div>
                        <div class="pvp-sub">Creada el ${formatearFecha(orden.created_at)}</div>
                    </div>
                    <span class="badge-margin ${ESTADO_BADGE_CLASE[orden.estado]}">${ESTADO_LABEL[orden.estado]}</span>
                </div>
                ${orden.notas ? `<div class="alert alert-secondary py-2 small">${escaparHtml(orden.notas)}</div>` : ''}
                <div class="mpv-table-wrap" tabindex="0" role="region" aria-label="Tabla con desplazamiento horizontal">
                    <table class="mpv-table">
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th class="text-end">Cantidad</th>
                                <th class="text-end">P. Unit.</th>
                                <th class="text-end">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>${orden.items.map(filaItemOrdenHtml).join('')}</tbody>
                        <tfoot>
                            <tr class="fw-bold">
                                <td colspan="3" class="text-end">TOTAL</td>
                                <td class="text-end">${MPV.formatCurrency(orden.total)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                    <div id="detalleOrdenAcciones">${botonesTransicion(orden)}</div>
                    <button class="btn btn-mpv-outline btn-sm" id="btnDescargarOrdenPdf"><i class="bi bi-file-earmark-pdf-fill text-danger me-1"></i> Descargar PDF</button>
                </div>
            `;

            document.getElementById('btnDescargarOrdenPdf').addEventListener('click', () => {
                MPV.descargarOrdenCompraPdf(orden.id).catch((err) => alert(err.message));
            });

            detalleOrdenContenido.querySelectorAll('[data-cambiar-estado-orden]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const nuevoEstado = btn.dataset.cambiarEstadoOrden;
                    if (nuevoEstado === 'cancelada' && !confirm('¿Cancelar esta orden de compra?')) return;
                    btn.disabled = true;
                    try {
                        await MPV.cambiarEstadoOrdenCompra(orden.id, nuevoEstado);
                        await abrirDetalleOrden(orden.id);
                        await cargarOrdenes();
                    } catch (err) {
                        alert(err.message);
                        btn.disabled = false;
                    }
                });
            });
        } catch (err) {
            detalleOrdenContenido.innerHTML = `<div class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</div>`;
        }
    }

    // -------- Sugerencias de reabastecimiento --------
    const modalSugerencias = new bootstrap.Modal(document.getElementById('modalSugerencias'));
    const sugerenciasContenido = document.getElementById('sugerenciasContenido');

    function filaSugerenciaHtml(item, indice, itemIdx) {
        return `
            <div class="d-flex align-items-center gap-2 py-2" style="border-bottom:1px solid var(--mpv-gray-200);">
                <input type="checkbox" class="form-check-input flex-shrink-0" data-item-incluido="${indice}-${itemIdx}" checked>
                <div class="flex-grow-1" style="min-width:0;">
                    <div class="fw-semibold text-truncate">${escaparHtml(item.nombre)} <span class="pvp-sub">${escaparHtml(item.sku)}</span></div>
                    <div class="pvp-sub">Stock ${item.stockActual} / mín. ${item.stockMinimo} · ${MPV.formatCurrency(item.precioCompraUnitario)} c/u</div>
                </div>
                <input type="number" min="1" class="form-control form-control-sm flex-shrink-0" style="width:80px;" value="${item.cantidadSugerida}" data-item-cantidad="${indice}-${itemIdx}" aria-label="Cantidad a pedir de ${escaparAtributo(item.nombre)}">
            </div>
        `;
    }

    function grupoSugerenciaHtml(grupo, indice) {
        const filas = grupo.items.map((item, itemIdx) => filaSugerenciaHtml(item, indice, itemIdx)).join('');

        return `
            <div class="mpv-panel mb-3">
                <div class="mpv-panel-header">
                    <div>
                        <h2 style="font-size:1rem;">${escaparHtml(grupo.proveedorNombre)}</h2>
                        <div class="panel-sub">${grupo.items.length} producto${grupo.items.length === 1 ? '' : 's'} — estimado ${MPV.formatCurrency(grupo.total)}</div>
                    </div>
                    <button class="btn btn-mpv-primary btn-sm" data-crear-orden-grupo="${indice}">
                        <i class="bi bi-plus-lg me-1"></i> Crear orden
                    </button>
                </div>
                <div class="px-3 pb-2">${filas}</div>
            </div>
        `;
    }

    let sugerenciasActuales = [];

    async function cargarSugerencias() {
        sugerenciasContenido.innerHTML = `<div class="mpv-empty"><i class="bi bi-hourglass-split"></i>Cargando…</div>`;
        try {
            const { data } = await MPV.getSugerenciasOrdenesCompra();
            sugerenciasActuales = data;
            sugerenciasContenido.innerHTML = data.length
                ? data.map(grupoSugerenciaHtml).join('')
                : `<div class="mpv-empty"><i class="bi bi-check-circle"></i>No hay productos por debajo de su stock mínimo con proveedor activo asignado.</div>`;
        } catch (err) {
            sugerenciasContenido.innerHTML = `<div class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</div>`;
        }
    }

    document.getElementById('btnVerSugerencias').addEventListener('click', () => {
        modalSugerencias.show();
        cargarSugerencias();
    });

    sugerenciasContenido.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-crear-orden-grupo]');
        if (!btn) return;
        const indice = Number(btn.dataset.crearOrdenGrupo);
        const grupo = sugerenciasActuales[indice];
        if (!grupo) return;

        const items = grupo.items
            .map((item, itemIdx) => {
                const incluido = document.querySelector(`[data-item-incluido="${indice}-${itemIdx}"]`).checked;
                if (!incluido) return null;
                const cantidad = Number(document.querySelector(`[data-item-cantidad="${indice}-${itemIdx}"]`).value);
                return { productoId: item.productoId, cantidad, precioCompraUnitario: item.precioCompraUnitario };
            })
            .filter(Boolean);

        if (items.length === 0) {
            alert('Seleccioná al menos un producto para crear la orden.');
            return;
        }

        btn.disabled = true;
        try {
            await MPV.crearOrdenCompra({ proveedorId: grupo.proveedorId, items });
            modalSugerencias.hide();
            await cargarOrdenes();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.disabled = false;
        }
    });

    cargarOrdenes();
})();
