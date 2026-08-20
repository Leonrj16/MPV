require('dotenv').config();

// Sin esta variable, auth.middleware.js firma y verifica tokens con un
// secreto de desarrollo hardcodeado y público en el repositorio — cualquiera
// podría forjar un token con rol "admin". Se corta el arranque en vez de
// dejar que el servidor sirva tráfico con esa falla.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('JWT_SECRET no está configurado. Es obligatorio en producción (NODE_ENV=production) — el servidor no va a arrancar sin él.');
    process.exit(1);
}

const express = require('express');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const productosRoutes = require('./routes/productos.routes');
const proveedoresRoutes = require('./routes/proveedores.routes');
const preciosRoutes = require('./routes/precios.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const configuracionRoutes = require('./routes/configuracion.routes');
const tiendaRoutes = require('./routes/tienda.routes');
const ventasRoutes = require('./routes/ventas.routes');
const uploadsRoutes = require('./routes/uploads.routes');
const pedidosWebRoutes = require('./routes/pedidosWeb.routes');
const bitacoraRoutes = require('./routes/bitacora.routes');
const alertasRoutes = require('./routes/alertas.routes');
const cuponesRoutes = require('./routes/cupones.routes');
const resenasRoutes = require('./routes/resenas.routes');
const pushRoutes = require('./routes/push.routes');
const backupsRoutes = require('./routes/backups.routes');
const movimientosStockRoutes = require('./routes/movimientosStock.routes');
const catalogoPdfRoutes = require('./routes/catalogoPdf.routes');
const cajaRoutes = require('./routes/caja.routes');
const reportesRoutes = require('./routes/reportes.routes');
const ordenesCompraRoutes = require('./routes/ordenesCompra.routes');
const { iniciarBackupsProgramados } = require('./services/backups');

const app = express();
const PORT = process.env.PORT || 3000;

// Solo se activa detrás de un reverse proxy real (nginx en producción, ver
// deploy/nginx.conf.example) — ahí Express necesita confiar en el header
// X-Forwarded-For para que express-rate-limit identifique al cliente real
// y no a nginx. Confiar en ese header SIN un proxy real por delante dejaría
// que cualquiera lo falsifique para saltarse el límite de peticiones, por
// eso queda apagado por defecto y se enciende explícitamente con la
// variable de entorno TRUST_PROXY=1.
if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
}

// La Content-Security-Policy por defecto de helmet bloquearía los scripts
// inline que ya usa el frontend (pre-pintado del tema en <head>, JSON-LD de
// la tienda) — activarla exigiría migrarlos todos a nonces, un cambio más
// grande que el de esta fase. Se deja desactivada y se conservan el resto
// de cabeceras de helmet (X-Content-Type-Options, X-Frame-Options, HSTS,
// Referrer-Policy, etc.), que sí son gratis y no rompen nada.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', authRoutes);
app.use('/api', productosRoutes);
app.use('/api', proveedoresRoutes);
app.use('/api', preciosRoutes);
app.use('/api', usuariosRoutes);
app.use('/api', configuracionRoutes);
app.use('/api', tiendaRoutes);
app.use('/api', ventasRoutes);
app.use('/api', uploadsRoutes);
app.use('/api', pedidosWebRoutes);
app.use('/api', bitacoraRoutes);
app.use('/api', alertasRoutes);
app.use('/api', cuponesRoutes);
app.use('/api', resenasRoutes);
app.use('/api', pushRoutes);
app.use('/api', backupsRoutes);
app.use('/api', movimientosStockRoutes);
app.use('/api', catalogoPdfRoutes);
app.use('/api', cajaRoutes);
app.use('/api', reportesRoutes);
app.use('/api', ordenesCompraRoutes);

app.get('/health', (req, res) => res.json({ ok: true, service: 'mpv-dental-api' }));

app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

// Red de seguridad final: sin esto, un error que no pasa por el try/catch de
// ningún controller (el caso típico es un body JSON malformado, que
// express.json() rechaza ANTES de llegar a cualquier controller) cae en la
// página de error HTML por defecto de Express — rompiendo el contrato de
// que /api siempre responde JSON. No reemplaza los try/catch de cada
// controller (esos siguen siendo lo que da el mensaje de error específico),
// es lo que atrapa lo que se escapa de esa capa.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    console.error(err);
    res.status(err.status || err.statusCode || 500).json({ ok: false, error: err.message || 'Error interno del servidor' });
});

// Un error async que ningún try/catch atrapó (o una excepción síncrona fuera
// de cualquier request) deja al proceso en un estado indefinido — se loguea
// con contexto y se corta el proceso en vez de seguir sirviendo tráfico con
// estado corrupto. En producción (ver README, systemd) el proceso se
// reinicia solo.
process.on('unhandledRejection', (reason) => {
    console.error('Promesa rechazada sin manejar:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Excepción no capturada:', err);
    process.exit(1);
});

// require.main === module es falso cuando este archivo se importa (como
// hacen los tests con supertest, para hacer requests contra `app` sin abrir
// un puerto real) — así el mismo archivo sirve de entrypoint real
// (`node src/server.js`) y de módulo testeable sin duplicar la app.
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`MPV Dental API escuchando en http://localhost:${PORT}`);
        iniciarBackupsProgramados();
    });
}

module.exports = app;
