const { test, expect } = require('@playwright/test');

test.use({ storageState: 'tests/e2e/.auth/admin.json' });

test.describe('Reportes de negocio (Herramientas)', () => {
    test('inventario valorizado y rentabilidad cargan datos reales, no se quedan en "Cargando…"', async ({ page }) => {
        await page.goto('/herramientas.html');

        await expect(page.locator('#inventarioValorCompra')).not.toHaveText('S/ 0.00', { timeout: 10_000 });
        await expect(page.locator('#inventarioTableBody')).not.toContainText('Cargando');

        await expect(page.locator('#rentabilidadCategoriaTableBody')).not.toContainText('Cargando');
        await expect(page.locator('#bajaRotacionTableBody')).not.toContainText('Cargando');
    });
});

test.describe('Proveedores', () => {
    test('el directorio y el ranking de confiabilidad cargan proveedores reales', async ({ page }) => {
        await page.goto('/proveedores.html');

        await expect(page.locator('#proveedoresTableBody tr').first()).not.toHaveClass(/skeleton-row/);
        await expect(page.locator('#resultCount')).toContainText('proveedor');
    });
});

test.describe('Órdenes de compra', () => {
    test('sugerencias de reabastecimiento abre y responde (aunque no haya nada por debajo del mínimo)', async ({ page }) => {
        await page.goto('/ordenes-compra.html');

        await page.click('#btnVerSugerencias');
        await expect(page.locator('#sugerenciasContenido')).toBeVisible();
        await expect(page.locator('#sugerenciasContenido')).not.toContainText('Cargando');
    });
});

test.describe('Ventas — clientes frecuentes', () => {
    test('la pestaña de clientes frecuentes carga sin quedarse en el estado inicial', async ({ page }) => {
        await page.goto('/ventas.html');

        await page.click('#tabClientesFrecuentes');
        await expect(page.locator('#clientesResultCount')).not.toHaveText('Cargando…');
    });
});
