const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKUPS_DIR = path.join(__dirname, '..', '..', 'backups');
const MAX_BACKUPS = 14;
const PATRON_NOMBRE = /^mpv-dental-backup-[\w.-]+\.sql$/;

if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

function nombreArchivo() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `mpv-dental-backup-${stamp}.sql`;
}

function limpiarBackupsAntiguos() {
    const archivos = fs.readdirSync(BACKUPS_DIR)
        .filter((f) => PATRON_NOMBRE.test(f))
        .map((f) => ({ nombre: f, mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
    archivos.slice(MAX_BACKUPS).forEach((f) => {
        try { fs.unlinkSync(path.join(BACKUPS_DIR, f.nombre)); } catch { /* ya no existe, ignorar */ }
    });
}

/**
 * Corre `pg_dump` contra la misma base que usa la app (mismas variables de
 * entorno que src/config/db.js) y guarda el resultado como SQL plano en
 * disco. Después de cada backup se podan los más viejos para no llenar el
 * disco indefinidamente.
 */
function generarBackup() {
    return new Promise((resolve, reject) => {
        const archivo = nombreArchivo();
        const ruta = path.join(BACKUPS_DIR, archivo);
        const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || 'postgres' };
        const args = [
            '-h', process.env.DB_HOST || 'localhost',
            '-p', String(process.env.DB_PORT || 5432),
            '-U', process.env.DB_USER || 'postgres',
            '-d', process.env.DB_NAME || 'mpv_dental',
            '-F', 'p',
            '-f', ruta,
        ];
        execFile('pg_dump', args, { env }, (err) => {
            if (err) return reject(new Error(`pg_dump falló: ${err.message}`));
            limpiarBackupsAntiguos();
            resolve({ archivo, ruta });
        });
    });
}

function listarBackups() {
    if (!fs.existsSync(BACKUPS_DIR)) return [];
    return fs.readdirSync(BACKUPS_DIR)
        .filter((f) => PATRON_NOMBRE.test(f))
        .map((f) => {
            const stat = fs.statSync(path.join(BACKUPS_DIR, f));
            return { nombre: f, tamanoBytes: stat.size, fecha: stat.mtime };
        })
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

/** Solo acepta nombres con el patrón que nosotros generamos — evita path traversal. */
function rutaBackup(nombre) {
    if (!PATRON_NOMBRE.test(nombre)) return null;
    const ruta = path.join(BACKUPS_DIR, nombre);
    return fs.existsSync(ruta) ? ruta : null;
}

let intervaloIniciado = false;
function iniciarBackupsProgramados() {
    if (intervaloIniciado) return;
    intervaloIniciado = true;
    const UN_DIA_MS = 24 * 60 * 60 * 1000;
    setInterval(() => {
        generarBackup().catch((err) => console.error('Backup automático falló:', err.message));
    }, UN_DIA_MS);
}

module.exports = { generarBackup, listarBackups, rutaBackup, iniciarBackupsProgramados, BACKUPS_DIR };
