const nodemailer = require('nodemailer');

// La URL es pública; la clave de acceso nunca se guarda en el código.
const API_BASE_URL = (process.env.RENDER_API_URL || 'https://dsc-vh8j.onrender.com').replace(/\/+$/, '');
const AUTOMATION_TOKEN = process.env.FICHAS_AUTOMATION_TOKEN;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const REPORT_EMAIL = process.env.REPORT_EMAIL;

const DAYS_THRESHOLD = 60;
const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;
const IS_DRY_RUN = /^(1|true|yes|si|sí)$/i.test(process.env.DRY_RUN || '');

const logLines = [];

function log(message) {
    const line = `[${new Date().toLocaleTimeString('es-UY', { timeZone: 'America/Montevideo' })}] ${message}`;
    console.log(line);
    logLines.push(line);
}

function horaUY() {
    return new Date().toLocaleString('es-UY', { timeZone: 'America/Montevideo' });
}

function parseDate(dateString) {
    if (!dateString) return null;

    const parts = String(dateString).split('/');
    if (parts.length !== 3) return null;

    const day = Number(parts[0]);
    const month = Number(parts[1]);
    const year = Number(parts[2]);
    if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;

    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
}

function crearTransporte() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: GMAIL_USER,
            pass: GMAIL_PASSWORD,
        },
    });
}

async function sendEmail(subject, bodyText) {
    if (!GMAIL_USER || !GMAIL_PASSWORD || !REPORT_EMAIL) {
        console.warn('[EMAIL] Faltan variables de correo; no se envió el informe.');
        return;
    }

    try {
        const info = await crearTransporte().sendMail({
            from: `"Fichas Médicas DSC" <${GMAIL_USER}>`,
            to: REPORT_EMAIL,
            subject,
            text: bodyText,
        });
        console.log(`[EMAIL] Informe enviado (${info.messageId}).`);
    } catch (error) {
        console.error(`[EMAIL] No se pudo enviar el informe: ${error.message}`);
    }
}

