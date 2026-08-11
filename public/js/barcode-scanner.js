/**
 * Escaneo de códigos de barras por cámara, usando la API nativa del
 * navegador (BarcodeDetector) en vez de una librería de terceros — evita
 * sumar una dependencia solo para esto y degrada con un aviso claro en
 * navegadores que no la soportan (ej. Safari/Firefox de escritorio).
 *
 * El escaneo por scanner físico USB/Bluetooth NO pasa por este módulo:
 * esos dispositivos emulan un teclado y "tipean" el código donde esté el
 * foco, así que no necesitan integración de software aparte de un input.
 */
window.BarcodeScanner = (function () {
    let modalEl, modal, videoEl, statusEl, stream, detector, rafId, onDetectadoCb;

    function soportado() {
        return 'BarcodeDetector' in window;
    }

    function construirModal() {
        if (modalEl) return;
        modalEl = document.createElement('div');
        modalEl.className = 'modal fade';
        modalEl.id = 'modalEscanerCodigoBarras';
        modalEl.tabIndex = -1;
        modalEl.setAttribute('aria-labelledby', 'modalEscanerCodigoBarrasTitulo');
        modalEl.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="border-radius: var(--mpv-radius, 12px); border:none;">
                    <div class="modal-header border-0 pb-0">
                        <h5 class="modal-title fw-bold" id="modalEscanerCodigoBarrasTitulo">Escanear código de barras</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                    </div>
                    <div class="modal-body text-center">
                        <video id="scannerVideo" style="width:100%; border-radius:8px; background:#000;" playsinline muted></video>
                        <div class="small text-muted mt-2" id="scannerEstado">Apunta la cámara al código de barras…</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
        videoEl = modalEl.querySelector('#scannerVideo');
        statusEl = modalEl.querySelector('#scannerEstado');
        modal = new bootstrap.Modal(modalEl);
        modalEl.addEventListener('hidden.bs.modal', detener);
    }

    function detener() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
        }
    }

    async function detectarLoop() {
        if (!stream) return;
        try {
            const codigos = await detector.detect(videoEl);
            if (codigos.length > 0) {
                const valor = codigos[0].rawValue;
                detener();
                modal.hide();
                onDetectadoCb?.(valor);
                return;
            }
        } catch (err) {
            // Frame no decodificable (foco, movimiento): se reintenta en el siguiente.
        }
        rafId = requestAnimationFrame(detectarLoop);
    }

    async function abrir({ onDetectado }) {
        if (!soportado()) {
            alert('Este navegador no soporta escaneo por cámara. Usá un escáner físico o ingresá el código manualmente.');
            return;
        }
        construirModal();
        onDetectadoCb = onDetectado;
        statusEl.textContent = 'Apunta la cámara al código de barras…';
        modal.show();
        try {
            detector = detector || new BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
            });
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            videoEl.srcObject = stream;
            await videoEl.play();
            rafId = requestAnimationFrame(detectarLoop);
        } catch (err) {
            statusEl.textContent = 'No se pudo acceder a la cámara: ' + err.message;
        }
    }

    return { disponible: soportado, abrir };
})();
