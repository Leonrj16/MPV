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
psql -U postgres -d mpv_dental -f database/migrations/005_pedidos_web.sql
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
| GET | `/api/ventas/kpis` | cualquiera | Ingresos hoy/semana/mes, ventas de hoy, top 5 productos del mes |
| POST | `/api/tienda/pedidos` | **pública, sin token** | Registra un pedido de la tienda virtual (no descuenta stock) |
| GET | `/api/pedidos-web` | cualquiera | Lista pedidos web (filtro opcional `estado`) |
| PUT | `/api/pedidos-web/:id/estado` | admin, operador | Cambia el estado de un pedido (pendiente/atendido/cancelado) |
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

## Fase A — Historial de Ventas, Pedidos Web y dashboard con ventas reales

Hasta esta fase había una desconexión real en el sistema: una venta de
mostrador (Punto de Venta) quedaba guardada con boleta y todo, pero un
pedido hecho desde la **tienda virtual** se iba directo a WhatsApp sin
dejar ningún rastro — no había forma de ver cuántos pedidos web llegaron
ni de que no se perdiera uno en el chat. La migración `005_pedidos_web.sql`
y tres piezas nuevas cierran ese hueco.

### `public/ventas.html` — Historial de Ventas + Pedidos Web

Una sola página con dos pestañas (un simple toggle de botones, sin
librería de tabs):

- **Ventas de Mostrador**: lista las ventas reales de `ventas`/`venta_detalle`
  con filtros por cliente (`ILIKE`, con debounce de 400ms para no
  disparar una consulta por cada tecla), rango de fechas y método de
  pago — todos parametrizados (`GET /api/ventas?desde=&hasta=&cliente=&metodoPago=`).
  El filtro de fecha `hasta` incluye el día completo
  (`created_at < (hasta::date + interval '1 day')`), no solo la medianoche.
  Cada fila tiene un botón "Ver boleta" que reutiliza `MPV.abrirBoleta()`
  (la misma función que usa Punto de Venta).
- **Pedidos Web**: lista `pedidos_web` con su detalle, filtrable por
  estado. Cada fila trae un `<select>` para cambiar el estado
  (pendiente/atendido/cancelado) sin abrir un modal — el cambio se guarda
  al vuelo (`PUT /api/pedidos-web/:id/estado`). El botón de la pestaña
  muestra un badge con la cantidad de pedidos **pendientes**, para que se
  note de un vistazo que hay algo por atender sin tener que entrar a la
  pestaña.

### `pedidos_web` — deliberadamente separada de `ventas`

Un pedido web es una **intención de compra**, no un hecho consumado: se
guarda con el mismo motor de precios (`calcularPVP` + proveedor óptimo)
que usa el resto de la app, pero **no descuenta stock** — a diferencia de
`registrarVenta()` (Punto de Venta), que sí lo hace dentro de una
transacción con `SELECT ... FOR UPDATE`. Si el negocio decide atender un
pedido web, el staff lo procesa como una venta real desde Punto de Venta
(ahí sí se valida y descuenta stock); mezclar ambos conceptos en una sola
tabla habría significado inventar un estado "a medio confirmar" para el
stock, más frágil que mantenerlos separados.

- `POST /api/tienda/pedidos` es pública (la llama la propia tienda, sin
  sesión de staff) y corre en una transacción igual que `registrarVenta()`:
  valida que cada producto exista, esté activo y tenga un proveedor con
  precio antes de confirmar nada.
- En `tienda.html`, el offcanvas del carrito ahora pide un nombre
  opcional ("Tu nombre — para identificar tu pedido") antes de
  "Finalizar Pedido por WhatsApp". Al hacer clic, **`window.open()` hacia
  WhatsApp se llama primero y de forma síncrona** (sin `await` antes) —
  si se esperara a que termine el `fetch` del registro interno antes de
  abrir la ventana, Safari (y algunos navegadores) bloquean el popup por
  no "parecer" iniciado directamente por el usuario. El registro del
  pedido (`fetch('/api/tienda/pedidos')`) es *best-effort* y no bloqueante:
  si falla (sin conexión, etc.), el pedido por WhatsApp ya se envió de
  todos modos y el error se ignora en silencio — el tracking interno
  nunca debe poder romper el canal de venta real.

### Dashboard con ventas reales, no solo precios

`GET /api/ventas/kpis` agrega ingresos de hoy/semana/mes y el conteo de
ventas de hoy (con `FILTER (WHERE ...)` sobre `CURRENT_DATE` /
`date_trunc('week'|'month', CURRENT_DATE)`), más el top 5 de productos
más vendidos del mes por cantidad. El dashboard tenía puros KPIs de
precios/márgenes hasta ahora — nunca mostraba lo que efectivamente se
vendió. Se agregó una fila de 4 tarjetas (Ingresos Hoy/Semana/Mes, Ventas
Hoy) más un panel "Top Productos del Mes", entre los KPIs existentes y el
gráfico de categorías. Los montos en soles usan una variante de tarjeta
más angosta (`.kpi-value-money`, 1.5rem en vez de 2.05rem) porque
"S/ 1,234.50" es bastante más largo que un conteo o un porcentaje.

