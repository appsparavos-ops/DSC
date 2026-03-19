// Configuración de la API: Apunta directamente al servicio desplegado en Render.
const API_BASE_URL = 'https://dsc-vh8j.onrender.com';

// --- Configuración Automática ---
const AUTO_EMAIL = 'invitado@dsc.com';
const AUTO_PASSWORD = 'invitado123';
const AUTO_SEASON = '2026';

// --- Configuración Telegram ---
const TG_TOKEN = '8672587823:AAFJllG1YID-FmGaEmPEqgmKtAdAnqxY80I';
const TG_CHAT_ID = '1837798371';
const SCRAPE_URL = `${API_BASE_URL}/scrape`;
const PLAYERS_URL = `${API_BASE_URL}/players`;
const UPDATE_URL = `${API_BASE_URL}/update_player`;
const SEASONS_URL = `${API_BASE_URL}/seasons`;

// Selección de elementos DOM
const scanBtn = document.getElementById('scan-btn');
const updateAllBtn = document.getElementById('update-all-btn');
const initialMessage = document.getElementById('initial-message');
const playerTable = document.getElementById('player-table');
const playerListBody = document.getElementById('player-list-body');
const logDisplay = document.getElementById('log-display');
const clearLogsBtn = document.getElementById('clear-logs');
const statsContainer = document.getElementById('stats-container');
const loadingSpinner = document.getElementById('loading-spinner');
const cancelBtn = document.getElementById('cancel-btn');
const seasonFilter = document.getElementById('season-filter');
const reportModal = document.getElementById('report-modal');
const downloadReportBtn = document.getElementById('download-report-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const mainDashboard = document.getElementById('main-dashboard');
const playerTableContainer = document.getElementById('player-table-container');
const volverBtn = document.getElementById('btn-volver');

// Inicializar Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const database = firebase.database();

// Estadísticas
const statTotal = document.getElementById('stat-total');
const statPending = document.getElementById('stat-pending');
const statUpdated = document.getElementById('stat-updated');

// Constantes
const DAYS_THRESHOLD = 60;

// Estado
let playersToUpdate = [];
let updatedCount = 0;
let isCancelled = false;
let abortController = null;
let wakeLock = null;

// Gestión de Pantalla Activa (Wake Lock)
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            log('Pantalla activa activada.', 'info');

            wakeLock.addEventListener('release', () => {
                log('Pantalla activa liberada.', 'info');
            });
        } catch (err) {
            log(`Error al activar pantalla activa: ${err.message}`, 'error');
        }
    }
}

async function releaseWakeLock() {
    if (wakeLock !== null) {
        await wakeLock.release();
        wakeLock = null;
    }
}

// Re-activar si se vuelve a la pestaña
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// Utilidades
function log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const color = type === 'info' ? 'text-green-400' : type === 'error' ? 'text-red-400' : 'text-yellow-400';
    const line = `<div class="${color}">[${timestamp}] > ${msg}</div>`;
    logDisplay.innerHTML += line;
    logDisplay.scrollTop = logDisplay.scrollHeight;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

