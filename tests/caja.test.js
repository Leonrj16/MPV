jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const pool = require('../src/config/db');
const { abrirCaja, cerrarCaja, obtenerEstadoActual, obtenerCajaAbierta, listarSesiones } = require('../src/services/caja');

afterEach(() => jest.clearAllMocks());

describe('abrirCaja', () => {
    test('rechaza un monto negativo sin tocar la base de datos', async () => {
        await expect(abrirCaja({ usuarioId: 1, montoApertura: -5 })).rejects.toThrow(/mayor o igual a 0/);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza si ya hay una caja abierta', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 3, estado: 'abierta' }] }); // obtenerCajaAbierta
        await expect(abrirCaja({ usuarioId: 1, montoApertura: 100 })).rejects.toThrow(/ya hay una caja abierta/i);
    });

    test('abre la caja con el monto inicial indicado', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // obtenerCajaAbierta -> ninguna
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, monto_apertura: '100.00', estado: 'abierta' }] }); // INSERT
        const caja = await abrirCaja({ usuarioId: 1, montoApertura: 100, notas: 'Turno mañana' });
        expect(caja.id).toBe(1);
        const [, params] = pool.query.mock.calls[1];
        expect(params).toEqual([1, 100, 'Turno mañana']);
    });
});

describe('cerrarCaja', () => {
    test('rechaza si no hay caja abierta', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // obtenerCajaAbierta
        await expect(cerrarCaja({ usuarioId: 1, montoContado: 100 })).rejects.toThrow(/no hay ninguna caja abierta/i);
    });

    test('calcula la diferencia entre lo esperado y lo contado', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 5, monto_apertura: '100.00', estado: 'abierta' }] }) // obtenerCajaAbierta
            .mockResolvedValueOnce({ rows: [{ metodo_pago: 'efectivo', cantidad: '2', total: '50.00' }] }) // obtenerResumenSesion: por método
            .mockResolvedValueOnce({ rows: [{ cantidad_ventas: '2', total_ventas: '50.00' }] }) // obtenerResumenSesion: totales
            .mockResolvedValueOnce({ rows: [{ id: 5, estado: 'cerrada', monto_cierre_contado: '145.00' }] }); // UPDATE

        // esperado = 100 (apertura) + 50 (efectivo vendido) = 150; contado 145 -> diferencia -5
        const resultado = await cerrarCaja({ usuarioId: 1, montoContado: 145 });
        expect(resultado.montoEfectivoEsperado).toBe(150);
        expect(resultado.diferencia).toBe(-5);
    });
});

describe('obtenerEstadoActual', () => {
    test('devuelve abierta:false cuando no hay ninguna sesión abierta', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const estado = await obtenerEstadoActual();
        expect(estado).toEqual({ abierta: false });
    });

    test('incluye el resumen por método de pago y el efectivo esperado', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 9, monto_apertura: '200.00', usuario_apertura_nombre: 'Ana' }] }) // obtenerCajaAbierta
            .mockResolvedValueOnce({
                rows: [
                    { metodo_pago: 'efectivo', cantidad: '3', total: '90.00' },
                    { metodo_pago: 'tarjeta', cantidad: '1', total: '40.00' },
                ],
            }) // obtenerResumenSesion: por método
            .mockResolvedValueOnce({ rows: [{ cantidad_ventas: '4', total_ventas: '130.00' }] }); // obtenerResumenSesion: totales

        const estado = await obtenerEstadoActual();
        expect(estado.abierta).toBe(true);
        expect(estado.montoEfectivoEsperado).toBe(290); // 200 + 90 efectivo (tarjeta no cuenta)
        expect(estado.resumen.totalVentas).toBe(130);
        expect(estado.resumen.cantidadVentas).toBe(4);
    });

    test('una venta con pago dividido suma su parte en efectivo al arqueo, aunque la venta figure como "mixto"', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 9, monto_apertura: '0.00' }] }) // obtenerCajaAbierta
            .mockResolvedValueOnce({
                rows: [
                    { metodo_pago: 'efectivo', cantidad: '1', total: '20.00' },
                    { metodo_pago: 'tarjeta', cantidad: '1', total: '30.00' },
                ],
            }) // obtenerResumenSesion: por método (una sola venta "mixta" partida en 2 líneas de pago)
            .mockResolvedValueOnce({ rows: [{ cantidad_ventas: '1', total_ventas: '50.00' }] }); // 1 sola venta, no 2

        const estado = await obtenerEstadoActual();
        expect(estado.montoEfectivoEsperado).toBe(20); // solo la porción en efectivo de la venta mixta
        expect(estado.resumen.cantidadVentas).toBe(1); // no se duplica por tener 2 líneas de pago
    });
});

describe('listarSesiones', () => {
    test('respeta el límite pedido', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await listarSesiones({ limite: 5 });
        const [, params] = pool.query.mock.calls[0];
        expect(params).toEqual([5]);
    });
});
