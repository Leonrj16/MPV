/**
 * Modo oscuro — compartido por el panel interno y la tienda. La aplicación
 * inicial (antes de este script) ya corrió en un <script> inline en <head>
 * de cada página, para no mostrar un parpadeo del tema claro antes de
 * cambiar a oscuro; esto solo agrega el botón y la persistencia del cambio.
 */
window.MPVTheme = (() => {
    const CLAVE = 'mpv_theme';

    function obtener() {
        return localStorage.getItem(CLAVE) === 'dark' ? 'dark' : 'light';
    }

    function aplicar(tema) {
        const oscuro = tema === 'dark';
        document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : 'light');
        document.documentElement.setAttribute('data-bs-theme', oscuro ? 'dark' : 'light');
        document.querySelectorAll('[data-tema-icono]').forEach((el) => {
            el.className = oscuro ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
        });
        document.querySelectorAll('[data-tema-boton]').forEach((el) => {
            el.setAttribute('title', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
            el.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
        });
    }

    function alternar() {
        const nuevo = obtener() === 'dark' ? 'light' : 'dark';
        localStorage.setItem(CLAVE, nuevo);
        aplicar(nuevo);
    }

    return { obtener, aplicar, alternar };
})();

document.addEventListener('DOMContentLoaded', () => {
    MPVTheme.aplicar(MPVTheme.obtener());
    document.querySelectorAll('[data-tema-boton]').forEach((btn) => {
        btn.addEventListener('click', () => MPVTheme.alternar());
    });
});