function formatDate(date) {
    if (!date) return '-';
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Lógica de Negocio
async function scanPlayers() {
    const selectedSeason = seasonFilter.value;
    const url = selectedSeason === 'todas' ? PLAYERS_URL : `${PLAYERS_URL}?season=${selectedSeason}`;

    log(`Conectando con Backend en: ${API_BASE_URL}...`, 'info');

    const seasonText = seasonFilter.options[seasonFilter.selectedIndex].text;
    if (typeof AuditLogger !== 'undefined') {
        await AuditLogger.log(`seleccionó la temporada "${seasonText}" para escanear`);
    }

    scanBtn.disabled = true;
    scanBtn.classList.add('opacity-50');

    try {
        const response = await fetch(url);
        if (!response.ok) {
            log(`Error de Servidor: Status ${response.status}`, 'error');
            throw new Error('Servidor respondió con un error.');
        }

        const data = await response.json();

        if (!data) {
            log('No se encontraron jugadores en Firebase.', 'error');
            return;
        }

        const players = [];
        const now = new Date();
        const thresholdDate = new Date();
        thresholdDate.setDate(now.getDate() + DAYS_THRESHOLD);

        Object.keys(data).forEach(dni => {
            const player = data[dni];
            if (player.datosPersonales) {
                const fmHastaStr = player.datosPersonales['FM Hasta'];
                const expireDate = parseDate(fmHastaStr);
                const nombre = player.datosPersonales['NOMBRE'] || 'Desconocido';

                if (!fmHastaStr || (expireDate && expireDate < thresholdDate)) {
                    players.push({
                        dni: player.datosPersonales['DNI'] || dni,
                        nombre: nombre,
                        vencimiento: fmHastaStr || 'Sin ficha',
                        status: 'pending'
                    });
                }
            }
        });

        playersToUpdate = players;
        renderPlayers();
        updateStats(Object.keys(data).length, players.length);

        log(`Escaneo completado. ${players.length} jugadores requieren actualización.`, 'warn');
        if (typeof AuditLogger !== 'undefined') {
            const nombresJugadores = players.map(p => p.nombre);
            await AuditLogger.log(`el escaneo encontró ${players.length} jugadores para actualizar en la temporada "${seasonFilter.options[seasonFilter.selectedIndex].text}"`, {
                jugadores: nombresJugadores
            });
        }

        if (players.length > 0) {
            updateAllBtn.classList.remove('hidden');
            log('[AUTO] Iniciando actualización masiva automática...', 'info');
            await updateAll();
        } else {
            log('[AUTO] No hay jugadores para actualizar. Proceso finalizado.', 'info');
        }

    } catch (error) {
        log(`Error al escanear: ${error.message}`, 'error');
    } finally {
        scanBtn.disabled = false;
        scanBtn.classList.remove('opacity-50');
    }
}

function renderPlayers(activeIndex = -1) {
    initialMessage.classList.add('hidden');
    playerTable.classList.remove('hidden');
    statsContainer.classList.remove('hidden');
    playerListBody.innerHTML = '';

    playersToUpdate.forEach((p, index) => {
        let statusText = '';
        let statusClass = '';

        switch (p.status) {
            case 'pending':
                statusText = 'Pendiente';
                statusClass = 'bg-orange-100 text-orange-600';
                break;
            case 'updating':
                statusText = 'Actualizando';
                statusClass = 'bg-blue-100 text-blue-600 animate-pulse';
                break;
            case 'success':
                statusText = `Éxito actualizada ${p.vencimiento}`;
                statusClass = 'bg-green-100 text-green-600';
                break;
            case 'no_change':
                statusText = 'El Jugador no actualizó';
                statusClass = 'bg-gray-100 text-gray-600';
                break;
            case 'fail':
                statusText = 'No figura en SND';
                statusClass = 'bg-red-100 text-red-600';
                break;
        }

        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50/50 transition-colors';
        row.innerHTML = `
            <td class="px-6 py-4 font-bold text-gray-700">${p.nombre}</td>
            <td class="px-6 py-4 font-mono text-xs text-gray-500">${p.dni}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${p.vencimiento}</td>
            <td class="px-6 py-4">
                <span class="status-badge ${statusClass}">${statusText}</span>
            </td>
            <td class="px-6 py-4 text-center">
                <button onclick="updateSinglePlayer(${index})" class="text-indigo-600 hover:text-indigo-900 font-bold p-2 rounded-lg hover:bg-indigo-50 transition-colors">
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                </button>
            </td>
        `;

        if (index === activeIndex) {
            row.id = `player-row-${index}`;
            row.classList.add('bg-indigo-50/50');
        }

        playerListBody.appendChild(row);
    });

    // Auto-scroll al jugador activo para seguir el progreso paso a paso
    if (activeIndex !== -1) {
        const activeRow = document.getElementById(`player-row-${activeIndex}`);
        if (activeRow && playerTableContainer) {
            // Cálculo manual de desplazamiento interno para NO desplazar la página entera
            const rowTop = activeRow.offsetTop;
            const containerHeight = playerTableContainer.clientHeight;
            const rowHeight = activeRow.clientHeight;

            // Centrar la fila dentro del contenedor
            playerTableContainer.scrollTo({
                top: rowTop - (containerHeight / 2) + (rowHeight / 2),
                behavior: 'smooth'
            });
        }
    } else if (playersToUpdate.length > 0 && initialMessage.classList.contains('hidden')) {
        // Si no hay uno activo pero acabamos de cargar la lista, volver al inicio
        const container = document.getElementById('player-table-container');
        if (container && container.scrollTop > 100) {
            // Solo si el usuario no ha scrolleado manualmente mucho
            // o si queremos forzar el inicio al cargar
            // container.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
}

function updateStats(total, pending) {
    statTotal.textContent = total;
    statPending.textContent = pending;
    statUpdated.textContent = updatedCount;
}

async function updateSinglePlayer(index) {
    const player = playersToUpdate[index];
    if (player.status === 'success' || player.status === 'no_change' || player.status === 'updating' || isCancelled) return;

    player.status = 'updating';
    renderPlayers(index);
    loadingSpinner.classList.remove('hidden');
    log(`Buscando datos en SND para: ${player.nombre}...`, 'info');

    abortController = new AbortController();

    try {
        const response = await fetch(SCRAPE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dni: player.dni }),
            signal: abortController.signal
        });

        if (!response.ok) throw new Error('Servicio de scraping no disponible');

        const result = await response.json();

        if (result.success && result.desde && result.hasta) {
            // Comparar fecha obtenida con la existente
            if (result.hasta === player.vencimiento) {
                player.status = 'no_change';
                log(`${player.nombre} no tiene nueva fecha.`, 'warn');
            } else {
                log(`¡Nueva fecha encontrada (${result.hasta})! Actualizando Firebase para ${player.nombre}...`, 'info');

                const updateResponse = await fetch(UPDATE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        dni: player.dni,
                        desde: result.desde,
                        hasta: result.hasta
                    })
                });

                if (!updateResponse.ok) throw new Error('Error al actualizar en Firebase.');
                const updateResult = await updateResponse.json();

                if (!updateResult.success) throw new Error('El servidor reportó un fallo al actualizar Firebase.');

                player.status = 'success';
                const oldVencimiento = player.vencimiento;
                player.vencimiento = result.hasta;
                updatedCount++;
                statUpdated.textContent = updatedCount;
                log(`${player.nombre} actualizado con éxito hasta ${result.hasta}`, 'info');

                // Registro de la actualización individual exitosa
                if (typeof AuditLogger !== 'undefined') {
                    await AuditLogger.logUpdate('jugador', player.dni,
                        { nombre: player.nombre, 'FM Hasta': oldVencimiento },
                        { nombre: player.nombre, 'FM Hasta': result.hasta }
                    );
                }
            }
        } else {
            player.status = 'fail';
            log(`No se encontraron datos para ${player.nombre} en SND.`, 'warn');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            log(`Proceso de ${player.nombre} cancelado.`, 'warn');
            player.status = 'pending';
        } else {
            player.status = 'fail';
            log(`Error con ${player.nombre}: ${error.message}`, 'error');
        }
    } finally {
        renderPlayers(index);
        loadingSpinner.classList.add('hidden');
        abortController = null;
    }
}

