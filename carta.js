const firebaseConfig = {
    apiKey: "AIzaSyANWXQvhHpF0LCYjz4AXi3MkcP798PqRfA",
    authDomain: "dsc24-aa5a1.firebaseapp.com",
    databaseURL: "https://dsc24-aa5a1-default-rtdb.firebaseio.com",
    projectId: "dsc24-aa5a1",
    storageBucket: "dsc24-aa5a1.appspot.com",
    messagingSenderId: "798100493177",
    appId: "1:798100493177:web:8e2ae324f8b5cb893a55a8"
};

const GUEST_EMAIL = "invitado@dsc.com";
const GUEST_PW = "invitado123";

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const auth = firebase.auth();

// DOM Elements
const seasonSelect = document.getElementById('seasonSelect');
const nameSearch = document.getElementById('nameSearch');
const searchResults = document.getElementById('searchResults');
const dniInput = document.getElementById('dniInput');
const generateBtn = document.getElementById('generateBtn');
const statusMessage = document.getElementById('statusMessage');

// State
let playersList = [];
let selectedPlayer = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    autoLogin();
});

// Step 1: Automatic Guest Login
function autoLogin() {
    updateStatus("Verificando sesión...", "info");

    // Check if there's already a user (no automatic login if so)
    auth.onAuthStateChanged((user) => {
        if (user) {
            updateStatus(`Sesión: ${user.email}`, "success");
            fetchPreferencesAndLoad(user.uid);
        } else {
            updateStatus("Iniciando sesión como invitado...", "info");
            auth.signInWithEmailAndPassword(GUEST_EMAIL, GUEST_PW)
                .then((result) => {
                    updateStatus("Conectado como invitado", "success");
                    fetchPreferencesAndLoad(result.user.uid);
                })
                .catch(err => {
                    console.error("Auth Error:", err);
                    updateStatus("Error de conexión", "error");
                    // Fallback to load seasons without preferences
                    loadSeasons();
                });
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

// Step 2: Load Seasons
function loadSeasons(preference = null) {
    database.ref('/temporadas').once('value').then(snapshot => {
        const seasons = snapshot.val();
        seasonSelect.innerHTML = '<option value="">Selecciona temporada</option>';
        if (seasons) {
            const keys = Object.keys(seasons).sort().reverse();
            keys.forEach(s => {
                const opt = document.createElement('option');
                opt.value = opt.textContent = s;
                seasonSelect.appendChild(opt);
            });

            if (preference && keys.includes(preference)) {
                seasonSelect.value = preference;
                // Trigger change to load players
                const event = new Event('change');
                seasonSelect.dispatchEvent(event);
            }
        }
    });
}

// Step 3: Load Players when Season changes
seasonSelect.addEventListener('change', () => {
    const season = seasonSelect.value;
    if (!season) {
        resetForm(true);
        return;
    }

    updateStatus(`Cargando jugadores ${season}...`, "info");
    nameSearch.disabled = true;

    database.ref(`/registrosPorTemporada/${season}`).once('value').then(snapshot => {
        if (!snapshot.exists()) {
            updateStatus("No hay datos en esta temporada", "error");
            return;
        }

        const records = Object.values(snapshot.val());
        // Map DNI to player data fetching personal info if needed
        // For efficiency, we'll fetch all players of that season
        // (Similar to roster.js but simplified)

        // We only care about players (not coaches for letters usually)
        const dnis = [...new Set(records.map(r => r._dni || r.DNI).filter(Boolean))];

        // Fetch personal names for these DNIs
        const promises = dnis.map(dni =>
            database.ref(`/jugadores/${dni}/datosPersonales`).once('value')
                .then(snap => ({ snap, dni }))
        );

        Promise.all(promises).then(results => {
            playersList = results
                .filter(res => res.snap.exists())
                .map(res => {
                    const data = res.snap.val();
                    return {
                        nombre: data.NOMBRE,
                        dni: res.dni
                    };
                })
                .sort((a, b) => a.nombre.localeCompare(b.nombre));

            nameSearch.disabled = false;
            updateStatus(`${playersList.length} jugadores cargados`, "success");
        });
    });

    // Guardar preferencia
    const user = auth.currentUser;
    if (user) {
        database.ref(`preferenciasUsuarios/${user.uid}`).update({
            ultimaTemporadaSeleccionada: season
        });
    }
});

// Search Logic
nameSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    searchResults.innerHTML = '';

    if (term.length < 2) {
        searchResults.style.display = 'none';
        return;
    }

    const matches = playersList.filter(p => p.nombre.toLowerCase().includes(term));

    if (matches.length > 0) {
        matches.slice(0, 10).forEach(p => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.textContent = p.nombre;
            div.onclick = () => selectPlayer(p);
            searchResults.appendChild(div);
        });
        searchResults.style.display = 'block';
    } else {
        searchResults.style.display = 'none';
    }
});

function selectPlayer(p) {
    selectedPlayer = p;
    nameSearch.value = p.nombre;
    searchResults.style.display = 'none';
    dniInput.disabled = false;
    dniInput.value = '';
    dniInput.focus();
    validateForm();
}

dniInput.addEventListener('input', validateForm);

function validateForm() {
    if (!selectedPlayer) {
        generateBtn.disabled = true;
        return;
    }

    const inputDni = dniInput.value.replace(/\D/g, '');
    const playerDni = selectedPlayer.dni.replace(/\D/g, '');

    const isValid = inputDni === playerDni;
    generateBtn.disabled = !isValid;

    if (inputDni.length > 0) {
        if (isValid) {
            updateStatus("DNI Verificado ✓", "success");
        } else if (inputDni.length >= playerDni.length) {
            updateStatus("DNI no coincide con el seleccionado", "error");
        } else {
            updateStatus("Ingresando DNI...", "info");
        }
    } else {
        updateStatus("Ingresa el DNI para verificar", "info");
    }
}

generateBtn.onclick = generatePDF;

function generatePDF() {
    if (!selectedPlayer) return;

    const fechaLarga = getLongDate();
    const nombre = selectedPlayer.nombre;
    const dni = selectedPlayer.dni;

    // Fill Template
    document.getElementById('docDate').textContent = `Montevideo, ${fechaLarga}`;
    document.getElementById('docBody').innerHTML = `
Por intermedio de la presente dejo constancia que <strong>${nombre}</strong> C.I. <strong>${dni}</strong>, forma parte del plantel de básquetbol de nuestro club, concurriendo a prácticas, y participando en las competencias correspondientes.
    `;

    // PDF Options
    const element = document.getElementById('letterPreview');
    element.style.display = 'block'; // Show for rendering

    const opt = {
        margin: 0,
        filename: `Constancia_${nombre.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: 'avoid-all' }
    };

    updateStatus("Generando PDF...", "info");

    html2pdf().set(opt).from(element).save().then(() => {
        element.style.display = 'none'; // Hide again
        updateStatus("Descargado con éxito", "success");
        
        // Log to history
        saveToHistory(nombre, dni);
        
        showSuccessModal();
    }).catch(err => {
        console.error("PDF Error:", err);
        updateStatus("Error al generar PDF", "error");
    });
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
    document.getElementById('successModal').style.display = 'flex';
}

document.getElementById('anotherBtn').onclick = () => {
    document.getElementById('successModal').style.display = 'none';
    resetForm(false); // Reset DNI and search but keep season
    updateStatus("Selecciona un nuevo jugador", "info");
};

document.getElementById('exitBtn').onclick = () => {
    const user = auth.currentUser;
    if (user && user.email === GUEST_EMAIL) {
        window.close();
        // Fallback for browsers that block window.close
        setTimeout(() => {
            window.location.href = 'about:blank';
        }, 500);
    } else {
        window.location.href = 'mantenimiento.html';
    }
};

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

function resetForm(full = false) {
    nameSearch.value = '';
    if (full) {
        nameSearch.disabled = true;
    }
    dniInput.value = '';
    dniInput.disabled = true;
    generateBtn.disabled = true;
    selectedPlayer = null;
    searchResults.style.display = 'none';
}

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        searchResults.style.display = 'none';
    }
});
