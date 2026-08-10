// Tour guiado de bienvenida (Fase H3) — se muestra una sola vez, la primera
// vez que alguien entra al Dashboard tras iniciar sesión. Solo resalta
// elementos que ya existen en la página (sidebar, campana de alertas), sin
// depender de ninguna librería externa.
(function () {
    const CLAVE = 'mpv_onboarding_visto';
    if (localStorage.getItem(CLAVE) === '1') return;

    const PASOS = [
        {
            selector: 'a[href="index.html"]',
            titulo: 'Bienvenido a MPV Dental',
            texto: 'Este es tu Dashboard: aquí ves de un vistazo tus precios, márgenes y ventas del día.',
        },
        {
            selector: 'a[href="punto-venta.html"]',
            titulo: 'Punto de Venta',
            texto: 'Registra una venta de mostrador en segundos: elige productos, cantidad y método de pago.',
        },
        {
            selector: 'a[href="productos.html"]',
            titulo: 'Productos',
            texto: 'Administra tu catálogo, stock y ahora también fechas de vencimiento y movimientos de stock.',
        },
        {
            selector: '#btnAlertas',
            titulo: 'Campana de alertas',
            texto: 'Avisos de stock bajo, subidas de precio, reabastecimiento y pedidos web pendientes, todo en un solo lugar.',
        },
    ].map((p) => ({ ...p, el: document.querySelector(p.selector) }))
        .filter((p) => p.el);

    if (PASOS.length === 0) return;

    let paso = 0;

    const overlay = document.createElement('div');
    overlay.id = 'onboardingOverlay';
    overlay.innerHTML = `
        <div id="onboardingResaltado"></div>
        <div id="onboardingCard" role="dialog" aria-modal="true" aria-labelledby="onboardingTitulo">
            <div id="onboardingTitulo" class="fw-bold mb-1"></div>
            <div id="onboardingTexto" class="small text-muted mb-3"></div>
            <div class="d-flex justify-content-between align-items-center">
                <button type="button" class="btn btn-link btn-sm p-0 text-muted" id="onboardingSaltar">Saltar</button>
                <div class="d-flex align-items-center gap-2">
                    <span class="small text-muted" id="onboardingContador"></span>
                    <button type="button" class="btn btn-mpv-primary btn-sm" id="onboardingSiguiente">Siguiente</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const resaltado = document.getElementById('onboardingResaltado');
    const card = document.getElementById('onboardingCard');
    const btnSiguiente = document.getElementById('onboardingSiguiente');

    function posicionar() {
        const actual = PASOS[paso];
        const rect = actual.el.getBoundingClientRect();

        resaltado.style.top = `${rect.top - 6}px`;
        resaltado.style.left = `${rect.left - 6}px`;
        resaltado.style.width = `${rect.width + 12}px`;
        resaltado.style.height = `${rect.height + 12}px`;

        document.getElementById('onboardingTitulo').textContent = actual.titulo;
        document.getElementById('onboardingTexto').textContent = actual.texto;
        document.getElementById('onboardingContador').textContent = `${paso + 1} / ${PASOS.length}`;
        btnSiguiente.textContent = paso === PASOS.length - 1 ? 'Entendido' : 'Siguiente';

        // Coloca la tarjeta a la derecha del elemento resaltado si hay
        // espacio, o debajo si no lo hay (por ejemplo, en pantallas angostas).
        const cardAncho = 300;
        let left = rect.right + 16;
        if (left + cardAncho > window.innerWidth) left = Math.max(16, rect.left);
        let top = rect.top;
        if (rect.right + 16 + cardAncho > window.innerWidth) top = rect.bottom + 16;
        top = Math.min(top, window.innerHeight - 180);

        card.style.left = `${left}px`;
        card.style.top = `${Math.max(16, top)}px`;
    }

    function terminar() {
        localStorage.setItem(CLAVE, '1');
        overlay.remove();
    }

    btnSiguiente.addEventListener('click', () => {
        paso += 1;
        if (paso >= PASOS.length) {
            terminar();
            return;
        }
        posicionar();
    });
    document.getElementById('onboardingSaltar').addEventListener('click', terminar);
    window.addEventListener('resize', () => { if (document.body.contains(overlay)) posicionar(); });

    posicionar();
})();
