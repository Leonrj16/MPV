const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');

const ALIAS_CAMPOS = {
    sku: ['sku', 'codigo'],
    proveedor: ['proveedor', 'nombreproveedor', 'proveedornombre'],
    preciocompra: ['preciocompra', 'precio', 'preciocompraunitario'],
    tiempoentregadias: ['tiempoentregadias', 'tiempoentrega', 'diasentrega', 'entregadias'],
};

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'unitario']);

// Normaliza un encabezado para compararlo contra ALIAS_CAMPOS: minúsculas, sin
// acentos ni signos, y sin preposiciones/artículos ("Días de Entrega" ~ "Tiempo de Entrega").
function normalizarTexto(str) {
    const base = String(str ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
    const palabras = base.split(/[^a-z0-9]+/).filter(Boolean);
    return palabras.filter((p) => !PALABRAS_VACIAS.has(p)).join('');
}

function mapearCampo(headerNormalizado) {
    for (const [campo, alias] of Object.entries(ALIAS_CAMPOS)) {
        if (alias.includes(headerNormalizado)) return campo;
    }
    return null;
}

/** Convierte una fila cruda (claves = encabezados originales) a { sku, proveedor, preciocompra, tiempoentregadias } */
function normalizarFila(filaCruda) {
    const fila = {};
    for (const [header, valor] of Object.entries(filaCruda)) {
        const campo = mapearCampo(normalizarTexto(header));
        if (campo) fila[campo] = typeof valor === 'string' ? valor.trim() : valor;
    }
    return fila;
}

async function parsearCSV(buffer) {
    const registros = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
    });
    return registros.map(normalizarFila);
}

async function parsearExcel(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const hoja = workbook.worksheets[0];
    if (!hoja) return [];

    const encabezados = [];
    hoja.getRow(1).eachCell((celda, colNumero) => {
        encabezados[colNumero] = celda.value?.toString() ?? '';
    });

    const filas = [];
    hoja.eachRow((row, rowNumero) => {
        if (rowNumero === 1) return;
        const filaCruda = {};
        row.eachCell((celda, colNumero) => {
            if (encabezados[colNumero]) {
                filaCruda[encabezados[colNumero]] = celda.value?.result ?? celda.value;
            }
        });
        if (Object.keys(filaCruda).length > 0) filas.push(normalizarFila(filaCruda));
    });
    return filas;
}

/**
 * Parsea un archivo .csv o .xlsx en memoria a un arreglo de filas
 * normalizadas: { sku, proveedor, preciocompra, tiempoentregadias }.
 */
async function parsearArchivoPrecios(buffer, nombreArchivo) {
    const extension = nombreArchivo.toLowerCase().split('.').pop();
    if (extension === 'csv') return parsearCSV(buffer);
    if (extension === 'xlsx') return parsearExcel(buffer);
    throw new Error('Formato no soportado. Usa un archivo .csv o .xlsx');
}

/**
 * Valida y normaliza una fila ya parseada. No toca la base de datos;
 * solo dice si la fila es válida y, si no, por qué.
 */
function validarFila(fila) {
    const errores = [];

    if (!fila.sku) errores.push('Falta el SKU');
    if (!fila.proveedor) errores.push('Falta el proveedor');

    const precio = Number(fila.preciocompra);
    if (fila.preciocompra === undefined || fila.preciocompra === '' || Number.isNaN(precio) || precio < 0) {
        errores.push('Precio de compra inválido');
    }

    let tiempoEntregaDias = null;
    if (fila.tiempoentregadias !== undefined && fila.tiempoentregadias !== '') {
        const dias = Number(fila.tiempoentregadias);
        if (Number.isNaN(dias) || dias < 0) {
            errores.push('Tiempo de entrega inválido');
        } else {
            tiempoEntregaDias = Math.round(dias);
        }
    }

    return {
        valido: errores.length === 0,
        errores,
        datos: errores.length === 0 ? { sku: fila.sku, proveedor: fila.proveedor, precioCompra: precio, tiempoEntregaDias } : null,
    };
}

module.exports = { parsearArchivoPrecios, validarFila, normalizarTexto };
