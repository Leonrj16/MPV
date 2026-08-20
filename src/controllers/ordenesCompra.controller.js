const PDFDocument = require('pdfkit');
const {
    sugerirOrdenesCompra,
    crearOrdenCompra,
    listarOrdenesCompra,
    obtenerOrdenCompra,
    actualizarEstadoOrdenCompra,
} = require('../services/ordenesCompra');
const { registrarEvento } = require('../services/bitacora');

const formatoMoneda = (n) => `S/ ${Number(n).toFixed(2)}`;

/** GET /api/ordenes-compra/sugerencias */
async function sugerencias(req, res) {
    try {
        const data = await sugerirOrdenesCompra();
        res.json({ ok: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/** GET /api/ordenes-compra */
async function listar(req, res) {
    try {
        const data = await listarOrdenesCompra({ estado: req.query.estado });
        res.json({ ok: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/** GET /api/ordenes-compra/:id */
async function obtener(req, res) {
    try {
        const orden = await obtenerOrdenCompra(req.params.id);
        if (!orden) {
            return res.status(404).json({ ok: false, error: 'Orden de compra no encontrada' });
        }
        res.json({ ok: true, data: orden });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/** POST /api/ordenes-compra */
async function crear(req, res) {
    try {
        const { proveedorId, items, notas } = req.body;
        const orden = await crearOrdenCompra({ proveedorId, items, notas, usuarioId: req.user?.sub });
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'crear',
            entidad: 'orden_compra',
            entidadId: orden.id,
            detalle: `Creó la orden de compra #${orden.id} por ${formatoMoneda(orden.total)}`,
        });
        res.status(201).json({ ok: true, data: orden });
    } catch (err) {
        console.error(err);
        res.status(400).json({ ok: false, error: err.message });
    }
}

/** PUT /api/ordenes-compra/:id/estado */
async function cambiarEstado(req, res) {
    try {
        const { estado } = req.body;
        const orden = await actualizarEstadoOrdenCompra(req.params.id, estado, req.user?.sub);
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'actualizar',
            entidad: 'orden_compra',
            entidadId: orden.id,
            detalle: `Marcó la orden de compra #${orden.id} como "${estado}"`,
        });
        res.json({ ok: true, data: orden });
    } catch (err) {
        console.error(err);
        res.status(400).json({ ok: false, error: err.message });
    }
}

/** GET /api/ordenes-compra/:id/pdf — documento para enviarle al proveedor */
async function exportarPDF(req, res) {
    try {
        const orden = await obtenerOrdenCompra(req.params.id);
        if (!orden) {
            return res.status(404).json({ ok: false, error: 'Orden de compra no encontrada' });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="orden-compra-${orden.id}.pdf"`);

        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        doc.pipe(res);

        doc.fontSize(18).fillColor('#1d4ed8').font('Helvetica-Bold')
            .text(`Orden de Compra #${orden.id}`, { align: 'left' });
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#64748b').font('Helvetica')
            .text(`Generada el ${new Date(orden.created_at).toLocaleString('es-PE')}`);
        doc.moveDown(1);

        doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold').text('Proveedor');
        doc.fontSize(10).font('Helvetica').fillColor('#0f172a');
        doc.text(orden.proveedor_nombre);
        if (orden.contacto) doc.text(`Contacto: ${orden.contacto}`);
        if (orden.telefono) doc.text(`Teléfono: ${orden.telefono}`);
        if (orden.email) doc.text(`Email: ${orden.email}`);
        if (orden.direccion) doc.text(`Dirección: ${orden.direccion}`);
        doc.moveDown(1);

        if (orden.notas) {
            doc.fontSize(11).font('Helvetica-Bold').text('Notas');
            doc.fontSize(10).font('Helvetica').text(orden.notas);
            doc.moveDown(1);
        }

        const columnas = [
            { label: 'SKU', width: 70 },
            { label: 'Producto', width: 210 },
            { label: 'Cantidad', width: 70, align: 'right' },
            { label: 'P. Unit.', width: 80, align: 'right' },
            { label: 'Subtotal', width: 85, align: 'right' },
        ];
        const anchoTabla = columnas.reduce((s, c) => s + c.width, 0);
        const xInicio = doc.page.margins.left;
        let y = doc.y;

        function dibujarEncabezadoTabla(yPos) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
            doc.rect(xInicio, yPos, anchoTabla, 20).fill('#2563eb');
            let x = xInicio;
            columnas.forEach((c) => {
                doc.fillColor('#ffffff').text(c.label, x + 4, yPos + 6, { width: c.width - 8, align: c.align || 'left' });
                x += c.width;
            });
            return yPos + 20;
        }

        y = dibujarEncabezadoTabla(y);
        const alturaFila = 18;
        const yLimite = doc.page.height - doc.page.margins.bottom - 20;

        orden.items.forEach((item, idx) => {
            if (y + alturaFila > yLimite) {
                doc.addPage();
                y = 40;
                y = dibujarEncabezadoTabla(y);
            }
            if (idx % 2 === 0) {
                doc.rect(xInicio, y, anchoTabla, alturaFila).fill('#f8fafc');
            }
            const valores = [
                item.sku,
                item.producto_nombre,
                String(item.cantidad),
                formatoMoneda(item.precio_compra_unitario),
                formatoMoneda(item.subtotal),
            ];
            let x = xInicio;
            doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
            columnas.forEach((c, i) => {
                doc.text(String(valores[i]), x + 4, y + 5, { width: c.width - 8, align: c.align || 'left' });
                x += c.width;
            });
            y += alturaFila;
        });

        if (y + alturaFila > yLimite) {
            doc.addPage();
            y = 40;
        }
        doc.rect(xInicio, y, anchoTabla, alturaFila).fill('#e2e8f0');
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a')
            .text('TOTAL', xInicio + 4, y + 5, { width: columnas[0].width + columnas[1].width + columnas[2].width + columnas[3].width - 8 });
        doc.text(formatoMoneda(orden.total), xInicio + columnas[0].width + columnas[1].width + columnas[2].width + columnas[3].width + 4, y + 5, {
            width: columnas[4].width - 8,
            align: 'right',
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

module.exports = { sugerencias, listar, obtener, crear, cambiarEstado, exportarPDF };
