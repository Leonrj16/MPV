jest.mock('../src/config/db', () => ({ query: jest.fn() }));
jest.mock('puppeteer', () => ({ launch: jest.fn() }));
const pool = require('../src/config/db');
const puppeteer = require('puppeteer');
const { obtenerDatosCatalogo, generarCatalogoPdfBuffer } = require('../src/services/catalogoPdf');

const configRow = {
    margen_utilidad_defecto_pct: '35.00',
    costo_operativo_mensual: '1500.00',
    unidades_estimadas_mensual: 500,
    porcentaje_impuesto: '18.00',
};

afterEach(() => jest.clearAllMocks());

describe('obtenerDatosCatalogo', () => {
    test('agrupa productos por categoría y calcula el precio con el motor de precios', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] }) // obtenerConfigActiva
            .mockResolvedValueOnce({
                rows: [
                    { id: 1, nombre: 'Resina A2', imagen_url: null, unidad_medida: 'jeringa', categoria_nombre: 'Resinas', precio_compra_unitario: '8.50' },
                    { id: 2, nombre: 'Guantes M', imagen_url: null, unidad_medida: 'caja', categoria_nombre: 'Bioseguridad', precio_compra_unitario: '12.00' },
                    { id: 3, nombre: 'Guantes S', imagen_url: null, unidad_medida: 'caja', categoria_nombre: 'Bioseguridad', precio_compra_unitario: '11.00' },
                ],
            })
            .mockResolvedValueOnce({ rows: [{ nombre_negocio: 'San Judas Tadeo', eslogan: 'Botica Dental' }] }); // configuracion_tienda

        const datos = await obtenerDatosCatalogo();

        expect(datos.categorias).toHaveLength(2);
        // orden alfabético: Bioseguridad antes que Resinas
        expect(datos.categorias[0].nombre).toBe('Bioseguridad');
        expect(datos.categorias[0].productos).toHaveLength(2);
        expect(datos.categorias[1].nombre).toBe('Resinas');
        expect(datos.categorias[1].productos[0]).toMatchObject({ nombre: 'Resina A2', precio: 20.88 });
        expect(datos.config.nombreNegocio).toBe('San Judas Tadeo');
    });

    test('productos sin categoría quedan agrupados como "Otros" (vía COALESCE en la consulta)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] });
        await obtenerDatosCatalogo().catch(() => {});
        const [sql] = pool.query.mock.calls[1] || [];
        expect(sql).toContain("COALESCE(c.nombre, 'Otros')");
    });

    test('la consulta excluye productos inactivos o sin proveedor activo (JOIN, no LEFT JOIN)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] });
        await obtenerDatosCatalogo().catch(() => {});
        const [sql] = pool.query.mock.calls[1] || [];
        expect(sql).toContain('pr.activo = TRUE');
        expect(sql).toContain('JOIN proveedor_producto pp');
        expect(sql).not.toContain('LEFT JOIN proveedor_producto');
    });
});

describe('generarCatalogoPdfBuffer', () => {
    // Regresión: page.pdf() de Puppeteer devuelve un Uint8Array, no un
    // Buffer real de Node — si se le pasa tal cual a res.send(), Express no
    // lo reconoce como binario y lo serializa como JSON en vez de mandar el
    // PDF (se detectó generando un catálogo real y abriendo el archivo).
    test('devuelve un Buffer real de Node, no un Uint8Array', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ nombre_negocio: 'San Judas Tadeo' }] });

        const pdfComoUint8Array = new Uint8Array([37, 80, 68, 70]); // "%PDF"
        const paginaFalsa = {
            setContent: jest.fn().mockResolvedValue(undefined),
            pdf: jest.fn().mockResolvedValue(pdfComoUint8Array),
        };
        const navegadorFalso = {
            newPage: jest.fn().mockResolvedValue(paginaFalsa),
            close: jest.fn().mockResolvedValue(undefined),
        };
        puppeteer.launch.mockResolvedValue(navegadorFalso);

        const resultado = await generarCatalogoPdfBuffer({ baseUrl: 'http://localhost:3000' });

        expect(Buffer.isBuffer(resultado)).toBe(true);
        expect(navegadorFalso.close).toHaveBeenCalled();
    });
});
