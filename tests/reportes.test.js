jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const pool = require('../src/config/db');
const {
    obtenerInventarioValorizado,
    obtenerClientesFrecuentes,
    generarCuponFidelidad,
    obtenerRentabilidadMensual,
    obtenerProductosBajaRotacion,
} = require('../src/services/reportes');

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

    test('con menos de 5 compras no hay nivel de fidelización ni se consulta cupones', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ clave: '111', nombre: 'Ana', telefono: '111', cantidad_compras: '3', total_gastado: '30', primera_compra: '2026-01-01', ultima_compra: '2026-02-01' }],
        });

        const { clientes } = await obtenerClientesFrecuentes();

        expect(clientes[0].nivelFidelizacion).toBe(0);
        expect(clientes[0].codigoCuponFidelidad).toBeNull();
        expect(clientes[0].cuponFidelidadDisponible).toBe(false);
        expect(pool.query).toHaveBeenCalledTimes(1); // no se consulta cupones si nadie califica
    });

    test('con 5 compras y sin cupón previo, el cupón de fidelidad está disponible', async () => {
        pool.query
            .mockResolvedValueOnce({
                rows: [{ clave: '51999333444', nombre: 'Lucía', telefono: '51999333444', cantidad_compras: '5', total_gastado: '150', primera_compra: '2026-01-01', ultima_compra: '2026-02-01' }],
            })
            .mockResolvedValueOnce({ rows: [] }); // no hay cupones ya generados

        const { clientes } = await obtenerClientesFrecuentes();

        expect(clientes[0].nivelFidelizacion).toBe(5);
        expect(clientes[0].codigoCuponFidelidad).toBe('FIEL-519993-5');
        expect(clientes[0].cuponFidelidadDisponible).toBe(true);
    });

    test('con 7 compras el nivel sigue siendo 5 (el próximo nivel es a las 10)', async () => {
        pool.query
            .mockResolvedValueOnce({
                rows: [{ clave: '51999333444', nombre: 'Lucía', telefono: '51999333444', cantidad_compras: '7', total_gastado: '150', primera_compra: '2026-01-01', ultima_compra: '2026-02-01' }],
            })
            .mockResolvedValueOnce({ rows: [] });

        const { clientes } = await obtenerClientesFrecuentes();
        expect(clientes[0].nivelFidelizacion).toBe(5);
    });

    test('si ya existe un cupón con ese código, no aparece como disponible', async () => {
        pool.query
            .mockResolvedValueOnce({
                rows: [{ clave: '51999333444', nombre: 'Lucía', telefono: '51999333444', cantidad_compras: '5', total_gastado: '150', primera_compra: '2026-01-01', ultima_compra: '2026-02-01' }],
            })
            .mockResolvedValueOnce({ rows: [{ codigo: 'FIEL-519993-5' }] });

        const { clientes } = await obtenerClientesFrecuentes();
        expect(clientes[0].cuponFidelidadDisponible).toBe(false);
    });
});

describe('generarCuponFidelidad', () => {
    test('rechaza si el cliente no existe entre los clientes frecuentes', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await expect(generarCuponFidelidad('no-existe')).rejects.toThrow('Cliente no encontrado');
    });

    test('rechaza si el cliente todavía no llega al umbral', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ clave: '111', nombre: 'Ana', telefono: '111', cantidad_compras: '3', total_gastado: '30', primera_compra: '2026-01-01', ultima_compra: '2026-02-01' }],
        });
        await expect(generarCuponFidelidad('111')).rejects.toThrow('todavía no llega');
    });

    test('rechaza si el cupón de este nivel ya fue generado', async () => {
        pool.query
            .mockResolvedValueOnce({
                rows: [{ clave: '111', nombre: 'Ana', telefono: '111', cantidad_compras: '5', total_gastado: '150', primera_compra: '2026-01-01', ultima_compra: '2026-02-01' }],
            })
            .mockResolvedValueOnce({ rows: [{ codigo: 'FIEL-111XXX-5' }] });
        await expect(generarCuponFidelidad('111')).rejects.toThrow('Ya se generó');
    });

    test('crea el cupón con los valores esperados cuando el cliente califica', async () => {
        pool.query
            .mockResolvedValueOnce({
                rows: [{ clave: '51999333444', nombre: 'Lucía', telefono: '51999333444', cantidad_compras: '5', total_gastado: '150', primera_compra: '2026-01-01', ultima_compra: '2026-02-01' }],
            })
            .mockResolvedValueOnce({ rows: [] }) // sin cupón previo
            .mockResolvedValueOnce({ rows: [{ id: 1, codigo: 'FIEL-519993-5', tipo: 'monto_fijo', valor: '10.00' }] }); // INSERT

        const { cupon, cliente } = await generarCuponFidelidad('51999333444');

        expect(cupon.codigo).toBe('FIEL-519993-5');
        expect(cliente.nivelFidelizacion).toBe(5);
        const insertCall = pool.query.mock.calls[2];
        expect(insertCall[0]).toMatch(/INSERT INTO cupones/);
        expect(insertCall[1][0]).toBe('FIEL-519993-5');
    });

    test('traduce una violación de unicidad concurrente en un mensaje claro', async () => {
        pool.query
            .mockResolvedValueOnce({
                rows: [{ clave: '51999333444', nombre: 'Lucía', telefono: '51999333444', cantidad_compras: '5', total_gastado: '150', primera_compra: '2026-01-01', ultima_compra: '2026-02-01' }],
            })
            .mockResolvedValueOnce({ rows: [] })
            .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));

        await expect(generarCuponFidelidad('51999333444')).rejects.toThrow('Ya se generó');
    });
});

