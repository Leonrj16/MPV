-- ============================================================================
-- MPV Dental — Migración 002
-- Fase 3: Autenticación con Roles + Historial de Precios
-- Requiere haber aplicado antes database/schema.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- USUARIOS
-- ----------------------------------------------------------------------------
CREATE TABLE usuarios (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    rol             VARCHAR(20)  NOT NULL DEFAULT 'operador' CHECK (rol IN ('admin', 'operador')),
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    ultimo_acceso   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_usuarios_updated_at
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE UNIQUE INDEX idx_usuarios_email ON usuarios (LOWER(email));

-- Contraseña inicial: Admin123!  (cámbiala tras el primer inicio de sesión)
INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES
    ('Administrador MPV', 'admin@mpvdental.com', '$2b$10$QBkiLB5Pn/ieH3sUa2wLxuvbrdWZDzQwEFDVNFHUNOTKknj.UMOtu', 'admin'),
    ('Operador de Compras', 'compras@mpvdental.com', '$2b$10$QBkiLB5Pn/ieH3sUa2wLxuvbrdWZDzQwEFDVNFHUNOTKknj.UMOtu', 'operador');

-- ----------------------------------------------------------------------------
-- HISTORIAL DE PRECIOS
-- ----------------------------------------------------------------------------
CREATE TABLE historial_precios (
    id                      SERIAL PRIMARY KEY,
    proveedor_producto_id   INTEGER NOT NULL REFERENCES proveedor_producto(id) ON DELETE CASCADE,
    precio_compra_unitario  NUMERIC(12,4) NOT NULL,
    registrado_por          INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha_registro          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_historial_pp_fecha ON historial_precios (proveedor_producto_id, fecha_registro);

-- Registra automáticamente cada precio (alta y cada cambio posterior) para
-- poder graficar la tendencia sin depender de que la aplicación lo haga.
CREATE OR REPLACE FUNCTION fn_registrar_historial_precio()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO historial_precios (proveedor_producto_id, precio_compra_unitario)
        VALUES (NEW.id, NEW.precio_compra_unitario);
    ELSIF TG_OP = 'UPDATE' AND NEW.precio_compra_unitario IS DISTINCT FROM OLD.precio_compra_unitario THEN
        INSERT INTO historial_precios (proveedor_producto_id, precio_compra_unitario)
        VALUES (NEW.id, NEW.precio_compra_unitario);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_historial_precio
    AFTER INSERT OR UPDATE ON proveedor_producto
    FOR EACH ROW EXECUTE FUNCTION fn_registrar_historial_precio();

-- Backfill: el trigger solo captura altas y cambios *a partir de ahora*, así
-- que sin esto los proveedor_producto sembrados por schema.sql (creados antes
-- de que este trigger existiera) quedarían sin ningún punto histórico.
INSERT INTO historial_precios (proveedor_producto_id, precio_compra_unitario, fecha_registro)
SELECT id, precio_compra_unitario, created_at FROM proveedor_producto;

-- ----------------------------------------------------------------------------
-- Datos de demostración: puntos históricos retroactivos para poblar el
-- gráfico de tendencia de un par de productos ya sembrados en schema.sql
-- (proveedor_producto.id = 1 → RES-001/DentalSupply, 6 → GUA-100/DentalSupply)
-- ----------------------------------------------------------------------------
INSERT INTO historial_precios (proveedor_producto_id, precio_compra_unitario, fecha_registro) VALUES
    (1, 7.20, NOW() - INTERVAL '70 days'),
    (1, 7.20, NOW() - INTERVAL '56 days'),
    (1, 7.50, NOW() - INTERVAL '42 days'),
    (1, 7.80, NOW() - INTERVAL '28 days'),
    (1, 8.10, NOW() - INTERVAL '14 days'),
    (6, 11.50, NOW() - INTERVAL '60 days'),
    (6, 11.50, NOW() - INTERVAL '45 days'),
    (6, 11.90, NOW() - INTERVAL '30 days'),
    (6, 12.30, NOW() - INTERVAL '15 days');
