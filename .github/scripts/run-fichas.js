const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

// --- CONFIGURACIÓN ---
const FICHAS_URL     = process.env.FICHAS_URL;
const GMAIL_USER     = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const REPORT_EMAIL   = process.env.REPORT_EMAIL;

// Tiempo máximo de espera del proceso (30 min)
const TIMEOUT_MS = 30 * 60 * 1000;

// ─────────────────────────────────────────────
//  UTILIDAD: Transportador de email (Nodemailer)
// ─────────────────────────────────────────────
function crearTransporte() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: GMAIL_USER,
            pass: GMAIL_PASSWORD,
        },
    });
}

async function sendEmail(subject, bodyText, attachments = []) {
    if (!GMAIL_USER || !GMAIL_PASSWORD || !REPORT_EMAIL) {
        console.warn('[EMAIL] Variables de entorno faltantes — email omitido.');
        return;
    }
    const transporter = crearTransporte();
    const mailOptions = {
        from: `"Fichas Médicas DSC" <${GMAIL_USER}>`,
        to: REPORT_EMAIL,
        subject,
        text: bodyText,
        attachments,
    };
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Enviado OK → ${info.messageId}`);
    } catch (err) {
        // El email falla → solo loguear, no interrumpir el flujo
        console.error(`[EMAIL] Error al enviar: ${err.message}`);
    }
}

// ─────────────────────────────────────────────
//  UTILIDAD: Hora Uruguay (GMT-3)
// ─────────────────────────────────────────────
function horaUY() {
    return new Date().toLocaleString('es-UY', { timeZone: 'America/Montevideo' });
}

// ─────────────────────────────────────────────
//  FLUJO PRINCIPAL
// ─────────────────────────────────────────────
(async () => {
    // Validación básica de configuración
    if (!FICHAS_URL) {
        const msg = `[${horaUY()}] ERROR CRÍTICO: La variable FICHAS_URL no está configurada.`;
        console.error(msg);
        await sendEmail('❌ Error de Configuración — Fichas Médicas DSC', msg);
        process.exit(1);
    }

    const startTime = Date.now();
    const logBuffer = []; // Acumula todas las líneas del proceso para el reporte final

    function capturarLog(linea) {
        console.log(linea);
        logBuffer.push(linea);
    }

    // ── 1. EMAIL DE INICIO ───────────────────────────────────────────
    const mensajeInicio =
        `🚀 El automatismo de Fichas Médicas DSC ha comenzado.\n` +
        `\n` +
        `📅 Hora de inicio : ${horaUY()}\n` +
        `🌐 URL            : ${FICHAS_URL}\n` +
        `⏳ Tiempo máx.    : 30 minutos\n` +
        `\n` +
        `Recibirás un segundo email cuando el proceso finalice (con éxito o error).`;

    await sendEmail('🚀 Inicio — Actualizador de Fichas Médicas DSC', mensajeInicio);
    capturarLog(`[${horaUY()}] Email de inicio enviado.`);

    // Construir la URL con ?auto=1 para que fichasmedicas.js sepa que corre
    // en modo automático y no envíe emails duplicados via EmailJS
    const targetUrl = FICHAS_URL.includes('?')
        ? `${FICHAS_URL}&auto=1`
        : `${FICHAS_URL}?auto=1`;

    capturarLog(`[${horaUY()}] Abriendo: ${targetUrl}`);

    // ── 2. PLAYWRIGHT ────────────────────────────────────────────────
    const browser = await chromium.launch({ headless: true });
    const page    = await browser.newPage();

    // Capturar consola del browser → acumular en buffer
    page.on('console', msg => capturarLog(`[BROWSER] ${msg.text()}`));
    page.on('pageerror', err => capturarLog(`[BROWSER ERROR] ${err.message}`));

    // Timeout global del page
    page.setDefaultTimeout(TIMEOUT_MS);

    let screenshotBuffer = null;

    try {
        await page.goto(targetUrl, { waitUntil: 'load', timeout: 120000 });
        capturarLog(`[${horaUY()}] Página cargada. Esperando marca [FINISH] o [ERROR]...`);

        // Esperar hasta que aparezca [FINISH] o [ERROR] en el DOM
        await page.waitForFunction(
            () => {
                const txt = document.body.innerText || '';
                return txt.includes('[FINISH]') || txt.includes('[ERROR]');
            },
            { timeout: TIMEOUT_MS }
        );

        // Leer el texto final del DOM para extraer el resumen
        const textoFinal = await page.evaluate(() => document.body.innerText || '');
        const esError = textoFinal.includes('[ERROR]');

        // Extraer líneas relevantes del resumen (últimas 40 líneas del log del browser)
        const lineasResumen = textoFinal
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0)
            .slice(-40)
            .join('\n');

        const duracionMin = ((Date.now() - startTime) / 60000).toFixed(1);

        if (esError) {
            // ── Proceso terminó con [ERROR] detectado en el DOM ──
            capturarLog(`[${horaUY()}] ❌ Proceso terminó con ERROR.`);
            screenshotBuffer = await page.screenshot({ fullPage: true });

            const cuerpoError =
                `❌ El automatismo de Fichas Médicas DSC terminó con ERROR.\n` +
                `\n` +
                `⏰ Hora fin     : ${horaUY()}\n` +
                `⏱️  Duración     : ${duracionMin} minutos\n` +
                `\n` +
                `━━━━━━━━━━ RESUMEN DEL LOG ━━━━━━━━━━\n` +
                `${lineasResumen}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `\n` +
                `Se adjunta captura de pantalla del estado final.`;

            await sendEmail(
                '❌ Error — Fichas Médicas DSC',
                cuerpoError,
                [{ filename: 'error-screenshot.png', content: screenshotBuffer }]
            );
        } else {
            // ── Proceso terminó exitosamente ──
            capturarLog(`[${horaUY()}] ✅ Proceso completado exitosamente.`);

            const cuerpoExito =
                `✅ El automatismo de Fichas Médicas DSC finalizó con éxito.\n` +
                `\n` +
                `⏰ Hora fin     : ${horaUY()}\n` +
                `⏱️  Duración     : ${duracionMin} minutos\n` +
                `\n` +
                `━━━━━━━━━━ RESUMEN DEL PROCESO ━━━━━━━\n` +
                `${lineasResumen}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

            await sendEmail('✅ Completado — Fichas Médicas DSC', cuerpoExito);
        }

    } catch (err) {
        // ── Timeout u error de Playwright (nunca llegó a [FINISH]) ──
        capturarLog(`[${horaUY()}] ❌ Timeout o fallo de Playwright: ${err.message}`);

        try {
            screenshotBuffer = await page.screenshot({ fullPage: true });
        } catch (_) {
            capturarLog(`[${horaUY()}] No se pudo tomar screenshot.`);
        }

        const duracionMin = ((Date.now() - startTime) / 60000).toFixed(1);
        const logCompleto = logBuffer.slice(-50).join('\n');

        const cuerpoFallo =
            `❌ El automatismo de Fichas Médicas DSC falló inesperadamente.\n` +
            `\n` +
            `⏰ Hora fin     : ${horaUY()}\n` +
            `⏱️  Duración     : ${duracionMin} minutos\n` +
            `🔴 Error        : ${err.message}\n` +
            `\n` +
            `━━━━━━━━━━ ÚLTIMAS LÍNEAS DEL LOG ━━━━━━\n` +
            `${logCompleto}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        const attachments = screenshotBuffer
            ? [{ filename: 'error-screenshot.png', content: screenshotBuffer }]
            : [];

        await sendEmail('❌ Fallo Crítico — Fichas Médicas DSC', cuerpoFallo, attachments);

        await browser.close();
        process.exit(1);
    }

    await browser.close();
})();
