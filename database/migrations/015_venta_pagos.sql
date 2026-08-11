-- Desglose de pagos por venta: permite cobrar combinando más de un método
-- (ej. parte en efectivo, parte con tarjeta). ventas.metodo_pago se
-- mantiene como resumen rápido para no romper lo que ya lo usa (reportes,
-- filtros): si la venta tuvo un solo pago, refleja ese método; si tuvo más
-- de uno, queda en 'mixto' y el detalle real de cuánto fue de cada método
-- vive en esta tabla.
CREATE TABLE venta_pagos (
    id          SERIAL PRIMARY KEY,
    venta_id    INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    metodo_pago VARCHAR(30) NOT NULL
                    CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'yape_plin', 'transferencia')),
    monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0)
);

CREATE INDEX idx_venta_pagos_venta ON venta_pagos (venta_id);

ALTER TABLE ventas DROP CONSTRAINT ventas_metodo_pago_check;
ALTER TABLE ventas ADD CONSTRAINT ventas_metodo_pago_check
    CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'yape_plin', 'transferencia', 'mixto'));
