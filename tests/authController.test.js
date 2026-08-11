jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const { JWT_SECRET } = require('../src/middleware/auth.middleware');
const { login, me } = require('../src/controllers/auth.controller');

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

afterEach(() => jest.clearAllMocks());

describe('login', () => {
    test('rechaza sin tocar la base de datos si falta email o password', async () => {
        const res = mockRes();
        await login({ body: { email: 'admin@mpvdental.com' } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza con credenciales inválidas si el usuario no existe (o está inactivo)', async () => {
        // La query ya filtra `activo = TRUE`, así que un usuario inactivo
        // llega acá exactamente igual que uno inexistente: rows vacío.
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();

        await login({ body: { email: 'nadie@mpvdental.com', password: 'x' } }, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Credenciales inválidas' });
    });

    test('rechaza con credenciales inválidas si la contraseña no coincide', async () => {
        const hash = bcrypt.hashSync('claveCorrecta1', 10);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'admin@mpvdental.com', password_hash: hash, activo: true }] });
        const res = mockRes();

        await login({ body: { email: 'admin@mpvdental.com', password: 'claveIncorrecta' } }, res);

        expect(res.status).toHaveBeenCalledWith(401);
        // Nunca debe llegar a actualizar último acceso ni firmar token con una password mala.
        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test('login exitoso devuelve un token JWT válido y actualiza último acceso', async () => {
        const hash = bcrypt.hashSync('claveCorrecta1', 10);
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 7, nombre: 'Ana', email: 'ana@mpvdental.com', rol: 'operador', password_hash: hash }] })
            .mockResolvedValueOnce({}) // UPDATE ultimo_acceso
            .mockResolvedValueOnce({}); // INSERT bitacora
        const res = mockRes();

        await login({ body: { email: 'ana@mpvdental.com', password: 'claveCorrecta1' } }, res);

        expect(res.status).not.toHaveBeenCalled();
        const data = res.json.mock.calls[0][0].data;
        expect(data.usuario).toEqual({ sub: 7, nombre: 'Ana', email: 'ana@mpvdental.com', rol: 'operador' });

        const payload = jwt.verify(data.token, JWT_SECRET);
        expect(payload).toMatchObject({ sub: 7, rol: 'operador' });

        const updateCall = pool.query.mock.calls.find(([sql]) => sql.includes('ultimo_acceso'));
        expect(updateCall[1]).toEqual([7]);
    });

    test('el email se busca sin distinguir mayúsculas/minúsculas', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();

        await login({ body: { email: 'ADMIN@MPVDental.com', password: 'x' } }, res);

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toContain('LOWER(email) = LOWER($1)');
        expect(params).toEqual(['ADMIN@MPVDental.com']);
    });
});

describe('me', () => {
    test('devuelve el usuario ya autenticado por el middleware, sin tocar la base de datos', async () => {
        const res = mockRes();
        const usuario = { sub: 3, nombre: 'Carlos', rol: 'admin' };

        await me({ user: usuario }, res);

        expect(res.json).toHaveBeenCalledWith({ ok: true, data: usuario });
        expect(pool.query).not.toHaveBeenCalled();
    });
});
