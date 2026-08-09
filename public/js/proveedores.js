(function () {
    let proveedoresCompletos = [];

    const tbody = document.getElementById('proveedoresTableBody');
    const resultCount = document.getElementById('resultCount');
    const buscador = document.getElementById('buscador');
    const esAdmin = MPVAuth.getUsuario()?.rol === 'admin';

    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    function estrellas(n) {
        const llenas = '★'.repeat(n || 0);
        const vacias = '☆'.repeat(5 - (n || 0));
        return `<span style="color:#f59e0b; letter-spacing:1px;">${llenas}${vacias}</span>`;
    }

    function filaHtml(p) {
        return `
            <tr>
                <td>
                    <div class="product-cell">
                        <div class="product-thumb"><i class="bi bi-truck"></i></div>
                        <div>
                            <div class="product-name">${p.nombre}</div>
                            <div class="product-sku">${p.ruc_nit || 'Sin RUC/NIT'}</div>
                        </div>
                    </div>
                </td>
                <td data-label="Contacto">${p.contacto || '<span class="pvp-sub">Sin contacto</span>'}</td>
                <td data-label="Teléfono / Email">
                    <div>${p.telefono || '—'}</div>
                    <div class="pvp-sub">${p.email || 'Sin email'}</div>
                </td>
                <td data-label="Calificación">${estrellas(p.calificacion)}</td>
                <td data-label="Productos">
                    <span class="supplier-badge ${p.productos_count > 0 ? 'optimo' : ''}">
                        <span class="dot"></span> ${p.productos_count} producto${p.productos_count === '1' ? '' : 's'}
                    </span>
                </td>
                <td data-label="Estado">${p.activo ? '<span class="supplier-badge optimo"><span class="dot"></span> Activo</span>' : '<span class="supplier-badge"><span class="dot"></span> Inactivo</span>'}</td>
                <td class="text-end">
                    ${esAdmin ? `
                        <button class="btn-icon-sm" title="Editar proveedor" onclick="ProveedoresUI.abrirEditar(${p.id})">
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
            ? proveedoresCompletos
            : proveedoresCompletos.filter((p) =>
                p.nombre.toLowerCase().includes(texto) || (p.contacto || '').toLowerCase().includes(texto)
            );
        renderTabla(filtrados);
    }

    function renderTabla(proveedores) {
        resultCount.textContent = `${proveedores.length} proveedor${proveedores.length === 1 ? '' : 'es'} registrado${proveedores.length === 1 ? '' : 's'}`;
        if (proveedores.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-search"></i>No se encontraron proveedores.</td></tr>`;
            return;
        }
        tbody.innerHTML = proveedores.map(filaHtml).join('');
    }

    async function cargar() {
        try {
            const { data } = await MPV.getProveedores();
            proveedoresCompletos = data;
            renderTabla(proveedoresCompletos);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
            resultCount.textContent = 'Sin conexión';
        }
    }

    buscador.addEventListener('input', aplicarFiltro);

    const modalNuevo = new bootstrap.Modal(document.getElementById('modalNuevoProveedor'));
    const modalEditar = new bootstrap.Modal(document.getElementById('modalEditarProveedor'));

    window.ProveedoresUI = {
        abrirEditar(id) {
            const p = proveedoresCompletos.find((x) => x.id === id);
            if (!p) return;
            document.getElementById('editarId').value = p.id;
            document.getElementById('editarNombre').value = p.nombre;
            document.getElementById('editarContacto').value = p.contacto || '';
            document.getElementById('editarCalificacion').value = p.calificacion || 5;
            document.getElementById('editarTelefono').value = p.telefono || '';
            document.getElementById('editarEmail').value = p.email || '';
            document.getElementById('editarDireccion').value = p.direccion || '';
            document.getElementById('editarActivo').checked = p.activo;
            document.getElementById('editarProveedorError').classList.add('d-none');
            modalEditar.show();
        },
    };

    document.getElementById('formNuevoProveedor').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorBox = document.getElementById('nuevoProveedorError');
        const btn = document.getElementById('btnCrearProveedor');
        errorBox.classList.add('d-none');
        btn.disabled = true;

        try {
            await MPV.crearProveedor({
                nombre: document.getElementById('nuevoNombre').value,
                rucNit: document.getElementById('nuevoRuc').value,
                contacto: document.getElementById('nuevoContacto').value,
                telefono: document.getElementById('nuevoTelefono').value,
                email: document.getElementById('nuevoEmail').value,
                direccion: document.getElementById('nuevoDireccion').value,
            });
            modalNuevo.hide();
            document.getElementById('formNuevoProveedor').reset();
            await cargar();
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.classList.remove('d-none');
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('btnGuardarProveedor').addEventListener('click', async () => {
        const errorBox = document.getElementById('editarProveedorError');
        const btn = document.getElementById('btnGuardarProveedor');
        errorBox.classList.add('d-none');
        btn.disabled = true;

        const id = document.getElementById('editarId').value;
        try {
            await MPV.actualizarProveedor(id, {
                nombre: document.getElementById('editarNombre').value,
                contacto: document.getElementById('editarContacto').value,
                calificacion: Number(document.getElementById('editarCalificacion').value) || null,
                telefono: document.getElementById('editarTelefono').value,
                email: document.getElementById('editarEmail').value,
                direccion: document.getElementById('editarDireccion').value,
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
