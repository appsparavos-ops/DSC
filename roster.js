const firebaseConfig = {
    apiKey: "AIzaSyANWXQvhHpF0LCYjz4AXi3MkcP798PqRfA",
    authDomain: "dsc24-aa5a1.firebaseapp.com",
    databaseURL: "https://dsc24-aa5a1-default-rtdb.firebaseio.com",
    projectId: "dsc24-aa5a1",
    storageBucket: "dsc24-aa5a1.appspot.com",
    messagingSenderId: "798100493177",
    appId: "1:798100493177:web:8e2ae324f8b5cb893a55a8"
};

const IMG_BASE_URL = 'https://raw.githubusercontent.com/appsparavos-ops/DSC/fotos/';
const PLACEHOLDER_SVG_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2EwYTBhMCI+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OS00IDQgNHptMCAyYy0yLjY3IDAtOCA0IDQgNHYyYzAgMS4xLjkgMiAyIDJoMTRjMS4xIDAgMi0uOSAyLTJ2LTJjMC0yLjY2LTUuMzMtNC04LTR6Ii8+PC9zdmc+';

// Inicializar Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const auth = firebase.auth();

const GUEST_EMAIL = "invitado@dsc.com";
const GUEST_PW = "invitado123";

// Elementos del DOM
const seasonSelect = document.getElementById('seasonSelect');
const teamSelect = document.getElementById('teamSelect');
const categorySelect = document.getElementById('categorySelect');
const dateSelect = document.getElementById('dateSelect');
const rosterContainer = document.getElementById('rosterContainer');
const emptyState = document.getElementById('emptyState');
const playersTableBody = document.getElementById('playersTableBody');
const selectedCountEl = document.getElementById('selectedCount');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toastText');

const authorizedSection = document.getElementById('authorizedSection');
const authorizedCountEl = document.getElementById('authorizedCount');
const authorizedList = document.getElementById('authorizedList');
const authorizedTableBody = document.getElementById('authorizedTableBody');
const authorizedChevron = document.getElementById('authorizedChevron');

const coachesSection = document.getElementById('coachesSection');
const coachesCountEl = document.getElementById('coachesCount');
const coachesList = document.getElementById('coachesList');
const coachesTableBody = document.getElementById('coachesTableBody');
const coachesChevron = document.getElementById('coachesChevron');

let allPlayers = [];
let rosterData = { jugadores: {} };
let rosterRef = null;
let currentSeasonListener = null;
let rosterViewMode = 'all-alpha'; // 'selected-num', 'selected-alpha', 'all-alpha'
let playerSanctions = {};
let playedMatchesList = {}; // { mmdd: [categories] }

// Inicializar fecha con hoy
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
dateSelect.value = `${yyyy}-${mm}-${dd}`;

const categoryRules = {
    'U11 Mixta': { min: 9, max: 12 },
    'U12 Mixta': { min: 10, max: 12 },
    'U14 Masculino': { min: 10, max: 12 },
    'U16 Masculino': { min: 5, max: 12 },
    'U18 Masculino': { min: 5, max: 12 },
    'U20 Masculino': { min: 5, max: 12 },
    'U11 Femenino': { min: 8, max: 12 },
    'U12 Femenino': { min: 8, max: 12 },
    'U14 Femenino': { min: 5, max: 12 },
    'U16 Femenino': { min: 5, max: 12 },
    'U19 Femenino': { min: 5, max: 12 }
};

function normalizeCategory(cat) {
    if (!cat) return "";
    return cat.trim().replace(/ Femenina$/, ' Femenino');
}

// Helpers
function parseDateDDMMYYYY(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(p => parseInt(p, 10));
    if (isNaN(day) || isNaN(month) || isNaN(year) || year < 1900) return null;
    return new Date(year, month - 1, day);
}

