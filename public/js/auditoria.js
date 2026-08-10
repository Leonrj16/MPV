MPVAuth.exigirRol('admin');

(function () {
    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    const ETIQUETAS_ACCION = {
        crear: 'Creó',
        actualizar: 'Actualizó',
        eliminar: 'Eliminó',
        cambiar_estado: 'Cambió estado',
        iniciar_sesion: 'Inició sesión',
    };
    const CLASE_BADGE_ACCION = {
        crear: 'alto',
        actualizar: 'medio',
        eliminar: 'bajo',
        cambiar_estado: 'medio',
        iniciar_sesion: 'bajo',
    };
    const ETIQUETAS_ENTIDAD = {
        producto: 'Producto',
        proveedor: 'Proveedor',
        precio: 'Precio',
        usuario: 'Usuario',
        configuracion_margenes: 'Márgenes',
        configuracion_tienda: 'Tienda virtual',
        venta: 'Venta',
        pedido_web: 'Pedido web',
        stock: 'Stock',
        cupon: 'Cupón',
        resena: 'Reseña',
        sesion: 'Sesión',
    };

    function formatearFecha(iso) {
        return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
    }

    function escaparHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto ?? '';
        return div.innerHTML;
    }

    const tbody = document.getElementById('bitacoraTableBody');
    const resultCount = document.getElementById('resultCount');

    function filaHtml(e) {
        return `
            <tr>
                <td data-label="Fecha">${formatearFecha(e.created_at)}</td>
                <td data-label="Usuario">${escaparHtml(e.usuario_nombre) || '<span class="pvp-sub">Sistema</span>'}</td>
                <td data-label="Acción"><span class="badge-margin ${CLASE_BADGE_ACCION[e.accion] || 'medio'}">${ETIQUETAS_ACCION[e.accion] || e.accion}</span></td>
                <td data-label="Tipo">${ETIQUETAS_ENTIDAD[e.entidad] || e.entidad}</td>
                <td data-label="Detalle">${escaparHtml(e.detalle) || '—'}</td>
            </tr>
        `;
    }

    function renderTabla(eventos) {
        resultCount.textContent = `${eventos.length} evento${eventos.length === 1 ? '' : 's'}`;
        if (eventos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="mpv-empty"><i class="bi bi-shield-lock"></i>No hay eventos registrados con estos filtros.</td></tr>`;
            return;
        }
        tbody.innerHTML = eventos.map(filaHtml).join('');
    }

    async function cargar() {
        try {
            const params = {};
            const entidad = document.getElementById('filtroEntidad').value;
            const accion = document.getElementById('filtroAccion').value;
            const desde = document.getElementById('filtroDesde').value;
            const hasta = document.getElementById('filtroHasta').value;
            if (entidad) params.entidad = entidad;
            if (accion) params.accion = accion;
            if (desde) params.desde = desde;
            if (hasta) params.hasta = hasta;

            const { data } = await MPV.getBitacora(params);
            renderTabla(data);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" class="mpv-empty"><i class="bi bi-plug-fill"></i>${err.message}</td></tr>`;
            resultCount.textContent = 'Sin conexión';
        }
    }

    document.getElementById('filtroEntidad').addEventListener('change', cargar);
    document.getElementById('filtroAccion').addEventListener('change', cargar);
    document.getElementById('filtroDesde').addEventListener('change', cargar);
    document.getElementById('filtroHasta').addEventListener('change', cargar);
    document.getElementById('btnLimpiarFiltros').addEventListener('click', () => {
        document.getElementById('filtroEntidad').value = '';
        document.getElementById('filtroAccion').value = '';
        document.getElementById('filtroDesde').value = '';
        document.getElementById('filtroHasta').value = '';
        cargar();
    });

    cargar();
})();
