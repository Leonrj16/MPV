const { soloLocalhost } = require('../src/middleware/soloLocalhost.middleware');

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe('soloLocalhost', () => {
    test.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('deja pasar pedidos desde %s', (ip) => {
        const next = jest.fn();
        const res = mockRes();
        soloLocalhost({ ip }, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('rechaza con 403 cualquier IP que no sea loopback', () => {
        const next = jest.fn();
        const res = mockRes();
        soloLocalhost({ ip: '203.0.113.7' }, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: expect.any(String) });
    });
});
