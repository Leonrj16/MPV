# MPV Dental — Plataforma de Gestión de Precios

Plataforma interna para gestionar precios de compra de proveedores y calcular
automáticamente el Precio de Venta al Público (PVP) para una tienda virtual
de productos dentales.

## Fase 1 — Arquitectura, Base de Datos y Motor de Precios

**Stack:** Node.js + Express + PostgreSQL (API REST) · Bootstrap 5 + Bootstrap Icons (frontend estático).

### Estructura del proyecto

```
database/schema.sql        Esquema SQL: tablas, vistas, triggers y datos de ejemplo
src/config/db.js            Conexión al pool de PostgreSQL
src/services/pricingEngine.js  Motor de cálculo de precios (PVP, comparación de proveedores)
src/controllers/            Lógica de negocio de cada endpoint
src/routes/                 Definición de rutas REST
src/server.js                Punto de entrada de la API
public/                      Frontend estático (Dashboard + Gestión de Precios)
```

### Puesta en marcha

```bash
npm install
cp .env.example .env        # ajustar credenciales de PostgreSQL
psql -U postgres -d mpv_dental -f database/schema.sql
npm run dev                 # http://localhost:3000
```

### Modelo de datos

- **proveedores** — datos de contacto de cada proveedor.
- **productos** / **categorias** — catálogo de productos dentales.
- **proveedor_producto** — relación N:M: qué proveedor vende qué producto, a
  qué precio, con qué tiempo de entrega. Un trigger respalda automáticamente
  el precio anterior (`precio_compra_anterior`) cada vez que cambia el precio,
  lo que permite detectar alzas.
- **configuracion_margenes** — parámetros globales del motor: margen de
  utilidad por defecto, costo operativo mensual, unidades estimadas
  vendidas/mes (para prorratear el costo logístico) e impuesto (IGV/IVA).
- **vw_proveedor_optimo** / **vw_tablero_precios** — vistas SQL que resuelven
  el proveedor más barato por producto y arman el tablero completo.

### Motor de precios (`src/services/pricingEngine.js`)

```
Costo Total Unitario    = Precio de Compra + Costo Logístico Proporcional
Subtotal (sin impuesto) = Costo Total Unitario / (1 - Margen de Utilidad %)
PVP Sugerido             = Subtotal + (Subtotal × Impuesto %)
```

El costo logístico proporcional se calcula como
`costo_operativo_mensual / unidades_estimadas_mensual`, salvo que el registro
proveedor-producto tenga un override propio. `compararProveedores()` ordena
las ofertas por precio de compra (y tiempo de entrega como desempate) y
marca la más conveniente como **Proveedor Óptimo**.

### API REST

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/dashboard/kpis` | KPIs del dashboard |
| GET | `/api/precios` | Tablero de precios (filtros: `categoria`, `proveedor`, `busqueda`) |
| GET | `/api/precios/comparar/:productoId` | Compara proveedores de un producto |
| PUT | `/api/precios/:proveedorProductoId` | Actualiza el precio de compra |
| PUT | `/api/precios/:proveedorProductoId/proveedor-principal` | Marca proveedor principal |
| GET/POST | `/api/productos`, `/api/proveedores`, `/api/categorias` | CRUD base |

### Frontend (Fase 2 — incluido como preview funcional)

- `public/index.html` — Dashboard con tarjetas KPI y actividad reciente.
- `public/pricing.html` — Tabla avanzada de gestión de precios con buscador
  en tiempo real, filtros por categoría/proveedor/rentabilidad, badges de
  margen (verde/amarillo/rojo), comparación de proveedores y edición rápida
  de precios vía modal.

Ambas vistas consumen la API mediante `public/js/api.js` y no requieren build
step: se sirven como estáticos desde el propio Express (`npm run dev`).

## Próximas fases sugeridas

- Autenticación y roles (admin / operador).
- Historial de precios con gráficos de tendencia.
- Alertas automáticas por email/WhatsApp ante alza de precios.
- Exportación a Excel/PDF del tablero de precios.
