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

    const clientes = rows.map((fila) => {
        const cantidadCompras = Number(fila.cantidad_compras);
        const totalGastado = Math.round(Number(fila.total_gastado) * 100) / 100;
        return {
            clave: fila.clave,
            nombre: fila.nombre || 'Cliente sin nombre',
            telefono: fila.telefono || null,
            cantidadCompras,
            totalGastado,
            ticketPromedio: Math.round((totalGastado / cantidadCompras) * 100) / 100,
            primeraCompra: fila.primera_compra,
            ultimaCompra: fila.ultima_compra,
        };
    });

    const totales = {
        clientesFrecuentes: clientes.length,
        totalGastado: Math.round(clientes.reduce((acc, c) => acc + c.totalGastado, 0) * 100) / 100,
    };

    return { clientes, totales };
}

module.exports = { obtenerInventarioValorizado, obtenerClientesFrecuentes };
