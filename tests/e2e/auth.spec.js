const { test, expect } = require('@playwright/test');
const { ADMIN_EMAIL, ADMIN_PASSWORD } = require('./helpers');

test.describe('Login', () => {
    test('credenciales correctas redirigen al dashboard autenticado', async ({ page }) => {
        await page.goto('/login.html');
        await page.fill('#email', ADMIN_EMAIL);
        await page.fill('#password', ADMIN_PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/index.html');

        await expect(page).toHaveURL(/index\.html/);
        await expect(page.locator('#sidebarUserName')).not.toHaveText('—');
    });

    test('credenciales incorrectas muestran un error y no redirigen', async ({ page }) => {
        await page.goto('/login.html');
        await page.fill('#email', ADMIN_EMAIL);
        await page.fill('#password', 'password-equivocado');
        await page.click('button[type="submit"]');

        await expect(page.locator('#loginError')).toBeVisible();
        await expect(page).toHaveURL(/login\.html/);
    });

    test('una página protegida sin sesión redirige a login', async ({ page }) => {
        await page.context().clearCookies();
        await page.goto('/ventas.html');
        // auth.js corta la carga y manda a login.html si no hay token válido.
        await expect(page).toHaveURL(/login\.html/);
    });
});

test.describe('Sesión ya iniciada (admin)', () => {
    test.use({ storageState: 'tests/e2e/.auth/admin.json' });

    test('cerrar sesión vuelve a login.html', async ({ page }) => {
        await page.goto('/index.html');
        await page.click('#btnLogout');
        await expect(page).toHaveURL(/login\.html/);
    });
});

test.describe('Roles', () => {
    test.use({ storageState: 'tests/e2e/.auth/operador.json' });

    test('un operador no ve los enlaces exclusivos de administración', async ({ page }) => {
        await page.goto('/index.html');
        await expect(page.locator('a[href="usuarios.html"]')).toHaveCount(0);
    });
});
