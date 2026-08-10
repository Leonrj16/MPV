const ExcelJS = require('exceljs');
const { registrarPedidoWeb, listarPedidosWeb, actualizarEstadoPedido } = require('../services/pedidosWeb');
const { registrarEvento } = require('../services/bitacora');
const { notificarCambioEstado } = require('../services/push');

const ESTADO_LABEL = { pendiente: 'Pendiente', atendido: 'Atendido', cancelado: 'Cancelado' };
const timestampArchivo = () => new Date().toISOString().slice(0, 10);
const resumenProductos = (items) => (items || []).map((i) => `${i.producto} x${i.cantidad}`).join(', ') || '—';

/** POST /api/tienda/pedidos — pública, la llama la tienda antes de abrir WhatsApp. */
async function crearPedido(req, res) {
    try {
        const { items, cliente, telefono, cuponCodigo } = req.body;
        const pedido = await registrarPedidoWeb({ items, cliente, telefono, cuponCodigo });
        res.status(201).json({ ok: true, data: pedido });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
}

async function listar(req, res) {
    try {
        const { estado } = req.query;
        const pedidos = await listarPedidosWeb({ estado });
        res.json({ ok: true, data: pedidos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function actualizarEstado(req, res) {
    try {
        const pedido = await actualizarEstadoPedido(req.params.id, req.body.estado);
        if (!pedido) {
            return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
        }
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'cambiar_estado',
            entidad: 'pedido_web',
            entidadId: pedido.id,
            detalle: `Cambió el estado del pedido web #${pedido.id} a "${pedido.estado}"`,
        });
        notificarCambioEstado(pedido.id, pedido.estado).catch((err) => console.error('push:', err.message));
        res.json({ ok: true, data: pedido });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
}

/** GET /api/pedidos-web/exportar/excel — respeta el filtro ?estado= de /api/pedidos-web. */
async function exportarExcel(req, res) {
    try {
        const { estado } = req.query;
        const pedidos = await listarPedidosWeb({ estado });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'MPV Dental';
        workbook.created = new Date();

        const hoja = workbook.addWorksheet('Pedidos Web', {
            views: [{ state: 'frozen', ySplit: 4 }],
            pageSetup: { orientation: 'landscape', fitToPage: true },
        });

        hoja.mergeCells('A1:F1');
        hoja.getCell('A1').value = 'MPV Dental — Pedidos de la Tienda Virtual';
        hoja.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1D4ED8' } };

        hoja.mergeCells('A2:F2');
        hoja.getCell('A2').value = `Generado el ${new Date().toLocaleString('es-PE')} — ${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'}`;
        hoja.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

        const columnas = [
            { header: 'Fecha', key: 'fecha', width: 20 },
            { header: 'Cliente', key: 'cliente', width: 22 },
            { header: 'Teléfono', key: 'telefono', width: 16 },
            { header: 'Productos', key: 'productos', width: 48 },
            { header: 'Estado', key: 'estado', width: 14 },
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

        pedidos.forEach((p) => {
            const filaExcel = hoja.addRow({
                fecha: new Date(p.created_at).toLocaleString('es-PE'),
                cliente: p.cliente || 'Cliente web',
                telefono: p.telefono || '—',
                productos: resumenProductos(p.items),
                estado: ESTADO_LABEL[p.estado] || p.estado,
                total: Number(p.total),
            });
            filaExcel.getCell(6).numFmt = '"S/" #,##0.00';
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="mpv-dental-pedidos-web-${timestampArchivo()}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { crearPedido, listar, actualizarEstado, exportarExcel };
