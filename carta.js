// Inicializar Firebase (usa firebaseConfig de firebase-config.js)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const auth = firebase.auth();

// DOM Elements
const seasonSelect = document.getElementById('seasonSelect');
const nameSearch = document.getElementById('nameSearch');
const searchResults = document.getElementById('searchResults');
const generateBtn = document.getElementById('generateBtn');
const statusMessage = document.getElementById('statusMessage');

// State
let playersList = [];
let selectedPlayer = null;
let isAdmin = false;
let seasonLoadRequest = 0;

// Initialization: el mismo modal común de roster se abre si no hay una sesión previa.
document.addEventListener('DOMContentLoaded', () => {
    requireAdminLogin();
});

function requireAdminLogin() {
    updateStatus("Verificando sesión de administrador...", "info");
    DSCAuth.require({
        admin: true,
        onReady: (user) => {
            isAdmin = true;
            updateStatus(`Sesión de administrador: ${user.email || 'cuenta autorizada'}`, "success");

            const backBtn = document.getElementById('backToMaintenance');
            if (backBtn) {
                backBtn.href = "mantenimiento.html";
                backBtn.classList.remove('hidden');
            }

            if (typeof AuditLogger !== 'undefined') {
                AuditLogger.logNavigation('entró al Generador de Constancias');
            }
            fetchPreferencesAndLoad(user.uid);
        }
    });
}

function fetchPreferencesAndLoad(uid) {
    database.ref(`preferenciasUsuarios/${uid}/ultimaTemporadaSeleccionada`).once('value')
        .then(snapshot => {
            const lastSeason = snapshot.val();
            loadSeasons(lastSeason);
        })
        .catch(() => loadSeasons());
}

// Cargar temporadas después de iniciar sesión como administrador.
function loadSeasons(preference = null) {
    seasonSelect.disabled = true;
    seasonSelect.innerHTML = '<option value="">Cargando temporadas...</option>';

    database.ref('/temporadas').once('value').then(snapshot => {
        const seasons = snapshot.val() || {};
        const keys = Object.keys(seasons).sort().reverse();

        seasonSelect.innerHTML = '<option value="">Selecciona temporada</option>';
        keys.forEach(season => seasonSelect.appendChild(new Option(season, season)));
        seasonSelect.disabled = false;

        if (preference && keys.includes(preference)) {
            seasonSelect.value = preference;
            seasonSelect.dispatchEvent(new Event('change'));
        } else if (keys.length === 0) {
            updateStatus("No hay temporadas disponibles", "error");
        } else {
            updateStatus("Selecciona una temporada para comenzar", "info");
        }
    }).catch(error => {
        console.error("Error al cargar temporadas:", error);
        seasonSelect.innerHTML = '<option value="">No se pudieron cargar las temporadas</option>';
        updateStatus("No se pudieron cargar las temporadas", "error");
    });
}

