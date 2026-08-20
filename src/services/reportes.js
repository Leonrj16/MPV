const pool = require('../config/db');
const { calcularPVP } = require('./pricingEngine');
const { obtenerConfigActiva } = require('./tableroPrecios');

/**
 * Inventario valorizado: cuánto dinero hay parado en stock hoy (a precio de
 * compra) y cuánto se recuperaría si se vendiera todo al PVP sugerido.
 * Usa el proveedor óptimo vigente por producto (mismo criterio que el resto
 * del sistema para calcular precio), no cada oferta de proveedor por
 * separado — el stock es del producto, no de una combinación producto-
 * proveedor.
 *
 * Un producto activo con stock pero sin proveedor activo (por lo tanto sin
 * PVP calculable) se incluye con valor 0 y `sinPrecio: true` en vez de
 * excluirse — es justamente el caso que más le interesa ver a un dueño de
 * negocio ("tengo stock que no puedo valorizar porque no tiene proveedor").
 */
async function obtenerInventarioValorizado() {
    const config = await obtenerConfigActiva();
    const { rows } = await pool.query(
        `SELECT p.id, p.sku, p.nombre, p.stock_actual,
                COALESCE(c.nombre, 'Sin categoría') AS categoria_nombre,
                opt.precio_compra_unitario
         FROM productos p
         LEFT JOIN categorias c ON c.id = p.categoria_id
         LEFT JOIN vw_proveedor_optimo opt ON opt.producto_id = p.id
         WHERE p.activo = TRUE
         ORDER BY categoria_nombre ASC, p.nombre ASC`
    );

    const productos = rows.map((fila) => {
        const stock = fila.stock_actual;
        const sinPrecio = fila.precio_compra_unitario === null;
        const precioCompra = sinPrecio ? 0 : Number(fila.precio_compra_unitario);
        const pvpSugerido = sinPrecio ? 0 : calcularPVP({ precioCompra, config }).pvpSugerido;
        const valorCompra = Math.round(stock * precioCompra * 100) / 100;
        const valorVentaPotencial = Math.round(stock * pvpSugerido * 100) / 100;

        return {
            productoId: fila.id,
            sku: fila.sku,
            nombre: fila.nombre,
            categoria: fila.categoria_nombre,
            stock,
            sinPrecio,
            precioCompraUnitario: precioCompra,
            pvpUnitario: pvpSugerido,
            valorCompra,
            valorVentaPotencial,
            margenPotencial: Math.round((valorVentaPotencial - valorCompra) * 100) / 100,
        };
    });

    const categoriasMap = new Map();
    for (const p of productos) {
        if (!categoriasMap.has(p.categoria)) {
            categoriasMap.set(p.categoria, { categoria: p.categoria, valorCompra: 0, valorVentaPotencial: 0, margenPotencial: 0, productos: [] });
        }
        const grupo = categoriasMap.get(p.categoria);
        grupo.valorCompra += p.valorCompra;
        grupo.valorVentaPotencial += p.valorVentaPotencial;
        grupo.margenPotencial += p.margenPotencial;
        grupo.productos.push(p);
    }
    const categorias = [...categoriasMap.values()].map((g) => ({
        ...g,
        valorCompra: Math.round(g.valorCompra * 100) / 100,
        valorVentaPotencial: Math.round(g.valorVentaPotencial * 100) / 100,
        margenPotencial: Math.round(g.margenPotencial * 100) / 100,
    }));

    const totales = productos.reduce(
        (acc, p) => ({
            valorCompra: acc.valorCompra + p.valorCompra,
            valorVentaPotencial: acc.valorVentaPotencial + p.valorVentaPotencial,
            margenPotencial: acc.margenPotencial + p.margenPotencial,
            productosSinPrecio: acc.productosSinPrecio + (p.sinPrecio ? 1 : 0),
        }),
        { valorCompra: 0, valorVentaPotencial: 0, margenPotencial: 0, productosSinPrecio: 0 }
    );
    totales.valorCompra = Math.round(totales.valorCompra * 100) / 100;
    totales.valorVentaPotencial = Math.round(totales.valorVentaPotencial * 100) / 100;
    totales.margenPotencial = Math.round(totales.margenPotencial * 100) / 100;

    return { productos, categorias, totales };
}

