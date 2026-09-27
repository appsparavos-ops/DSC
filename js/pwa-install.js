/* Gestión DSC - Botón flotante "Instalar app" (PWA)
 *  - Chrome / Edge (Android y PC): usa el diálogo nativo de instalación (beforeinstallprompt).
 *  - iPhone / iPad: ese diálogo no existe; el botón muestra los pasos (Compartir -> Agregar a inicio).
 *  - No aparece si la página ya corre como app instalada, ni durante 7 días después de cerrarlo con la X.
 *  Se incluye desde el <head> de cada página con: <script src="js/pwa-install.js" defer></script>
 */
(function () {
    'use strict';

    var APP_NAME = 'Gestión DSC';
    var DISMISS_KEY = 'gestionDSC.pwaInstallDismissedAt';
    var DISMISS_DAYS = 7;

    var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                       window.navigator.standalone === true;
    if (isStandalone) return; // ya está instalada y abierta como app

    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    function dismissedRecently() {
        try {
            var t = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
            return t > 0 && (Date.now() - t) < DISMISS_DAYS * 86400000;
        } catch (e) { return false; }
    }
    function markDismissed() {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* sin storage */ }
    }
    function onBodyReady(fn) {
        if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn);
    }

    var deferredPrompt = null;
    var bar = null;
    var help = null;

    function hideBar() {
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
        bar = null;
        hideHelp();
    }
    function hideHelp() {
        if (help && help.parentNode) help.parentNode.removeChild(help);
        help = null;
    }

    function showBar(onInstall) {
        if (bar) return;
        bar = document.createElement('div');
        bar.id = 'pwaInstallBar';
        bar.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;align-items:center;gap:6px;' +
            'background:#1e3a8a;color:#fff;padding:10px 10px 10px 16px;border-radius:9999px;box-shadow:0 10px 25px rgba(0,0,0,.28);' +
            'font:600 14px/1.2 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:calc(100vw - 32px);';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '\uD83D\uDCF2 Instalar ' + APP_NAME;
        btn.style.cssText = 'all:unset;cursor:pointer;color:#fff;font:inherit;white-space:nowrap;padding:2px 4px;';
        btn.addEventListener('click', onInstall);

        var close = document.createElement('button');
        close.type = 'button';
        close.setAttribute('aria-label', 'Cerrar');
        close.textContent = '\u00D7';
        close.style.cssText = 'all:unset;cursor:pointer;color:#bfdbfe;font-size:22px;line-height:1;padding:0 6px;';
        close.addEventListener('click', function () { hideBar(); markDismissed(); });

        bar.appendChild(btn);
        bar.appendChild(close);
        document.body.appendChild(bar);
    }

    function showIOSHelp() {
        if (help) { hideHelp(); return; }
        help = document.createElement('div');
        help.style.cssText = 'position:fixed;right:16px;bottom:72px;z-index:2147483000;background:#fff;color:#111827;' +
            'padding:14px 16px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.3);width:min(320px,calc(100vw - 32px));' +
            'font:14px/1.45 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;';
        help.innerHTML =
            '<div style="font-weight:700;margin-bottom:6px;">Instalar en iPhone / iPad</div>' +
            '<ol style="margin:0 0 10px 18px;padding:0;">' +
            '<li>Toc\u00e1 el bot\u00f3n <b>Compartir</b> <span style="display:inline-block;border:1.5px solid #374151;border-radius:4px;width:14px;height:14px;vertical-align:-2px;"></span> (abajo en Safari).</li>' +
            '<li>Eleg\u00ed <b>\u201cAgregar a inicio\u201d</b>.</li>' +
            '<li>Confirm\u00e1 con <b>Agregar</b>.</li>' +
            '</ol>' +
            '<button type="button" style="all:unset;cursor:pointer;color:#1e3a8a;font-weight:700;">Entendido</button>';
        help.querySelector('button').addEventListener('click', function () { hideBar(); markDismissed(); });
        document.body.appendChild(help);
    }

    // Chrome / Edge
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        if (dismissedRecently()) return;
        onBodyReady(function () {
            showBar(function () {
                if (!deferredPrompt) return;
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function () { deferredPrompt = null; hideBar(); });
            });
        });
    });

    window.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        hideBar();
    });

    // iPhone / iPad: sin prompt nativo, mostramos la ayuda
    if (isIOS && !dismissedRecently()) {
        onBodyReady(function () { showBar(showIOSHelp); });
    }
})();
