const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { obtenerInventarioValorizado, obtenerClientesFrecuentes } = require('../services/reportes');

const formatoMoneda = (n) => `S/ ${Number(n).toFixed(2)}`;
const timestampArchivo = () => new Date().toISOString().slice(0, 10);

/** GET /api/reportes/inventario */
async function obtenerInventario(req, res) {
    try {
        const data = await obtenerInventarioValorizado();
        res.json({ ok: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/** GET /api/reportes/inventario/exportar/excel */
async function exportarInventarioExcel(req, res) {
    try {
        const { productos, totales } = await obtenerInventarioValorizado();

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'MPV Dental';
        workbook.created = new Date();

        const hoja = workbook.addWorksheet('Inventario Valorizado', {
            views: [{ state: 'frozen', ySplit: 4 }],
            pageSetup: { orientation: 'landscape', fitToPage: true },
        });

        hoja.mergeCells('A1:H1');
        hoja.getCell('A1').value = 'MPV Dental — Inventario Valorizado';
        hoja.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1D4ED8' } };

        hoja.mergeCells('A2:H2');
        hoja.getCell('A2').value =
            `Generado el ${new Date().toLocaleString('es-PE')} — Valor de compra total: ${formatoMoneda(totales.valorCompra)} — Venta potencial: ${formatoMoneda(totales.valorVentaPotencial)}`;
        hoja.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

        const columnas = [
            { header: 'SKU', key: 'sku', width: 14 },
            { header: 'Producto', key: 'nombre', width: 32 },
            { header: 'Categoría', key: 'categoria', width: 20 },
            { header: 'Stock', key: 'stock', width: 10 },
            { header: 'Precio Compra Unit.', key: 'precioCompraUnitario', width: 17 },
            { header: 'Valor de Compra', key: 'valorCompra', width: 16 },
            { header: 'Valor de Venta Potencial', key: 'valorVentaPotencial', width: 20 },
            { header: 'Margen Potencial', key: 'margenPotencial', width: 16 },
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
        hoja.autoFilter = { from: 'A4', to: 'H4' };

        productos.forEach((p) => {
            const fila = hoja.addRow({
                sku: p.sku,
                nombre: p.nombre,
                categoria: p.categoria,
                stock: p.stock,
                precioCompraUnitario: p.precioCompraUnitario,
                valorCompra: p.valorCompra,
                valorVentaPotencial: p.valorVentaPotencial,
                margenPotencial: p.margenPotencial,
            });
            ['precioCompraUnitario', 'valorCompra', 'valorVentaPotencial', 'margenPotencial'].forEach((key) => {
                fila.getCell(columnas.findIndex((c) => c.key === key) + 1).numFmt = '"S/" #,##0.00';
            });
            if (p.sinPrecio) {
                fila.getCell(columnas.findIndex((c) => c.key === 'nombre') + 1).font = { color: { argb: 'FFB91C1C' } };
            }
        });

        const filaTotal = hoja.addRow({ nombre: 'TOTAL', valorCompra: totales.valorCompra, valorVentaPotencial: totales.valorVentaPotencial, margenPotencial: totales.margenPotencial });
        filaTotal.font = { bold: true };
        ['valorCompra', 'valorVentaPotencial', 'margenPotencial'].forEach((key) => {
            filaTotal.getCell(columnas.findIndex((c) => c.key === key) + 1).numFmt = '"S/" #,##0.00';
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="mpv-dental-inventario-${timestampArchivo()}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/** GET /api/reportes/inventario/exportar/pdf */
async function exportarInventarioPDF(req, res) {
    try {
        const { productos, totales } = await obtenerInventarioValorizado();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="mpv-dental-inventario-${timestampArchivo()}.pdf"`);

        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
        doc.pipe(res);

        const columnas = [
            { label: 'SKU', width: 60 },
            { label: 'Producto', width: 190 },
            { label: 'Categoría', width: 130 },
            { label: 'Stock', width: 50, align: 'right' },
            { label: 'P. Compra', width: 70, align: 'right' },
            { label: 'Valor Compra', width: 85, align: 'right' },
            { label: 'Valor Venta Pot.', width: 95, align: 'right' },
            { label: 'Margen Pot.', width: 85, align: 'right' },
        ];
        const anchoTabla = columnas.reduce((s, c) => s + c.width, 0);
        const xInicio = doc.page.margins.left;

        function dibujarEncabezadoDocumento() {
            doc.fontSize(16).fillColor('#1d4ed8').font('Helvetica-Bold')
                .text('MPV Dental — Inventario Valorizado', xInicio, 30);
            doc.fontSize(8).fillColor('#64748b').font('Helvetica')
                .text(
                    `Generado el ${new Date().toLocaleString('es-PE')}  ·  Valor de compra: ${formatoMoneda(totales.valorCompra)}  ·  Venta potencial: ${formatoMoneda(totales.valorVentaPotencial)}  ·  Margen potencial: ${formatoMoneda(totales.margenPotencial)}`,
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

        productos.forEach((p, idx) => {
            if (y + alturaFila > yLimite) {
                doc.addPage();
                y = 40;
                y = dibujarEncabezadoTabla(y);
            }
            if (idx % 2 === 0) {
                doc.rect(xInicio, y, anchoTabla, alturaFila).fill('#f8fafc');
            }

            const valores = [
                p.sku,
                p.nombre,
                p.categoria,
                String(p.stock),
                p.sinPrecio ? '—' : formatoMoneda(p.precioCompraUnitario),
                formatoMoneda(p.valorCompra),
                formatoMoneda(p.valorVentaPotencial),
                formatoMoneda(p.margenPotencial),
            ];

            let x = xInicio;
            doc.font('Helvetica').fontSize(8);
            columnas.forEach((c, i) => {
                doc.fillColor(p.sinPrecio && i === 1 ? '#b91c1c' : '#0f172a')
                    .text(String(valores[i]), x + 4, y + 5, { width: c.width - 8, align: c.align || 'left' });
                x += c.width;
            });
            y += alturaFila;
        });

        if (y + alturaFila > yLimite) {
            doc.addPage();
            y = 40;
        }
        doc.rect(xInicio, y, anchoTabla, alturaFila).fill('#e2e8f0');
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a')
            .text('TOTAL', xInicio + 4, y + 5, { width: columnas[0].width + columnas[1].width + columnas[2].width + columnas[3].width + columnas[4].width - 8 });
        let xTotales = xInicio + columnas[0].width + columnas[1].width + columnas[2].width + columnas[3].width + columnas[4].width;
        [totales.valorCompra, totales.valorVentaPotencial, totales.margenPotencial].forEach((valor, i) => {
            doc.text(formatoMoneda(valor), xTotales + 4, y + 5, { width: columnas[5 + i].width - 8, align: 'right' });
            xTotales += columnas[5 + i].width;
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

/** GET /api/reportes/clientes-frecuentes */
async function obtenerClientesFrecuentesCtrl(req, res) {
    try {
        const data = await obtenerClientesFrecuentes();
        res.json({ ok: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/** GET /api/reportes/clientes-frecuentes/exportar/excel */
async function exportarClientesFrecuentesExcel(req, res) {
    try {
        const { clientes, totales } = await obtenerClientesFrecuentes();

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'MPV Dental';
        workbook.created = new Date();

        const hoja = workbook.addWorksheet('Clientes Frecuentes', {
            views: [{ state: 'frozen', ySplit: 4 }],
            pageSetup: { orientation: 'landscape', fitToPage: true },
        });

        hoja.mergeCells('A1:G1');
        hoja.getCell('A1').value = 'MPV Dental — Clientes Frecuentes';
        hoja.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1D4ED8' } };

        hoja.mergeCells('A2:G2');
        hoja.getCell('A2').value =
            `Generado el ${new Date().toLocaleString('es-PE')} — ${totales.clientesFrecuentes} clientes con más de una compra — Total gastado: ${formatoMoneda(totales.totalGastado)}`;
        hoja.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

        const columnas = [
            { header: 'Cliente', key: 'nombre', width: 28 },
            { header: 'Teléfono', key: 'telefono', width: 16 },
            { header: 'Compras', key: 'cantidadCompras', width: 12 },
            { header: 'Total Gastado', key: 'totalGastado', width: 16 },
            { header: 'Ticket Promedio', key: 'ticketPromedio', width: 16 },
            { header: 'Primera Compra', key: 'primeraCompra', width: 18 },
            { header: 'Última Compra', key: 'ultimaCompra', width: 18 },
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
        hoja.autoFilter = { from: 'A4', to: 'G4' };

        clientes.forEach((c) => {
            const fila = hoja.addRow({
                nombre: c.nombre,
                telefono: c.telefono || 'Sin teléfono',
                cantidadCompras: c.cantidadCompras,
                totalGastado: c.totalGastado,
                ticketPromedio: c.ticketPromedio,
                primeraCompra: new Date(c.primeraCompra).toLocaleDateString('es-PE'),
                ultimaCompra: new Date(c.ultimaCompra).toLocaleDateString('es-PE'),
            });
            ['totalGastado', 'ticketPromedio'].forEach((key) => {
                fila.getCell(columnas.findIndex((col) => col.key === key) + 1).numFmt = '"S/" #,##0.00';
            });
        });

        const filaTotal = hoja.addRow({ nombre: 'TOTAL', totalGastado: totales.totalGastado });
        filaTotal.font = { bold: true };
        filaTotal.getCell(columnas.findIndex((c) => c.key === 'totalGastado') + 1).numFmt = '"S/" #,##0.00';

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="mpv-dental-clientes-frecuentes-${timestampArchivo()}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = {
    obtenerInventario,
    exportarInventarioExcel,
    exportarInventarioPDF,
    obtenerClientesFrecuentesCtrl,
    exportarClientesFrecuentesExcel,
};
