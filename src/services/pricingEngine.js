/**
 * Motor de Precios — MPV Dental
 *
 * Fórmula:
 *   Costo Total Unitario   = Precio de Compra + Costo Logístico Proporcional
 *   Subtotal (sin impuesto)= Costo Total Unitario / (1 - Margen de Utilidad %)
 *   PVP Sugerido           = Subtotal + (Subtotal * Impuesto %)
 *
 * Nota: el impuesto se calcula como porcentaje sobre el subtotal ya
 * margenado (no como monto fijo) porque así opera el IGV/IVA en la
 * práctica; sumar un monto fijo de "impuestos aplicables" distorsionaría
 * el margen real cuando el precio de compra cambia.
 */

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Calcula el costo logístico proporcional por unidad a partir de la
 * configuración de márgenes activa, salvo que el registro proveedor-producto
 * traiga su propio override (costo_logistico_unitario).
 */
function calcularCostoLogisticoUnitario(config, overrideUnitario = null) {
    if (overrideUnitario !== null && overrideUnitario !== undefined) {
        return Number(overrideUnitario);
    }
    const { costo_operativo_mensual, unidades_estimadas_mensual } = config;
    if (!unidades_estimadas_mensual || unidades_estimadas_mensual <= 0) return 0;
    return Number(costo_operativo_mensual) / Number(unidades_estimadas_mensual);
}

/**
 * Calcula el Precio de Venta al Público (PVP) sugerido para un costo de compra dado.
 *
 * @param {Object} params
 * @param {number} params.precioCompra          Precio de compra unitario al proveedor.
 * @param {Object} params.config                Configuración activa (configuracion_margenes).
 * @param {number} [params.margenOverridePct]    Margen específico (ej. por categoría/producto), en %.
 * @param {number} [params.costoLogisticoOverride] Costo logístico unitario específico.
 * @returns {Object} desglose completo del cálculo.
 */
function calcularPVP({ precioCompra, config, margenOverridePct = null, costoLogisticoOverride = null }) {
    if (precioCompra === null || precioCompra === undefined || precioCompra < 0) {
        throw new Error('precioCompra debe ser un número mayor o igual a 0');
    }
    if (!config) {
        throw new Error('Se requiere una configuración de márgenes activa');
    }

    const margenPct = Number(
        margenOverridePct !== null && margenOverridePct !== undefined
            ? margenOverridePct
            : config.margen_utilidad_defecto_pct
    );

    if (margenPct >= 100 || margenPct < 0) {
        throw new Error('El margen de utilidad debe estar entre 0 y 99.99%');
    }

    const impuestoPct = Number(config.porcentaje_impuesto);
    const costoLogistico = calcularCostoLogisticoUnitario(config, costoLogisticoOverride);

    const costoTotalUnitario = Number(precioCompra) + costoLogistico;
    const margenDecimal = margenPct / 100;
    const subtotalSinImpuesto = costoTotalUnitario / (1 - margenDecimal);
    const montoImpuesto = subtotalSinImpuesto * (impuestoPct / 100);
    const pvpSugerido = subtotalSinImpuesto + montoImpuesto;

    const utilidadBruta = subtotalSinImpuesto - costoTotalUnitario;
    const margenRealPct = (utilidadBruta / subtotalSinImpuesto) * 100;

    return {
        precioCompra: round2(precioCompra),
        costoLogisticoUnitario: round2(costoLogistico),
        costoTotalUnitario: round2(costoTotalUnitario),
        margenUtilidadPct: round2(margenPct),
        subtotalSinImpuesto: round2(subtotalSinImpuesto),
        impuestoPct: round2(impuestoPct),
        montoImpuesto: round2(montoImpuesto),
        pvpSugerido: round2(pvpSugerido),
        utilidadBruta: round2(utilidadBruta),
        margenRealPct: round2(margenRealPct),
    };
}

/**
 * Clasifica la rentabilidad de un margen para pintar el badge correspondiente
 * en la interfaz (verde/amarillo/rojo).
 */
function clasificarRentabilidad(margenRealPct) {
    if (margenRealPct >= 30) return 'alto';
    if (margenRealPct >= 15) return 'medio';
    return 'bajo';
}

/**
 * Compara todas las ofertas de proveedores para un mismo producto y
 * determina cuál es el "Proveedor Óptimo" (menor precio de compra;
 * en caso de empate, menor tiempo de entrega).
 *
 * @param {Array} ofertas Lista de { proveedorId, proveedorNombre, precioCompra, tiempoEntregaDias }
 * @returns {Object} { optimo, ofertasOrdenadas }
 */
function compararProveedores(ofertas) {
    if (!Array.isArray(ofertas) || ofertas.length === 0) {
        return { optimo: null, ofertasOrdenadas: [] };
    }

    const ofertasOrdenadas = [...ofertas].sort((a, b) => {
        if (a.precioCompra !== b.precioCompra) return a.precioCompra - b.precioCompra;
        return (a.tiempoEntregaDias ?? 0) - (b.tiempoEntregaDias ?? 0);
    });

    const optimo = ofertasOrdenadas[0];

    return {
        optimo,
        ofertasOrdenadas: ofertasOrdenadas.map((o) => ({
            ...o,
            esOptimo: o === optimo,
        })),
    };
}

/**
 * Determina si un registro proveedor-producto tuvo una subida de precio
 * respecto a su valor anterior registrado.
 */
function detectarAlzaPrecio(precioActual, precioAnterior) {
    if (precioAnterior === null || precioAnterior === undefined) return false;
    return Number(precioActual) > Number(precioAnterior);
}

module.exports = {
    calcularPVP,
    calcularCostoLogisticoUnitario,
    clasificarRentabilidad,
    compararProveedores,
    detectarAlzaPrecio,
    round2,
};
