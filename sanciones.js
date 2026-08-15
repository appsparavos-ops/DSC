// Inicializar Firebase (ya con firebaseConfig de firebase-config.js)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const auth = firebase.auth();

// Registrar navegación inmediatamente si ya está logueado o al cambiar
if (typeof AuditLogger !== 'undefined') {
    AuditLogger.logNavigation('revisó la Gestión de Sanciones');
}

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

const IMG_BASE_URL = 'https://raw.githubusercontent.com/appsparavos-ops/DSC/fotos/';

let allPlayers = [];
let activeSanctions = {};
let currentType = 'jugador'; // 'jugador' o 'entrenador'
let currentMode = 'partidos'; // 'partidos' o 'tiempo'
let rostsByTeamSeason = {}; // Cache de rosters por temporada y equipo

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
    
    return Promise.all([p1, p2]).then(snapshots => {
        allPlayers = [];
        // Jugadores
        const jugData = snapshots[0].val();
        if (jugData) {
            allPlayers = allPlayers.concat(Object.keys(jugData).map(dni => ({
                DNI: dni,
                NOMBRE: jugData[dni].datosPersonales?.NOMBRE || 'S/N',
                EQUIPO: jugData[dni].datosPersonales?.EQUIPO || '',
                CATEGORIA: jugData[dni].datosPersonales?.CATEGORIA || '',
                ESTADO_LICENCIA: jugData[dni].datosPersonales?.['ESTADO LICENCIA'] || '',
                TIPO: 'jugador'
            })));
        }
        // Entrenadores
        const entData = snapshots[1].val();
        if (entData) {
            allPlayers = allPlayers.concat(Object.keys(entData).map(dni => ({
                DNI: dni,
                NOMBRE: entData[dni].datosPersonales?.NOMBRE || 'S/N',
                EQUIPO: entData[dni].datosPersonales?.EQUIPO || '',
                CATEGORIA: entData[dni].datosPersonales?.CATEGORIA || '',
                TIPO: 'entrenador'
            })));
        }
        renderSanctions();
    });
}

