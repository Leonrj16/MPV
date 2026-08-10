jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const pool = require('../src/config/db');
const { listarMovimientos, ajustarStock } = require('../src/services/movimientosStock');

function mockClient() {
    return { query: jest.fn(), release: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('listarMovimientos', () => {
    test('consulta por producto con el límite indicado', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
        const movimientos = await listarMovimientos(4, { limite: 10 });
        expect(movimientos).toHaveLength(1);
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toContain('WHERE m.producto_id = $1');
        expect(params).toEqual([4, 10]);
    });
});

describe('ajustarStock', () => {
    test('rechaza sin tocar la base de datos si el delta es 0', async () => {
        await expect(ajustarStock({ productoId: 1, delta: 0, motivo: 'conteo' })).rejects.toThrow(/distinto de 0/);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('rechaza sin motivo', async () => {
        await expect(ajustarStock({ productoId: 1, delta: 5, motivo: '  ' })).rejects.toThrow(/requiere un motivo/);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('rechaza y hace ROLLBACK si el ajuste deja el stock en negativo', async () => {
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 1, nombre: 'Resina', stock_actual: 3 }] }) // FOR UPDATE
            .mockResolvedValueOnce({}); // ROLLBACK
        pool.connect.mockResolvedValueOnce(client);

        await expect(ajustarStock({ productoId: 1, delta: -10, motivo: 'merma' })).rejects.toThrow(/negativo/);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('aplica el ajuste, actualiza el stock y registra el movimiento', async () => {
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 1, nombre: 'Resina', stock_actual: 20 }] }) // FOR UPDATE
            .mockResolvedValueOnce({}) // UPDATE productos
            .mockResolvedValueOnce({ rows: [{ id: 9, producto_id: 1, cantidad_delta: 5, stock_resultante: 25 }] }) // INSERT movimientos_stock
            .mockResolvedValueOnce({}); // COMMIT
        pool.connect.mockResolvedValueOnce(client);

        const movimiento = await ajustarStock({ productoId: 1, delta: 5, motivo: 'Conteo físico', usuarioId: 2 });

        expect(movimiento.stock_resultante).toBe(25);
        const updateCall = client.query.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('UPDATE productos'));
        expect(updateCall[1]).toEqual([25, 1]);
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.release).toHaveBeenCalled();
    });
});
