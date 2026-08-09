# MPV Dental — Plataforma de Gestión de Precios

Plataforma interna para gestionar precios de compra de proveedores y calcular
automáticamente el Precio de Venta al Público (PVP) para una tienda virtual
de productos dentales.

## Fase 1 — Arquitectura, Base de Datos y Motor de Precios

**Stack:** Node.js + Express + PostgreSQL (API REST) · Bootstrap 5 + Bootstrap Icons + Chart.js (frontend estático) · ExcelJS + PDFKit (exportación de reportes).

### Estructura del proyecto

```
database/schema.sql              Esquema base: tablas, vistas, triggers y datos de ejemplo
database/migrations/002_...sql   Usuarios, roles e historial de precios
src/config/db.js                 Conexión al pool de PostgreSQL
src/services/pricingEngine.js    Motor de cálculo de precios (PVP, comparación de proveedores)
src/middleware/auth.middleware.js  Verificación de JWT y control de roles
src/controllers/                 Lógica de negocio de cada endpoint
src/routes/                      Definición de rutas REST
src/server.js                    Punto de entrada de la API
public/                          Frontend estático (Login, Dashboard, Gestión de Precios)
```

### Puesta en marcha

```bash
npm install
cp .env.example .env        # ajustar credenciales de PostgreSQL y JWT_SECRET
psql -U postgres -d mpv_dental -f database/schema.sql
psql -U postgres -d mpv_dental -f database/migrations/002_auth_historial.sql
npm run dev                 # http://localhost:3000 (redirige a /login.html)
```

Cuenta de demostración tras aplicar la migración: `admin@mpvdental.com` /
`Admin123!` (rol admin) y `compras@mpvdental.com` / `Admin123!` (rol
operador). Cambia estas contraseñas antes de usar el sistema en producción.

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

### Migración 002 — Autenticación e Historial (`database/migrations/`)

- **usuarios** — email, hash bcrypt de la contraseña y `rol` (`admin` |
  `operador`), con índice único case-insensitive sobre el email.
- **historial_precios** — cada alta o cambio de precio en
  `proveedor_producto` se registra automáticamente vía trigger
  (`trg_historial_precio`), lo que alimenta el gráfico de tendencia. La
  migración también hace un *backfill* del precio vigente de cada
  `proveedor_producto` ya existente, para que ninguna combinación quede sin
  al menos un punto histórico.

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

Moneda: todos los montos se manejan en **Soles peruanos (PEN)** — la columna
`moneda` de `proveedor_producto` por defecto es `'PEN'` y el frontend
formatea con `Intl.NumberFormat('es-PE', { currency: 'PEN' })`.

### API REST

Todas las rutas bajo `/api` (salvo `/api/auth/login`) requieren
`Authorization: Bearer <token>`, emitido por el login y válido 8 horas.

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | — | Autentica y devuelve el JWT |
| GET | `/api/auth/me` | cualquiera | Datos del usuario autenticado |
| GET | `/api/dashboard/kpis` | cualquiera | KPIs del dashboard |
| GET | `/api/precios` | cualquiera | Tablero de precios (filtros: `categoria`, `proveedor`, `busqueda`) |
| GET | `/api/precios/comparar/:productoId` | cualquiera | Compara proveedores de un producto |
| GET | `/api/precios/historial/:proveedorProductoId` | cualquiera | Serie histórica de precios de compra |
| GET | `/api/precios/exportar/excel` | cualquiera | Descarga el tablero en `.xlsx` (acepta los mismos filtros que `/api/precios`) |
| GET | `/api/precios/exportar/pdf` | cualquiera | Descarga el tablero en `.pdf` (mismos filtros) |
| PUT | `/api/precios/:proveedorProductoId` | admin, operador | Actualiza el precio de compra |
| PUT | `/api/precios/:proveedorProductoId/proveedor-principal` | admin, operador | Marca proveedor principal |
| POST | `/api/productos`, `/api/proveedores` | admin | Alta de catálogo |
| GET | `/api/productos`, `/api/proveedores`, `/api/categorias` | cualquiera | Lectura de catálogo |
| GET/POST | `/api/usuarios` | admin | Lista/crea cuentas del sistema |
| PUT | `/api/usuarios/:id`, `/api/usuarios/:id/password` | admin | Edita rol/estado o resetea contraseña |
| GET/PUT | `/api/configuracion` | admin | Lee/actualiza el margen, costo operativo, unidades estimadas e impuesto activos |