async function updateAll() {
    log('Iniciando actualización masiva...', 'warn');

    // Enfocar el panel al iniciar actualización masiva
    mainDashboard.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (typeof AuditLogger !== 'undefined') {
        await AuditLogger.log(`inició la actualización masiva para ${playersToUpdate.length} jugadores.`);
    }

    isCancelled = false;
    updateAllBtn.disabled = true;
    updateAllBtn.classList.add('opacity-50');
    cancelBtn.classList.remove('hidden');

    await requestWakeLock();

    for (let i = 0; i < playersToUpdate.length; i++) {
        if (isCancelled) break;
        if (playersToUpdate[i].status === 'pending' || playersToUpdate[i].status === 'fail') {
            await updateSinglePlayer(i);
        }
    }

    if (isCancelled) {
        log('Actualización masiva cancelada por el usuario.', 'error');
        if (typeof AuditLogger !== 'undefined') {
            await AuditLogger.log('canceló la actualización masiva de fichas médicas.');
        }
    } else {
        log('Proceso de actualización masiva finalizado.', 'info');
        const successCount = playersToUpdate.filter(p => p.status === 'success').length;
        const successNames = playersToUpdate.filter(p => p.status === 'success').map(p => p.nombre).join(', ');
        if (typeof AuditLogger !== 'undefined') {
            await AuditLogger.log(`finalizó la actualización masiva. Se actualizaron con éxito ${successCount} jugadores: ${successNames || 'ninguno'}.`);
        }
    }

    updateAllBtn.disabled = false;
    updateAllBtn.classList.remove('opacity-50');
    cancelBtn.classList.add('hidden');

    await releaseWakeLock();

    // Notificación Telegram al finalizar
    const successCount = playersToUpdate.filter(p => p.status === 'success').length;
    const noChangeCount = playersToUpdate.filter(p => p.status === 'no_change').length;
    const failCount = playersToUpdate.filter(p => p.status === 'fail').length;
    const successNames = playersToUpdate.filter(p => p.status === 'success').map(p => p.nombre).join('\n  • ');

    const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const mensaje = [
        `✅ *Fichas Médicas - ${fecha} ${hora}*`,
        `Temporada: ${AUTO_SEASON}`,
        ``,
        `📋 Procesados: ${playersToUpdate.length}`,
        `✅ Actualizados: ${successCount}`,
        `⚪ Sin cambios: ${noChangeCount}`,
        `❌ No encontrados: ${failCount}`,
        successNames ? `\n👥 Actualizados:\n  • ${successNames}` : ''
    ].join('\n');

    await notificarTelegram(mensaje);

    log('[AUTO] Proceso automático completado. No se genera informe.', 'info');
}

