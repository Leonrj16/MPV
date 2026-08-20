/**
 * Credenciales de la cuenta de demostración que crea database/migrations/002_auth_historial.sql.
 * Si se cambiaron en el entorno donde corre la suite, sobreescribir vía
 * E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@mpvdental.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Admin123!';

module.exports = { ADMIN_EMAIL, ADMIN_PASSWORD };