Verificado con `curl` contra PostgreSQL real (crear pedido web público,
listarlo, cambiar estado, rechazo de estado inválido y de producto
inexistente) y con Playwright de punta a punta: filtrar el historial de
ventas por cliente, ver boleta desde el historial, cambiar el estado de
un pedido y ver actualizarse el badge, y completar una compra en la
tienda hasta confirmar (consultando el backend directamente) que el
pedido quedó registrado con el nombre y los productos correctos. Sin
overflow horizontal en escritorio ni en 393px. 17 tests nuevos
(`pedidosWeb.test.js` + ampliaciones a `ventas.test.js`). Suite completa:
89/89.

## Fase B — Detalle de producto, stock, orden, destacados y carrito dedicado

Cierra la parte de "tienda que se siente premium y completa" desde el
punto de vista del cliente final: antes el catálogo era una grilla plana
sin forma de ver más detalle de un producto, sin saber si quedaba stock,
sin poder ordenar por precio/popularidad, sin una vitrina de lo más
vendido, y el único lugar para revisar el pedido antes de mandarlo por
WhatsApp era un offcanvas angosto.

### Backend: `stockActual` y `vendidosTotal` viajan con cada producto

`src/controllers/tienda.controller.js` se reescribió para que **todo el
filtrado/orden siga ocurriendo en el cliente** (mismo principio ya usado
en `tienda.js`: el catálogo se carga una sola vez), agregando los datos
que el frontend necesita para eso sin pedir nada más al servidor:

- `stockActual` ya venía en la fila de `productos`, ahora se expone en
  la respuesta pública.
- `vendidosTotal` se calcula con una segunda consulta agregada
  (`SELECT producto_id, SUM(cantidad) FROM venta_detalle GROUP BY producto_id`)
  y se mapea en memoria — así el catálogo puede ordenarse por popularidad
  sin tocar el servidor de nuevo.
- **`GET /api/tienda/productos/:id`** (nuevo, público): detalle completo
  de un producto + hasta 4 "relacionados" de la misma categoría
  (excluyéndose a sí mismo). 404 si no existe o no tiene oferta activa.
- **`GET /api/tienda/destacados`** (nuevo, público): "Los Más Vendidos"
  calculado con datos reales de `venta_detalle` (top 8 por cantidad
  vendida), **no una bandera manual de "destacado" inventada**. Si el
  negocio todavía no registró ninguna venta (caso típico al arrancar),
  cae a los 8 productos activos más recientes en vez de mostrar una
  sección vacía — el `criterio` devuelto (`mas_vendidos` | `recientes` |
  `ninguno`) le dice al frontend qué título usar. Si algún id ya no tiene
  oferta activa para cuando se resuelve la segunda consulta, se descarta
  en silencio en vez de romper la respuesta.
- 9 tests nuevos en `tests/tiendaController.test.js` (nunca expone
  `precioCompraUnitario` ni proveedor, relacionados excluye al propio
  producto, destacados cae a recientes sin ventas y conserva el orden de
  popularidad cuando sí las hay).

### Badges de stock y tope de cantidad en el carrito

`tienda.js` pinta un badge sobre la imagen del producto según
`stockActual`: **"Agotado"** (gris oscuro, botón "Agregar" deshabilitado)
o **"Últimas N unidades"** (ámbar, con N ≤ 5). El tope de cantidad no es
solo visual: `Carrito.agregar()`/`actualizarCantidad()` en
`public/js/carrito.js` ahora guardan `stockActual` dentro de cada item
del carrito y **topan la cantidad a ese valor** — así ningún lugar de la
app (offcanvas, modal de detalle, página de carrito) deja pedir más
unidades de las que hay, sin necesitar volver a consultar el catálogo
completo en cada página.

### Orden del catálogo y "Los Más Vendidos"

Un `<select>` junto al contador de resultados ordena por Relevancia
(orden del servidor), Más vendidos (`vendidosTotal`), Precio (asc/desc) o
Nombre A-Z — todo client-side sobre el array ya cargado. Entre la franja
de confianza y el catálogo se agregó una sección "Los Más Vendidos" (o
"Recién Llegados" si aún no hay ventas) que reutiliza exactamente las
mismas tarjetas de producto del grid principal; si el backend devuelve
`criterio: 'ninguno'` (sin productos activos), la sección completa se
oculta con `d-none` en vez de mostrarse vacía.