/**
 * Clientes frecuentes: agrupa compras de mostrador (ventas.cliente, texto
 * libre) y pedidos web (pedidos_web.cliente/telefono) por una clave de
 * identidad aproximada — no existe una tabla de clientes real (ver límite
 * de RUC/SUNAT), así que se agrupa por teléfono normalizado cuando existe
 * (pedidos web) o por nombre normalizado cuando no (ventas de mostrador).
 * Es una aproximación deliberada: dos clientes de mostrador con el mismo
 * nombre se cuentan como uno solo. Solo se listan quienes compraron más de
 * una vez — un cliente de una sola compra no es "frecuente".
 */
// Cada 5 compras (5, 10, 15…) el cliente "sube de nivel" y puede recibir un
// cupón de fidelidad. El código es determinístico (misma clave + mismo
// nivel => mismo código) para no necesitar una tabla de fidelización aparte:
// el UNIQUE de cupones.codigo ya evita que se genere dos veces el mismo
// premio, y basta con revisar si ese código ya existe para saber si el
// cliente ya lo reclamó.
const UMBRAL_FIDELIZACION = 5;

function slugClave(clave) {
    const limpio = clave.replace(/[^a-z0-9]/gi, '').toUpperCase();
    return (limpio.slice(0, 6) || 'X').padEnd(6, 'X');
}

function codigoCuponFidelidad(clave, nivel) {
    return `FIEL-${slugClave(clave)}-${nivel}`;
}

async function obtenerClientesFrecuentes() {
    const { rows } = await pool.query(
        `WITH transacciones AS (
            SELECT
                NULLIF(regexp_replace(telefono, '\\D', '', 'g'), '') AS telefono_normalizado,
                NULLIF(lower(trim(cliente)), '') AS nombre_normalizado,
                cliente AS nombre_mostrado,
                total,
                created_at
            FROM pedidos_web
            WHERE estado <> 'cancelado'
            UNION ALL
            SELECT
                NULL AS telefono_normalizado,
                NULLIF(lower(trim(cliente)), '') AS nombre_normalizado,
                cliente AS nombre_mostrado,
                total,
                created_at
            FROM ventas
        ),
        identificadas AS (
            SELECT *, COALESCE(telefono_normalizado, nombre_normalizado) AS clave
            FROM transacciones
            WHERE COALESCE(telefono_normalizado, nombre_normalizado) IS NOT NULL
        )
        SELECT
            clave,
            (array_agg(nombre_mostrado ORDER BY created_at DESC) FILTER (WHERE nombre_mostrado IS NOT NULL))[1] AS nombre,
            (array_agg(telefono_normalizado ORDER BY created_at DESC) FILTER (WHERE telefono_normalizado IS NOT NULL))[1] AS telefono,
            COUNT(*) AS cantidad_compras,
            SUM(total) AS total_gastado,
            MIN(created_at) AS primera_compra,
            MAX(created_at) AS ultima_compra
        FROM identificadas
        GROUP BY clave
        HAVING COUNT(*) > 1
        ORDER BY cantidad_compras DESC, total_gastado DESC`
    );

    const clientesSinFidelizacion = rows.map((fila) => {
        const cantidadCompras = Number(fila.cantidad_compras);
        const totalGastado = Math.round(Number(fila.total_gastado) * 100) / 100;
        const nivel = Math.floor(cantidadCompras / UMBRAL_FIDELIZACION) * UMBRAL_FIDELIZACION;
        return {
            clave: fila.clave,
            nombre: fila.nombre || 'Cliente sin nombre',
            telefono: fila.telefono || null,
            cantidadCompras,
            totalGastado,
            ticketPromedio: Math.round((totalGastado / cantidadCompras) * 100) / 100,
            primeraCompra: fila.primera_compra,
            ultimaCompra: fila.ultima_compra,
            nivelFidelizacion: nivel,
            codigoCuponFidelidad: nivel > 0 ? codigoCuponFidelidad(fila.clave, nivel) : null,
        };
    });

    const codigosNivel = clientesSinFidelizacion.filter((c) => c.codigoCuponFidelidad).map((c) => c.codigoCuponFidelidad);
    const cuponesExistentes = codigosNivel.length
        ? (await pool.query('SELECT codigo FROM cupones WHERE codigo = ANY($1::text[])', [codigosNivel])).rows
        : [];
    const codigosYaGenerados = new Set(cuponesExistentes.map((c) => c.codigo));

    const clientes = clientesSinFidelizacion.map((c) => ({
        ...c,
        cuponFidelidadDisponible: c.codigoCuponFidelidad !== null && !codigosYaGenerados.has(c.codigoCuponFidelidad),
    }));

    const totales = {
        clientesFrecuentes: clientes.length,
        totalGastado: Math.round(clientes.reduce((acc, c) => acc + c.totalGastado, 0) * 100) / 100,
    };

    return { clientes, totales };
}

