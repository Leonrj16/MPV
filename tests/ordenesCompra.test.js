jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const pool = require('../src/config/db');
const {
    sugerirOrdenesCompra,
    crearOrdenCompra,
    listarOrdenesCompra,
    obtenerOrdenCompra,
    actualizarEstadoOrdenCompra,
} = require('../src/services/ordenesCompra');

function mockClient() {
    return { query: jest.fn(), release: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('sugerirOrdenesCompra', () => {
    test('agrupa productos con stock bajo por proveedor óptimo y calcula cantidad sugerida', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { producto_id: 1, nombre: 'Resina', sku: 'RES-001', stock_actual: 2, stock_minimo: 5, proveedor_id: 10, proveedor_nombre: 'BioDent', precio_compra_unitario: '8.50' },
                { producto_id: 2, nombre: 'Guantes', sku: 'GUA-100', stock_actual: 3, stock_minimo: 10, proveedor_id: 10, proveedor_nombre: 'BioDent', precio_compra_unitario: '0.50' },
                { producto_id: 3, nombre: 'Hilo', sku: 'HIL-500', stock_actual: 1, stock_minimo: 4, proveedor_id: 20, proveedor_nombre: 'OrthoMax', precio_compra_unitario: '2.00' },
            ],
        });

        const grupos = await sugerirOrdenesCompra();

        expect(grupos).toHaveLength(2);
        const bioDent = grupos.find((g) => g.proveedorId === 10);
        expect(bioDent.items).toHaveLength(2);
        // stock_minimo*2 - stock_actual = 5*2-2 = 8
        expect(bioDent.items[0]).toMatchObject({ productoId: 1, cantidadSugerida: 8, subtotal: 68 });
        // 10*2-3 = 17
        expect(bioDent.items[1]).toMatchObject({ productoId: 2, cantidadSugerida: 17, subtotal: 8.5 });
        expect(bioDent.total).toBe(76.5);

        const orthoMax = grupos.find((g) => g.proveedorId === 20);
        expect(orthoMax.items[0]).toMatchObject({ cantidadSugerida: 7, subtotal: 14 });
    });

    test('devuelve lista vacía si no hay productos con stock bajo', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const grupos = await sugerirOrdenesCompra();
        expect(grupos).toEqual([]);
    });
});

describe('crearOrdenCompra', () => {
    test('rechaza sin proveedorId', async () => {
        await expect(crearOrdenCompra({ items: [{ productoId: 1, cantidad: 1, precioCompraUnitario: 1 }] }))
            .rejects.toThrow('proveedorId');
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('rechaza sin items', async () => {
        await expect(crearOrdenCompra({ proveedorId: 1, items: [] })).rejects.toThrow('al menos un producto');
    });

    test('rechaza cantidad no entera', async () => {
        await expect(
            crearOrdenCompra({ proveedorId: 1, items: [{ productoId: 1, cantidad: 0, precioCompraUnitario: 5 }] })
        ).rejects.toThrow('cantidad entera mayor a 0');
    });

    test('crea la orden y sus items dentro de una transacción, calculando el total', async () => {
        const client = mockClient();
        pool.connect.mockResolvedValue(client);
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 5, proveedor_id: 10, total: '90.00', estado: 'borrador' }] }) // insert orden
            .mockResolvedValueOnce({}) // insert item 1
            .mockResolvedValueOnce({}) // insert item 2
            .mockResolvedValueOnce({}); // COMMIT

        const orden = await crearOrdenCompra({
            proveedorId: 10,
            items: [
                { productoId: 1, cantidad: 8, precioCompraUnitario: 8.5 },
                { productoId: 2, cantidad: 17, precioCompraUnitario: 0.5 },
            ],
            usuarioId: 1,
        });

        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(orden.id).toBe(5);
        const insertOrdenCall = client.query.mock.calls[1];
        expect(insertOrdenCall[1][1]).toBe(76.5); // total = 8*8.5 + 17*0.5
        expect(client.release).toHaveBeenCalled();
    });

    test('hace rollback si falla la inserción de un item', async () => {
        const client = mockClient();
        pool.connect.mockResolvedValue(client);
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // insert orden
            .mockRejectedValueOnce(new Error('fk violation')); // insert item falla

        await expect(
            crearOrdenCompra({ proveedorId: 10, items: [{ productoId: 999, cantidad: 1, precioCompraUnitario: 1 }] })
        ).rejects.toThrow('fk violation');

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });
});

describe('listarOrdenesCompra', () => {
    test('filtra por estado cuando se pasa', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await listarOrdenesCompra({ estado: 'borrador' });
        expect(pool.query.mock.calls[0][0]).toMatch(/oc\.estado = \$1/);
        expect(pool.query.mock.calls[0][1]).toEqual(['borrador']);
    });

    test('sin filtro no agrega WHERE', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await listarOrdenesCompra();
        expect(pool.query.mock.calls[0][0]).not.toMatch(/WHERE/);
    });
});

describe('obtenerOrdenCompra', () => {
    test('devuelve null si no existe', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const orden = await obtenerOrdenCompra(999);
        expect(orden).toBeNull();
    });

    test('trae la orden con sus items', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 5, proveedor_nombre: 'BioDent' }] })
            .mockResolvedValueOnce({ rows: [{ id: 1, producto_nombre: 'Resina', cantidad: 8 }] });

        const orden = await obtenerOrdenCompra(5);
        expect(orden.proveedor_nombre).toBe('BioDent');
        expect(orden.items).toHaveLength(1);
    });
});

describe('actualizarEstadoOrdenCompra', () => {
    test('rechaza una transición inválida (borrador -> recibida directo)', async () => {
        const client = mockClient();
        pool.connect.mockResolvedValue(client);
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 5, estado: 'borrador' }] }); // SELECT FOR UPDATE

        await expect(actualizarEstadoOrdenCompra(5, 'recibida', 1)).rejects.toThrow('No se puede pasar');
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('404 si la orden no existe', async () => {
        const client = mockClient();
        pool.connect.mockResolvedValue(client);
        client.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] });

        await expect(actualizarEstadoOrdenCompra(999, 'enviada', 1)).rejects.toThrow('no encontrada');
    });

    test('al pasar a "recibida" suma el stock de cada item y registra el movimiento', async () => {
        const client = mockClient();
        pool.connect.mockResolvedValue(client);
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 5, estado: 'enviada' }] }) // SELECT FOR UPDATE orden
            .mockResolvedValueOnce({}) // UPDATE estado
            .mockResolvedValueOnce({ rows: [{ producto_id: 1, cantidad: 8 }] }) // items
            .mockResolvedValueOnce({ rows: [{ stock_actual: 2 }] }) // SELECT producto FOR UPDATE
            .mockResolvedValueOnce({}) // UPDATE stock
            .mockResolvedValueOnce({}) // INSERT movimiento
            .mockResolvedValueOnce({}); // COMMIT

        const orden = await actualizarEstadoOrdenCompra(5, 'recibida', 1);

        expect(orden.estado).toBe('recibida');
        const updateStockCall = client.query.mock.calls.find((c) => c[0].includes('UPDATE productos'));
        expect(updateStockCall[1]).toEqual([10, 1]); // 2 + 8 = 10
        const insertMovCall = client.query.mock.calls.find((c) => c[0].includes('INSERT INTO movimientos_stock'));
        expect(insertMovCall[1]).toEqual([1, 8, 10, 1, 'Recepción de orden de compra #5', 5]);
    });
});
