jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const pool = require('../src/config/db');
const { registrarEvento, listarBitacora } = require('../src/services/bitacora');

afterEach(() => jest.clearAllMocks());

describe('registrarEvento', () => {
    test('inserta el evento con los campos recibidos', async () => {
        pool.query.mockResolvedValueOnce({});

        await registrarEvento({
            usuarioId: 3,
            usuarioNombre: 'Ana',
            accion: 'crear',
            entidad: 'producto',
            entidadId: 7,
            detalle: 'Creó el producto "Resina"',
        });

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toContain('INSERT INTO bitacora');
        expect(params).toEqual([3, 'Ana', 'crear', 'producto', 7, 'Creó el producto "Resina"']);
    });

    test('nunca lanza si falla el INSERT (best-effort)', async () => {
        pool.query.mockRejectedValueOnce(new Error('fallo de conexión'));

        await expect(
            registrarEvento({ accion: 'crear', entidad: 'producto' })
        ).resolves.toBeUndefined();
    });

    test('usa null cuando no se recibe usuario o entidadId', async () => {
        pool.query.mockResolvedValueOnce({});

        await registrarEvento({ accion: 'iniciar_sesion', entidad: 'sesion' });

        const [, params] = pool.query.mock.calls[0];
        expect(params[0]).toBeNull(); // usuarioId
        expect(params[1]).toBeNull(); // usuarioNombre
        expect(params[4]).toBeNull(); // entidadId
    });
});

describe('listarBitacora', () => {
    test('sin filtros arma un WHERE vacío y usa el límite por defecto', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

        const resultado = await listarBitacora();

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).not.toContain('WHERE');
        expect(params).toEqual([100]);
        expect(resultado).toEqual([{ id: 1 }]);
    });

    test('agrega condiciones por entidad, acción y rango de fechas', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        await listarBitacora({ entidad: 'producto', accion: 'crear', desde: '2026-01-01', hasta: '2026-01-31' });

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toContain('entidad = $1');
        expect(sql).toContain('accion = $2');
        expect(sql).toContain('created_at >= $3::date');
        expect(sql).toContain("created_at < ($4::date + interval '1 day')");
        expect(params).toEqual(['producto', 'crear', '2026-01-01', '2026-01-31', 100]);
    });

    test('topa el límite a 500 aunque se pida más', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        await listarBitacora({ limite: 10000 });

        const [, params] = pool.query.mock.calls[0];
        expect(params[params.length - 1]).toBe(500);
    });
});