async function apiRequest(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = {
        Accept: 'application/json',
        Authorization: `Bearer ${AUTOMATION_TOKEN}`,
    };

    const options = { method, headers, signal: controller.signal };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${path}`, options);
        const responseText = await response.text();
        let result = null;

        if (responseText) {
            try {
                result = JSON.parse(responseText);
            } catch (_) {
                throw new Error(`Render respondió con un formato inesperado en ${path}.`);
            }
        }

        if (!response.ok) {
            const detail = result && result.error ? result.error : `HTTP ${response.status}`;
            throw new Error(`${path}: ${detail}`);
        }

        return result;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`Se agotó el tiempo de espera al consultar ${path}.`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function ejecutarActualizacion() {
    log(`Iniciando automatización. Umbral: ${DAYS_THRESHOLD} días.`);
    if (IS_DRY_RUN) log('MODO DE PRUEBA: no se guardarán cambios en Firebase.');

    // La lista activa se administra desde AutoSeasons.html y se guarda en Firebase.
    const seasons = await apiRequest('/auto_seasons');
    if (!Array.isArray(seasons) || seasons.length === 0) {
        throw new Error('AutoSeasons no contiene temporadas. Se detiene el proceso sin cambios.');
    }
    log(`Temporadas activas leídas de Firebase: ${seasons.join(', ')}.`);

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + DAYS_THRESHOLD);

    const playersToScrape = [];
    for (const season of seasons) {
        log(`Revisando jugadores de la temporada ${season}...`);
        const players = await apiRequest(`/players?season=${encodeURIComponent(season)}`);
        if (!players || typeof players !== 'object' || Array.isArray(players)) {
            throw new Error(`Render devolvió una lista de jugadores inválida para ${season}.`);
        }

        for (const [dni, player] of Object.entries(players)) {
            const personalData = player && player.datosPersonales;
            if (!personalData) continue;

            const currentExpiration = personalData['FM Hasta'];
            const expirationDate = parseDate(currentExpiration);
            if (!currentExpiration || (expirationDate && expirationDate < thresholdDate)) {
                playersToScrape.push({
                    dni,
                    season,
                    name: personalData.NOMBRE || dni,
                    currentExpiration,
                });
            }
        }
    }

    log(`Jugadores que cumplen el criterio: ${playersToScrape.length}.`);
    const resultsToUpdate = [];
    const scrapeErrors = [];

    for (let index = 0; index < playersToScrape.length; index++) {
        const player = playersToScrape[index];
        log(`Consultando ${index + 1}/${playersToScrape.length}: ${player.name} (${player.season})...`);

        try {
            const result = await apiRequest('/scrape', {
                method: 'POST',
                body: { dni: player.dni },
            });

            const newExpiration = parseDate(result && result.hasta);
            const oldExpiration = parseDate(player.currentExpiration);
            if (result && result.success && newExpiration && (!oldExpiration || newExpiration > oldExpiration)) {
                resultsToUpdate.push({
                    dni: player.dni,
                    season: player.season,
                    name: player.name,
                    desde: result.desde,
                    hasta: result.hasta,
                });
                log(`  Nueva fecha encontrada para ${player.name}: ${result.hasta}.`);
            } else {
                log(`  Sin cambios para ${player.name}.`);
            }
        } catch (error) {
            scrapeErrors.push({ name: player.name, message: error.message });
            log(`  Error consultando ${player.name}: ${error.message}`);
        }
    }

    let updatedCount = 0;
    const successfullyUpdated = [];
    const updateErrors = [];
    if (IS_DRY_RUN) {
        log(`Prueba finalizada: ${resultsToUpdate.length} cambio(s) posibles; ninguno fue guardado.`);
    } else {
        for (const result of resultsToUpdate) {
            try {
                const updateResult = await apiRequest('/update_player', {
                    method: 'POST',
                    body: { dni: result.dni, desde: result.desde, hasta: result.hasta },
                });
                if (!updateResult || !updateResult.success) {
                    throw new Error('Render no confirmó el guardado en Firebase.');
                }
                updatedCount++;
                successfullyUpdated.push(result);
                log(`Actualizado ${result.name} hasta ${result.hasta}.`);
            } catch (error) {
                updateErrors.push({ name: result.name, message: error.message });
                log(`Error guardando ${result.name}: ${error.message}`);
            }
        }
    }

    const durationMinutes = ((Date.now() - runStartedAt) / 60000).toFixed(1);
    const reportedPlayers = IS_DRY_RUN ? resultsToUpdate : successfullyUpdated;
    const updatedPlayers = reportedPlayers.map(
        player => `• ${player.name} (${player.season}) → ${player.hasta}`,
    );

    let report = `${IS_DRY_RUN ? '🧪 Prueba' : '✅ Automatización'} de Fichas Médicas\n`;
    report += `⏰ Finalizó: ${horaUY()}\n`;
    report += `⏱️ Duración: ${durationMinutes} minutos\n`;
    report += `📅 Temporadas: ${seasons.join(', ')}\n`;
    report += `📝 Jugadores revisados: ${playersToScrape.length}\n`;
    report += `✨ Guardados en Firebase: ${IS_DRY_RUN ? 0 : updatedCount}\n`;
    if (IS_DRY_RUN) report += `🔎 Cambios posibles (sin guardar): ${resultsToUpdate.length}\n`;
    if (scrapeErrors.length) report += `⚠️ Errores de consulta: ${scrapeErrors.length}\n`;
    if (updateErrors.length) report += `⚠️ Errores al guardar: ${updateErrors.length}\n`;
    if (updatedPlayers.length) report += `\nJugadores con nueva fecha:\n${updatedPlayers.join('\n')}`;

    const hasErrors = scrapeErrors.length > 0 || updateErrors.length > 0;
    await sendEmail(
        hasErrors ? '⚠️ Fichas Médicas — revisar errores' : '✅ Fichas Médicas — proceso completado',
        report,
    );

    log(`Proceso terminado. Guardados: ${IS_DRY_RUN ? 0 : updatedCount}; revisados: ${playersToScrape.length}.`);
    return hasErrors;
}

const runStartedAt = Date.now();

(async () => {
    try {
        if (!AUTOMATION_TOKEN || AUTOMATION_TOKEN.trim().length < 32) {
            throw new Error('Falta configurar FICHAS_AUTOMATION_TOKEN con una clave larga en GitHub Actions.');
        }
        if (!API_BASE_URL.startsWith('https://')) {
            throw new Error('RENDER_API_URL debe comenzar con https://.');
        }

        const hasErrors = await ejecutarActualizacion();
        if (hasErrors) process.exitCode = 1;
    } catch (error) {
        log(`ERROR: ${error.message}`);
        const logSummary = logLines.slice(-30).join('\n');
        await sendEmail(
            '❌ Error — Actualizador de Fichas Médicas DSC',
            `El automatismo se detuvo sin hacer más cambios.\n\nHora: ${horaUY()}\nError: ${error.message}\n\nÚltimos registros:\n${logSummary}`,
        );
        process.exitCode = 1;
    }
})();
