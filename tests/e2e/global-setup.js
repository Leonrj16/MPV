const fs = require('fs');
const { chromium } = require('@playwright/test');
const { ADMIN_EMAIL, ADMIN_PASSWORD } = require('./helpers');

const OPERADOR_EMAIL = process.env.E2E_OPERADOR_EMAIL || 'compras@mpvdental.com';

/**
 * Inicia sesión una sola vez por corrida completa (no por test) y guarda el
 * localStorage resultante para que el resto de la suite arranque ya
 * autenticada con `test.use({ storageState: ... })`. Sin esto, cada test que
 * necesita sesión repetiría el login real — con ~10 archivos de spec eso
 * empieza a chocar con el rate limit de /api/auth/login (10 intentos cada 15
 * minutos, ver rateLimit.middleware.js), que es justamente el que se probó
 * manualmente al armar esta suite.
 */
module.exports = async (config) => {
    const baseURL = config.projects[0].use.baseURL;
    const executablePath = config.projects[0].use.launchOptions?.executablePath;
    fs.mkdirSync('tests/e2e/.auth', { recursive: true });
    const browser = await chromium.launch({ executablePath });

    async function guardarSesion(email, password, archivo) {
        const context = await browser.newContext({ baseURL });
        const page = await context.newPage();
        await page.goto('/login.html');
        await page.fill('#email', email);
        await page.fill('#password', password);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/index.html');
        // Sin esto, cada test que reutiliza esta sesión vería el overlay de
        // onboarding guiado (Fase H3) tapando la página en su primera carga
        // — igual que a un admin real la primera vez, pero acá se repetiría
        // en cada test porque cada uno parte del mismo storageState "recién
        // logueado". Se marca como ya visto, como si el tour ya se hubiera
        // completado una vez.
        await page.evaluate(() => localStorage.setItem('mpv_onboarding_visto', '1'));
        await context.storageState({ path: archivo });
        await context.close();
    }

    await guardarSesion(ADMIN_EMAIL, ADMIN_PASSWORD, 'tests/e2e/.auth/admin.json');
    await guardarSesion(OPERADOR_EMAIL, ADMIN_PASSWORD, 'tests/e2e/.auth/operador.json');

    await browser.close();
};
