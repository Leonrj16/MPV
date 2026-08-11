-- Código de barras por producto, para escanear en Punto de Venta (agregar
-- a la venta) y en Productos (asignarlo al crear/editar). Nullable porque
-- no todos los productos van a tener uno cargado de entrada; UNIQUE porque
-- dos productos no pueden compartir el mismo código físico — Postgres
-- permite múltiples NULL en una columna UNIQUE, así que no hace falta un
-- índice parcial para eso.
ALTER TABLE productos ADD COLUMN codigo_barras VARCHAR(64) UNIQUE;
