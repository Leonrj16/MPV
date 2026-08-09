const {
    calcularPVP,
    calcularCostoLogisticoUnitario,
    clasificarRentabilidad,
    compararProveedores,
    detectarAlzaPrecio,
    round2,
} = require('../src/services/pricingEngine');

const configBase = {
    margen_utilidad_defecto_pct: 35,
    costo_operativo_mensual: 1500,
    unidades_estimadas_mensual: 500,
    porcentaje_impuesto: 18,
};

describe('calcularCostoLogisticoUnitario', () => {
    test('prorratea el costo operativo entre las unidades estimadas', () => {
        expect(calcularCostoLogisticoUnitario(configBase)).toBe(3);
    });

    test('usa el override cuando se provee, ignorando la configuración global', () => {
        expect(calcularCostoLogisticoUnitario(configBase, 7.5)).toBe(7.5);
    });

    test('devuelve 0 si las unidades estimadas son 0 (evita división por cero)', () => {
        expect(calcularCostoLogisticoUnitario({ ...configBase, unidades_estimadas_mensual: 0 })).toBe(0);
    });
});

describe('calcularPVP', () => {
    test('calcula el desglose completo con la configuración por defecto', () => {
        const r = calcularPVP({ precioCompra: 8.5, config: configBase });
        // costoTotal = 8.5 + 3 = 11.5; subtotal = 11.5 / 0.65 = 17.6923...
        expect(r.costoLogisticoUnitario).toBe(3);
        expect(r.costoTotalUnitario).toBe(11.5);
        expect(r.subtotalSinImpuesto).toBeCloseTo(17.69, 2);
        expect(r.montoImpuesto).toBeCloseTo(3.18, 2);
        expect(r.pvpSugerido).toBeCloseTo(20.88, 2);
        expect(r.margenRealPct).toBeCloseTo(35, 5);
    });

    test('respeta un margen override distinto al de la configuración', () => {
        const r = calcularPVP({ precioCompra: 100, config: configBase, margenOverridePct: 50 });
        // costoTotal = 103; subtotal = 103 / 0.5 = 206
        expect(r.subtotalSinImpuesto).toBe(206);
        expect(r.margenUtilidadPct).toBe(50);
    });

    test('con margen 0% el subtotal es igual al costo total (sin utilidad)', () => {
        const r = calcularPVP({ precioCompra: 50, config: { ...configBase, margen_utilidad_defecto_pct: 0 } });
        expect(r.subtotalSinImpuesto).toBe(r.costoTotalUnitario);
        expect(r.utilidadBruta).toBe(0);
    });

    test('lanza error si el precio de compra es negativo', () => {
        expect(() => calcularPVP({ precioCompra: -1, config: configBase })).toThrow();
    });

    test('lanza error si no se provee configuración', () => {
        expect(() => calcularPVP({ precioCompra: 10, config: null })).toThrow();
    });

    test('lanza error si el margen es 100% o más (división por cero)', () => {
        expect(() => calcularPVP({ precioCompra: 10, config: configBase, margenOverridePct: 100 })).toThrow();
    });

    test('lanza error si el margen es negativo', () => {
        expect(() => calcularPVP({ precioCompra: 10, config: configBase, margenOverridePct: -5 })).toThrow();
    });

    test('acepta precio de compra igual a 0', () => {
        const r = calcularPVP({ precioCompra: 0, config: configBase });
        expect(r.costoTotalUnitario).toBe(3); // solo el costo logístico
        expect(r.pvpSugerido).toBeGreaterThan(0);
    });
});

describe('clasificarRentabilidad', () => {
    test('margen >= 30% es alto', () => {
        expect(clasificarRentabilidad(30)).toBe('alto');
        expect(clasificarRentabilidad(45)).toBe('alto');
    });

    test('margen entre 15% y 30% (sin incluir 30) es medio', () => {
        expect(clasificarRentabilidad(15)).toBe('medio');
        expect(clasificarRentabilidad(29.9)).toBe('medio');
    });

    test('margen menor a 15% es bajo', () => {
        expect(clasificarRentabilidad(14.9)).toBe('bajo');
        expect(clasificarRentabilidad(0)).toBe('bajo');
        expect(clasificarRentabilidad(-5)).toBe('bajo');
    });
});

describe('compararProveedores', () => {
    test('marca como óptimo al proveedor con menor precio de compra', () => {
        const { optimo, ofertasOrdenadas } = compararProveedores([
            { proveedorId: 1, proveedorNombre: 'A', precioCompra: 9.2, tiempoEntregaDias: 3 },
            { proveedorId: 2, proveedorNombre: 'B', precioCompra: 8.5, tiempoEntregaDias: 5 },
        ]);
        expect(optimo.proveedorId).toBe(2);
        expect(ofertasOrdenadas[0].esOptimo).toBe(true);
        expect(ofertasOrdenadas[1].esOptimo).toBe(false);
    });

    test('usa el tiempo de entrega como desempate cuando el precio es igual', () => {
        const { optimo } = compararProveedores([
            { proveedorId: 1, proveedorNombre: 'Lento', precioCompra: 10, tiempoEntregaDias: 10 },
            { proveedorId: 2, proveedorNombre: 'Rápido', precioCompra: 10, tiempoEntregaDias: 2 },
        ]);
        expect(optimo.proveedorId).toBe(2);
    });

    test('devuelve optimo null y arreglo vacío cuando no hay ofertas', () => {
        expect(compararProveedores([])).toEqual({ optimo: null, ofertasOrdenadas: [] });
    });

    test('no muta el arreglo original de ofertas', () => {
        const ofertas = [
            { proveedorId: 1, proveedorNombre: 'A', precioCompra: 5, tiempoEntregaDias: 1 },
            { proveedorId: 2, proveedorNombre: 'B', precioCompra: 1, tiempoEntregaDias: 1 },
        ];
        compararProveedores(ofertas);
        expect(ofertas[0].proveedorId).toBe(1); // orden original intacto
    });
});

describe('detectarAlzaPrecio', () => {
    test('detecta un alza cuando el precio actual supera al anterior', () => {
        expect(detectarAlzaPrecio(10, 8)).toBe(true);
    });

    test('no marca alza si el precio bajó o se mantuvo igual', () => {
        expect(detectarAlzaPrecio(8, 10)).toBe(false);
        expect(detectarAlzaPrecio(8, 8)).toBe(false);
    });

    test('no marca alza si no hay precio anterior registrado', () => {
        expect(detectarAlzaPrecio(10, null)).toBe(false);
        expect(detectarAlzaPrecio(10, undefined)).toBe(false);
    });
});

describe('round2', () => {
    test('redondea correctamente a 2 decimales evitando errores de punto flotante', () => {
        expect(round2(1.005)).toBeCloseTo(1.01, 2);
        expect(round2(17.69230769)).toBe(17.69);
        expect(round2(20.884999999999998)).toBe(20.89);
    });
});
