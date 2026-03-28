// sincronizar_fubb.js

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const database = firebase.database();
const auth = firebase.auth();

// DOM Elements
const seasonSelect = document.getElementById('seasonSelect');
const teamSelect = document.getElementById('teamSelect');
const categorySelect = document.getElementById('categorySelect');
const fubbDataInput = document.getElementById('fubbDataInput');
const compareBtn = document.getElementById('compareBtn');
const bookmarkletCode = document.getElementById('bookmarkletCode');
const resultsContent = document.getElementById('resultsContent');
const noResultsState = document.getElementById('noResultsState');
const missingInFirebaseBody = document.getElementById('missingInFirebaseBody');
const missingInFubbBody = document.getElementById('missingInFubbBody');
const statusBadge = document.getElementById('statusBadge');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toastText');

let allPlayers = [];
let fubbPlayers = [];

// Bookmarklet Code
const bookmarkletSource = `javascript:(function(){const tables=document.querySelectorAll('table');if(tables.length<2){alert("No se encontró la tabla de jugadores autorizados.");return;}const rows=Array.from(tables[1].querySelectorAll('tr')).slice(1);const data=rows.map(row=>{const cells=row.querySelectorAll('td');if(cells.length<3)return null;return{dni:cells[2].innerText.trim().replace(/\\D/g,''),nombre:cells[1].innerText.trim()};}).filter(item=>item!==null);const json=JSON.stringify(data);navigator.clipboard.writeText(json).then(()=>{alert("Copiado: "+data.length+" jugadores.");}).catch(()=>{console.log(json);alert("Error al copiar. Ver consola.");});})();`;
if (bookmarkletCode) {
    bookmarkletCode.value = bookmarkletSource;
}

// Auth check
auth.onAuthStateChanged(user => {
    if (user) {
        database.ref('admins/' + user.uid).once('value').then(snapshot => {
            if (snapshot.exists()) {
                document.body.classList.remove('uninitialized');
                loadSeasons();
            } else {
                window.location.href = 'index.html';
            }
        });
    } else {
        window.location.href = 'index.html';
    }
});

function loadSeasons() {
    database.ref('/temporadas').once('value').then(snapshot => {
        seasonSelect.innerHTML = '<option value="">Selecciona temporada</option>';
        const seasons = snapshot.val();
        if (seasons) {
            Object.keys(seasons).sort().reverse().forEach(s => {
                seasonSelect.appendChild(new Option(s, s));
            });
        }
    });
}

seasonSelect.onchange = () => {
    loadPlayersForSeason(seasonSelect.value);
};

async function loadPlayersForSeason(temporada) {
    if (!temporada) {
        allPlayers = [];
        updateCategoryFilter();
        return;
    }

    showToast("Cargando datos de temporada...", "info");

    database.ref('/registrosPorTemporada/' + temporada).once('value', async snapshot => {
        if (!snapshot.exists()) {
            allPlayers = [];
            updateCategoryFilter();
            return;
        }

        const records = snapshot.val();
        const recordsArray = Object.values(records);

        // Cargar nombres desde /jugadores
        const dniList = [...new Set(recordsArray.map(r => String(r._dni || r.DNI || "")))];
        const namesPromises = dniList.map(dni => database.ref(`/jugadores/${dni}/datosPersonales/NOMBRE`).once('value'));
        const nameSnapshots = await Promise.all(namesPromises);
        const namesMap = {};
        nameSnapshots.forEach((snap, i) => {
            namesMap[dniList[i]] = snap.val() || 'N/N';
        });

        allPlayers = Object.keys(records).map(key => {
            const r = records[key];
            const dni = String(r._dni || r.DNI || "");
            return {
                dbKey: key,
                DNI: dni,
                NOMBRE: namesMap[dni] || r.NOMBRE || 'N/N',
                EQUIPO: r.EQUIPO || "",
                equipoAutorizado: r.equipoAutorizado || "",
                CATEGORIA: r.CATEGORIA || "",
                categoriasAutorizadas: r.categoriasAutorizadas || [],
                esAutorizado: r.esAutorizado === true || String(r.esAutorizado).toLowerCase() === 'true'
            };
        });

        updateTeamFilter();
        showToast("Lista actualizada", "success");
    });
}

