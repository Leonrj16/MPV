jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const pool = require('../src/config/db');
const { registrarVenta, listarProductosDisponibles, listarVentas, obtenerVentaPorId, obtenerKpisVentas, obtenerTendenciaVentas } = require('../src/services/ventas');

const configRow = {
    margen_utilidad_defecto_pct: '35.00',
    costo_operativo_mensual: '1500.00',
    unidades_estimadas_mensual: 500,
    porcentaje_impuesto: '18.00',
};

function mockClient() {
    return { query: jest.fn(), release: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('registrarVenta', () => {
    test('rechaza sin tocar la base de datos si no hay items', async () => {
        await expect(registrarVenta({ items: [] })).rejects.toThrow(/al menos un producto/);
        expect(pool.query).not.toHaveBeenCalled();
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('rechaza una cantidad no entera o menor a 1 y hace ROLLBACK', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] }); // obtenerConfigActiva
        pool.query.mockResolvedValueOnce({ rows: [] }); // obtenerCajaAbierta -> sin caja abierta
        const client = mockClient();
        client.query.mockResolvedValueOnce({}); // BEGIN
        client.query.mockResolvedValueOnce({}); // ROLLBACK
        pool.connect.mockResolvedValueOnce(client);

        await expect(registrarVenta({ items: [{ productoId: 1, cantidad: 0 }] })).rejects.toThrow(/cantidad debe ser un número entero/);

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
    });

    test('rechaza y hace ROLLBACK si el producto no existe', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] });
        pool.query.mockResolvedValueOnce({ rows: [] }); // obtenerCajaAbierta
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // SELECT ... FOR UPDATE -> no encontrado
            .mockResolvedValueOnce({}); // ROLLBACK
        pool.connect.mockResolvedValueOnce(client);

        await expect(registrarVenta({ items: [{ productoId: 99, cantidad: 1 }] })).rejects.toThrow(/no encontrado/);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('rechaza y hace ROLLBACK si el stock es insuficiente, sin descontar nada', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] });
        pool.query.mockResolvedValueOnce({ rows: [] }); // obtenerCajaAbierta
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 5, nombre: 'Kit Brackets', stock_actual: 8 }] }) // FOR UPDATE
            .mockResolvedValueOnce({}); // ROLLBACK
        pool.connect.mockResolvedValueOnce(client);

        await expect(registrarVenta({ items: [{ productoId: 5, cantidad: 999 }] }))
            .rejects.toThrow(/Stock insuficiente.*disponible 8, solicitado 999/);

        const updateCalls = client.query.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.includes('UPDATE productos'));
        expect(updateCalls).toHaveLength(0);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('rechaza y hace ROLLBACK si el producto no tiene proveedor activo (sin PVP posible)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] });
        pool.query.mockResolvedValueOnce({ rows: [] }); // obtenerCajaAbierta
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 6, nombre: 'Hilo de Sutura', stock_actual: 5 }] }) // FOR UPDATE
            .mockResolvedValueOnce({ rows: [] }) // vw_proveedor_optimo -> vacío
            .mockResolvedValueOnce({}); // ROLLBACK
        pool.connect.mockResolvedValueOnce(client);

        await expect(registrarVenta({ items: [{ productoId: 6, cantidad: 1 }] }))
            .rejects.toThrow(/no tiene un proveedor activo/);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('registra la venta, descuenta stock y calcula el total con el motor de precios', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] });
        pool.query.mockResolvedValueOnce({ rows: [] }); // obtenerCajaAbierta -> sin caja abierta
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 1, nombre: 'Resina Compuesta', stock_actual: 40 }] }) // FOR UPDATE
            .mockResolvedValueOnce({ rows: [{ precio_compra_unitario: '8.50' }] }) // vw_proveedor_optimo
            .mockResolvedValueOnce({}) // UPDATE stock
            .mockResolvedValueOnce({ rows: [{ id: 1, total: '44.30', cliente: null, metodo_pago: 'efectivo' }] }) // INSERT ventas
            .mockResolvedValueOnce({}) // INSERT venta_pagos
            .mockResolvedValueOnce({}) // INSERT venta_detalle
            .mockResolvedValueOnce({}) // INSERT movimientos_stock
            .mockResolvedValueOnce({}); // COMMIT
        pool.connect.mockResolvedValueOnce(client);

        const venta = await registrarVenta({ items: [{ productoId: 1, cantidad: 2 }] });

        expect(venta.items).toHaveLength(1);
        expect(venta.items[0]).toMatchObject({ productoId: 1, cantidad: 2, precioUnitario: 20.88, subtotal: 41.76 });
        expect(venta.pagos).toEqual([{ metodoPago: 'efectivo', monto: 41.76 }]);

        const updateCall = client.query.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('UPDATE productos'));
        expect(updateCall[1]).toEqual([2, 1]); // descuenta exactamente la cantidad vendida

        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.query).not.toHaveBeenCalledWith('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
    });

    test('asocia la venta a la caja abierta cuando hay una sesión en curso', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] });
        pool.query.mockResolvedValueOnce({ rows: [{ id: 7, usuario_apertura_id: 1, monto_apertura: '100.00' }] }); // obtenerCajaAbierta
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 1, nombre: 'Resina Compuesta', stock_actual: 40 }] }) // FOR UPDATE
            .mockResolvedValueOnce({ rows: [{ precio_compra_unitario: '8.50' }] }) // vw_proveedor_optimo
            .mockResolvedValueOnce({}) // UPDATE stock
            .mockResolvedValueOnce({ rows: [{ id: 2, total: '20.88', cliente: null, metodo_pago: 'efectivo', caja_sesion_id: 7 }] }) // INSERT ventas
            .mockResolvedValueOnce({}) // INSERT venta_pagos
            .mockResolvedValueOnce({}) // INSERT venta_detalle
            .mockResolvedValueOnce({}) // INSERT movimientos_stock
            .mockResolvedValueOnce({}); // COMMIT
        pool.connect.mockResolvedValueOnce(client);

        await registrarVenta({ items: [{ productoId: 1, cantidad: 1 }] });

        const insertVentaCall = client.query.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO ventas'));
        expect(insertVentaCall[1]).toEqual([null, null, 'efectivo', 20.88, 7]);
    });

    describe('pago dividido', () => {
        test('rechaza y hace ROLLBACK si la suma de los pagos no cierra con el total', async () => {
            pool.query.mockResolvedValueOnce({ rows: [configRow] });
            pool.query.mockResolvedValueOnce({ rows: [] }); // obtenerCajaAbierta
            const client = mockClient();
            client.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [{ id: 1, nombre: 'Resina Compuesta', stock_actual: 40 }] }) // FOR UPDATE
                .mockResolvedValueOnce({ rows: [{ precio_compra_unitario: '8.50' }] }) // vw_proveedor_optimo
                .mockResolvedValueOnce({}) // UPDATE stock
                .mockResolvedValueOnce({}); // ROLLBACK
            pool.connect.mockResolvedValueOnce(client);

            // total real = 20.88, pero los pagos suman 20.00
            await expect(registrarVenta({
                items: [{ productoId: 1, cantidad: 1 }],
                pagos: [{ metodoPago: 'efectivo', monto: 20 }],
            })).rejects.toThrow(/Los pagos suman S\/ 20\.00 pero el total.*S\/ 20\.88/);

            expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        });

        test('rechaza un método de pago desconocido en alguna de las líneas', async () => {
            pool.query.mockResolvedValueOnce({ rows: [configRow] });
            pool.query.mockResolvedValueOnce({ rows: [] });
            const client = mockClient();
            client.query
                .mockResolvedValueOnce({})
                .mockResolvedValueOnce({ rows: [{ id: 1, nombre: 'Resina Compuesta', stock_actual: 40 }] })
                .mockResolvedValueOnce({ rows: [{ precio_compra_unitario: '8.50' }] })
                .mockResolvedValueOnce({})
                .mockResolvedValueOnce({}); // ROLLBACK
            pool.connect.mockResolvedValueOnce(client);

            await expect(registrarVenta({
                items: [{ productoId: 1, cantidad: 1 }],
                pagos: [{ metodoPago: 'bitcoin', monto: 20.88 }],
            })).rejects.toThrow(/Método de pago inválido/);
        });

        test('registra las líneas de venta_pagos y marca la venta como "mixto" con más de un método', async () => {
            pool.query.mockResolvedValueOnce({ rows: [configRow] });
            pool.query.mockResolvedValueOnce({ rows: [] }); // obtenerCajaAbierta
            const client = mockClient();
            client.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [{ id: 1, nombre: 'Resina Compuesta', stock_actual: 40 }] }) // FOR UPDATE
                .mockResolvedValueOnce({ rows: [{ precio_compra_unitario: '8.50' }] }) // vw_proveedor_optimo
                .mockResolvedValueOnce({}) // UPDATE stock
                .mockResolvedValueOnce({ rows: [{ id: 3, total: '20.88', metodo_pago: 'mixto' }] }) // INSERT ventas
                .mockResolvedValueOnce({}) // INSERT venta_pagos (efectivo)
                .mockResolvedValueOnce({}) // INSERT venta_pagos (tarjeta)
                .mockResolvedValueOnce({}) // INSERT venta_detalle
                .mockResolvedValueOnce({}) // INSERT movimientos_stock
                .mockResolvedValueOnce({}); // COMMIT
            pool.connect.mockResolvedValueOnce(client);

            const venta = await registrarVenta({
                items: [{ productoId: 1, cantidad: 1 }],
                pagos: [{ metodoPago: 'efectivo', monto: 10.88 }, { metodoPago: 'tarjeta', monto: 10 }],
            });

            const insertVentaCall = client.query.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO ventas'));
            expect(insertVentaCall[1]).toEqual([null, null, 'mixto', 20.88, null]);

            const insertPagosCalls = client.query.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO venta_pagos'));
            expect(insertPagosCalls).toHaveLength(2);
            expect(insertPagosCalls[0][1]).toEqual([3, 'efectivo', 10.88]);
            expect(insertPagosCalls[1][1]).toEqual([3, 'tarjeta', 10]);

            expect(venta.pagos).toEqual([{ metodoPago: 'efectivo', monto: 10.88 }, { metodoPago: 'tarjeta', monto: 10 }]);
        });
    });
});