function showToast(message, type = 'info') {
    if (!toast || !toastText) return;
    toastText.textContent = message;
    toast.classList.remove('translate-y-24', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    const bgColor = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-gray-900';
    toast.firstElementChild.className = `${bgColor} text-white px-8 py-4 rounded-2xl shadow-2xl font-semibold flex items-center gap-3`;
    setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3000);
}

// Autenticación
// Cargar Sanciones
function loadSanctions() {
    database.ref('/sanciones').on('value', snapshot => {
        playerSanctions = snapshot.val() || {};
        renderPlayers();
    });
}

// Cargar Historial de Partidos del Equipo
function loadTeamHistory() {
    const season = seasonSelect.value;
    const team = teamSelect.value;
    if (!season || !team) {
        playedMatchesList = {};
        return;
    }
    database.ref(`/rosters/${season}/${team}`).once('value').then(snapshot => {
        playedMatchesList = snapshot.val() || {};
        renderPlayers();
    });
}

function signInGuest() {
    auth.signInWithEmailAndPassword(GUEST_EMAIL, GUEST_PW)
        .catch(err => {
            console.error("Error Auth:", err);
            showToast("Error de conexión con el servidor", "error");
        });
}

function handlePostLogin(user) {
    if (!user) return;
    
    const uid = user.uid;
    const isGuest = user.email === GUEST_EMAIL;

    // Mostrar botón de regreso si no es invitado
    const backBtn = document.getElementById('backToMaintenance');
    const guestExitBtn = document.getElementById('guestExitBtn');

    if (backBtn && !isGuest) {
        backBtn.classList.remove('hidden');
    }

    if (guestExitBtn && isGuest) {
        guestExitBtn.classList.remove('hidden');
        guestExitBtn.onclick = () => {
            auth.signOut().then(() => {
                window.close();
                setTimeout(() => {
                    window.location.href = 'about:blank';
                }, 500);
            });
        };
    }

    // Buscar última temporada seleccionada
    database.ref(`preferenciasUsuarios/${uid}/ultimaTemporadaSeleccionada`).once('value')
        .then(snapshot => {
            const lastSeason = snapshot.val();
            loadSeasons(lastSeason);
        })
        .catch(() => loadSeasons());
}

// Inicialización de sesión
auth.onAuthStateChanged((user) => {
    if (user) {
        // Si ya hay usuario, verificamos si es el invitado o uno real
        handlePostLogin(user);
    } else {
        // Si no hay nada, logueamos como invitado por defecto
        signInGuest();
    }
});

// Cargar Temporadas
function loadSeasons(lastSeason = null) {
    database.ref('/temporadas').once('value').then(snapshot => {
        seasonSelect.innerHTML = '<option value="">Selecciona temporada</option>';
        const seasons = snapshot.val();
        if (seasons) {
            const seasonKeys = Object.keys(seasons).sort().reverse();
            seasonKeys.forEach(s => {
                seasonSelect.appendChild(new Option(s, s));
            });

            // Aplicar preferencia si existe
            if (lastSeason && seasonKeys.includes(lastSeason)) {
                seasonSelect.value = lastSeason;
                loadPlayers(lastSeason);
                setupRosterSync();
            }
        }
    });
}

