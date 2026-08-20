const { test, expect } = require('@playwright/test');

test.use({ storageState: 'tests/e2e/.auth/admin.json' });

test.describe('Punto de Venta', () => {
    test('abre caja si hace falta, registra una venta de mostrador y la cierra de nuevo', async ({ page }) => {
        await page.goto('/punto-venta.html');

        // Si la caja está cerrada, punto-venta.js abre el modal de apertura
        // solo (con un pequeño delay tras el fetch de estado) — hay que
        // esperarlo explícitamente en vez de solo mirar el estado actual del
        // DOM, que puede no haberse actualizado todavía.
        const modalAbrirCaja = page.locator('#modalAbrirCaja');
        const cajaCerrada = await modalAbrirCaja
            .waitFor({ state: 'visible', timeout: 5000 })
            .then(() => true)
            .catch(() => false);
        if (cajaCerrada) {
            await page.fill('#cajaMontoApertura', '100');
            await page.click('#btnConfirmarAbrirCaja');
            await expect(modalAbrirCaja).toBeHidden();
        }

        // Agrega el primer producto disponible (no deshabilitado por falta de
        // stock/precio) y registra la venta en efectivo.
        await page.locator('.pos-product-card:not(.disabled) [data-add]').first().click();
        await expect(page.locator('#posCartItems')).not.toContainText('Agrega productos del catálogo');

        await page.click('#btnRegistrarVenta');
        await expect(page.locator('#posExito')).toBeVisible();
        await expect(page.locator('#posExito')).toContainText(/Venta #\d+ registrada/);

        // Deja la caja como estaba (cerrada) para que la corrida sea
        // repetible sin arrastrar estado de una ejecución a la siguiente.
        await page.click('#btnCaja');
        await expect(page.locator('#modalCerrarCaja')).toBeVisible();
        await page.fill('#cajaMontoContado', '100');
        await page.click('#btnConfirmarCerrarCaja');
        await expect(page.locator('#cajaCierreResultado')).toBeVisible();
        await page.click('#btnCerrarModalCaja');
    });
});
