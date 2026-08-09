const ExcelJS = require('exceljs');
const pool = require('../config/db');
const { parsearArchivoPrecios, validarFila } = require('../services/importarPrecios');

/**
 * GET /api/precios/plantilla-carga
 * Genera un .xlsx de ejemplo con las columnas esperadas para la carga masiva.
 */
async function descargarPlantilla(req, res) {
    try {
        const workbook = new ExcelJS.Workbook();
        const hoja = workbook.addWorksheet('Precios');

        hoja.columns = [
            { header: 'SKU', key: 'sku', width: 16 },
            { header: 'Proveedor', key: 'proveedor', width: 26 },
            { header: 'PrecioCompra', key: 'preciocompra', width: 16 },
            { header: 'TiempoEntregaDias', key: 'tiempoentregadias', width: 20 },
        ];
        hoja.getRow(1).font = { bold: true };
        hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        hoja.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });

        hoja.addRow({ sku: 'RES-001', proveedor: 'DentalSupply Corp', preciocompra: 8.5, tiempoentregadias: 5 });
        hoja.addRow({ sku: 'GUA-100', proveedor: 'BioDent Import', preciocompra: 13.1, tiempoentregadias: 3 });

        hoja.getCell('F1').value = 'SKU y Proveedor deben coincidir exactamente con un producto y proveedor ya registrados.';
        hoja.getCell('F1').font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="mpv-dental-plantilla-precios.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

/**
 * POST /api/precios/importar
 * Carga masiva de precios de compra desde un .csv o .xlsx.
 * Empareja cada fila por SKU (producto) y nombre de proveedor; si la
 * combinación proveedor-producto ya existe, actualiza el precio (y el
 * tiempo de entrega si se envía); si no existe, la crea.
 */
async function importarPrecios(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, error: 'Debes adjuntar un archivo .csv o .xlsx' });
        }

        let filas;
        try {
            filas = await parsearArchivoPrecios(req.file.buffer, req.file.originalname);
        } catch (err) {
            return res.status(400).json({ ok: false, error: err.message });
        }

        if (filas.length === 0) {
            return res.status(400).json({ ok: false, error: 'El archivo no tiene filas de datos' });
        }

        const [{ rows: productos }, { rows: proveedores }] = await Promise.all([
            pool.query('SELECT id, sku FROM productos WHERE activo = TRUE'),
            pool.query('SELECT id, nombre FROM proveedores WHERE activo = TRUE'),
        ]);
        const productosPorSku = new Map(productos.map((p) => [p.sku.toLowerCase(), p.id]));
        const proveedoresPorNombre = new Map(proveedores.map((p) => [p.nombre.toLowerCase(), p.id]));

        const resultado = { totalFilas: filas.length, exitosas: 0, fallidas: 0, errores: [] };

        for (let i = 0; i < filas.length; i++) {
            const numeroFila = i + 2; // +1 por encabezado, +1 por índice base 0
            const { valido, errores, datos } = validarFila(filas[i]);

            if (!valido) {
                resultado.fallidas++;
                resultado.errores.push({ fila: numeroFila, motivo: errores.join('; ') });
                continue;
            }

            const productoId = productosPorSku.get(datos.sku.toLowerCase());
            const proveedorId = proveedoresPorNombre.get(datos.proveedor.toLowerCase());

            if (!productoId) {
                resultado.fallidas++;
                resultado.errores.push({ fila: numeroFila, motivo: `No existe un producto activo con SKU "${datos.sku}"` });
                continue;
            }
            if (!proveedorId) {
                resultado.fallidas++;
                resultado.errores.push({ fila: numeroFila, motivo: `No existe un proveedor activo llamado "${datos.proveedor}"` });
                continue;
            }

            try {
                if (datos.tiempoEntregaDias !== null) {
                    await pool.query(
                        `INSERT INTO proveedor_producto (proveedor_id, producto_id, precio_compra_unitario, tiempo_entrega_dias)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (proveedor_id, producto_id)
                         DO UPDATE SET precio_compra_unitario = EXCLUDED.precio_compra_unitario,
                                       tiempo_entrega_dias = EXCLUDED.tiempo_entrega_dias`,
                        [proveedorId, productoId, datos.precioCompra, datos.tiempoEntregaDias]
                    );
                } else {
                    await pool.query(
                        `INSERT INTO proveedor_producto (proveedor_id, producto_id, precio_compra_unitario, tiempo_entrega_dias)
                         VALUES ($1, $2, $3, 0)
                         ON CONFLICT (proveedor_id, producto_id)
                         DO UPDATE SET precio_compra_unitario = EXCLUDED.precio_compra_unitario`,
                        [proveedorId, productoId, datos.precioCompra]
                    );
                }
                resultado.exitosas++;
            } catch (err) {
                resultado.fallidas++;
                resultado.errores.push({ fila: numeroFila, motivo: 'Error al guardar en la base de datos' });
                console.error(`Fila ${numeroFila}:`, err);
            }
        }

        res.json({ ok: true, ...resultado });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = { descargarPlantilla, importarPrecios };
