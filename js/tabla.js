document.addEventListener('DOMContentLoaded', function () {
    // Inicializar Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    // --- CONFIGURACIÓN Y ESTADO ---
    let database = firebase.database();
    let auth = firebase.auth();
    let currentUserRole = null;
    let currentSeason = '';
    let currentCategory = 'ACUMULADA';
    let teamsList = []; 
    let sharedFixture = {}; 
    let allResults = {}; 

    // --- ELEMENTOS DEL DOM ---
    const seasonSelect = document.getElementById('seasonSelect');
    const categorySelect = document.getElementById('categorySelect');
    const tableBody = document.getElementById('tableBody');
    const tableTitle = document.getElementById('tableTitle');
    const fixtureView = document.getElementById('fixtureView');
    const fixtureGrid = document.getElementById('fixtureGrid');
    const adminPanelBtn = document.getElementById('adminPanelBtn');
    const adminModal = document.getElementById('adminModal');
    const adminBadge = document.getElementById('adminBadge');
    const teamInputsContainer = document.getElementById('teamInputsContainer');
    const adminFixtureList = document.getElementById('adminFixtureList');
    const addManualMatchBtn = document.getElementById('addManualMatchBtn');
    const resultModal = document.getElementById('resultModal');
    const modalMatchTitle = document.getElementById('modalMatchTitle');
    const jornadaResultsContainer = document.getElementById('jornadaResultsContainer');
    const saveJornadaResultsBtn = document.getElementById('saveJornadaResultsBtn');
    
    const loginContainer = document.getElementById('login-container');
    const mainContainer = document.getElementById('main-container');
    const loginForm = document.getElementById('login-form');
    const loginEmail = document.getElementById('login-email');
    const loginPass = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');

    // --- EXPOSICIÓN GLOBAL ---
    window.toggleAdminPanel = () => {
        if (!adminModal) return;
        if (adminModal.classList.contains('hidden')) {
            renderTeamInputs();
            renderAdminFixture();
            adminModal.classList.remove('hidden');
            adminModal.classList.add('flex');
        } else {
            adminModal.classList.add('hidden');
            adminModal.classList.remove('flex');
        }
    };

    window.closeResultModal = () => {
        if (resultModal) {
            resultModal.classList.add('hidden');
            resultModal.classList.remove('flex');
        }
    };

    // --- INICIALIZACIÓN ---
    function init() {
        const referrer = document.referrer;
        // Marca interna para saber si venimos del index
        if (referrer.includes('index.html')) {
            sessionStorage.setItem('fromIndex', 'true');
        }
        
        const isFromIndex = sessionStorage.getItem('fromIndex') === 'true';
        
        // Configurar botones de navegación
        const backBtn = document.getElementById('backBtn');
        const backBtnText = document.getElementById('backBtnText');
        const logoutBtn = document.getElementById('logoutBtn');

        if (backBtn) {
            if (isFromIndex) {
                if (backBtnText) backBtnText.textContent = "Regresar al Panel";
                backBtn.onclick = (e) => {
                    e.preventDefault();
                    window.location.href = 'index.html';
                };
                if (logoutBtn) logoutBtn.classList.add('hidden');
            } else {
                if (backBtnText) backBtnText.textContent = "Cerrar Ventana";
                backBtn.onclick = (e) => {
                    e.preventDefault();
                    window.close();
                    setTimeout(() => { alert("Por favor, cierra esta pestaña."); }, 500);
                };
                if (logoutBtn) logoutBtn.classList.remove('hidden');
            }
        }

        auth.onAuthStateChanged(user => {
            if (user) {
                // Si hay usuario, removemos el estado de carga y mostramos el contenido
                document.body.classList.remove('uninitialized');
                loginContainer.classList.add('hidden');
                mainContainer.classList.remove('hidden');
                checkRole(user.uid);
                loadSeasons();
            } else {
                // Si no hay usuario, evaluamos si intentamos login silencioso o mostramos el modal
                if (!isFromIndex) {
                    // Intento de login silencioso para acceso directo (cuenta pública)
                    auth.signInWithEmailAndPassword('tablas@dsc.com', '12345678').catch(err => {
                        // Si falla el login silencioso, mostramos el formulario de login manual
                        document.body.classList.remove('uninitialized');
                        mainContainer.classList.add('hidden');
                        loginContainer.classList.remove('hidden');
                        console.error("Error en login silencioso:", err);
                    });
                    // Importante: NO removemos 'uninitialized' aquí. 
                    // Esperamos al próximo disparo de onAuthStateChanged (éxito) o al catch (error).
                } else {
                    // Si venimos del index pero no hay sesión, mostramos el modal de login
                    document.body.classList.remove('uninitialized');
                    mainContainer.classList.add('hidden');
                    loginContainer.classList.remove('hidden');
                }
            }
        });
        setupListeners();
    }

    function checkRole(uid) {
        database.ref('admins/' + uid).once('value').then(snap => {
            if (snap.exists()) {
                currentUserRole = 'admin';
                if (adminPanelBtn) adminPanelBtn.classList.remove('hidden');
                if (adminBadge) adminBadge.classList.remove('hidden');
            } else {
                currentUserRole = 'user';
                if (adminPanelBtn) adminPanelBtn.classList.add('hidden');
                if (adminBadge) adminBadge.classList.add('hidden');
            }
            // Forzar actualización de UI para mostrar/ocultar botones de edición
            updateUI();
        });
    }

    function loadSeasons() {
        database.ref('temporadas').once('value').then(snap => {
            if (snap.exists()) {
                const seasons = Object.keys(snap.val()).sort().reverse();
                if (seasonSelect) {
                    seasonSelect.innerHTML = seasons.map(s => `<option value="${s}">${s}</option>`).join('');
                    currentSeason = seasons[0];
                    connectToSeason(currentSeason);
                }
            }
        });
    }

    function connectToSeason(season) {
        if (!season) return;
        database.ref(`tablas_posiciones/${season}`).on('value', snap => {
            const data = snap.val() || {};
            teamsList = data.equipos ? Object.values(data.equipos) : ["DEFENSOR SPORTING"];
            sharedFixture = data.fixture || {};
            allResults = {};
            const categories = ['U11', 'U12', 'U14', 'U16', 'U18', 'U20'];
            categories.forEach(cat => {
                allResults[cat] = (data[cat] && data[cat].resultados) ? data[cat].resultados : {};
            });
            updateUI();
            if (adminModal && !adminModal.classList.contains('hidden')) {
                renderAdminFixture();
            }
        });
    }

    // --- CÁLCULOS ---
    function calculateTable(category) {
        let standings = {};
        teamsList.forEach(name => { standings[name] = { name, pj: 0, g: 0, p: 0, pts: 0 }; });
        const categoriesToProcess = (category === 'ACUMULADA') ? ['U11', 'U12', 'U14', 'U16', 'U18', 'U20'] : [category];

        categoriesToProcess.forEach(cat => {
            const results = allResults[cat] || {};
            const isFibaLogic = (category === 'ACUMULADA') ? ['U16', 'U18', 'U20'].includes(cat) : ['U12', 'U14', 'U16', 'U18', 'U20'].includes(cat);

            Object.entries(results).forEach(([matchId, res]) => {
                const fix = sharedFixture[matchId];
                if (!fix || res.status !== 'played') return;
                const h = fix.home; const a = fix.away;
                if (!standings[h]) standings[h] = { name: h, pj: 0, g: 0, p: 0, pts: 0 };
                if (!standings[a]) standings[a] = { name: a, pj: 0, g: 0, p: 0, pts: 0 };
                if (isFibaLogic) {
                    standings[h].pj++; standings[a].pj++;
                    if (res.homeNoShow) { standings[h].pts += 0; standings[a].pts += 2; standings[a].g++; standings[h].p++; }
                    else if (res.awayNoShow) { standings[h].pts += 2; standings[a].pts += 0; standings[h].g++; standings[a].p++; }
                    else {
                        if (res.scoreHome > res.scoreAway) { standings[h].pts += 2; standings[a].pts += 1; standings[h].g++; standings[a].p++; }
                        else if (res.scoreAway > res.scoreHome) { standings[a].pts += 2; standings[h].pts += 1; standings[a].g++; standings[h].p++; }
                        else { standings[h].pts += 1; standings[a].pts += 1; }
                    }
                } else {
                    // Lógica de Presentación (U11, U12, U14 en acumulada)
                    // PJ cuenta siempre si el partido se marcó como jugado
                    standings[h].pj++;
                    standings[a].pj++;
                    standings[h].pts += (res.homeNoShow ? 0 : 1);
                    standings[a].pts += (res.awayNoShow ? 0 : 1);
                    
                    // Solo registrar G/P si NO es U11
                    if (cat !== 'U11') {
                        if (res.scoreHome > res.scoreAway) { standings[h].g++; standings[a].p++; }
                        else if (res.scoreAway > res.scoreHome) { standings[a].g++; standings[h].p++; }
                    }
                }
            });
        });
        return Object.values(standings).sort((a, b) => (b.pts !== a.pts) ? (b.pts - a.pts) : (b.g - a.g));
    }

    function updateUI() {
        if (!categorySelect) return;
        const category = categorySelect.value;
        const standings = calculateTable(category);
        if (tableTitle) tableTitle.textContent = (category === 'ACUMULADA') ? 'Tabla General Acumulada' : `Posiciones - ${category}`;
        const showGP = category !== 'ACUMULADA';
        const colG = document.getElementById('colG'); const colP = document.getElementById('colP');
        if (colG) colG.style.display = showGP ? 'table-cell' : 'none';
        if (colP) colP.style.display = showGP ? 'table-cell' : 'none';

        if (tableBody) {
            tableBody.innerHTML = standings.map((team, index) => `
                <tr class="${team.name === 'DEFENSOR SPORTING' ? 'bg-violet-900/20' : ''}">
                    <td class="px-6 py-4 font-mono text-sm"><span class="pos-${index + 1}">${index + 1}</span></td>
                    <td class="px-6 py-4 font-bold text-white cursor-pointer hover:text-violet-400 transition-colors" onclick="showTeamResults('${team.name}')">${team.name}</td>
                    <td class="px-6 py-4 text-center">${team.pj}</td>
                    <td class="px-6 py-4 text-center" style="display: ${showGP ? 'table-cell' : 'none'}">${team.g}</td>
                    <td class="px-6 py-4 text-center" style="display: ${showGP ? 'table-cell' : 'none'}">${team.p}</td>
                    <td class="px-6 py-4 text-center font-black text-violet-400 text-lg">${team.pts}</td>
                </tr>
            `).join('');
        }

        if (category === 'ACUMULADA') {
            if (fixtureView) fixtureView.classList.add('hidden');
            const notice = document.getElementById('acumuladaNotice');
            if (notice) notice.classList.remove('hidden');
        } else {
            if (fixtureView) fixtureView.classList.remove('hidden');
            const notice = document.getElementById('acumuladaNotice');
            if (notice) notice.classList.add('hidden');
            const results = allResults[category] || {};
            const fixtureEntries = Object.entries(sharedFixture);
            if (fixtureGrid) {
                if (fixtureEntries.length === 0) {
                    fixtureGrid.innerHTML = '<p class="text-slate-500 col-span-full py-8 text-center">No hay fixture generado.</p>';
                } else {
                    const grouped = {};
                    fixtureEntries.forEach(([id, f]) => { 
                        const j = f.jornada || 1; 
                        if (!grouped[j]) grouped[j] = []; 
                        grouped[j].push({ id, ...f }); 
                    });
                    
                    const sortedJornadas = Object.keys(grouped).sort((a, b) => a - b);
                    
                    fixtureGrid.innerHTML = `
                        <div class="col-span-full flex flex-wrap gap-4 justify-center items-center py-6">
                            ${sortedJornadas.map(j => {
                                const matches = grouped[j];
                                const playedCount = matches.filter(m => (results[m.id] && results[m.id].status === 'played')).length;
                                
                                let colorClass = 'bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20'; // Rojo: Ninguno
                                if (playedCount === matches.length && matches.length > 0) {
                                    colorClass = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20'; // Verde: Todos
                                } else if (playedCount > 0) {
                                    colorClass = 'bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20'; // Naranja: Parcial
                                }

                                return `
                                    <div class="flex flex-col items-center gap-2">
                                        <button onclick="openJornadaModal(${j})" 
                                            class="w-14 h-14 rounded-2xl border-2 ${colorClass} font-['Outfit'] font-black text-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-xl group relative">
                                            ${j}
                                            <div class="absolute -top-1 -right-1 w-3 h-3 rounded-full ${colorClass.split(' ')[0]} border border-white/10"></div>
                                        </button>
                                        <span class="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Jornada</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                }
            }
        }
    }

    // --- ADMIN RENDER ---
    function renderAdminFixture() {
        if (!adminFixtureList) return;
        const entries = Object.entries(sharedFixture);
        adminFixtureList.innerHTML = entries.map(([id, m]) => `
            <div class="flex items-center gap-2 bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                <div class="flex flex-col items-center"><label class="text-[8px] text-slate-500 uppercase">Jor.</label><input type="number" value="${m.jornada || 1}" onchange="updateMatchField('${id}', 'jornada', parseInt(this.value))" class="bg-slate-900 text-[10px] w-8 text-center border-none rounded p-1"></div>
                <select onchange="updateMatchField('${id}', 'home', this.value)" class="bg-slate-900 text-xs border-none rounded p-1 flex-1">${teamsList.map(t => `<option value="${t}" ${t === m.home ? 'selected' : ''}>${t}</option>`).join('')}</select>
                <span class="text-[10px] text-slate-600">VS</span>
                <select onchange="updateMatchField('${id}', 'away', this.value)" class="bg-slate-900 text-xs border-none rounded p-1 flex-1">${teamsList.map(t => `<option value="${t}" ${t === m.away ? 'selected' : ''}>${t}</option>`).join('')}</select>
                <button onclick="deleteMatch('${id}')" class="p-1 hover:text-red-500 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
            </div>
        `).join('');
    }

    function renderTeamInputs() {
        if (!teamInputsContainer) return;
        teamInputsContainer.innerHTML = `<div class="bg-slate-800 p-3 rounded-xl border border-slate-700 opacity-50"><label class="text-[10px] text-slate-500 block">Principal</label><input type="text" value="DEFENSOR SPORTING" disabled class="bg-transparent border-none p-0 text-sm font-bold w-full text-white"></div>`;
        const rivals = teamsList.filter(t => t !== "DEFENSOR SPORTING");
        for (let i = 0; i < 7; i++) {
            const val = rivals[i] || '';
            teamInputsContainer.innerHTML += `<div class="bg-slate-800 p-3 rounded-xl border border-slate-700"><label class="text-[10px] text-slate-500 block">Rival ${i + 1}</label><input type="text" placeholder="Nombre equipo" class="rival-input bg-transparent border-none p-0 text-sm font-bold w-full text-white focus:ring-0 outline-none" value="${val}"></div>`;
        }
    }

    window.updateMatchField = (id, field, value) => { database.ref(`tablas_posiciones/${currentSeason}/fixture/${id}/${field}`).set(value); };
    window.deleteMatch = (id) => { if (confirm('¿Eliminar partido?')) database.ref(`tablas_posiciones/${currentSeason}/fixture/${id}`).remove(); };

    window.showTeamResults = (teamName) => {
        const category = categorySelect.value;
        const results = allResults[category] || {};
        const title = document.getElementById('teamModalTitle');
        const container = document.getElementById('teamResultsContainer');
        const modal = document.getElementById('teamResultsModal');
        if (!modal || !container) return;
        
        title.textContent = `${teamName} - ${category}`;
        const myMatches = Object.entries(sharedFixture).filter(([id, f]) => f.home === teamName || f.away === teamName).sort((a, b) => (a[1].jornada || 1) - (b[1].jornada || 1));

        container.innerHTML = myMatches.map(([id, f]) => {
            const r = results[id];
            if (!r || r.status !== 'played') return '';
            const isHome = f.home === teamName; const rival = isHome ? f.away : f.home;
            const myScore = isHome ? r.scoreHome : r.scoreAway; const rivalScore = isHome ? r.scoreAway : r.scoreHome;
            const myNS = isHome ? r.homeNoShow : r.awayNoShow; const rivalNS = isHome ? r.awayNoShow : r.homeNoShow;

            let resultClass = 'bg-slate-800/40 text-slate-400 border-slate-700/50'; let label = 'EMPATE';
            if (myNS) { resultClass = 'bg-red-500/10 text-red-500 border-red-500/20'; label = 'PERDIDO (NP)'; }
            else if (rivalNS) { resultClass = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'; label = 'GANADO (NP)'; }
            else if (myScore > rivalScore) { resultClass = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'; label = 'GANADO'; }
            else if (myScore < rivalScore) { resultClass = 'bg-red-500/10 text-red-500 border-red-500/20'; label = 'PERDIDO'; }

            return `<div class="p-4 rounded-2xl border ${resultClass} flex justify-between items-center"><div class="flex flex-col"><span class="text-[8px] uppercase font-bold opacity-60">Jornada ${f.jornada || 1}</span><span class="text-sm font-bold">${rival}</span></div><div class="flex items-center gap-3"><span class="text-lg font-black">${isHome ? r.scoreHome : r.scoreAway} - ${isHome ? r.scoreAway : r.scoreHome}</span><span class="text-[10px] font-black uppercase px-2 py-1 rounded-md bg-white/5">${label}</span></div></div>`;
        }).join('') || '<p class="text-center text-slate-500 py-8">No hay partidos jugados aún.</p>';
        modal.classList.remove('hidden'); modal.classList.add('flex');
    };

    window.closeTeamResultsModal = () => {
        const modal = document.getElementById('teamResultsModal');
        if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    };

    // --- JORNADA MODAL ---
    window.openJornadaModal = (jornada, specificMatchId = null) => {
        if (!categorySelect || !modalMatchTitle || !jornadaResultsContainer || !resultModal) return;
        const category = categorySelect.value;
        modalMatchTitle.textContent = `Jornada ${jornada} - ${category}`;
        const matchesOfJornada = Object.entries(sharedFixture).filter(([id, f]) => (f.jornada || 1) == jornada).filter(([id, f]) => !specificMatchId || id === specificMatchId);
        const results = allResults[category] || {};
        
        const isAdmin = currentUserRole === 'admin';
        jornadaResultsContainer.innerHTML = matchesOfJornada.map(([id, f]) => {
            const r = results[id] || { scoreHome: 0, scoreAway: 0, status: 'pending' };
            
            if (isAdmin) {
                // Vista de Edición (Admin)
                return `
                <div class="match-result-row bg-slate-800/40 p-4 rounded-2xl border border-slate-800/50" data-match-id="${id}">
                    <div class="flex flex-wrap items-center gap-4">
                        <div class="flex-1 min-w-[150px]"><div class="text-xs font-bold text-white">${f.home} vs ${f.away}</div></div>
                        <div class="flex items-center gap-3 justify-center">
                            <input type="number" value="${r.scoreHome}" class="score-home w-12 bg-slate-900 rounded p-1 text-center font-bold text-white">
                            <span class="text-slate-600 font-black">-</span>
                            <input type="number" value="${r.scoreAway}" class="score-away w-12 bg-slate-900 rounded p-1 text-center font-bold text-white">
                        </div>
                        <div class="flex gap-4 text-[10px]">
                            <label class="flex items-center gap-1"><input type="checkbox" ${r.homeNoShow ? 'checked' : ''} class="no-show-home"> <span class="text-slate-400">NP Loc.</span></label>
                            <label class="flex items-center gap-1"><input type="checkbox" ${r.awayNoShow ? 'checked' : ''} class="no-show-away"> <span class="text-slate-400">NP Vis.</span></label>
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="checkbox" ${r.status === 'played' ? 'checked' : ''} class="is-played">
                            <span class="text-[10px] text-slate-500 font-bold uppercase">Jugado</span>
                        </div>
                    </div>
                </div>`;
            } else {
                // Vista de Solo Lectura (Usuario)
                const statusText = r.status === 'played' ? 'Finalizado' : 'Pendiente';
                const statusColor = r.status === 'played' ? 'text-emerald-500' : 'text-amber-500';
                
                return `
                <div class="bg-slate-800/20 p-4 rounded-2xl border border-slate-800/30">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Partido ${id}</span>
                        <span class="text-[9px] uppercase font-black ${statusColor}">${statusText}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <div class="flex-1 text-sm font-bold text-white">${f.home}</div>
                        <div class="px-4 flex items-center gap-2">
                            <span class="text-xl font-black text-violet-400">${r.status === 'played' ? (r.homeNoShow ? 'NP' : r.scoreHome) : '-'}</span>
                            <span class="text-slate-700 text-xs font-black">VS</span>
                            <span class="text-xl font-black text-violet-400">${r.status === 'played' ? (r.awayNoShow ? 'NP' : r.scoreAway) : '-'}</span>
                        </div>
                        <div class="flex-1 text-sm font-bold text-white text-right">${f.away}</div>
                    </div>
                </div>`;
            }
        }).join('');

        // Mostrar/Ocultar botón de guardar
        const saveBtn = document.getElementById('saveJornadaResultsBtn');
        if (saveBtn) saveBtn.style.display = isAdmin ? 'block' : 'none';

        resultModal.classList.remove('hidden'); resultModal.classList.add('flex');
    };

    // --- LISTENERS ---
    function setupListeners() {
        if (seasonSelect) seasonSelect.addEventListener('change', () => { currentSeason = seasonSelect.value; connectToSeason(currentSeason); });
        if (categorySelect) categorySelect.addEventListener('change', () => updateUI());
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => auth.signOut());
        if (loginForm) loginForm.addEventListener('submit', (e) => { e.preventDefault(); const email = loginEmail.value; const pass = loginPass.value; auth.signInWithEmailAndPassword(email, pass).catch(() => { loginError.textContent = "Error."; loginError.classList.remove('hidden'); }); });

        const saveTeamsBtn = document.getElementById('saveTeamsBtn');
        if (saveTeamsBtn) saveTeamsBtn.addEventListener('click', () => {
            const rivals = Array.from(document.querySelectorAll('.rival-input')).map(i => i.value.trim()).filter(v => v !== '');
            const newTeams = { "0": "DEFENSOR SPORTING" };
            rivals.forEach((r, idx) => { newTeams[idx + 1] = r; });
            database.ref(`tablas_posiciones/${currentSeason}/equipos`).set(newTeams).then(() => alert('Equipos guardados.'));
        });

        const generateFixtureBtn = document.getElementById('generateFixtureBtn');
        if (generateFixtureBtn) generateFixtureBtn.addEventListener('click', () => {
            if (!confirm('¿Reiniciar fixture?')) return;
            const teams = teamsList; let matchCounter = 1; const matches = {};
            for (let i = 0; i < teams.length; i++) { for (let j = i + 1; j < teams.length; j++) { const jor = i + 1; matches[matchCounter++] = { home: teams[i], away: teams[j], jornada: jor }; matches[matchCounter++] = { home: teams[j], away: teams[i], jornada: jor + teams.length }; } }
            const updates = {}; updates[`tablas_posiciones/${currentSeason}/fixture`] = matches;
            const categories = ['U11', 'U12', 'U14', 'U16', 'U18', 'U20'];
            categories.forEach(cat => { updates[`tablas_posiciones/${currentSeason}/${cat}/resultados`] = null; });
            database.ref().update(updates).then(() => { alert('Generado.'); toggleAdminPanel(); });
        });

        if (addManualMatchBtn) addManualMatchBtn.addEventListener('click', () => {
            const nextId = Object.keys(sharedFixture).length > 0 ? Math.max(...Object.keys(sharedFixture).map(Number)) + 1 : 1;
            database.ref(`tablas_posiciones/${currentSeason}/fixture/${nextId}`).set({ home: teamsList[0], away: teamsList[1] || 'Rival', jornada: 1 });
        });

        const csvFileInput = document.getElementById('csvFileInput');
        const fileNameDisplay = document.getElementById('fileNameDisplay');
        let selectedFileContent = "";

        if (csvFileInput) {
            csvFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    fileNameDisplay.textContent = file.name;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        selectedFileContent = event.target.result;
                    };
                    reader.readAsText(file);
                }
            });
        }

        const importMassiveBtn = document.getElementById('importMassiveBtn');
        if (importMassiveBtn) importMassiveBtn.addEventListener('click', () => {
            let input = document.getElementById('massiveFixtureInput').value.trim();
            
            // Si hay un archivo seleccionado, usar su contenido prioritariamente
            if (selectedFileContent) input = selectedFileContent.trim();
            
            if (!input) {
                alert('Por favor, selecciona un archivo CSV o pega los datos en el cuadro de texto.');
                return;
            }

            const cat = categorySelect.value; const isAcum = cat === 'ACUMULADA';
            if (!confirm('¿Continuar?')) return;
            const lines = input.split('\n'); const updates = {}; const newFix = {}; let mCount = 1;
            lines.forEach((line, idx) => {
                const parts = line.split(/[;,]/);
                if (parts.length >= 3) {
                    const j = parseInt(parts[0]); if (idx === 0 && isNaN(j)) return;
                    const h = parts[1].trim().toUpperCase(); const a = parts[2].trim().toUpperCase();
                    if (h && a) {
                        newFix[mCount] = { jornada: j, home: h, away: a };
                        if (isAcum && parts.length >= 15) {
                            ['U11', 'U12', 'U14', 'U16', 'U18', 'U20'].forEach((c, i) => {
                                const rH = parts[3 + i * 2] ? parts[3 + i * 2].trim() : ""; const rA = parts[4 + i * 2] ? parts[4 + i * 2].trim() : "";
                                if (rH !== "" && rA !== "") {
                                    if (!updates[`tablas_posiciones/${currentSeason}/${c}/resultados`]) updates[`tablas_posiciones/${currentSeason}/${c}/resultados`] = {};
                                    const sH = parseInt(rH) || 0; const sA = parseInt(rA) || 0;
                                    updates[`tablas_posiciones/${currentSeason}/${c}/resultados`][mCount] = { scoreHome: c === 'U11' ? 0 : sH, scoreAway: c === 'U11' ? 0 : sA, status: 'played', homeNoShow: (sH === 0 && sA === 20), awayNoShow: (sH === 20 && sA === 0) };
                                }
                            });
                        } else if (!isAcum && parts.length >= 5) {
                            const sH = parseInt(parts[3]) || 0; const sA = parseInt(parts[4]) || 0;
                            if (!updates[`tablas_posiciones/${currentSeason}/${cat}/resultados`]) updates[`tablas_posiciones/${currentSeason}/${cat}/resultados`] = {};
                            updates[`tablas_posiciones/${currentSeason}/${cat}/resultados`][mCount] = { scoreHome: cat === 'U11' ? 0 : sH, scoreAway: cat === 'U11' ? 0 : sA, status: 'played', homeNoShow: (sH === 0 && sA === 20), awayNoShow: (sH === 20 && sA === 0) };
                        }
                        mCount++;
                    }
                }
            });
            updates[`tablas_posiciones/${currentSeason}/fixture`] = newFix;
            if (isAcum) ['U11', 'U12', 'U14', 'U16', 'U18', 'U20'].forEach(c => { if (!updates[`tablas_posiciones/${currentSeason}/${c}/resultados`]) updates[`tablas_posiciones/${currentSeason}/${c}/resultados`] = null; });
            database.ref().update(updates).then(() => { alert('Éxito.'); toggleAdminPanel(); });
        });

        if (saveJornadaResultsBtn) saveJornadaResultsBtn.addEventListener('click', () => {
            const cat = categorySelect.value; const updates = {};
            document.querySelectorAll('.match-result-row').forEach(row => {
                const mid = row.dataset.matchId; const isP = row.querySelector('.is-played').checked;
                if (isP) {
                    const sH = parseInt(row.querySelector('.score-home').value) || 0; 
                    const sA = parseInt(row.querySelector('.score-away').value) || 0;
                    
                    let nsH = row.querySelector('.no-show-home').checked;
                    let nsA = row.querySelector('.no-show-away').checked;

                    // Detección automática de 20-0 / 0-20
                    if (sH === 20 && sA === 0) nsA = true;
                    if (sH === 0 && sA === 20) nsH = true;

                    const res = { 
                        scoreHome: sH, 
                        scoreAway: sA, 
                        status: 'played', 
                        homeNoShow: nsH, 
                        awayNoShow: nsA 
                    };
                    updates[`tablas_posiciones/${currentSeason}/${cat}/resultados/${mid}`] = res;
                } else { updates[`tablas_posiciones/${currentSeason}/${cat}/resultados/${mid}`] = null; }
            });
            database.ref().update(updates).then(() => { closeResultModal(); alert('Actualizado.'); });
        });
    }

    init();
});
