const { generarBackup, listarBackups, rutaBackup } = require('../services/backups');
const { registrarEvento } = require('../services/bitacora');

async function listar(req, res) {
    try {
        res.json({ ok: true, data: listarBackups() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}

async function generar(req, res) {
    try {
        const { archivo } = await generarBackup();
        await registrarEvento({
            usuarioId: req.user?.sub,
            usuarioNombre: req.user?.nombre,
            accion: 'crear',
            entidad: 'backup',
            detalle: `Generó un backup manual de la base de datos (${archivo})`,
        });
        res.status(201).json({ ok: true, data: { archivo } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: 'No se pudo generar el backup: ' + err.message });
    }
}

function descargar(req, res) {
    const ruta = rutaBackup(req.params.nombre);
    if (!ruta) return res.status(404).json({ ok: false, error: 'Backup no encontrado' });
    res.download(ruta);
}

module.exports = { listar, generar, descargar };
