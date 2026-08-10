jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const pool = require('../src/config/db');
const { obtenerAlertas } = require('../src/services/alertas');

afterEach(() => jest.clearAllMocks());

describe('obtenerAlertas', () => {
    test('agrega stock bajo, agotado, subidas de precio y pedidos pendientes', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 1, nombre: 'Guantes', sku: 'GUA-100', stock_actual: 2, stock_minimo: 5 }] }) // stock bajo
            .mockResolvedValueOnce({ rows: [{ id: 2, nombre: 'Hilo de Sutura', sku: 'HIL-500' }] }) // agotado
            .mockResolvedValueOnce({ rows: [{ producto_id: 3, producto_nombre: 'Resina', sku: 'RES-001', proveedor_nombre: 'BioDent', precio_compra_unitario: '8.10', precio_compra_anterior: '7.80' }] }) // subida precio
            .mockResolvedValueOnce({ rows: [{ total: 4 }] }) // pedidos pendientes
            .mockResolvedValueOnce({ rows: [{ id: 5, nombre: 'Anestesia', sku: 'ANE-050', stock_actual: 10, velocidad_diaria: '2' }] }) // reabastecimiento
            .mockResolvedValueOnce({ rows: [{ id: 6, nombre: 'Alginato', sku: 'ALG-020', fecha_vencimiento: new Date('2026-08-15T00:00:00') }] }); // vencimiento

        const data = await obtenerAlertas();

        expect(data.stockBajo).toEqual([{ id: 1, nombre: 'Guantes', sku: 'GUA-100', stockActual: 2, stockMinimo: 5 }]);
        expect(data.stockAgotado).toEqual([{ id: 2, nombre: 'Hilo de Sutura', sku: 'HIL-500' }]);
        expect(data.subidasPrecio).toEqual([
            { productoId: 3, nombre: 'Resina', sku: 'RES-001', proveedor: 'BioDent', precioAnterior: 7.8, precioActual: 8.1 },
        ]);
        expect(data.pedidosPendientes).toBe(4);
        expect(data.reabastecimiento).toEqual([{ id: 5, nombre: 'Anestesia', sku: 'ANE-050', stockActual: 10, diasRestantes: 5 }]);
        expect(data.vencimiento).toEqual([{ id: 6, nombre: 'Alginato', sku: 'ALG-020', fechaVencimiento: '2026-08-15', vencido: false }]);
        expect(data.total).toBe(1 + 1 + 1 + 4 + 1 + 1);
    });

    test('sin ninguna alerta activa, total queda en 0', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ total: 0 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const data = await obtenerAlertas();

        expect(data.total).toBe(0);
        expect(data.stockBajo).toEqual([]);
        expect(data.stockAgotado).toEqual([]);
        expect(data.subidasPrecio).toEqual([]);
        expect(data.reabastecimiento).toEqual([]);
        expect(data.vencimiento).toEqual([]);
    });

    test('la consulta de stock bajo excluye productos agotados y sin umbral configurado', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ total: 0 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        await obtenerAlertas();

        const [sqlStockBajo] = pool.query.mock.calls[0];
        expect(sqlStockBajo).toContain('stock_actual > 0');
        expect(sqlStockBajo).toContain('stock_minimo > 0');
    });
});