/**
 * Genera (si corresponde) el cupón de fidelidad del nivel actual del
 * cliente. Recalcula el nivel del lado del servidor a partir de sus compras
 * reales — nunca confía en un nivel que mande el frontend — y usa el código
 * determinístico como control de concurrencia: si dos clics llegan casi
 * juntos, el segundo INSERT choca con el UNIQUE de cupones.codigo y se
 * traduce en un mensaje claro en vez de crear un cupón duplicado.
 */
async function generarCuponFidelidad(clave) {
    const { clientes } = await obtenerClientesFrecuentes();
    const cliente = clientes.find((c) => c.clave === clave);
    if (!cliente) {
        throw new Error('Cliente no encontrado entre los clientes frecuentes');
    }
    if (cliente.nivelFidelizacion === 0) {
        throw new Error(`Este cliente todavía no llega a las ${UMBRAL_FIDELIZACION} compras necesarias`);
    }
    if (!cliente.cuponFidelidadDisponible) {
        throw new Error(`Ya se generó el cupón de fidelidad del nivel ${cliente.nivelFidelizacion} para este cliente`);
    }

    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(fechaExpiracion.getDate() + 90);

    try {
        const { rows } = await pool.query(
            `INSERT INTO cupones (codigo, tipo, valor, fecha_expiracion, usos_maximos, monto_minimo)
             VALUES ($1, 'monto_fijo', 10, $2, 1, 0)
             RETURNING *`,
            [cliente.codigoCuponFidelidad, fechaExpiracion.toLocaleDateString('sv-SE')]
        );
        return { cupon: rows[0], cliente };
    } catch (err) {
        if (err.code === '23505') {
            throw new Error(`Ya se generó el cupón de fidelidad del nivel ${cliente.nivelFidelizacion} para este cliente`);
        }
        throw err;
    }
}

/**
 * Rentabilidad mensual: ingresos reales de cada venta vs. un costo estimado
 * (unidades vendidas × costo de compra del proveedor óptimo VIGENTE, no el
 * costo real al momento de esa venta — el sistema no guarda snapshot de
 * costo por línea de venta). Es una aproximación deliberada, igual que en
 * inventario valorizado: sirve para ver la tendencia, no para contabilidad
 * exacta. Ventas de productos que ya no tienen proveedor activo cuentan con
 * costo 0 (margen sobreestimado para esos casos, no se puede hacer mejor sin
 * ese historial).
 */
