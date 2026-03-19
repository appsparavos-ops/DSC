const { chromium } = require('playwright');
const FICHAS_URL = process.env.FICHAS_URL;

(async () => {
    console.log(`Abriendo: ${FICHAS_URL}`);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', msg => console.log(`${msg.text()}`));
    page.on('pageerror', err => console.error(`[BROWSER ERROR] ${err.message}`));
    
    // Configurar un timeout global para que no muera a los 30s
    page.setDefaultTimeout(1800000); // 30 minutos

    await page.goto(FICHAS_URL, { waitUntil: 'load', timeout: 120000 });

    try {
        console.log('Esperando el mensaje [FINISH]...');
        // Esperamos hasta 30 minutos (1.8M ms) a que el motor minimalista termine con los 70+ jugadores
        await page.waitForFunction(() => document.body.innerText.includes('[FINISH]'), { timeout: 1800000 });
        console.log('✅ Proceso completado exitosamente.');
    } catch (err) {
        console.error(`❌ Falló por tiempo o error: ${err.message}`);
        await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
