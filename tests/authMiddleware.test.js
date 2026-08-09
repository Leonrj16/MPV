const jwt = require('jsonwebtoken');
const { verificarToken, requiereRol, JWT_SECRET } = require('../src/middleware/auth.middleware');

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe('verificarToken', () => {
    test('rechaza con 401 cuando no hay cabecera Authorization', () => {
        const req = { headers: {} };
        const res = mockRes();
        const next = jest.fn();

        verificarToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('rechaza con 401 cuando el esquema no es Bearer', () => {
        const req = { headers: { authorization: 'Basic abc123' } };
        const res = mockRes();
        const next = jest.fn();

        verificarToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('rechaza con 401 cuando el token es inválido', () => {
        const req = { headers: { authorization: 'Bearer token-invalido' } };
        const res = mockRes();
        const next = jest.fn();

        verificarToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('rechaza con 401 cuando el token expiró', () => {
        const tokenExpirado = jwt.sign({ sub: 1, rol: 'admin' }, JWT_SECRET, { expiresIn: -10 });
        const req = { headers: { authorization: `Bearer ${tokenExpirado}` } };
        const res = mockRes();
        const next = jest.fn();

        verificarToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('deja pasar y adjunta req.user cuando el token es válido', () => {
        const payload = { sub: 1, nombre: 'Admin', email: 'admin@mpvdental.com', rol: 'admin' };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = mockRes();
        const next = jest.fn();

        verificarToken(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toMatchObject({ sub: 1, rol: 'admin' });
    });
});

describe('requiereRol', () => {
    test('permite continuar cuando el rol del usuario está en la lista', () => {
        const req = { user: { rol: 'admin' } };
        const res = mockRes();
        const next = jest.fn();

        requiereRol('admin', 'operador')(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('rechaza con 403 cuando el rol no está permitido', () => {
        const req = { user: { rol: 'operador' } };
        const res = mockRes();
        const next = jest.fn();

        requiereRol('admin')(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('rechaza con 403 cuando no hay req.user (verificarToken no corrió antes)', () => {
        const req = {};
        const res = mockRes();
        const next = jest.fn();

        requiereRol('admin')(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
});
