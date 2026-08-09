window.MPVAuth = (() => {
    const TOKEN_KEY = 'mpv_token';
    const USER_KEY = 'mpv_usuario';

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUsuario() {
        try {
            return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
        } catch {
            return null;
        }
    }

    function guardarSesion(token, usuario) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(usuario));
    }

    function cerrarSesion() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        window.location.href = 'login.html';
    }

    // Bloquea el acceso a páginas protegidas si no hay sesión iniciada.
    function exigirSesion() {
        if (!getToken()) {
            window.location.href = 'login.html';
        }
    }

    // Bloquea el acceso a páginas exclusivas de un rol (ej. usuarios.html).
    function exigirRol(...rolesPermitidos) {
        const usuario = getUsuario();
        if (!usuario || !rolesPermitidos.includes(usuario.rol)) {
            window.location.href = 'index.html';
        }
    }

    function pintarUsuarioEnSidebar() {
        const usuario = getUsuario();
        if (!usuario) return;
        const iniciales = usuario.nombre
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
        const nombreEl = document.getElementById('sidebarUserName');
        const rolEl = document.getElementById('sidebarUserRole');
        const avatarEl = document.getElementById('sidebarUserAvatar');
        if (nombreEl) nombreEl.textContent = usuario.nombre;
        if (rolEl) rolEl.textContent = usuario.rol === 'admin' ? 'Administrador' : 'Operador de Compras';
        if (avatarEl) avatarEl.textContent = iniciales;

        if (usuario.rol !== 'admin') {
            document.querySelectorAll('[data-rol="admin"]').forEach((el) => el.remove());
        }
    }

    const COLLAPSE_KEY = 'mpv_sidebar_collapsed';

    // Colapsa el sidebar a solo íconos (escritorio). El estado se aplica de
    // forma síncrona en <head> (ver script inline en cada página) para que
    // no haya parpadeo del sidebar expandido antes de que corra este script.
    function inicializarColapsoSidebar() {
        const btn = document.getElementById('btnSidebarCollapse');
        if (!btn) return;
        const icono = btn.querySelector('i');
        const etiqueta = btn.querySelector('.nav-label');

        function aplicar(colapsado) {
            document.documentElement.classList.toggle('mpv-sidebar-collapsed', colapsado);
            icono.className = colapsado ? 'bi bi-chevron-double-right' : 'bi bi-chevron-double-left';
            const texto = colapsado ? 'Expandir menú' : 'Colapsar menú';
            etiqueta.textContent = texto;
            btn.title = texto;
        }

        aplicar(document.documentElement.classList.contains('mpv-sidebar-collapsed'));

        btn.addEventListener('click', () => {
            const colapsado = !document.documentElement.classList.contains('mpv-sidebar-collapsed');
            localStorage.setItem(COLLAPSE_KEY, colapsado ? '1' : '0');
            aplicar(colapsado);
        });
    }

    return { getToken, getUsuario, guardarSesion, cerrarSesion, exigirSesion, exigirRol, pintarUsuarioEnSidebar, inicializarColapsoSidebar };
})();

MPVAuth.exigirSesion();
document.addEventListener('DOMContentLoaded', () => {
    MPVAuth.pintarUsuarioEnSidebar();
    MPVAuth.inicializarColapsoSidebar();
    document.getElementById('btnLogout')?.addEventListener('click', (e) => {
        e.preventDefault();
        MPVAuth.cerrarSesion();
    });
});