describe('listarProductosDisponibles', () => {
    test('marca vendible:false y pvpSugerido:null cuando no hay proveedor óptimo', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({
                rows: [
                    { id: 1, sku: 'RES-001', nombre: 'Resina', unidad_medida: 'jeringa', stock_actual: 40, codigo_barras: '7501234567890', categoria_nombre: 'Resinas', precio_compra_unitario: '8.50' },
                    { id: 6, sku: 'HIL-500', nombre: 'Hilo', unidad_medida: 'caja', stock_actual: 0, codigo_barras: null, categoria_nombre: 'Bioseguridad', precio_compra_unitario: null },
                ],
            });

        const productos = await listarProductosDisponibles();

        expect(productos[0]).toMatchObject({ id: 1, vendible: true, pvpSugerido: 20.88, codigoBarras: '7501234567890' });
        expect(productos[1]).toMatchObject({ id: 6, vendible: false, pvpSugerido: null, codigoBarras: null });
    });
});

describe('listarVentas', () => {
    test('pasa el límite y el offset de la página como parámetros parametrizados', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await listarVentas({ limite: 5, pagina: 3 });
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toContain('LIMIT $1');
        expect(sql).toContain('OFFSET $2');
        expect(params).toEqual([5, 10]); // offset = (pagina-1) * limite = (3-1)*5
    });

    test('sin filtros no agrega cláusula WHERE de filtro', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await listarVentas({});
        const [sql] = pool.query.mock.calls[0];
        // El único "WHERE" legítimo sin filtros es el de FILTER (WHERE vd.id IS NOT NULL)
        // del agregado JSON; "WHERE v." es exclusivo de los filtros dinámicos.
        expect(sql).not.toContain('WHERE v.');
    });

    test('arma los filtros de fecha/cliente/método de pago como consulta parametrizada', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await listarVentas({ desde: '2026-08-01', hasta: '2026-08-09', cliente: "'; DROP TABLE ventas; --", metodoPago: 'efectivo', limite: 20 });
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toContain('v.created_at >= $1');
        expect(sql).toContain('v.created_at < ($2::date');
        expect(sql).toContain('v.cliente ILIKE $3');
        expect(sql).toContain('v.metodo_pago = $4');
        expect(sql).toContain('LIMIT $5');
        expect(sql).toContain('OFFSET $6');
        expect(sql).not.toContain('DROP TABLE'); // el valor peligroso va como parámetro, no en el texto del SQL
        expect(params).toEqual(['2026-08-01', '2026-08-09', "%'; DROP TABLE ventas; --%", 'efectivo', 20, 0]);
    });

    test('devuelve el total real de filas (no el tamaño de la página) usando COUNT(*) OVER()', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { id: 2, total_count: '7' },
                { id: 1, total_count: '7' },
            ],
        });
        const { ventas, total } = await listarVentas({ limite: 2 });
        expect(total).toBe(7);
        expect(ventas).toEqual([{ id: 2 }, { id: 1 }]); // total_count no viaja en cada fila
    });

    test('sin resultados, el total es 0', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const { ventas, total } = await listarVentas({});
        expect(ventas).toEqual([]);
        expect(total).toBe(0);
    });
});

