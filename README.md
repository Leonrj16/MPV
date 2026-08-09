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
psql -U postgres -d mpv_dental -f database/migrations/003_ventas.sql
psql -U postgres -d mpv_dental -f database/migrations/004_configuracion_tienda.sql
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
| PUT | `/api/productos/:id`, `/api/proveedores/:id` | admin | Edita catálogo (incluye stock, activar/desactivar) |
| GET | `/api/productos`, `/api/proveedores`, `/api/categorias` | cualquiera | Lectura de catálogo (con conteo de proveedores/productos relacionados) |
| POST/PUT/DELETE | `/api/categorias`, `/api/categorias/:id` | admin | Alta, edición y borrado de categorías (ver abajo) |
| GET/POST | `/api/usuarios` | admin | Lista/crea cuentas del sistema |
| PUT | `/api/usuarios/:id`, `/api/usuarios/:id/password` | admin | Edita rol/estado o resetea contraseña |
| GET/PUT | `/api/configuracion` | admin | Lee/actualiza el margen, costo operativo, unidades estimadas e impuesto activos |
| GET | `/api/ventas/productos-disponibles` | cualquiera | Productos activos con stock y PVP vigente, listos para vender |
| GET | `/api/ventas` | cualquiera | Historial de ventas (parámetro `limite`, por defecto 20) |
| POST | `/api/ventas` | admin, operador | Registra una venta de mostrador y descuenta stock (ver abajo) |
| GET | `/api/ventas/:id/boleta` | cualquiera | PDF del comprobante de venta provisional (ver abajo) |
| GET | `/api/tienda/productos`, `/api/tienda/categorias` | **pública, sin token** | Catálogo para la tienda virtual (ver abajo) |
| GET | `/api/tienda/configuracion` | **pública, sin token** | Marca/imágenes/textos/contacto de la tienda (ver "Tienda Virtual configurable") |
| PUT | `/api/tienda/configuracion` | admin | Edita la configuración de marca de la tienda |
| POST | `/api/uploads/imagen` | admin | Sube un logo o imagen de portada (multipart, campo `imagen`, máx. 3 MB) |

## Punto de Venta (`public/punto-venta.html`)

Registra ventas de mostrador (walk-in, no las de la tienda virtual) y
descuenta el stock real del producto, algo que antes no existía: `productos`
solo tenía `stock_minimo` (umbral de alerta) pero ningún contador de
existencias. La migración `003_ventas.sql` agrega `stock_actual` y las
tablas `ventas` / `venta_detalle`.

- **Flujo**: el staff busca un producto en el catálogo (grid de tarjetas con
  stock y PVP vigente), lo agrega a la "Venta Actual" con un stepper de
  cantidad, opcionalmente anota cliente y método de pago, y confirma. El
  precio de cada línea es el mismo PVP sugerido que ya calcula el motor de
  precios a partir del proveedor óptimo — nunca se captura un precio a mano,
  para que la venta siempre refleje el margen configurado.
- **Transacción atómica** (`src/services/ventas.js`): toda la venta corre
  dentro de un `BEGIN`/`COMMIT` con `SELECT ... FOR UPDATE` sobre cada
  producto antes de descontar. Esto evita que dos ventas simultáneas del
  mismo producto dejen el stock en negativo — la segunda transacción espera
  a que la primera libere el bloqueo y ve el stock ya actualizado. Si
  cualquier línea falla (stock insuficiente, producto sin proveedor activo),
  se hace `ROLLBACK` completo: una venta con 3 productos donde el tercero
  falla no descuenta stock de los dos primeros.
- Un producto sin proveedor activo (por lo tanto sin PVP calculable) se
  muestra en el catálogo del punto de venta pero deshabilitado, con el
  motivo visible, en vez de desaparecer silenciosamente.
- Verificado con `curl` contra PostgreSQL real: venta válida con dos líneas,
  venta rechazada por stock insuficiente, venta rechazada por falta de
  proveedor activo, y confirmación de que el `ROLLBACK` deja el stock
  intacto en ambos casos de error. Suite de 8 tests nuevos en
  `tests/ventas.test.js` (transacción completa, cada rama de error,
  cálculo del PVP con el motor de precios existente).

### Boleta de venta provisional

El negocio recién está empezando y todavía no tiene RUC/registro en SUNAT,
así que no puede emitir una boleta electrónica válida — pero sí necesita
entregarle algo al cliente en el momento. `GET /api/ventas/:id/boleta`
genera un PDF con PDFKit (A5, mismo tamaño que usan la mayoría de
impresoras de punto de venta) que dice explícitamente lo que es:

