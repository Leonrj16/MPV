const { construirHtmlCatalogo } = require('../src/templates/catalogoPdf');

describe('construirHtmlCatalogo', () => {
    const configBase = {
        nombreNegocio: 'San Judas Tadeo',
        eslogan: 'Botica Dental',
        logoUrl: null,
        telefono: '+51 999 000 111',
        emailContacto: 'contacto@sanjudastadeo.dental',
        direccion: 'Av. Principal 123',
    };

    test('incluye el nombre del negocio y cada categoría con sus productos', () => {
        const html = construirHtmlCatalogo({
            config: configBase,
            categorias: [
                { nombre: 'Resinas', productos: [{ id: 1, nombre: 'Resina A2', unidadMedida: 'jeringa', precio: 19.62, imagenUrl: null }] },
                { nombre: 'Guantes', productos: [{ id: 2, nombre: 'Guantes Nitrilo M', unidadMedida: 'caja', precio: 25, imagenUrl: null }] },
            ],
            generadoEl: new Date('2026-08-10T12:00:00'),
        });

        expect(html).toContain('San Judas Tadeo');
        expect(html).toContain('Botica Dental');
        expect(html).toContain('Resinas');
        expect(html).toContain('Guantes');
        expect(html).toContain('Resina A2');
        expect(html).toContain('S/ 19.62');
        expect(html).toContain('Guantes Nitrilo M');
        expect(html).toContain('2 productos'); // total de la portada
    });

    test('escapa HTML en nombres de producto y categoría (sin XSS)', () => {
        const html = construirHtmlCatalogo({
            config: configBase,
            categorias: [
                { nombre: '<script>alert(1)</script>', productos: [{ id: 1, nombre: '<img src=x onerror=alert(1)>', unidadMedida: 'u', precio: 10, imagenUrl: null }] },
            ],
        });

        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).not.toContain('<img src=x onerror=alert(1)>');
        expect(html).toContain('&lt;script&gt;');
    });

    test('usa un placeholder cuando el producto no tiene imagen', () => {
        const html = construirHtmlCatalogo({
            config: configBase,
            categorias: [{ nombre: 'Sin imagen', productos: [{ id: 1, nombre: 'Producto sin foto', unidadMedida: 'u', precio: 5, imagenUrl: null }] }],
        });

        expect(html).toContain('producto-imagen-placeholder');
        expect(html).not.toContain('<img src=""');
    });

    test('usa la imagen del producto cuando existe', () => {
        const html = construirHtmlCatalogo({
            config: configBase,
            categorias: [{ nombre: 'Con imagen', productos: [{ id: 1, nombre: 'Producto con foto', unidadMedida: 'u', precio: 5, imagenUrl: 'http://localhost:3000/uploads/x.jpg' }] }],
        });

        expect(html).toContain('http://localhost:3000/uploads/x.jpg');
    });

    test('las categorías fluyen sin salto de página forzado (evita hojas casi vacías con pocos productos)', () => {
        const html = construirHtmlCatalogo({
            config: configBase,
            categorias: [
                { nombre: 'Primera', productos: [{ id: 1, nombre: 'P1', unidadMedida: 'u', precio: 1, imagenUrl: null }] },
                { nombre: 'Segunda', productos: [{ id: 2, nombre: 'P2', unidadMedida: 'u', precio: 2, imagenUrl: null }] },
            ],
        });

        expect(html).not.toContain('salto-pagina');
        // el encabezado de categoría no debe quedar huérfano al final de una página
        expect(html).toContain('break-after: avoid');
    });

    test('sin logo usa las iniciales del negocio como placeholder de marca', () => {
        const html = construirHtmlCatalogo({ config: configBase, categorias: [] });
        expect(html).toContain('portada-logo-generico');
        expect(html).toContain('>S<'); // inicial de "San Judas Tadeo"
    });
});
