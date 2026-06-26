// --- CONFIGURACIÓN API ---
const API_BASE_URL = 'https://dsc-vh8j.onrender.com';
const SCRAPE_URL   = `${API_BASE_URL}/scrape`;
const PLAYERS_URL  = `${API_BASE_URL}/players`;
const UPDATE_URL   = `${API_BASE_URL}/update_player`;
const SEASONS_URL  = `${API_BASE_URL}/seasons`;

// --- CONFIGURACIÓN AUTOMÁTICA ---
const AUTO_EMAIL    = 'invitado@dsc.com';
const AUTO_PASSWORD = 'invitado123';
const AUTO_SEASON   = '2026';

// --- CONFIGURACIÓN EMAIL (EmailJS) ---
// Solo se usa en modo MANUAL (cuando un usuario abre la página en el navegador).
// En modo AUTO (Playwright / GitHub Actions) los emails los manda run-fichas.js.
const REPORT_EMAIL        = 'mariodelossantos@vera.com.uy';
const EMAILJS_SERVICE_ID  = 'service_qjddhx4';
const EMAILJS_TEMPLATE_ID = 'template_axit2q8';
const EMAILJS_PUBLIC_KEY  = 'lIXXcoHQrjha0lSiL';

// --- DETECCIÓN DE MODO AUTOMÁTICO ---
// El orquestador (run-fichas.js) agrega ?auto=1 a la URL al abrir la página.
// Esto evita que se envíen emails duplicados desde el browser cuando ya los
// está enviando el script de Node.js via Nodemailer.
const IS_AUTO_MODE = new URLSearchParams(window.location.search).get('auto') === '1';

// --- FIREBASE ---
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const auth = firebase.auth();

// --- LOG SIMPLIFICADO ---
function log(msg) {
    const t = new Date().toLocaleTimeString();
    console.log(`[${t}] ${msg}`);
    // Escribir en el body para que Playwright pueda leer el DOM
    const prev = document.getElementById('log-display')
        ? document.getElementById('log-display').innerText
        : '';
    document.body.innerHTML = `<pre id="log-display">${prev}\n[${t}] ${msg}</pre>`;
}

// --- FLUJO PRINCIPAL ---
auth.onAuthStateChanged(async user => {
    if (user) {
        log('Sesión iniciada. Comenzando proceso...');
        try {
            await runProcess();
        } catch (err) {
            log(`[ERROR] Error crítico en el proceso: ${err.message}`);
            // En modo manual, notificar al usuario por email
            if (!IS_AUTO_MODE) {
                await notificarEmail(`❌ Error crítico en el proceso: ${err.message}`);
            }
        }
    } else {
        log('Iniciando login automático...');
        try {
            await auth.signInWithEmailAndPassword(AUTO_EMAIL, AUTO_PASSWORD);
        } catch (err) {
            log(`[ERROR] Error de login: ${err.message}`);
        }
    }
});

