jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const pool = require('../src/config/db');
const { listarCatalogo, obtenerProductoDetalle, obtenerDestacados } = require('../src/controllers/tienda.controller');

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

const configRow = {
    margen_utilidad_defecto_pct: '35.00',
    costo_operativo_mensual: '1500.00',
    unidades_estimadas_mensual: 500,
    porcentaje_impuesto: '0.00',
};

const filaProducto = {
    id: 1,
    sku: 'RES-001',
    nombre: 'Resina Compuesta',
    descripcion: 'Jeringa 4g',
    imagen_url: null,
    unidad_medida: 'jeringa',
    stock_actual: 40,
    categoria_id: 1,
    categoria_nombre: 'Resinas y Composites',
    precio_compra_unitario: '8.50',
};

afterEach(() => jest.clearAllMocks());

describe('listarCatalogo', () => {
    test('incluye stockActual y vendidosTotal (0 si nunca se vendió)', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] }) // obtenerConfigActiva
            .mockResolvedValueOnce({ rows: [filaProducto] }) // catálogo
            .mockResolvedValueOnce({ rows: [] }); // ventas agregadas (sin ventas todavía)

        const req = { query: {} };
        const res = mockRes();
        await listarCatalogo(req, res);

        expect(res.json).toHaveBeenCalledWith({
            ok: true,
            data: [expect.objectContaining({ id: 1, stockActual: 40, vendidosTotal: 0 })],
        });
    });

    test('suma vendidosTotal desde venta_detalle cuando sí hay ventas', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({ rows: [filaProducto] })
            .mockResolvedValueOnce({ rows: [{ producto_id: 1, total: '12' }] });

        const res = mockRes();
        await listarCatalogo({ query: {} }, res);

        const data = res.json.mock.calls[0][0].data;
        expect(data[0].vendidosTotal).toBe(12);
    });

    test('nunca expone precio de compra ni proveedor al cliente', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({ rows: [filaProducto] })
            .mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await listarCatalogo({ query: {} }, res);

        const producto = res.json.mock.calls[0][0].data[0];
        expect(producto).not.toHaveProperty('precioCompraUnitario');
        expect(producto).not.toHaveProperty('proveedor');
    });
});

describe('obtenerProductoDetalle', () => {
    test('404 si el producto no existe o no tiene oferta activa', async () => {
        pool.query.mockResolvedValueOnce({ rows: [configRow] }).mockResolvedValueOnce({ rows: [] });
        const res = mockRes();

        await obtenerProductoDetalle({ params: { id: '999' } }, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('incluye relacionados de la misma categoría, excluyéndose a sí mismo', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({ rows: [filaProducto] })
            .mockResolvedValueOnce({ rows: [{ ...filaProducto, id: 2, nombre: 'Otra Resina' }] });

        const res = mockRes();
        await obtenerProductoDetalle({ params: { id: '1' } }, res);

        const [sqlRelacionados, paramsRelacionados] = pool.query.mock.calls[2];
        expect(sqlRelacionados).toContain('pr.id != $2');
        expect(paramsRelacionados).toEqual([1, '1']);

        const data = res.json.mock.calls[0][0].data;
        expect(data.relacionados).toHaveLength(1);
        expect(data.relacionados[0].nombre).toBe('Otra Resina');
    });

    test('relacionados queda vacío si el producto no tiene categoría', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({ rows: [{ ...filaProducto, categoria_id: null }] });

        const res = mockRes();
        await obtenerProductoDetalle({ params: { id: '1' } }, res);

        expect(pool.query).toHaveBeenCalledTimes(2); // no dispara la consulta de relacionados
        expect(res.json.mock.calls[0][0].data.relacionados).toEqual([]);
    });
});

describe('obtenerDestacados', () => {
    test('usa productos recientes si todavía no hay ventas registradas', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({ rows: [] }) // sin ventas
            .mockResolvedValueOnce({ rows: [{ id: 3 }, { id: 1 }] }) // recientes
            .mockResolvedValueOnce({ rows: [{ ...filaProducto, id: 3 }, filaProducto] });

        const res = mockRes();
        await obtenerDestacados({}, res);

        const body = res.json.mock.calls[0][0];
        expect(body.data.criterio).toBe('recientes');
        expect(body.data.productos.map((p) => p.id)).toEqual([3, 1]); // conserva el orden de recencia
    });

    test('usa más vendidos cuando sí hay ventas, conservando su orden de popularidad', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({ rows: [{ id: 2 }, { id: 1 }] }) // más vendidos, en ese orden
            .mockResolvedValueOnce({ rows: [filaProducto, { ...filaProducto, id: 2, nombre: 'Guantes' }] });

        const res = mockRes();
        await obtenerDestacados({}, res);

        const body = res.json.mock.calls[0][0];
        expect(body.data.criterio).toBe('mas_vendidos');
        expect(body.data.productos.map((p) => p.id)).toEqual([2, 1]);
    });

    test('descarta silenciosamente ids que ya no tienen oferta activa, sin crashear', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [configRow] })
            .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 5 }] }) // id 5 ya no tiene oferta activa
            .mockResolvedValueOnce({ rows: [filaProducto] }); // solo vuelve el id 1

        const res = mockRes();
        await obtenerDestacados({}, res);

        const body = res.json.mock.calls[0][0];
        expect(body.data.productos).toHaveLength(1);
        expect(body.data.productos[0].id).toBe(1);
    });
});