// Cargar jugadores al cambiar la temporada.
seasonSelect.addEventListener('change', () => {
    const season = seasonSelect.value;
    const requestId = ++seasonLoadRequest;
    playersList = [];
    resetForm(true);

    if (!season) {
        updateStatus("Selecciona una temporada para comenzar", "info");
        return;
    }

    updateStatus(`Cargando jugadores ${season}...`, "info");

    database.ref(`/registrosPorTemporada/${season}`).once('value').then(snapshot => {
        if (requestId !== seasonLoadRequest) return;
        if (!snapshot.exists()) {
            updateStatus("No hay datos en esta temporada", "error");
            return;
        }

        const records = Object.values(snapshot.val() || {}).filter(Boolean);
        const recordsByDni = new Map();
        records.forEach(record => {
            const dni = String(record._dni || record.DNI || '').trim();
            if (dni && !recordsByDni.has(dni)) recordsByDni.set(dni, record);
        });
        const dnis = [...recordsByDni.keys()];

        return Promise.all(dnis.map(dni =>
            database.ref(`/jugadores/${dni}/datosPersonales`).once('value')
                .then(playerSnapshot => ({ playerSnapshot, dni }))
        )).then(results => {
            if (requestId !== seasonLoadRequest) return;

            playersList = results
                .filter(result => result.playerSnapshot.exists())
                .map(({ playerSnapshot, dni }) => {
                    const personalData = playerSnapshot.val() || {};
                    const seasonRecord = recordsByDni.get(dni) || {};
                    return {
                        nombre: personalData.NOMBRE || '',
                        dni,
                        categoria: seasonRecord.CATEGORIA || '',
                        equipo: seasonRecord.EQUIPO || ''
                    };
                })
                .filter(player => player.nombre)
                .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

            nameSearch.disabled = playersList.length === 0;
            updateStatus(
                playersList.length ? `${playersList.length} jugadores cargados` : "No se encontraron jugadores en esta temporada",
                playersList.length ? "success" : "error"
            );
        });
    }).catch(error => {
        if (requestId !== seasonLoadRequest) return;
        console.error("Error al cargar jugadores:", error);
        playersList = [];
        nameSearch.disabled = true;
        updateStatus("No se pudieron cargar los jugadores de esta temporada", "error");
    });

    if (auth.currentUser) {
        database.ref(`preferenciasUsuarios/${auth.currentUser.uid}`).update({
            ultimaTemporadaSeleccionada: season
        }).catch(error => console.warn("No se pudo guardar la temporada preferida:", error));
    }

    if (typeof AuditLogger !== 'undefined') {
        AuditLogger.log(`seleccionó la temporada ${season} para generar constancias`);
    }
});

// Normaliza acentos, mayúsculas, puntuación y espacios.
function normalizeName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function scoreNameMatch(query, candidate) {
    const q = normalizeName(query);
    const c = normalizeName(candidate);
    if (!q || !c) return 0;
    if (q === c) return 1000;
    if (c.startsWith(q)) return 800;
    const queryTokens = q.split(' ');
    const candidateTokens = c.split(' ');
    const allTokensPresent = queryTokens.every(token => candidateTokens.some(candidateToken =>
        candidateToken === token || candidateToken.startsWith(token)
    ));
    if (allTokensPresent) return 600 + queryTokens.length;
    if (c.includes(q)) return 300;
    return 0;
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
}

