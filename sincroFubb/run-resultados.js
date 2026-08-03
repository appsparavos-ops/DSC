const { chromium } = require('playwright');

// --- CONFIGURACIÓN ---
const RESULTADOS_URL = process.env.RESULTADOS_URL;
const TIMEOUT_MS = 25 * 60 * 1000; // 25 minutos máximo

// Hora local para logs
function localTime() {
    return new Date().toLocaleTimeString('es-UY', { timeZone: 'America/Montevideo' });
}

(async () => {
    if (!RESULTADOS_URL) {
        console.error(`[${localTime()}] ERROR CRÍTICO: La variable RESULTADOS_URL no está configurada.`);
        process.exit(1);
    }

    const startTime = Date.now();
    console.log(`[${localTime()}] Iniciando Playwright para sincronizar resultados...`);
    console.log(`[${localTime()}] Destino: ${RESULTADOS_URL}`);

    // Abrir con ?auto=1 para identificar ejecución automatizada
    const targetUrl = RESULTADOS_URL.includes('?') 
        ? `${RESULTADOS_URL}&auto=1` 
        : `${RESULTADOS_URL}?auto=1`;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Capturar logs del navegador y mostrarlos en el output del Action
    page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));
    page.on('pageerror', err => console.error(`[BROWSER ERROR] ${err.message}`));

    page.setDefaultTimeout(TIMEOUT_MS);

    try {
        await page.goto(targetUrl, { waitUntil: 'load', timeout: 120000 });
        console.log(`[${localTime()}] Página cargada. Esperando finalización del proceso...`);

        // Esperar hasta que aparezca [FINISH] o [ERROR] en el DOM
        await page.waitForFunction(
            () => {
                const txt = document.body.innerText || '';
                return txt.includes('[FINISH]') || txt.includes('[ERROR]');
            },
            { timeout: TIMEOUT_MS }
        );

        const textoFinal = await page.evaluate(() => document.body.innerText || '');
        const duracionMin = ((Date.now() - startTime) / 60000).toFixed(1);

        if (textoFinal.includes('[ERROR]')) {
            console.error(`[${localTime()}] ❌ El proceso finalizó con ERRORES en ${duracionMin} minutos.`);
            await browser.close();
            process.exit(1);
        } else {
            console.log(`[${localTime()}] ✅ Proceso finalizado exitosamente en ${duracionMin} minutos.`);
            await browser.close();
            process.exit(0);
        }

    } catch (err) {
        console.error(`[${localTime()}] ❌ Error de Playwright o tiempo de espera agotado: ${err.message}`);
        await browser.close();
        process.exit(1);
    }
})();
