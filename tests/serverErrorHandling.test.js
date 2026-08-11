// server.js carga todas las rutas transitivamente, incluida la del catálogo
// PDF, que requiere puppeteer (paquete ESM que Jest no puede parsear sin
// transform) — se mockea igual que en catalogoPdfService.test.js, no hace
// falta un Chromium real para probar el manejo de errores HTTP.
jest.mock('puppeteer', () => ({ launch: jest.fn() }));

const request = require('supertest');
const app = require('../src/server');

describe('manejo de errores global', () => {
    test('body JSON malformado responde JSON con el contrato ok:false, no la página HTML por defecto de Express', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send('{ esto no es json válido');

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
        expect(res.headers['content-type']).toMatch(/json/);
        expect(res.body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('ruta desconocida responde 404 en JSON', async () => {
        const res = await request(app).get('/api/ruta-que-no-existe');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ ok: false, error: 'Ruta no encontrada' });
    });
});
