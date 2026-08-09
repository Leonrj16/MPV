/**
 * multer ya dejó el archivo guardado en public/uploads/<nombre-random> antes
 * de llegar aquí (ver src/routes/uploads.routes.js); esto solo devuelve la
 * URL pública para que el frontend la guarde en configuracion_tienda
 * (logo_url / hero_imagen_url).
 */
function subirImagen(req, res) {
    if (!req.file) {
        return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo' });
    }
    res.status(201).json({ ok: true, data: { url: `/uploads/${req.file.filename}` } });
}

module.exports = { subirImagen };
