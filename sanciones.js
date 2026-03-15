const firebaseConfig = {
    apiKey: "AIzaSyANWXQvhHpF0LCYjz4AXi3MkcP798PqRfA",
    authDomain: "dsc24-aa5a1.firebaseapp.com",
    databaseURL: "https://dsc24-aa5a1-default-rtdb.firebaseio.com",
    projectId: "dsc24-aa5a1",
    storageBucket: "dsc24-aa5a1.appspot.com",
    messagingSenderId: "798100493177",
    appId: "1:798100493177:web:8e2ae324f8b5cb893a55a8"
};

// Inicializar Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const auth = firebase.auth();

// Elementos del DOM
const playerSearch = document.getElementById('playerSearch');
const suggestions = document.getElementById('suggestions');
const selectedPlayerInfo = document.getElementById('selectedPlayerInfo');
const playerInitial = document.getElementById('playerInitial');
const displayName = document.getElementById('displayName');
const displayDni = document.getElementById('displayDni');
const selectedDni = document.getElementById('selectedDni');
const selectedName = document.getElementById('selectedName');

const sanctionForm = document.getElementById('sanctionForm');
const fechasCount = document.getElementById('fechasCount');
const seasonSelect = document.getElementById('seasonSelect');
const categorySelect = document.getElementById('categorySelect');
const startDateInput = document.getElementById('startDate');
const submitBtn = document.getElementById('submitBtn');

const sanctionsList = document.getElementById('sanctionsList');
const sanctionCountEl = document.getElementById('sanctionCount');

const categoryContainer = document.getElementById('categoryContainer');
const searchLabel = document.getElementById('searchLabel');
const btnTypeJugador = document.getElementById('btnTypeJugador');
const btnTypeEntrenador = document.getElementById('btnTypeEntrenador');

const toast = document.getElementById('toast');
const toastText = document.getElementById('toastText');
const valueLabel = document.getElementById('valueLabel');
const btnModePartidos = document.getElementById('btnModePartidos');
const btnModeTiempo = document.getElementById('btnModeTiempo');

let allPlayers = [];
let activeSanctions = {};
let currentType = 'jugador'; // 'jugador' o 'entrenador'
let currentMode = 'partidos'; // 'partidos' o 'tiempo'

// Inicializar fecha de hoy
const hoy = new Date();
startDateInput.value = hoy.toISOString().split('T')[0];

function showToast(message, error = false) {
    toastText.textContent = message;
    toast.classList.remove('translate-y-24', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    toast.firstElementChild.className = `${error ? 'bg-red-600' : 'bg-green-600'} text-white px-8 py-4 rounded-2xl shadow-2xl font-semibold`;
    setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3000);
}

// Cargar Jugadores para el buscador
function loadAllPlayers() {
    const p1 = database.ref('/jugadores').once('value');
    const p2 = database.ref('/entrenadores').once('value');
    
    Promise.all([p1, p2]).then(snapshots => {
        allPlayers = [];
        // Jugadores
        const jugData = snapshots[0].val();
        if (jugData) {
            allPlayers = allPlayers.concat(Object.keys(jugData).map(dni => ({
                DNI: dni,
                NOMBRE: jugData[dni].datosPersonales?.NOMBRE || 'S/N',
                TIPO: 'jugador'
            })));
        }
        // Entrenadores
        const entData = snapshots[1].val();
        if (entData) {
            allPlayers = allPlayers.concat(Object.keys(entData).map(dni => ({
                DNI: dni,
                NOMBRE: entData[dni].datosPersonales?.NOMBRE || 'S/N',
                TIPO: 'entrenador'
            })));
        }
    });
}

// Cargar Temporadas
function loadSeasons() {
    database.ref('/temporadas').once('value').then(snapshot => {
        const seasons = snapshot.val();
        if (seasons) {
            const seasonKeys = Object.keys(seasons).sort().reverse();
            seasonKeys.forEach(s => {
                seasonSelect.appendChild(new Option(s, s));
            });
        }
    });
}

// Buscador de Jugadores
playerSearch.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (val.length < 2) {
        suggestions.classList.add('hidden');
        return;
    }

    const filtered = allPlayers.filter(p => 
        p.TIPO === currentType && (
            p.DNI.includes(val) || 
            p.NOMBRE.toLowerCase().includes(val)
        )
    ).slice(0, 5);

    if (filtered.length > 0) {
        suggestions.innerHTML = filtered.map(p => `
            <div class="suggestion-item border-b border-gray-50 last:border-0" onclick="selectPlayer('${p.DNI}', '${p.NOMBRE}')">
                <span class="font-bold text-blue-900">${p.DNI}</span> - 
                <span class="text-gray-700">${p.NOMBRE}</span>
            </div>
        `).join('');
        suggestions.classList.remove('hidden');
    } else {
        suggestions.classList.add('hidden');
    }
});

