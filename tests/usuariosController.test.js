jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const pool = require('../src/config/db');
const { actualizarUsuario, crearUsuario } = require('../src/controllers/usuarios.controller');

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

afterEach(() => jest.clearAllMocks());

describe('actualizarUsuario — protección de autobloqueo', () => {
    test('bloquea que un admin se desactive a sí mismo', async () => {
        const req = { params: { id: '1' }, body: { activo: false }, user: { sub: 1, rol: 'admin' } };
        const res = mockRes();

        await actualizarUsuario(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('bloquea que un admin se quite su propio rol de administrador', async () => {
        const req = { params: { id: '1' }, body: { rol: 'operador' }, user: { sub: 1, rol: 'admin' } };
        const res = mockRes();

        await actualizarUsuario(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('permite que un admin edite a OTRO usuario sin restricción', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 2, nombre: 'Ana', activo: false }] });
        pool.query.mockResolvedValueOnce({}); // INSERT en bitacora
        const req = { params: { id: '2' }, body: { activo: false }, user: { sub: 1, rol: 'admin' } };
        const res = mockRes();

        await actualizarUsuario(req, res);

        expect(pool.query).toHaveBeenCalledTimes(2); // UPDATE + registro en bitácora
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ ok: true, data: { id: 2, nombre: 'Ana', activo: false } });
    });

    test('rechaza un rol inválido antes de tocar la base de datos', async () => {
        const req = { params: { id: '2' }, body: { rol: 'superadmin' }, user: { sub: 1, rol: 'admin' } };
        const res = mockRes();

        await actualizarUsuario(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('devuelve 404 si el usuario a editar no existe', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const req = { params: { id: '999' }, body: { nombre: 'X' }, user: { sub: 1, rol: 'admin' } };
        const res = mockRes();

        await actualizarUsuario(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('crearUsuario — validaciones', () => {
    test('rechaza si falta la contraseña', async () => {
        const req = { body: { nombre: 'X', email: 'x@x.com' } };
        const res = mockRes();

        await crearUsuario(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza contraseñas de menos de 8 caracteres', async () => {
        const req = { body: { nombre: 'X', email: 'x@x.com', password: '1234567' } };
        const res = mockRes();

        await crearUsuario(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza un rol que no sea admin u operador', async () => {
        const req = { body: { nombre: 'X', email: 'x@x.com', password: '12345678', rol: 'superadmin' } };
        const res = mockRes();

        await crearUsuario(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('devuelve 409 si el email ya existe (violación de unicidad de Postgres)', async () => {
        pool.query.mockRejectedValueOnce({ code: '23505' });
        const req = { body: { nombre: 'X', email: 'admin@mpvdental.com', password: '12345678' } };
        const res = mockRes();

        await crearUsuario(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    test('crea el usuario con hash de contraseña (nunca en texto plano)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 5, nombre: 'X', email: 'x@x.com' }] });
        const req = { body: { nombre: 'X', email: 'x@x.com', password: 'claveSegura1' } };
        const res = mockRes();

        await crearUsuario(req, res);

        const [, params] = pool.query.mock.calls[0];
        const passwordHashGuardado = params[2];
        expect(passwordHashGuardado).not.toBe('claveSegura1');
        expect(passwordHashGuardado).toMatch(/^\$2[aby]\$/); // formato de hash bcrypt
        expect(res.status).toHaveBeenCalledWith(201);
    });
});
