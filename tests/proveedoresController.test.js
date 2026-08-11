jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const pool = require('../src/config/db');
const { listarProveedores, crearProveedor, actualizarProveedor } = require('../src/controllers/proveedores.controller');

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

afterEach(() => jest.clearAllMocks());

describe('listarProveedores', () => {
    test('incluye tiempo_entrega_promedio junto con productos_count por proveedor', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { id: 1, nombre: 'Dental Supply SAC', calificacion: 5, productos_count: '3', tiempo_entrega_promedio: '4.0' },
                { id: 2, nombre: 'Sin productos activos', calificacion: 3, productos_count: '0', tiempo_entrega_promedio: null },
            ],
        });
        const res = mockRes();

        await listarProveedores({}, res);

        expect(pool.query.mock.calls[0][0]).toMatch(/tiempo_entrega_promedio/);
        expect(res.json).toHaveBeenCalledWith({
            ok: true,
            data: [
                { id: 1, nombre: 'Dental Supply SAC', calificacion: 5, productos_count: '3', tiempo_entrega_promedio: '4.0' },
                { id: 2, nombre: 'Sin productos activos', calificacion: 3, productos_count: '0', tiempo_entrega_promedio: null },
            ],
        });
    });

    test('responde 500 si la consulta falla', async () => {
        pool.query.mockRejectedValueOnce(new Error('db caída'));
        const res = mockRes();

        await listarProveedores({}, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('crearProveedor', () => {
    test('rechaza sin tocar la base de datos si falta nombre', async () => {
        const res = mockRes();

        await crearProveedor({ body: {} }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('crea el proveedor y registra el evento en bitácora', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 9, nombre: 'Nuevo Proveedor' }] });
        pool.query.mockResolvedValueOnce({}); // bitacora
        const res = mockRes();

        await crearProveedor({ body: { nombre: 'Nuevo Proveedor' }, user: { sub: 1, nombre: 'Admin' } }, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(pool.query).toHaveBeenCalledTimes(2);
    });
});

describe('actualizarProveedor', () => {
    test('404 si el proveedor no existe', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();

        await actualizarProveedor({ params: { id: 999 }, body: {} }, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('permite actualizar la calificación', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, nombre: 'Dental Supply SAC', calificacion: 4 }] });
        pool.query.mockResolvedValueOnce({}); // bitacora
        const res = mockRes();

        await actualizarProveedor({ params: { id: '1' }, body: { calificacion: 4 }, user: {} }, res);

        expect(pool.query.mock.calls[0][1]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, 4, undefined, '1']);
        expect(res.json).toHaveBeenCalledWith({ ok: true, data: { id: 1, nombre: 'Dental Supply SAC', calificacion: 4 } });
    });
});
