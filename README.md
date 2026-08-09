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
| GET | `/api/precios/plantilla-carga` | admin, operador | Descarga un `.xlsx` de ejemplo para la carga masiva |
| POST | `/api/precios/importar` | admin, operador | Carga masiva de precios desde `.csv`/`.xlsx` (campo `archivo`, multipart) |
| PUT | `/api/precios/:proveedorProductoId` | admin, operador | Actualiza el precio de compra |
| PUT | `/api/precios/:proveedorProductoId/proveedor-principal` | admin, operador | Marca proveedor principal |
| POST | `/api/productos`, `/api/proveedores` | admin | Alta de catálogo |
| PUT | `/api/productos/:id`, `/api/proveedores/:id` | admin | Edita catálogo (incluye activar/desactivar) |
| GET | `/api/productos`, `/api/proveedores`, `/api/categorias` | cualquiera | Lectura de catálogo (con conteo de proveedores/productos relacionados) |
| GET/POST | `/api/usuarios` | admin | Lista/crea cuentas del sistema |
| PUT | `/api/usuarios/:id`, `/api/usuarios/:id/password` | admin | Edita rol/estado o resetea contraseña |
| GET/PUT | `/api/configuracion` | admin | Lee/actualiza el margen, costo operativo, unidades estimadas e impuesto activos |
| GET | `/api/tienda/productos`, `/api/tienda/categorias` | **pública, sin token** | Catálogo para la tienda virtual (ver abajo) |

## Tienda Virtual (`public/tienda.html`)

Catálogo público de cara al cliente final, separado de la aplicación
interna: no usa `auth.js` ni requiere sesión. Estilo "clínico y premium"
con Bootstrap 5 (blanco, azul `#007bff`, verde menta `#28a745`), 100%
responsivo — probado sin scroll horizontal en 393px (iPhone 16) y escritorio.

- **`/api/tienda/productos` y `/api/tienda/categorias`** (`src/controllers/tienda.controller.js`)
  son rutas públicas nuevas, separadas de `/api/precios`: por cada producto
  activo eligen una sola oferta representativa (el proveedor marcado como
  principal, o el más barato) y devuelven **solo** los campos seguros de
  cara al cliente — nombre, descripción, categoría, imagen, PVP — nunca
  costo de compra, proveedor ni margen. El PVP se calcula con el mismo
  `pricingEngine.js` que usa el panel interno, así que nunca se desincroniza.
- **`public/js/carrito.js`** — módulo de carrito con patrón pub/sub sobre
  `localStorage` (clave `mpv_tienda_carrito`), independiente de la UI:
  agregar, sumar/restar cantidad, eliminar, vaciar y calcular totales.
  Persiste entre recargas de página.
- **`public/js/tienda.js`** — busca/filtra el catálogo ya cargado (sin ida
  y vuelta al servidor por cada tecla), pinta el grid de tarjetas, el
  badge del carrito y el offcanvas del carrito, y arma un mensaje de
  WhatsApp (`wa.me`) con el resumen del pedido al hacer clic en
  "Finalizar Pedido". **El número de WhatsApp es un valor de ejemplo** —
  reemplaza `CONFIG.WHATSAPP_NUMERO` al inicio de `tienda.js` por el
  número real del consultorio antes de publicar la tienda.
- Los productos sin `imagen_url` muestran un ícono genérico en vez de una
  imagen rota; ese campo ahora es editable desde `productos.html` (panel
  interno) para que el staff pueda subir la URL de una foto real.

Este catálogo es solo lectura para el cliente — no hay checkout con pago
real ni gestión de pedidos entrantes; "Finalizar Pedido" abre WhatsApp con
el resumen para que el consultorio confirme el pedido manualmente. Una
pasarela de pago real y una bandeja de pedidos son evoluciones naturales
si el volumen lo justifica.

## Sistema de diseño (`public/css/base.css`)