async function notificarTelegram(mensaje) {
    try {
        const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TG_CHAT_ID,
                text: mensaje,
                parse_mode: 'Markdown'
            })
        });
        if (response.ok) {
            log('Notificación Telegram enviada con éxito.', 'info');
        } else {
            log(`Error al enviar Telegram: ${response.status}`, 'error');
        }
    } catch (err) {
        log(`Error Telegram: ${err.message}`, 'error');
    }
}

function cancelUpdate() {
    log('Cancelando proceso...', 'error');
    isCancelled = true;
    if (abortController) {
        abortController.abort();
    }
    cancelBtn.disabled = true;
    cancelBtn.classList.add('opacity-50');
    setTimeout(() => {
        cancelBtn.disabled = false;
        cancelBtn.classList.remove('opacity-50');
        cancelBtn.classList.add('hidden');
    }, 1000);
}

// Cargar temporadas al iniciar
async function loadSeasons() {
    try {
        const response = await fetch(SEASONS_URL);
        if (!response.ok) throw new Error('No se pudieron cargar las temporadas');

        const seasons = await response.json();
        seasonFilter.innerHTML = '<option value="todas">Todas las temporadas</option>';

        seasons.forEach(s => {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = s;
            seasonFilter.appendChild(option);
        });

        log('Temporadas cargadas con éxito.', 'info');

        // Seleccionar la temporada configurada y escanear automáticamente.
        const targetOption = Array.from(seasonFilter.options).find(o => o.value === AUTO_SEASON);
        if (targetOption) {
            seasonFilter.value = AUTO_SEASON;
            log(`[AUTO] Temporada ${AUTO_SEASON} seleccionada.`, 'info');
        } else {
            log(`[AUTO] Temporada ${AUTO_SEASON} no encontrada. Usando todas.`, 'warn');
            seasonFilter.value = 'todas'; // Fallback a "todas" si la auto-temporada no existe
        }
        await scanPlayers();
    } catch (error) {
        log(`Error al cargar temporadas: ${error.message}`, 'error');
        seasonFilter.innerHTML = '<option value="todas">Error al cargar</option>';
    }
}

// Event Listeners
scanBtn.addEventListener('click', scanPlayers);
updateAllBtn.addEventListener('click', updateAll);
cancelBtn.addEventListener('click', cancelUpdate);
clearLogsBtn.addEventListener('click', () => { logDisplay.innerHTML = '> Consola reseteada...'; });

