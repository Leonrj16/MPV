const { parsearArchivoPrecios, validarFila, normalizarTexto } = require('../src/services/importarPrecios');
const ExcelJS = require('exceljs');

describe('normalizarTexto', () => {
    test('quita acentos, mayúsculas, espacios y preposiciones para comparar encabezados', () => {
        expect(normalizarTexto('Días de Entrega')).toBe('diasentrega');
        expect(normalizarTexto('Código')).toBe('codigo');
        expect(normalizarTexto('  Precio de Compra  ')).toBe('preciocompra');
    });

    test('encabezados equivalentes en fraseo distinto normalizan al mismo valor', () => {
        expect(normalizarTexto('Tiempo de Entrega')).toBe(normalizarTexto('TiempoEntrega'));
        expect(normalizarTexto('Precio de Compra')).toBe(normalizarTexto('PrecioCompra'));
    });
});

describe('validarFila', () => {
    test('acepta una fila completa y válida', () => {
        const r = validarFila({ sku: 'RES-001', proveedor: 'DentalSupply Corp', preciocompra: '8.50', tiempoentregadias: '5' });
        expect(r.valido).toBe(true);
        expect(r.datos).toEqual({ sku: 'RES-001', proveedor: 'DentalSupply Corp', precioCompra: 8.5, tiempoEntregaDias: 5 });
    });

    test('acepta una fila válida sin tiempo de entrega (queda null, no se debe sobrescribir el existente)', () => {
        const r = validarFila({ sku: 'RES-001', proveedor: 'DentalSupply Corp', preciocompra: '8.50' });
        expect(r.valido).toBe(true);
        expect(r.datos.tiempoEntregaDias).toBeNull();
    });

    test('rechaza si falta el SKU', () => {
        const r = validarFila({ proveedor: 'X', preciocompra: '10' });
        expect(r.valido).toBe(false);
        expect(r.errores).toContain('Falta el SKU');
    });

    test('rechaza si falta el proveedor', () => {
        const r = validarFila({ sku: 'X', preciocompra: '10' });
        expect(r.valido).toBe(false);
        expect(r.errores).toContain('Falta el proveedor');
    });

    test('rechaza un precio no numérico', () => {
        const r = validarFila({ sku: 'X', proveedor: 'Y', preciocompra: 'no-es-numero' });
        expect(r.valido).toBe(false);
        expect(r.errores).toContain('Precio de compra inválido');
    });

    test('rechaza un precio negativo', () => {
        const r = validarFila({ sku: 'X', proveedor: 'Y', preciocompra: '-5' });
        expect(r.valido).toBe(false);
        expect(r.errores).toContain('Precio de compra inválido');
    });

    test('rechaza un tiempo de entrega negativo', () => {
        const r = validarFila({ sku: 'X', proveedor: 'Y', preciocompra: '10', tiempoentregadias: '-1' });
        expect(r.valido).toBe(false);
        expect(r.errores).toContain('Tiempo de entrega inválido');
    });

    test('acumula todos los errores de una fila con múltiples problemas', () => {
        const r = validarFila({ preciocompra: 'malo' });
        expect(r.errores).toEqual(['Falta el SKU', 'Falta el proveedor', 'Precio de compra inválido']);
    });
});

describe('parsearArchivoPrecios', () => {
    test('parsea un CSV con encabezados en español y acentos', async () => {
        const csv = 'SKU,Proveedor,Precio de Compra,Días de Entrega\nRES-001,DentalSupply Corp,8.50,5\nGUA-100,BioDent Import,13.10,3\n';
        const filas = await parsearArchivoPrecios(Buffer.from(csv, 'utf-8'), 'precios.csv');

        expect(filas).toHaveLength(2);
        expect(filas[0]).toMatchObject({ sku: 'RES-001', proveedor: 'DentalSupply Corp', preciocompra: '8.50', tiempoentregadias: '5' });
    });

    test('parsea un XLSX generado con ExcelJS', async () => {
        const workbook = new ExcelJS.Workbook();
        const hoja = workbook.addWorksheet('Precios');
        hoja.addRow(['SKU', 'Proveedor', 'PrecioCompra', 'TiempoEntregaDias']);
        hoja.addRow(['RES-001', 'DentalSupply Corp', 8.5, 5]);
        const buffer = await workbook.xlsx.writeBuffer();

        const filas = await parsearArchivoPrecios(buffer, 'precios.xlsx');

        expect(filas).toHaveLength(1);
        expect(filas[0].sku).toBe('RES-001');
        expect(filas[0].preciocompra).toBe(8.5);
    });

    test('rechaza formatos no soportados', async () => {
        await expect(parsearArchivoPrecios(Buffer.from('x'), 'precios.pdf')).rejects.toThrow(/no soportado/i);
    });

    test('un CSV vacío (solo encabezados) devuelve un arreglo vacío', async () => {
        const filas = await parsearArchivoPrecios(Buffer.from('SKU,Proveedor,Precio\n'), 'vacio.csv');
        expect(filas).toEqual([]);
    });
});