### Modal de detalle de producto

Un clic en cualquier tarjeta (fuera del botón "Agregar") abre un modal de
Bootstrap con imagen grande, categoría, descripción completa, precio,
badge de stock y su propio botón "Agregar al Carrito", más una fila
"También te puede interesar" con los relacionados devueltos por
`GET /api/tienda/productos/:id` — hacer clic en un relacionado vuelve a
pedir el detalle y refresca el mismo modal en vez de abrir uno nuevo. El
click-to-add del grid y del modal comparten la misma función
(`agregarAlCarritoConTope`) para que el tope de stock se respete
igual en los dos lugares.

### `public/carrito.html` — página dedicada de carrito

El offcanvas del header sigue existiendo para agregar rápido sin salir
del catálogo, pero ahora tiene un enlace "Ver carrito completo" hacia
`carrito.html`: una página de ancho completo con la lista de productos a
la izquierda (imagen, stepper de cantidad, subtotal, eliminar) y un panel
de resumen fijo a la derecha (cantidad de productos, total, nombre
opcional del cliente, y el mismo flujo de "Finalizar Pedido por
WhatsApp" + registro best-effort en `pedidos_web` que ya usaba el
offcanvas). `public/js/carrito-pagina.js` es un script nuevo e
independiente de `tienda.js` — cuando el carrito está vacío, la página
muestra un estado vacío con un enlace de vuelta al catálogo en vez de un
resumen en blanco.

Verificado con `npx jest` (98/98, suite completa sin regresiones — este
trabajo fue 100% frontend, no tocó tests existentes salvo el archivo
nuevo) y con Playwright en escritorio (1440×900) y móvil (393×852): sin
overflow horizontal en `tienda.html` ni en `carrito.html`, badge "Últimas
N unidades"/"Agotado" confirmado bajando el stock de un producto real en
la base de datos y restaurándolo después, orden por precio funcionando,
modal de detalle abriendo y agregando al carrito, y flujo completo hasta
la página de carrito dedicada.

## Fase C — SEO, PWA, favoritos, compartir producto y rediseño responsive

Cierra el roadmap de la tienda virtual con lo que le falta a un catálogo
para funcionar como un producto real de cara al público: que se pueda
encontrar en buscadores, que se pueda "instalar" como app, que el cliente
pueda guardar lo que le interesa y compartirlo, y que **toda** la
aplicación (no solo la tienda) se vea bien en un celular.

### SEO

- `tienda.html` suma `<link rel="canonical">`, Open Graph y Twitter Card,
  y un bloque JSON-LD estático (`MedicalBusiness`) con los datos de
  contacto del negocio — no cambia con el catálogo, a diferencia de:
- Un segundo bloque JSON-LD (`ItemList` de `Product`) que **`tienda.js`
  inyecta en tiempo de ejecución** (`inyectarJsonLdProductos()`) justo
  después de renderizar el catálogo real, con nombre, imagen, precio y
  disponibilidad de cada producto tal como se ve en pantalla — se
  reconstruye en cada carga para que nunca quede desincronizado del
  catálogo visible (structured data que no coincide con el contenido
  visible es justamente lo que penalizan los buscadores).
- `robots.txt` (permite la tienda y el carrito, bloquea `/api/` y todas
  las páginas del panel interno) y `sitemap.xml`, ambos en `public/`.
  **Importante**: usan `sanjudastadeo.dental` como dominio de ejemplo —
  hay que reemplazarlo por el dominio real antes de enviar el sitemap a
  Google Search Console (queda marcado con un comentario en el archivo).

### PWA (Progressive Web App)

- `public/manifest.json` + `public/service-worker.js`: la tienda ahora se
  puede "instalar" desde el navegador (ícono en el celular, sin barra de
  URL). El service worker cachea el shell estático (HTML/CSS/JS/íconos)
  con una estrategia *stale-while-revalidate* — responde de caché al
  instante y refresca en segundo plano — pero **nunca cachea `/api/`**:
  precios y stock siempre se piden frescos al servidor.
- Los 5 tamaños de ícono (16/32/180/192/512px) se generaron con un script
  Node de un solo uso (sin dependencias externas: SDF de rectángulo
  redondeado + gradiente azul→verde de marca + cruz blanca, codificado a
  PNG a mano con `zlib.deflateSync`, sin librerías de imágenes) — no
  quedó en el repo, solo su resultado en `public/icons/`.
- Registrado en `tienda.js` y `carrito-pagina.js` (`navigator.serviceWorker.register`,
  dentro de `window.addEventListener('load', ...)` para no competir con
  la carga inicial de la página).

### Favoritos (`public/js/favoritos.js`)

