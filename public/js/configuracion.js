MPVAuth.exigirRol('admin');

(function () {
    const form = document.getElementById('formConfig');
    const inputs = {
        margen: document.getElementById('margenDefecto'),
        costoOperativo: document.getElementById('costoOperativo'),
        unidades: document.getElementById('unidadesEstimadas'),
        impuesto: document.getElementById('impuesto'),
        precioEjemplo: document.getElementById('precioEjemplo'),
    };

    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('mpvSidebar').classList.toggle('show');
    });

    // Mismo cálculo que src/services/pricingEngine.js, para previsualizar en vivo sin ir al servidor.
    function calcularPreview() {
        const precioCompra = Number(inputs.precioEjemplo.value) || 0;
        const margenPct = Number(inputs.margen.value) || 0;
        const impuestoPct = Number(inputs.impuesto.value) || 0;
        const costoOperativo = Number(inputs.costoOperativo.value) || 0;
        const unidades = Number(inputs.unidades.value) || 1;

        const costoLogistico = unidades > 0 ? costoOperativo / unidades : 0;
        const costoTotal = precioCompra + costoLogistico;
        const subtotal = margenPct < 100 ? costoTotal / (1 - margenPct / 100) : costoTotal;
        const montoImpuesto = subtotal * (impuestoPct / 100);
        const pvp = subtotal + montoImpuesto;

        document.getElementById('previewLogistico').textContent = MPV.formatCurrency(costoLogistico);
        document.getElementById('previewCostoTotal').textContent = MPV.formatCurrency(costoTotal);
        document.getElementById('previewSubtotal').textContent = MPV.formatCurrency(subtotal);
        document.getElementById('previewImpuesto').textContent = MPV.formatCurrency(montoImpuesto);
        document.getElementById('previewPvp').textContent = MPV.formatCurrency(pvp);
    }

    Object.values(inputs).forEach((el) => el.addEventListener('input', calcularPreview));

    async function cargar() {
        try {
            const { data } = await MPV.getConfiguracion();
            inputs.margen.value = data.margen_utilidad_defecto_pct;
            inputs.costoOperativo.value = data.costo_operativo_mensual;
            inputs.unidades.value = data.unidades_estimadas_mensual;
            inputs.impuesto.value = data.porcentaje_impuesto;
            calcularPreview();
        } catch (err) {
            document.getElementById('configError').textContent = err.message;
            document.getElementById('configError').classList.remove('d-none');
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorBox = document.getElementById('configError');
        const exitoBox = document.getElementById('configExito');
        const btn = document.getElementById('btnGuardarConfig');
        errorBox.classList.add('d-none');
        exitoBox.classList.add('d-none');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando…';

        try {
            await MPV.actualizarConfiguracion({
                margenUtilidadDefectoPct: Number(inputs.margen.value),
                costoOperativoMensual: Number(inputs.costoOperativo.value),
                unidadesEstimadasMensual: Number(inputs.unidades.value),
                porcentajeImpuesto: Number(inputs.impuesto.value),
            });
            exitoBox.classList.remove('d-none');
            setTimeout(() => exitoBox.classList.add('d-none'), 3000);
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.classList.remove('d-none');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-lg me-1"></i> Guardar Cambios';
        }
    });

    cargar();

    // -------- Configuración de la Tienda Virtual (marca, imágenes, textos) --------
    const formTienda = document.getElementById('formTienda');
    const tiendaInputs = {
        nombreNegocio: document.getElementById('tiendaNombre'),
        eslogan: document.getElementById('tiendaEslogan'),
        logoUrl: document.getElementById('tiendaLogoUrl'),
        heroTitulo: document.getElementById('tiendaHeroTitulo'),
        heroDescripcion: document.getElementById('tiendaHeroDescripcion'),
        heroImagenUrl: document.getElementById('tiendaHeroImagenUrl'),
        telefono: document.getElementById('tiendaTelefono'),
        whatsappNumero: document.getElementById('tiendaWhatsapp'),
        direccion: document.getElementById('tiendaDireccion'),
        horarioAtencion: document.getElementById('tiendaHorario'),
        emailContacto: document.getElementById('tiendaEmail'),
        facebookUrl: document.getElementById('tiendaFacebook'),
        instagramUrl: document.getElementById('tiendaInstagram'),
    };

    function actualizarPreview(imgEl, url) {
        if (url) {
            imgEl.src = url;
            imgEl.classList.remove('d-none');
        } else {
            imgEl.classList.add('d-none');
            imgEl.removeAttribute('src');
        }
    }

    const previewLogo = document.getElementById('previewLogo');
    const previewHeroImagen = document.getElementById('previewHeroImagen');

    async function cargarTienda() {
        try {
            const { data } = await MPV.getConfiguracionTienda();
            Object.entries(tiendaInputs).forEach(([campo, el]) => {
                el.value = data[campo] || '';
            });
            actualizarPreview(previewLogo, data.logoUrl);
            actualizarPreview(previewHeroImagen, data.heroImagenUrl);
        } catch (err) {
            document.getElementById('tiendaConfigError').textContent = err.message;
            document.getElementById('tiendaConfigError').classList.remove('d-none');
        }
    }

    // Subir archivo: reemplaza el valor del campo de URL con la ruta que
    // devuelve el servidor (/uploads/<archivo>), sin que el admin tenga que
    // hostear la imagen en otro sitio y pegar el link a mano.
    function conectarSubidaArchivo({ botonId, inputArchivoId, campoUrl, previewEl, errorBoxId }) {
        const boton = document.getElementById(botonId);
        const inputArchivo = document.getElementById(inputArchivoId);
        const errorBox = document.getElementById(errorBoxId);

        boton.addEventListener('click', () => inputArchivo.click());

        inputArchivo.addEventListener('change', async (e) => {
            const archivo = e.target.files[0];
            if (!archivo) return;
            errorBox.classList.add('d-none');
            boton.disabled = true;
            boton.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

            try {
                const url = await MPV.subirImagen(archivo);
                campoUrl.value = url;
                actualizarPreview(previewEl, url);
            } catch (err) {
                errorBox.textContent = err.message;
                errorBox.classList.remove('d-none');
            } finally {
                boton.disabled = false;
                boton.innerHTML = '<i class="bi bi-upload"></i>';
                inputArchivo.value = ''; // permite volver a elegir el mismo archivo
            }
        });
    }

    conectarSubidaArchivo({
        botonId: 'btnSubirLogo',
        inputArchivoId: 'inputLogoArchivo',
        campoUrl: tiendaInputs.logoUrl,
        previewEl: previewLogo,
        errorBoxId: 'logoUploadError',
    });
    conectarSubidaArchivo({
        botonId: 'btnSubirHeroImagen',
        inputArchivoId: 'inputHeroImagenArchivo',
        campoUrl: tiendaInputs.heroImagenUrl,
        previewEl: previewHeroImagen,
        errorBoxId: 'heroImagenUploadError',
    });

    formTienda.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorBox = document.getElementById('tiendaConfigError');
        const exitoBox = document.getElementById('tiendaConfigExito');
        const btn = document.getElementById('btnGuardarTienda');
        errorBox.classList.add('d-none');
        exitoBox.classList.add('d-none');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando…';

        try {
            const payload = {};
            Object.entries(tiendaInputs).forEach(([campo, el]) => {
                payload[campo] = el.value.trim();
            });
            const { data } = await MPV.actualizarConfiguracionTienda(payload);
            Object.entries(tiendaInputs).forEach(([campo, el]) => {
                el.value = data[campo] || '';
            });
            actualizarPreview(previewLogo, data.logoUrl);
            actualizarPreview(previewHeroImagen, data.heroImagenUrl);
            exitoBox.classList.remove('d-none');
            setTimeout(() => exitoBox.classList.add('d-none'), 3000);
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.classList.remove('d-none');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-lg me-1"></i> Guardar Cambios';
        }
    });

    cargarTienda();
})();
