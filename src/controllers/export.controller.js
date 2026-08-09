const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { obtenerTablero } = require('../services/tableroPrecios');

const formatoMoneda = (n) => `S/ ${Number(n).toFixed(2)}`;
const timestampArchivo = () => new Date().toISOString().slice(0, 10);

/**
 * GET /api/precios/exportar/excel
 * Genera un .xlsx del tablero de precios (mismos filtros que /api/precios).
 */
async function exportarExcel(req, res) {
    try {
        const { categoria, proveedor, busqueda } = req.query;
        const { config, tablero } = await obtenerTablero({ categoria, proveedor, busqueda });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'MPV Dental';
        workbook.created = new Date();

        const hoja = workbook.addWorksheet('Tablero de Precios', {
            views: [{ state: 'frozen', ySplit: 4 }],
            pageSetup: { orientation: 'landscape', fitToPage: true },
        });

        hoja.mergeCells('A1:K1');
        hoja.getCell('A1').value = 'MPV Dental — Tablero de Precios de Compra y Venta';
        hoja.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1D4ED8' } };

        hoja.mergeCells('A2:K2');
        hoja.getCell('A2').value =
            `Generado el ${new Date().toLocaleString('es-PE')} — Margen por defecto: ${config.margen_utilidad_defecto_pct}% — Impuesto: ${config.porcentaje_impuesto}%`;
        hoja.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

        const columnas = [
            { header: 'SKU', key: 'sku', width: 14 },
            { header: 'Producto', key: 'producto', width: 32 },
            { header: 'Categoría', key: 'categoria', width: 20 },
            { header: 'Proveedor', key: 'proveedor', width: 22 },
            { header: 'Proveedor Óptimo', key: 'optimo', width: 16 },
            { header: 'Precio de Compra', key: 'precioCompra', width: 16 },
            { header: 'Costo Logístico', key: 'costoLogisticoUnitario', width: 15 },
            { header: 'Costo Total', key: 'costoTotalUnitario', width: 14 },
            { header: 'Margen Real %', key: 'margenRealPct', width: 14 },
            { header: 'Impuesto', key: 'montoImpuesto', width: 13 },
            { header: 'PVP Sugerido', key: 'pvpSugerido', width: 15 },
        ];
        hoja.columns = columnas.map((c) => ({ key: c.key, width: c.width }));

        const filaEncabezado = hoja.getRow(4);
        columnas.forEach((c, i) => {
            const celda = filaEncabezado.getCell(i + 1);
            celda.value = c.header;
            celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
            celda.alignment = { vertical: 'middle', horizontal: 'center' };
        });
        hoja.autoFilter = { from: 'A4', to: 'K4' };

        tablero.forEach((fila) => {
            const filaExcel = hoja.addRow({
                sku: fila.sku,
                producto: fila.producto,
                categoria: fila.categoria || '—',
                proveedor: fila.proveedor,
                optimo: fila.esProveedorOptimo ? 'Sí' : 'No',
                precioCompra: fila.precioCompra,
                costoLogisticoUnitario: fila.costoLogisticoUnitario,
                costoTotalUnitario: fila.costoTotalUnitario,
                margenRealPct: fila.margenRealPct / 100,
                montoImpuesto: fila.montoImpuesto,
                pvpSugerido: fila.pvpSugerido,
            });

            ['precioCompra', 'costoLogisticoUnitario', 'costoTotalUnitario', 'montoImpuesto', 'pvpSugerido'].forEach((key) => {
                filaExcel.getCell(columnas.findIndex((c) => c.key === key) + 1).numFmt = '"S/" #,##0.00';
            });
            filaExcel.getCell(columnas.findIndex((c) => c.key === 'margenRealPct') + 1).numFmt = '0.0%';

            if (fila.esProveedorOptimo) {
                filaExcel.getCell(columnas.findIndex((c) => c.key === 'optimo') + 1).font = { color: { argb: 'FF059669' }, bold: true };
            }
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="mpv-dental-precios-${timestampArchivo()}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/**
 * GET /api/precios/exportar/pdf
 * Genera un reporte PDF (horizontal) del tablero de precios.
 */
async function exportarPDF(req, res) {
    try {
        const { categoria, proveedor, busqueda } = req.query;
        const { config, tablero } = await obtenerTablero({ categoria, proveedor, busqueda });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="mpv-dental-precios-${timestampArchivo()}.pdf"`);

        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
        doc.pipe(res);

        const columnas = [
            { label: 'SKU', width: 55 },
            { label: 'Producto', width: 150 },
            { label: 'Proveedor', width: 105 },
            { label: 'P. Compra', width: 65, align: 'right' },
            { label: 'Costo Total', width: 65, align: 'right' },
            { label: 'Margen %', width: 60, align: 'right' },
            { label: 'PVP Sugerido', width: 75, align: 'right' },
            { label: 'Óptimo', width: 50, align: 'center' },
        ];
        const anchoTabla = columnas.reduce((s, c) => s + c.width, 0);
        const xInicio = doc.page.margins.left;

        function dibujarEncabezadoDocumento() {
            doc.fontSize(16).fillColor('#1d4ed8').font('Helvetica-Bold')
                .text('MPV Dental — Tablero de Precios de Compra y Venta', xInicio, 30);
            doc.fontSize(8).fillColor('#64748b').font('Helvetica')
                .text(
                    `Generado el ${new Date().toLocaleString('es-PE')}  ·  Margen por defecto: ${config.margen_utilidad_defecto_pct}%  ·  Impuesto: ${config.porcentaje_impuesto}%  ·  ${tablero.length} registros`,
                    xInicio, 50
                );
        }

        function dibujarEncabezadoTabla(y) {
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
            doc.rect(xInicio, y, anchoTabla, 20).fill('#2563eb');
            let x = xInicio;
            columnas.forEach((c) => {
                doc.fillColor('#ffffff').text(c.label, x + 4, y + 6, { width: c.width - 8, align: c.align || 'left' });
                x += c.width;
            });
            return y + 20;
        }

        let y = 75;
        dibujarEncabezadoDocumento();
        y = dibujarEncabezadoTabla(y);

        const alturaFila = 18;
        const yLimite = doc.page.height - doc.page.margins.bottom - 20;

        tablero.forEach((fila, idx) => {
            if (y + alturaFila > yLimite) {
                doc.addPage();
                y = 40;
                y = dibujarEncabezadoTabla(y);
            }

            if (idx % 2 === 0) {
                doc.rect(xInicio, y, anchoTabla, alturaFila).fill('#f8fafc');
            }

            const valores = [
                fila.sku,
                fila.producto,
                fila.proveedor,
                formatoMoneda(fila.precioCompra),
                formatoMoneda(fila.costoTotalUnitario),
                `${fila.margenRealPct.toFixed(1)}%`,
                formatoMoneda(fila.pvpSugerido),
                fila.esProveedorOptimo ? 'Sí' : '—',
            ];

            let x = xInicio;
            doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
            columnas.forEach((c, i) => {
                doc.fillColor(fila.esProveedorOptimo && i === 7 ? '#059669' : '#0f172a')
                    .text(String(valores[i]), x + 4, y + 5, { width: c.width - 8, align: c.align || 'left' });
                x += c.width;
            });

            y += alturaFila;
        });

        doc.end();
    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).json({ ok: false, error: err.message });
        } else {
            res.end();
        }
    }
}

module.exports = { exportarExcel, exportarPDF };
