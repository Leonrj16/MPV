require('dotenv').config();
const express = require('express');
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

const app = express();
const PORT = process.env.PORT || 3000;

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

app.get('/health', (req, res) => res.json({ ok: true, service: 'mpv-dental-api' }));

app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
    console.log(`MPV Dental API escuchando en http://localhost:${PORT}`);
});