Mismo patrón pub/sub que `carrito.js`, pero solo guarda ids en
`localStorage` (`mpv_tienda_favoritos`) — el catálogo completo ya vive en
memoria en `tienda.js`, así que no hace falta duplicar datos de producto.
Corazón en cada tarjeta y en el modal de detalle (comparten la misma
función `alternarFavorito`), botón en el header con contador que filtra
el catálogo a "solo favoritos" sin volver a pedir nada al servidor.

### Compartir producto + enlaces profundos

El modal de detalle suma un botón "Compartir" que usa
`navigator.share()` (hoja nativa de compartir en móvil) con *fallback* a
copiar el enlace al portapapeles en escritorio. El enlace generado
(`tienda.html?producto=ID#catalogo`) funciona de vuelta: `tienda.js` lee
`?producto=` al cargar y abre automáticamente el modal de ese producto
(`abrirDetalleDesdeUrl()`), así que compartir un producto realmente lleva
a ese producto, no solo a la portada genérica de la tienda.

### Rediseño responsive del panel interno

La auditoría con Playwright en 375/768/1440px no encontró overflow
horizontal en ninguna página (eso ya estaba resuelto de fases previas),
pero sí un problema de fondo real: **toda tabla de datos del panel**
(`productos.html`, `proveedores.html`, `usuarios.html`, ambas pestañas de
`ventas.html`, `pricing.html`, la tabla del dashboard) usa `.mpv-table`
con `min-width: 1080px` — por debajo de esa medida, la tabla completa se
podía desplazar horizontalmente dentro de su contenedor
(`.mpv-table-wrap { overflow-x: auto }`), sin romper la página, pero sin
ninguna pista visual de que hacía falta deslizar — en la práctica, en
tablet o celular se veían solo 2-3 columnas y el resto (Estado, Acciones)
quedaba fuera de vista.

Se agregó una sola regla nueva en `style.css`
(`@media (max-width: 991.98px)`, el mismo breakpoint que ya usa el
sidebar) que convierte cada fila de `.mpv-table` en una tarjeta: la
primera celda (producto/proveedor/usuario/fecha) hace de título, las
celdas intermedias se listan como pares etiqueta:valor usando un
`data-label` que ahora trae cada `<td>` (agregado en `productos.js`,
`proveedores.js`, `usuarios.js`, `ventas.js` y `pricing-table.js`), y la
última celda (Acciones) queda al final sin etiqueta, alineada a la
derecha — sin tocar el HTML de las tablas ni el layout de escritorio (por
encima de 992px se ve exactamente igual que antes). `punto-venta.html` no
necesitó cambios: ya usaba tarjetas en vez de una tabla desde una fase
anterior.

Verificado con `npx jest` (98/98, sin regresiones — Fase C no tocó
backend) y con Playwright: manifest/service worker registrados,
JSON-LD dinámico con los productos reales, favorito + filtro "solo
favoritos" funcionando, enlace `?producto=ID` abriendo el modal
correcto, y una auditoría de 8 páginas del panel × 2 anchos (375px y
768px) más `tienda.html`/`carrito.html`, confirmando visualmente el
antes/después de las tablas en tarjetas.

## Auditoría de accesibilidad y UX (WCAG 2 A/AA)

Pedido explícito: revisar la UX/UI de **todo** el sistema (no solo la
tienda) para que sea accesible en cualquier dispositivo y no se vea
"feo" en ningún tamaño de pantalla. Se corrió `axe-core` (reglas
`wcag2a` + `wcag2aa` + `best-practice`) contra las 11 páginas del
sistema con Playwright, más una revisión visual manual en 320px (el
celular más angosto de uso común), 1920px (escritorio grande) y
landscape móvil (844×390). Resultado final: **0 violaciones en las 11
páginas**. Lo que se encontró y corrigió:

- **Contraste de color (WCAG 1.4.3, serio)**: `.supplier-badge.optimo`,
  `.alert-price-up`, `.chip-categoria.activo`, `.btn-hero-primary`,
  `.btn-agregar` y el badge del carrito usaban el tono "claro" de la
  paleta (verde/azul/rojo) con texto blanco a tamaños pequeños — entre
  3.13:1 y 3.98:1, todos por debajo del 4.5:1 mínimo. Se cambiaron a los
  tonos oscuros ya existentes en la paleta (`--tienda-verde-oscuro`,
  `--tienda-azul-oscuro`, `#047857`, `#b91c1c`), que sí pasan. Aparte,
  `.pos-product-card.disabled` (producto sin stock en Punto de Venta)
  usaba `opacity: 0.55` sobre **todo** el texto de la tarjeta —incluido
  el mensaje "no se puede vender"—, aplastando el contraste de
  información que el usuario sí necesita leer; se reemplazó por un fondo
  gris con solo el ícono atenuado, dejando el texto a contraste completo.