// Cargar Jugadores
function loadPlayers(temporada) {
    if (!temporada) {
        allPlayers = [];
        populateFilters();
        return;
    }
    if (currentSeasonListener) currentSeasonListener.off();

    currentSeasonListener = database.ref('/registrosPorTemporada/' + temporada);
    currentSeasonListener.on('value', snapshot => {
        if (!snapshot.exists()) {
            allPlayers = [];
            populateFilters();
            return;
        }

        const recordsArray = Object.values(snapshot.val());
        const DNIyTipo = new Set(recordsArray.map(r => {
            const rawTipo = String(r._tipo || "").toLowerCase();
            const rawTIPO = String(r.TIPO || "").toLowerCase();
            // Si cualquiera dice jugador, es jugador (prioridad por Arturo)
            const node = (rawTipo.includes("jugador") || rawTIPO.includes("jugador")) ? "jugadores" : "entrenadores";
            const dni = String(r._dni || r.DNI || "");
            return `${node}|${dni}`;
        }));

        const promises = Array.from(DNIyTipo).map(item => {
            const [node, dni] = item.split('|');
            return database.ref(`/${node}/${dni}/datosPersonales`).once('value');
        });

        Promise.all(promises).then(snapshots => {
            const datosPersonalesMap = new Map();
            const dniTipoArray = Array.from(DNIyTipo);

            snapshots.forEach((snap, index) => {
                const dni = dniTipoArray[index].split('|')[1];
                if (snap.exists()) {
                    datosPersonalesMap.set(String(dni), snap.val());
                }
            });

            allPlayers = recordsArray.map(record => {
                const dni = String(record._dni || record.DNI || "");
                const personalData = datosPersonalesMap.get(dni) || {};

                // CAMBIO CLAVE: Prioridad a 'record' (temporada) sobre 'personalData'
                const combined = { ...personalData, ...record };

                // Fuente de la verdad MÉDICA: estrictamente de datosPersonales per Arturo
                if (personalData['FM Hasta'] !== undefined) combined['FM Hasta'] = personalData['FM Hasta'];
                if (personalData['FM Desde'] !== undefined) combined['FM Desde'] = personalData['FM Desde'];

                // Normalizaciones tecnicas (Deteccion robusta de tipo para el objeto final)
                const rawTipo = String(record._tipo || "").toLowerCase();
                const rawTIPO = String(record.TIPO || "").toLowerCase();
                combined._tipo = (rawTipo.includes("jugador") || rawTIPO.includes("jugador")) ? "jugadores" : "entrenadores";

                combined.DNI = dni;
                combined.NOMBRE = personalData.NOMBRE || record.NOMBRE || 'N/N';
                combined.NUMERO_TEMPORADA = record.Numero || record.NUMERO || record['Nº'] || "";
                combined.esAutorizado = record.esAutorizado === true || String(record.esAutorizado).toLowerCase() === 'true';
                combined.categoriasAutorizadas = record.categoriasAutorizadas || [];

                return combined;
            }).filter(p => p._tipo === "jugadores" || p._tipo === "entrenadores");

            populateFilters();
            renderPlayers();
        });
    });
}

function populateFilters() {
    const teams = [...new Set(allPlayers.map(p => p.EQUIPO).filter(Boolean))].sort();
    const currentTeam = teamSelect.value;
    const currentCat = categorySelect.value;

    teamSelect.innerHTML = '<option value="">Selecciona equipo</option>';
    teams.forEach(t => teamSelect.appendChild(new Option(t, t)));
    if (teams.includes(currentTeam)) teamSelect.value = currentTeam;

    let playersForCategories = allPlayers;
    if (teamSelect.value) {
        playersForCategories = allPlayers.filter(p => String(p.EQUIPO || "").trim() === String(teamSelect.value).trim());
    }

    const categoriesSet = new Set();
    playersForCategories.forEach(p => {
        const cats = [p.CATEGORIA, p.categoriaOrigen, ...(p.categoriasAutorizadas || [])].filter(Boolean);
        cats.forEach(cat => categoriesSet.add(String(cat).trim()));
    });

    const categories = Array.from(categoriesSet).sort();
    categorySelect.innerHTML = '<option value="">Selecciona categoría</option>';
    categories.forEach(c => categorySelect.appendChild(new Option(c, c)));
    if (categories.includes(currentCat)) categorySelect.value = currentCat;
}

