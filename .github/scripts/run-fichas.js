const { chromium } = require('playwright');

const FICHAS_URL = process.env.FICHAS_URL;

if (!FICHAS_URL) {
    console.error('ERROR: La variable de entorno FICHAS_URL no está configurada.');
    console.error('Agregá el secret FICHAS_URL en GitHub con la URL de fichasmedicas.html');
    process.exit(1);
}

(async () => {
    console.log(`Abriendo: ${FICHAS_URL}`);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Capturar logs de consola del navegador para ver el progreso en Actions
    page.on('console', msg => {
        console.log(`[BROWSER] ${msg.text()}`);
    });

    // Capturar errores de la página
    page.on('pageerror', err => {
        console.error(`[BROWSER ERROR] ${err.message}`);
    });

    // Navegar a la página - Usamos 'load' en lugar de 'networkidle' porque Firebase 
    // puede mantener conexiones abiertas que causen timeout.
    console.log('Navegando...');
    await page.goto(FICHAS_URL, { waitUntil: 'load', timeout: 60000 });
    console.log('Página cargada. Esperando ejecución automática...');

    try {
        // Esperar hasta 12 minutos a que aparezca el mensaje de finalización en el log
        await page.waitForFunction(() => {
            const logDisplay = document.getElementById('log-display');
            if (!logDisplay) return false;
            return logDisplay.innerText.includes('Proceso automático completado') ||
                   logDisplay.innerText.includes('No hay jugadores para actualizar');
        }, { timeout: 720000 });

        // Capturar el contenido final del log para mostrarlo en Actions
        const logContent = await page.$eval('#log-display', el => el.innerText);
        console.log('\n=== LOG FINAL DEL ACTUALIZADOR ===');
        console.log(logContent);
        console.log('==================================\n');
        console.log('✅ Proceso completado con éxito.');

    } catch (err) {
        console.error(`❌ Tiempo de espera agotado o error: ${err.message}`);

        // Capturar screenshot para diagnóstico en caso de fallo
        await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
        console.log('Screenshot guardado como error-screenshot.png en los artefactos del job.');
        process.exit(1);

    } finally {
        await browser.close();
    }
})();