// Búsqueda y selección de jugador: no requiere volver a ingresar el documento.
nameSearch.addEventListener('input', (event) => {
    const term = event.target.value.trim();
    selectedPlayer = null;
    generateBtn.disabled = true;
    searchResults.innerHTML = '';

    if (term.length < 2) {
        searchResults.style.display = 'none';
        updateStatus("Escribe al menos dos letras para buscar un jugador", "info");
        return;
    }

    const matches = playersList
        .map(player => ({ player, score: scoreNameMatch(term, player.nombre) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.player.nombre.localeCompare(b.player.nombre, 'es'))
        .slice(0, 10)
        .map(item => item.player);

    if (matches.length > 0) {
        matches.forEach(player => {
            const result = document.createElement('div');
            result.className = 'search-item';
            const name = document.createElement('strong');
            name.textContent = player.nombre;
            result.appendChild(name);

            if (player.categoria || player.equipo) {
                const details = document.createElement('small');
                details.textContent = [player.categoria, player.equipo].filter(Boolean).join(' · ');
                details.style.display = 'block';
                details.style.opacity = '0.7';
                result.appendChild(details);
            }

            result.addEventListener('click', () => selectPlayer(player));
            searchResults.appendChild(result);
        });
        searchResults.style.display = 'block';
        updateStatus("Selecciona el jugador en la lista", "info");
    } else {
        searchResults.style.display = 'none';
        updateStatus("No se encontraron coincidencias", "info");
    }
});

function selectPlayer(player) {
    selectedPlayer = player;
    nameSearch.value = player.nombre;
    searchResults.style.display = 'none';
    generateBtn.disabled = false;
    updateStatus(`${player.nombre} seleccionado`, "success");

    if (typeof AuditLogger !== 'undefined') {
        AuditLogger.log(`seleccionó a ${player.nombre} para generar su constancia`, {
            nombre: player.nombre,
            temporada: seasonSelect.value
        });
    }
}

generateBtn.onclick = generatePDF;

async function generatePDF() {
    if (!selectedPlayer || !seasonSelect.value) return;
    if (!isAdmin || !auth.currentUser) {
        updateStatus("Inicia sesión con una cuenta de administrador para generar constancias", "error");
        return;
    }

    const fechaLarga = getLongDate();
    const nombre = selectedPlayer.nombre;
    const dni = String(selectedPlayer.dni || '').trim();
    const identificacion = dni ? ` C.I. <strong>${escapeHtml(dni)}</strong>` : '';

    // El documento de identidad se toma del registro del jugador; no se solicita ni verifica manualmente.
    document.getElementById('docDate').textContent = `Montevideo, ${fechaLarga}`;
    document.getElementById('docBody').innerHTML = `
Por intermedio de la presente dejo constancia que <strong>${escapeHtml(nombre)}</strong>${identificacion}, forma parte del plantel de básquetbol de nuestro club, concurriendo a prácticas, y participando en las competencias correspondientes.
    `;

    const element = document.getElementById('letterPreview');
    element.style.display = 'block';
    generateBtn.disabled = true;

    const opt = {
        margin: 0,
        filename: `Constancia_${normalizeName(nombre).replace(/\s+/g, '_') || 'jugador'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: 'avoid-all' }
    };

    updateStatus("Generando PDF...", "info");

    try {
        await html2pdf().set(opt).from(element).save();
        element.style.display = 'none';
        updateStatus("PDF descargado con éxito", "success");

        if (typeof AuditLogger !== 'undefined') {
            AuditLogger.log(`generó con éxito la constancia PDF de ${nombre}`, {
                nombre,
                temporada: seasonSelect.value
            });
        }

        showSuccessModal();
    } catch (error) {
        console.error("PDF Error:", error);
        element.style.display = 'none';
        generateBtn.disabled = false;
        updateStatus("Error al generar el PDF. Inténtalo nuevamente.", "error");
    }
}


function saveToHistory(nombre, dni) {
    const timestamp = new Date().toISOString();
    const deviceId = getDeviceId();
    
    database.ref('cartas').push({
        fecha: timestamp,
        nombre: nombre,
        dni: dni,
        dispositivo: deviceId,
        userEmail: auth.currentUser ? auth.currentUser.email : 'anonimo'
    }).catch(err => console.error("History Log Error:", err));
}

function getDeviceId() {
    // Generate or retrieve a persistent ID for the browser/device
    let dsc_did = localStorage.getItem('dsc_device_id');
    if (!dsc_did) {
        dsc_did = 'DID-' + Math.random().toString(36).substr(2, 9).toUpperCase() + '-' + Date.now();
        localStorage.setItem('dsc_device_id', dsc_did);
    }
    return dsc_did;
}

function showSuccessModal() {
    const modal = document.getElementById('successModal');
    modal.style.display = 'flex';
}


document.getElementById('anotherBtn').onclick = () => {
    document.getElementById('successModal').style.display = 'none';
    resetForm(false); // Limpia el nombre y conserva la temporada elegida.
    updateStatus("Selecciona un nuevo jugador", "info");
};

function exitApp() {
    window.location.href = isAdmin ? 'mantenimiento.html' : 'index.html';
}

document.getElementById('exitBtn').onclick = exitApp;
document.getElementById('globalExitBtn').onclick = exitApp;

// Helpers
function getLongDate() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const d = new Date();
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function updateStatus(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.style.color = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#1e3a8a';
}

function resetForm(disableSearch = false) {
    nameSearch.value = '';
    nameSearch.disabled = disableSearch || !seasonSelect.value || playersList.length === 0;
    generateBtn.disabled = true;
    selectedPlayer = null;
    searchResults.innerHTML = '';
    searchResults.style.display = 'none';
}

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        searchResults.style.display = 'none';
    }
});