// Sincronización de Roster
function setupRosterSync() {
    const season = seasonSelect.value;
    const team = teamSelect.value;
    const dateVal = dateSelect.value;
    const category = categorySelect.value;

    if (!season || !team || !dateVal || !category) {
        rosterContainer.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    // Formatear fecha a mmdd para la ruta de Firebase
    const dateParts = dateVal.split('-');
    const mmdd = dateParts[1] + dateParts[2];

    if (rosterRef) rosterRef.off();

    rosterContainer.classList.remove('hidden');
    emptyState.classList.add('hidden');
    renderPlayers();

    rosterRef = database.ref('/rosters').child(season).child(team).child(mmdd).child(category);

    rosterRef.on('value', snapshot => {
        const val = snapshot.val();
        rosterData = val || { jugadores: {}, staff: {} };
        if (!rosterData.jugadores) rosterData.jugadores = {};
        if (!rosterData.staff) rosterData.staff = {};
        renderPlayers();
    }, err => {
        console.error("Error Roster:", err);
        showToast("Error de permisos en Firebase", "error");
    });
}

function renderPlayers() {
    const team = teamSelect.value;
    const category = categorySelect.value;

    if (!team || !category) {
        playersTableBody.innerHTML = '';
        authorizedSection.classList.add('hidden');
        return;
    }

    // Asegurarnos de tener el historial antes de renderizar si es posible
    if (Object.keys(playedMatchesList).length === 0) {
        loadTeamHistory();
    }

    const selTeam = String(team).trim();
    const selCat = String(category).trim();

    const filtered = allPlayers.filter(p => {
        const pEquipo = String(p.EQUIPO || "").trim();
        const pCategoria = String(p.CATEGORIA || "").trim();
        const pAuthArr = p.categoriasAutorizadas || [];
        const isAuthFlag = p.esAutorizado === true || String(p.esAutorizado).toLowerCase() === 'true';

        // Lógica de filtrado: El jugador debe ser del equipo seleccionado
        if (pEquipo !== selTeam) return false;

        // Y debe pertenecer a la categoria (directo o autorizado)
        const matchesMainCat = pCategoria === selCat;
        const matchesAuthArr = pAuthArr.some(c => String(c).trim() === selCat);
        const matchesAuthFlag = isAuthFlag && pCategoria === selCat;

        return matchesMainCat || matchesAuthArr || matchesAuthFlag;
    }).sort((a, b) => {
        if (rosterViewMode === 'selected-num') {
            const entryA = (rosterData.jugadores && rosterData.jugadores[a.DNI]) || { numero: "" };
            const entryB = (rosterData.jugadores && rosterData.jugadores[b.DNI]) || { numero: "" };
            const numA = entryA.numero || a.NUMERO_TEMPORADA || "";
            const numB = entryB.numero || b.NUMERO_TEMPORADA || "";

            if (numA !== "" && numB !== "") return parseInt(numA, 10) - parseInt(numB, 10);
            if (numA !== "") return -1;
            if (numB !== "") return 1;
        }
        return (a.NOMBRE || '').localeCompare(b.NOMBRE || '');
    });

    // Separar por TIPO: Jugadores vs Entrenadores
    const coaches = filtered.filter(p => p._tipo === 'entrenadores');
    const players = filtered.filter(p => p._tipo === 'jugadores');

    // Separar Titulares de Autorizados (Refuerzos)
    const regulars = players.filter(p => {
        const pCat = String(p.CATEGORIA || "").trim();
        const isAuth = p.esAutorizado === true || String(p.esAutorizado).toLowerCase() === 'true';
        return pCat === selCat && !isAuth;
    });

    const authorized = players.filter(p => {
        const pCat = String(p.CATEGORIA || "").trim();
        const isAuth = p.esAutorizado === true || String(p.esAutorizado).toLowerCase() === 'true';

        // El mismo chequeo que en app.js (lineas ~876-878)
        const isSameSeasonAuth = p.categoriasAutorizadas && p.categoriasAutorizadas.some(cat => String(cat).trim() === selCat) && pCat !== selCat;
        const isCrossSeasonAuth = isAuth && pCat === selCat;

        return isSameSeasonAuth || isCrossSeasonAuth;
    });

    // Identificar números duplicados entre los seleccionados
    const counts = {};
    // Necesitamos mapear los números reales que se están mostrando para cada jugador seleccionado
    players.forEach(p => {
        const dni = String(p.DNI);
        const rosterEntry = (rosterData.jugadores && rosterData.jugadores[dni]) || { seleccionado: false, numero: "" };

        if (rosterEntry.seleccionado) {
            const finalNum = String(rosterEntry.numero || p.NUMERO_TEMPORADA || "").trim();
            if (finalNum !== "") {
                counts[finalNum] = (counts[finalNum] || 0) + 1;
            }
        }
    });
    const duplicateNumbers = Object.keys(counts).filter(num => counts[num] > 1);

    // Renderizar Entrenadores
    coachesTableBody.innerHTML = '';
    coachesSection.classList.remove('hidden');
    let coachSelectedCount = 0;
    
    // Obtener staff seleccionado y ordenar por timestamp
    const selectedStaff = Object.entries(rosterData.staff || {})
        .filter(([_, data]) => data.seleccionado)
        .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
    
    const staffRoles = {};
    selectedStaff.forEach(([dni, _], index) => {
        if (index === 0) staffRoles[dni] = "HC";
        else if (index === 1) staffRoles[dni] = "AC";
        else staffRoles[dni] = "Staff";
    });

    if (coaches.length > 0) {
        coaches.forEach(p => {
            const role = staffRoles[p.DNI] || "";
            const tr = createPlayerRow(p, [], role);
            coachesTableBody.appendChild(tr);
            if (tr.dataset.seleccionado === 'true') coachSelectedCount++;
        });
    } else {
        coachesTableBody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400 text-sm">No hay entrenadores registrados para este equipo/categoría</td></tr>';
    }
    coachesCountEl.textContent = `${coachSelectedCount} Entrenadores seleccionados`;

    // Renderizar Titulares
    playersTableBody.innerHTML = '';
    let count = 0;

    if (regulars.length === 0 && authorized.length === 0) {
        playersTableBody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-gray-400">No se encontraron jugadores en esta categoría</td></tr>';
        authorizedSection.classList.add('hidden');
        return;
    }

    regulars.forEach(p => {
        const tr = createPlayerRow(p, duplicateNumbers);
        playersTableBody.appendChild(tr);
        if (tr.dataset.seleccionado === 'true') count++;
    });

    // Renderizar Autorizados
    authorizedTableBody.innerHTML = '';
    authorizedSection.classList.remove('hidden');
    authorizedCountEl.textContent = `${authorized.length} Jugadores autorizados`;

    if (authorized.length > 0) {
        authorized.forEach(p => {
            const tr = createPlayerRow(p, duplicateNumbers);
            authorizedTableBody.appendChild(tr);
            if (tr.dataset.seleccionado === 'true') count++;
        });
    } else {
        authorizedTableBody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400 text-sm">No hay refuerzos autorizados para esta categoría</td></tr>';
    }

    selectedCountEl.textContent = `${count} Seleccionados`;

    // Aplicar reglas de color por categoría
    const normalizedCat = normalizeCategory(category);
    const rule = categoryRules[normalizedCat];

    selectedCountEl.classList.remove('bg-green-600', 'bg-red-600', 'bg-blue-600');
    if (rule) {
        if (count >= rule.min && count <= rule.max) {
            selectedCountEl.classList.add('bg-green-600');
        } else {
            selectedCountEl.classList.add('bg-red-600');
        }
    } else {
        selectedCountEl.classList.add('bg-blue-600');
    }

    // Feedback visual del modo de vista
    if (rosterViewMode === 'selected-num') {
        selectedCountEl.innerHTML = `📌 ${count} Seleccionados (Nº)`;
        selectedCountEl.classList.add('ring-2', 'ring-white');
    } else if (rosterViewMode === 'selected-alpha') {
        selectedCountEl.innerHTML = `🔤 ${count} Seleccionados (A-Z)`;
        selectedCountEl.classList.add('ring-2', 'ring-white');
    } else {
        selectedCountEl.innerHTML = `${count} Seleccionados`;
        selectedCountEl.classList.remove('ring-2', 'ring-white');
    }
}

function createPlayerRow(p, duplicateNumbers = [], coachRole = "") {
    const dni = String(p.DNI);
    const isCoach = p._tipo === 'entrenadores';
    const node = isCoach ? 'staff' : 'jugadores';
    
    const rosterEntry = (rosterData[node] && rosterData[node][dni]) || { seleccionado: false, numero: "" };

    const numeroAMostrar = coachRole || rosterEntry.numero || p.NUMERO_TEMPORADA || "";

    const expDate = parseDateDDMMYYYY(p['FM Hasta']);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isExpired = !expDate || expDate < today;

    // Validación de Licencia FUBB
    const estadoLicencia = String(p['ESTADO LICENCIA'] || '').trim().toUpperCase();
    const isFUBBInvalid = estadoLicencia !== 'DILIGENCIADO';

    // Verificación de Sanciones
    const sanction = playerSanctions[dni];
    let isSancionado = false;
    let fechasRestantes = 0;

    if (sanction) {
        const totalValue = parseInt(sanction.fechas);
        const startDate = new Date(sanction.fechaInicio + 'T00:00:00');
        const currentDateStr = dateSelect.value;
        const currentDate = new Date(currentDateStr + 'T00:00:00');
        const selCat = String(categorySelect.value).trim();
        const sanctionCat = String(sanction.categoria || "").trim();

        if (sanction.tipoSancion === 'tiempo') {
            // Sanción por Tiempo (Días)
            const expirationDate = new Date(startDate);
            expirationDate.setDate(expirationDate.getDate() + totalValue);
            
            if (currentDate >= startDate && currentDate < expirationDate) {
                 // Verificar categoría si es entrenador
                 if (isCoach && sanctionCat && sanctionCat !== selCat) {
                     isSancionado = false;
                 } else {
                     isSancionado = true;
                     fechasRestantes = Math.ceil((expirationDate - currentDate) / (1000 * 60 * 60 * 24));
                 }
            }
        } else {
            // Sanción por Partidos (Comportamiento original)
            let fechasCumplidas = 0;
            const seasonVal = seasonSelect.value;

            Object.keys(playedMatchesList).forEach(mmdd => {
                const yearStr = seasonVal.includes('-') ? seasonVal.split('-')[0] : seasonVal;
                const matchDate = new Date(parseInt(yearStr), parseInt(mmdd.substring(0, 2)) - 1, parseInt(mmdd.substring(2, 4)));
                if (matchDate >= startDate && matchDate < currentDate) {
                    const rostersOnDate = playedMatchesList[mmdd];
                    if (rostersOnDate && rostersOnDate[selCat]) {
                        if (!isFUBBInvalid) fechasCumplidas++;
                    }
                }
            });

            fechasRestantes = totalValue - fechasCumplidas;
            if (fechasRestantes > 0) {
                if (isCoach && sanctionCat && sanctionCat !== selCat) {
                    isSancionado = false;
                } else {
                    isSancionado = true;
                }
            }
        }
    }

    // Lógica avanzada de colores para FM
    const season = seasonSelect.value;
    let tournamentEndDate = null;
    if (season && season.includes('-')) {
        const years = season.split('-').map(y => y.trim());
        const lastYear = years[years.length - 1];
        tournamentEndDate = new Date(parseInt(lastYear), 5, 30);
    } else if (season) {
        const year = parseInt(season);
        tournamentEndDate = new Date(year, 11, 25);
    }

    let fmColorClass = 'bg-white text-black border border-gray-200 font-bold px-2 py-1 rounded-lg shadow-sm';

    if (isExpired) {
        fmColorClass = 'bg-red-800 text-white font-bold px-2 py-1 rounded-lg shadow-sm';
    } else if (tournamentEndDate && expDate > tournamentEndDate) {
        fmColorClass = 'bg-green-600 text-white font-bold px-2 py-1 rounded-lg shadow-sm';
    } else {
        const thirtyDays = new Date(today); thirtyDays.setDate(today.getDate() + 30);
        const sixtyDays = new Date(today); sixtyDays.setDate(today.getDate() + 60);

        if (expDate <= thirtyDays) {
            fmColorClass = 'bg-orange-500 text-black font-bold px-2 py-1 rounded-lg shadow-sm';
        } else if (expDate <= sixtyDays) {
            fmColorClass = 'bg-yellow-200 text-black font-bold px-2 py-1 rounded-lg shadow-sm';
        }
    }

    const isConflict = rosterEntry.seleccionado && numeroAMostrar && duplicateNumbers.includes(String(numeroAMostrar).trim());
    const inputStyle = isConflict ? 'border-red-500 bg-red-50 focus:ring-red-500/20' : 'border-gray-200 focus:ring-blue-500/20';

    // Ficha médica no es requerida para entrenadores
    const needsFM = !isCoach;
    const isDisabled = (needsFM && isExpired) || isFUBBInvalid || isSancionado;
    
    let disabledText = (needsFM && isExpired) ? 'FICHA MEDICA' : 'FUBB (No Hab.)';
    if (isSancionado) {
        const unit = (sanction && sanction.tipoSancion === 'tiempo') ? ' días' : ' fechas';
        disabledText = `Sanción (${fechasRestantes}${unit})`;
    }

    const tr = document.createElement('tr');
    tr.className = `player-row border-b border-gray-50 ${rosterEntry.seleccionado ? 'selected-row' : ''}`;
    tr.dataset.seleccionado = rosterEntry.seleccionado;
    tr.innerHTML = `
        <td class="px-6 py-4">
            <div class="flex items-center gap-3">
                <div class="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-white border border-gray-200">
                    <img src="${IMG_BASE_URL}${dni}.jpg" 
                         alt="${p.NOMBRE}" 
                         class="w-full h-full object-cover"
                         onerror="this.onerror=null; this.src='${PLACEHOLDER_SVG_URL}';">
                </div>
                <div>
                    <div class="font-semibold text-gray-800">${p.NOMBRE || 'N/N'}</div>
                    ${isFUBBInvalid ? `<div class="text-[10px] text-red-500 font-bold uppercase mt-0.5">${estadoLicencia || 'SIN LICENCIA'}</div>` : ''}
                </div>
            </div>
        </td>
        <td class="px-4 py-4 text-center">
            ${isCoach ? '' : `
                <span class="text-[11px] inline-block min-w-[80px] ${fmColorClass}">${p['FM Hasta'] || 'SIN FICHA'}</span>
            `}
        </td>
        <td class="px-4 py-4 text-center">
            <div class="relative inline-block pb-1">
                ${isCoach ? `
                    ${coachRole ? `
                        <span class="inline-block bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-lg border border-blue-200">
                            ${coachRole}
                        </span>
                    ` : ''}
                ` : `
                    <input type="text" value="${numeroAMostrar}" 
                        class="w-12 text-center border ${inputStyle} rounded-xl py-2 font-bold text-blue-900 outline-none transition-all shadow-sm"
                        onchange="updateNumber('${dni}', this.value)"
                        ${isDisabled ? 'disabled' : ''}>
                    ${isConflict ? `
                        <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[9px] text-red-600 font-bold whitespace-nowrap bg-white px-1">
                            Número Repetido
                        </div>
                    ` : ''}
                `}
            </div>
        </td>
        <td class="px-6 py-4 text-right">
            ${isDisabled ? `
                <span class="text-[10px] bg-red-100 text-red-600 px-3 py-1.5 rounded-full font-bold uppercase tracking-wider">${disabledText}</span>
            ` : `
                <input type="checkbox" ${rosterEntry.seleccionado ? 'checked' : ''} 
                    class="w-6 h-6 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer shadow-sm"
                    onchange="toggleSelection('${dni}', this.checked, '${p.NOMBRE.replace(/'/g, "\\'")}')">
            `}
        </td>
    `;
    return tr;
}

