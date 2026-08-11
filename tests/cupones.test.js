jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const pool = require('../src/config/db');
const { crearCupon, validarCupon, consumirUso } = require('../src/services/cupones');

afterEach(() => jest.clearAllMocks());

describe('crearCupon', () => {
    test('rechaza sin tocar la base de datos si falta el código', async () => {
        await expect(crearCupon({ tipo: 'porcentaje', valor: 10 })).rejects.toThrow(/código/);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza un tipo que no sea porcentaje ni monto_fijo', async () => {
        await expect(crearCupon({ codigo: 'X', tipo: 'otro', valor: 10 })).rejects.toThrow(/tipo/);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza un porcentaje mayor a 100', async () => {
        await expect(crearCupon({ codigo: 'X', tipo: 'porcentaje', valor: 150 })).rejects.toThrow(/100%/);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('guarda el código en mayúsculas', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, codigo: 'BIENVENIDO10' }] });
        await crearCupon({ codigo: 'bienvenido10', tipo: 'porcentaje', valor: 10 });
        const [, params] = pool.query.mock.calls[0];
        expect(params[0]).toBe('BIENVENIDO10');
    });
});

describe('validarCupon', () => {
    test('rechaza un código que no existe', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await expect(validarCupon('NOEXISTE', 100)).rejects.toThrow(/no válido/);
    });

    test('rechaza un cupón inactivo', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ codigo: 'X', activo: false }] });
        await expect(validarCupon('X', 100)).rejects.toThrow(/ya no está activo/);
    });

    test('rechaza un cupón expirado', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ codigo: 'X', activo: true, fecha_expiracion: '2020-01-01', usos_maximos: null, monto_minimo: '0' }],
        });
        await expect(validarCupon('X', 100)).rejects.toThrow(/expiró/);
    });

    test('rechaza un cupón que ya alcanzó su límite de usos', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ codigo: 'X', activo: true, fecha_expiracion: null, usos_maximos: 5, usos_actuales: 5, monto_minimo: '0' }],
        });
        await expect(validarCupon('X', 100)).rejects.toThrow(/límite de usos/);
    });

    test('rechaza si el subtotal no alcanza el monto mínimo', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ codigo: 'X', activo: true, fecha_expiracion: null, usos_maximos: null, usos_actuales: 0, monto_minimo: '200' }],
        });
        await expect(validarCupon('X', 100)).rejects.toThrow(/mínimo de compra/);
    });

    test('calcula el descuento porcentual correctamente', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ codigo: 'DIEZ', tipo: 'porcentaje', valor: '10', activo: true, fecha_expiracion: null, usos_maximos: null, usos_actuales: 0, monto_minimo: '0' }],
        });
        const resultado = await validarCupon('diez', 100);
        expect(resultado.descuento).toBe(10);
    });

    test('el descuento de monto fijo nunca supera el subtotal', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ codigo: 'FIJO', tipo: 'monto_fijo', valor: '50', activo: true, fecha_expiracion: null, usos_maximos: null, usos_actuales: 0, monto_minimo: '0' }],
        });
        const resultado = await validarCupon('FIJO', 30);
        expect(resultado.descuento).toBe(30);
    });
});

describe('consumirUso', () => {
    test('incrementa usos_actuales del cupón indicado y devuelve la fila actualizada', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ codigo: 'DIEZ', usos_actuales: 3 }] });

        const resultado = await consumirUso('DIEZ');

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toContain('usos_actuales = usos_actuales + 1');
        expect(sql).toContain('usos_actuales < usos_maximos');
        expect(params).toEqual(['DIEZ']);
        expect(resultado).toEqual({ codigo: 'DIEZ', usos_actuales: 3 });
    });

    test('devuelve null (sin lanzar) si el cupón ya llegó a su límite de usos — el UPDATE no afecta ninguna fila', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const resultado = await consumirUso('AGOTADO');

        expect(resultado).toBeNull();
    });

    test('usa el client de una transacción cuando se le pasa uno, en vez del pool', async () => {
        const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{ codigo: 'DIEZ' }] }) };

        await consumirUso('DIEZ', client);

        expect(client.query).toHaveBeenCalledTimes(1);
        expect(pool.query).not.toHaveBeenCalled();
    });
});
