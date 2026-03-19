const { chromium } = require('playwright');

const FICHAS_URL = process.env.FICHAS_URL;

if (!FICHAS_URL) {
    console.error('ERROR: La variable de entorno FICHAS_URL no está configurada.');
    process.exit(1);
}

(async () => {
    console.log(`Abriendo: ${FICHAS_URL}`);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Capturar logs de consola del navegador para ver el progreso en Actions
    page.on('console', msg => {
        console.log(`${msg.text()}`);
    });

    // Capturar errores de la página
    page.on('pageerror', err => {
        console.error(`[BROWSER ERROR] ${err.message}`);
    });

    // Navegar a la página
    console.log('Navegando...');
    await page.goto(FICHAS_URL, { waitUntil: 'load', timeout: 60000 });
    console.log('Página cargada. Esperando ejecución del motor...');

    try {
        // Esperar hasta 15 minutos a que aparezca el mensaje de finalización [FINISH]
        // Esta versión minimalista escribe directamente en el body el log.
        await page.waitForFunction(() => {
            const bodyText = document.body.innerText;
            return bodyText.includes('[FINISH]');
        }, { timeout: 900000 });

        console.log('✅ Proceso completado detectado en el navegador.');

    } catch (err) {
        console.error(`❌ Tiempo de espera agotado o error: ${err.message}`);
        await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
