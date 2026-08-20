const { test, expect } = require('@playwright/test');

test.describe('Tienda pública — checkout', () => {
    test('agrega un producto al carrito y completa un pedido con teléfono y dirección', async ({ page }) => {
        await page.goto('/tienda.html');

        const primeraTarjeta = page.locator('.card-producto').first();
        await expect(primeraTarjeta).toBeVisible();
        const nombreProducto = await primeraTarjeta.locator('.card-producto-nombre').first().textContent();

        await primeraTarjeta.locator('.btn-agregar').click();
        await expect(page.locator('#toastAgregado')).toBeVisible();

        await page.goto('/carrito.html');
        await expect(page.locator('#listaCarritoPagina')).toContainText(nombreProducto.trim());

        await page.fill('#carritoPaginaNombre', 'Cliente E2E Playwright');
        await page.fill('#carritoPaginaTelefono', '999888777');
        await page.fill('#carritoPaginaDireccion', 'Av. Prueba 123, Lima');

        // El checkout abre WhatsApp en una pestaña nueva además de mostrar la
        // vista de éxito — se ignora esa pestaña, lo que importa es que el
        // pedido haya quedado registrado en el backend.
        const [popup] = await Promise.all([
            page.waitForEvent('popup').catch(() => null),
            page.click('#btnFinalizarPedidoPagina'),
        ]);
        if (popup) await popup.close();

        await expect(page.locator('#carritoPaginaExito')).toBeVisible({ timeout: 10_000 });
    });

    test('el carrito vacío muestra el estado vacío en vez de un formulario en blanco', async ({ page, context }) => {
        await context.addInitScript(() => localStorage.removeItem('mpv_tienda_carrito'));
        await page.goto('/carrito.html');
        await expect(page.locator('#carritoPaginaVacio')).toBeVisible();
        await expect(page.locator('#carritoPaginaContenido')).toBeHidden();
    });
});