window.toggleAuthorizedList = function () {
    const isHidden = authorizedList.classList.contains('hidden');
    if (isHidden) {
        authorizedList.classList.remove('hidden');
        authorizedChevron.classList.add('rotate-180');
    } else {
        authorizedList.classList.add('hidden');
        authorizedChevron.classList.remove('rotate-180');
    }
};

window.toggleCoachesList = function () {
    const isHidden = coachesList.classList.contains('hidden');
    if (isHidden) {
        coachesList.classList.remove('hidden');
        coachesChevron.classList.add('rotate-180');
    } else {
        coachesList.classList.add('hidden');
        coachesChevron.classList.remove('rotate-180');
    }
};

window.toggleSelection = function (dni, isChecked, nombre) {
    if (!rosterRef) return;
    
    // Buscar si es un entrenador en allPlayers
    const person = allPlayers.find(p => String(p.DNI) === String(dni));
    const isCoach = person && person._tipo === 'entrenadores';
    const node = isCoach ? 'staff' : 'jugadores';

    const update = { [`${node}/${dni}/seleccionado`]: isChecked };
    if (isChecked) {
        update[`${node}/${dni}/nombre`] = nombre || "";
        if (isCoach) {
            update[`${node}/${dni}/timestamp`] = Date.now();
        }
    } else if (!isCoach) {
        update[`${node}/${dni}/numero`] = "";
    }
    
    rosterRef.update(update).then(() => {
        showToast(isCoach ? (isChecked ? "Staff agregado" : "Staff removido") : (isChecked ? "Jugador agregado" : "Jugador removido"));
    }).catch(err => {
        console.error("Error Selección:", err);
        showToast("Error al actualizar roster", "error");
    });
};

