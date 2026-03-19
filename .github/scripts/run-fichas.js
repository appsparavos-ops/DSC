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

    page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));
    page.on('pageerror', err => console.error(`[BROWSER ERROR] ${err.message}`));

    await page.goto(FICHAS_URL, { waitUntil: 'networkidle' });

    try {
        await page.waitForFunction(() => {
            const logDisplay = document.getElementById('log-display');
            if (!logDisplay) return false;
            return logDisplay.innerText.includes('Proceso automático completado') ||
                   logDisplay.innerText.includes('No hay jugadores para actualizar');
        }, { timeout: 720000 });

        const logContent = await page.$eval('#log-display', el => el.innerText);
        console.log('\n=== LOG FINAL DEL ACTUALIZADOR ===\n' + logContent);
        console.log('✅ Proceso completado con éxito.');

    } catch (err) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
