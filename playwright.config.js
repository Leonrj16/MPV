const { defineConfig } = require('@playwright/test');

// Suite E2E: corre contra un servidor real ya levantado (`npm run dev`) con
// una base de datos ya sembrada (`database/schema.sql` + migraciones) — a
// diferencia de los tests de Jest, que mockean `pool.query` y no necesitan
// nada de esto. Pensada para correr a mano o en CI contra un entorno de
// staging, no como parte de `npm test`.
module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    fullyParallel: false,
    retries: 0,
    reporter: [['list']],
    globalSetup: require.resolve('./tests/e2e/global-setup.js'),
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                // Reutiliza el Chromium ya instalado en vez de descargar uno nuevo
                // que coincida exactamente con la versión de @playwright/test.
                launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium' },
            },
        },
    ],
});
