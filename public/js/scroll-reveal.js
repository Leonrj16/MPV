/**
 * Revela con un fade-up suave los elementos marcados con la clase "reveal"
 * a medida que entran en el viewport.
 *
 * Robustez: el estado oculto (definido en base.css) solo se activa cuando
 * este script agrega "js-reveal-ready" al <html> — así, si el script no
 * llega a correr (bloqueado, error de red, navegador sin
 * IntersectionObserver), el contenido queda visible de forma normal en vez
 * de atrapado en opacity:0. Además, cualquier elemento que por alguna razón
 * no se llegue a observar (ej. ya estaba fuera del árbol cuando se llamó a
 * iniciar(), o un layout inusual) se fuerza a visible tras 2.5s como red de
 * seguridad — nunca debe quedar contenido oculto de forma permanente.
 */
(function () {
    if (!('IntersectionObserver' in window)) return;

    document.documentElement.classList.add('js-reveal-ready');

    let observer = null;

    function crearObserver() {
        return new IntersectionObserver(
            (entradas) => {
                entradas.forEach((entrada) => {
                    if (entrada.isIntersecting) {
                        entrada.target.classList.add('visible');
                        observer.unobserve(entrada.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
        );
    }

    function iniciar() {
        const elementos = document.querySelectorAll('.reveal:not(.visible)');
        if (elementos.length === 0) return;

        if (!observer) observer = crearObserver();
        elementos.forEach((el) => {
            observer.observe(el);
            // Red de seguridad: si en 2.5s no se reveló (observer no disparó,
            // el elemento nunca quedó cerca del viewport, etc.), se muestra igual.
            setTimeout(() => el.classList.add('visible'), 2500);
        });
    }

    window.MPVScrollReveal = { iniciar };

    document.addEventListener('DOMContentLoaded', iniciar);
})();
