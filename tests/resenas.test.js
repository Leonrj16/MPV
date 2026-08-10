jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const pool = require('../src/config/db');
const { crearResena, listarResenasAprobadas, moderarResena } = require('../src/services/resenas');

afterEach(() => jest.clearAllMocks());

describe('crearResena', () => {
    test('rechaza sin nombre de cliente', async () => {
        await expect(crearResena({ productoId: 1, calificacion: 5 })).rejects.toThrow(/nombre/);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza una calificación fuera de 1-5', async () => {
        await expect(crearResena({ productoId: 1, clienteNombre: 'Ana', calificacion: 6 })).rejects.toThrow(/entre 1 y 5/);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rechaza una calificación no entera', async () => {
        await expect(crearResena({ productoId: 1, clienteNombre: 'Ana', calificacion: 3.5 })).rejects.toThrow(/entre 1 y 5/);
    });

    test('crea la reseña sin aprobar por defecto (columna aprobado con default en la BD)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, aprobado: false }] });
        const resena = await crearResena({ productoId: 1, clienteNombre: 'Ana', calificacion: 5, comentario: 'Muy bueno' });
        expect(resena.aprobado).toBe(false);
    });
});

describe('listarResenasAprobadas', () => {
    test('calcula el promedio redondeado a un decimal', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ calificacion: 5 }, { calificacion: 4 }, { calificacion: 4 }],
        });
        const { promedio, total } = await listarResenasAprobadas(1);
        expect(promedio).toBe(4.3);
        expect(total).toBe(3);
    });

    test('promedio es null si no hay reseñas aprobadas', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const { promedio, total } = await listarResenasAprobadas(1);
        expect(promedio).toBeNull();
        expect(total).toBe(0);
    });
});

describe('moderarResena', () => {
    test('aprobado=true actualiza la reseña en vez de borrarla', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, aprobado: true }] });
        await moderarResena(1, true);
        const [sql] = pool.query.mock.calls[0];
        expect(sql).toContain('UPDATE resenas_producto');
    });

    test('aprobado=false borra la reseña', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
        await moderarResena(1, false);
        const [sql] = pool.query.mock.calls[0];
        expect(sql).toContain('DELETE FROM resenas_producto');
    });
});
