// Service worker de la tienda virtual — cachea el "shell" estático
// (HTML/CSS/JS/íconos) para que la tienda cargue instantáneamente en
// visitas repetidas y funcione, al menos para navegar, sin conexión.
// La API (/api/...) nunca se cachea aquí: precios y stock deben venir
// siempre frescos del servidor.
const CACHE = 'sjt-tienda-v1';
const ASSETS_ESTATICOS = [
    '/tienda.html',
    '/carrito.html',
    '/css/base.css',
    '/css/tienda.css',
    '/js/tienda.js',
    '/js/carrito.js',
    '/js/carrito-pagina.js',
    '/js/scroll-reveal.js',
    '/vendor/bootstrap/css/bootstrap.min.css',
    '/vendor/bootstrap/js/bootstrap.bundle.min.js',
    '/vendor/bootstrap-icons/font/bootstrap-icons.css',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/manifest.json',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(ASSETS_ESTATICOS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Notificaciones push de cambio de estado de pedido (Fase G3). El payload
// lo arma el servidor en src/services/push.js; si no llega como JSON (no
// debería pasar) se usa un mensaje genérico en vez de fallar la notificación.
self.addEventListener('push', (event) => {
    let datos = { titulo: 'San Judas Tadeo Botica Dental', cuerpo: 'Tienes una actualización de tu pedido.', url: '/tienda.html' };
    try {
        if (event.data) datos = { ...datos, ...event.data.json() };
    } catch { /* usa el mensaje genérico */ }

    event.waitUntil(
        self.registration.showNotification(datos.titulo, {
            body: datos.cuerpo,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            data: { url: datos.url },
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/tienda.html';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientes) => {
            const existente = clientes.find((c) => c.url.includes(url));
            if (existente) return existente.focus();
            return self.clients.openWindow(url);
        })
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

    // Stale-while-revalidate: responde de caché al instante si existe, y en
    // paralelo pide la versión fresca para la próxima visita.
    event.respondWith(
        caches.match(request).then((cacheada) => {
            const fetchPromise = fetch(request)
                .then((respuesta) => {
                    if (respuesta.ok) {
                        const copia = respuesta.clone();
                        caches.open(CACHE).then((cache) => cache.put(request, copia));
                    }
                    return respuesta;
                })
                .catch(() => cacheada);
            return cacheada || fetchPromise;
        })
    );
});
