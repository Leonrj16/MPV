(function () {
    let categorias = [];
    let productosCompletos = [];

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
                <td>${p.categoria_nombre || '<span class="pvp-sub">Sin categoría</span>'}</td>
                <td>${p.unidad_medida}</td>
                <td>
                    <span class="supplier-badge ${p.proveedores_count > 0 ? 'optimo' : ''}">
                        <span class="dot"></span> ${p.proveedores_count} proveedor${p.proveedores_count === '1' ? '' : 'es'}
                    </span>
                </td>
                <td>${p.activo ? '<span class="supplier-badge optimo"><span class="dot"></span> Activo</span>' : '<span class="supplier-badge"><span class="dot"></span> Inactivo</span>'}</td>
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
            tbody.innerHTML = `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-search"></i>No se encontraron productos.</td></tr>`;
            return;
        }
        tbody.innerHTML = productos.map(filaHtml).join('');
    }

    function poblarSelectCategorias(select) {
        select.innerHTML = '<option value="">Sin categoría</option>' +
            categorias.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('');
    }

    async function cargar() {
        try {
            const [{ data: productos }, { data: cats }] = await Promise.all([MPV.getProductos(), MPV.getCategorias()]);
            productosCompletos = productos;
            categorias = cats;
            poblarSelectCategorias(document.getElementById('nuevoCategoria'));
            poblarSelectCategorias(document.getElementById('editarCategoria'));
            renderTabla(productosCompletos);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
            resultCount.textContent = 'Sin conexión';
        }
    }

    buscador.addEventListener('input', aplicarFiltro);

    const modalNuevo = new bootstrap.Modal(document.getElementById('modalNuevoProducto'));
    const modalEditar = new bootstrap.Modal(document.getElementById('modalEditarProducto'));

    window.ProductosUI = {
        abrirEditar(id) {
            const p = productosCompletos.find((x) => x.id === id);
            if (!p) return;
            document.getElementById('editarId').value = p.id;
            document.getElementById('editarSku').value = p.sku;
            document.getElementById('editarUnidad').value = p.unidad_medida;
            document.getElementById('editarNombre').value = p.nombre;
            document.getElementById('editarCategoria').value = p.categoria_id || '';
            document.getElementById('editarDescripcion').value = p.descripcion || '';
            document.getElementById('editarActivo').checked = p.activo;
            document.getElementById('editarProductoError').classList.add('d-none');
            modalEditar.show();
        },
    };

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

    cargar();
})();
