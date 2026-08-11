jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const pool = require('../src/config/db');
const { obtenerConfiguracion, actualizarConfiguracion } = require('../src/controllers/configuracion.controller');

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

const payloadValido = {
    margenUtilidadDefectoPct: 35,
    costoOperativoMensual: 1500,
    unidadesEstimadasMensual: 500,
    porcentajeImpuesto: 18,
};

afterEach(() => jest.clearAllMocks());

describe('obtenerConfiguracion', () => {
    test('404 si no hay ninguna configuración activa', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();

        await obtenerConfiguracion({}, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('devuelve la configuración activa', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, margen_utilidad_defecto_pct: '35.00' }] });
        const res = mockRes();

        await obtenerConfiguracion({}, res);

        expect(res.json).toHaveBeenCalledWith({ ok: true, data: { id: 1, margen_utilidad_defecto_pct: '35.00' } });
    });
});

describe('actualizarConfiguracion — límites de validación', () => {
    test('rechaza un margen de exactamente 100% (el motor de precios no puede dividir por cero margen restante)', async () => {
        const res = mockRes();
        await actualizarConfiguracion({ body: { ...payloadValido, margenUtilidadDefectoPct: 100 } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('acepta un margen de 99.99% (justo debajo del límite)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
        pool.query.mockResolvedValueOnce({}); // bitacora
        const res = mockRes();

        await actualizarConfiguracion({ body: { ...payloadValido, margenUtilidadDefectoPct: 99.99 } }, res);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ ok: true, data: { id: 1 } });
    });

    test('rechaza un margen negativo', async () => {
        const res = mockRes();
        await actualizarConfiguracion({ body: { ...payloadValido, margenUtilidadDefectoPct: -1 } }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza un costo operativo mensual negativo', async () => {
        const res = mockRes();
        await actualizarConfiguracion({ body: { ...payloadValido, costoOperativoMensual: -1 } }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza unidades estimadas mensuales en 0', async () => {
        const res = mockRes();
        await actualizarConfiguracion({ body: { ...payloadValido, unidadesEstimadasMensual: 0 } }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza un porcentaje de impuesto negativo', async () => {
        const res = mockRes();
        await actualizarConfiguracion({ body: { ...payloadValido, porcentajeImpuesto: -5 } }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('acepta impuesto en 0% (negocio sin RUC, no afecto a IGV)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
        pool.query.mockResolvedValueOnce({});
        const res = mockRes();

        await actualizarConfiguracion({ body: { ...payloadValido, porcentajeImpuesto: 0 } }, res);

        expect(res.status).not.toHaveBeenCalled();
    });

    test('404 si no existe una configuración activa para actualizar', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();

        await actualizarConfiguracion({ body: payloadValido }, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});
