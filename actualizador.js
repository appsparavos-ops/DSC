// Configuración de la API: Apunta directamente al servicio desplegado en Render.
const API_BASE_URL = 'https://dsc-vh8j.onrender.com';

const SCRAPE_URL = `${API_BASE_URL}/scrape`;
const PLAYERS_URL = `${API_BASE_URL}/players`;
const UPDATE_URL = `${API_BASE_URL}/update_player`;

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

// Estadísticas
const statTotal = document.getElementById('stat-total');
const statPending = document.getElementById('stat-pending');
const statUpdated = document.getElementById('stat-updated');

// Constantes
const DAYS_THRESHOLD = 30;

// Estado
let playersToUpdate = [];
let updatedCount = 0;
let isCancelled = false;
let abortController = null;

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
    log(`Conectando con Backend en: ${API_BASE_URL}...`, 'info');
    scanBtn.disabled = true;
    scanBtn.classList.add('opacity-50');

    try {
        const response = await fetch(PLAYERS_URL);
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
                        vencimiento: fmHastaStr || 'N/A',
                        status: 'pending'
                    });
                }
            }
        });

        playersToUpdate = players;
        renderPlayers();
        updateStats(Object.keys(data).length, players.length);

        log(`Escaneo completado. ${players.length} jugadores requieren actualización.`, 'warn');

        if (players.length > 0) {
            updateAllBtn.classList.remove('hidden');
        }

    } catch (error) {
        log(`Error al escanear: ${error.message}`, 'error');
    } finally {
        scanBtn.disabled = false;
        scanBtn.classList.remove('opacity-50');
    }
}

function renderPlayers() {
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
                statusText = 'Fallo';
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
        playerListBody.appendChild(row);
    });
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
    renderPlayers();
    loadingSpinner.classList.remove('hidden');
    log(`Buscando datos APS para: ${player.nombre}...`, 'info');

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
                player.vencimiento = result.hasta;
                updatedCount++;
                statUpdated.textContent = updatedCount;
                log(`${player.nombre} actualizado con éxito hasta ${result.hasta}`, 'info');
            }
        } else {
            player.status = 'fail';
            log(`No se encontraron datos para ${player.nombre} en APS.`, 'warn');
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
        renderPlayers();
        loadingSpinner.classList.add('hidden');
        abortController = null;
    }
}

async function updateAll() {
    log('Iniciando actualización masiva...', 'warn');
    isCancelled = false;
    updateAllBtn.disabled = true;
    updateAllBtn.classList.add('opacity-50');
    cancelBtn.classList.remove('hidden');

    for (let i = 0; i < playersToUpdate.length; i++) {
        if (isCancelled) break;
        if (playersToUpdate[i].status === 'pending' || playersToUpdate[i].status === 'fail') {
            await updateSinglePlayer(i);
        }
    }

    if (isCancelled) {
        log('Actualización masiva cancelada por el usuario.', 'error');
    } else {
        log('Proceso de actualización masiva finalizado.', 'info');
    }

    updateAllBtn.disabled = false;
    updateAllBtn.classList.remove('opacity-50');
    cancelBtn.classList.add('hidden');
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

// Event Listeners
scanBtn.addEventListener('click', scanPlayers);
updateAllBtn.addEventListener('click', updateAll);
cancelBtn.addEventListener('click', cancelUpdate);
clearLogsBtn.addEventListener('click', () => { logDisplay.innerHTML = '> Consola reseteada...'; });