function updateTeamFilter() {
    const teamsSet = new Set();
    allPlayers.forEach(p => {
        if (p.EQUIPO) teamsSet.add(p.EQUIPO);
        if (p.equipoAutorizado) teamsSet.add(p.equipoAutorizado);
    });

    const current = teamSelect.value;
    teamSelect.innerHTML = '<option value="">Selecciona equipo</option>';
    Array.from(teamsSet).sort().forEach(t => {
        teamSelect.appendChild(new Option(t, t));
    });
    if (teamsSet.has(current)) teamSelect.value = current;
    
    updateCategoryFilter();
}

teamSelect.onchange = () => {
    updateCategoryFilter();
};

function updateCategoryFilter() {
    const selectedTeam = teamSelect.value;
    const categoriesSet = new Set();
    
    allPlayers.forEach(p => {
        // Solo considerar categorías del equipo seleccionado (o de todos si no hay equipo)
        const isOriginalTeam = p.EQUIPO === selectedTeam;
        const isAuthorizedTeam = p.equipoAutorizado === selectedTeam;

        if (!selectedTeam || isOriginalTeam || isAuthorizedTeam) {
            if (p.CATEGORIA) categoriesSet.add(p.CATEGORIA);
            if (p.categoriasAutorizadas) {
                p.categoriasAutorizadas.forEach(c => categoriesSet.add(c));
            }
        }
    });

    const current = categorySelect.value;
    categorySelect.innerHTML = '<option value="">Selecciona categoría</option>';
    Array.from(categoriesSet).sort().forEach(c => {
        categorySelect.appendChild(new Option(c, c));
    });
    if (categoriesSet.has(current)) categorySelect.value = current;
}

compareBtn.onclick = () => {
    let rawData = fubbDataInput.value.trim();
    const selectedTeam = teamSelect.value;
    const selectedCat = categorySelect.value;

    if (!selectedTeam) {
        showToast("Selecciona un equipo primero", "error");
        return;
    }

    if (!selectedCat) {
        showToast("Selecciona una categoría primero", "error");
        return;
    }

    if (!rawData) {
        showToast("Pega los datos de la FUBB", "error");
        return;
    }

    // Intentar detectar formato
    if (rawData.startsWith('[') && rawData.endsWith(']')) {
        try {
            fubbPlayers = JSON.parse(rawData);
        } catch (e) {
            showToast("Formato JSON inválido", "error");
            return;
        }
    } else {
        // Pegado Inteligente (Smart Paste) para móviles o copiado directo de tabla
        fubbPlayers = parseSmartText(rawData);
        if (fubbPlayers.length === 0) {
            showToast("No se encontraron jugadores en el texto pegado", "error");
            return;
        }
        showToast(`Se detectaron ${fubbPlayers.length} jugadores del texto`, "info");
    }

    runComparison(selectedTeam, selectedCat);
    fubbDataInput.value = '';
};

function parseSmartText(text) {
    const lines = text.split('\n');
    const result = [];
    // Regex para DNI (busca secuencias de 7 u 8 números que pueden tener puntos o guiones)
    const dniRegex = /(\d{1,3}\.?\d{3}\.?\d{3}-?\d?)/;
    
    lines.forEach(line => {
        if (!line.trim()) return;
        const dniMatch = line.match(dniRegex);
        if (dniMatch) {
            const dniStr = dniMatch[0];
            const dniNumeric = dniStr.replace(/\D/g, '');
            
            // Suponemos que el nombre es el resto de la línea quitando el DNI y el número inicial (si hay)
            let nombre = line.replace(dniStr, '').replace(/^\d+/, '').trim();
            
            if (dniNumeric.length >= 7) {
                result.push({
                    dni: dniNumeric,
                    nombre: nombre || 'Desconocido'
                });
            }
        }
    });
    return result;
}

