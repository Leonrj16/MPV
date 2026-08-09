const MPV = (() => {
    const BASE_URL = '/api';

    async function request(path, options = {}) {
        const token = window.MPVAuth?.getToken?.();
        const res = await fetch(`${BASE_URL}${path}`, {
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            ...options,
        });

        if (res.status === 401) {
            window.MPVAuth?.cerrarSesion?.();
            throw new Error('Sesión expirada. Inicia sesión nuevamente.');
        }

        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.ok === false) {
            throw new Error(body.error || `Error en la solicitud: ${res.status}`);
        }
        return body;
    }

    const formatCurrency = (n) =>
        new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n ?? 0);

    async function descargarArchivo(path, params = {}) {
        const token = window.MPVAuth?.getToken?.();
        const qs = new URLSearchParams(params).toString();
        const res = await fetch(`${BASE_URL}${path}${qs ? `?${qs}` : ''}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (res.status === 401) {
            window.MPVAuth?.cerrarSesion?.();
            throw new Error('Sesión expirada. Inicia sesión nuevamente.');
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `No se pudo generar el archivo (${res.status})`);
        }

        const disposicion = res.headers.get('Content-Disposition') || '';
        const match = disposicion.match(/filename="([^"]+)"/);
        const nombreArchivo = match ? match[1] : 'descarga';

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    async function importarPrecios(archivo) {
        const token = window.MPVAuth?.getToken?.();
        const formData = new FormData();
        formData.append('archivo', archivo);

        const res = await fetch(`${BASE_URL}/precios/importar`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
        });

        if (res.status === 401) {
            window.MPVAuth?.cerrarSesion?.();
            throw new Error('Sesión expirada. Inicia sesión nuevamente.');
        }

        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.ok === false) {
            throw new Error(body.error || `Error al importar (${res.status})`);
        }
        return body;
    }

    // A diferencia de descargarArchivo (que fuerza una descarga), esto abre
    // el PDF en una pestaña nueva para que el staff lo revise/imprima al
    // toque tras cerrar una venta — el visor nativo del navegador ya trae
    // su propio botón de imprimir.
    async function abrirBoleta(ventaId) {
        const token = window.MPVAuth?.getToken?.();
        const res = await fetch(`${BASE_URL}/ventas/${ventaId}/boleta`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (res.status === 401) {
            window.MPVAuth?.cerrarSesion?.();
            throw new Error('Sesión expirada. Inicia sesión nuevamente.');
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `No se pudo generar la boleta (${res.status})`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const ventana = window.open(url, '_blank');
        if (!ventana) {
            throw new Error('El navegador bloqueó la ventana emergente. Habilítala e inténtalo de nuevo.');
        }
    }

    async function subirImagen(archivo) {
        const token = window.MPVAuth?.getToken?.();
        const formData = new FormData();
        formData.append('imagen', archivo);

        const res = await fetch(`${BASE_URL}/uploads/imagen`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
        });

        if (res.status === 401) {
            window.MPVAuth?.cerrarSesion?.();
            throw new Error('Sesión expirada. Inicia sesión nuevamente.');
        }

        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.ok === false) {
            throw new Error(body.error || `No se pudo subir la imagen (${res.status})`);
        }
        return body.data.url;
    }

    return {
        getKpis: () => request('/dashboard/kpis'),
        getTableroPrecios: (params = {}) => {
            const qs = new URLSearchParams(params).toString();
            return request(`/precios${qs ? `?${qs}` : ''}`);
        },
        getProductos: () => request('/productos'),
        crearProducto: (payload) => request('/productos', { method: 'POST', body: JSON.stringify(payload) }),
        actualizarProducto: (id, payload) => request(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
        getProveedores: () => request('/proveedores'),
        crearProveedor: (payload) => request('/proveedores', { method: 'POST', body: JSON.stringify(payload) }),
        actualizarProveedor: (id, payload) => request(`/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
        getCategorias: () => request('/categorias'),
        crearCategoria: (payload) => request('/categorias', { method: 'POST', body: JSON.stringify(payload) }),
        actualizarCategoria: (id, payload) => request(`/categorias/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
        eliminarCategoria: (id) => request(`/categorias/${id}`, { method: 'DELETE' }),
        compararProveedores: (productoId) => request(`/precios/comparar/${productoId}`),
        getHistorialPrecio: (proveedorProductoId) => request(`/precios/historial/${proveedorProductoId}`),
        actualizarPrecio: (proveedorProductoId, precioCompraUnitario) =>
            request(`/precios/${proveedorProductoId}`, {
                method: 'PUT',
                body: JSON.stringify({ precioCompraUnitario }),
            }),
        marcarProveedorPrincipal: (proveedorProductoId) =>
            request(`/precios/${proveedorProductoId}/proveedor-principal`, { method: 'PUT' }),
        exportarExcel: (params) => descargarArchivo('/precios/exportar/excel', params),
        exportarPDF: (params) => descargarArchivo('/precios/exportar/pdf', params),
        descargarPlantillaCarga: () => descargarArchivo('/precios/plantilla-carga'),
        importarPrecios,
        getUsuarios: () => request('/usuarios'),
        crearUsuario: (payload) => request('/usuarios', { method: 'POST', body: JSON.stringify(payload) }),
        actualizarUsuario: (id, payload) => request(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
        cambiarPasswordUsuario: (id, password) =>
            request(`/usuarios/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
        getConfiguracion: () => request('/configuracion'),
        actualizarConfiguracion: (payload) => request('/configuracion', { method: 'PUT', body: JSON.stringify(payload) }),
        getConfiguracionTienda: () => request('/tienda/configuracion'),
        actualizarConfiguracionTienda: (payload) => request('/tienda/configuracion', { method: 'PUT', body: JSON.stringify(payload) }),
        subirImagen,
        getProductosDisponiblesVenta: () => request('/ventas/productos-disponibles'),
        crearVenta: (payload) => request('/ventas', { method: 'POST', body: JSON.stringify(payload) }),
        getVentas: (params = {}) => {
            const qs = new URLSearchParams(params).toString();
            return request(`/ventas${qs ? `?${qs}` : ''}`);
        },
        abrirBoleta,
        formatCurrency,
    };
})();
