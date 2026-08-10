const pool = require('../config/db');
const { calcularPVP } = require('./pricingEngine');
const { obtenerConfigActiva } = require('./tableroPrecios');

/**
 * Registra una venta de mostrador: valida stock, calcula el precio de venta
 * de cada línea con el motor de precios (mismo cálculo que el tablero, a
 * partir del proveedor óptimo vigente) y descuenta el stock — todo en una
 * sola transacción para que dos ventas simultáneas del mismo producto nunca
 * dejen el stock en negativo (el SELECT ... FOR UPDATE bloquea la fila del
 * producto hasta que la transacción termina).
 *
 * @param {Object} params
 * @param {Array<{productoId:number, cantidad:number}>} params.items
 * @param {string} [params.cliente]
 * @param {string} [params.metodoPago]
 * @param {number} [params.usuarioId]
 */
async function registrarVenta({ items, cliente, metodoPago, usuarioId }) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('La venta debe incluir al menos un producto');
    }

    const config = await obtenerConfigActiva();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const detalle = [];
        let total = 0;

        for (const item of items) {
            const productoId = Number(item.productoId);
            const cantidad = Number(item.cantidad);

            if (!Number.isInteger(productoId) || productoId <= 0) {
                throw new Error('Cada línea de venta requiere un producto válido');
            }
            if (!Number.isInteger(cantidad) || cantidad <= 0) {
                throw new Error('La cantidad debe ser un número entero mayor a 0');
            }

            const { rows: productoRows } = await client.query(
                'SELECT id, nombre, stock_actual FROM productos WHERE id = $1 FOR UPDATE',
                [productoId]
            );
            if (productoRows.length === 0) {
                throw new Error(`Producto #${productoId} no encontrado`);
            }
            const producto = productoRows[0];
            if (producto.stock_actual < cantidad) {
                throw new Error(
                    `Stock insuficiente de "${producto.nombre}": disponible ${producto.stock_actual}, solicitado ${cantidad}`
                );
            }

            const { rows: optimoRows } = await client.query(
                'SELECT precio_compra_unitario FROM vw_proveedor_optimo WHERE producto_id = $1',
                [productoId]
            );
            if (optimoRows.length === 0) {
                throw new Error(`"${producto.nombre}" no tiene un proveedor activo — no se puede calcular su precio de venta`);
            }

            const { pvpSugerido } = calcularPVP({
                precioCompra: Number(optimoRows[0].precio_compra_unitario),
                config,
            });

            await client.query(
                'UPDATE productos SET stock_actual = stock_actual - $1 WHERE id = $2',
                [cantidad, productoId]
            );

            const subtotal = Math.round(pvpSugerido * cantidad * 100) / 100;
            const stockResultante = producto.stock_actual - cantidad;
            detalle.push({ productoId, nombre: producto.nombre, cantidad, precioUnitario: pvpSugerido, subtotal, stockResultante });
            total += subtotal;
        }

        total = Math.round(total * 100) / 100;

        const { rows: ventaRows } = await client.query(
            `INSERT INTO ventas (usuario_id, cliente, metodo_pago, total)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [usuarioId || null, cliente || null, metodoPago || 'efectivo', total]
        );
        const venta = ventaRows[0];

        for (const linea of detalle) {
            await client.query(
                `INSERT INTO venta_detalle (venta_id, producto_id, cantidad, precio_unitario, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [venta.id, linea.productoId, linea.cantidad, linea.precioUnitario, linea.subtotal]
            );
            // Deja rastro de por qué bajó el stock — complementa a venta_detalle
            // (que es sobre la venta) con un registro pensado para reconstruir
            // el historial de cantidades de un producto específico.
            await client.query(
                `INSERT INTO movimientos_stock (producto_id, tipo, cantidad_delta, stock_resultante, venta_id, usuario_id)
                 VALUES ($1, 'venta', $2, $3, $4, $5)`,
                [linea.productoId, -linea.cantidad, linea.stockResultante, venta.id, usuarioId || null]
            );
        }

        await client.query('COMMIT');
        return { ...venta, items: detalle };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Productos vendibles desde el punto de venta: activos, con su stock actual
 * y el PVP vigente (mismo cálculo que el tablero de precios, a partir del
 * proveedor óptimo). Un producto sin proveedor activo no tiene PVP y se
 * marca como no vendible en vez de excluirse — así el staff ve por qué no
 * puede venderlo en vez de que "desaparezca" del catálogo.
 */
async function listarProductosDisponibles() {
    const config = await obtenerConfigActiva();
    const { rows } = await pool.query(
        `SELECT p.id, p.sku, p.nombre, p.unidad_medida, p.stock_actual,
                c.nombre AS categoria_nombre,
                opt.precio_compra_unitario
         FROM productos p
         LEFT JOIN categorias c ON c.id = p.categoria_id
         LEFT JOIN vw_proveedor_optimo opt ON opt.producto_id = p.id
         WHERE p.activo = TRUE
         ORDER BY p.nombre ASC`
    );

    return rows.map((fila) => {
        const vendible = fila.precio_compra_unitario !== null;
        const pvpSugerido = vendible
            ? calcularPVP({ precioCompra: Number(fila.precio_compra_unitario), config }).pvpSugerido
            : null;
        return {
            id: fila.id,
            sku: fila.sku,
            nombre: fila.nombre,
            unidadMedida: fila.unidad_medida,
            stockActual: fila.stock_actual,
            categoria: fila.categoria_nombre,
            pvpSugerido,
            vendible,
        };
    });
}

