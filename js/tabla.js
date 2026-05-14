document.addEventListener('DOMContentLoaded', function () {
    // Inicializar Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    // Forzar persistencia de sesión para que se limpie al cerrar la pestaña
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);

    // --- CONFIGURACIÓN Y ESTADO ---
    let database = firebase.database();
    let auth = firebase.auth();
    let currentUserRole = null;
    let currentSeason = '';
    let currentCategory = 'ACUMULADA';
    let currentCompetition = 'MASC'; // MASC, FEM, LFB
    let currentStage = '1'; // 1, 2, 3 (Play Offs)
    let teamsList = []; 
    let sharedFixture = {}; 
    let allResults = {}; 
    let allStagesData = {}; // Para guardar datos de todas las etapas de la temporada actual
    let currentDataRef = null; 

    const COMPETITIONS = {
        MASC: {
            path: 'tablas_posiciones',
            categories: [
                { id: 'ACUMULADA', name: 'TABLA ACUMULADA' },
                { id: 'U11', name: 'U11 (Presentación)' },
                { id: 'U12', name: 'U12 (Presentación)' },
                { id: 'U14', name: 'U14 (Presentación)' },
                { id: 'U16', name: 'U16 (FIBA)' },
                { id: 'U18', name: 'U18 (FIBA)' },
                { id: 'U20', name: 'U20 (FIBA)' }
            ]
        },
        FEM: {
            path: 'tablas_posiciones_fem',
            categories: [
                { id: 'U12', name: 'U12 (Presentación)' },
                { id: 'U14', name: 'U14 (FIBA)' },
                { id: 'U16', name: 'U16 (FIBA)' },
                { id: 'U19', name: 'U19 (FIBA)' }
            ]
        },
        LFB: {
            path: 'tablas_posiciones_lfb',
            categories: [
                { id: 'LFB', name: 'LIGA FEMENINA' }
            ]
        }
    };

    // --- ELEMENTOS DEL DOM ---
    const seasonSelect = document.getElementById('seasonSelect');
    const stageSelect = document.getElementById('stageSelect');
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
            const adminModalTitle = document.getElementById('adminModalTitle');
            const currentBranchName = document.getElementById('currentBranchName');
            
            if (adminModalTitle) {
                const compTab = document.querySelector(`.comp-tab[data-comp="${currentCompetition}"]`);
                const compName = compTab ? compTab.textContent : currentCompetition;
                adminModalTitle.textContent = `IMPORTAR CALENDARIO`;
                if (currentBranchName) currentBranchName.textContent = compName.toUpperCase();
            }
            
            adminModal.classList.remove('hidden');
            adminModal.classList.add('flex');
        } else {
            adminModal.classList.add('hidden');
            adminModal.classList.remove('flex');
        }
    };

    // Navegación segura que cierra sesión si es cuenta automática
    function safeNavigate(url, shouldClose = false) {
        const user = auth.currentUser;
        if (user && user.email === 'tablas@dsc.com') {
            auth.signOut().finally(() => {
                if (shouldClose) {
                    window.close();
                    setTimeout(() => { alert("Por favor, cierra esta pestaña."); }, 500);
                } else {
                    window.location.href = url;
                }
            });
        } else {
            if (shouldClose) {
                window.close();
                setTimeout(() => { alert("Por favor, cierra esta pestaña."); }, 500);
            } else {
                window.location.href = url;
            }
        }
    }

    window.handleLogoClick = () => {
        safeNavigate('index.html');
    };

    window.closeResultModal = () => {
        if (resultModal) {
            resultModal.classList.add('hidden');
            resultModal.classList.remove('flex');
        }
    };

    window.closePendingModal = () => {
        const modal = document.getElementById('pendingMatchesModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
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
                    safeNavigate('index.html');
                };
                if (logoutBtn) logoutBtn.classList.add('hidden');
            } else {
                if (backBtnText) backBtnText.textContent = "Cerrar Ventana";
                backBtn.onclick = (e) => {
                    e.preventDefault();
                    safeNavigate(null, true);
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

        // Cerrar sesión automática al cerrar/salir de la página
        window.addEventListener('beforeunload', () => {
            const user = auth.currentUser;
            if (user && user.email === 'tablas@dsc.com') {
                auth.signOut();
            }
        });

        setupListeners();
    }

    function checkRole(uid) {
        database.ref('admins/' + uid).once('value').then(snap => {
            if (snap.exists()) {
                currentUserRole = 'admin';
                if (adminPanelBtn) adminPanelBtn.classList.remove('hidden');
            } else {
                currentUserRole = 'user';
                if (adminPanelBtn) adminPanelBtn.classList.add('hidden');
            }
            // Forzar actualización de UI para mostrar/ocultar botones de edición
            updateUI();
        });
    }

    function updateCategorySelect() {
        if (!categorySelect) return;
        const comp = COMPETITIONS[currentCompetition];
        categorySelect.innerHTML = comp.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        currentCategory = categorySelect.value;
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
        
        // Detener listener previo si existe
        if (currentDataRef) {
            currentDataRef.off();
        }

        const branch = COMPETITIONS[currentCompetition].path;
        currentDataRef = database.ref(`${branch}/${season}`);
        
        currentDataRef.on('value', snap => {
            const data = snap.val() || {};
            allStagesData = data; // Guardamos todo para cálculos de arrastre
            
            // Determinar qué datos usar para la etapa actual
            let stageKey = `etapa${currentStage}`;
            let stageData = data[stageKey];

            // Fallback para Etapa 1 (si no existe el nodo etapa1, usamos la raíz para compatibilidad)
            if (currentStage === '1' && (!stageData || !stageData.fixture)) {
                stageData = data;
            } else if (!stageData) {
                stageData = {};
            }

            teamsList = stageData.equipos ? Object.values(stageData.equipos) : (data.equipos ? Object.values(data.equipos) : ["DEFENSOR SPORTING"]);
            sharedFixture = stageData.fixture || {};
            allResults = {};
            
            const categories = COMPETITIONS[currentCompetition].categories
                .filter(c => c.id !== 'ACUMULADA')
                .map(c => c.id);

            categories.forEach(cat => {
                allResults[cat] = (stageData[cat] && stageData[cat].resultados) ? stageData[cat].resultados : {};
            });
            updateUI();
        });
    }

    // --- CÁLCULOS ---
    function calculateStandingsForData(stageData, teams, category) {
        let standings = {};
        teams.forEach(name => { standings[name] = { name, pj: 0, g: 0, p: 0, pts: 0 }; });
        
        const categoriesToProcess = (category === 'ACUMULADA') 
            ? COMPETITIONS[currentCompetition].categories.filter(c => c.id !== 'ACUMULADA').map(c => c.id) 
            : [category];

        categoriesToProcess.forEach(cat => {
            const results = (stageData[cat] && stageData[cat].resultados) ? stageData[cat].resultados : {};
            const fixture = stageData.fixture || {};
            
            let isFibaLogic = false;
            if (currentCompetition === 'MASC') {
                isFibaLogic = (category === 'ACUMULADA') ? ['U16', 'U18', 'U20'].includes(cat) : ['U12', 'U14', 'U16', 'U18', 'U20'].includes(cat);
            } else if (currentCompetition === 'FEM') {
                isFibaLogic = ['U14', 'U16', 'U19'].includes(cat);
            } else if (currentCompetition === 'LFB') {
                isFibaLogic = true;
            }

            Object.entries(results).forEach(([matchId, res]) => {
                const fix = fixture[matchId];
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
                    standings[h].pj++; standings[a].pj++;
                    standings[h].pts += (res.homeNoShow ? 0 : 1);
                    standings[a].pts += (res.awayNoShow ? 0 : 1);
                    if (cat !== 'U11') {
                        if (res.scoreHome > res.scoreAway) { standings[h].g++; standings[a].p++; }
                        else if (res.scoreAway > res.scoreHome) { standings[a].g++; standings[h].p++; }
                    }
                }
            });
        });
        return standings;
    }

    function calculateTable(category) {
        // Data de la etapa actual
        let stageKey = `etapa${currentStage}`;
        let stageData = allStagesData[stageKey];
        if (currentStage === '1' && (!stageData || !stageData.fixture)) stageData = allStagesData;
        if (!stageData) stageData = {};

        let standings = calculateStandingsForData(stageData, teamsList, category);

        // Si es Etapa 2, aplicar arrastre
        if (currentStage === '2') {
            let stage1Data = allStagesData.etapa1;
            if (!stage1Data || !stage1Data.fixture) stage1Data = allStagesData; // Fallback
            
            const stage1Standings = calculateStandingsForData(stage1Data, teamsList, category);
            const config = stageData.config || { carryOver: 0 };
            const factor = parseFloat(config.carryOver) || 0;

            Object.keys(standings).forEach(teamName => {
                const s1 = stage1Standings[teamName];
                if (s1) {
                    standings[teamName].ptsArrastre = s1.pts * factor;
                    standings[teamName].pts += standings[teamName].ptsArrastre;
                }
            });
        }

        return Object.values(standings).sort((a, b) => (b.pts !== a.pts) ? (b.pts - a.pts) : (b.g - a.g));
    }

    function updateUI() {
        if (!categorySelect) return;
        const category = categorySelect.value;
        const isStage3 = currentStage === '3';
        const tableView = document.getElementById('tableView');
        
        if (isStage3) {
            if (tableView) tableView.classList.add('hidden');
        } else {
            if (tableView) tableView.classList.remove('hidden');
        }

        const standings = calculateTable(category);
        
        let stageName = currentStage === '3' ? 'Play Offs' : `Etapa ${currentStage}`;
        if (tableTitle) {
            if (category === 'ACUMULADA') {
                tableTitle.textContent = `Tabla General Acumulada - ${stageName}`;
            } else {
                tableTitle.textContent = `Posiciones - ${category} (${stageName})`;
            }
        }
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
            const btnGeneral = document.getElementById('pendingBtnGeneral');
            if (btnGeneral) btnGeneral.classList.remove('hidden');
        } else {
            if (fixtureView) fixtureView.classList.remove('hidden');
            const notice = document.getElementById('acumuladaNotice');
            if (notice) notice.classList.add('hidden');
            const btnGeneral = document.getElementById('pendingBtnGeneral');
            if (btnGeneral) btnGeneral.classList.add('hidden');
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

    window.showPendingMatches = () => {
        const container = document.getElementById('pendingMatchesContainer');
        const modal = document.getElementById('pendingMatchesModal');
        if (!container || !modal) return;

        const category = categorySelect.value;
        const categoriesToCheck = (category === 'ACUMULADA') ? ['U11', 'U12', 'U14', 'U16', 'U18', 'U20'] : [category];

        let pendingMatchesHtml = '';
        let foundAny = false;

        categoriesToCheck.forEach(cat => {
            const results = allResults[cat] || {};
            const fixtureEntries = Object.entries(sharedFixture);

            // Agrupar por jornada
            const grouped = {};
            fixtureEntries.forEach(([id, f]) => {
                const j = f.jornada || 1;
                if (!grouped[j]) grouped[j] = [];
                grouped[j].push({ id, ...f });
            });

            const sortedJornadas = Object.keys(grouped).sort((a, b) => a - b);

            sortedJornadas.forEach(j => {
                const matches = grouped[j];
                const playedMatches = matches.filter(m => results[m.id] && results[m.id].status === 'played');
                const pendingInJornada = matches.filter(m => !results[m.id] || results[m.id].status !== 'played');

                // Si se jugó algo pero no todo
                if (playedMatches.length > 0 && pendingInJornada.length > 0) {
                    foundAny = true;
                    pendingMatchesHtml += `
                        <div class="mb-4">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="bg-amber-500/20 text-amber-500 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Jornada ${j}</span>
                                <span class="text-slate-500 text-[10px] font-bold uppercase">${cat}</span>
                                <div class="h-px bg-slate-800 flex-grow"></div>
                            </div>
                            <div class="space-y-2">
                                ${pendingInJornada.map(m => `
                                    <div class="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 flex justify-between items-center group hover:border-amber-500/30 transition-colors">
                                        <div class="flex flex-col">
                                            <span class="text-xs font-bold text-white">${m.home} vs ${m.away}</span>
                                        </div>
                                        <button onclick="openJornadaModal(${j}, null, '${cat}')" class="text-[10px] font-bold text-amber-500 hover:text-amber-400 uppercase tracking-wider bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 transition-all">Ver Jornada</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
            });
        });

        if (!foundAny) {
            container.innerHTML = `
                <div class="text-center py-12">
                    <div class="bg-slate-800/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                        <svg class="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <p class="text-slate-400 font-medium">No hay jornadas disputadas parcialmente.</p>
                    <p class="text-slate-600 text-xs mt-1">Todas las jornadas iniciadas están completas.</p>
                </div>`;
        } else {
            container.innerHTML = pendingMatchesHtml;
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    };

    // --- JORNADA MODAL ---
    window.openJornadaModal = (jornada, specificMatchId = null, overrideCategory = null) => {
        if (!categorySelect || !modalMatchTitle || !jornadaResultsContainer || !resultModal) return;
        const category = overrideCategory || categorySelect.value;
        jornadaResultsContainer.dataset.category = category; // Guardar categoría actual
        modalMatchTitle.textContent = `Jornada ${jornada} - ${category}`;
        const matchesOfJornada = Object.entries(sharedFixture).filter(([id, f]) => (f.jornada || 1) == jornada).filter(([id, f]) => !specificMatchId || id === specificMatchId);
        const results = allResults[category] || {};

        const isAdmin = currentUserRole === 'admin';
        jornadaResultsContainer.innerHTML = matchesOfJornada.map(([id, f]) => {
            const r = results[id] || { scoreHome: '', scoreAway: '', status: 'pending' };
            const displayHome = (r.scoreHome === 0 || r.scoreHome === '') ? '' : r.scoreHome;
            const displayAway = (r.scoreAway === 0 || r.scoreAway === '') ? '' : r.scoreAway;

            if (isAdmin) {
                // Vista de Edición (Admin)
                const autoCheck = "this.closest('.match-result-row').querySelector('.is-played').checked = true";
                return `
                <div class="match-result-row bg-slate-800/40 p-4 rounded-2xl border border-slate-800/50" data-match-id="${id}">
                    <div class="flex flex-wrap items-center gap-4">
                        <div class="flex-1 min-w-[150px]"><div class="text-xs font-bold text-white">${f.home} vs ${f.away}</div></div>
                        <div class="flex items-center gap-3 justify-center">
                            <input type="number" value="${displayHome}" oninput="${autoCheck}" class="score-home w-12 bg-slate-900 rounded p-1 text-center font-bold text-white">
                            <span class="text-slate-600 font-black">-</span>
                            <input type="number" value="${displayAway}" oninput="${autoCheck}" class="score-away w-12 bg-slate-900 rounded p-1 text-center font-bold text-white">
                        </div>
                        <div class="flex gap-4 text-[10px]">
                            <label class="flex items-center gap-1"><input type="checkbox" ${r.homeNoShow ? 'checked' : ''} onchange="if(this.checked) ${autoCheck}" class="no-show-home"> <span class="text-slate-400">NP Loc.</span></label>
                            <label class="flex items-center gap-1"><input type="checkbox" ${r.awayNoShow ? 'checked' : ''} onchange="if(this.checked) ${autoCheck}" class="no-show-away"> <span class="text-slate-400">NP Vis.</span></label>
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
        // Pestañas de Competencia
        document.querySelectorAll('.comp-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.comp-tab').forEach(t => {
                    t.classList.remove('active', 'bg-violet-600', 'text-white');
                    t.classList.add('text-slate-500');
                });
                tab.classList.add('active');
                tab.classList.remove('text-slate-500');
                
                currentCompetition = tab.dataset.comp;
                // Limpiar datos actuales
                teamsList = [];
                sharedFixture = {};
                allResults = {};
                
                updateCategorySelect(); // Primero actualizamos las categorías
                updateUI(); // Luego refrescamos la interfaz con la nueva categoría por defecto
                loadSeasons(); // Y finalmente conectamos a los datos
            });
        });

        if (seasonSelect) seasonSelect.addEventListener('change', () => { currentSeason = seasonSelect.value; connectToSeason(currentSeason); });
        if (stageSelect) stageSelect.addEventListener('change', () => { currentStage = stageSelect.value; connectToSeason(currentSeason); });
        if (categorySelect) categorySelect.addEventListener('change', () => updateUI());
        
        const importStageSelect = document.getElementById('importStageSelect');
        const carryOverContainer = document.getElementById('carryOverContainer');
        if (importStageSelect && carryOverContainer) {
            importStageSelect.addEventListener('change', () => {
                if (importStageSelect.value === '2') {
                    carryOverContainer.classList.remove('hidden');
                } else {
                    carryOverContainer.classList.add('hidden');
                }
            });
        }

        // Inicializar categorías
        updateCategorySelect();

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => auth.signOut());
        if (loginForm) loginForm.addEventListener('submit', (e) => { e.preventDefault(); const email = loginEmail.value; const pass = loginPass.value; auth.signInWithEmailAndPassword(email, pass).catch(() => { loginError.textContent = "Error."; loginError.classList.remove('hidden'); }); });


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
            if (selectedFileContent) input = selectedFileContent.trim();
            
            if (!input) {
                alert('Por favor, selecciona un archivo CSV o pega los datos en el cuadro de texto.');
                return;
            }

            const branch = COMPETITIONS[currentCompetition].path;
            const cat = categorySelect.value; 
            const isAcum = cat === 'ACUMULADA';
            const targetStage = document.getElementById('importStageSelect').value;
            const stageNode = `${branch}/${currentSeason}/etapa${targetStage}`;
            
            if (!confirm(`¿Importar fixture para la Etapa ${targetStage}? Se borrarán los datos actuales de esta etapa.`)) return;
            
            const lines = input.split('\n'); 
            const updates = {}; 
            const newFix = {}; 
            const uniqueTeams = new Set();
            let mCount = 1;

            // 1. Limpiar datos de la etapa seleccionada
            updates[stageNode] = null;

            // 2. Procesar líneas del CSV
            lines.forEach((line, idx) => {
                const parts = line.split(/[;,]/);
                if (parts.length >= 3) {
                    const j = parseInt(parts[0]); 
                    if (idx === 0 && isNaN(j)) return; // Saltar cabecera
                    
                    const h = parts[1].trim().toUpperCase(); 
                    const a = parts[2].trim().toUpperCase();
                    
                    if (h && a) {
                        newFix[mCount] = { jornada: j, home: h, away: a };
                        uniqueTeams.add(h);
                        uniqueTeams.add(a);

                        if (isAcum) {
                            allBranchCategories.forEach((c, i) => {
                                const rawH = parts[3 + i * 2];
                                const rawA = parts[4 + i * 2];
                                
                                if (rawH !== undefined && rawA !== undefined && rawH.trim() !== "" && rawA.trim() !== "") {
                                    const resNode = `${branch}/${currentSeason}/${c}/resultados`;
                                    if (!updates[resNode]) updates[resNode] = {}; // Inicializar objeto si no existe
                                    
                                    const sH = parseInt(rawH) || 0; 
                                    const sA = parseInt(rawA) || 0;
                                    updates[resNode][mCount] = { 
                                        scoreHome: c === 'U11' ? 0 : sH, 
                                        scoreAway: c === 'U11' ? 0 : sA, 
                                        status: 'played', 
                                        homeNoShow: (sH === 0 && sA === 20), 
                                        awayNoShow: (sH === 20 && sA === 0) 
                                    };
                                }
                            });
                        } else if (parts.length >= 5) {
                            const rawH = parts[3];
                            const rawA = parts[4];
                            
                            if (rawH !== undefined && rawA !== undefined && rawH.trim() !== "" && rawA.trim() !== "") {
                                const resNode = `${branch}/${currentSeason}/${cat}/resultados`;
                                if (!updates[resNode]) updates[resNode] = {};
                                
                                const sH = parseInt(rawH) || 0; 
                                const sA = parseInt(rawA) || 0;
                                updates[resNode][mCount] = { 
                                    scoreHome: (cat === 'U11') ? 0 : sH, 
                                    scoreAway: (cat === 'U11') ? 0 : sA, 
                                    status: 'played', 
                                    homeNoShow: (sH === 0 && sA === 20), 
                                    awayNoShow: (sH === 20 && sA === 0) 
                                };
                            }
                        }
                        mCount++;
                    }
                }
            });

            // 3. Preparar equipos y fixture final
            updates[`${stageNode}/fixture`] = newFix;
            
            const teamsObj = {};
            const sortedTeams = Array.from(uniqueTeams).sort();
            const dscIndex = sortedTeams.indexOf("DEFENSOR SPORTING");
            if (dscIndex > -1) {
                sortedTeams.splice(dscIndex, 1);
                sortedTeams.unshift("DEFENSOR SPORTING");
            }
            sortedTeams.forEach((t, i) => { teamsObj[i] = t; });
            updates[`${stageNode}/equipos`] = teamsObj;

            // Configuración de Etapa 2 (Arrastre)
            if (targetStage === '2') {
                const carryOver = document.getElementById('carryOverSelect').value;
                updates[`${stageNode}/config/carryOver`] = carryOver;
            }

            // 4. Ejecutar actualización atómica en Firebase
            database.ref().update(updates).then(() => { 
                alert('Importación finalizada.'); 
                selectedFileContent = "";
                if (csvFileInput) csvFileInput.value = "";
                if (fileNameDisplay) fileNameDisplay.textContent = "Seleccionar Archivo CSV";
                
                // Cambiar la vista a la etapa importada
                if (stageSelect) {
                    stageSelect.value = targetStage;
                    currentStage = targetStage;
                }
                
                toggleAdminPanel(); 
            });
        });

        const saveJornadaResultsBtn = document.getElementById('saveJornadaResultsBtn');
        if (saveJornadaResultsBtn) saveJornadaResultsBtn.addEventListener('click', () => {
            const branch = COMPETITIONS[currentCompetition].path;
            const cat = jornadaResultsContainer.dataset.category || categorySelect.value;
            const updates = {};

            let targetPath = `${branch}/${currentSeason}/etapa${currentStage}`;
            // Fallback para Etapa 1
            if (currentStage === '1' && (!allStagesData.etapa1 || !allStagesData.etapa1.fixture)) {
                targetPath = `${branch}/${currentSeason}`;
            }

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
                    updates[`${targetPath}/${cat}/resultados/${mid}`] = res;
                } else { updates[`${targetPath}/${cat}/resultados/${mid}`] = null; }
            });
            database.ref().update(updates).then(() => { closeResultModal(); alert('Actualizado.'); });
        });
    }

    init();
});
