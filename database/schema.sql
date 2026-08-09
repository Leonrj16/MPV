-- ============================================================================
-- MPV | Plataforma de Gestión de Precios Dentales
-- Esquema de Base de Datos — PostgreSQL 14+
-- (Compatible con MySQL 8+ cambiando SERIAL -> AUTO_INCREMENT, TIMESTAMPTZ -> DATETIME
--  y NUMERIC -> DECIMAL; se indican notas donde aplica)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- para gen_random_uuid() si se requiere en el futuro

-- ----------------------------------------------------------------------------
-- Función genérica para mantener updated_at siempre vigente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. PROVEEDORES
-- ============================================================================
CREATE TABLE proveedores (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(150)  NOT NULL,
    ruc_nit         VARCHAR(30),
    contacto        VARCHAR(120),
    telefono        VARCHAR(30),
    email           VARCHAR(150),
    direccion       VARCHAR(255),
    calificacion    SMALLINT      DEFAULT 5 CHECK (calificacion BETWEEN 1 AND 5),
    activo          BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_proveedores_updated_at
    BEFORE UPDATE ON proveedores
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_proveedores_activo ON proveedores(activo);
CREATE INDEX idx_proveedores_nombre ON proveedores(nombre);

-- ============================================================================
-- 2. CATEGORÍAS (normalizada para filtros rápidos y consistentes)
-- ============================================================================
CREATE TABLE categorias (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL UNIQUE,
    descripcion     VARCHAR(255)
);

-- ============================================================================
-- 3. PRODUCTOS
-- ============================================================================
CREATE TABLE productos (
    id              SERIAL PRIMARY KEY,
    sku             VARCHAR(50)   NOT NULL UNIQUE,
    nombre          VARCHAR(200)  NOT NULL,
    descripcion     TEXT,
    categoria_id    INTEGER       REFERENCES categorias(id) ON DELETE SET NULL,
    unidad_medida   VARCHAR(30)   NOT NULL DEFAULT 'unidad', -- caja, unidad, paquete, ml, etc.
    stock_minimo    INTEGER       DEFAULT 0,
    imagen_url      VARCHAR(255),
    activo          BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_productos_updated_at
    BEFORE UPDATE ON productos
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_productos_activo ON productos(activo);
CREATE INDEX idx_productos_sku ON productos(sku);
CREATE INDEX idx_productos_nombre_trgm ON productos USING gin (nombre gin_trgm_ops);

-- ============================================================================
-- 4. PROVEEDOR_PRODUCTO (Relación N:M — costos de compra por proveedor)
--    Cada fila = "este proveedor vende este producto a este precio"
-- ============================================================================
CREATE TABLE proveedor_producto (
    id                      SERIAL PRIMARY KEY,
    proveedor_id            INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
    producto_id             INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    precio_compra_unitario  NUMERIC(12,4) NOT NULL CHECK (precio_compra_unitario >= 0),
    precio_compra_anterior  NUMERIC(12,4), -- para detectar alzas de precio
    moneda                  CHAR(3) NOT NULL DEFAULT 'PEN',
    tiempo_entrega_dias     SMALLINT NOT NULL DEFAULT 0,
    costo_logistico_unitario NUMERIC(12,4) DEFAULT NULL, -- override opcional del costo logístico global
    cantidad_minima_pedido  INTEGER DEFAULT 1,
    es_proveedor_principal  BOOLEAN NOT NULL DEFAULT FALSE, -- seleccionado manualmente por el usuario
    fecha_ultima_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activo                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (proveedor_id, producto_id)
);

CREATE TRIGGER trg_proveedor_producto_updated_at
    BEFORE UPDATE ON proveedor_producto
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Antes de actualizar el precio, respaldar el precio anterior automáticamente
CREATE OR REPLACE FUNCTION fn_resguardar_precio_anterior()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.precio_compra_unitario IS DISTINCT FROM OLD.precio_compra_unitario THEN
        NEW.precio_compra_anterior := OLD.precio_compra_unitario;
        NEW.fecha_ultima_actualizacion := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_resguardar_precio_anterior
    BEFORE UPDATE ON proveedor_producto
    FOR EACH ROW EXECUTE FUNCTION fn_resguardar_precio_anterior();

CREATE INDEX idx_pp_producto ON proveedor_producto(producto_id);
CREATE INDEX idx_pp_proveedor ON proveedor_producto(proveedor_id);
CREATE INDEX idx_pp_activo ON proveedor_producto(activo);

-- ============================================================================
-- 5. CONFIGURACIÓN DE MÁRGENES (parámetros globales del motor de precios)
--    Se admite más de un perfil de configuración (ej. "Estándar", "Promoción")
--    pero solo uno puede estar activo por defecto.
-- ============================================================================
CREATE TABLE configuracion_margenes (
    id                          SERIAL PRIMARY KEY,
    nombre_config               VARCHAR(100) NOT NULL,
    margen_utilidad_defecto_pct NUMERIC(5,2) NOT NULL DEFAULT 30.00 CHECK (margen_utilidad_defecto_pct BETWEEN 0 AND 95),
    costo_operativo_mensual     NUMERIC(12,2) NOT NULL DEFAULT 0,   -- alquiler, planilla, plataforma, etc.
    unidades_estimadas_mensual  INTEGER NOT NULL DEFAULT 1 CHECK (unidades_estimadas_mensual > 0),
    porcentaje_impuesto         NUMERIC(5,2) NOT NULL DEFAULT 18.00, -- IGV / IVA
    es_config_activa            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_config_margenes_updated_at
    BEFORE UPDATE ON configuracion_margenes
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Garantiza que solo exista una configuración activa a la vez
CREATE UNIQUE INDEX idx_config_activa_unica
    ON configuracion_margenes (es_config_activa)
    WHERE es_config_activa = TRUE;

-- Se puede sobre-escribir el margen por categoría o por producto específico (opcional, fase 2+)
CREATE TABLE margenes_por_categoria (
    id              SERIAL PRIMARY KEY,
    categoria_id    INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    margen_utilidad_pct NUMERIC(5,2) NOT NULL CHECK (margen_utilidad_pct BETWEEN 0 AND 95),
    UNIQUE (categoria_id)
);

-- ============================================================================
-- VISTA: proveedor óptimo por producto (precio de compra más bajo entre activos)
-- ============================================================================
CREATE OR REPLACE VIEW vw_proveedor_optimo AS
SELECT DISTINCT ON (pp.producto_id)
    pp.producto_id,
    pp.proveedor_id,
    pp.precio_compra_unitario,
    pp.tiempo_entrega_dias,
    pp.id AS proveedor_producto_id
FROM proveedor_producto pp
WHERE pp.activo = TRUE
ORDER BY pp.producto_id, pp.precio_compra_unitario ASC, pp.tiempo_entrega_dias ASC;

-- ============================================================================
-- VISTA: tablero completo de precios (usada por la tabla de gestión del frontend)
-- ============================================================================
CREATE OR REPLACE VIEW vw_tablero_precios AS
SELECT
    pr.id                           AS producto_id,
    pr.sku,
    pr.nombre                       AS producto_nombre,
    c.nombre                        AS categoria_nombre,
    pv.id                           AS proveedor_id,
    pv.nombre                       AS proveedor_nombre,
    pp.id                           AS proveedor_producto_id,
    pp.precio_compra_unitario,
    pp.precio_compra_anterior,
    pp.tiempo_entrega_dias,
    pp.fecha_ultima_actualizacion,
    pp.es_proveedor_principal,
    (opt.proveedor_id = pv.id) AS es_proveedor_optimo,
    CASE
        WHEN pp.precio_compra_anterior IS NOT NULL
             AND pp.precio_compra_unitario > pp.precio_compra_anterior
        THEN TRUE ELSE FALSE
    END AS alerta_subida_precio
FROM proveedor_producto pp
JOIN productos pr   ON pr.id = pp.producto_id
JOIN proveedores pv ON pv.id = pp.proveedor_id
LEFT JOIN categorias c ON c.id = pr.categoria_id
LEFT JOIN vw_proveedor_optimo opt ON opt.producto_id = pp.producto_id
WHERE pp.activo = TRUE AND pr.activo = TRUE AND pv.activo = TRUE;

-- ============================================================================
-- SEED — configuración inicial + datos de ejemplo del sector dental
-- ============================================================================
INSERT INTO configuracion_margenes
    (nombre_config, margen_utilidad_defecto_pct, costo_operativo_mensual, unidades_estimadas_mensual, porcentaje_impuesto, es_config_activa)
VALUES
    ('Configuración Estándar', 35.00, 1500.00, 500, 18.00, TRUE);

INSERT INTO categorias (nombre, descripcion) VALUES
    ('Resinas y Composites', 'Materiales de restauración dental'),
    ('Instrumental Rotatorio', 'Fresas, discos y puntas'),
    ('Anestesia', 'Cartuchos y agujas dentales'),
    ('Bioseguridad', 'Guantes, mascarillas, barreras'),
    ('Ortodoncia', 'Brackets, arcos y accesorios');

INSERT INTO proveedores (nombre, contacto, telefono, email, direccion, calificacion) VALUES
    ('DentalSupply Corp', 'Mario Reyes', '+51 999 111 222', 'ventas@dentalsupply.com', 'Av. Javier Prado 1234, Lima', 5),
    ('BioDent Import', 'Lucía Torres', '+51 999 333 444', 'contacto@biodent.pe', 'Jr. Cusco 456, Lima', 4),
    ('OrthoMax Perú', 'Carlos Vega', '+51 999 555 666', 'info@orthomax.pe', 'Av. Angamos 789, Lima', 4);

INSERT INTO productos (sku, nombre, descripcion, categoria_id, unidad_medida) VALUES
    ('RES-001', 'Resina Compuesta Fotocurable A2', 'Jeringa 4g, nanohíbrida', 1, 'jeringa'),
    ('FRE-014', 'Kit Fresas Diamantadas x10', 'Alta/baja velocidad, grano fino', 2, 'kit'),
    ('ANE-007', 'Cartuchos Lidocaína 2%', 'Caja x50 cartuchos', 3, 'caja'),
    ('GUA-100', 'Guantes de Nitrilo Talla M', 'Caja x100 unidades', 4, 'caja'),
    ('BRA-220', 'Kit Brackets Metálicos 0.022', 'Sistema completo superior/inferior', 5, 'kit');

INSERT INTO proveedor_producto (proveedor_id, producto_id, precio_compra_unitario, tiempo_entrega_dias, es_proveedor_principal) VALUES
    (1, 1, 8.50, 5, TRUE),
    (2, 1, 9.20, 3, FALSE),
    (1, 2, 45.00, 7, FALSE),
    (3, 2, 41.75, 10, TRUE),
    (2, 3, 62.00, 4, TRUE),
    (1, 4, 12.30, 2, TRUE),
    (2, 4, 13.10, 3, FALSE),
    (3, 5, 89.90, 12, TRUE);