Panel interno y tienda virtual tenían cada uno su propia hoja de estilos
(`style.css` / `tienda.css`) con bloques **idénticos** duplicados (estado
vacío, scrollbar, animación de skeleton) y ninguna de las dos cargaba
realmente la tipografía que declaraban — `font-family: 'Inter', ...` caía
en silencio a la fuente del sistema porque Inter nunca se auto-hospedó ni
se cargó desde ningún lado. `base.css` (cargado antes que ambas hojas en
las 8 páginas) resuelve esto:

- **Inter real, auto-hospedada** — variable font (pesos 100–900) en
  `public/vendor/fonts/inter/Inter-Variable.woff2`, un solo archivo de
  ~48 KB para todos los pesos, sin depender de Google Fonts en producción.
- **Tokens compartidos** — escala de espaciado (`--sp-1`…`--sp-8`), radios,
  y curvas de easing (`--ease-out`, `--ease-spring`) para que las
  micro-interacciones (hover de tarjetas, botones, sidebar) se sientan
  consistentes entre ambos productos sin ser idénticas visualmente.
- **Componentes comunes** — estado vacío, scrollbar y skeleton viven una
  sola vez; `style.css`/`tienda.css` los personalizan vía variables CSS
  (`--empty-color`, `--scrollbar-thumb`, `--focus-ring`) en vez de
  redeclarar las reglas.
- **`.reveal` con mejora progresiva real** — el fade-up al hacer scroll
  (`public/js/scroll-reveal.js`, IntersectionObserver) solo oculta contenido
  bajo `html.js-reveal-ready`, una clase que el propio script agrega al
  confirmar que puede observar los elementos; si el script no corre
  (bloqueado, error previo, sin soporte), el contenido nunca queda
  atrapado en `opacity:0`. Además hay una red de seguridad: cualquier
  elemento no revelado en 2.5s se fuerza a visible. *(Esto corrigió un bug
  real encontrado en pruebas: sin este resguardo, el grid de productos
  podía quedar invisible en ciertos escenarios de carga.)*

Dirección visual (inspirada en el lenguaje de landings premium tipo
Magnific — tipografía grande y audaz, gradientes sutiles, ritmo de
secciones claro/oscuro, micro-interacciones — adaptada a una paleta clara
y clínica en vez de oscura, porque un comprador de insumos dentales
necesita percibir limpieza y confianza, no estética "tech/IA"):

- **Tienda**: hero con tipografía más grande y blobs de gradiente
  animados de fondo, estadísticas en vivo (productos/categorías reales,
  no inventados), una franja oscura de "confianza" entre el hero y el
  catálogo (ritmo claro→oscuro→claro), zoom sutil de imagen al pasar el
  mouse sobre una tarjeta, y header que se compacta al hacer scroll.
- **Panel interno**: números de KPI más grandes, barra de acento con
  degradado en el ítem activo del sidebar y al hacer hover sobre una
  tarjeta KPI, fondo con un degradado radial casi imperceptible para dar
  profundidad sin distraer. Deliberadamente **sin** animaciones de entrada
  (`.reveal`) — es una herramienta que el staff abre decenas de veces al
  día; la inmediatez importa más que el efecto.

### Rediseño visual del panel interno — paleta salvia + sidebar flotante

A partir de una referencia visual (mockup de dashboard con sidebar oscuro
flotante, KPIs con íconos de color, gráfico de barras y anillos de
porcentaje), se rediseñó `public/css/style.css` — que alimenta las 7
páginas del panel interno (dashboard, precios, productos, proveedores,
usuarios, configuración, login) — sin tocar backend ni lógica JS más allá
de dos gráficos nuevos:

- **Paleta**: de azul/esmeralda clínico a **verde salvia** profundo
  (`--mpv-blue: #2f5445` — el nombre de variable se conserva por
  compatibilidad, pero ahora es verde) sobre fondo menta claro (`#e9f0ea`).
  Los colores semánticos de rentabilidad (alto/medio/bajo → verde/ámbar/rojo)
  se mantienen intactos porque ya se usaban en toda la tabla de precios.