describe('obtenerRentabilidadMensual', () => {
    test('calcula margen por mes y por categoría a partir de ingresos y costo estimado', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { mes: '2026-06', categoria: 'Resinas', ingresos: '100.00', costo_estimado: '60.00' },
                { mes: '2026-06', categoria: 'Bioseguridad', ingresos: '50.00', costo_estimado: '10.00' },
                { mes: '2026-07', categoria: 'Resinas', ingresos: '200.00', costo_estimado: '120.00' },
            ],
        });

        const { totalesPorMes, porCategoria } = await obtenerRentabilidadMensual({ meses: 2 });

        expect(totalesPorMes).toEqual([
            { mes: '2026-06', ingresos: 150, costoEstimado: 70, margen: 80, margenPct: 53.3 },
            { mes: '2026-07', ingresos: 200, costoEstimado: 120, margen: 80, margenPct: 40 },
        ]);

        const resinas = porCategoria.find((c) => c.categoria === 'Resinas');
        expect(resinas).toEqual({ categoria: 'Resinas', ingresos: 300, costoEstimado: 180, margen: 120, margenPct: 40 });
        // ordenado por margen descendente
        expect(porCategoria[0].categoria).toBe('Resinas');
    });

    test('sin ventas en el período devuelve listas vacías', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const { totalesPorMes, porCategoria } = await obtenerRentabilidadMensual();
        expect(totalesPorMes).toEqual([]);
        expect(porCategoria).toEqual([]);
    });

    test('pasa la cantidad de meses solicitada a la consulta', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await obtenerRentabilidadMensual({ meses: 12 });
        expect(pool.query.mock.calls[0][1]).toEqual([12]);
    });
});

describe('obtenerProductosBajaRotacion', () => {
    test('calcula el valor inmovilizado usando el precio de compra del proveedor óptimo', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { id: 1, sku: 'RES-001', nombre: 'Resina', stock_actual: 20, categoria: 'Resinas', unidades_vendidas_periodo: '0', ultima_venta: null, precio_compra_unitario: '8.50' },
            ],
        });

        const { productos, totales } = await obtenerProductosBajaRotacion({ dias: 90 });

        expect(productos[0]).toMatchObject({ sku: 'RES-001', stock: 20, sinPrecio: false, valorInmovilizado: 170 });
        expect(totales).toEqual({ cantidadProductos: 1, valorInmovilizado: 170 });
    });

    test('producto sin proveedor activo se incluye con valorInmovilizado 0 y sinPrecio true', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 2, sku: 'HIL-500', nombre: 'Hilo', stock_actual: 5, categoria: 'Bioseguridad', unidades_vendidas_periodo: '1', ultima_venta: '2026-05-01', precio_compra_unitario: null }],
        });

        const { productos } = await obtenerProductosBajaRotacion();
        expect(productos[0]).toMatchObject({ sinPrecio: true, valorInmovilizado: 0 });
    });

    test('pasa días y umbral de unidades a la consulta', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await obtenerProductosBajaRotacion({ dias: 60, umbralUnidades: 0 });
        expect(pool.query.mock.calls[0][1]).toEqual([60, 0]);
    });
});
