require('dotenv').config();
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

app.get('/health', (req, res) => res.json({ ok: true, service: 'mpv-dental-api' }));

app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
    console.log(`MPV Dental API escuchando en http://localhost:${PORT}`);
    iniciarBackupsProgramados();
});