- **Nombres accesibles (WCAG 4.1.2, crítico)**: 6 `<select>` de filtro
  (`filtroCategoria`, `filtroProveedor`, `filtroRentabilidad`,
  `posMetodoPago`, `filtroMetodoPago`, `filtroEstadoPedido`,
  `ordenSelect`) no tenían nombre accesible para lectores de pantalla —
  se les agregó `aria-label`. El enlace de "ver producto" en la tabla del
  dashboard solo tenía un ícono sin texto — se agregó `aria-label`
  dinámico con el nombre del producto.
- **Labels de formulario (WCAG 1.3.1/4.1.2, crítico)**: 53 pares
  `<label>`/`<input|select|textarea>` en todo el sistema (formularios de
  Productos, Proveedores, Usuarios, Configuración, Login) no estaban
  asociados con `for`/`id` — un script determinista los corrigió todos a
  la vez emparejando cada label con el control inmediatamente siguiente;
  los 2 casos con estructura más compleja (subir logo/imagen de portada,
  con preview + botón de archivo de por medio) se asociaron a mano.
- **Estructura semántica (landmarks, encabezados)**: `login.html` no
  tenía `<main>` ni un `<h1>` real (el nombre de marca era un `<div>`) —
  se corrigió. `tienda.html`/`carrito.html` tenían secciones (`topstrip`,
  hero, franja de confianza, destacados) fuera de cualquier landmark —
  se les dio `role="region"`/`aria-label`/`aria-labelledby` (reutilizando
  los `<h1>`/`<h2>` que ya existían donde se pudo). Los `<h6>` de pie de
  página y de los paneles de "Tienda Virtual" en Configuración saltaban
  niveles de encabezado (h1→h6, h2→h6) — se corrigieron a `h3`
  manteniendo el tamaño visual original vía clases utilitarias
  (`fs-6`), no cambiando el CSS del selector de etiqueta.
- **Operabilidad por teclado (WCAG 2.1.1)**: el rediseño de Fase B
  agregó tarjetas de producto clicables (`.card-producto`) y productos
  relacionados (`.mini-producto`) dentro del modal — ninguno de los dos
  era alcanzable con teclado. El nombre del producto en cada tarjeta pasó
  de `<div>` a `<button>` real (foco + Enter/Espacio nativos, sin JS
  extra); los relacionados del modal son `<div role="button"
  tabindex="0">` con un manejador de `keydown` propio para Enter/Espacio,
  ya que ahí sí hacía falta.
- **Scroll horizontal fantasma en 320px**: el offcanvas del carrito
  (`position: fixed` + `transform` para quedar fuera de pantalla cuando
  está cerrado) hacía que el documento creyera tener ~3px de ancho de
  scroll de más — confirmado que era real y no solo de medición
  (`window.scrollX` cambiaba de 0 a 3 al intentar hacer scroll horizontal
  con la rueda del mouse). Se agregó `overflow-x: hidden` en `html,body`
  de la tienda, patrón estándar para contener elementos transformados
  fuera de pantalla. De paso se encontró y corrigió un bug de flexbox
  clásico en la franja de confianza (`.confianza-item`): el bloque de
  texto, sin `min-width: 0`, no se encogía por debajo del ancho de su
  línea más larga y desbordaba en pantallas angostas.

Verificado con `npx jest` (98/98) y con Playwright: 0 violaciones de
axe-core en las 11 páginas, sin overflow horizontal en 320/375/768/1920px
ni en landscape móvil, y una prueba de navegación por teclado real (Tab
hasta el nombre del producto → Enter → el modal de detalle se abre).

## Fase D — Alertas proactivas, reportes descargables y auditoría

Cierra el roadmap del panel interno: hasta ahora, saber que un producto se
quedó sin stock, que un proveedor subió un precio, o que llegó un pedido
web, dependía de que alguien entrara a revisar cada página por separado.
Y no existía ningún registro de quién había hecho qué cambio en el
sistema. El usuario pidió explícitamente seguir con esta fase pero **no**
avanzar a la Fase E (pasarela de pago real, facturación SUNAT) hasta
tener RUC — por diseño, nada de esta fase toca esa área.

### Bitácora de auditoría (`bitacora`)

Tabla nueva (`database/migrations/006_bitacora.sql`) + servicio
`src/services/bitacora.js` con una función central,
`registrarEvento({ usuarioId, usuarioNombre, accion, entidad, entidadId, detalle })`,
enganchada en los puntos donde el sistema ya modifica algo importante:
login (`auth.controller.js`), crear/actualizar producto y proveedor,
actualizar precio de compra, crear/actualizar usuario y cambiar
contraseña (nunca se registra la contraseña en sí, solo el hecho del
cambio), actualizar márgenes/impuestos y configuración de la tienda,
registrar una venta, y cambiar el estado de un pedido web. Es
**best-effort a propósito**: `registrarEvento` atrapa cualquier error
internamente — la bitácora nunca debe poder tumbar la acción real que la
originó (crear un producto, cobrar una venta, etc.), mismo principio ya
usado para el registro de pedidos web desde la tienda.

