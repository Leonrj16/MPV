jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const pool = require('../src/config/db');
const { obtenerConfigActiva, obtenerTablero } = require('../src/services/tableroPrecios');

const configRow = {
    margen_utilidad_defecto_pct: '35.00',
    costo_operativo_mensual: '1500.00',
    unidades_estimadas_mensual: 500,
    porcentaje_impuesto: '18.00',
};

afterEach(() => jest.clearAllMocks());

describe('obtenerConfigActiva', () => {
    test('lanza error si no hay configuración activa', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await expect(obtenerConfigActiva()).rejects.toThrow(/configuración de márgenes activa/);
    });

    test('devuelve la fila cuando existe configuración activa', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] });
        const config = await obtenerConfigActiva();
        expect(config).toBe(configRow);
    });
});

describe('obtenerTablero', () => {
    test('sin filtros no agrega cláusula WHERE ni parámetros', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] }).mockResolvedValueOnce({ rows: [] });

        await obtenerTablero({});

        const [sql, params] = pool.query.mock.calls[1];
        expect(sql).not.toContain('WHERE');
        expect(params).toEqual([]);
    });

    test('arma los filtros como consulta parametrizada, sin concatenar el valor en el SQL', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] }).mockResolvedValueOnce({ rows: [] });

        await obtenerTablero({ categoria: 'Anestesia', proveedor: '2', busqueda: "'; DROP TABLE productos; --" });

        const [sql, params] = pool.query.mock.calls[1];
        expect(sql).toContain('categoria_nombre = $1');
        expect(sql).toContain('proveedor_id = $2');
        expect(sql).toContain('producto_nombre ILIKE $3');
        expect(sql).not.toContain('DROP TABLE'); // el valor peligroso va como parámetro, no en el texto del SQL
        expect(params).toEqual(['Anestesia', '2', "%'; DROP TABLE productos; --%"]);
    });

    test('calcula el PVP de cada fila usando la configuración activa', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({
                rows: [{
                    producto_id: 1,
                    sku: 'RES-001',
                    producto_nombre: 'Resina Compuesta',
                    categoria_nombre: 'Resinas y Composites',
                    proveedor_id: 1,
                    proveedor_nombre: 'DentalSupply Corp',
                    proveedor_producto_id: 1,
                    precio_compra_unitario: '8.50',
                    tiempo_entrega_dias: 5,
                    es_proveedor_optimo: true,
                    es_proveedor_principal: true,
                    alerta_subida_precio: false,
                    fecha_ultima_actualizacion: '2026-01-01T00:00:00.000Z',
                }],
            });

        const { tablero } = await obtenerTablero();

        expect(tablero).toHaveLength(1);
        expect(tablero[0].pvpSugerido).toBeCloseTo(20.88, 2);
        expect(tablero[0].rentabilidad).toBe('alto');
        expect(tablero[0].esProveedorOptimo).toBe(true);
        expect(tablero[0].sku).toBe('RES-001');
    });

    test('propaga el error si el cálculo de PVP falla (ej. precio negativo por dato corrupto)', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({ rows: [{ precio_compra_unitario: '-5.00', producto_nombre: 'X', sku: 'X' }] });

        await expect(obtenerTablero()).rejects.toThrow();
    });
});
