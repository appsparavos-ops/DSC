// --- CONFIGURACIÓN API ---
const API_BASE_URL = 'https://dsc-vh8j.onrender.com';
const SCRAPE_URL = `${API_BASE_URL}/scrape`;
const PLAYERS_URL = `${API_BASE_URL}/players`;
const UPDATE_URL = `${API_BASE_URL}/update_player`;
const SEASONS_URL = `${API_BASE_URL}/seasons`;

// --- CONFIGURACIÓN AUTOMÁTICA ---
const AUTO_EMAIL = 'invitado@dsc.com';
const AUTO_PASSWORD = 'invitado123';
const AUTO_SEASON = '2026';

// --- CONFIGURACIÓN TELEGRAM ---
const TG_TOKEN = '8672587823:AAFJllG1YID-FmGaEmPEqgmKtAdAnqxY80I';
const TG_CHAT_ID = '1837798371';

// --- FIREBASE ---
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const auth = firebase.auth();

// --- LOG SIMPLIFICADO ---
function log(msg) {
    const t = new Date().toLocaleTimeString();
    console.log(`[${t}] ${msg}`);
    // Intentar escribir en el body por si Playwright está mirando el DOM
    document.body.innerHTML = `<pre id="log-display">${document.body.innerText}\n[${t}] ${msg}</pre>`;
}

// --- FLUJO PRINCIPAL ---
auth.onAuthStateChanged(async user => {
    if (user) {
        log('Sesión iniciada. Comenzando proceso...');
        try {
            await runProcess();
        } catch (err) {
            log(`ERROR CRÍTICO: ${err.message}`);
            await notificarTelegram(`❌ Error crítico en el proceso: ${err.message}`);
        }
    } else {
        log('Iniciando login automático...');
        try {
            await auth.signInWithEmailAndPassword(AUTO_EMAIL, AUTO_PASSWORD);
        } catch (err) {
            log(`ERROR LOGIN: ${err.message}`);
        }
    }
});

async function runProcess() {
    // 0. NOTIFICACIÓN INICIO
    const inicioMsg = `🚀 *Actualización de Fichas Médicas Iniciada*\n` +
                 `📅 *Temporada:* ${AUTO_SEASON}\n` +
                 `⏰ *Hora:* ${new Date().toLocaleTimeString('es-UY', { timeZone: 'America/Montevideo' })}\n` +
                 `⏳ _Iniciando escaneo y procesamiento..._`;
    await notificarTelegram(inicioMsg);

    // 1. CARGAR TEMPORADAS
    log('Cargando temporadas...');
    const resSeasons = await fetch(SEASONS_URL);
    const seasons = await resSeasons.json();
    if (!seasons.includes(AUTO_SEASON)) {
        throw new Error(`Temporada ${AUTO_SEASON} no encontrada.`);
    }

    // 2. ESCANEAR JUGADORES
    log(`Escaneando jugadores de la temporada ${AUTO_SEASON}...`);
    const resPlayers = await fetch(`${PLAYERS_URL}?season=${AUTO_SEASON}`);
    const data = await resPlayers.json();
    
    const playersToScrape = [];
    const DAYS_THRESHOLD = 60;
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(now.getDate() + DAYS_THRESHOLD);

    Object.keys(data).forEach(dni => {
        const p = data[dni];
        if (p.datosPersonales) {
            const fmHastaStr = p.datosPersonales['FM Hasta'];
            const expireDate = parseDate(fmHastaStr);
            if (!fmHastaStr || (expireDate && expireDate < thresholdDate)) {
                playersToScrape.push({ dni, nombre: p.datosPersonales['NOMBRE'] || dni, vencimiento: fmHastaStr });
            }
        }
    });

    log(`Encontrados ${playersToScrape.length} jugadores para procesar.`);
    if (playersToScrape.length === 0) {
        log('[FINISH] No hay jugadores para actualizar.');
        return;
    }

    // 3. PHASE: SCRAPPING (SIN GUARDAR TODAVÍA)
    const resultsToUpdate = [];
    let processed = 0;

    for (const player of playersToScrape) {
        processed++;
        log(`Scrapping (${processed}/${playersToScrape.length}): ${player.nombre}...`);
        try {
            const resp = await fetch(SCRAPE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dni: player.dni })
            });
            const result = await resp.json();

            const newHastaDate = parseDate(result.hasta);
            const oldHastaDate = parseDate(player.vencimiento);
            
            // Solo se considera actualizado si la nueva fecha es superior a la existente
            if (result.success && newHastaDate && (!oldHastaDate || newHastaDate > oldHastaDate)) {
                resultsToUpdate.push({ dni: player.dni, nombre: player.nombre, desde: result.desde, hasta: result.hasta });
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
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dni: res.dni, desde: res.desde, hasta: res.hasta })
            });
        } catch (e) {
            log(`   -> Error guardando ${res.nombre}: ${e.message}`);
        }
    }

    // 5. NOTIFICACIÓN FINAL
    let resumen = `✅ *Fichas Médicas Finalizado*\n`;
    resumen += `📅 *Temporada:* ${AUTO_SEASON}\n`;
    resumen += `📝 *Procesados:* ${playersToScrape.length}\n`;
    resumen += `✨ *Actualizados:* ${resultsToUpdate.length}\n`;
    
    if (resultsToUpdate.length > 0) {
        resumen += `\n👥 *Jugadores Actualizados:*\n`;
        resultsToUpdate.forEach(r => {
            // Limpieza básica de caracteres que podrían romper el Markdown de Telegram
            const nombreLimpio = r.nombre.replace(/[_*`[\]]/g, ''); 
            resumen += `• ${nombreLimpio}\n`;
        });
    }

    await notificarTelegram(resumen);
    log('[FINISH] Proceso automático completado.');
}

// --- UTILIDADES ---
async function notificarTelegram(mensaje) {
    try {
        await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TG_CHAT_ID, text: mensaje, parse_mode: 'Markdown' })
        });
    } catch (e) { console.error('Error Telegram:', e); }
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}