function runComparison(team, category) {
    // Jugadores en Firebase para este equipo y esta categoría que son REFUERZOS (Autorizados)
    const firebasePlayers = allPlayers.filter(p => {
        const matchesTeam = p.EQUIPO === team || p.equipoAutorizado === team;
        // Es refuerzo si la categoría está en sus autorizaciones O está marcado explícitamente como autorizado
        // Y NO es su categoría original (para que sea "refuerzo")
        const isAuthorized = (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(category)) || p.esAutorizado;
        const isRefuerzo = isAuthorized && (p.CATEGORIA !== category);
        
        return matchesTeam && (isAuthorized || isRefuerzo);
    });

    const fubbDnis = new Set(fubbPlayers.map(p => String(p.dni)));
    const firebaseDnis = new Set(firebasePlayers.map(p => String(p.DNI)));

    // 1. No están en Firebase (Aparecen en FUBB)
    const missingInFirebase = fubbPlayers.filter(p => !firebaseDnis.has(String(p.dni)));

    // 2. No están en FUBB (Registrados en Firebase)
    const missingInFubb = firebasePlayers.filter(p => !fubbDnis.has(String(p.DNI)));

    renderResults(missingInFirebase, missingInFubb);
}

function renderResults(missingInFirebase, missingInFubb) {
    missingInFirebaseBody.innerHTML = '';
    missingInFubbBody.innerHTML = '';

    if (missingInFirebase.length === 0 && missingInFubb.length === 0) {
        if (statusBadge) statusBadge.classList.remove('hidden');
        resultsContent.classList.add('hidden');
        noResultsState.classList.remove('hidden');
        noResultsState.innerHTML = `
            <div class="text-center text-green-400">
                <svg class="h-16 w-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-xl font-bold">¡Todo sincronizado!</p>
                <p class="text-sm opacity-60">Los datos de la FUBB coinciden con Firebase para esta categoría.</p>
            </div>
        `;
    } else {
        if (statusBadge) statusBadge.classList.add('hidden');
        resultsContent.classList.remove('hidden');
        noResultsState.classList.add('hidden');

        if (window.mobileView) {
            // Render en formato CARDS para Móvil
            missingInFirebase.forEach(p => {
                const div = document.createElement('div');
                div.className = "bg-white/5 border border-white/10 p-4 rounded-xl flex justify-between items-center mb-2 active:bg-orange-600/20";
                div.onclick = () => authorizePlayer(p);
                div.innerHTML = `
                    <div>
                        <div class="font-bold text-sm">${p.nombre}</div>
                        <div class="text-[10px] text-orange-300 font-mono">${formatDni(p.dni)}</div>
                    </div>
                    <button class="bg-orange-600 px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-orange-900/40">Autorizar</button>
                `;
                missingInFirebaseBody.appendChild(div);
            });

            missingInFubb.forEach(p => {
                const div = document.createElement('div');
                div.className = "bg-white/5 border border-white/10 p-4 rounded-xl flex justify-between items-center mb-2 active:bg-blue-600/20";
                div.onclick = () => removeAuthorization(p);
                div.innerHTML = `
                    <div>
                        <div class="font-bold text-sm">${p.NOMBRE}</div>
                        <div class="text-[10px] text-blue-300 font-mono">${formatDni(p.DNI)}</div>
                    </div>
                    <button class="bg-blue-600 px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-blue-900/40">Quitar</button>
                `;
                missingInFubbBody.appendChild(div);
            });
        } else {
            // Render en formato TABLA para PC
            missingInFirebase.forEach(p => {
                const tr = document.createElement('tr');
                tr.className = "border-t border-white/5 hover:bg-orange-500/10 transition-colors cursor-pointer group";
                tr.onclick = () => authorizePlayer(p);
                tr.innerHTML = `
                    <td class="px-4 py-3 font-mono text-orange-300 text-xs">${formatDni(p.dni)}</td>
                    <td class="px-4 py-3">
                        <div class="font-medium">${p.nombre}</div>
                        <div class="text-[10px] text-gray-500">Haz clic para autorizar como refuerzo</div>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <button class="bg-orange-600/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-lg text-[10px] font-bold group-hover:bg-orange-600 group-hover:text-white transition-all">
                            Autorizar
                        </button>
                    </td>
                `;
                missingInFirebaseBody.appendChild(tr);
            });

            missingInFubb.forEach(p => {
                const tr = document.createElement('tr');
                tr.className = "border-t border-white/5 hover:bg-blue-500/10 transition-colors cursor-pointer group";
                tr.onclick = () => removeAuthorization(p);
                tr.innerHTML = `
                    <td class="px-4 py-3 font-mono text-blue-300 text-xs">${formatDni(p.DNI)}</td>
                    <td class="px-4 py-3">
                        <div class="font-medium">${p.NOMBRE}</div>
                        <div class="text-[10px] text-gray-500">Haz clic para quitar autorización</div>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <button class="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-lg text-[10px] font-bold group-hover:bg-blue-600 group-hover:text-white transition-all">
                            Quitar
                        </button>
                    </td>
                `;
                missingInFubbBody.appendChild(tr);
            });
        }
    }
}