// Gestión de Sesión y Navegación
auth.onAuthStateChanged(async user => {
    if (user) {
        if (typeof AuditLogger !== 'undefined') {
            AuditLogger.logNavigation('entró al Actualizador de Fichas Médicas');
        }
        loadSeasons();
    } else {
        // Login automático con credenciales configuradas.
        try {
            log('[AUTO] Iniciando login automático...', 'info');
            await auth.signInWithEmailAndPassword(AUTO_EMAIL, AUTO_PASSWORD);
            // onAuthStateChanged se disparará nuevamente con user != null.
        } catch (err) {
            log(`[AUTO] Login fallido: ${err.message}`, 'error');
            window.location.href = 'index.html';
        }
    }
});

if (volverBtn) {
    volverBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const target = volverBtn.href;
        if (typeof AuditLogger !== 'undefined') {
            await AuditLogger.log('regresó a la página de Mantenimiento');
        }
        window.location.href = target;
    });
}

// Generación de Reporte PDF
async function generatePDFReport() {
    if (!window.jspdf) {
        log('Error: La librería jsPDF no está cargada.', 'error');
        return;
    }

    log('Generando reporte PDF de actualización...', 'info');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Título y Fecha
    const today = new Date();
    const dateStr = today.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = today.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    // Obtener temporada seleccionada
    // seasonFilter ya es global
    const selectedSeasonText = seasonFilter.options[seasonFilter.selectedIndex].text;
    const selectedSeasonValue = seasonFilter.value;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Reporte de Actualización de Fichas Médicas", 14, 20);

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha de generación: ${dateStr} ${timeStr}`, 14, 28);
    doc.text(`Temporada: ${selectedSeasonText}`, 14, 34);

    const actualizados = playersToUpdate.filter(p => p.status === 'success');
    const noActualizados = playersToUpdate.filter(p => p.status !== 'success');

    let currentY = 42;

    // Tabla de Actualizados
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Jugadores Actualizados (${actualizados.length})`, 14, currentY);
    currentY += 5;

    if (actualizados.length > 0) {
        doc.autoTable({
            startY: currentY,
            head: [['Nombre', 'FM Hasta']],
            body: actualizados.map(p => [p.nombre, p.vencimiento]),
            theme: 'grid',
            headStyles: { fillColor: [76, 175, 80] },
            margin: { left: 14 }
        });
        currentY = doc.lastAutoTable.finalY + 15;
    } else {
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.text("Ningún jugador fue actualizado.", 14, currentY + 5);
        currentY += 15;
    }

    // Verificar salto de página
    if (currentY > 250) {
        doc.addPage();
        currentY = 20;
    }

    // Tabla de No Actualizados
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Jugadores Sin Actualizar (${noActualizados.length})`, 14, currentY);
    currentY += 5;

    if (noActualizados.length > 0) {
        doc.autoTable({
            startY: currentY,
            head: [['Nombre', 'FM Hasta', 'Motivo']],
            body: noActualizados.map(p => {
                let statusText = 'Pendiente / Cancelado';
                if (p.status === 'no_change') statusText = 'Misma fecha / Sin cambios';
                if (p.status === 'fail') statusText = 'No figura en SND / No encontrado';
                return [p.nombre, p.vencimiento, statusText];
            }),
            theme: 'grid',
            headStyles: { fillColor: [244, 67, 54] },
            margin: { left: 14 }
        });
    } else {
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.text("Todos los jugadores listados fueron actualizados exitosamente.", 14, currentY + 5);
    }

    doc.save(`Reporte_Actualizacion_Fichas_Medicas_${selectedSeasonValue !== 'todas' ? selectedSeasonValue : 'Todas'}_${dateStr.replace(/\//g, '-')}.pdf`);
    log("Reporte PDF de actualización descargado con éxito.", "info");

    if (typeof AuditLogger !== 'undefined') {
        await AuditLogger.log(`seleccionó descargar el informe PDF detallado de la temporada "${selectedSeasonText}" con ${playersToUpdate.filter(p => p.status === 'success').length} jugadores actualizados.`);
    }
}