Nueva página `public/auditoria.html` (solo admin, `MPVAuth.exigirRol('admin')`
+ `data-rol="admin"` en el link de navegación) con filtros por tipo de
registro, acción y rango de fechas, reutilizando el mismo patrón de tabla
responsive de Fase C — con una diferencia: al no tener columna de
Acciones, la tabla usa la nueva clase `.mpv-table.sin-acciones` para que,
en la vista de tarjetas en móvil, la última celda (Detalle) se vea como
un dato normal en vez de heredar el estilo de fila de botones.

### Centro de alertas (campana en el topbar)

`GET /api/alertas` (`src/services/alertas.js`) agrega tres señales que ya
existían por separado en la base de datos, sin inventar ningún dato
nuevo: productos sin stock, productos por debajo de su `stock_minimo`
(solo si el producto tiene un umbral configurado — si nadie lo puso, no
hay falsos positivos), subidas de precio (reutiliza
`alerta_subida_precio` de `vw_tablero_precios`, el mismo campo que ya
alimentaba la tarjeta KPI del dashboard) y pedidos web pendientes.

La campana (`public/js/alertas-bell.js`) se agregó a las **9** páginas
del panel — incluidas las 4 que no tenían ninguna zona de acciones en su
topbar (Punto de Venta, Márgenes e Impuestos, Ventas, Auditoría), a las
que se les creó una — con un badge de conteo y un panel desplegable
agrupado por tipo de alerta, cada ítem enlazando directo a la página
donde se resuelve (Productos, Gestión de Precios o Ventas). Se refresca
cada 2 minutos para no quedar desactualizada en una sesión larga.

### Reportes descargables de ventas

Se sumaron `GET /api/ventas/exportar/excel`, `GET /api/ventas/exportar/pdf`
y `GET /api/pedidos-web/exportar/excel`, reutilizando exactamente el
mismo patrón ya probado en `export.controller.js` (ExcelJS con
encabezado de marca + tabla con auto-filtro; PDFKit en horizontal con
salto de página automático) — ambos respetan los filtros activos en
pantalla (cliente, fechas, método de pago, estado del pedido) en vez de
exportar siempre todo el historial. Botones "Exportar" agregados a las
dos pestañas de `ventas.html`, con el mismo spinner de "Generando…" que
ya usaba Gestión de Precios mientras se arma el archivo.

### Sobre la tabla `.mpv-table-wrap` (hallazgo de la auditoría de esta fase)

Al escanear `auditoria.html` con `axe-core` apareció una violación real
(`scrollable-region-focusable`, seria) que las páginas anteriores no
habían disparado: cualquier `.mpv-table-wrap` cuyo contenido realmente
desborda (`scrollWidth > clientWidth`) necesita ser alcanzable por
teclado para poder desplazarse, no solo con mouse/touch. No era un
problema nuevo de esta fase — es un defecto compartido por **todas** las
tablas del panel, que simplemente no se había disparado antes porque los
datos de prueba de otras páginas no forzaban el overflow en el ancho de
pantalla usado. Se corrigió de una sola vez agregando
`tabindex="0" role="region" aria-label="..."` a los 8 `.mpv-table-wrap`
del sistema (Dashboard, Gestión de Precios, Productos, Proveedores,
Usuarios, las 2 de Ventas, y Auditoría).

Verificado con `npx jest` (107/107, 9 tests nuevos para `bitacora.js` y
`alertas.js`) y con Playwright: 0 violaciones de axe-core en las 9
páginas del panel tras el cambio, descarga real de los 3 reportes
verificada de punta a punta en el navegador (no solo por `curl`), y
`file` confirmando que los `.xlsx`/`.pdf` generados son archivos válidos.

## Fases F, G y H — Analítica, engagement de tienda y operación

Tres fases implementadas juntas tras la Fase D, en el orden pedido
(G, H, F). Igual que la Fase E, cualquier cosa que dependa de pagos reales
o facturación SUNAT sigue fuera de alcance a propósito.

### Fase G1 — Cupones de descuento internos

Tabla `cupones` (`006_cupones.sql`... `007_cupones.sql`) con tipo
`porcentaje` o `monto_fijo`, expiración, tope de usos y compra mínima
opcionales. `src/services/cupones.js` separa **validar** (calcula el
descuento contra un subtotal, sin efectos secundarios — es lo que llama
el carrito en vivo) de **incrementar el uso** (solo al confirmar el
pedido, en `registrarPedidoWeb`). El código se guarda y compara en
mayúsculas (`UPPER(codigo)`) para que "bienvenido10" y "BIENVENIDO10"
sean el mismo cupón.

