/**
 * Carrito de compras — persistido en localStorage, sin backend.
 * Expone un pequeño patrón pub/sub para que cualquier parte de la página
 * (badge del header, offcanvas, futuras vistas) se mantenga sincronizada
 * sin acoplarse entre sí.
 */
window.Carrito = (() => {
    const CLAVE_STORAGE = 'mpv_tienda_carrito';
    const suscriptores = [];

    function obtener() {
        try {
            const datos = JSON.parse(localStorage.getItem(CLAVE_STORAGE) || '[]');
            return Array.isArray(datos) ? datos : [];
        } catch {
            return [];
        }
    }

    function guardar(items) {
        localStorage.setItem(CLAVE_STORAGE, JSON.stringify(items));
        suscriptores.forEach((cb) => cb(items));
    }

    function suscribir(callback) {
        suscriptores.push(callback);
        callback(obtener()); // estado inicial
    }

    // stockActual viaja con cada item para poder topar la cantidad al stock
    // disponible en cualquier página (tienda.html o carrito.html) sin volver
    // a pedir el catálogo completo. null significa "sin dato de stock".
    function tope(cantidad, stockActual) {
        return typeof stockActual === 'number' && stockActual > 0 ? Math.min(cantidad, stockActual) : cantidad;
    }

    function agregar(producto, cantidad = 1) {
        const items = obtener();
        const existente = items.find((i) => i.id === producto.id);
        const stockActual = typeof producto.stockActual === 'number' ? producto.stockActual : null;

        if (existente) {
            existente.stockActual = stockActual;
            existente.cantidad = tope(existente.cantidad + cantidad, stockActual);
        } else {
            items.push({
                id: producto.id,
                sku: producto.sku,
                nombre: producto.nombre,
                precio: producto.precio,
                imagenUrl: producto.imagenUrl || null,
                unidadMedida: producto.unidadMedida || 'unidad',
                stockActual,
                cantidad: tope(cantidad, stockActual),
            });
        }
        guardar(items);
    }

    function actualizarCantidad(id, delta) {
        const items = obtener();
        const item = items.find((i) => i.id === id);
        if (!item) return;

        item.cantidad = tope(item.cantidad + delta, item.stockActual);
        const resultado = item.cantidad <= 0 ? items.filter((i) => i.id !== id) : items;
        guardar(resultado);
    }

    function eliminar(id) {
        guardar(obtener().filter((i) => i.id !== id));
    }

    function vaciar() {
        guardar([]);
    }

    function calcularTotal() {
        return obtener().reduce((sum, i) => sum + i.precio * i.cantidad, 0);
    }

    function calcularCantidadTotal() {
        return obtener().reduce((sum, i) => sum + i.cantidad, 0);
    }

    return { obtener, agregar, actualizarCantidad, eliminar, vaciar, calcularTotal, calcularCantidadTotal, suscribir };
})();
