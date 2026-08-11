-- Sesiones de caja (apertura/cierre con arqueo) para Punto de Venta. El
-- negocio opera con una sola caja física, así que solo puede haber una
-- sesión "abierta" a la vez — se fuerza con un índice único parcial en vez
-- de un chequeo a nivel de aplicación, que sería más fácil de saltear con
-- dos pedidos simultáneos.
CREATE TABLE caja_sesiones (
    id                    SERIAL PRIMARY KEY,
    usuario_apertura_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_cierre_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    monto_apertura        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_apertura >= 0),
    monto_cierre_contado  NUMERIC(12,2) CHECK (monto_cierre_contado >= 0),
    notas_apertura        TEXT,
    notas_cierre          TEXT,
    estado                VARCHAR(20) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
    abierta_en            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cerrada_en            TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_caja_una_abierta ON caja_sesiones (estado) WHERE estado = 'abierta';
CREATE INDEX idx_caja_sesiones_abierta_en ON caja_sesiones (abierta_en DESC);

-- Cada venta queda asociada a la sesión de caja vigente al momento de
-- registrarla (nullable: ventas históricas, previas a esta migración, no
-- tienen sesión asociada y eso es correcto, no un dato faltante).
ALTER TABLE ventas ADD COLUMN caja_sesion_id INTEGER REFERENCES caja_sesiones(id) ON DELETE SET NULL;
CREATE INDEX idx_ventas_caja_sesion ON ventas (caja_sesion_id);
