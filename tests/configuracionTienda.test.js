jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const pool = require('../src/config/db');
const { obtenerConfiguracionTienda, actualizarConfiguracionTienda } = require('../src/controllers/configuracionTienda.controller');

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

const filaDb = {
    nombre_negocio: 'San Judas Tadeo Botica Dental',
    eslogan: 'Botica Dental',
    hero_titulo: 'Todo lo que tu consultorio necesita, en un solo lugar',
    hero_descripcion: 'Descripción de ejemplo',
    logo_url: null,
    hero_imagen_url: null,
    telefono: '+51 999 000 111',
    whatsapp_numero: '51999000111',
    direccion: 'Av. Principal 123',
    horario_atencion: 'Lun-Sáb 9-19',
    email_contacto: 'contacto@sanjudastadeo.dental',
    facebook_url: null,
    instagram_url: null,
    updated_at: '2026-01-01T00:00:00.000Z',
};

afterEach(() => jest.clearAllMocks());

describe('obtenerConfiguracionTienda', () => {
    test('mapea la fila de snake_case a camelCase', async () => {
        pool.query.mockResolvedValueOnce({ rows: [filaDb] });
        const req = {};
        const res = mockRes();

        await obtenerConfiguracionTienda(req, res);

        expect(res.json).toHaveBeenCalledWith({
            ok: true,
            data: expect.objectContaining({
                nombreNegocio: 'San Judas Tadeo Botica Dental',
                heroTitulo: 'Todo lo que tu consultorio necesita, en un solo lugar',
                whatsappNumero: '51999000111',
            }),
        });
    });

    test('404 si la fila no existe todavía (antes de aplicar la migración/seed)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();

        await obtenerConfiguracionTienda({}, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('actualizarConfiguracionTienda', () => {
    test('rechaza sin nombreNegocio antes de tocar la base de datos', async () => {
        const req = { body: { heroTitulo: 'Algo' } };
        const res = mockRes();

        await actualizarConfiguracionTienda(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza sin heroTitulo antes de tocar la base de datos', async () => {
        const req = { body: { nombreNegocio: 'Botica' } };
        const res = mockRes();

        await actualizarConfiguracionTienda(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('limpia el número de WhatsApp a solo dígitos, sin importar cómo lo tipeó el admin', async () => {
        pool.query.mockResolvedValueOnce({ rows: [filaDb] });
        const req = {
            body: {
                nombreNegocio: 'Botica',
                heroTitulo: 'Título',
                whatsappNumero: '+51 987-654 321',
            },
        };
        const res = mockRes();

        await actualizarConfiguracionTienda(req, res);

        const [, params] = pool.query.mock.calls[0];
        expect(params[7]).toBe('51987654321'); // índice del parámetro whatsapp_numero en el UPDATE
    });

    test('guarda null en whatsappNumero si no se envía, en vez de fallar', async () => {
        pool.query.mockResolvedValueOnce({ rows: [filaDb] });
        const req = { body: { nombreNegocio: 'Botica', heroTitulo: 'Título' } };
        const res = mockRes();

        await actualizarConfiguracionTienda(req, res);

        const [, params] = pool.query.mock.calls[0];
        expect(params[7]).toBeNull();
    });

    test('actualiza correctamente con todos los campos y responde con los datos mapeados', async () => {
        pool.query.mockResolvedValueOnce({ rows: [filaDb] });
        const req = {
            body: {
                nombreNegocio: '  San Judas Tadeo Botica Dental  ',
                heroTitulo: '  Título con espacios  ',
                heroDescripcion: 'Desc',
                logoUrl: 'https://example.com/logo.png',
                heroImagenUrl: 'https://example.com/hero.png',
                telefono: '+51 999 000 111',
                whatsappNumero: '51999000111',
                direccion: 'Av. Principal 123',
                horarioAtencion: 'Lun-Sáb 9-19',
                emailContacto: 'contacto@sanjudastadeo.dental',
                facebookUrl: 'https://facebook.com/x',
                instagramUrl: 'https://instagram.com/x',
            },
        };
        const res = mockRes();

        await actualizarConfiguracionTienda(req, res);

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toContain('UPDATE configuracion_tienda');
        expect(params[0]).toBe('San Judas Tadeo Botica Dental'); // recortado
        expect(params[2]).toBe('Título con espacios'); // recortado
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ ok: true, data: expect.any(Object) });
    });

    test('404 si la fila no existe (nunca debería pasar tras la migración, pero no debe crashear)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const req = { body: { nombreNegocio: 'Botica', heroTitulo: 'Título' } };
        const res = mockRes();

        await actualizarConfiguracionTienda(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});