En `public/carrito.html` el campo de cupón valida contra
`POST /api/tienda/cupones/validar` y recalcula el total al vuelo; el
código aplicado viaja en el pedido (`cuponCodigo`) y en el mensaje de
WhatsApp. Se gestionan (crear/activar/desactivar) desde el panel nuevo
**Herramientas** (`public/herramientas.html`).

No se usa bloqueo de fila (`SELECT ... FOR UPDATE`) para el contador de
usos, a diferencia del descuento de stock en `registrarVenta` — es una
decisión consciente: dos clientes agotando el último uso de un cupón al
mismo tiempo es un escenario de bajísima probabilidad para un negocio de
este tamaño, y no justifica la complejidad de una transacción extra.

### Fase G2 — Reseñas y calificaciones de producto

Tabla `resenas_producto` (`008_resenas.sql`): cualquier visitante puede
dejar una reseña (`POST /api/tienda/productos/:id/resenas`, sin sesión),
pero queda con `aprobado = FALSE` y no se muestra en la tienda hasta que
un admin la modera desde **Herramientas**. Aprobar hace `UPDATE`;
rechazar hace `DELETE` directo — no existe un estado "rechazada" que
mostrar en ningún lado, así que no tiene sentido conservar la fila.

El modal de detalle de producto (`public/js/tienda.js`) muestra el
promedio, la cantidad de reseñas y la lista, más un formulario para dejar
una nueva. `GET /api/tienda/productos/:id` ahora también devuelve
`resenas`, `calificacionPromedio` y `totalResenas`.

### Fase G3 — Notificaciones push reales

VAPID (`web-push`) con clave pública/privada propias en `.env`
(`.env.example` trae el comando para generar un par nuevo). El cliente se
suscribe a un **pedido específico**, no a una cuenta — no existe sistema
de cuentas de cliente en la tienda — vía el checkbox "Avisarme cuando
confirmen mi pedido" en `carrito.html`, que pide permiso de notificación
y registra la suscripción (`push_subscripciones`, `009_...sql`) recién
después de crear el pedido.

`src/services/push.js` solo notifica en las transiciones a `atendido` o
`cancelado` (nunca en "pendiente"), es best-effort a propósito (nunca
lanza — un error de push jamás debe romper el flujo de atender un
pedido) y borra automáticamente las suscripciones que el navegador del
cliente ya invalidó (HTTP 404/410 al enviar). `public/service-worker.js`
suma los listeners `push` y `notificationclick` que faltaban.

### Fase H1 — Backups de base de datos

`src/services/backups.js` corre `pg_dump` vía `execFile` (nunca `exec`,
para no exponerse a inyección de shell) con las mismas variables de
conexión que `src/config/db.js`, y programa un backup automático diario
además del botón "Generar ahora" en Herramientas. El nombre de archivo
se valida con una expresión regular estricta antes de tocar el
filesystem en la descarga (`GET /api/backups/:nombre/descargar`),
específicamente para bloquear path traversal. `backups/` está en
`.gitignore`: son datos reales de clientes y ventas, nunca se versionan.

### Fase H2 — Modo oscuro

Como todo el sistema de diseño ya vivía en variables CSS
(`--mpv-*`/`--tienda-*`), activar `[data-theme="dark"]` en `<html>`
redefine la paleta completa sin tocar un solo componente. Dos matices que
sí hicieron falta:

- Separar los tokens que son **texto sobre fondo claro** (badges de
  margen, íconos de alerta) de los que son **estructurales/decorativos**
  (gradiente del sidebar) cuando compartían la misma variable — se
  crearon tokens dedicados (`--mpv-blue-text`, `--mpv-emerald-text`, etc.)
  para que redefinir uno no rompiera el otro.
- Las bandas "siempre oscuras" de la tienda (topstrip, confianza, footer,
  toast) usaban `--tienda-ink`, que en modo oscuro pasa a ser un color
  claro (es el texto normal del cuerpo) — se creó `--tienda-banda-oscura`,
  fija en ambos temas, para que esas bandas no se aclararan.

Bootstrap 5.3 trae soporte nativo de `data-bs-theme="dark"`, así que
formularios, modales y dropdowns se re-temizan solos. El botón de
alternar (`public/js/theme.js`) persiste la preferencia en
`localStorage` y se aplica antes del primer pintado (script inline en
`<head>`) para evitar el parpadeo de tema claro→oscuro.

### Fase H3 — Onboarding guiado

