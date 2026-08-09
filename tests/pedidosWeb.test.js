jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const pool = require('../src/config/db');
const { registrarPedidoWeb, listarPedidosWeb, actualizarEstadoPedido } = require('../src/services/pedidosWeb');

const configRow = {
    margen_utilidad_defecto_pct: '35.00',
    costo_operativo_mensual: '1500.00',
    unidades_estimadas_mensual: 500,
    porcentaje_impuesto: '0.00',
};

function mockClient() {
    return { query: jest.fn(), release: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('registrarPedidoWeb', () => {
    test('rechaza sin tocar la base de datos si no hay items', async () => {
        await expect(registrarPedidoWeb({ items: [] })).rejects.toThrow(/al menos un producto/);
        expect(pool.query).not.toHaveBeenCalled();
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('rechaza y hace ROLLBACK si el producto no existe o está inactivo', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] });
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // SELECT productos -> no encontrado
            .mockResolvedValueOnce({}); // ROLLBACK
        pool.connect.mockResolvedValueOnce(client);

        await expect(registrarPedidoWeb({ items: [{ productoId: 99, cantidad: 1 }] })).rejects.toThrow(/no encontrado/);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('registra el pedido sin tocar stock, con el PVP calculado en vivo', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] });
        const client = mockClient();
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 1, nombre: 'Resina Compuesta' }] }) // SELECT productos
            .mockResolvedValueOnce({ rows: [{ precio_compra_unitario: '8.50' }] }) // vw_proveedor_optimo
            .mockResolvedValueOnce({ rows: [{ id: 5, cliente: 'Ana', total: '20.88', estado: 'pendiente' }] }) // INSERT pedidos_web
            .mockResolvedValueOnce({}) // INSERT pedido_web_detalle
            .mockResolvedValueOnce({}); // COMMIT
        pool.connect.mockResolvedValueOnce(client);

        const pedido = await registrarPedidoWeb({ items: [{ productoId: 1, cantidad: 1 }], cliente: 'Ana' });

        expect(pedido.items).toEqual([{ productoId: 1, nombre: 'Resina Compuesta', cantidad: 1, precioUnitario: 17.69, subtotal: 17.69 }]);
        const stockUpdateCalls = client.query.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.includes('UPDATE productos'));
        expect(stockUpdateCalls).toHaveLength(0); // a diferencia de registrarVenta, NO toca stock
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.release).toHaveBeenCalled();
    });
});

describe('listarPedidosWeb', () => {
    test('sin filtro no agrega condición de estado', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await listarPedidosWeb({});
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).not.toContain('p.estado =');
        expect(params).toEqual([]);
    });

    test('filtra por estado como parámetro parametrizado', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await listarPedidosWeb({ estado: 'pendiente' });
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toContain('p.estado = $1');
        expect(params).toEqual(['pendiente']);
    });
});

describe('actualizarEstadoPedido', () => {
    test('rechaza un estado inválido sin tocar la base de datos', async () => {
        await expect(actualizarEstadoPedido(1, 'loquesea')).rejects.toThrow(/Estado inválido/);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('acepta cada estado válido', async () => {
        for (const estado of ['pendiente', 'atendido', 'cancelado']) {
            pool.query.mockResolvedValueOnce({ rows: [{ id: 1, estado }] });
            const pedido = await actualizarEstadoPedido(1, estado);
            expect(pedido.estado).toBe(estado);
        }
    });

    test('devuelve null si el pedido no existe', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const pedido = await actualizarEstadoPedido(999, 'atendido');
        expect(pedido).toBeNull();
    });
});