// Cargar Temporadas
function loadSeasons() {
    database.ref('/temporadas').once('value').then(snapshot => {
        const seasons = snapshot.val();
        if (seasons) {
            const seasonKeys = Object.keys(seasons).sort().reverse();
            seasonKeys.forEach(s => {
                const opt = new Option(s, s);
                seasonSelect.appendChild(opt);
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
    
    // Mostrar foto o inicial
    const photoUrl = `${IMG_BASE_URL}${encodeURIComponent(dni)}.jpg`;
    playerInitial.innerHTML = `<img src="${photoUrl}" class="w-full h-full rounded-full object-cover" onerror="this.onerror=null; this.parentElement.textContent='${nombre.charAt(0).toUpperCase()}'">`;
    
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
        // Log de vista de gestión de sanciones
        AuditLogger.logView('gestion_sanciones');
    });
}

async function renderSanctions() {
    const keys = Object.keys(activeSanctions);
    sanctionCountEl.textContent = `${keys.length} Sancionados`;
    
    if (keys.length === 0) {
        sanctionsList.innerHTML = '<tr><td colspan="4" class="px-6 py-12 text-center text-gray-400">No hay sanciones activas registradas</td></tr>';
        return;
    }

    if (allPlayers.length === 0) {
        sanctionsList.innerHTML = '<tr><td colspan="4" class="px-6 py-12 text-center text-gray-400">Cargando detalles de jugadores...</td></tr>';
        return;
    }

    // Preparar contenido
    sanctionsList.innerHTML = '<tr><td colspan="4" class="px-6 py-12 text-center text-gray-400">Cargando fechas de sanciones...</td></tr>';
    
    const renderPromises = keys.sort((a,b) => (activeSanctions[b].fechaCarga || "").localeCompare(activeSanctions[a].fechaCarga || "")).map(async dni => {
        const s = activeSanctions[dni];
        const initial = (s.nombre || '?').charAt(0).toUpperCase();
        const photoUrl = `${IMG_BASE_URL}${encodeURIComponent(dni)}.jpg`;
        
        let fulfilledDates = [];
        let remaining = parseInt(s.fechas);
        let statusHtml = '';
        
        if (s.tipoSancion !== 'tiempo') {
            // EQUIPO y CATEGORIA del jugador NO están en datosPersonales, sino en registrosPorTemporada.
            // Los buscamos directamente para la temporada de la sanción.
            let equipo = '';
            let categoria = s.categoria || ''; // Fallback: categoría de la sanción (para entrenadores)

            try {
                const seasonSnap = await database.ref(`/registrosPorTemporada/${s.temporada}`).orderByChild('_dni').equalTo(dni).once('value');
                if (!seasonSnap.exists()) {
                    // Intentar también por campo DNI mayúscula
                    const seasonSnap2 = await database.ref(`/registrosPorTemporada/${s.temporada}`).orderByChild('DNI').equalTo(dni).once('value');
                    if (seasonSnap2.exists()) {
                        const record = Object.values(seasonSnap2.val())[0];
                        equipo = record.EQUIPO || '';
                        categoria = record.CATEGORIA || s.categoria || '';
                    }
                } else {
                    const record = Object.values(seasonSnap.val())[0];
                    equipo = record.EQUIPO || '';
                    categoria = record.CATEGORIA || s.categoria || '';
                }
            } catch(e) {
                console.error('Error buscando registro de temporada para DNI ' + dni + ':', e);
            }


            const playerInfo = allPlayers.find(p => p.DNI === dni);
            const isCoach = playerInfo && playerInfo.TIPO === 'entrenador';

            if (equipo && s.temporada) {
                const teamKey = `${s.temporada}_${equipo}`;
                if (!rostsByTeamSeason[teamKey]) {
                    try {
                        const snap = await database.ref(`/rosters/${s.temporada}/${equipo}`).once('value');
                        rostsByTeamSeason[teamKey] = snap.val() || {};
                    } catch(e) {
                        rostsByTeamSeason[teamKey] = {};
                    }
                }

                const playedMatches = rostsByTeamSeason[teamKey];
                const startDate = new Date(s.fechaInicio + 'T00:00:00');
                const currentDate = new Date();

                const isFUBBInvalid = playerInfo?.ESTADO_LICENCIA && playerInfo.ESTADO_LICENCIA.trim().toUpperCase() !== 'DILIGENCIADO';

                Object.keys(playedMatches).forEach(mmdd => {
                    const yearStr = s.temporada.includes('-') ? s.temporada.split('-')[0] : s.temporada;
                    const mpDate = new Date(parseInt(yearStr), parseInt(mmdd.substring(0, 2)) - 1, parseInt(mmdd.substring(2, 4)));

                    if (mpDate >= startDate && mpDate <= currentDate) {
                        const rostersOnDate = playedMatches[mmdd];
                        if (categoria && rostersOnDate[categoria]) {
                            if (isCoach) {
                                fulfilledDates.push(`${mpDate.getDate().toString().padStart(2, '0')}/${(mpDate.getMonth()+1).toString().padStart(2, '0')}/${mpDate.getFullYear()}`);
                            } else {
                                if (!isFUBBInvalid) {
                                    fulfilledDates.push(`${mpDate.getDate().toString().padStart(2, '0')}/${(mpDate.getMonth()+1).toString().padStart(2, '0')}/${mpDate.getFullYear()}`);
                                }
                            }
                        }
                    }
                });

                fulfilledDates.sort((a,b) => {
                    const partsA = a.split('/');
                    const partsB = b.split('/');
                    return new Date(partsA[2], partsA[1]-1, partsA[0]) - new Date(partsB[2], partsB[1]-1, partsB[0]);
                });

                remaining = Math.max(0, remaining - fulfilledDates.length);
            }
            
            if (fulfilledDates.length > 0) {
                statusHtml = `
                    <div class="mt-2 text-[11px] text-left">
                        <span class="text-green-600 font-bold">Cumplidos (${fulfilledDates.length}):</span> 
                        <span class="text-gray-600 font-medium">${fulfilledDates.join(', ')}</span>
                    </div>
                    <div class="text-[11px] text-gray-500 font-bold uppercase mt-1">Restan: ${remaining}</div>
                `;
            } else {
                statusHtml = `<div class="text-[11px] text-gray-500 font-bold uppercase mt-1">Restan: ${remaining}</div>`;
            }
        } else {
            // Lógica de tiempo
            const startDate = new Date(s.fechaInicio + 'T00:00:00');
            const expirationDate = new Date(startDate);
            expirationDate.setDate(expirationDate.getDate() + parseInt(s.fechas));
            const currentDate = new Date();
            
            if (currentDate >= expirationDate) {
                statusHtml = `<div class="text-[11px] text-green-600 font-bold uppercase mt-1">Cumplida el ${expirationDate.toLocaleDateString()}</div>`;
            } else {
                const diffTime = Math.abs(expirationDate - currentDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                statusHtml = `<div class="text-[11px] text-gray-500 font-bold uppercase mt-1">Restan: ${diffDays} días (hasta ${expirationDate.toLocaleDateString()})</div>`;
            }
        }

        return `
            <tr class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-xs overflow-hidden border border-red-200">
                            <img src="${photoUrl}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.parentElement.innerHTML='<span class=\'text-red-700\'>${initial}</span>'">
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
                    ${statusHtml}
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
    });
    
    const htmlArr = await Promise.all(renderPromises);
    sanctionsList.innerHTML = htmlArr.join('');
}

window.removeSanction = function(dni) {
    if (confirm('¿Seguro que deseas eliminar esta sanción?')) {
        const sanctionToDelete = activeSanctions[dni];
        database.ref(`/sanciones/${dni}`).remove()
            .then(() => {
                showToast("Sanción eliminada");
                AuditLogger.log(`eliminó la sanción de ${sanctionToDelete.nombre || dni}`, { 
                    dni: dni, 
                    datosAnteriores: sanctionToDelete 
                });
            })
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
            AuditLogger.log(`registró una sanción para ${nombre}`, sanctionData);
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
        // Primero cargamos jugadores, y cuando terminan, cargamos sanciones
        loadAllPlayers().then(() => {
            loadSanctions();
        });
        loadSeasons();
    } else {
        // Redirigir si no está logueado o manejar sesión de invitado
        auth.signInWithEmailAndPassword("invitado@dsc.com", "invitado123").then(() => {
            loadAllPlayers().then(() => {
                loadSanctions();
            });
            loadSeasons();
        });
    }
});
