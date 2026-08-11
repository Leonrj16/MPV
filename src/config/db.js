const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'mpv_dental',
    max: Number(process.env.DB_POOL_MAX) || 10,
    idleTimeoutMillis: 30000,
    // Sin esto, una base de datos caída o inalcanzable deja las requests
    // colgadas indefinidamente esperando una conexión en vez de fallar
    // rápido con un error claro.
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 5000,
    // Corta del lado del servidor cualquier query que se cuelgue más de
    // este tiempo (ej. un bloqueo inesperado) — ninguna consulta legítima
    // de esta app debería acercarse a este límite.
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 15000,
});

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = pool;
