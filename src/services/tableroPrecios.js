const pool = require('../config/db');
const { calcularPVP, clasificarRentabilidad } = require('./pricingEngine');

async function obtenerConfigActiva() {
    const { rows } = await pool.query(
        'SELECT * FROM configuracion_margenes WHERE es_config_activa = TRUE LIMIT 1'
    );
    if (rows.length === 0) {
        throw new Error('No existe una configuración de márgenes activa');
    }
    return rows[0];
}

/**
 * Arma el tablero de precios (mismo cálculo que usa la API y las
 * exportaciones a Excel/PDF, para que nunca queden desincronizados).
 */
async function obtenerTablero({ categoria, proveedor, busqueda } = {}) {
    const config = await obtenerConfigActiva();

    const condiciones = [];
    const valores = [];

    if (categoria) {
        valores.push(categoria);
        condiciones.push(`categoria_nombre = $${valores.length}`);
    }
    if (proveedor) {
        valores.push(proveedor);
        condiciones.push(`proveedor_id = $${valores.length}`);
    }
    if (busqueda) {
        valores.push(`%${busqueda}%`);
        condiciones.push(`(producto_nombre ILIKE $${valores.length} OR sku ILIKE $${valores.length})`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const { rows } = await pool.query(
        `SELECT * FROM vw_tablero_precios ${where} ORDER BY producto_nombre ASC`,
        valores
    );

    const tablero = rows.map((fila) => {
        const calculo = calcularPVP({
            precioCompra: Number(fila.precio_compra_unitario),
            config,
        });
        return {
            productoId: fila.producto_id,
            sku: fila.sku,
            producto: fila.producto_nombre,
            categoria: fila.categoria_nombre,
            proveedorId: fila.proveedor_id,
            proveedor: fila.proveedor_nombre,
            proveedorProductoId: fila.proveedor_producto_id,
            tiempoEntregaDias: fila.tiempo_entrega_dias,
            esProveedorOptimo: fila.es_proveedor_optimo,
            esProveedorPrincipal: fila.es_proveedor_principal,
            alertaSubidaPrecio: fila.alerta_subida_precio,
            fechaActualizacion: fila.fecha_ultima_actualizacion,
            ...calculo,
            rentabilidad: clasificarRentabilidad(calculo.margenRealPct),
        };
    });

    return { config, tablero };
}

module.exports = { obtenerConfigActiva, obtenerTablero };