async function listarVentas({ limite = 50, desde, hasta, cliente, metodoPago } = {}) {
    const condiciones = [];
    const valores = [];

    if (desde) {
        valores.push(desde);
        condiciones.push(`v.created_at >= $${valores.length}::date`);
    }
    if (hasta) {
        valores.push(hasta);
        condiciones.push(`v.created_at < ($${valores.length}::date + interval '1 day')`);
    }
    if (cliente) {
        valores.push(`%${cliente}%`);
        condiciones.push(`v.cliente ILIKE $${valores.length}`);
    }
    if (metodoPago) {
        valores.push(metodoPago);
        condiciones.push(`v.metodo_pago = $${valores.length}`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    valores.push(limite);

    const { rows } = await pool.query(
        `SELECT v.*, u.nombre AS usuario_nombre,
                COALESCE(json_agg(json_build_object(
                    'productoId', vd.producto_id,
                    'producto', p.nombre,
                    'sku', p.sku,
                    'cantidad', vd.cantidad,
                    'precioUnitario', vd.precio_unitario,
                    'subtotal', vd.subtotal
                ) ORDER BY vd.id) FILTER (WHERE vd.id IS NOT NULL), '[]') AS items
         FROM ventas v
         LEFT JOIN usuarios u ON u.id = v.usuario_id
         LEFT JOIN venta_detalle vd ON vd.venta_id = v.id
         LEFT JOIN productos p ON p.id = vd.producto_id
         ${where}
         GROUP BY v.id, u.nombre
         ORDER BY v.created_at DESC
         LIMIT $${valores.length}`,
        valores
    );
    return rows;
}

/**
 * Métricas de ventas reales para el dashboard — hasta esta fase el
 * dashboard solo miraba precios/márgenes, nunca lo que efectivamente se
 * vendió en el Punto de Venta.
 */
async function obtenerKpisVentas() {
    const { rows: resumenRows } = await pool.query(
        `SELECT
            COALESCE(SUM(total) FILTER (WHERE created_at >= CURRENT_DATE), 0) AS ingresos_hoy,
            COALESCE(SUM(total) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)), 0) AS ingresos_semana,
            COALESCE(SUM(total) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)), 0) AS ingresos_mes,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS ventas_hoy
         FROM ventas`
    );
    const resumen = resumenRows[0];

    const { rows: topProductos } = await pool.query(
        `SELECT p.nombre, p.sku, SUM(vd.cantidad) AS cantidad_vendida, SUM(vd.subtotal) AS ingreso_total
         FROM venta_detalle vd
         JOIN productos p ON p.id = vd.producto_id
         JOIN ventas v ON v.id = vd.venta_id
         WHERE v.created_at >= date_trunc('month', CURRENT_DATE)
         GROUP BY p.id, p.nombre, p.sku
         ORDER BY cantidad_vendida DESC
         LIMIT 5`
    );

    return {
        ingresosHoy: Number(resumen.ingresos_hoy),
        ingresosSemana: Number(resumen.ingresos_semana),
        ingresosMes: Number(resumen.ingresos_mes),
        ventasHoy: Number(resumen.ventas_hoy),
        topProductos: topProductos.map((fila) => ({
            nombre: fila.nombre,
            sku: fila.sku,
            cantidadVendida: Number(fila.cantidad_vendida),
            ingresoTotal: Number(fila.ingreso_total),
        })),
    };
}

/**
 * Serie diaria de ingresos para el gráfico de tendencia del dashboard.
 * Usa generate_series para no dejar huecos en los días sin ventas — el
 * gráfico necesita una línea continua, no puntos salteados.
 */
async function obtenerTendenciaVentas({ dias = 30 } = {}) {
    const n = Number.isInteger(Number(dias)) && Number(dias) > 0 ? Number(dias) : 30;
    const { rows } = await pool.query(
        `SELECT dia::date AS fecha,
                COALESCE(SUM(v.total), 0) AS ingresos,
                COUNT(v.id) AS cantidad_ventas
         FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, interval '1 day') AS dia
         LEFT JOIN ventas v ON v.created_at >= dia AND v.created_at < dia + interval '1 day'
         GROUP BY dia
         ORDER BY dia ASC`,
        [n]
    );
    return rows.map((fila) => ({
        // pg devuelve DATE como objeto Date; toISOString() lo llevaría a UTC
        // y podría correr el día. toLocaleDateString con formato sv da
        // directo YYYY-MM-DD en la fecha calendario que Postgres calculó.
        fecha: fila.fecha.toLocaleDateString('sv-SE'),
        ingresos: Number(fila.ingresos),
        cantidadVentas: Number(fila.cantidad_ventas),
    }));
}

/** Una venta puntual con su detalle, para generar la boleta provisional. */
async function obtenerVentaPorId(id) {
    const { rows } = await pool.query(
        `SELECT v.*, u.nombre AS usuario_nombre,
                COALESCE(json_agg(json_build_object(
                    'productoId', vd.producto_id,
                    'producto', p.nombre,
                    'sku', p.sku,
                    'unidadMedida', p.unidad_medida,
                    'cantidad', vd.cantidad,
                    'precioUnitario', vd.precio_unitario,
                    'subtotal', vd.subtotal
                ) ORDER BY vd.id) FILTER (WHERE vd.id IS NOT NULL), '[]') AS items
         FROM ventas v
         LEFT JOIN usuarios u ON u.id = v.usuario_id
         LEFT JOIN venta_detalle vd ON vd.venta_id = v.id
         LEFT JOIN productos p ON p.id = vd.producto_id
         WHERE v.id = $1
         GROUP BY v.id, u.nombre`,
        [id]
    );
    return rows[0] || null;
}

module.exports = { registrarVenta, listarVentas, listarProductosDisponibles, obtenerVentaPorId, obtenerKpisVentas, obtenerTendenciaVentas };
