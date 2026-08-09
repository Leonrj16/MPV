/**
 * Favoritos de la tienda — solo ids de producto, persistidos en
 * localStorage. No guarda una copia del producto (a diferencia del
 * carrito): el catálogo completo ya vive en memoria en tienda.js, así que
 * basta con saber qué ids están marcados para pintar el corazón y filtrar.
 */
window.Favoritos = (() => {
    const CLAVE_STORAGE = 'mpv_tienda_favoritos';
    const suscriptores = [];

    function obtener() {
        try {
            const datos = JSON.parse(localStorage.getItem(CLAVE_STORAGE) || '[]');
            return Array.isArray(datos) ? datos : [];
        } catch {
            return [];
        }
    }

    function guardar(ids) {
        localStorage.setItem(CLAVE_STORAGE, JSON.stringify(ids));
        suscriptores.forEach((cb) => cb(ids));
    }

    function suscribir(callback) {
        suscriptores.push(callback);
        callback(obtener());
    }

    function tieneId(id) {
        return obtener().includes(id);
    }

    // Devuelve el nuevo estado (true = quedó marcado como favorito).
    function alternar(id) {
        const ids = obtener();
        const idx = ids.indexOf(id);
        if (idx === -1) {
            ids.push(id);
            guardar(ids);
            return true;
        }
        ids.splice(idx, 1);
        guardar(ids);
        return false;
    }

    return { obtener, tieneId, alternar, suscribir };
})();
