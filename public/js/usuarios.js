MPVAuth.exigirRol('admin');

(function () {
    const tbody = document.getElementById('usuariosTableBody');
    const resultCount = document.getElementById('resultCount');

    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    const rolLabel = (rol) => (rol === 'admin' ? 'Administrador' : 'Operador de Compras');

    function filaHtml(u) {
        const yo = u.id === MPVAuth.getUsuario()?.sub;
        return `
            <tr>
                <td>
                    <div class="product-cell">
                        <div class="mpv-avatar" style="width:34px;height:34px;font-size:0.72rem;">${u.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</div>
                        <div>
                            <div class="product-name">${u.nombre} ${yo ? '<span class="text-muted small">(tú)</span>' : ''}</div>
                        </div>
                    </div>
                </td>
                <td>${u.email}</td>
                <td><span class="badge-margin ${u.rol === 'admin' ? 'alto' : 'medio'}">${rolLabel(u.rol)}</span></td>
                <td>${u.activo ? '<span class="supplier-badge optimo"><span class="dot"></span> Activo</span>' : '<span class="supplier-badge"><span class="dot"></span> Inactivo</span>'}</td>
                <td class="pvp-sub">${u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-PE') : 'Nunca'}</td>
                <td class="text-end">
                    <button class="btn-icon-sm" title="Editar usuario" onclick="UsuariosUI.abrirEditar(${u.id}, '${u.nombre.replace(/'/g, "\\'")}', '${u.rol}', ${u.activo})">
                        <i class="bi bi-pencil-fill"></i>
                    </button>
                </td>
            </tr>
        `;
    }

    async function cargar() {
        try {
            const { data } = await MPV.getUsuarios();
            resultCount.textContent = `${data.length} usuario${data.length === 1 ? '' : 's'} registrado${data.length === 1 ? '' : 's'}`;
            tbody.innerHTML = data.map(filaHtml).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
            resultCount.textContent = 'Sin conexión';
        }
    }

    const modalNuevo = new bootstrap.Modal(document.getElementById('modalNuevoUsuario'));
    const modalEditar = new bootstrap.Modal(document.getElementById('modalEditarUsuario'));

    window.UsuariosUI = {
        abrirEditar(id, nombre, rol, activo) {
            document.getElementById('editarId').value = id;
            document.getElementById('editarNombre').value = nombre;
            document.getElementById('editarRol').value = rol;
            document.getElementById('editarActivo').checked = activo;
            document.getElementById('editarPassword').value = '';
            document.getElementById('editarUsuarioError').classList.add('d-none');
            modalEditar.show();
        },
    };

    document.getElementById('formNuevoUsuario').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorBox = document.getElementById('nuevoUsuarioError');
        const btn = document.getElementById('btnCrearUsuario');
        errorBox.classList.add('d-none');
        btn.disabled = true;

        try {
            await MPV.crearUsuario({
                nombre: document.getElementById('nuevoNombre').value,
                email: document.getElementById('nuevoEmail').value,
                password: document.getElementById('nuevoPassword').value,
                rol: document.getElementById('nuevoRol').value,
            });
            modalNuevo.hide();
            document.getElementById('formNuevoUsuario').reset();
            await cargar();
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.classList.remove('d-none');
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('btnGuardarUsuario').addEventListener('click', async () => {
        const errorBox = document.getElementById('editarUsuarioError');
        const btn = document.getElementById('btnGuardarUsuario');
        errorBox.classList.add('d-none');
        btn.disabled = true;

        const id = document.getElementById('editarId').value;
        const password = document.getElementById('editarPassword').value;

        try {
            await MPV.actualizarUsuario(id, {
                nombre: document.getElementById('editarNombre').value,
                rol: document.getElementById('editarRol').value,
                activo: document.getElementById('editarActivo').checked,
            });
            if (password) {
                await MPV.cambiarPasswordUsuario(id, password);
            }
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
