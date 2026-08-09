const MPV = (() => {
    const BASE_URL = '/api';

    async function request(path, options = {}) {
        const res = await fetch(`${BASE_URL}${path}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.ok === false) {
            throw new Error(body.error || `Error en la solicitud: ${res.status}`);
        }
        return body;
    }

    const formatCurrency = (n) =>
        new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD' }).format(n ?? 0);

    return {
        getKpis: () => request('/dashboard/kpis'),
        getTableroPrecios: (params = {}) => {
            const qs = new URLSearchParams(params).toString();
            return request(`/precios${qs ? `?${qs}` : ''}`);
        },
        getProveedores: () => request('/proveedores'),
        getCategorias: () => request('/categorias'),
        compararProveedores: (productoId) => request(`/precios/comparar/${productoId}`),
        actualizarPrecio: (proveedorProductoId, precioCompraUnitario) =>
            request(`/precios/${proveedorProductoId}`, {
                method: 'PUT',
                body: JSON.stringify({ precioCompraUnitario }),
            }),
        marcarProveedorPrincipal: (proveedorProductoId) =>
            request(`/precios/${proveedorProductoId}/proveedor-principal`, { method: 'PUT' }),
        formatCurrency,
    };
})();