async function runProcess() {
    // 0. NOTIFICACIÓN INICIO (solo en modo manual — en auto lo hace run-fichas.js)
    if (!IS_AUTO_MODE) {
        const inicioMsg =
            `🚀 Actualización de Fichas Médicas Iniciada\n` +
            `📅 Temporada: ${AUTO_SEASON}\n` +
            `⏰ Hora: ${new Date().toLocaleTimeString('es-UY', { timeZone: 'America/Montevideo' })}\n` +
            `⏳ Iniciando escaneo y procesamiento...`;
        await notificarEmail(inicioMsg);
    }

    // 1. CARGAR TEMPORADAS
    log('Cargando temporadas...');
    const resSeasons = await fetch(SEASONS_URL);
    const seasons    = await resSeasons.json();
    if (!seasons.includes(AUTO_SEASON)) {
        throw new Error(`Temporada ${AUTO_SEASON} no encontrada.`);
    }

    // 2. ESCANEAR JUGADORES
    log(`Escaneando jugadores de la temporada ${AUTO_SEASON}...`);
    const resPlayers = await fetch(`${PLAYERS_URL}?season=${AUTO_SEASON}`);
    const data       = await resPlayers.json();

    const playersToScrape = [];
    const DAYS_THRESHOLD  = 60;
    const now             = new Date();
    const thresholdDate   = new Date();
    thresholdDate.setDate(now.getDate() + DAYS_THRESHOLD);

    Object.keys(data).forEach(dni => {
        const p = data[dni];
        if (p.datosPersonales) {
            const fmHastaStr  = p.datosPersonales['FM Hasta'];
            const expireDate  = parseDate(fmHastaStr);
            if (!fmHastaStr || (expireDate && expireDate < thresholdDate)) {
                playersToScrape.push({
                    dni,
                    nombre: p.datosPersonales['NOMBRE'] || dni,
                    vencimiento: fmHastaStr
                });
            }
        }
    });

    log(`Encontrados ${playersToScrape.length} jugadores para procesar.`);
    if (playersToScrape.length === 0) {
        log('[FINISH] No hay jugadores para actualizar. Actualizados: 0 / Procesados: 0');
        return;
    }

    // 3. PHASE: SCRAPPING (SIN GUARDAR TODAVÍA)
    const resultsToUpdate = [];
    let processed = 0;

    for (const player of playersToScrape) {
        processed++;
        log(`Scrapping (${processed}/${playersToScrape.length}): ${player.nombre}...`);
        try {
            const resp   = await fetch(SCRAPE_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ dni: player.dni })
            });
            const result = await resp.json();

            const newHastaDate = parseDate(result.hasta);
            const oldHastaDate = parseDate(player.vencimiento);

            // Solo se considera actualizado si la nueva fecha es superior a la existente
            if (result.success && newHastaDate && (!oldHastaDate || newHastaDate > oldHastaDate)) {
                resultsToUpdate.push({
                    dni:    player.dni,
                    nombre: player.nombre,
                    desde:  result.desde,
                    hasta:  result.hasta
                });
                log(`   -> Nueva fecha encontrada: ${result.hasta} (Superior a la actual: ${player.vencimiento || 'N/A'})`);
            } else {
                log(`   -> Sin cambios relevantes (Nueva: ${result.hasta || 'N/A'}, Actual: ${player.vencimiento || 'N/A'})`);
            }
        } catch (e) {
            log(`   -> Error scrapping ${player.nombre}: ${e.message}`);
        }
    }

    // 4. PHASE: SAVE (ACTUALIZAR FIREBASE AL FINAL)
    log(`\nFase de guardado: Actualizando ${resultsToUpdate.length} jugadores en Firebase...`);
    for (const res of resultsToUpdate) {
        log(`Actualizando ${res.nombre}...`);
        try {
            await fetch(UPDATE_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ dni: res.dni, desde: res.desde, hasta: res.hasta })
            });
        } catch (e) {
            log(`   -> Error guardando ${res.nombre}: ${e.message}`);
        }
    }

    // 5. RESUMEN FINAL
    let resumen  = `✅ Fichas Médicas Finalizado\n`;
    resumen     += `📅 Temporada: ${AUTO_SEASON}\n`;
    resumen     += `📝 Procesados: ${playersToScrape.length}\n`;
    resumen     += `✨ Actualizados: ${resultsToUpdate.length}\n`;

    if (resultsToUpdate.length > 0) {
        resumen += `\n👥 Jugadores Actualizados:\n`;
        resultsToUpdate.forEach(r => {
            resumen += `• ${r.nombre} → FM Hasta: ${r.hasta}\n`;
        });
    }

    // Notificar por email solo en modo manual
    if (!IS_AUTO_MODE) {
        await notificarEmail(resumen);
    }

    // Marca final que detecta run-fichas.js para saber que el proceso terminó
    log(`[FINISH] Proceso completado. Actualizados: ${resultsToUpdate.length} / Procesados: ${playersToScrape.length}`);
}

// --- UTILIDADES ---

// notificarEmail: solo activa en modo MANUAL (usuario abre la página en el browser)
async function notificarEmail(mensaje) {
    if (IS_AUTO_MODE) return; // En modo automático, los emails los manda run-fichas.js

    try {
        log('Intentando enviar email mediante EmailJS...');
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                service_id:  EMAILJS_SERVICE_ID,
                template_id: EMAILJS_TEMPLATE_ID,
                user_id:     EMAILJS_PUBLIC_KEY,
                template_params: {
                    mensaje:      mensaje,
                    destinatario: REPORT_EMAIL
                }
            })
        });

        if (response.ok) {
            log('Email enviado correctamente con EmailJS');
        } else {
            const errorText = await response.text();
            log(`Error de EmailJS: ${errorText}`);
        }
    } catch (e) {
        console.error('Error enviando email:', e);
        log(`Error enviando email: ${e.message}`);
    }
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}