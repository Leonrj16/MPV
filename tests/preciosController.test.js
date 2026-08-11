jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const pool = require('../src/config/db');
const { actualizarPrecioCompra, marcarProveedorPrincipal, obtenerKpis } = require('../src/controllers/precios.controller');

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

function mockClient() {
    return { query: jest.fn(), release: jest.fn() };
}

const configRow = {
    margen_utilidad_defecto_pct: '35.00',
    costo_operativo_mensual: '1500.00',
    unidades_estimadas_mensual: 500,
    porcentaje_impuesto: '18.00',
};

afterEach(() => jest.clearAllMocks());

describe('actualizarPrecioCompra', () => {
    test('rechaza sin tocar la base de datos si falta precioCompraUnitario', async () => {
        const res = mockRes();
        await actualizarPrecioCompra({ params: { proveedorProductoId: 1 }, body: {} }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza un precio negativo', async () => {
        const res = mockRes();
        await actualizarPrecioCompra({ params: { proveedorProductoId: 1 }, body: { precioCompraUnitario: -5 } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('acepta un precio de 0 (no es "falta", es un valor válido)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 3, precio_compra_unitario: '0.00' }] });
        pool.query.mockResolvedValueOnce({}); // bitacora
        const res = mockRes();

        await actualizarPrecioCompra({ params: { proveedorProductoId: 3 }, body: { precioCompraUnitario: 0 } }, res);

        expect(res.status).not.toHaveBeenCalled();
    });

    test('404 si el registro proveedor-producto no existe', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();

        await actualizarPrecioCompra({ params: { proveedorProductoId: 999 }, body: { precioCompraUnitario: 10 } }, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('marcarProveedorPrincipal', () => {
    test('404 y ROLLBACK si el registro no existe', async () => {
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // SELECT producto_id -> no encontrado
            .mockResolvedValueOnce({}); // ROLLBACK
        pool.connect.mockResolvedValueOnce(client);
        const res = mockRes();

        await marcarProveedorPrincipal({ params: { proveedorProductoId: 999 } }, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('desmarca a los demás proveedores del mismo producto antes de marcar el nuevo (exclusividad)', async () => {
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ producto_id: 5 }] }) // SELECT producto_id
            .mockResolvedValueOnce({}) // UPDATE ... SET es_proveedor_principal = FALSE WHERE producto_id
            .mockResolvedValueOnce({}) // UPDATE ... SET es_proveedor_principal = TRUE WHERE id
            .mockResolvedValueOnce({}); // COMMIT
        pool.connect.mockResolvedValueOnce(client);
        const res = mockRes();

        await marcarProveedorPrincipal({ params: { proveedorProductoId: 12 } }, res);

        const desmarcarCall = client.query.mock.calls.find(([sql]) => sql.includes('FALSE'));
        expect(desmarcarCall[1]).toEqual([5]);
        const marcarCall = client.query.mock.calls.find(([sql]) => sql.includes('TRUE'));
        expect(marcarCall[1]).toEqual([12]);
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(res.json).toHaveBeenCalledWith({ ok: true });
        expect(client.release).toHaveBeenCalled();
    });

    test('ROLLBACK si una de las dos actualizaciones falla', async () => {
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ producto_id: 5 }] })
            .mockRejectedValueOnce(new Error('fallo de conexión'))
            .mockResolvedValueOnce({}); // ROLLBACK
        pool.connect.mockResolvedValueOnce(client);
        const res = mockRes();

        await marcarProveedorPrincipal({ params: { proveedorProductoId: 12 } }, res);

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(res.status).toHaveBeenCalledWith(500);
        expect(client.release).toHaveBeenCalled();
    });
});

describe('obtenerKpis', () => {
    test('calcula el margen promedio real sobre los precios de compra vigentes', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] }) // obtenerConfigActiva
            .mockResolvedValueOnce({ rows: [{ total: 6 }] }) // totalProductos
            .mockResolvedValueOnce({ rows: [{ total: 3 }] }) // proveedoresActivos
            .mockResolvedValueOnce({ rows: [{ precio_compra_unitario: '8.50' }, { precio_compra_unitario: '20.00' }] }) // vw_tablero_precios
            .mockResolvedValueOnce({ rows: [{ total: 1 }] }); // alertas de alza
        const res = mockRes();

        await obtenerKpis({}, res);

        const data = res.json.mock.calls[0][0].data;
        expect(data.totalProductos).toBe(6);
        expect(data.proveedoresActivos).toBe(3);
        expect(data.alertasSubidaPrecio).toBe(1);
        expect(data.margenPromedioPct).toBeGreaterThan(0);
    });

    test('margenPromedioPct es 0 (no NaN/Infinity) cuando el tablero está vacío', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({ rows: [{ total: 0 }] })
            .mockResolvedValueOnce({ rows: [{ total: 0 }] })
            .mockResolvedValueOnce({ rows: [] }) // sin ofertas de proveedor todavía
            .mockResolvedValueOnce({ rows: [{ total: 0 }] });
        const res = mockRes();

        await obtenerKpis({}, res);

        const data = res.json.mock.calls[0][0].data;
        expect(data.margenPromedioPct).toBe(0);
    });
});