async function obtenerRentabilidadMensual({ meses = 6 } = {}) {
    const { rows } = await pool.query(
        `SELECT
            to_char(date_trunc('month', v.created_at), 'YYYY-MM') AS mes,
            COALESCE(c.nombre, 'Sin categoría') AS categoria,
            SUM(vd.subtotal) AS ingresos,
            SUM(vd.cantidad * COALESCE(opt.precio_compra_unitario, 0)) AS costo_estimado
         FROM venta_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         JOIN productos p ON p.id = vd.producto_id
         LEFT JOIN categorias c ON c.id = p.categoria_id
         LEFT JOIN vw_proveedor_optimo opt ON opt.producto_id = p.id
         WHERE v.created_at >= date_trunc('month', CURRENT_DATE) - make_interval(months => $1 - 1)
         GROUP BY mes, categoria
         ORDER BY mes ASC, categoria ASC`,
        [meses]
    );

    const filas = rows.map((f) => {
        const ingresos = Math.round(Number(f.ingresos) * 100) / 100;
        const costoEstimado = Math.round(Number(f.costo_estimado) * 100) / 100;
        const margen = Math.round((ingresos - costoEstimado) * 100) / 100;
        return { mes: f.mes, categoria: f.categoria, ingresos, costoEstimado, margen };
    });

    const porMesMap = new Map();
    const porCategoriaMap = new Map();
    for (const f of filas) {
        if (!porMesMap.has(f.mes)) porMesMap.set(f.mes, { mes: f.mes, ingresos: 0, costoEstimado: 0, margen: 0 });
        const mesAgg = porMesMap.get(f.mes);
        mesAgg.ingresos += f.ingresos;
        mesAgg.costoEstimado += f.costoEstimado;
        mesAgg.margen += f.margen;

        if (!porCategoriaMap.has(f.categoria)) porCategoriaMap.set(f.categoria, { categoria: f.categoria, ingresos: 0, costoEstimado: 0, margen: 0 });
        const catAgg = porCategoriaMap.get(f.categoria);
        catAgg.ingresos += f.ingresos;
        catAgg.costoEstimado += f.costoEstimado;
        catAgg.margen += f.margen;
    }

    const redondear = (o) => ({
        ...o,
        ingresos: Math.round(o.ingresos * 100) / 100,
        costoEstimado: Math.round(o.costoEstimado * 100) / 100,
        margen: Math.round(o.margen * 100) / 100,
        margenPct: o.ingresos > 0 ? Math.round((o.margen / o.ingresos) * 1000) / 10 : 0,
    });

    const totalesPorMes = [...porMesMap.values()].map(redondear).sort((a, b) => a.mes.localeCompare(b.mes));
    const porCategoria = [...porCategoriaMap.values()].map(redondear).sort((a, b) => b.margen - a.margen);

    return { totalesPorMes, porCategoria };
}

/**
 * Productos de baja rotación ("dead stock"): tienen stock activo pero casi
 * no se vendieron en los últimos `dias` días. Es plata parada en el
 * estante — se reutiliza el mismo criterio de valorización que el inventario
 * general (costo de compra del proveedor óptimo vigente).
 */
async function obtenerProductosBajaRotacion({ dias = 90, umbralUnidades = 2 } = {}) {
    const { rows } = await pool.query(
        `SELECT p.id, p.sku, p.nombre, p.stock_actual,
                COALESCE(c.nombre, 'Sin categoría') AS categoria,
                COALESCE(SUM(vd.cantidad) FILTER (WHERE v.created_at >= NOW() - make_interval(days => $1)), 0) AS unidades_vendidas_periodo,
                MAX(v.created_at) AS ultima_venta,
                opt.precio_compra_unitario
         FROM productos p
         LEFT JOIN categorias c ON c.id = p.categoria_id
         LEFT JOIN venta_detalle vd ON vd.producto_id = p.id
         LEFT JOIN ventas v ON v.id = vd.venta_id
         LEFT JOIN vw_proveedor_optimo opt ON opt.producto_id = p.id
         WHERE p.activo = TRUE AND p.stock_actual > 0
         GROUP BY p.id, c.nombre, opt.precio_compra_unitario
         HAVING COALESCE(SUM(vd.cantidad) FILTER (WHERE v.created_at >= NOW() - make_interval(days => $1)), 0) <= $2
         ORDER BY unidades_vendidas_periodo ASC, p.stock_actual DESC`,
        [dias, umbralUnidades]
    );

    const productos = rows.map((f) => {
        const sinPrecio = f.precio_compra_unitario === null;
        const precioCompra = sinPrecio ? 0 : Number(f.precio_compra_unitario);
        return {
            productoId: f.id,
            sku: f.sku,
            nombre: f.nombre,
            categoria: f.categoria,
            stock: f.stock_actual,
            unidadesVendidasPeriodo: Number(f.unidades_vendidas_periodo),
            ultimaVenta: f.ultima_venta,
            sinPrecio,
            valorInmovilizado: Math.round(f.stock_actual * precioCompra * 100) / 100,
        };
    });

    return {
        productos,
        totales: {
            cantidadProductos: productos.length,
            valorInmovilizado: Math.round(productos.reduce((acc, p) => acc + p.valorInmovilizado, 0) * 100) / 100,
        },
    };
}

module.exports = {
    obtenerInventarioValorizado,
    obtenerClientesFrecuentes,
    generarCuponFidelidad,
    obtenerRentabilidadMensual,
    obtenerProductosBajaRotacion,
};