window.updateNumber = function (dni, number) {
    if (!rosterRef) return;
    const normalizedNum = number.trim();
    rosterRef.child(`jugadores/${dni}`).update({ numero: normalizedNum });
};

window.cycleViewMode = function () {
    if (rosterViewMode === 'all-alpha') rosterViewMode = 'selected-num';
    else if (rosterViewMode === 'selected-num') rosterViewMode = 'selected-alpha';
    else rosterViewMode = 'all-alpha';

    renderPlayers();
    showToast(`Vista: ${rosterViewMode === 'selected-num' ? 'Seleccionados por Número' :
        rosterViewMode === 'selected-alpha' ? 'Seleccionados por Nombre' :
            'Todos por Nombre'}`);
};

seasonSelect.addEventListener('change', () => {
    rosterViewMode = 'all-alpha';
    const season = seasonSelect.value;
    loadPlayers(season);
    setupRosterSync();

    // Guardar preferencia
    const user = auth.currentUser;
    if (user && season) {
        database.ref(`preferenciasUsuarios/${user.uid}`).update({
            ultimaTemporadaSeleccionada: season
        });
    }
});
teamSelect.addEventListener('change', () => {
    rosterViewMode = 'all-alpha';
    populateFilters();
    loadTeamHistory();
    setupRosterSync();
});
dateSelect.addEventListener('change', () => {
    rosterViewMode = 'all-alpha';
    loadTeamHistory();
    setupRosterSync();
});
categorySelect.addEventListener('change', () => {
    rosterViewMode = 'all-alpha';
    setupRosterSync();
});

// Helpers
function parseDateDDMMYYYY(dateStr) {
    if (!dateStr || dateStr === '1/1/1900') return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

// Eliminamos la llamada directa a signInGuest() al final porque ahora usamos onAuthStateChanged
loadSanctions();