- **Sidebar flotante**: pasó de ser un panel pegado al borde a un panel
  oscuro con esquinas redondeadas y separación de 14px de los bordes de la
  ventana (`position: fixed` + inset), con degradado sutil y sombra
  proyectada. El indicador de link activo cambió de una barra de
  degradado a la izquierda a un **punto** a la derecha del texto,
  replicando el mockup. En móvil (`<991.98px`) el panel se ancla al borde
  izquierdo como un drawer deslizante, redondeando solo las esquinas
  derechas.
- **Truco de variables CSS**: en vez de tocar el HTML de las 8 páginas
  para poner texto claro dentro del sidebar oscuro, `.mpv-sidebar`
  **redefine** `--mpv-ink`/`--mpv-ink-soft` a valores claros dentro de su
  propio scope — cualquier elemento hijo (incluyendo los que usan
  `style="color:var(--mpv-ink-soft)"` inline en el HTML) hereda
  automáticamente el valor correcto sin necesitar una clase nueva.
- **Nuevos acentos de datos**: `--mpv-chart-purple` y `--mpv-chart-blue`,
  reservados exclusivamente para íconos de KPI y gráficos — nunca para
  estado/semántica, que sigue usando la paleta verde/ámbar/rojo existente.
- **Dashboard con analítica real**: se agregaron dos paneles nuevos entre
  los KPIs y la tabla de actividad reciente, ambos con Chart.js (ya
  vendorizado) y datos reales del tablero de precios, no inventados:
  - *Productos por Categoría* — barras con el conteo de productos
    distintos por categoría (deduplicados, porque un producto puede
    aparecer varias veces si tiene más de un proveedor).
  - *Rentabilidad del Catálogo* — tres anillos de dona (recorte del 72%)
    con el % de combinaciones producto-proveedor en cada nivel de
    rentabilidad, con la etiqueta de porcentaje centrada mediante un
    `<div>` posicionado en absoluto sobre el canvas (Chart.js no soporta
    texto central nativamente sin plugin).
- **Fondo de login corregido**: `login.html` tenía un degradado radial
  con un azul (`#eff6ff`) que quedó huérfano tras el cambio de paleta —
  se corrigió a `var(--mpv-emerald-soft)` para que combine con el resto
  del sistema.

Verificado con Playwright en desktop (1440×900) y móvil (393×852,
iPhone-16-equivalente) en las 7 páginas del panel: sin overflow
horizontal, sidebar y drawer móvil legibles, gráficos renderizando datos
reales, y sin errores de consola nuevos.

*Nota sobre capturas de pantalla*: las capturas `fullPage: true` de
Playwright no manejan bien elementos `position: fixed` — el sidebar
aparece "cortado" a mitad de una imagen larga porque Chromium solo lo
renderiza en su posición de scroll inicial al hacer el stitching. Es un
artefacto de la herramienta de captura, no del sidebar: en el navegador
real (`position: fixed; top/left/bottom: 14px`), el panel permanece
anclado de borde a borde de la ventana sin importar cuánto se scrollee el
contenido (confirmado leyendo `getBoundingClientRect()` tras hacer scroll
real). Las verificaciones de overflow/diseño de esta fase se hicieron con
capturas de viewport normal, no `fullPage`.

### Sidebar colapsable (escritorio)

El sidebar del panel interno puede colapsarse a un riel de solo íconos
(80px) mediante un botón al final del menú (ícono `bi-chevron-double-left`
/ `bi-chevron-double-right`), disponible solo en escritorio (`≥992px`) —
en móvil el sidebar ya es un drawer que se oculta por completo, así que
un segundo modo "colapsado" no aporta nada ahí.

- El estado se guarda en `localStorage` (`mpv_sidebar_collapsed`) y se
  aplica en las 6 páginas que usan el sidebar (`js/auth.js`, cargado en
  todas ellas).
