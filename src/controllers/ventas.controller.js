const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const pool = require('../config/db');
const { registrarVenta, listarVentas, listarProductosDisponibles, obtenerVentaPorId, obtenerKpisVentas, obtenerTendenciaVentas } = require('../services/ventas');
const { registrarEvento } = require('../services/bitacora');

async function crearVenta(req, res) {
    try {
        const { items, cliente, metodoPago } = req.body;
        const venta = await registrarVenta({ items, cliente, metodoPago, usuarioId: req.user?.sub });
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'crear',
            entidad: 'venta',
            entidadId: venta.id,
            detalle: `Registró una venta de S/ ${Number(venta.total).toFixed(2)}`,
        });
        res.status(201).json({ ok: true, data: venta });
    } catch (err) {
        // Errores de negocio (stock insuficiente, producto sin proveedor, etc.)
        // se devuelven como 400 para que el frontend muestre el motivo real.
        res.status(400).json({ ok: false, error: err.message });
    }
}

async function listar(req, res) {
    try {
        const { desde, hasta, cliente, metodoPago } = req.query;
        const limite = req.query.limite ? Number(req.query.limite) : 50;
        const ventas = await listarVentas({ limite, desde, hasta, cliente, metodoPago });
        res.json({ ok: true, data: ventas });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function kpis(req, res) {
    try {
        const data = await obtenerKpisVentas();
        res.json({ ok: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function tendencia(req, res) {
    try {
        const dias = req.query.dias ? Number(req.query.dias) : 30;
        const data = await obtenerTendenciaVentas({ dias });
        res.json({ ok: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function listarDisponibles(req, res) {
    try {
        const productos = await listarProductosDisponibles();
        res.json({ ok: true, data: productos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

const formatoMoneda = (n) => `S/ ${Number(n).toFixed(2)}`;

const ETIQUETAS_METODO_PAGO = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    yape_plin: 'Yape / Plin',
    transferencia: 'Transferencia',
};

const timestampArchivo = () => new Date().toISOString().slice(0, 10);

const resumenProductos = (items) =>
    (items || []).map((i) => `${i.producto} x${i.cantidad}`).join(', ') || '—';

/**
 * GET /api/ventas/exportar/excel — respeta los mismos filtros que /api/ventas.
 */
async function exportarVentasExcel(req, res) {
    try {
        const { desde, hasta, cliente, metodoPago } = req.query;
        const ventas = await listarVentas({ limite: 1000, desde, hasta, cliente, metodoPago });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'MPV Dental';
        workbook.created = new Date();

        const hoja = workbook.addWorksheet('Ventas de Mostrador', {
            views: [{ state: 'frozen', ySplit: 4 }],
            pageSetup: { orientation: 'landscape', fitToPage: true },
        });

        hoja.mergeCells('A1:F1');
        hoja.getCell('A1').value = 'MPV Dental — Historial de Ventas de Mostrador';
        hoja.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1D4ED8' } };

        hoja.mergeCells('A2:F2');
        hoja.getCell('A2').value = `Generado el ${new Date().toLocaleString('es-PE')} — ${ventas.length} venta${ventas.length === 1 ? '' : 's'}`;
        hoja.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

        const columnas = [
            { header: 'Fecha', key: 'fecha', width: 20 },
            { header: 'Cliente', key: 'cliente', width: 26 },
            { header: 'Productos', key: 'productos', width: 48 },
            { header: 'Método de Pago', key: 'metodoPago', width: 18 },
            { header: 'Atendido por', key: 'atendidoPor', width: 22 },
            { header: 'Total', key: 'total', width: 14 },
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
        hoja.autoFilter = { from: 'A4', to: 'F4' };

        ventas.forEach((v) => {
            const filaExcel = hoja.addRow({
                fecha: new Date(v.created_at).toLocaleString('es-PE'),
                cliente: v.cliente || 'Cliente varios',
                productos: resumenProductos(v.items),
                metodoPago: ETIQUETAS_METODO_PAGO[v.metodo_pago] || v.metodo_pago,
                atendidoPor: v.usuario_nombre || '—',
                total: Number(v.total),
            });
            filaExcel.getCell(6).numFmt = '"S/" #,##0.00';
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="mpv-dental-ventas-${timestampArchivo()}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/**
 * GET /api/ventas/exportar/pdf — reporte PDF horizontal del historial de ventas.
 */
async function exportarVentasPDF(req, res) {
    try {
        const { desde, hasta, cliente, metodoPago } = req.query;
        const ventas = await listarVentas({ limite: 1000, desde, hasta, cliente, metodoPago });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="mpv-dental-ventas-${timestampArchivo()}.pdf"`);

        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
        doc.pipe(res);

        const columnas = [
            { label: 'Fecha', width: 90 },
            { label: 'Cliente', width: 120 },
            { label: 'Productos', width: 300 },
            { label: 'Método de Pago', width: 90 },
            { label: 'Atendido por', width: 100 },
            { label: 'Total', width: 65, align: 'right' },
        ];
        const anchoTabla = columnas.reduce((s, c) => s + c.width, 0);
        const xInicio = doc.page.margins.left;

        function dibujarEncabezadoDocumento() {
            doc.fontSize(16).fillColor('#1d4ed8').font('Helvetica-Bold')
                .text('MPV Dental — Historial de Ventas de Mostrador', xInicio, 30);
            doc.fontSize(8).fillColor('#64748b').font('Helvetica')
                .text(`Generado el ${new Date().toLocaleString('es-PE')}  ·  ${ventas.length} registros`, xInicio, 50);
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

        const yLimite = doc.page.height - doc.page.margins.bottom - 20;

        ventas.forEach((v, idx) => {
            const valores = [
                new Date(v.created_at).toLocaleString('es-PE'),
                v.cliente || 'Cliente varios',
                resumenProductos(v.items),
                ETIQUETAS_METODO_PAGO[v.metodo_pago] || v.metodo_pago,
                v.usuario_nombre || '—',
                formatoMoneda(v.total),
            ];
            const alturaFila = Math.max(
                ...columnas.map((c, i) => doc.font('Helvetica').fontSize(8).heightOfString(String(valores[i]), { width: c.width - 8 })),
                16
            ) + 6;

            if (y + alturaFila > yLimite) {
                doc.addPage();
                y = 40;
                y = dibujarEncabezadoTabla(y);
            }

            if (idx % 2 === 0) {
                doc.rect(xInicio, y, anchoTabla, alturaFila).fill('#f8fafc');
            }

            let x = xInicio;
            doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
            columnas.forEach((c, i) => {
                doc.fillColor('#0f172a').text(String(valores[i]), x + 4, y + 5, { width: c.width - 8, align: c.align || 'left' });
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

/**
 * GET /api/ventas/:id/boleta — comprobante en PDF para entregar al cliente
 * en el momento. Se llama "provisional" a propósito: mientras el negocio no
 * tenga RUC/registro en SUNAT, no puede emitir una boleta de venta
 * electrónica real, así que este documento lo deja explícito en vez de
 * simular un comprobante tributario que no es válido.
 */
async function generarBoletaPdf(req, res) {
    try {
        const venta = await obtenerVentaPorId(req.params.id);
        if (!venta) {
            return res.status(404).json({ ok: false, error: 'Venta no encontrada' });
        }

        const { rows: cfgRows } = await pool.query('SELECT * FROM configuracion_tienda WHERE id = 1');
        const cfg = cfgRows[0] || {};
        const nombreNegocio = [cfg.nombre_negocio, cfg.eslogan].filter(Boolean).join(' ') || 'MPV Dental';

        const numeroBoleta = `P-${String(venta.id).padStart(6, '0')}`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="boleta-${numeroBoleta}.pdf"`);

        const doc = new PDFDocument({ size: 'A5', margin: 28 });
        doc.pipe(res);

        const xInicio = doc.page.margins.left;
        const xFin = doc.page.width - doc.page.margins.right;
        const anchoUtil = xFin - xInicio;
        const linea = () => doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(xInicio, doc.y).lineTo(xFin, doc.y).stroke();

        doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text(nombreNegocio, { align: 'center' });
        if (cfg.direccion) doc.font('Helvetica').fontSize(8).fillColor('#475569').text(cfg.direccion, { align: 'center' });
        if (cfg.telefono) doc.font('Helvetica').fontSize(8).fillColor('#475569').text(`Tel: ${cfg.telefono}`, { align: 'center' });

        doc.moveDown(0.6);
        linea();
        doc.moveDown(0.5);

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('COMPROBANTE DE VENTA', { align: 'center' });

        doc.moveDown(0.7);
        doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
        doc.text(`N° de comprobante: ${numeroBoleta}`);
        doc.text(`Fecha: ${new Date(venta.created_at).toLocaleString('es-PE')}`);
        doc.text(`Cliente: ${venta.cliente || 'Cliente varios'}`);
        doc.text(`Método de pago: ${ETIQUETAS_METODO_PAGO[venta.metodo_pago] || venta.metodo_pago}`);
        if (venta.usuario_nombre) doc.text(`Atendido por: ${venta.usuario_nombre}`);

        doc.moveDown(0.5);
        linea();
        doc.moveDown(0.4);

        const colProducto = anchoUtil * 0.44;
        const colCant = anchoUtil * 0.14;
        const colPrecio = anchoUtil * 0.2;
        const colSubtotal = anchoUtil * 0.22;

        let y = doc.y;
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a');
        doc.text('Producto', xInicio, y, { width: colProducto });
        doc.text('Cant.', xInicio + colProducto, y, { width: colCant, align: 'right' });
        doc.text('P. Unit.', xInicio + colProducto + colCant, y, { width: colPrecio, align: 'right' });
        doc.text('Subtotal', xInicio + colProducto + colCant + colPrecio, y, { width: colSubtotal, align: 'right' });
        y += 14;
        doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(xInicio, y - 2).lineTo(xFin, y - 2).stroke();

        doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
        venta.items.forEach((item) => {
            const alturaTexto = doc.heightOfString(item.producto, { width: colProducto });
            doc.text(item.producto, xInicio, y, { width: colProducto });
            doc.text(String(item.cantidad), xInicio + colProducto, y, { width: colCant, align: 'right' });
            doc.text(formatoMoneda(item.precioUnitario), xInicio + colProducto + colCant, y, { width: colPrecio, align: 'right' });
            doc.text(formatoMoneda(item.subtotal), xInicio + colProducto + colCant + colPrecio, y, { width: colSubtotal, align: 'right' });
            y += Math.max(alturaTexto, 12) + 5;
        });

        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(xInicio, y).lineTo(xFin, y).stroke();
        y += 10;

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a');
        doc.text('TOTAL', xInicio, y, { width: colProducto + colCant + colPrecio, align: 'right' });
        doc.text(formatoMoneda(venta.total), xInicio + colProducto + colCant + colPrecio, y, { width: colSubtotal, align: 'right' });

        doc.y = y + 28;
        doc.font('Helvetica').fontSize(8).fillColor('#475569').text('Gracias por su compra.', xInicio, doc.y, { width: anchoUtil, align: 'center' });

        // Letra chica a propósito: es una aclaración legal, no el mensaje
        // principal del comprobante — no debe competir visualmente con el
        // total ni con el nombre del negocio.
        doc.moveDown(0.8);
        doc.font('Helvetica').fontSize(6).fillColor('#94a3b8')
            .text('Comprobante provisional, sin validez tributaria. Negocio en proceso de registro ante SUNAT.', xInicio, doc.y, { width: anchoUtil, align: 'center' });

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

module.exports = {
    crearVenta,
    listar,
    listarDisponibles,
    generarBoletaPdf,
    kpis,
    tendencia,
    exportarVentasExcel,
    exportarVentasPDF,
};