describe('obtenerKpisVentas', () => {
    test('mapea el resumen y el top de productos a camelCase con números, no strings', async () => {
        pool.query
            .mockResolvedValueOnce({
                rows: [{ ingresos_hoy: '150.50', ingresos_semana: '820.00', ingresos_mes: '3400.75', ventas_hoy: '4' }],
            })
            .mockResolvedValueOnce({
                rows: [{ nombre: 'Resina Compuesta', sku: 'RES-001', cantidad_vendida: '12', ingreso_total: '224.40' }],
            });

        const kpis = await obtenerKpisVentas();

        expect(kpis).toEqual({
            ingresosHoy: 150.5,
            ingresosSemana: 820,
            ingresosMes: 3400.75,
            ventasHoy: 4,
            topProductos: [{ nombre: 'Resina Compuesta', sku: 'RES-001', cantidadVendida: 12, ingresoTotal: 224.4 }],
        });
    });
});

describe('obtenerTendenciaVentas', () => {
    test('mapea la serie diaria a camelCase con números', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { fecha: new Date('2026-08-08T00:00:00'), ingresos: '0', cantidad_ventas: '0' },
                { fecha: new Date('2026-08-09T00:00:00'), ingresos: '150.50', cantidad_ventas: '3' },
            ],
        });

        const tendencia = await obtenerTendenciaVentas({ dias: 2 });

        expect(tendencia).toEqual([
            { fecha: '2026-08-08', ingresos: 0, cantidadVentas: 0 },
            { fecha: '2026-08-09', ingresos: 150.5, cantidadVentas: 3 },
        ]);
        const [, params] = pool.query.mock.calls[0];
        expect(params).toEqual([2]);
    });

    test('usa 30 días por defecto si el parámetro no es un entero válido', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await obtenerTendenciaVentas({ dias: 'x' });
        const [, params] = pool.query.mock.calls[0];
        expect(params).toEqual([30]);
    });
});

describe('obtenerVentaPorId', () => {
    test('devuelve null si la venta no existe (para que el controller responda 404)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const venta = await obtenerVentaPorId(999);
        expect(venta).toBeNull();
    });

    test('devuelve la venta con sus items cuando existe', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 3, total: '61.08', cliente: 'Paciente', metodo_pago: 'efectivo', items: [{ producto: 'Resina', cantidad: 2 }] }],
        });
        const venta = await obtenerVentaPorId(3);
        expect(venta.id).toBe(3);
        expect(venta.items).toHaveLength(1);
    });
});