`public/js/onboarding.js`: un recorrido de 4 pasos (Dashboard, Punto de
Venta, Productos, campana de alertas) que resalta cada elemento real de
la interfaz — sin librería externa — la primera vez que alguien entra al
Dashboard. Se puede saltar en cualquier momento; una bandera en
`localStorage` evita que vuelva a aparecer.

### Fase F1 — Tendencia de ventas

`obtenerTendenciaVentas()` usa `generate_series` para construir una serie
continua día por día de los últimos 30 días (por defecto), rellenando con
S/ 0.00 los días sin ventas — así el gráfico de línea del Dashboard
(Chart.js) no muestra huecos. Las fechas se serializan como `YYYY-MM-DD`
desde el backend (no como ISO completo con hora/zona) para que el
frontend no tenga que lidiar con desfases de huso horario al reconstruir
el objeto `Date`.

### Fase F2 — Historial de movimientos de stock

Tabla `movimientos_stock` (`010_movimientos_stock.sql`): cada venta
inserta automáticamente una fila (`tipo='venta'`, delta negativo) dentro
de la misma transacción que descuenta el stock en `registrarVenta`, así
el movimiento y el cambio real nunca pueden desincronizarse. Se sumó un
ajuste manual (`tipo='ajuste_manual'`, delta positivo o negativo, con
motivo obligatorio) para conteos físicos, mermas o correcciones de
error, con el mismo patrón de `SELECT ... FOR UPDATE` que ya usaba
`registrarVenta`. El botón "Movimientos de stock" en el modal de editar
producto (`productos.html`) muestra el historial completo y el
formulario de ajuste.

### Fase F3 — Alertas de reabastecimiento por velocidad de venta

Extensión de `src/services/alertas.js`: calcula la velocidad de venta
diaria de cada producto (unidades vendidas / 30 días) y avisa cuando, al
ritmo actual, el stock se agotaría en 7 días o menos — antes de que
llegue a "stock bajo" por umbral fijo. Se excluyen a propósito los
productos que ya disparan la alerta de stock bajo/agotado, para no
duplicar el mismo aviso con otro ícono.

### Fase F4 — Fecha de vencimiento por producto

Columna `fecha_vencimiento` (`011_productos_vencimiento.sql`), un único
campo por producto en vez de lotes múltiples con FEFO (first-expire-
first-out): manejar varios lotes con vencimientos distintos del mismo
producto exigiría rediseñar cómo `registrarVenta` descuenta stock (hoy es
un solo entero por producto), un cambio mucho más grande y riesgoso que
lo que un negocio pequeño necesita en una primera versión. La campana de
alertas avisa cuando un producto vence en 30 días o menos.

Verificado con `npx jest` (135/135) y con Playwright de punta a punta:
alta de cupón → aplicarlo en el carrito con descuento visible → cupón
inválido rechazado; reseña enviada desde la tienda → aprobada desde
Herramientas → visible en el modal de detalle; backup generado y
descargado; modo oscuro en las 11 páginas (incluyendo el panel nuevo);
gráfico de tendencia con fechas correctas. Auditoría de accesibilidad con
`axe-core` sobre las páginas y modales nuevos: sin violaciones de
`wcag2a`/`wcag2aa`, salvo un `heading-order` moderado preexistente
(los títulos de modal usan `<h5>` en todo el panel, incluso después de un
`<h2>` de sección) que ya afectaba a los modales anteriores a esta fase y
queda fuera de alcance por implicar renumerar encabezados en todo el
sistema de diseño.

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
- `public/ventas.html` — historial de ventas de mostrador y pedidos de la
  tienda virtual, en dos pestañas (ver sección "Fase A" más arriba).
  Disponible para `admin` y `operador`.
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
- `bitacora.test.js`, `alertas.test.js` — que el registro de auditoría
  nunca lance (best-effort) y que las alertas de stock, precio,
  reabastecimiento y vencimiento se agreguen y cuenten bien.
- `ventas.test.js` — venta con motor de precios, descuento de stock
  transaccional (con `movimientos_stock` en la misma transacción) y la
  serie diaria de `obtenerTendenciaVentas`.
- `movimientosStock.test.js` — ajuste manual de stock: rechaza delta 0,
  rechaza sin motivo, hace `ROLLBACK` si el ajuste deja stock negativo.

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

Fases A, B, C, D, F, G y H ya implementadas (ver secciones arriba).
Pendiente, sin empezar por decisión explícita del negocio:

- **Fase E** — pasarela de pago real, facturación electrónica SUNAT,
  cuentas de cliente, multi-sucursal. Bloqueada a propósito: el negocio
  todavía no tiene RUC ni está registrado ante SUNAT, así que cualquier
  intento de facturación real o pasarela de pago sería prematuro. Se
  retoma cuando el negocio complete ese registro.
