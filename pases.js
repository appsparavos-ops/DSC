/**
 * Visor de Pases — Defensor Sporting Club
 * Lee /pases de Firebase y clasifica en recibidos/enviados + vigentes/a vencer/vencidos/pendientes.
 */

// ── Firebase Init ──
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// ── Constants ──
const CLUB_NAME = 'DEFENSOR SPORTING';
const DAYS_THRESHOLD = 30; // días para considerar "a vencer"

// ── DOM Refs ──
const tabRecibidos = document.getElementById('tabRecibidos');
const tabEnviados = document.getElementById('tabEnviados');
const badgeRecibidos = document.getElementById('badgeRecibidos');
const badgeEnviados = document.getElementById('badgeEnviados');
const summaryBar = document.getElementById('summaryBar');
const pasesContent = document.getElementById('pasesContent');
const loadingState = document.getElementById('loadingState');
const seasonFilter = document.getElementById('seasonFilter');
const nameFilter = document.getElementById('nameFilter');

// ── State ──
let allPases = [];
let currentTab = 'recibidos';
let currentSeason = ''; // '' = todas
let currentName = '';
let currentStatusFilter = null;
let userPreferredSeason = null;

// ── Auth Observer ──
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const snap = await database.ref(`preferenciasUsuarios/${user.uid}/ultimaTemporadaSeleccionada`).once('value');
            const pref = snap.val();
            if (pref) {
                // Extraer el primer año (ej. "2025-2026" -> "2025")
                userPreferredSeason = pref.split('-')[0];
            }
        } catch (e) {
            console.error("Error loading preferences:", e);
        }
    }
    // Cargar pases una vez sepamos la preferencia (o si no hay)
    loadPases();
});