window.setSanctionType = function(type) {
    currentType = type;
    
    // Reset form states
    selectedPlayerInfo.classList.add('hidden');
    selectedDni.value = '';
    selectedName.value = '';
    playerSearch.value = '';
    submitBtn.disabled = true;

    if (type === 'jugador') {
        searchLabel.textContent = "Buscar Jugador DNI o Nombre";
        categoryContainer.classList.add('hidden');
        categorySelect.value = "";
        // UI Buttons
        btnTypeJugador.className = "flex-1 py-2 text-xs font-bold rounded-xl transition-all shadow-sm bg-white text-blue-900 ring-1 ring-black/5";
        btnTypeEntrenador.className = "flex-1 py-2 text-xs font-bold rounded-xl transition-all text-gray-500 hover:bg-gray-200";
    } else {
        searchLabel.textContent = "Buscar Entrenador DNI o Nombre";
        categoryContainer.classList.remove('hidden');
        // UI Buttons
        btnTypeEntrenador.className = "flex-1 py-2 text-xs font-bold rounded-xl transition-all shadow-sm bg-white text-blue-900 ring-1 ring-black/5";
        btnTypeJugador.className = "flex-1 py-2 text-xs font-bold rounded-xl transition-all text-gray-500 hover:bg-gray-200";
    }
};

window.setSanctionMode = function(mode) {
    currentMode = mode;
    if (mode === 'partidos') {
        valueLabel.textContent = "Fechas";
        btnModePartidos.className = "flex-1 py-2 text-[10px] font-bold rounded-lg transition-all shadow-sm bg-white text-blue-900 border border-gray-100";
        btnModeTiempo.className = "flex-1 py-2 text-[10px] font-bold rounded-lg transition-all text-gray-400 hover:bg-gray-100";
    } else {
        valueLabel.textContent = "Días";
        btnModeTiempo.className = "flex-1 py-2 text-[10px] font-bold rounded-lg transition-all shadow-sm bg-white text-blue-900 border border-gray-100";
        btnModePartidos.className = "flex-1 py-2 text-[10px] font-bold rounded-lg transition-all text-gray-400 hover:bg-gray-100";
    }
};

window.selectPlayer = function(dni, nombre) {
    selectedDni.value = dni;
    selectedName.value = nombre;
    playerSearch.value = '';
    suggestions.classList.add('hidden');
    
    playerInitial.textContent = nombre.charAt(0).toUpperCase();
    displayName.textContent = nombre;
    displayDni.textContent = `DNI: ${dni}`;
    selectedPlayerInfo.classList.remove('hidden');
    submitBtn.disabled = false;
};

// Cargar Sanciones
function loadSanctions() {
    database.ref('/sanciones').on('value', snapshot => {
        activeSanctions = snapshot.val() || {};
        renderSanctions();
    });
}

function renderSanctions() {
    const keys = Object.keys(activeSanctions);
    sanctionCountEl.textContent = `${keys.length} Sancionados`;
    
    if (keys.length === 0) {
        sanctionsList.innerHTML = '<tr><td colspan="4" class="px-6 py-12 text-center text-gray-400">No hay sanciones activas registradas</td></tr>';
        return;
    }

    sanctionsList.innerHTML = keys.sort((a,b) => (activeSanctions[b].fechaCarga || "").localeCompare(activeSanctions[a].fechaCarga || "")).map(dni => {
        const s = activeSanctions[dni];
        return `
            <tr class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-xs">
                            ${(s.nombre || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-bold text-gray-800">${s.nombre || 'N/N'}</div>
                            <div class="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">${dni}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="inline-block bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                        ${s.fechas} ${s.tipoSancion === 'tiempo' ? 'Días' : 'Partidos'}
                    </span>
                </td>
                <td class="px-6 py-4 text-center">
                    <div class="text-xs font-medium text-gray-600">${s.fechaInicio || s.fechaCarga.split('T')[0]}</div>
                    <div class="text-[10px] text-gray-400 font-bold uppercase">${s.categoria || s.temporada}</div>
                </td>
                <td class="px-6 py-4 text-right">
                    <button onclick="removeSanction('${dni}')" class="text-gray-300 hover:text-red-500 transition-colors p-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.removeSanction = function(dni) {
    if (confirm('¿Seguro que deseas eliminar esta sanción?')) {
        database.ref(`/sanciones/${dni}`).remove()
            .then(() => showToast("Sanción eliminada"))
            .catch(err => showToast("Error al eliminar", true));
    }
};

sanctionForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const dni = selectedDni.value;
    const nombre = selectedName.value;
    const fechas = parseInt(fechasCount.value);
    const temporada = seasonSelect.value;
    const categoria = categorySelect.value;
    const fechaInicio = startDateInput.value;

    if (!dni || !nombre || isNaN(fechas) || !temporada) {
        showToast("Completa todos los campos", true);
        return;
    }

    const sanctionData = {
        dni,
        nombre,
        fechas,
        tipoSancion: currentMode,
        temporada,
        categoria,
        fechaInicio,
        fechaCarga: new Date().toISOString()
    };

    database.ref(`/sanciones/${dni}`).set(sanctionData)
        .then(() => {
            showToast("Sanción registrada correctamente");
            sanctionForm.reset();
            selectedPlayerInfo.classList.add('hidden');
            submitBtn.disabled = true;
            startDateInput.value = hoy.toISOString().split('T')[0];
        })
        .catch(err => {
            console.error(err);
            showToast("Error al guardar en Firebase", true);
        });
});

// Inicialización
auth.onAuthStateChanged(user => {
    if (user) {
        loadAllPlayers();
        loadSeasons();
        loadSanctions();
    } else {
        // Redirigir si no está logueado o manejar sesión de invitado
        auth.signInWithEmailAndPassword("invitado@dsc.com", "invitado123").then(() => {
            loadAllPlayers();
            loadSeasons();
            loadSanctions();
        });
    }
});
