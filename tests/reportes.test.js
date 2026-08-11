jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const pool = require('../src/config/db');
const { obtenerInventarioValorizado, obtenerClientesFrecuentes } = require('../src/services/reportes');

const configRow = {
    margen_utilidad_defecto_pct: '35.00',
    costo_operativo_mensual: '1500.00',
    unidades_estimadas_mensual: 500,
    porcentaje_impuesto: '0.00',
};

afterEach(() => jest.clearAllMocks());

describe('obtenerInventarioValorizado', () => {
    test('calcula valor de compra, venta potencial y margen por producto', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({
                rows: [
                    { id: 1, sku: 'RES-001', nombre: 'Resina', stock_actual: 10, categoria_nombre: 'Resinas', precio_compra_unitario: '8.50' },
                ],
            });

        const { productos, totales } = await obtenerInventarioValorizado();

        expect(productos[0]).toMatchObject({
            sku: 'RES-001',
            stock: 10,
            sinPrecio: false,
            precioCompraUnitario: 8.5,
            pvpUnitario: 17.69,
            valorCompra: 85,
            valorVentaPotencial: 176.9,
            margenPotencial: 91.9,
        });
        expect(totales.valorCompra).toBe(85);
        expect(totales.valorVentaPotencial).toBe(176.9);
        expect(totales.productosSinPrecio).toBe(0);
    });

    test('producto sin proveedor activo se incluye con valor 0 y sinPrecio:true, no se excluye', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({
                rows: [
                    { id: 2, sku: 'HIL-500', nombre: 'Hilo', stock_actual: 5, categoria_nombre: 'Bioseguridad', precio_compra_unitario: null },
                ],
            });

        const { productos, totales } = await obtenerInventarioValorizado();

        expect(productos[0]).toMatchObject({ sinPrecio: true, valorCompra: 0, valorVentaPotencial: 0 });
        expect(totales.productosSinPrecio).toBe(1);
    });

    test('agrupa por categoría con subtotales correctos', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({
                rows: [
                    { id: 1, sku: 'RES-001', nombre: 'Resina', stock_actual: 10, categoria_nombre: 'Resinas', precio_compra_unitario: '8.50' },
                    { id: 3, sku: 'RES-002', nombre: 'Resina B', stock_actual: 4, categoria_nombre: 'Resinas', precio_compra_unitario: '10.00' },
                    { id: 4, sku: 'GUA-100', nombre: 'Guantes', stock_actual: 20, categoria_nombre: 'Bioseguridad', precio_compra_unitario: '0.50' },
                ],
            });

        const { categorias } = await obtenerInventarioValorizado();

        const resinas = categorias.find((c) => c.categoria === 'Resinas');
        expect(resinas.productos).toHaveLength(2);
        expect(resinas.valorCompra).toBe(85 + 40); // 10*8.50 + 4*10.00

        const bioseguridad = categorias.find((c) => c.categoria === 'Bioseguridad');
        expect(bioseguridad.valorCompra).toBe(10); // 20*0.50
    });

    test('categoría nula cae en "Sin categoría"', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({
                rows: [{ id: 5, sku: 'X-1', nombre: 'Producto suelto', stock_actual: 1, categoria_nombre: 'Sin categoría', precio_compra_unitario: '1.00' }],
            });

        const { categorias } = await obtenerInventarioValorizado();
        expect(categorias[0].categoria).toBe('Sin categoría');
    });
});

describe('obtenerClientesFrecuentes', () => {
    test('calcula ticket promedio y totales a partir de las filas agrupadas', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                {
                    clave: '51999333444',
                    nombre: 'Lucía Torres',
                    telefono: '51999333444',
                    cantidad_compras: '3',
                    total_gastado: '270.50',
                    primera_compra: '2026-01-05T10:00:00.000Z',
                    ultima_compra: '2026-06-20T15:30:00.000Z',
                },
            ],
        });

        const { clientes, totales } = await obtenerClientesFrecuentes();

        expect(clientes[0]).toMatchObject({
            nombre: 'Lucía Torres',
            telefono: '51999333444',
            cantidadCompras: 3,
            totalGastado: 270.5,
            ticketPromedio: 90.17,
        });
        expect(totales).toEqual({ clientesFrecuentes: 1, totalGastado: 270.5 });
    });

    test('usa "Cliente sin nombre" cuando la fila no trae nombre', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                {
                    clave: '999888777',
                    nombre: null,
                    telefono: '999888777',
                    cantidad_compras: '2',
                    total_gastado: '50.00',
                    primera_compra: '2026-02-01T00:00:00.000Z',
                    ultima_compra: '2026-03-01T00:00:00.000Z',
                },
            ],
        });

        const { clientes } = await obtenerClientesFrecuentes();
        expect(clientes[0].nombre).toBe('Cliente sin nombre');
    });

    test('devuelve lista vacía y totales en cero cuando no hay clientes repetidos', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const { clientes, totales } = await obtenerClientesFrecuentes();

        expect(clientes).toEqual([]);
        expect(totales).toEqual({ clientesFrecuentes: 0, totalGastado: 0 });
    });
});