function formatDni(dni) {
    return String(dni);
}

async function authorizePlayer(fubbPlayer) {
    const season = seasonSelect.value;
    const team = teamSelect.value;
    const category = categorySelect.value;
    const dni = String(fubbPlayer.dni);

    if (!confirm(`¿Deseas autorizar a ${fubbPlayer.nombre} (${dni}) para ${team} en la categoría ${category}?`)) return;

    try {
        showToast("Procesando autorización...", "info");
        
        // 1. Buscar si el jugador existe en la temporada (en cualquier equipo/categoría)
        const existingInSeason = allPlayers.find(p => p.DNI === dni);
        
        if (existingInSeason) {
            // Caso A: El jugador ya está registrado en la temporada, solo agregamos la autorización
            const cats = existingInSeason.categoriasAutorizadas || [];
            if (!cats.includes(category)) {
                cats.push(category);
            }
            
            const updates = {
                categoriasAutorizadas: cats,
                equipoAutorizado: team,
                esAutorizado: true
            };

            await database.ref(`/registrosPorTemporada/${season}/${existingInSeason.dbKey}`).update(updates);
        } else {
            // Caso B: El jugador NO está registrado en la temporada
            // Intentamos obtener sus datos personales base
            const snapshot = await database.ref(`/jugadores/${dni}/datosPersonales`).once('value');
            if (!snapshot.exists()) {
                showToast("El jugador no existe en la base global (/jugadores). Por favor, regístralo primero.", "error");
                return;
            }

            const personalData = snapshot.val();
            
            // Crear registro mínimo para la temporada como autorizado
            const newRecord = {
                DNI: dni,
                NOMBRE: personalData.NOMBRE || fubbPlayer.nombre,
                EQUIPO: team, // Se asigna al equipo seleccionado
                CATEGORIA: category, // Se asigna a la categoría seleccionada (aunque sea refuerzo)
                esAutorizado: true,
                equipoAutorizado: team,
                categoriasAutorizadas: [category],
                _tipo: 'jugadores'
            };

            await database.ref(`/registrosPorTemporada/${season}`).push(newRecord);
        }

        showToast("¡Jugador autorizado correctamente!", "success");
        // Recargar para reflejar cambios
        loadPlayersForSeason(season);
        
    } catch (e) {
        console.error("Error al autorizar:", e);
        showToast("Error al procesar la autorización", "error");
    }
}

async function removeAuthorization(player) {
    const season = seasonSelect.value;
    const category = categorySelect.value;

    if (!confirm(`¿Deseas QUITAR la autorización de ${player.NOMBRE} para la categoría ${category}?`)) return;

    try {
        showToast("Procesando...", "info");
        
        let cats = player.categoriasAutorizadas || [];
        cats = cats.filter(c => c !== category);
        
        const updates = {
            categoriasAutorizadas: cats
        };

        if (cats.length === 0) {
            updates.esAutorizado = false;
            updates.equipoAutorizado = "";
        }

        await database.ref(`/registrosPorTemporada/${season}/${player.dbKey}`).update(updates);
        
        showToast("Autorización quitada", "success");
        loadPlayersForSeason(season);
    } catch (e) {
        console.error("Error al quitar autorización:", e);
        showToast("Error al procesar", "error");
    }
}

function showToast(message, type = 'info') {
    if (!toast || !toastText) return;
    toastText.textContent = message;
    toast.classList.remove('translate-y-24', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    // Reset background color based on type
    const bgColor = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-gray-900';
    toast.firstElementChild.className = `${bgColor} text-white px-8 py-4 rounded-2xl shadow-2xl font-semibold flex items-center gap-3`;

    setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3000);
}