- Encabezado con el nombre/dirección/teléfono del negocio (los mismos
  datos de Configuración > Tienda Virtual, para no duplicar esa
  información en un segundo lugar).
- Título **"COMPROBANTE DE VENTA"**, limpio — la aclaración de que es
  provisional y sin validez tributaria va en **letra chica al pie del
  documento** (6pt, gris claro), como la letra pequeña de cualquier
  recibo, para que no compita visualmente con el nombre del negocio ni
  con el total. No se oculta, pero tampoco es lo primero que se lee.
- N° de comprobante con prefijo `P-` (de "provisional", ej. `P-000004`) —
  distinto a como se numeraría una boleta electrónica real, justamente
  para que no se confundan si en el futuro se migra a facturación
  electrónica de verdad.
- Detalle de productos, cantidades, precio unitario y subtotal, más el
  total — usando los mismos montos que ya quedaron guardados en
  `venta_detalle` al registrar la venta (nunca se recalcula el precio).
- En Punto de Venta, al confirmar una venta el comprobante **se abre solo**
  en una pestaña nueva (vía Blob URL, no descarga forzada) para que el
  staff lo pueda revisar/imprimir de inmediato con el visor nativo del
  navegador; si el navegador bloquea el popup, queda un enlace
  "Ver / imprimir boleta" en el mensaje de éxito como respaldo.

*Nota sobre impuestos*: junto con esta fase se puso el impuesto (IGV) de
`configuracion_margenes` en **0%** — el negocio no está afecto a IGV
todavía por no estar registrado en SUNAT. Como el PVP en toda la
aplicación (tablero, tienda, punto de venta) se calcula en vivo a partir
de esa configuración, el cambio se propagó automáticamente a todos lados
sin tocar código; se puede volver a activar el impuesto correspondiente
desde Configuración > Márgenes e Impuestos el día que el negocio se
registre.

Verificado generando una boleta real contra PostgreSQL (venta con dos
líneas) y **inspeccionando el contenido crudo del PDF** (decodificando el
stream `FlateDecode` para confirmar los colores de relleno reales del
texto) — el visor de PDF de Chromium en este sandbox renderiza parte del
texto en azul en vez de negro, pero el archivo generado tiene el color
correcto (`#0f172a`) en todo el documento; es un artefacto del visor, no
un bug del PDF. Flujo completo probado con Playwright: agregar producto,
registrar venta, y confirmar que se abre una pestaña nueva con el PDF.

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
  "Finalizar Pedido". El número de WhatsApp usado ahí ya no está hardcodeado
  — se administra desde Configuración > Tienda Virtual (ver abajo); si la
  configuración no llega a cargar, cae a un valor de reserva definido en
  `CONFIG.WHATSAPP_NUMERO` al inicio de `tienda.js`.
- Los productos sin `imagen_url` muestran un ícono genérico en vez de una
  imagen rota; ese campo ahora es editable desde `productos.html` (panel
  interno) para que el staff pueda subir la URL de una foto real.

Este catálogo es solo lectura para el cliente — no hay checkout con pago
real ni gestión de pedidos entrantes; "Finalizar Pedido" abre WhatsApp con
el resumen para que el consultorio confirme el pedido manualmente. Una
pasarela de pago real y una bandeja de pedidos son evoluciones naturales
si el volumen lo justifica.

### Rebranding + hero con imagen (`San Judas Tadeo Botica Dental`)

El nombre real del negocio es **San Judas Tadeo Botica Dental** (antes
decía "Consultorio Dental San Judas Tadeo" en el `<title>`, header, footer
y copyright — corregido en las 4 ubicaciones). Además, el hero de la
portada pasó de ser una sola columna de texto centrada a un layout de dos
columnas (texto + imagen), pedido explícitamente porque el primer
"vistazo" de la tienda se sentía incompleto sin nada visual junto al
título:

- No hay fotografía real del negocio todavía, así que en vez de un
  placeholder gris (que se ve roto/inacabado) se compuso una imagen con el
  mismo lenguaje visual del resto del sitio: una tarjeta con degradado de
  marca y el emblema del logo al centro, con 4 íconos de categoría
  (resinas, bioseguridad, instrumental, anestesia) flotando alrededor con
  una animación suave de sube-baja, y dos tarjetas flotantes con señales de
  confianza ("Entrega en 24–48h", "Proveedores certificados"). En pantallas
  muy chicas (`<576px`) las dos tarjetas flotantes se ocultan para no
  saturar; los 4 íconos de categoría se quedan.