// ── Date helpers ──
function parseDate(str) {
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

function formatDate(str) {
    if (!str) return '—';
    return str;
}

function daysBetween(d1, d2) {
    const ms = d2.getTime() - d1.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// ── Classification ──
function classifyPase(pase) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fechaAcepta = pase['FECHA FEDERACION ACEPTA'];
    const validoHastaRaw = pase['VALIDO HASTA'];
    const validoHasta = parseDate(validoHastaRaw);
    const tipoPase = (pase['TIPO PASE'] || '').toUpperCase().trim();

    // No aceptado por la federación → pendiente
    if (!fechaAcepta || fechaAcepta.trim() === '') {
        return 'pendiente';
    }

    if (!validoHasta || (tipoPase === 'DEFINITIVO' && validoHastaRaw && validoHastaRaw.includes('31/12/9999'))) {
        // Tiene aceptación pero no fecha de validez o es definitivo 9999 → vigente por defecto
        return 'vigente';
    }

    const daysLeft = daysBetween(today, validoHasta);

    if (daysLeft < 0) return 'vencido';
    if (daysLeft <= DAYS_THRESHOLD) return 'aVencer';
    return 'vigente';
}

function getSeasonYear(pase) {
    let fecha = pase['FECHA FEDERACION ACEPTA'];
    if (!fecha || fecha.trim() === '') {
        fecha = pase['FECHA SOLICITUD'];
    }
    if (!fecha) return null;
    const d = parseDate(fecha);
    return d ? d.getFullYear().toString() : null;
}

function getTabPases(tab) {
    return allPases.filter(p => {
        const destino = (p['CLUB DESTINO'] || '').toUpperCase().trim();
        const origen = (p['CLUB ORIGEN'] || '').toUpperCase().trim();

        let tabMatch = false;
        if (tab === 'recibidos') tabMatch = destino.includes(CLUB_NAME);
        else if (tab === 'enviados') tabMatch = origen.includes(CLUB_NAME) && !destino.includes(CLUB_NAME);

        if (!tabMatch) return false;

        // Season filter
        if (currentSeason) {
            const year = getSeasonYear(p);
            if (year !== currentSeason) return false;
        }

        // Name filter
        if (currentName) {
            const jugador = (p['JUGADOR'] || '').toLowerCase();
            const nif = (p['NIF'] || '').toLowerCase();
            if (!jugador.includes(currentName) && !nif.includes(currentName)) {
                return false;
            }
        }

        return true;
    });
}

// ── Rendering ──
function renderSummary(pases) {
    const counts = { vigente: 0, aVencer: 0, vencido: 0, pendiente: 0 };
    pases.forEach(p => counts[p._status]++);

    const getOp = (s) => (currentStatusFilter && currentStatusFilter !== s) ? 'opacity: 0.4;' : '';

    summaryBar.innerHTML = `
        <div class="summary-chip green clickable" style="${getOp('vigente')}" onclick="toggleStatusFilter('vigente')"><span class="dot"></span> ${counts.vigente} Vigentes</div>
        <div class="summary-chip yellow clickable" style="${getOp('aVencer')}" onclick="toggleStatusFilter('aVencer')"><span class="dot"></span> ${counts.aVencer} A Vencer</div>
        <div class="summary-chip red clickable" style="${getOp('vencido')}" onclick="toggleStatusFilter('vencido')"><span class="dot"></span> ${counts.vencido} Vencidos</div>
        <div class="summary-chip gray clickable" style="${getOp('pendiente')}" onclick="toggleStatusFilter('pendiente')"><span class="dot"></span> ${counts.pendiente} Pendientes</div>
    `;
}

window.toggleStatusFilter = function(status) {
    if (currentStatusFilter === status) {
        currentStatusFilter = null;
    } else {
        currentStatusFilter = status;
    }
    renderTab();
};

function renderCard(pase) {
    const statusClass = {
        vigente: 'green',
        aVencer: 'yellow',
        vencido: 'red',
        pendiente: 'gray'
    }[pase._status];

    const tipoPase = (pase['TIPO PASE'] || '').toUpperCase().trim();
    const typeClass = tipoPase === 'DEFINITIVO' ? 'definitivo' : 'temporal';

    const clubOrigen = pase['CLUB ORIGEN'] || '—';
    const clubDestino = pase['CLUB DESTINO'] || '—';
    let validoHasta = formatDate(pase['VALIDO HASTA']);
    if (tipoPase === 'DEFINITIVO' && pase['VALIDO HASTA'] && pase['VALIDO HASTA'].includes('31/12/9999')) {
        validoHasta = 'No vence';
    }
    const fechaSolicitud = formatDate(pase['FECHA SOLICITUD']);

    // Determine which club to show based on tab
    const clubLabel = currentTab === 'recibidos' ? 'Desde' : 'Hacia';
    const clubValue = currentTab === 'recibidos' ? clubOrigen : clubDestino;

    let html = `
        <div class="pase-card">
            <div class="status-bar ${statusClass}"></div>
            <div class="info">
                <div class="player-name">${pase['JUGADOR'] || pase.NIF || '—'}</div>
                <div class="meta">
                    <span><span class="label">${clubLabel}:</span> ${clubValue}</span>
                    <span><span class="label">Válido:</span> ${validoHasta}</span>
                    <span><span class="label">Solicitud:</span> ${fechaSolicitud}</span>
                </div>`;

    // Show NUEVA SOLICITUD if present
    if (pase['NUEVA SOLICITUD']) {
        const ns = pase['NUEVA SOLICITUD'];
        html += `
                <div class="pending-sub">
                    <strong>⏳ Nueva Solicitud pendiente:</strong>
                    ${ns['TIPO PASE'] || ''} — ${ns['CLUB ORIGEN'] || ''} → ${ns['CLUB DESTINO'] || ''}
                    (Solicitado: ${formatDate(ns['FECHA SOLICITUD'])})
                </div>`;
    }

    html += `
            </div>
            <span class="type-badge ${typeClass}">${tipoPase || 'N/A'}</span>
        </div>`;

    return html;
}

function renderSection(title, colorClass, pases) {
    if (pases.length === 0) return '';

    const cards = pases.map(p => renderCard(p)).join('');
    return `
        <div class="section-group">
            <div class="section-title ${colorClass}">
                <span class="icon"></span>
                ${title}
                <span class="count">(${pases.length})</span>
            </div>
            ${cards}
        </div>`;
}

function renderTab() {
    const tabPases = getTabPases(currentTab);

    // Classify each pase
    tabPases.forEach(p => { p._status = classifyPase(p); });

    // Update tab badges
    const recibidosCount = getTabPases('recibidos').length;
    const enviadosCount = getTabPases('enviados').length;
    badgeRecibidos.textContent = recibidosCount;
    badgeEnviados.textContent = enviadosCount;

    // Render summary
    renderSummary(tabPases);

    if (tabPases.length === 0) {
        pasesContent.innerHTML = `
            <div class="empty-state">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                <p>No hay pases ${currentTab === 'recibidos' ? 'recibidos' : 'enviados'} registrados.</p>
            </div>`;
        return;
    }

    // Group by status (apply currentStatusFilter if active)
    let drawPases = tabPases;
    if (currentStatusFilter) {
        drawPases = drawPases.filter(p => p._status === currentStatusFilter);
    }

    const vigentes = drawPases.filter(p => p._status === 'vigente');
    const aVencer = drawPases.filter(p => p._status === 'aVencer');
    const vencidos = drawPases.filter(p => p._status === 'vencido');
    const pendientes = drawPases.filter(p => p._status === 'pendiente');

    let html = '';
    html += renderSection('Vigentes', 'green', vigentes);
    html += renderSection('A Vencer (próximos 30 días)', 'yellow', aVencer);
    html += renderSection('Vencidos', 'red', vencidos);
    html += renderSection('Pendientes de Aceptación', 'gray', pendientes);
    pasesContent.innerHTML = html;
}

// ── Tab Switching ──
function switchTab(tabId) {
    currentTab = tabId;
    currentStatusFilter = null;
    
    // Update UI tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    renderTab();
}

tabRecibidos.addEventListener('click', () => switchTab('recibidos'));
tabEnviados.addEventListener('click', () => switchTab('enviados'));

seasonFilter.addEventListener('change', () => {
    currentSeason = seasonFilter.value;
    renderTab();
});

nameFilter.addEventListener('input', () => {
    currentName = nameFilter.value.toLowerCase().trim();
    renderTab();
});

// ── Load Data ──
async function loadPases() {
    try {
        const snapshot = await database.ref('pases').once('value');
        const data = snapshot.val() || {};

        allPases = Object.entries(data).map(([nif, pase]) => ({
            NIF: nif,
            ...pase
        }));

        // Sort by player name
        allPases.sort((a, b) => {
            const na = (a['JUGADOR'] || '').toLowerCase();
            const nb = (b['JUGADOR'] || '').toLowerCase();
            return na.localeCompare(nb);
        });

        loadingState.style.display = 'none';
        populateSeasons();
        renderTab();

    } catch (error) {
        loadingState.innerHTML = `
            <p style="color: #f87171;">Error al cargar pases: ${error.message}</p>`;
    }
}

// ── Populate Seasons ──
function populateSeasons() {
    const years = new Set();
    allPases.forEach(p => {
        const y = getSeasonYear(p);
        if (y) years.add(y);
    });

    const sorted = Array.from(years).sort((a, b) => b.localeCompare(a));
    seasonFilter.innerHTML = '<option value="">Todas las temporadas</option>';
    sorted.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        seasonFilter.appendChild(opt);
    });

    // Aplicar preselección si existe
    if (userPreferredSeason) {
        if (!sorted.includes(userPreferredSeason)) {
            const opt = document.createElement('option');
            opt.value = userPreferredSeason;
            opt.textContent = userPreferredSeason;
            seasonFilter.appendChild(opt);
        }
        currentSeason = userPreferredSeason;
        seasonFilter.value = userPreferredSeason;
    } else {
        // Por defecto: mostrar todas
        currentSeason = '';
        seasonFilter.value = '';
    }
}

// ── Init ──
// El inicio se maneja en el auth listener para cargar preferencias primeramente
