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

let allPlayers = [];
let rosterData = { jugadores: {} };
let rosterRef = null;
let currentSeasonListener = null;

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
function signInGuest() {
    auth.signInWithEmailAndPassword(GUEST_EMAIL, GUEST_PW)
        .then((result) => {
            const uid = result.user.uid;
            // Buscar última temporada seleccionada
            database.ref(`preferenciasUsuarios/${uid}/ultimaTemporadaSeleccionada`).once('value')
                .then(snapshot => {
                    const lastSeason = snapshot.val();
                    loadSeasons(lastSeason);
                });
        })
        .catch(err => {
            console.error("Error Auth:", err);
            showToast("Error de conexión con el servidor", "error");
        });
}

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
        const DNIyTipo = new Set(recordsArray.map(r => `${r._tipo}|${r._dni}`));

        const promises = Array.from(DNIyTipo).map(item => {
            const [tipo, dni] = item.split('|');
            return database.ref(`/${tipo}/${dni}/datosPersonales`).once('value');
        });

        Promise.all(promises).then(snapshots => {
            const datosPersonalesMap = new Map();
            const dniTipoArray = Array.from(DNIyTipo);

            snapshots.forEach((snap, index) => {
                if (snap.exists()) {
                    const dni = dniTipoArray[index].split('|')[1];
                    datosPersonalesMap.set(String(dni), snap.val());
                }
            });

            allPlayers = recordsArray.filter(r => {
                const tipo = String(r._tipo || "").toLowerCase();
                return tipo.includes("jugador");
            }).map(record => {
                const dniKey = String(record._dni);
                const personalData = datosPersonalesMap.get(dniKey) || {};

                const numeroTemporada = record.Numero || record.NUMERO || record.Número || record['Nº'] || "";

                return {
                    ...personalData,
                    ...record,
                    DNI: dniKey,
                    NOMBRE: personalData.NOMBRE || record.NOMBRE || 'N/N',
                    EQUIPO: record.EQUIPO,
                    CATEGORIA: record.CATEGORIA,
                    NUMERO_TEMPORADA: numeroTemporada,
                    esAutorizado: record.esAutorizado || false,
                    categoriasAutorizadas: record.categoriasAutorizadas || []
                };
            });

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
        playersForCategories = allPlayers.filter(p => String(p.EQUIPO) === String(teamSelect.value));
    }

    const categoriesSet = new Set();
    playersForCategories.forEach(p => {
        if (p.CATEGORIA) categoriesSet.add(p.CATEGORIA);
        if (p.categoriasAutorizadas && Array.from(p.categoriasAutorizadas).length > 0) {
            p.categoriasAutorizadas.forEach(cat => categoriesSet.add(cat));
        }
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
        rosterData = val || { jugadores: {} };
        if (!rosterData.jugadores) rosterData.jugadores = {};
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

    const filtered = allPlayers.filter(p => {
        const isSameTeam = String(p.EQUIPO).trim() === String(team).trim();
        const isMainCategory = String(p.CATEGORIA).trim() === String(category).trim();
        const isAuthCategory = p.categoriasAutorizadas && p.categoriasAutorizadas.includes(category);

        return isSameTeam && (isMainCategory || isAuthCategory);
    }).sort((a, b) => {
        const dniA = String(a.DNI);
        const dniB = String(b.DNI);
        const entryA = (rosterData.jugadores && rosterData.jugadores[dniA]) || { seleccionado: false, numero: "" };
        const entryB = (rosterData.jugadores && rosterData.jugadores[dniB]) || { seleccionado: false, numero: "" };

        const numA = entryA.numero || a.NUMERO_TEMPORADA || "";
        const numB = entryB.numero || b.NUMERO_TEMPORADA || "";

        // Si ambos tienen número, ordenar numéricamente
        if (numA !== "" && numB !== "") {
            return parseInt(numA, 10) - parseInt(numB, 10);
        }

        // Si solo uno tiene número, ese va primero
        if (numA !== "") return -1;
        if (numB !== "") return 1;

        // Si ninguno tiene número, ordenar por nombre
        return (a.NOMBRE || '').localeCompare(b.NOMBRE || '');
    });

    // Separar Titulares de Autorizados (Refuerzos)
    // Titulares: Son de la categoría Y no son marca "esAutorizado"
    // Autorizados: Vienen por categoriasAutorizadas O por el flag esAutorizado
    const regulars = filtered.filter(p => String(p.CATEGORIA).trim() === String(category).trim() && !p.esAutorizado);
    const authorized = filtered.filter(p => (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(category) && String(p.CATEGORIA).trim() !== String(category).trim()) || p.esAutorizado);

    // Identificar números duplicados entre los seleccionados
    const counts = {};
    // Necesitamos mapear los números reales que se están mostrando para cada jugador seleccionado
    filtered.forEach(p => {
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
}

function createPlayerRow(p, duplicateNumbers = []) {
    const dni = String(p.DNI);
    const rosterEntry = (rosterData.jugadores && rosterData.jugadores[dni]) || { seleccionado: false, numero: "" };

    const numeroAMostrar = rosterEntry.numero || p.NUMERO_TEMPORADA || "";

    const expDate = parseDateDDMMYYYY(p['FM Hasta']);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isExpired = !expDate || expDate < today;

    // Validación de Licencia FUBB
    const estadoLicencia = String(p['ESTADO LICENCIA'] || '').trim().toUpperCase();
    const isFUBBInvalid = estadoLicencia !== 'DILIGENCIADO';

    let fmColorClass = 'text-green-600';
    if (isExpired) fmColorClass = 'text-red-600 font-bold';
    else {
        const thirtyDays = new Date(today); thirtyDays.setDate(today.getDate() + 30);
        const sixtyDays = new Date(today); sixtyDays.setDate(today.getDate() + 60);
        if (expDate <= thirtyDays) fmColorClass = 'text-orange-600 font-bold';
        else if (expDate <= sixtyDays) fmColorClass = 'text-amber-500 font-bold';
    }

    const isConflict = rosterEntry.seleccionado && numeroAMostrar && duplicateNumbers.includes(String(numeroAMostrar).trim());
    const inputStyle = isConflict ? 'border-red-500 bg-red-50 focus:ring-red-500/20' : 'border-gray-200 focus:ring-blue-500/20';

    const isDisabled = isExpired || isFUBBInvalid;
    const disabledText = isExpired ? 'Inhabilitado (FM)' : 'No Habilitado en FUBB';

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
            <span class="text-sm ${fmColorClass}">${p['FM Hasta'] || 'SIN FICHA'}</span>
        </td>
        <td class="px-4 py-4 text-center">
            <div class="relative inline-block pb-1">
                <input type="text" value="${numeroAMostrar}" 
                    class="w-12 text-center border ${inputStyle} rounded-xl py-2 font-bold text-blue-900 outline-none transition-all shadow-sm"
                    onchange="updateNumber('${dni}', this.value)"
                    ${isDisabled ? 'disabled' : ''}>
                ${isConflict ? `
                    <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[9px] text-red-600 font-bold whitespace-nowrap bg-white px-1">
                        Número Repetido
                    </div>
                ` : ''}
            </div>
        </td>
        <td class="px-6 py-4 text-right">
            ${isDisabled ? `
                <span class="text-[10px] bg-red-100 text-red-600 px-3 py-1.5 rounded-full font-bold uppercase tracking-wider">${disabledText}</span>
            ` : `
                <input type="checkbox" ${rosterEntry.seleccionado ? 'checked' : ''} 
                    class="w-6 h-6 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer shadow-sm"
                    onchange="toggleSelection('${dni}', this.checked)">
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

window.toggleSelection = function (dni, isChecked) {
    if (!rosterRef) return;
    const update = { [`jugadores/${dni}/seleccionado`]: isChecked };
    if (!isChecked) update[`jugadores/${dni}/numero`] = "";
    rosterRef.update(update).then(() => {
        showToast(isChecked ? "Jugador agregado" : "Jugador removido");
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

seasonSelect.addEventListener('change', () => {
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
    populateFilters();
    setupRosterSync();
});
dateSelect.addEventListener('change', setupRosterSync);
categorySelect.addEventListener('change', setupRosterSync);

signInGuest();