- Se agregaron dos botones de llamado a la acción: "Ver catálogo" (ancla a
  `#catalogo`, el contenedor del grid de productos) y "Escríbenos"
  (WhatsApp directo), donde antes el hero no tenía ningún CTA explícito.
- **Bug real encontrado al verificar con Playwright**: la imagen del hero
  no se veía — la tarjeta y el emblema central estaban en el DOM pero con
  `width:0; height:0`. Causa: `.hero-media` tiene `aspect-ratio:1/1` pero
  todos sus hijos son `position:absolute` (no aportan tamaño intrínseco al
  padre), combinado con `margin:0 auto` — eso activa *shrink-to-fit*
  sizing en vez de que el ítem de grid se estire, y sin contenido en flujo
  normal el resultado es una caja de tamaño cero. Se corrigió agregando
  `width:100%` explícito (con `max-width:420px` para el tope), confirmado
  con `getBoundingClientRect()` antes/después del fix (0×0 → 420×420) y
  con capturas en 1440px, 768px y 393px sin overflow horizontal.

### Tienda Virtual configurable (marca, imágenes, textos, contacto)

Hasta esta fase, el nombre del negocio, los textos del hero, el logo, la
imagen de portada y todos los datos de contacto estaban hardcodeados en
`tienda.html` — cambiarlos requería editar HTML y volver a desplegar. Ahora
son editables desde **Configuración > Tienda Virtual** (panel interno,
`public/configuracion.html`), sin tocar código:

- **Migración 004** (`database/migrations/004_configuracion_tienda.sql`)
  crea `configuracion_tienda`, una tabla de **fila única** (`id` fijo en 1,
  forzado con `CHECK (id = 1)` — no hay "perfiles" como en
  `configuracion_margenes`, es literalmente la configuración pública
  vigente) con: nombre del negocio + eslogan (el lockup de marca en dos
  líneas que ya usaban header y footer), título y descripción del hero,
  URL de logo, URL de imagen de portada, teléfono, WhatsApp, dirección,
  horario y email de contacto, y URLs de Facebook/Instagram.
- **`GET /api/tienda/configuracion` es pública** (igual que
  `/api/tienda/productos`) porque la consume la propia tienda sin sesión;
  el contenido no es sensible, es exactamente lo que ya se muestra en la
  portada. **`PUT` sí requiere `admin`**.
- **Sin imagen configurada, no se ve un placeholder roto**: si `logoUrl`
  o `heroImagenUrl` están vacíos, la tienda se queda con el ícono de marca
  y la ilustración compuesta (emblema + íconos flotantes) que ya
  existían. Si se configura una URL y falla al cargar (link roto, dominio
  caído), un `onerror` la reemplaza por el mismo fallback — nunca un
  ícono de imagen rota. Verificado a propósito con una URL externa
  inalcanzable desde este sandbox: el fallback se activó correctamente.
- **El número de WhatsApp se limpia en el backend** — `actualizarConfiguracionTienda`
  quita cualquier `+`, espacio o guión antes de guardar (`replace(/\D/g, '')`),
  para que `wa.me/<numero>` funcione sin importar cómo lo haya tecleado el
  admin.
- **Redes sociales opcionales de verdad**: los íconos de Facebook/Instagram
  del footer llevan `d-none` por defecto y solo se muestran si hay una URL
  configurada — no quedan enlaces `href="#"` muertos.
- El panel de admin (`formTienda` en `configuracion.js`) usa el mismo
  patrón que "Márgenes e Impuestos": cargar → precompletar inputs → guardar
  → repintar con la respuesta del servidor, con un botón "Ver tienda" que
  abre `tienda.html` en una pestaña nueva para revisar el resultado.

Verificado end-to-end con Playwright: editar todos los campos desde el
panel, guardar, y confirmar que la tienda pública (`<title>`, header,
hero, topstrip, footer, botones de WhatsApp) refleja los cambios sin
recargar código — solo datos. 8 tests nuevos en `tests/configuracionTienda.test.js`
(mapeo de campos, validaciones, limpieza del número de WhatsApp). Suite
completa: 76/76.

#### Subir el logo/portada como archivo (no solo pegar un link)

