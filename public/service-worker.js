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
