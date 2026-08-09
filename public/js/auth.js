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
    }

    return { getToken, getUsuario, guardarSesion, cerrarSesion, exigirSesion, pintarUsuarioEnSidebar };
})();

MPVAuth.exigirSesion();
document.addEventListener('DOMContentLoaded', () => {
    MPVAuth.pintarUsuarioEnSidebar();
    document.getElementById('btnLogout')?.addEventListener('click', (e) => {
        e.preventDefault();
        MPVAuth.cerrarSesion();
    });
});
