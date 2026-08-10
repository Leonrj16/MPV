(function () {
    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    function escaparHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto ?? '';
        return div.innerHTML;
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

    cargarCupones();
    cargarResenas();
    cargarBackups();
})();
