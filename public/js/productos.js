(function () {
    let categorias = [];
    let productosCompletos = [];
    let editandoCategoriaId = null;

    const tbody = document.getElementById('productosTableBody');
    const resultCount = document.getElementById('resultCount');
    const buscador = document.getElementById('buscador');
    const esAdmin = MPVAuth.getUsuario()?.rol === 'admin';

    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    function filaHtml(p) {
        return `
            <tr>
                <td>
                    <div class="product-cell">
                        <div class="product-thumb"><i class="bi bi-box-seam-fill"></i></div>
                        <div>
                            <div class="product-name">${p.nombre}</div>
                            <div class="product-sku">${p.sku}</div>
                        </div>
                    </div>
                </td>
                <td data-label="Categoría">${p.categoria_nombre || '<span class="pvp-sub">Sin categoría</span>'}</td>
                <td data-label="Unidad">${p.unidad_medida}</td>
                <td data-label="Stock">
                    <span class="badge-margin ${p.stock_actual > p.stock_minimo ? 'alto' : (p.stock_actual > 0 ? 'medio' : 'bajo')}">${p.stock_actual}</span>
                </td>
                <td data-label="Proveedores">
                    <span class="supplier-badge ${p.proveedores_count > 0 ? 'optimo' : ''}">
                        <span class="dot"></span> ${p.proveedores_count} proveedor${p.proveedores_count === '1' ? '' : 'es'}
                    </span>
                </td>
                <td data-label="Estado">${p.activo ? '<span class="supplier-badge optimo"><span class="dot"></span> Activo</span>' : '<span class="supplier-badge"><span class="dot"></span> Inactivo</span>'}</td>
                <td class="text-end">
                    ${esAdmin ? `
                        <button class="btn-icon-sm" title="Editar producto" onclick="ProductosUI.abrirEditar(${p.id})">
                            <i class="bi bi-pencil-fill"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }

    function aplicarFiltro() {
        const texto = buscador.value.trim().toLowerCase();
        const filtrados = !texto
            ? productosCompletos
            : productosCompletos.filter((p) => p.nombre.toLowerCase().includes(texto) || p.sku.toLowerCase().includes(texto));
        renderTabla(filtrados);
    }

    function renderTabla(productos) {
        resultCount.textContent = `${productos.length} producto${productos.length === 1 ? '' : 's'} en el catálogo`;
        if (productos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-search"></i>No se encontraron productos.</td></tr>`;
            return;
        }
        tbody.innerHTML = productos.map(filaHtml).join('');
    }

    function poblarSelectCategorias(select) {
        const actual = select.value;
        select.innerHTML = '<option value="">Sin categoría</option>' +
            categorias.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('');
        select.value = actual;
    }

    async function cargar() {
        try {
            const [{ data: productos }, { data: cats }] = await Promise.all([MPV.getProductos(), MPV.getCategorias()]);
            productosCompletos = productos;
            categorias = cats;
            poblarSelectCategorias(document.getElementById('nuevoCategoria'));
            poblarSelectCategorias(document.getElementById('editarCategoria'));
            renderTabla(productosCompletos);
            renderListaCategorias();
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
            resultCount.textContent = 'Sin conexión';
        }
    }

    function filaCategoriaHtml(c) {
        const cantidad = Number(c.productos_count);
        if (editandoCategoriaId === c.id) {
            return `
                <div class="categoria-row">
                    <input type="text" class="form-control form-control-sm flex-grow-1" value="${c.nombre}" data-categoria-input="${c.id}">
                    <button class="btn-icon-sm" title="Guardar" data-guardar-categoria="${c.id}"><i class="bi bi-check-lg"></i></button>
                    <button class="btn-icon-sm" title="Cancelar" data-cancelar-categoria><i class="bi bi-x-lg"></i></button>
                </div>
            `;
        }
        return `
            <div class="categoria-row">
                <div class="flex-grow-1">
                    <div class="fw-semibold" style="font-size:0.88rem;">${c.nombre}</div>
                    <div class="pvp-sub">${cantidad} producto${cantidad === 1 ? '' : 's'}</div>
                </div>
                <button class="btn-icon-sm" title="Editar" data-editar-categoria="${c.id}"><i class="bi bi-pencil-fill"></i></button>
                <button class="btn-icon-sm" title="Eliminar" data-eliminar-categoria="${c.id}"><i class="bi bi-trash3"></i></button>
            </div>
        `;
    }

    function renderListaCategorias() {
        const contenedor = document.getElementById('listaCategorias');
        if (!contenedor) return;
        if (categorias.length === 0) {
            contenedor.innerHTML = `<div class="mpv-empty"><i class="bi bi-tags"></i>Aún no hay categorías.</div>`;
            return;
        }
        contenedor.innerHTML = categorias.map(filaCategoriaHtml).join('');
    }

    buscador.addEventListener('input', aplicarFiltro);

    document.getElementById('btnEscanearNuevo').addEventListener('click', () => {
        BarcodeScanner.abrir({ onDetectado: (codigo) => { document.getElementById('nuevoCodigoBarras').value = codigo; } });
    });
    document.getElementById('btnEscanearEditar').addEventListener('click', () => {
        BarcodeScanner.abrir({ onDetectado: (codigo) => { document.getElementById('editarCodigoBarras').value = codigo; } });
    });

    const modalNuevo = new bootstrap.Modal(document.getElementById('modalNuevoProducto'));
    const modalEditar = new bootstrap.Modal(document.getElementById('modalEditarProducto'));
    const modalMovimientos = new bootstrap.Modal(document.getElementById('modalMovimientosStock'));
    let productoMovimientosId = null;

    window.ProductosUI = {
        abrirEditar(id) {
            const p = productosCompletos.find((x) => x.id === id);
            if (!p) return;
            document.getElementById('editarId').value = p.id;
            document.getElementById('editarSku').value = p.sku;
            document.getElementById('editarUnidad').value = p.unidad_medida;
            document.getElementById('editarNombre').value = p.nombre;
            document.getElementById('editarStock').value = p.stock_actual;
            document.getElementById('editarStockMinimo').value = p.stock_minimo;
            document.getElementById('editarCategoria').value = p.categoria_id || '';
            document.getElementById('editarDescripcion').value = p.descripcion || '';
            document.getElementById('editarImagenUrl').value = p.imagen_url || '';
            document.getElementById('editarFechaVencimiento').value = p.fecha_vencimiento ? p.fecha_vencimiento.slice(0, 10) : '';
            document.getElementById('editarCodigoBarras').value = p.codigo_barras || '';
            document.getElementById('editarActivo').checked = p.activo;
            document.getElementById('editarProductoError').classList.add('d-none');
            modalEditar.show();
        },
    };

    const ETIQUETAS_TIPO_MOVIMIENTO = { venta: 'Venta', ajuste_manual: 'Ajuste manual' };

    async function cargarMovimientos() {
        const tbody = document.getElementById('movimientosTableBody');
        tbody.innerHTML = `<tr><td colspan="5" class="mpv-empty"><i class="bi bi-hourglass-split"></i>Cargando…</td></tr>`;
        try {
            const { data: movimientos } = await MPV.getMovimientosStock(productoMovimientosId);
            if (movimientos.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="mpv-empty"><i class="bi bi-inbox"></i>Sin movimientos registrados aún.</td></tr>`;
                return;
            }
            tbody.innerHTML = movimientos.map((m) => `
                <tr>
                    <td data-label="Fecha">${new Date(m.created_at).toLocaleString('es-PE')}</td>
                    <td data-label="Tipo">${ETIQUETAS_TIPO_MOVIMIENTO[m.tipo] || m.tipo}</td>
                    <td data-label="Cantidad"><span class="badge-margin ${m.cantidad_delta >= 0 ? 'alto' : 'bajo'}">${m.cantidad_delta > 0 ? '+' : ''}${m.cantidad_delta}</span></td>
                    <td data-label="Stock resultante">${m.stock_resultante}</td>
                    <td data-label="Detalle">${m.motivo || (m.usuario_nombre ? `Venta atendida por ${m.usuario_nombre}` : '—')}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
        }
    }

    document.getElementById('btnAbrirMovimientos').addEventListener('click', () => {
        productoMovimientosId = document.getElementById('editarId').value;
        const p = productosCompletos.find((x) => String(x.id) === String(productoMovimientosId));
        document.getElementById('movimientosProductoNombre').textContent = p ? p.nombre : '';
        document.getElementById('formAjusteStock').reset();
        document.getElementById('ajusteStockError').classList.add('d-none');
        modalMovimientos.show();
        cargarMovimientos();
    });

    document.getElementById('formAjusteStock').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorBox = document.getElementById('ajusteStockError');
        errorBox.classList.add('d-none');
        try {
            await MPV.ajustarStock(productoMovimientosId, {
                delta: Number(document.getElementById('ajusteDelta').value),
                motivo: document.getElementById('ajusteMotivo').value,
            });
            document.getElementById('formAjusteStock').reset();
            await cargarMovimientos();
            await cargar();
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.classList.remove('d-none');
        }
    });

    document.getElementById('formNuevoProducto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorBox = document.getElementById('nuevoProductoError');
        const btn = document.getElementById('btnCrearProducto');
        errorBox.classList.add('d-none');
        btn.disabled = true;

        try {
            await MPV.crearProducto({
                sku: document.getElementById('nuevoSku').value,
                nombre: document.getElementById('nuevoNombre').value,
                descripcion: document.getElementById('nuevoDescripcion').value,
                categoriaId: document.getElementById('nuevoCategoria').value || null,
                unidadMedida: document.getElementById('nuevoUnidad').value || 'unidad',
                imagenUrl: document.getElementById('nuevoImagenUrl').value || null,
                stockActual: Number(document.getElementById('nuevoStock').value) || 0,
                fechaVencimiento: document.getElementById('nuevoFechaVencimiento').value || null,
                codigoBarras: document.getElementById('nuevoCodigoBarras').value.trim() || null,
            });
            modalNuevo.hide();
            document.getElementById('formNuevoProducto').reset();
            await cargar();
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.classList.remove('d-none');
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('btnGuardarProducto').addEventListener('click', async () => {
        const errorBox = document.getElementById('editarProductoError');
        const btn = document.getElementById('btnGuardarProducto');
        errorBox.classList.add('d-none');
        btn.disabled = true;

        const id = document.getElementById('editarId').value;
        try {
            await MPV.actualizarProducto(id, {
                nombre: document.getElementById('editarNombre').value,
                descripcion: document.getElementById('editarDescripcion').value,
                categoriaId: document.getElementById('editarCategoria').value || null,
                unidadMedida: document.getElementById('editarUnidad').value,
                activo: document.getElementById('editarActivo').checked,
                imagenUrl: document.getElementById('editarImagenUrl').value || null,
                stockActual: Number(document.getElementById('editarStock').value),
                stockMinimo: Number(document.getElementById('editarStockMinimo').value),
                fechaVencimiento: document.getElementById('editarFechaVencimiento').value || null,
                codigoBarras: document.getElementById('editarCodigoBarras').value.trim() || null,
            });
            modalEditar.hide();
            await cargar();
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.classList.remove('d-none');
        } finally {
            btn.disabled = false;
        }
    });

    const categoriaError = document.getElementById('categoriaError');
    function mostrarErrorCategoria(mensaje) {
        categoriaError.textContent = mensaje;
        categoriaError.classList.remove('d-none');
    }

    document.getElementById('modalCategorias')?.addEventListener('show.bs.modal', () => {
        editandoCategoriaId = null;
        categoriaError.classList.add('d-none');
        renderListaCategorias();
    });

    document.getElementById('formNuevaCategoria').addEventListener('submit', async (e) => {
        e.preventDefault();
        categoriaError.classList.add('d-none');
        const input = document.getElementById('nuevaCategoriaNombre');
        const nombre = input.value.trim();
        if (!nombre) return;

        try {
            await MPV.crearCategoria({ nombre });
            input.value = '';
            await cargar();
        } catch (err) {
            mostrarErrorCategoria(err.message);
        }
    });

    document.getElementById('listaCategorias').addEventListener('click', async (e) => {
        const editar = e.target.closest('[data-editar-categoria]');
        const cancelar = e.target.closest('[data-cancelar-categoria]');
        const guardar = e.target.closest('[data-guardar-categoria]');
        const eliminar = e.target.closest('[data-eliminar-categoria]');

        if (editar) {
            editandoCategoriaId = Number(editar.dataset.editarCategoria);
            categoriaError.classList.add('d-none');
            renderListaCategorias();
        } else if (cancelar) {
            editandoCategoriaId = null;
            renderListaCategorias();
        } else if (guardar) {
            const id = Number(guardar.dataset.guardarCategoria);
            const input = document.querySelector(`[data-categoria-input="${id}"]`);
            const nombre = input.value.trim();
            if (!nombre) return;
            categoriaError.classList.add('d-none');
            try {
                await MPV.actualizarCategoria(id, { nombre });
                editandoCategoriaId = null;
                await cargar();
            } catch (err) {
                mostrarErrorCategoria(err.message);
            }
        } else if (eliminar) {
            const id = Number(eliminar.dataset.eliminarCategoria);
            const categoria = categorias.find((c) => c.id === id);
            const cantidad = categoria ? Number(categoria.productos_count) : 0;
            const advertencia = cantidad > 0
                ? `"${categoria.nombre}" tiene ${cantidad} producto${cantidad === 1 ? '' : 's'}, que quedarán sin categoría. ¿Eliminar de todos modos?`
                : `¿Eliminar la categoría "${categoria?.nombre}"?`;
            if (!confirm(advertencia)) return;

            categoriaError.classList.add('d-none');
            try {
                await MPV.eliminarCategoria(id);
                await cargar();
            } catch (err) {
                mostrarErrorCategoria(err.message);
            }
        }
    });

    cargar();
})();
