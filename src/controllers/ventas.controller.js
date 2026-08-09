const PDFDocument = require('pdfkit');
const pool = require('../config/db');
const { registrarVenta, listarVentas, listarProductosDisponibles, obtenerVentaPorId } = require('../services/ventas');

async function crearVenta(req, res) {
    try {
        const { items, cliente, metodoPago } = req.body;
        const venta = await registrarVenta({ items, cliente, metodoPago, usuarioId: req.user?.sub });
        res.status(201).json({ ok: true, data: venta });
    } catch (err) {
        // Errores de negocio (stock insuficiente, producto sin proveedor, etc.)
        // se devuelven como 400 para que el frontend muestre el motivo real.
        res.status(400).json({ ok: false, error: err.message });
    }
}

async function listar(req, res) {
    try {
        const limite = req.query.limite ? Number(req.query.limite) : 20;
        const ventas = await listarVentas({ limite });
        res.json({ ok: true, data: ventas });
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
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#b45309').text('(PROVISIONAL — SIN VALIDEZ TRIBUTARIA)', { align: 'center' });
        doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('Negocio en proceso de registro ante SUNAT.', { align: 'center' });

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

module.exports = { crearVenta, listar, listarDisponibles, generarBoletaPdf };