- **Sin parpadeo al navegar**: cada página tiene un `<script>` inline en
  el `<head>`, antes de que se pinte el `<body>`, que aplica la clase
  `mpv-sidebar-collapsed` a `<html>` leyendo directamente `localStorage`
  — si se aplicara solo desde `auth.js` (cargado al final del `<body>`),
  se vería un flash del sidebar expandido en cada cambio de página.
- Los textos de marca, secciones y links (`.brand-title`, `.nav-label`,
  nombre/rol de usuario) se ocultan con CSS al colapsar; los íconos y el
  avatar quedan centrados. Cada link conserva su `title` como tooltip
  nativo del navegador para no perder contexto sin el texto visible.
- Verificado con Playwright: clic para colapsar/expandir, persistencia al
  navegar entre `index.html` → `pricing.html` sin flash, botón oculto en
  viewport móvil (393px), y suite de 60 tests Jest sin cambios (feature
  puramente de frontend).

### Carga masiva de precios (`src/services/importarPrecios.js`)

Acepta `.csv` o `.xlsx` con columnas `SKU`, `Proveedor`, `PrecioCompra` y,
opcionalmente, `TiempoEntregaDias`. Los encabezados se normalizan (sin
acentos/mayúsculas y sin preposiciones como "de"), así que `"Precio de
Compra"`, `"PrecioCompra"` y `"Precio"` son equivalentes.

Cada fila se procesa de forma independiente — si una fila falla (SKU o
proveedor inexistente, precio inválido) el resto se sigue procesando; la
respuesta trae `{ totalFilas, exitosas, fallidas, errores: [{ fila, motivo }] }`.
La combinación proveedor-producto se actualiza si ya existe o se crea si
no (`INSERT ... ON CONFLICT (proveedor_id, producto_id) DO UPDATE`), lo
que dispara los mismos triggers que una edición manual (respaldo del
precio anterior, alerta de alza, registro en `historial_precios`). Si una
fila no trae `TiempoEntregaDias`, ese campo no se toca en un `UPDATE` —
solo se usa un valor por defecto de 0 cuando la combinación es nueva.

### Frontend

- `public/login.html` — inicio de sesión. Guarda el JWT y los datos del
  usuario en `localStorage`.
- `public/index.html` — Dashboard con tarjetas KPI y actividad reciente.
- `public/pricing.html` — Tabla avanzada de gestión de precios con buscador
  en tiempo real, filtros por categoría/proveedor/rentabilidad, badges de
  margen (verde/amarillo/rojo), comparación de proveedores, **historial de
  precios con gráfico de tendencia (Chart.js)**, edición rápida de precios
  vía modal, **exportación a Excel/PDF** (respeta los filtros activos de
  la tabla; el dashboard exporta el tablero completo sin filtrar) y
  **carga masiva de precios** desde `.csv`/`.xlsx`.
- `public/productos.html` — catálogo de productos (SKU, categoría, unidad,
  cantidad de proveedores que lo ofrecen, estado). Lectura para cualquier
  usuario autenticado; alta/edición y activar-desactivar solo para `admin`.
- `public/proveedores.html` — directorio de proveedores con contacto,
  calificación (1-5 estrellas) y cantidad de productos que suministra.
  Mismas reglas de acceso que productos.
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

### Pruebas automatizadas

```bash
npm test
```

`tests/` cubre, sin necesitar una base de datos real (el pool de `pg` se
mockea con Jest):

- `pricingEngine.test.js` — la fórmula de PVP, casos límite (margen 0%,
  margen ≥100%, precio negativo, unidades estimadas en 0) y el desempate
  de `compararProveedores`.
- `authMiddleware.test.js` — rechazo de tokens ausentes/inválidos/expirados
  y el control de roles de `requiereRol`.
- `tableroPrecios.test.js` — que los filtros del tablero viajen como
  parámetros (no concatenados en el SQL) y que el cálculo de cada fila use
  la configuración activa.
- `usuariosController.test.js` — que un admin no pueda desactivarse ni
  quitarse su propio rol, y que la contraseña nunca se guarde en texto
  plano.

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
