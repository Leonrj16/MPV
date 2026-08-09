jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const pool = require('../src/config/db');
const { registrarVenta, listarProductosDisponibles, listarVentas } = require('../src/services/ventas');

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
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 1, nombre: 'Resina Compuesta', stock_actual: 40 }] }) // FOR UPDATE
            .mockResolvedValueOnce({ rows: [{ precio_compra_unitario: '8.50' }] }) // vw_proveedor_optimo
            .mockResolvedValueOnce({}) // UPDATE stock
            .mockResolvedValueOnce({ rows: [{ id: 1, total: '44.30', cliente: null, metodo_pago: 'efectivo' }] }) // INSERT ventas
            .mockResolvedValueOnce({}) // INSERT venta_detalle
            .mockResolvedValueOnce({}); // COMMIT
        pool.connect.mockResolvedValueOnce(client);

        const venta = await registrarVenta({ items: [{ productoId: 1, cantidad: 2 }] });

        expect(venta.items).toHaveLength(1);
        expect(venta.items[0]).toMatchObject({ productoId: 1, cantidad: 2, precioUnitario: 20.88, subtotal: 41.76 });

        const updateCall = client.query.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('UPDATE productos'));
        expect(updateCall[1]).toEqual([2, 1]); // descuenta exactamente la cantidad vendida

        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.query).not.toHaveBeenCalledWith('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
    });
});

describe('listarProductosDisponibles', () => {
    test('marca vendible:false y pvpSugerido:null cuando no hay proveedor óptimo', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({
                rows: [
                    { id: 1, sku: 'RES-001', nombre: 'Resina', unidad_medida: 'jeringa', stock_actual: 40, categoria_nombre: 'Resinas', precio_compra_unitario: '8.50' },
                    { id: 6, sku: 'HIL-500', nombre: 'Hilo', unidad_medida: 'caja', stock_actual: 0, categoria_nombre: 'Bioseguridad', precio_compra_unitario: null },
                ],
            });

        const productos = await listarProductosDisponibles();

        expect(productos[0]).toMatchObject({ id: 1, vendible: true, pvpSugerido: 20.88 });
        expect(productos[1]).toMatchObject({ id: 6, vendible: false, pvpSugerido: null });
    });
});

describe('listarVentas', () => {
    test('pasa el límite como parámetro parametrizado', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await listarVentas({ limite: 5 });
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toContain('LIMIT $1');
        expect(params).toEqual([5]);
    });
});
