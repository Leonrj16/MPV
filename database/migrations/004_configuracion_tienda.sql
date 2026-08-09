-- ============================================================================
-- MPV Dental — Migración 004
-- Fase 6: Configuración editable de la Tienda Virtual (marca, imágenes, textos)
-- Requiere haber aplicado antes schema.sql y las migraciones 002 y 003
-- ============================================================================

-- Fila única (id fijo en 1, forzado por el CHECK): es la configuración
-- pública de la tienda, no hay "perfiles" como en configuracion_margenes.
CREATE TABLE configuracion_tienda (
    id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    -- nombre_negocio + eslogan forman el lockup de marca en dos líneas (header
    -- y footer); combinados ("San Judas Tadeo Botica Dental") arman el <title>
    -- y el copyright del footer.
    nombre_negocio      VARCHAR(150) NOT NULL DEFAULT 'San Judas Tadeo',
    eslogan             VARCHAR(150) DEFAULT 'Botica Dental',
    hero_titulo         VARCHAR(300) NOT NULL DEFAULT 'Todo lo que tu consultorio necesita, en un solo lugar',
    hero_descripcion    TEXT DEFAULT 'Resinas, instrumental rotatorio, bioseguridad y anestesia de proveedores certificados, con el mejor precio calculado automáticamente por nuestro sistema.',
    logo_url            VARCHAR(255),
    hero_imagen_url     VARCHAR(255),
    telefono            VARCHAR(30) DEFAULT '+51 999 000 111',
    whatsapp_numero     VARCHAR(20) DEFAULT '51999000111',
    direccion           VARCHAR(255) DEFAULT 'Av. Principal 123, San Isidro, Lima, Perú',
    horario_atencion    VARCHAR(150) DEFAULT 'Lunes a sábado, 9:00 a. m. – 7:00 p. m.',
    email_contacto      VARCHAR(150) DEFAULT 'contacto@sanjudastadeo.dental',
    facebook_url        VARCHAR(255),
    instagram_url       VARCHAR(255),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_configuracion_tienda_updated_at
    BEFORE UPDATE ON configuracion_tienda
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

INSERT INTO configuracion_tienda (id) VALUES (1);