### Frontend

- `public/login.html` — inicio de sesión. Guarda el JWT y los datos del
  usuario en `localStorage`.
- `public/index.html` — Dashboard con tarjetas KPI y actividad reciente.
- `public/pricing.html` — Tabla avanzada de gestión de precios con buscador
  en tiempo real, filtros por categoría/proveedor/rentabilidad, badges de
  margen (verde/amarillo/rojo), comparación de proveedores, **historial de
  precios con gráfico de tendencia (Chart.js)**, edición rápida de precios
  vía modal y **exportación a Excel/PDF** (respeta los filtros activos de
  la tabla; el dashboard exporta el tablero completo sin filtrar).
- `public/usuarios.html` — solo para `admin`: alta de usuarios, cambio de
  rol/estado y reseteo de contraseña. Un admin no puede desactivarse ni
  quitarse el rol a sí mismo (bloqueado también en el backend).
- `public/configuracion.html` — solo para `admin`: edita el margen de
  utilidad por defecto, costo operativo mensual, unidades estimadas e
  impuesto, con una vista previa en vivo del cálculo de PVP sobre un precio
  de ejemplo (misma fórmula que `pricingEngine.js`, duplicada en el cliente
  para no ir al servidor en cada tecla).
- `public/js/auth.js` — expone `window.MPVAuth`; redirige a `login.html` si
  no hay sesión, pinta nombre/rol/avatar en el sidebar y oculta con
  `MPVAuth.exigirRol('admin')` los enlaces/páginas exclusivos de admin
  (`[data-rol="admin"]`) para el rol operador.
- `public/js/api.js` — adjunta el `Authorization: Bearer <token>` a cada
  llamada y cierra la sesión automáticamente ante un 401.

### Responsivo

El layout (sidebar, topbar, tarjetas KPI, tablas, modales) fue verificado
sin scroll horizontal de página en 320px, 390px (móvil) y 768px (tablet):
el topbar envuelve sus acciones a una segunda fila en pantallas angostas
(`.mpv-topbar-title` / `.mpv-topbar-actions`), y las tablas anchas
desplazan su propio contenedor (`.mpv-table-wrap { overflow-x: auto }`)
en vez de romper el ancho de la página.

Bootstrap 5, Bootstrap Icons y Chart.js están vendorizados en
`public/vendor/` en vez de cargarse desde un CDN, para que el sistema
funcione sin depender de internet (útil detrás de firewalls corporativos).
Para actualizar de versión, reemplaza los archivos correspondientes por los
de la nueva release.

La protección real es a nivel de API (JWT + roles); las páginas estáticas
se sirven sin autenticar y el guard de `auth.js` solo evita que la interfaz
se muestre vacía — es la barrera adecuada para una herramienta interna,
pero si se expone a una red no confiable conviene añadir autenticación
también a nivel de servidor de archivos estáticos.

Ambas vistas consumen la API mediante `public/js/api.js` y no requieren build
step: se sirven como estáticos desde el propio Express (`npm run dev`).

## Estado de verificación

El esquema y la API fueron probados de extremo a extremo contra una
instancia real de PostgreSQL 16, incluyendo:

- Carga de `schema.sql` y de `database/migrations/002_auth_historial.sql`.
- Login con credenciales correctas/incorrectas, acceso sin token (401) y
  control de roles (admin vs. operador, incluyendo un intento bloqueado
  con 403).
- Actualización de precio con respaldo automático del precio anterior y
  registro automático en `historial_precios` vía triggers.
- Tablero de precios, comparación de proveedores y serie histórica.

El frontend fue verificado visualmente en navegador: redirección a login
sin sesión, error de credenciales, dashboard autenticado con datos reales,
buscador y filtros de la tabla de precios, y el gráfico de tendencia del
modal de historial.

## Próximas fases sugeridas

- Alertas automáticas por email/WhatsApp ante alza de precios.
- Exportación a Excel/PDF del tablero de precios.
- Pantalla de administración de usuarios (alta/baja, cambio de contraseña).
- Configuración de márgenes editable desde la interfaz.