Los campos de logo e imagen de portada aceptan **una URL o un archivo**:
un botón junto a cada campo abre el selector de archivos, sube la imagen a
`POST /api/uploads/imagen` (multipart, `admin` únicamente) y reemplaza el
campo de texto con la URL pública que devuelve el servidor
(`/uploads/<nombre-aleatorio>.ext`) — el admin nunca necesita hostear la
imagen en otro sitio para poder usarla.

- `multer.diskStorage` guarda el archivo directamente en
  `public/uploads/` (servida por el `express.static` que ya existía) con
  un **nombre aleatorio** (`crypto.randomUUID()`), no el nombre original
  — evita colisiones entre dos admins subiendo "logo.png" el mismo día y
  cualquier intento de path traversal vía el nombre que mande el cliente.
- `fileFilter` solo acepta `image/png|jpeg|webp|gif`, con un límite de 3
  MB; los errores de multer (tipo no soportado, archivo muy grande) se
  capturan explícitamente y se devuelven como JSON — sin ese manejo,
  Express serviría su página de error HTML por defecto y rompería el
  contrato de `/api`.
- Cada campo muestra una miniatura de vista previa (44×44) que se
  actualiza al cargar la configuración, al subir un archivo y al guardar.
- `public/uploads/` no se versiona (solo `.gitkeep`, ver `.gitignore`) —
  las imágenes reales viven en el servidor donde corre la app, no en el
  repositorio.

Verificado con Playwright subiendo un archivo real (`setInputFiles`):
confirma que el archivo queda accesible públicamente (`200`,
`image/png`), que el campo de texto se actualiza con la ruta devuelta, y
que la tienda pública termina mostrando la imagen subida.

*Nota de depuración*: la primera versión de este fix no funcionaba — el
campo de texto se llenaba con `/uploads/…png` pero "Guardar Cambios" no
hacía nada. Causa: el input era `type="url"`, y la validación nativa de
HTML5 para ese tipo exige una URL absoluta con esquema (`https://…`); una
ruta relativa como `/uploads/…png` la rechaza en silencio con un tooltip
del navegador, y el evento `submit` nunca llega al JavaScript. Se cambió
a `type="text"` en ambos campos (siguen aceptando URLs absolutas también,
simplemente ya no las exige).

### El contenido largo ya no "estira" el sidebar

Al agregar el panel "Tienda Virtual" (harto más largo que "Márgenes e
Impuestos"), una captura de verificación tomada en un viewport
inusualmente alto mostró el sidebar oscuro con un hueco enorme de espacio
vacío entre el último link y el pie de usuario — porque `.mpv-sidebar` es
`position: fixed` y siempre ocupa el alto completo del *viewport*, nunca
el del contenido. En un viewport normal esto no se nota, pero es información
real: cuanto más largo el contenido, más "flotante" y desconectado se ve
un sidebar que no scrollea con nada.

Fix: `.mpv-main` pasó de `min-height: 100vh` a `height: 100vh; overflow-y: auto` —
ahora el contenido scrollea **dentro de su propio contenedor**, capado a
la altura del viewport, en vez de estirar `<body>` completo. El sidebar
(fixed) y el contenedor de contenido (capado a 100vh) miden exactamente
lo mismo siempre, sin importar cuánto contenido tenga la página. El
topbar sigue `position: sticky` correctamente porque `.mpv-main` es ahora
su ancestro con scroll. Verificado con Playwright en un viewport normal
(900px) y uno deliberadamente alto (1400px, el mismo que causó el bug):
`document.body.scrollHeight` nunca excede `window.innerHeight` en
ninguno de los dos casos.

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
  **stock actual**, cantidad de proveedores que lo ofrecen, estado). Lectura
  para cualquier usuario autenticado; alta/edición, stock y
  activar-desactivar solo para `admin`. También incluye un modal de
  **gestión de categorías** (botón "Categorías", solo `admin`): crear,
  renombrar en línea y eliminar. `categoria_id` en `productos` usa
  `ON DELETE SET NULL`, así que borrar una categoría con productos no
  falla — esos productos quedan "Sin categoría" en vez de bloquear el
  borrado; el modal avisa cuántos productos se van a desasociar antes de
  confirmar. La categoría recién creada/renombrada aparece de inmediato en
  los selects de los formularios de producto, sin recargar la página.
- `public/punto-venta.html` — registra ventas de mostrador y descuenta
  stock (ver sección "Punto de Venta" más arriba). Disponible para `admin`
  y `operador`, igual que la gestión de precios.
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
