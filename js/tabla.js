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
    let currentUserRole = 'user';
    let currentSeason = '';
    let currentCategory = 'ACUMULADA';
    let currentCompetition = 'MASC'; // MASC, FEM, LFB
    let currentStage = '1'; // 1, 2, 3 (Play Offs)
    let teamsList = [];
    let sharedFixture = {};
    let allResults = {};
    let allStagesData = {}; // Para guardar datos de todas las etapas de la temporada actual
    let currentDataRef = null;

    // --- CONFIGURACIÓN DE CONEXIÓN Y PROXIES (SCRAPING FUBB) ---
    const BROWSER_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
    };

    const PROXIES = [
        {
            buildUrl: (u) => `https://cors-anywhere.herokuapp.com/${u}`,
            isJson: false,
            extraHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
            supportsPost: true,
        },
        {
            buildUrl: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
            isJson: true,
            jsonKey: 'contents',
            supportsPost: false,
        },
        {
            buildUrl: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
            isJson: false,
            supportsPost: false,
        },
    ];

    async function fetchWithTimeout(url, options, ms) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            return res;
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    }

    const COMPETITIONS = {
        MASC: {
            path: 'tablas_posiciones',
            categories: [
                { id: 'ACUMULADA', name: 'T. GENERAL' },
                { id: 'U11', name: 'U11 M' },
                { id: 'U12', name: 'U12 M' },
                { id: 'U14', name: 'U14 M' },
                { id: 'U16', name: 'U16 M' },
                { id: 'U18', name: 'U18 M' },
                { id: 'U20', name: 'U20 M' }
            ]
        },
        FEM: {
            path: 'tablas_posiciones_fem',
            categories: [
                { id: 'U12', name: 'U12 F' },
                { id: 'U14', name: 'U14 F' },
                { id: 'U16', name: 'U16 F' },
                { id: 'U19', name: 'U19 F' }
            ]
        },
        LFB: {
            path: 'tablas_posiciones_lfb',
            categories: [
                { id: 'LFB', name: 'LIGA FEMENINA' }
            ]
        },
        LDD: {
            path: 'tablas_posiciones_ldd',
            categories: [
                { id: 'LDD', name: 'LDD' }
            ]
        },
        LUB: {
            path: 'tablas_posiciones_lub',
            categories: [
                { id: 'LUB', name: 'LUB' }
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

    // Helper para asegurar que un modal quede como overlay en la parte superior
    function ensureModalOnTop(modalEl, name) {
        if (!modalEl) return;
        try {
            // Mostrar y forzar estilos de overlay
            modalEl.classList.remove('hidden');
            modalEl.classList.add('flex');
            modalEl.style.display = 'flex';
            modalEl.style.position = 'fixed';
            modalEl.style.top = '0';
            modalEl.style.left = '0';
            modalEl.style.width = '100vw';
            modalEl.style.height = '100vh';
            modalEl.style.minWidth = '100vw';
            modalEl.style.minHeight = '100vh';
            modalEl.style.boxSizing = 'border-box';
            modalEl.style.zIndex = 2147483647;
            modalEl.style.pointerEvents = 'auto';
            modalEl.style.alignItems = 'center';
            modalEl.style.justifyContent = 'center';
            // Reparent to body to avoid stacking-context issues
            if (modalEl.parentNode !== document.body) {
                document.body.appendChild(modalEl);
            }
        } catch (e) {
            console.warn('ensureModalOnTop failed for', name, e);
        }
    }

    // Helper para limpiar estilos inline aplicados por ensureModalOnTop
    function resetModalStyles(modalEl) {
        if (!modalEl) return;
        try {
            modalEl.style.display = '';
            modalEl.style.position = '';
            modalEl.style.top = '';
            modalEl.style.left = '';
            modalEl.style.width = '';
            modalEl.style.height = '';
            modalEl.style.minWidth = '';
            modalEl.style.minHeight = '';
            modalEl.style.boxSizing = '';
            modalEl.style.zIndex = '';
            modalEl.style.pointerEvents = '';
            modalEl.style.alignItems = '';
            modalEl.style.justifyContent = '';
        } catch (e) {
            console.warn('resetModalStyles failed', e);
        }
    }

    const loginContainer = document.getElementById('login-container');
    const mainContainer = document.getElementById('main-container');
    const loginForm = document.getElementById('login-form');
    const loginEmail = document.getElementById('login-email');
    const loginPass = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');

    function isValidStage(stage) {
        return ['1', '2', '3'].includes(String(stage));
    }

    const GUEST_EMAIL = 'tablas@dsc.com';

    function saveCurrentStagePreference() {
        if (!currentSeason || !isValidStage(currentStage)) return Promise.resolve();
        const branch = COMPETITIONS[currentCompetition].path;
        return database.ref(`${branch}/${currentSeason}/config/lastStage`).set(currentStage)
            .catch(err => {
                console.error('No se pudo guardar la última etapa seleccionada:', err);
            });
    }

    function applySavedStagePreference(data) {
        const savedStage = data && data.config && isValidStage(data.config.lastStage)
            ? data.config.lastStage
            : '1';
        currentStage = savedStage;
        if (stageSelect) stageSelect.value = savedStage;
    }

    function isAdminUser(user) {
        return user && user.email && user.email.toLowerCase() !== GUEST_EMAIL;
    }

    function updateAdminUI() {
        if (adminPanelBtn) {
            if (currentUserRole === 'admin') {
                adminPanelBtn.classList.remove('hidden');
            } else {
                adminPanelBtn.classList.add('hidden');
            }
        }
    }


    // --- EXPOSICIÓN GLOBAL ---
    window.toggleAdminPanel = () => {
        if (!adminModal) return;
        if (adminModal.classList.contains('hidden')) {
            const adminModalTitle = document.getElementById('adminModalTitle');
            const currentBranchName = document.getElementById('currentBranchName');

            if (adminModalTitle) {
                const compTab = document.querySelector(`.comp-tab[data-comp="${currentCompetition}"]`);
                const compName = compTab ? compTab.textContent : currentCompetition;
                adminModalTitle.textContent = `Rama Seleccionada`;
                if (currentBranchName) currentBranchName.textContent = compName.toUpperCase();
            }

            // Control de visibilidad del configurador FIBA (Solo Masculino)
            const fibaContainer = document.getElementById('fibaConfigContainer');
            if (fibaContainer) {
                if (currentCompetition === 'MASC') {
                    fibaContainer.classList.remove('hidden');
                    renderFibaConfigCheckboxes();
                } else {
                    fibaContainer.classList.add('hidden');
                }
            }

            // Renderizar UI de Sanciones
            renderSancionesUI();

            // Precargar valor de arrastre actual si existe
            let stage2Data = allStagesData['etapa2'];
            if (stage2Data && stage2Data.config && stage2Data.config.carryOver !== undefined) {
                const carryOverSelect = document.getElementById('carryOverSelect');
                if (carryOverSelect) {
                    carryOverSelect.value = stage2Data.config.carryOver;
                }
            }

            // Seleccionar pestaña por defecto
            if (typeof switchAdminTab === 'function') {
                switchAdminTab('import');
            }

            // Ocultar otros modales abiertos para que el panel admin quede en primer plano
            const otherModals = [resultModal, document.getElementById('teamResultsModal'), document.getElementById('pendingMatchesModal')];
            otherModals.forEach(m => { if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } });

            if (adminModal) {
                adminModal.classList.remove('hidden');
                adminModal.classList.add('flex');
            }
        } else {
            if (adminModal) {
                adminModal.classList.add('hidden');
                adminModal.classList.remove('flex');
                resetModalStyles(adminModal);
            }
        }
    };

    window.switchAdminTab = (tabId) => {
        // Actualizar estilos de los botones
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
            if (btn.id === `tabBtn-${tabId}`) {
                btn.classList.add('text-violet-400', 'border-violet-500');
                btn.classList.remove('text-slate-400', 'border-transparent');
            } else {
                btn.classList.remove('text-violet-400', 'border-violet-500');
                btn.classList.add('text-slate-400', 'border-transparent');
            }
        });

        // Mostrar/Ocultar el contenido de las pestañas
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            if (content.id === `adminTab-${tabId}`) {
                content.classList.remove('hidden');
            } else {
                content.classList.add('hidden');
            }
        });
    };

    function renderFibaConfigCheckboxes() {
        const container = document.getElementById('fibaCheckboxes');
        if (!container) return;

        const categories = COMPETITIONS.MASC.categories.filter(c => c.id !== 'ACUMULADA');
        
        let fibaCategories = { U16: true, U18: true, U20: true }; // Valores por defecto
        if (allStagesData.config && allStagesData.config.fibaCategories) {
            fibaCategories = allStagesData.config.fibaCategories;
        }

        container.innerHTML = categories.map(cat => {
            const isChecked = fibaCategories[cat.id] === true;
            return `
                <label class="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700/50 cursor-pointer select-none transition-all">
                    <input type="checkbox" id="fiba-chk-${cat.id}" ${isChecked ? 'checked' : ''} 
                        class="w-4 h-4 rounded text-violet-600 bg-slate-850 border-slate-700 focus:ring-violet-500 focus:ring-2 focus:ring-offset-slate-900">
                    <span class="text-xs font-bold text-slate-200">${cat.name}</span>
                </label>
            `;
        }).join('');
    }

    window.saveFibaConfig = () => {
        const branch = COMPETITIONS.MASC.path;
        const categories = COMPETITIONS.MASC.categories.filter(c => c.id !== 'ACUMULADA');
        const fibaCategories = {};

        categories.forEach(cat => {
            const chk = document.getElementById(`fiba-chk-${cat.id}`);
            if (chk) {
                fibaCategories[cat.id] = chk.checked;
            }
        });

        database.ref(`${branch}/${currentSeason}/config/fibaCategories`).set(fibaCategories)
            .then(() => {
                alert('Configuración de reglamento guardada correctamente.');
            })
            .catch(err => {
                console.error("Error al guardar la configuración FIBA:", err);
                alert('Error al guardar la configuración de reglamento.');
            });
    };

    window.updateCarryOver = () => {
        const carryOverSelect = document.getElementById('carryOverSelect');
        if (!carryOverSelect) return;
        const carryOverVal = carryOverSelect.value;
        const branch = COMPETITIONS[currentCompetition].path;
        
        database.ref(`${branch}/${currentSeason}/etapa2/config/carryOver`).set(carryOverVal)
            .then(() => {
                
                // El listener on('value') de Firebase actualizará automáticamente la tabla.
            })
            .catch(err => {
                console.error('Error al actualizar el arrastre:', err);
                alert('Error al actualizar el arrastre de puntos.');
            });
    };

    // --- SANCIONES ---
    // Helper: suma todos los puntos de sanción de un equipo en una categoría
    function getSancionTotal(cat, teamName) {
        const sanciones = allStagesData.sanciones || {};
        const teamSanc = (sanciones[cat] && sanciones[cat][teamName]) ? sanciones[cat][teamName] : {};
        if (typeof teamSanc === 'number') return teamSanc; // Compatibilidad con formato antiguo
        let total = 0;
        Object.values(teamSanc).forEach(entry => {
            total += parseFloat(entry.pts) || 0;
        });
        return total;
    }

    function renderSancionesUI() {
        const teamSel = document.getElementById('sancionTeamSelect');
        const catSel = document.getElementById('sancionCategorySelect');
        const listContainer = document.getElementById('activeSancionesList');
        if (!teamSel || !catSel || !listContainer) return;

        // Poblar equipos
        const teams = teamsList.length > 0 ? teamsList : [];
        teamSel.innerHTML = teams.map(t => `<option value="${t}">${t}</option>`).join('');

        // Poblar categorías (todas las de la competencia actual, sin ACUMULADA)
        const cats = COMPETITIONS[currentCompetition].categories.filter(c => c.id !== 'ACUMULADA');
        catSel.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        // Mostrar sanciones activas (cada entrada individual)
        const sanciones = allStagesData.sanciones || {};
        let rows = [];
        cats.forEach(catObj => {
            const catSanc = sanciones[catObj.id] || {};
            Object.entries(catSanc).forEach(([teamName, teamData]) => {
                if (typeof teamData === 'number') {
                    // Compatibilidad formato antiguo (número directo)
                    if (teamData > 0) {
                        rows.push({ cat: catObj.id, catName: catObj.name, team: teamName, pts: teamData, key: null });
                    }
                } else if (typeof teamData === 'object') {
                    // Nuevo formato: entradas individuales con push keys
                    Object.entries(teamData).forEach(([key, entry]) => {
                        const pts = parseFloat(entry.pts) || 0;
                        if (pts > 0) {
                            rows.push({ cat: catObj.id, catName: catObj.name, team: teamName, pts, key, fecha: entry.fecha || '' });
                        }
                    });
                }
            });
        });

        if (rows.length === 0) {
            listContainer.innerHTML = `<p class="text-[10px] text-slate-600 italic text-center py-3">Sin sanciones activas.</p>`;
        } else {
            listContainer.innerHTML = rows.map(r => {
                const fechaLabel = r.fecha ? `<span class="text-[8px] text-slate-600 ml-1">${r.fecha}</span>` : '';
                const btnArgs = r.key 
                    ? `removeSancion('${r.cat}', '${r.team.replace(/'/g, "\\\\'")}', '${r.key}')` 
                    : `removeSancionLegacy('${r.cat}', '${r.team.replace(/'/g, "\\\\'")}')` ;
                return `
                <div class="flex justify-between items-center bg-red-500/5 border border-red-500/15 rounded-xl px-3 py-2">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-bold text-red-400">${r.team}${fechaLabel}</span>
                        <span class="text-[9px] text-slate-500 uppercase font-semibold">${r.catName}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-black text-red-400">-${r.pts} Pts</span>
                        <button onclick="${btnArgs}" 
                            class="text-[9px] text-slate-500 hover:text-red-400 bg-slate-800 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 px-2 py-1 rounded-lg transition-all font-bold uppercase tracking-wide">
                            Borrar
                        </button>
                    </div>
                </div>
            `}).join('');
        }
    }

    window.applySancion = () => {
        const teamSel = document.getElementById('sancionTeamSelect');
        const catSel = document.getElementById('sancionCategorySelect');
        const ptsInput = document.getElementById('sancionPointsInput');
        if (!teamSel || !catSel || !ptsInput) return;

        const team = teamSel.value;
        const cat = catSel.value;
        const puntos = parseFloat(ptsInput.value);

        if (!team || !cat) { alert('Selecciona equipo y categoría.'); return; }
        if (isNaN(puntos) || puntos <= 0) { alert('Ingresa una cantidad de puntos válida (mayor a 0).'); return; }

        const branch = COMPETITIONS[currentCompetition].path;
        const ref = database.ref(`${branch}/${currentSeason}/sanciones/${cat}/${team}`);

        // Crear nueva entrada individual (push key)
        const today = new Date().toISOString().split('T')[0];
        ref.push({ pts: puntos, fecha: today }).then(() => {
            ptsInput.value = '';
            renderSancionesUI();
            alert(`✅ Quita aplicada: -${puntos} Pts a ${team} en ${cat}.`);
        }).catch(err => {
            console.error('Error al aplicar sanción:', err);
            alert('Error al aplicar la sanción.');
        });
    };

    window.removeSancion = (cat, team, key) => {
        if (!confirm(`¿Eliminar esta sanción de ${team} en ${cat}?`)) return;
        const branch = COMPETITIONS[currentCompetition].path;
        database.ref(`${branch}/${currentSeason}/sanciones/${cat}/${team}/${key}`).remove()
            .then(() => {
                renderSancionesUI();
                alert(`Sanción eliminada.`);
            })
            .catch(err => {
                console.error('Error al eliminar sanción:', err);
                alert('Error al eliminar la sanción.');
            });
    };

    // Compatibilidad: borrar sanción en formato antiguo (número directo)
    window.removeSancionLegacy = (cat, team) => {
        if (!confirm(`¿Eliminar TODAS las sanciones de ${team} en ${cat}?`)) return;
        const branch = COMPETITIONS[currentCompetition].path;
        database.ref(`${branch}/${currentSeason}/sanciones/${cat}/${team}`).remove()
            .then(() => {
                renderSancionesUI();
                alert(`Sanciones de ${team} en ${cat} eliminadas.`);
            })
            .catch(err => {
                console.error('Error al eliminar sanción:', err);
                alert('Error al eliminar la sanción.');
            });
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
            resetModalStyles(resultModal);
        }
    };

    window.closePendingModal = () => {
        const modal = document.getElementById('pendingMatchesModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            resetModalStyles(modal);
        }
    };

    window.savePendingMatchDate = (matchId, cat, inputId) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        const dateVal = input.value;

        const branch = COMPETITIONS[currentCompetition].path;
        let targetPath = `${branch}/${currentSeason}/etapa${currentStage}`;
        // Fallback para Etapa 1
        if (currentStage === '1' && (!allStagesData.etapa1 || !allStagesData.etapa1.fixture)) {
            targetPath = `${branch}/${currentSeason}`;
        }

        const ref = database.ref(`${targetPath}/${cat}/resultados/${matchId}`);
        if (dateVal) {
            ref.update({
                status: 'pending',
                fechaPendiente: dateVal
            }).then(() => {
                alert('Fecha guardada correctamente.');
                // showPendingMatches se llama para reflejar el cambio en el modal abierto
                showPendingMatches();
            }).catch(err => {
                console.error("Error al guardar la fecha:", err);
                alert('Error al guardar la fecha.');
            });
        } else {
            ref.child('fechaPendiente').remove().then(() => {
                alert('Fecha programada eliminada.');
                showPendingMatches();
            }).catch(err => {
                console.error("Error al eliminar la fecha:", err);
                alert('Error al eliminar la fecha.');
            });
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
                checkRole(user);
                loadSeasons();
            } else {
                // Si no hay usuario, evaluamos si intentamos login silencioso o mostramos el modal
                if (!isFromIndex) {
                    // Intento de login silencioso para acceso directo (cuenta pública)
                    auth.signInWithEmailAndPassword(GUEST_EMAIL, '12345678').catch(err => {
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

    function checkRole(user) {
        if (!user) {
            currentUserRole = 'user';
            updateAdminUI();
            updateUI();
            return;
        }

        if (typeof user === 'string') {
            // Legacy fallback: a UID string was passed instead of the user object.
            database.ref('admins/' + user).once('value').then(snap => {
                if (snap.exists()) {
                    currentUserRole = 'admin';
                } else {
                    currentUserRole = 'user';
                }
                updateAdminUI();
                updateUI();
            });
            return;
        }

        if (!user.email) {
            currentUserRole = 'user';
            updateAdminUI();
            updateUI();
            return;
        }

        if (user.email.toLowerCase() === GUEST_EMAIL) {
            currentUserRole = 'user';
            updateAdminUI();
            updateUI();
            return;
        }

        database.ref('admins/' + user.uid).once('value').then(snap => {
            currentUserRole = snap.exists() ? 'admin' : 'user';
            updateAdminUI();
            updateUI();
        }).catch(err => {
            console.error('Error al verificar rol de usuario:', err);
            currentUserRole = 'user';
            updateAdminUI();
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
                const data = snap.val();
                const seasons = Object.keys(data).sort().reverse();
                if (seasonSelect) {
                    seasonSelect.innerHTML = seasons.map(s => `<option value="${s}">${s}</option>`).join('');

                    // 1. Intentar usar la guardada para esta rama específica (localStorage por rama)
                    // 2. Fallback: buscar cuál está marcada como activa en Firebase
                    const savedSeason = localStorage.getItem(`lastSeason_${currentCompetition}`);

                    if (savedSeason && seasons.includes(savedSeason)) {
                        currentSeason = savedSeason;
                        seasonSelect.value = savedSeason;
                    } else {
                        // Fallback: Buscar cuál está marcada como activa en la base de datos
                        let activeSeason = seasons[0];
                        for (const s of seasons) {
                            if (data[s] && data[s].activa === true) {
                                activeSeason = s;
                                break;
                            }
                        }
                        currentSeason = activeSeason;
                        seasonSelect.value = activeSeason;
                    }

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

        let isFirstLoad = true;

        currentDataRef.on('value', snap => {
            const data = snap.val() || {};
            allStagesData = data; // Guardamos todo para cálculos de arrastre
            
            if (isFirstLoad) {
                applySavedStagePreference(data);
                isFirstLoad = false;
            }

            refreshData(data);
        });
    }

    function refreshData(data) {
        if (!data) data = allStagesData || {};

        // Determinar qué datos usar para la etapa actual
        let stageKey = `etapa${currentStage}`;
        let stageData = data[stageKey];

        // Fallback para Etapa 1 (si no existe el nodo etapa1, usamos la raíz para compatibilidad)
        if (currentStage === '1' && (!stageData || !stageData.fixture)) {
            stageData = data;
        } else if (!stageData) {
            stageData = {};
        }

        // Cargar la lista de equipos de la etapa actual.
        // El fallback a data.equipos (raíz) solo aplica a Etapa 1 (formato legacy).
        // En Etapa 2+ NUNCA se cae a la raíz, para evitar que equipos descendidos aparezcan.
        if (stageData.equipos) {
            teamsList = Object.values(stageData.equipos);
        } else if (currentStage === '1' && data.equipos) {
            teamsList = Object.values(data.equipos); // Legacy: Etapa 1 guardada en raíz
        } else {
            teamsList = ['DEFENSOR SPORTING']; // Mínimo por defecto
        }
        // Debug: mostrar equipos cargados para la etapa actual
        console.log(`[DEBUG] teamsList cargada para Etapa ${currentStage}:`, teamsList);

        sharedFixture = stageData.fixture || {};
        allResults = {};

        const categories = COMPETITIONS[currentCompetition].categories
            .filter(c => c.id !== 'ACUMULADA')
            .map(c => c.id);

        categories.forEach(cat => {
            allResults[cat] = (stageData[cat] && stageData[cat].resultados) ? stageData[cat].resultados : {};
        });
        updateUI();
    }

    // --- CÁLCULOS ---
    function calculateStandingsForData(stageData, teams, category, isAcumContext = false) {
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
                let fibaConfig = ['U16', 'U18', 'U20']; // Fallback por defecto
                if (allStagesData.config && allStagesData.config.fibaCategories) {
                    fibaConfig = Object.keys(allStagesData.config.fibaCategories).filter(k => allStagesData.config.fibaCategories[k]);
                }
                isFibaLogic = (category === 'ACUMULADA' || isAcumContext) ? fibaConfig.includes(cat) : ['U12', 'U14', 'U16', 'U18', 'U20'].includes(cat);
            } else if (currentCompetition === 'FEM') {
                isFibaLogic = ['U14', 'U16', 'U19'].includes(cat);
            } else if (currentCompetition === 'LFB') {
                isFibaLogic = true;
            }

            const teamSet = new Set(teams); // Conjunto de equipos válidos para esta etapa
            Object.entries(results).forEach(([matchId, res]) => {
                const fix = fixture[matchId];
                if (!fix || res.status !== 'played') return;
                const h = fix.home; const a = fix.away;

                // Solo procesar partidos donde ambos equipos pertenecen a esta etapa.
                // Esto evita que equipos descendidos (ej. de Etapa 1 en datos raíz)
                // aparezcan como "colados" en la tabla de la etapa siguiente.
                if (!teamSet.has(h) || !teamSet.has(a)) return;

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

        // --- APLICACIÓN DE SANCIONES ---
        const sanciones = allStagesData.sanciones || {};
        
        Object.keys(standings).forEach(teamName => {
            let quitaTotal = 0;
            if (category === 'ACUMULADA' || isAcumContext) {
                // En el acumulativo general, se suman todas las quitas de todas las categorías
                const categoriesToProcess = COMPETITIONS[currentCompetition].categories.filter(c => c.id !== 'ACUMULADA').map(c => c.id);
                categoriesToProcess.forEach(cat => {
                    quitaTotal += getSancionTotal(cat, teamName);
                });
            } else {
                // En una categoría individual, se resta únicamente la quita de esa categoría
                quitaTotal = getSancionTotal(category, teamName);
            }
            
            standings[teamName].ptsSancion = quitaTotal; // Almacenar para uso en UI
            standings[teamName].pts -= quitaTotal; // Restar sanción
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
        const fixtureView = document.getElementById('fixtureView');
        const notice = document.getElementById('acumuladaNotice');

        // Determinar si la etapa actual tiene datos
        let stageKey = `etapa${currentStage}`;
        let stageData = allStagesData[stageKey];
        if (currentStage === '1' && (!stageData || !stageData.fixture)) stageData = allStagesData;
        const hasFixture = !!(stageData && stageData.fixture);

        // Si la etapa no existe (excepto Etapa 1 que tiene fallback), mostrar aviso y ocultar todo
        if (!hasFixture && currentStage !== '1') {
            if (tableView) tableView.classList.add('hidden');
            if (fixtureView) fixtureView.classList.add('hidden');
            if (fixtureGrid) fixtureGrid.innerHTML = '';
            if (notice) {
                notice.innerHTML = `<div class="py-12"><p class="text-slate-400 font-medium">La ${currentStage === '3' ? 'etapa de Play Offs' : `Etapa ${currentStage}`} aún no ha sido cargada.</p></div>`;
                notice.classList.remove('hidden');
            }
            const btnGeneral = document.getElementById('pendingBtnGeneral');
            if (btnGeneral) btnGeneral.classList.add('hidden');
            return;
        }

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
        if (colG) colG.className = `px-6 py-4 font-semibold text-center ${showGP ? 'hidden md:table-cell' : 'hidden'}`;
        if (colP) colP.className = `px-6 py-4 font-semibold text-center ${showGP ? 'hidden md:table-cell' : 'hidden'}`;

        if (tableBody) {
            tableBody.innerHTML = standings.map((team, index) => `
                <tr class="${team.name === 'DEFENSOR SPORTING' ? 'bg-violet-900/20' : ''}">
                    <td class="px-6 py-4 font-mono text-sm"><span class="pos-${index + 1}">${index + 1}</span></td>
                    <td class="px-6 py-4 font-bold text-white cursor-pointer hover:text-violet-400 transition-colors" onclick="showTeamResults('${team.name}')">${team.name}</td>
                    <td class="px-6 py-4 text-center">${team.pj}</td>
                    <td class="px-6 py-4 text-center ${showGP ? 'hidden md:table-cell' : 'hidden'}">${team.g}</td>
                    <td class="px-6 py-4 text-center ${showGP ? 'hidden md:table-cell' : 'hidden'}">${team.p}</td>
                    <td class="px-6 py-4 text-center font-black text-violet-400 text-lg">
                        ${team.pts.toFixed(1).replace('.0', '')}
                        ${team.ptsSancion > 0 ? `<span class="block text-[10px] text-red-400 font-bold tracking-tight">-${team.ptsSancion} Pts</span>` : ''}
                    </td>
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
        if (!categorySelect) {
            console.error('showTeamResults: categorySelect no disponible');
            return;
        }
        const category = categorySelect.value;
        
        if (category === 'ACUMULADA') {
            const title = document.getElementById('teamModalTitle');
            const container = document.getElementById('teamResultsContainer');
            const modal = document.getElementById('teamResultsModal');
            if (!modal || !container) {
                console.error('showTeamResults: teamResultsModal o teamResultsContainer no disponible', { modal, container });
                return;
            }

            title.textContent = `Desglose: ${teamName}`;

            // 1. Obtener la data de la etapa actual
            let stageKey = `etapa${currentStage}`;
            let stageData = allStagesData[stageKey];
            if (currentStage === '1' && (!stageData || !stageData.fixture)) stageData = allStagesData;
            if (!stageData) stageData = {};

            // 2. Obtener categorías de la competencia actual
            const categories = COMPETITIONS[currentCompetition].categories.filter(c => c.id !== 'ACUMULADA');

            let totalEtapaActual = 0;
            let html = '<div class="space-y-4">';

            // Encabezado informativo
            html += `
                <div class="p-4 rounded-2xl bg-slate-800/20 border border-slate-800/30 text-center">
                    <span class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Desglose de puntos en Etapa ${currentStage === '3' ? 'Play Offs' : currentStage}</span>
                </div>
            `;

            // 3. Procesar y calcular puntos por cada categoría individual
            categories.forEach(catObj => {
                const catStandings = calculateStandingsForData(stageData, teamsList, catObj.id, true);
                const teamCatData = catStandings[teamName] || { pj: 0, g: 0, p: 0, pts: 0 };
                
                totalEtapaActual += teamCatData.pts;
                const showGP = catObj.id !== 'U11'; // Evitar mostrar ganados/perdidos en U11 si no aplica

                html += `
                    <div class="p-4 rounded-2xl border border-slate-800 bg-slate-900/30 flex justify-between items-center hover:scale-[1.01] transition-all duration-200">
                        <div class="flex flex-col">
                            <span class="text-sm font-bold text-white">${catObj.name}</span>
                            <span class="text-[10px] text-slate-500 font-bold uppercase mt-0.5 tracking-wide">
                                ${teamCatData.pj} PJ ${showGP ? `• ${teamCatData.g} G • ${teamCatData.p} P` : ''}
                            </span>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-base font-black text-violet-400">${teamCatData.pts} Pts</span>
                        </div>
                    </div>
                `;
            });

            // 4. Procesar arrastre si es Etapa 2
            let ptsArrastre = 0;
            let s1Total = 0;
            let factor = 0;

            if (currentStage === '2') {
                let stage1Data = allStagesData.etapa1;
                if (!stage1Data || !stage1Data.fixture) stage1Data = allStagesData;

                const stage1Standings = calculateStandingsForData(stage1Data, teamsList, 'ACUMULADA');
                const s1 = stage1Standings[teamName];
                
                const config = stageData.config || { carryOver: 0 };
                factor = parseFloat(config.carryOver) || 0;

                if (s1) {
                    s1Total = s1.pts;
                    ptsArrastre = s1.pts * factor;
                }

                if (ptsArrastre > 0 || factor > 0) {
                    html += `
                        <div class="p-4 rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 flex justify-between items-center mt-2 hover:scale-[1.01] transition-all duration-200">
                            <div class="flex flex-col">
                                <span class="text-sm font-bold text-amber-500">Arrastre de Etapa 1</span>
                                <span class="text-[10px] text-slate-500 font-bold uppercase mt-0.5 tracking-wide">
                                    ${s1Total} Pts base × ${factor * 100}% Arrastre
                                </span>
                            </div>
                            <div class="flex items-center gap-3">
                                <span class="text-base font-black text-amber-500">+${ptsArrastre.toFixed(1)} Pts</span>
                            </div>
                        </div>
                    `;
                }
            }

            const ptsFinales = totalEtapaActual + ptsArrastre;

            // 5. Sanciones acumuladas del equipo en la tabla general
            const sanciones = allStagesData.sanciones || {};
            let sancionTotal = 0;
            const categoriasComp = COMPETITIONS[currentCompetition].categories.filter(c => c.id !== 'ACUMULADA').map(c => c.id);
            categoriasComp.forEach(cat => {
                sancionTotal += getSancionTotal(cat, teamName);
            });

            if (sancionTotal > 0) {
                html += `
                    <div class="p-4 rounded-2xl border border-dashed border-red-500/30 bg-red-500/5 flex justify-between items-center mt-2 hover:scale-[1.01] transition-all duration-200">
                        <div class="flex flex-col">
                            <span class="text-sm font-bold text-red-400">Sanciones Aplicadas</span>
                            <span class="text-[10px] text-slate-500 font-bold uppercase mt-0.5 tracking-wide">Quita de puntos acumulativa</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-base font-black text-red-400">-${sancionTotal} Pts</span>
                        </div>
                    </div>
                `;
            }

            const ptsFinal = ptsFinales - sancionTotal;

            // 6. Totalizador del equipo
            html += `
                <div class="h-px bg-slate-800 my-4"></div>
                <div class="p-4 rounded-2xl bg-violet-950/20 border border-violet-800/30 flex justify-between items-center shadow-lg shadow-violet-950/10 hover:scale-[1.01] transition-all duration-200">
                    <div class="flex flex-col">
                        <span class="text-sm font-bold text-white">Total Acumulado</span>
                        <span class="text-[10px] text-violet-400 font-bold uppercase mt-0.5 tracking-wide">
                            ${totalEtapaActual} Etapa ${currentStage} ${ptsArrastre > 0 ? `+ ${ptsArrastre.toFixed(1)} Arrastre` : ''}${sancionTotal > 0 ? ` - ${sancionTotal} Sanción` : ''}
                        </span>
                    </div>
                    <span class="text-xl font-black text-violet-400">${ptsFinal.toFixed(1)} Pts</span>
                </div>
            </div>
            `;

            container.innerHTML = html;
            // Asegurar que el panel de administración no bloquee la interacción
            if (adminModal) { adminModal.classList.add('hidden'); adminModal.classList.remove('flex'); }
            ensureModalOnTop(modal, 'teamResultsModal');
            modal.style.zIndex = 2147483647;
            modal.style.pointerEvents = 'auto';
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            return;
        }

        const results = allResults[category] || {};
        const title = document.getElementById('teamModalTitle');
        const container = document.getElementById('teamResultsContainer');
        const modal = document.getElementById('teamResultsModal');
        if (!modal || !container) return;

        // Si estamos en la Tabla General (ACUMULADA), mostramos el desglose por categorías
        const currentCat = categorySelect ? categorySelect.value : category;
        if (currentCat === 'T. GENERAL') {
            title.textContent = `${teamName} - Puntos por Categoría`;
            const cats = (COMPETITIONS[currentCompetition] && COMPETITIONS[currentCompetition].categories) || [];
            const rows = cats.filter(c => c.id !== 'ACUMULADA').map(c => {
                const standings = calculateTable(c.id);
                const teamRow = standings.find(s => s.name === teamName);
                const pts = teamRow ? Number(teamRow.pts || 0) : 0;
                const ptsArrastre = teamRow && teamRow.ptsArrastre ? Number(teamRow.ptsArrastre) : 0;
                const ptsSancion = teamRow && teamRow.ptsSancion ? Number(teamRow.ptsSancion) : 0;
                // Mostrar valores claros: bruto, arrastre, sanción
                return `
                    <div class="bg-slate-800/20 p-4 rounded-2xl border border-slate-800/30 flex items-center justify-between">
                        <div class="text-sm font-bold">${c.name}</div>
                        <div class="text-right">
                            <div class="font-black text-violet-400">${(pts).toFixed(1).replace('.0','')}</div>
                            <div class="text-[10px] text-slate-400">Arrastre: ${ptsArrastre ? ptsArrastre.toFixed(1).replace('.0','') : '0'} · Sanción: ${ptsSancion ? ('-' + ptsSancion) : '0'}</div>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = rows || '<div class="text-slate-400">No hay datos por categoría.</div>';
            ensureModalOnTop(modal, 'teamResultsModal');
            return;
        }

        title.textContent = `${teamName} - ${category}`;
        const myMatches = Object.entries(sharedFixture).filter(([id, f]) => f.home === teamName || f.away === teamName).sort((a, b) => (a[1].jornada || 1) - (b[1].jornada || 1));

        container.innerHTML = myMatches.map(([id, f]) => {
            const r = results[id];
            const isHome = f.home === teamName;
            const rival = isHome ? f.away : f.home;

            if (!r || r.status !== 'played') {
                // Partido pendiente
                const hasFecha = r && r.fechaPendiente;
                let isPast = false;
                if (hasFecha) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const scheduledDate = new Date(r.fechaPendiente + 'T00:00:00');
                    isPast = scheduledDate < today;
                }

                let label = 'PENDIENTE';
                let dateText = 'Sin fijar';
                let labelBadgeClass = 'bg-slate-850 text-slate-400 border border-slate-700';

                if (hasFecha) {
                    if (isPast) {
                        dateText = 'Verificar';
                        labelBadgeClass = 'bg-red-500/10 text-red-400 border border-red-500/25 animate-pulse';
                    } else {
                        dateText = r.fechaPendiente;
                        labelBadgeClass = 'bg-amber-500/10 text-amber-500 border border-amber-500/25';
                    }
                } else {
                    labelBadgeClass = 'bg-slate-800/40 text-slate-500 border border-slate-750/30';
                    dateText = 'Sin fijar';
                }

                return `
                    <div class="p-4 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 flex justify-between items-center group hover:border-slate-700 transition-colors">
                        <div class="flex flex-col">
                            <span class="text-[8px] uppercase font-bold opacity-60">Jornada ${f.jornada || 1}</span>
                            <span class="text-sm font-bold text-slate-300">${rival}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider hidden sm:inline">${isHome ? 'Local' : 'Visitante'}</span>
                            <span class="text-[10px] font-black uppercase px-2 py-1 rounded-md ${labelBadgeClass}">
                                ${label}: ${dateText}
                            </span>
                        </div>
                    </div>
                `;
            }

            // Partido jugado
            const myScore = isHome ? r.scoreHome : r.scoreAway;
            const rivalScore = isHome ? r.scoreAway : r.scoreHome;
            const myNS = isHome ? r.homeNoShow : r.awayNoShow;
            const rivalNS = isHome ? r.awayNoShow : r.homeNoShow;

            let resultClass = 'bg-slate-800/40 text-slate-400 border-slate-700/50';
            let label = 'EMPATE';
            if (myNS) {
                resultClass = 'bg-red-500/10 text-red-500 border-red-500/20';
                label = 'PERDIDO (NP)';
            } else if (rivalNS) {
                resultClass = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
                label = 'GANADO (NP)';
            } else if (myScore > rivalScore) {
                resultClass = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
                label = 'GANADO';
            } else if (myScore < rivalScore) {
                resultClass = 'bg-red-500/10 text-red-500 border-red-500/20';
                label = 'PERDIDO';
            }

            return `
                <div class="p-4 rounded-2xl border ${resultClass} flex justify-between items-center hover:scale-[1.01] transition-transform">
                    <div class="flex flex-col">
                        <span class="text-[8px] uppercase font-bold opacity-60">Jornada ${f.jornada || 1}</span>
                        <span class="text-sm font-bold text-white">${rival}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-lg font-black text-white">${myScore} - ${rivalScore}</span>
                        <span class="text-[10px] font-black uppercase px-2 py-1 rounded-md bg-white/5">${label}</span>
                    </div>
                </div>
            `;
        }).join('');
            // Asegurar que el panel de administración no bloquee la interacción
            if (adminModal) { adminModal.classList.add('hidden'); adminModal.classList.remove('flex'); }
            modal.style.zIndex = 9999;
            modal.style.pointerEvents = 'auto';
            // Force modal on top using helper and apply fallback if needed
            ensureModalOnTop(modal, 'teamResultsModal');
            try {
                const cx = Math.floor(window.innerWidth / 2);
                const cy = Math.floor(window.innerHeight / 2);
                const topEl = document.elementFromPoint(cx, cy);
                if (!modal.contains(topEl) && topEl !== modal) {
                    modal.style.position = 'fixed';
                    modal.style.top = '0';
                    modal.style.left = '0';
                    modal.style.width = '100vw';
                    modal.style.height = '100vh';
                    modal.style.zIndex = 2147483647;
                    modal.style.pointerEvents = 'auto';
                }
            } catch (e) { /* ignore */ }
        // Ensure modal overlay; minimal fallback without logging
        try {
            const cx = Math.floor(window.innerWidth / 2);
            const cy = Math.floor(window.innerHeight / 2);
            const topEl = document.elementFromPoint(cx, cy);
            if (!resultModal.contains(topEl) && topEl !== resultModal) {
                resultModal.style.position = 'fixed';
                resultModal.style.top = '0';
                resultModal.style.left = '0';
                resultModal.style.width = '100vw';
                resultModal.style.height = '100vh';
                resultModal.style.zIndex = 2147483647;
                resultModal.style.pointerEvents = 'auto';
            }
        } catch (e) { /* ignore */ }
    };

    window.closeTeamResultsModal = () => {
        const modal = document.getElementById('teamResultsModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            resetModalStyles(modal);
        }
    };

    window.showPendingMatches = () => {
        const container = document.getElementById('pendingMatchesContainer');
        const modal = document.getElementById('pendingMatchesModal');
        if (!container || !modal) {
            console.error('showPendingMatches: pendingMatchesContainer o pendingMatchesModal no disponible', { container, modal });
            return;
        }

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
                                ${pendingInJornada.map(m => {
                                    const matchRes = results[m.id] || {};
                                    const currentFecha = matchRes.fechaPendiente || '';
                                    
                                    // Determinar si la fecha es pasada
                                    let isPast = false;
                                    if (currentFecha) {
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        const scheduledDate = new Date(currentFecha + 'T00:00:00');
                                        isPast = scheduledDate < today;
                                    }

                                    let dateControlHtml = '';
                                    if (currentUserRole === 'admin') {
                                        const inputBorderClass = isPast ? 'border-red-500/50 focus:ring-red-500' : 'border-slate-700 focus:ring-violet-500';
                                        const alertBadgeHtml = isPast ? `
                                            <span class="text-[8px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-md uppercase animate-pulse">
                                                Verificar
                                            </span>
                                        ` : '';
                                        
                                        const statusLabelHtml = !currentFecha ? `
                                            <span class="text-[8px] font-bold text-slate-500 bg-slate-500/5 px-1.5 py-0.5 rounded-md uppercase">
                                                Sin Fijar
                                            </span>
                                        ` : '';

                                        dateControlHtml = `
                                            <div class="flex flex-col gap-1 items-end">
                                                <div class="flex items-center gap-1.5">
                                                    ${statusLabelHtml}
                                                    ${alertBadgeHtml}
                                                </div>
                                                <div class="flex items-center gap-2 mt-1 sm:mt-0">
                                                    <input type="date" id="date-pending-${m.id}-${cat}" value="${currentFecha}" 
                                                        class="bg-slate-900 border ${inputBorderClass} rounded-xl px-2 py-1 text-[11px] text-white outline-none">
                                                    <button onclick="savePendingMatchDate('${m.id}', '${cat}', 'date-pending-${m.id}-${cat}')" 
                                                        class="text-[9px] font-bold bg-violet-600 hover:bg-violet-500 text-white px-2.5 py-1.5 rounded-lg transition-all uppercase tracking-wider shrink-0 shadow-md">
                                                        Guardar
                                                    </button>
                                                </div>
                                            </div>
                                        `;
                                    } else {
                                        if (currentFecha) {
                                            if (isPast) {
                                                dateControlHtml = `
                                                    <span class="text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/25 px-2.5 py-1 rounded-lg shrink-0 mt-2 sm:mt-0 uppercase tracking-wider animate-pulse flex items-center gap-1">
                                                        ⚠️ Verificar
                                                    </span>
                                                `;
                                            } else {
                                                dateControlHtml = `
                                                    <span class="text-[9px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-lg shrink-0 mt-2 sm:mt-0 uppercase tracking-wider">
                                                        📅 Juega: ${currentFecha}
                                                    </span>
                                                `;
                                            }
                                        } else {
                                            dateControlHtml = `
                                                <span class="text-[9px] text-slate-500 bg-slate-800/20 border border-slate-700/30 px-2.5 py-1 rounded-lg shrink-0 mt-2 sm:mt-0 uppercase tracking-widest font-medium">
                                                    Sin Fijar
                                                </span>
                                            `;
                                        }
                                    }

                                    return `
                                        <div class="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 group hover:border-amber-500/30 transition-colors">
                                            <div class="flex flex-col">
                                                <span class="text-xs font-bold text-white">${m.home} vs ${m.away}</span>
                                            </div>
                                            <div class="flex flex-wrap items-center gap-3 justify-end">
                                                ${dateControlHtml}
                                                <button onclick="openJornadaModal(${j}, null, '${cat}')" 
                                                    class="text-[10px] font-bold text-amber-500 hover:text-amber-400 uppercase tracking-wider bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 transition-all shrink-0">
                                                    Ver Jornada
                                                </button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
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

        // Asegurar que el panel de administración no bloquee la interacción
        if (adminModal) { adminModal.classList.add('hidden'); adminModal.classList.remove('flex'); }
        modal.style.zIndex = 9999;
        modal.style.pointerEvents = 'auto';
        ensureModalOnTop(modal, 'pendingMatchesModal');
    };

    // --- JORNADA MODAL ---
    window.openJornadaModal = (jornada, specificMatchId = null, overrideCategory = null) => {
        closePendingModal();
        if (!categorySelect || !modalMatchTitle || !jornadaResultsContainer || !resultModal) {
            console.error('No se encontró uno de los elementos del modal de jornada:', { categorySelect, modalMatchTitle, jornadaResultsContainer, resultModal });
            return;
        }
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

        // Asegurar que el panel de administración no bloquee la interacción
        if (adminModal) { adminModal.classList.add('hidden'); adminModal.classList.remove('flex'); }
        resultModal.style.zIndex = 9999;
        resultModal.style.pointerEvents = 'auto';
        ensureModalOnTop(resultModal, 'resultModal');
        try {
            const cx = Math.floor(window.innerWidth / 2);
            const cy = Math.floor(window.innerHeight / 2);
            const topEl = document.elementFromPoint(cx, cy);
            if (!resultModal.contains(topEl) && topEl !== resultModal) {
                resultModal.style.position = 'fixed';
                resultModal.style.top = '0';
                resultModal.style.left = '0';
                resultModal.style.width = '100vw';
                resultModal.style.height = '100vh';
                resultModal.style.zIndex = 2147483647;
                resultModal.style.pointerEvents = 'auto';
            }
        } catch (e) { /* ignore */ }
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

                // Guardar la temporada actual de la rama que estamos abandonando
                if (currentSeason) {
                    localStorage.setItem(`lastSeason_${currentCompetition}`, currentSeason);
                }

                currentCompetition = tab.dataset.comp;
                // Limpiar currentSeason para que loadSeasons tome la de la nueva rama
                currentSeason = null;
                // Limpiar datos actuales
                teamsList = [];
                sharedFixture = {};
                allResults = {};

                updateCategorySelect(); // Primero actualizamos las categorías
                updateUI(); // Luego refrescamos la interfaz con la nueva categoría por defecto
                loadSeasons(); // Y finalmente conectamos a los datos
            });
        });

        if (seasonSelect) seasonSelect.addEventListener('change', () => {
            currentSeason = seasonSelect.value;
            // Guardar la temporada por rama en localStorage
            localStorage.setItem(`lastSeason_${currentCompetition}`, currentSeason);
            connectToSeason(currentSeason);
        });
        if (stageSelect) stageSelect.addEventListener('change', () => {
            currentStage = stageSelect.value;
            saveCurrentStagePreference(); // Fire and forget
            if (allStagesData) {
                refreshData(allStagesData);
            }
        });
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
            let input = selectedFileContent ? selectedFileContent.trim() : '';

            if (!input) {
                alert('Por favor, selecciona un archivo CSV.');
                return;
            }

            const branch = COMPETITIONS[currentCompetition].path;
            const cat = categorySelect.value;
            const isAcum = cat === 'ACUMULADA';
            const allBranchCategories = COMPETITIONS[currentCompetition].categories
                .filter(c => c.id !== 'ACUMULADA')
                .map(c => c.id);
            const targetStage = document.getElementById('importStageSelect').value;
            const stageNode = `${branch}/${currentSeason}/etapa${targetStage}`;

            if (!confirm(`¿Importar fixture para la Etapa ${targetStage}? Se borrarán los datos actuales de esta etapa.`)) return;

            const lines = input.split('\n');
            const updates = {};
            const newFix = {};
            const uniqueTeams = new Set();
            let mCount = 1;

            // 1. Procesar líneas del CSV
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

                        const hasMultiCatScores = parts.length >= (3 + allBranchCategories.length * 2);
                        
                        if (isAcum || hasMultiCatScores) {
                            allBranchCategories.forEach((c, i) => {
                                const rawH = parts[3 + i * 2];
                                const rawA = parts[4 + i * 2];

                                if (rawH !== undefined && rawA !== undefined && rawH.trim() !== "" && rawA.trim() !== "") {
                                    const sH = parseInt(rawH) || 0;
                                    const sA = parseInt(rawA) || 0;

                                    if (sH === 0 && sA === 0 && c !== 'U11') return;

                                    const resNode = `${stageNode}/${c}/resultados`;
                                    if (!updates[resNode]) updates[resNode] = {}; // Inicializar objeto si no existe

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
                                const sH = parseInt(rawH) || 0;
                                const sA = parseInt(rawA) || 0;

                                if (!(sH === 0 && sA === 0 && cat !== 'U11')) {
                                    const resNode = `${stageNode}/${cat}/resultados`;
                                    if (!updates[resNode]) updates[resNode] = {};

                                    updates[resNode][mCount] = {
                                        scoreHome: (cat === 'U11') ? 0 : sH,
                                        scoreAway: (cat === 'U11') ? 0 : sA,
                                        status: 'played',
                                        homeNoShow: (sH === 0 && sA === 20),
                                        awayNoShow: (sH === 20 && sA === 0)
                                    };
                                }
                            }
                        }
                        mCount++;
                    }
                }
            });

            // 2. Preparar equipos y fixture final
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
            updates[`${branch}/${currentSeason}/config/lastStage`] = targetStage;

            // 3. Reemplazar la etapa seleccionada y guardar los datos nuevos
            database.ref(stageNode).remove().then(() => database.ref().update(updates)).then(() => {
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
                connectToSeason(currentSeason);
            }).catch(err => {
                console.error('Error al importar fixture:', err);
                alert('Error al importar el fixture. Revisa la consola para más detalles.');
            });
        });

        // --- SINCRONIZAR TABLAS FUBB ---
        const syncFubbBtn = document.getElementById('syncFubbBtn');
        if (syncFubbBtn) syncFubbBtn.addEventListener('click', () => syncFubbTables());

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

    // =========================================================================
    // --- FUNCIÓN: SINCRONIZAR TABLAS FUBB (Scraping Frontend con Proxy CORS) ---
    // =========================================================================
    async function syncFubbTables() {
        const TARGET_URL = 'https://competicionesfubb.gesdeportiva.es/competicion.aspx?delegacion=1';
        const CLUB_NAME  = 'DEFENSOR SPORTING';
        const FETCH_TIMEOUT_MS = 20000; // 20s por intento

        // --- Helpers de UI ---
        const btn     = document.getElementById('syncFubbBtn');
        const btnText = document.getElementById('syncFubbBtnText');
        const icon    = document.getElementById('syncFubbIcon');
        const spinner = document.getElementById('syncFubbSpinner');

        function setSyncing(active) {
            if (!btn) return;
            btn.disabled = active;
            if (btnText) btnText.textContent = active ? 'Sincronizando...' : 'SINCRONIZAR TABLAS FUBB';
            if (icon)    icon.classList.toggle('hidden', active);
            if (spinner) spinner.classList.toggle('hidden', !active);
        }

        // --- Inicio ---
        setSyncing(true);
        console.log('[SyncFUBB] Iniciando sincronización...');

        const corsReady = await ensureCorsAnywhere();
        if (!corsReady) {
            setSyncing(false);
            return; // El usuario canceló
        }

        let htmlText = null;
        let lastError = null;

        // 1. Intentar cada proxy hasta obtener el HTML inicial (carga GET de la primera categoría)
        for (let i = 0; i < PROXIES.length; i++) {
            const proxy = PROXIES[i];
            const proxyUrl = proxy.buildUrl(TARGET_URL);
            console.log(`[SyncFUBB] Proxy ${i + 1}/${PROXIES.length}: ${proxyUrl}`);
            try {
                const headers = { ...BROWSER_HEADERS, ...(proxy.extraHeaders || {}) };
                const res = await fetchWithTimeout(proxyUrl, { headers, cache: 'no-store' }, FETCH_TIMEOUT_MS);

                if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

                if (proxy.isJson) {
                    const json = await res.json();
                    htmlText = json[proxy.jsonKey] || json.contents || json.body || null;
                } else {
                    htmlText = await res.text();
                }

                // Validar que el HTML sea del sitio real
                if (htmlText && htmlText.length > 1000 && (htmlText.includes('gesdeportiva') || htmlText.includes('<table') || htmlText.includes('competicion'))) {
                    console.log(`[SyncFUBB] ✅ HTML inicial válido (${htmlText.length} chars) via proxy ${i + 1}.`);
                    break;
                } else if (htmlText && htmlText.length > 500) {
                    console.warn(`[SyncFUBB] HTML obtenido pero sin marcadores esperados (${htmlText.length} chars). Intentando parsear...`);
                    break;
                } else {
                    throw new Error('Respuesta vacía o demasiado corta.');
                }
            } catch (err) {
                lastError = err;
                const reason = err.name === 'AbortError' ? `Timeout (${FETCH_TIMEOUT_MS / 1000}s)` : err.message;
                console.warn(`[SyncFUBB] Proxy ${i + 1} falló: ${reason}`);
                htmlText = null;
            }
        }

        if (!htmlText) {
            setSyncing(false);
            alert(
                '❌ No se pudo obtener los datos de la FUBB.\n\n' +
                'Todos los proxies públicos fallaron. Esto puede ocurrir por:\n' +
                '• El sitio FUBB está caído o cambió su URL.\n' +
                '• Los proxies tienen límite de peticiones alcanzado.\n\n' +
                `Último error: ${lastError ? lastError.message : 'Desconocido'}`
            );
            return;
        }

        // 2. Parsear el HTML inicial para extraer los campos ASP.NET y las categorías disponibles
        const parser = new DOMParser();
        let initialDoc;
        try {
            initialDoc = parser.parseFromString(htmlText, 'text/html');
        } catch (parseErr) {
            setSyncing(false);
            alert('❌ Error al procesar el HTML recibido: ' + parseErr.message);
            return;
        }

        // Leer campos ocultos ASP.NET (necesarios para POST)
        const getHiddenVal = (doc, id) => (doc.getElementById(id) || {}).value || '';
        let viewState          = getHiddenVal(initialDoc, '__VIEWSTATE');
        let viewStateGenerator = getHiddenVal(initialDoc, '__VIEWSTATEGENERATOR');
        let eventValidation    = getHiddenVal(initialDoc, '__EVENTVALIDATION');

        console.log('[SyncFUBB] ViewState obtenido:', viewState.length > 0 ? `${viewState.length} chars` : 'VACÍO');

        // 3. Mapa: fragmento del texto del select → { cat Firebase, es femenino }
        const OPTION_TO_FIREBASE = [
            { match: 'U20 Masculino', cat: 'U20', fem: false },
            { match: 'U18 Masculino', cat: 'U18', fem: false },
            { match: 'U16 Masculino', cat: 'U16', fem: false },
            { match: 'U14 Masculino', cat: 'U14', fem: false },
            { match: 'U12 Mixta',     cat: 'U12', fem: false },
            { match: 'U11 Mixta',     cat: 'U11', fem: false },
            { match: 'U19 Femenina',  cat: 'U19', fem: true  },
            { match: 'U16 Femenino',  cat: 'U16', fem: true  },
            { match: 'U14 Femenino',  cat: 'U14', fem: true  },
            { match: 'U12 Femenino',  cat: 'U12', fem: true  },
            { match: 'Liga Femenina', cat: 'LFB', fem: true  },
            { match: 'LFB',           cat: 'LFB', fem: true  },
            { match: 'Liga de Desarrollo', cat: 'LDD', fem: false },
            { match: 'LDD',                cat: 'LDD', fem: false },
            { match: 'Liga Uruguaya',      cat: 'LUB', fem: false },
            { match: 'LUB',                cat: 'LUB', fem: false },
        ];

        // Si estamos en LFB, hacer POST para cambiar a competición LFB y obtener sus categorías
        if (currentCompetition === 'LFB') {
            const postProxy = PROXIES.find(p => p.supportsPost) || PROXIES[0];
            const postHeaders = { ...BROWSER_HEADERS, ...(postProxy.extraHeaders || {}), 'Content-Type': 'application/x-www-form-urlencoded' };
            const bodyStep = new URLSearchParams({
                '__EVENTTARGET':        'DDLCompeticiones',
                '__EVENTARGUMENT':      '',
                '__LASTFOCUS':          '',
                '__VIEWSTATE':          viewState,
                '__VIEWSTATEGENERATOR': viewStateGenerator,
                '__EVENTVALIDATION':    eventValidation,
                'DDLCompeticiones':     '149',
                'DDLCategorias':        '',
                'DDLFases':             '',
                'DDLGrupos':            '',
            });
            try {
                const resLfb = await fetchWithTimeout(postProxy.buildUrl(TARGET_URL), { method: 'POST', headers: postHeaders, body: bodyStep.toString(), cache: 'no-store' }, FETCH_TIMEOUT_MS);
                if (resLfb.ok) {
                    htmlText = await resLfb.text();
                    initialDoc = parser.parseFromString(htmlText, 'text/html');
                    viewState          = getHiddenVal(initialDoc, '__VIEWSTATE') || viewState;
                    viewStateGenerator = getHiddenVal(initialDoc, '__VIEWSTATEGENERATOR') || viewStateGenerator;
                    eventValidation    = getHiddenVal(initialDoc, '__EVENTVALIDATION') || eventValidation;
                }
            } catch(e) {
                console.warn('[SyncFUBB] Error al cambiar competición a LFB:', e);
            }
        }

        // Leer las categorías del select #DDLCategorias
        const catSelect = initialDoc.getElementById('DDLCategorias');
        let availableOptions = catSelect
            ? Array.from(catSelect.querySelectorAll('option')).map(o => ({
                value: o.value,
                text: (o.textContent || '').trim(),
                selected: o.hasAttribute('selected') || o.selected,
              }))
            : [];

        // Filtrar opciones para sincronizar SOLO las de la rama actual (Masculino, Femenino o LFB)
        availableOptions = availableOptions.filter(opt => {
            const mapped = OPTION_TO_FIREBASE.find(entry => opt.text.toUpperCase().includes(entry.match.toUpperCase()));
            if (!mapped) return false;
            if (currentCompetition === 'MASC') return !mapped.fem && mapped.cat !== 'LFB' && mapped.cat !== 'LDD' && mapped.cat !== 'LUB';
            if (currentCompetition === 'FEM') return mapped.fem && mapped.cat !== 'LFB' && mapped.cat !== 'LDD' && mapped.cat !== 'LUB';
            if (currentCompetition === 'LFB') return mapped.cat === 'LFB';
            if (currentCompetition === 'LDD') return mapped.cat === 'LDD';
            if (currentCompetition === 'LUB') return mapped.cat === 'LUB';
            return false;
        });

        console.log('[SyncFUBB] Categorías a sincronizar:', availableOptions.map(o => o.text));

        if (availableOptions.length === 0) {
            setSyncing(false);
            alert('❌ No se encontraron categorías para la rama seleccionada en FUBB.\nSi estás en LFB, puede requerir configuración adicional.');
            return;
        }

        // Encontrar el proxy que soporta POST (cors-anywhere)
        const postProxy = PROXIES.find(p => p.supportsPost);
        if (!postProxy) {
            setSyncing(false);
            alert('❌ No hay proxy disponible que soporte POST.\nVisita https://cors-anywhere.herokuapp.com/corsdemo y luego reintenta.');
            return;
        }

        // Helper: obtener el HTML de una categoría vía scraping ASP.NET
        // Para cada categoría que no sea la default (U20), hace:
        //   1. GET fresco → obtiene ViewState limpio con la categoría default
        //   2. POST cambiando DDLCategorias → obtiene las fases de la categoría deseada
        //   3. POST seleccionando la primera fase → obtiene la clasificación/calendario
        async function fetchCategory(catValue, isFirstLoad, currentHtml) {
            if (isFirstLoad && currentHtml) {
                console.log(`[SyncFUBB] Reutilizando HTML inicial para la 1ª categoría.`);
                return currentHtml;
            }

            const headers = {
                ...BROWSER_HEADERS,
                ...(postProxy.extraHeaders || {}),
            };

            // PASO 1: GET fresco para obtener un ViewState limpio
            console.log(`[SyncFUBB] [Cat ${catValue}] Paso 1: GET fresco...`);
            const proxyUrl = postProxy.buildUrl(TARGET_URL);
            const resGet = await fetchWithTimeout(proxyUrl, { headers, cache: 'no-store' }, FETCH_TIMEOUT_MS);
            if (!resGet.ok) throw new Error(`GET falló: HTTP ${resGet.status}`);
            const htmlGet = await resGet.text();
            if (!htmlGet || htmlGet.length < 500) throw new Error('GET devolvió respuesta vacía');

            const docGet = parser.parseFromString(htmlGet, 'text/html');
            let freshVS  = getHiddenVal(docGet, '__VIEWSTATE');
            let freshVSG = getHiddenVal(docGet, '__VIEWSTATEGENERATOR');
            let freshEV  = getHiddenVal(docGet, '__EVENTVALIDATION');

            if (!freshVS) throw new Error('No se obtuvo ViewState del GET fresco');

            // Usar siempre la fase/grupo por defecto de FUBB (la activa)
            let compValue = '141';
            if (currentCompetition === 'LFB') compValue = '149';

            // PASO 2: POST cambiar categoría
            console.log(`[SyncFUBB] [Cat ${catValue}] Paso 2: POST cambiar categoría...`);
            const postHeaders = { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' };

            const bodyStep1 = new URLSearchParams({
                '__EVENTTARGET':        'DDLCategorias',
                '__EVENTARGUMENT':      '',
                '__LASTFOCUS':          '',
                '__VIEWSTATE':          freshVS,
                '__VIEWSTATEGENERATOR': freshVSG,
                '__EVENTVALIDATION':    freshEV,
                'DDLCompeticiones':     compValue,
                'DDLCategorias':        catValue,
                'DDLFases':             '',
                'DDLGrupos':            '',
            });

            const res1 = await fetchWithTimeout(proxyUrl, { method: 'POST', headers: postHeaders, body: bodyStep1.toString(), cache: 'no-store' }, FETCH_TIMEOUT_MS);
            if (!res1.ok) throw new Error(`POST cat falló: HTTP ${res1.status}`);
            const html1 = await res1.text();
            
            const doc1 = parser.parseFromString(html1, 'text/html');
            freshVS  = getHiddenVal(doc1, '__VIEWSTATE') || freshVS;
            freshVSG = getHiddenVal(doc1, '__VIEWSTATEGENERATOR') || freshVSG;
            freshEV  = getHiddenVal(doc1, '__EVENTVALIDATION') || freshEV;

            const faseSelect = doc1.getElementById('DDLFases');
            let targetFase = '';
            if (faseSelect) {
                // Usar la primera fase disponible (la activa por defecto en FUBB)
                targetFase = (faseSelect.querySelector('option:not([value=""])') || faseSelect.querySelector('option') || {value:''}).value;
            }

            if (!targetFase) {
                console.log(`[SyncFUBB] [Cat ${catValue}] No hay fases, fin.`);
                viewState = freshVS; viewStateGenerator = freshVSG; eventValidation = freshEV;
                return html1;
            }

            await new Promise(r => setTimeout(r, 600));

            // PASO 3: POST cambiar fase
            console.log(`[SyncFUBB] [Cat ${catValue}] Paso 3: POST seleccionar fase [${targetFase}]...`);
            const bodyStep2 = new URLSearchParams({
                '__EVENTTARGET':        'DDLFases',
                '__EVENTARGUMENT':      '',
                '__LASTFOCUS':          '',
                '__VIEWSTATE':          freshVS,
                '__VIEWSTATEGENERATOR': freshVSG,
                '__EVENTVALIDATION':    freshEV,
                'DDLCompeticiones':     compValue,
                'DDLCategorias':        catValue,
                'DDLFases':             targetFase,
                'DDLGrupos':            '',
            });

            const res2 = await fetchWithTimeout(proxyUrl, { method: 'POST', headers: postHeaders, body: bodyStep2.toString(), cache: 'no-store' }, FETCH_TIMEOUT_MS);
            if (!res2.ok) throw new Error(`POST fase falló: HTTP ${res2.status}`);
            const html2 = await res2.text();

            const doc2 = parser.parseFromString(html2, 'text/html');
            freshVS  = getHiddenVal(doc2, '__VIEWSTATE') || freshVS;
            freshVSG = getHiddenVal(doc2, '__VIEWSTATEGENERATOR') || freshVSG;
            freshEV  = getHiddenVal(doc2, '__EVENTVALIDATION') || freshEV;

            const grupoSelect = doc2.getElementById('DDLGrupos');
            let grupos = [];
            if (grupoSelect) {
                grupos = Array.from(grupoSelect.querySelectorAll('option:not([value=""])')).map(o => o.value);
            }

            if (grupos.length === 0) {
                console.log(`[SyncFUBB] [Cat ${catValue}] No hay grupos, fin.`);
                viewState = freshVS; viewStateGenerator = freshVSG; eventValidation = freshEV;
                return html2;
            }

            let bestHtml = null;

            for (let i = 0; i < grupos.length; i++) {
                const targetGrupo = grupos[i];
                await new Promise(r => setTimeout(r, 600));

                console.log(`[SyncFUBB] [Cat ${catValue}] Paso 4: POST seleccionar grupo [${targetGrupo}]...`);
                const bodyStep3 = new URLSearchParams({
                    '__EVENTTARGET':        'DDLGrupos',
                    '__EVENTARGUMENT':      '',
                    '__LASTFOCUS':          '',
                    '__VIEWSTATE':          freshVS,
                    '__VIEWSTATEGENERATOR': freshVSG,
                    '__EVENTVALIDATION':    freshEV,
                    'DDLCompeticiones':     compValue,
                    'DDLCategorias':        catValue,
                    'DDLFases':             targetFase,
                    'DDLGrupos':            targetGrupo,
                });

                const res3 = await fetchWithTimeout(proxyUrl, { method: 'POST', headers: postHeaders, body: bodyStep3.toString(), cache: 'no-store' }, FETCH_TIMEOUT_MS);
                if (!res3.ok) throw new Error(`POST grupo falló: HTTP ${res3.status}`);
                const html3 = await res3.text();
                
                if (i === 0) bestHtml = html3; // Guardar el primero como fallback

                // Verificar si Defensor está en este grupo
                const standings = parseClasificacion(html3, catValue + ` (Grupo ${targetGrupo})`);
                if (standings) {
                    const dscKey = Object.keys(standings).find(k => isDefensorSporting(k));
                    if (dscKey) {
                        console.log(`[SyncFUBB] ✅ Defensor Sporting encontrado en grupo ${targetGrupo}!`);
                        bestHtml = html3;
                        break; // Encontramos el grupo correcto, no seguimos buscando
                    }
                }
            }

            const doc3 = parser.parseFromString(bestHtml, 'text/html');
            viewState          = getHiddenVal(doc3, '__VIEWSTATE') || freshVS;
            viewStateGenerator = getHiddenVal(doc3, '__VIEWSTATEGENERATOR') || freshVSG;
            eventValidation    = getHiddenVal(doc3, '__EVENTVALIDATION') || freshEV;

            return bestHtml;
        }

        // Helper: parsear la tabla de clasificación del div#PClasificacion
        function parseClasificacion(html, catLabel) {
            let doc;
            try { doc = parser.parseFromString(html, 'text/html'); }
            catch (e) { return null; }

            // Actualizar ViewState para el próximo POST
            const newVS = getHiddenVal(doc, '__VIEWSTATE');
            if (newVS) {
                viewState          = newVS;
                viewStateGenerator = getHiddenVal(doc, '__VIEWSTATEGENERATOR');
                eventValidation    = getHiddenVal(doc, '__EVENTVALIDATION');
            }

            // La clasificación está en <div id="PClasificacion">
            const pClasif = doc.getElementById('PClasificacion');
            if (!pClasif) {
                console.warn(`[SyncFUBB] [${catLabel}] No se encontró #PClasificacion.`);
                return null;
            }

            const table = pClasif.querySelector('table');
            if (!table) {
                console.warn(`[SyncFUBB] [${catLabel}] No hay <table> en #PClasificacion.`);
                return null;
            }

            // Encabezados reales del HTML de FUBB:
            // "N°" | (logo) | "Nombre" | "P.J" | "P.G" | "P.P" | "P.F" | "P.C" | "Puntos" | "Últimos partidos" | "Racha"
            const headerRow = table.querySelector('thead tr');
            const headerCells = headerRow
                ? Array.from(headerRow.querySelectorAll('th,td'))
                      .map(c => (c.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase())
                : [];

            console.log(`[SyncFUBB] [${catLabel}] Headers:`, headerCells);

            const findCol = (...names) => {
                for (const name of names) {
                    const idx = headerCells.findIndex(h => h.includes(name));
                    if (idx >= 0) return idx;
                }
                return -1;
            };

            const colPOS  = findCol('N°', 'N.', '#', 'POS');
            const colTEAM = findCol('NOMBRE', 'EQUIPO', 'CLUB', 'TEAM');
            const colPJ   = findCol('P.J', 'PJ', 'JJ');
            const colPG   = findCol('P.G', 'PG', 'VICTORIA', 'GANA');
            const colPP   = findCol('P.P', 'PP', 'PERDI', 'DERROTA');
            const colPF   = findCol('P.F', 'PF');
            const colPC   = findCol('P.C', 'PC');
            const colPTS  = findCol('PUNTOS', 'PTS', 'PT');

            console.log(`[SyncFUBB] [${catLabel}] Cols → POS:${colPOS} TEAM:${colTEAM} PJ:${colPJ} PG:${colPG} PP:${colPP} PTS:${colPTS}`);

            const rows = Array.from(table.querySelectorAll('tbody tr'));
            const standings = {};

            rows.forEach((tr, rowIdx) => {
                const cells = Array.from(tr.querySelectorAll('td'))
                    .map(c => (c.textContent || '').replace(/\s+/g, ' ').trim());

                if (cells.length < 3) return;

                let teamName = '';
                if (colTEAM >= 0 && cells[colTEAM]) {
                    teamName = cells[colTEAM].toUpperCase().trim();
                } else {
                    const longest = cells.reduce((a, b) => a.length >= b.length ? a : b, '');
                    teamName = longest.toUpperCase().trim();
                }

                if (!teamName || teamName.length < 2) return;

                const getNum = (idx, fallback = 0) => {
                    if (idx < 0 || !cells[idx]) return fallback;
                    return parseInt(cells[idx]) || fallback;
                };

                standings[teamName] = {
                    pos: colPOS >= 0 ? getNum(colPOS, rowIdx + 1) : rowIdx + 1,
                    pj:  getNum(colPJ),
                    g:   getNum(colPG),
                    p:   getNum(colPP),
                    pf:  getNum(colPF),
                    pc:  getNum(colPC),
                    pts: getNum(colPTS),
                };
            });

            console.log(`[SyncFUBB] [${catLabel}] Equipos parseados: ${Object.keys(standings).length}`);
            return Object.keys(standings).length > 0 ? standings : null;
        }

        // Helper para detección flexible de Defensor Sporting / DSC
        function isDefensorSporting(name) {
            if (!name) return false;
            const norm = name.toUpperCase().trim();
            return norm.includes('DEFENSOR') || norm.includes('DSC') || norm === 'DEFENSOR SPORTING';
        }

        // Helper para normalizar nombres de equipos
        function normalizeTeamName(name) {
            if (!name) return '';
            return name
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
                .replace(/[^A-Za-z0-9]/g, ' ')   // Reemplazar caracteres no alfanuméricos por espacio
                .replace(/\s+/g, ' ')            // Colapsar espacios múltiples
                .trim()
                .toUpperCase();
        }

        // Helper: parsear resultados de partidos de la pestaña #calendario
        function parsePartidosYResultados(html, catLabel, currentFixture) {
            let doc;
            try { doc = parser.parseFromString(html, 'text/html'); }
            catch (e) { return null; }

            const divCalendario = doc.getElementById('calendario');
            if (!divCalendario) {
                console.warn(`[SyncFUBB] [${catLabel}] No se encontró el div#calendario.`);
                return null;
            }

            // Cada bloque de jornada tiene un h4 y una tabla. responsive
            const headings = Array.from(divCalendario.querySelectorAll('h4'));
            const tables = Array.from(divCalendario.querySelectorAll('table'));

            const resultsUpdates = {};
            let parsedCount = 0;

            headings.forEach((heading, idx) => {
                const headingText = (heading.textContent || '').trim();
                // Buscar número de jornada, ej: "Jornada 1 - 22/03/2026" o "Jornada 1"
                const matchJornada = headingText.match(/Jornada\s+(\d+)/i);
                if (!matchJornada) return;

                const jornadaNum = parseInt(matchJornada[1]);
                const table = tables[idx];
                if (!table) return;

                const rows = Array.from(table.querySelectorAll('tbody tr'));
                rows.forEach(tr => {
                    const cells = Array.from(tr.querySelectorAll('td'));
                    if (cells.length < 5) return; // Mínimo columnas de Local, Pts L, Pts V, Visitante, Fecha

                    // Local | Pts L | Pts V | Visitante | Fecha
                    // Las celdas de puntos suelen tener clase puntos_locales y puntos_visitantes
                    const homeTeamRaw = (cells[0].textContent || '').trim();
                    const awayTeamRaw = (cells[3].textContent || '').trim();

                    const ptsHomeRaw = (cells[1].textContent || '').trim();
                    const ptsAwayRaw = (cells[2].textContent || '').trim();

                    if (!homeTeamRaw || !awayTeamRaw) return;

                    // Si no hay puntos registrados, omitir partido (aún no jugado)
                    if (ptsHomeRaw === '' || ptsAwayRaw === '') return;

                    const scoreHome = parseInt(ptsHomeRaw);
                    const scoreAway = parseInt(ptsAwayRaw);

                    if (isNaN(scoreHome) || isNaN(scoreAway)) return; // Partido sin jugar o suspendido
                    if (scoreHome === 0 && scoreAway === 0 && !catLabel.includes('U11')) return; // No importar si es 0-0 excepto U11

                    const normHomeScraped = normalizeTeamName(homeTeamRaw);
                    const normAwayScraped = normalizeTeamName(awayTeamRaw);

                    // Buscar este partido en el fixture base de Firebase
                    const matchedFixtureEntry = Object.entries(currentFixture).find(([matchId, f]) => {
                        const isSameJornada = (f.jornada || 1) === jornadaNum;
                        if (!isSameJornada) return false;

                        const normHomeFixture = normalizeTeamName(f.home);
                        const normAwayFixture = normalizeTeamName(f.away);

                        // Comparación flexible
                        const matchHome = (isDefensorSporting(f.home) && isDefensorSporting(homeTeamRaw)) ||
                                          normHomeFixture.includes(normHomeScraped) || 
                                          normHomeScraped.includes(normHomeFixture);
                        const matchAway = (isDefensorSporting(f.away) && isDefensorSporting(awayTeamRaw)) ||
                                          normAwayFixture.includes(normAwayScraped) || 
                                          normAwayScraped.includes(normAwayFixture);
                        return matchHome && matchAway;
                    });

                    if (matchedFixtureEntry) {
                        const [matchId] = matchedFixtureEntry;
                        resultsUpdates[matchId] = {
                            scoreHome: scoreHome,
                            scoreAway: scoreAway,
                            status: 'played',
                            homeNoShow: (scoreHome === 0 && scoreAway === 20),
                            awayNoShow: (scoreHome === 20 && scoreAway === 0)
                        };
                        parsedCount++;
                    } else {
                        console.warn(`[SyncFUBB] [${catLabel}] No se encontró partido en fixture para: Jornada ${jornadaNum} - ${homeTeamRaw} vs ${awayTeamRaw}`);
                    }
                });
            });

            console.log(`[SyncFUBB] [${catLabel}] Resultados mapeados correctamente: ${parsedCount}`);
            return parsedCount > 0 ? resultsUpdates : null;
        }

        // 4. Iterar por cada categoría y recopilar datos

        const updates = {};
        let tablesProcessed = 0;
        let tablesSkipped   = 0;

        const branch = COMPETITIONS[currentCompetition].path;

        for (let i = 0; i < availableOptions.length; i++) {
            const opt = availableOptions[i];
            console.log(`[SyncFUBB] --- Categoría ${i + 1}/${availableOptions.length}: "${opt.text}" ---`);

            // Mapear a categoría Firebase (comparación insensible a mayúsculas/minúsculas)
            let firebaseCat = null;
            let isFemenino  = false;
            for (const entry of OPTION_TO_FIREBASE) {
                if (opt.text.toUpperCase().includes(entry.match.toUpperCase())) {
                    firebaseCat = entry.cat;
                    isFemenino  = entry.fem;
                    break;
                }
            }

            if (!firebaseCat) {
                console.warn(`[SyncFUBB] No se pudo mapear "${opt.text}". Omitiendo.`);
                tablesSkipped++;
                continue;
            }

            // Obtener HTML de esta categoría
            let catHtml = null;
            try {
                catHtml = await fetchCategory(opt.value, opt.selected, htmlText);
            } catch (err) {
                console.warn(`[SyncFUBB] Error al obtener "${opt.text}": ${err.message}`);
                tablesSkipped++;
                continue;
            }

            // Parsear clasificación
            const standings = parseClasificacion(catHtml, opt.text);
            if (!standings) {
                tablesSkipped++;
                continue;
            }

            const dscKey = Object.keys(standings).find(k => isDefensorSporting(k));
            if (dscKey) {
                console.log(`[SyncFUBB] ✅ [${opt.text}] DSC (${dscKey}): pos=${standings[dscKey].pos} pts=${standings[dscKey].pts}`);
            } else {
                console.warn(`[SyncFUBB] [${opt.text}] Defensor Sporting/DSC no está en esta clasificación.`);
            }

            let stageNode = `${branch}/${currentSeason}/etapa${currentStage}`;
            if (currentStage === '1' && (!allStagesData.etapa1 || !allStagesData.etapa1.fixture)) {
                stageNode = `${branch}/${currentSeason}`;
            }

            const syncPath = `${stageNode}/fubb_sync/${firebaseCat}`;
            updates[syncPath] = {
                ultimaActualizacion: new Date().toISOString(),
                fuente: TARGET_URL,
                categoria: opt.text,
                standings: standings,
            };

            // Sincronizar resultados de partidos en la estructura del fixture actual
            const partidosResultados = parsePartidosYResultados(catHtml, opt.text, sharedFixture);
            if (partidosResultados) {
                Object.entries(partidosResultados).forEach(([matchId, res]) => {
                    updates[`${stageNode}/${firebaseCat}/resultados/${matchId}`] = res;
                });
                console.log(`[SyncFUBB] [${opt.text}] Añadidos ${Object.keys(partidosResultados).length} resultados de partidos para Firebase.`);
            }

            tablesProcessed++;

            // Pausa entre peticiones para no saturar el proxy
            if (i < availableOptions.length - 1) {
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        // 5. Guardar en Firebase
        if (tablesProcessed === 0) {
            setSyncing(false);
            alert(
                `⚠️ Se procesaron las categorías pero no se pudieron obtener datos.\n` +
                `Categorías omitidas: ${tablesSkipped}\n\n` +
                'Posibles causas:\n' +
                '• cors-anywhere.herokuapp.com puede estar saturado. Reintenta en unos minutos.\n' +
                '• El sitio FUBB puede haber cambiado su estructura HTML.\n' +
                'Revisa la consola del navegador para más detalles.'
            );
            return;
        }

        try {
            await database.ref().update(updates);
            setSyncing(false);
            alert(
                `✅ Sincronización completada.\n\n` +
                `• Categorías procesadas: ${tablesProcessed}\n` +
                `• Categorías omitidas: ${tablesSkipped}\n` +
                `• Temporada: ${currentSeason} / Etapa ${currentStage}\n\n` +
                `Los datos quedan en la ruta fubb_sync/{categoría} de Firebase.`
            );
            console.log('[SyncFUBB] Updates guardados en Firebase:', updates);
        } catch (fbErr) {
            setSyncing(false);
            console.error('[SyncFUBB] Error al guardar en Firebase:', fbErr);
            alert('❌ Se obtuvieron los datos pero falló al guardarlos en Firebase.\n\nError: ' + fbErr.message);
        }
    }








    // =========================================================================
    // --- HELPERS GLOBALES: CORS ANYWHERE ---
    // =========================================================================
    const CORS_ANYWHERE_BASE = 'https://cors-anywhere.herokuapp.com';
    const CORS_DEMO_URL      = `${CORS_ANYWHERE_BASE}/corsdemo`;
    const GLOBAL_TARGET_URL = 'https://competicionesfubb.gesdeportiva.es/competicion.aspx?delegacion=1';

    const probeCorsAnywhere = async () => {
        try {
            const probe = await fetch(`${CORS_ANYWHERE_BASE}/${GLOBAL_TARGET_URL}`, {
                method: 'HEAD',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                signal: AbortSignal.timeout(6000),
            });
            return probe.status !== 403;
        } catch {
            return false;
        }
    };

    const ensureCorsAnywhere = async () => {
        if (await probeCorsAnywhere()) return true;

        const popup = window.open(CORS_DEMO_URL, 'corsActivation', 'width=700,height=500,resizable=yes,scrollbars=yes');

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.id = 'corsOverlay';
            overlay.style.cssText = `
                position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;
                display:flex;align-items:center;justify-content:center;`;
            overlay.innerHTML = `
                <div style="background:#1e293b;border:1px solid #334155;border-radius:1.5rem;
                            padding:2rem;max-width:440px;width:90%;text-align:center;font-family:sans-serif;">
                    <div style="font-size:2.5rem;margin-bottom:1rem;">🔓</div>
                    <h3 style="color:#c4b5fd;font-size:1.1rem;font-weight:700;margin:0 0 .75rem">Activar acceso a CORS Proxy</h3>
                    <p style="color:#94a3b8;font-size:.85rem;line-height:1.6;margin:0 0 1.5rem">
                        Se abrió la página de activación.<br>
                        Haz clic en <strong style="color:#fff">"Request temporary access to the demo server"</strong>
                        y luego vuelve aquí y presiona <strong style="color:#fff">Continuar</strong>.
                    </p>
                    <div style="display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;">
                        <button id="corsRetryBtn" style="background:#7c3aed;color:#fff;font-weight:700;padding:.65rem 1.5rem;border:none;border-radius:.75rem;cursor:pointer;font-size:.9rem;">✅ Continuar</button>
                        <button id="corsOpenBtn" style="background:#334155;color:#94a3b8;font-weight:600;padding:.65rem 1.25rem;border:1px solid #475569;border-radius:.75rem;cursor:pointer;font-size:.85rem;">🔗 Abrir de nuevo</button>
                        <button id="corsCancelBtn" style="background:transparent;color:#64748b;font-weight:600;padding:.65rem 1rem;border:1px solid #334155;border-radius:.75rem;cursor:pointer;font-size:.85rem;">Cancelar</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            document.getElementById('corsRetryBtn').onclick = async () => {
                const active = await probeCorsAnywhere();
                if (active) {
                    overlay.remove();
                    resolve(true);
                } else {
                    document.getElementById('corsRetryBtn').textContent = '⏳ Aún no activo, reintentando...';
                    setTimeout(() => { document.getElementById('corsRetryBtn').textContent = '✅ Continuar'; }, 2000);
                }
            };
            document.getElementById('corsOpenBtn').onclick = () => {
                window.open(CORS_DEMO_URL, 'corsActivation', 'width=700,height=500,resizable=yes,scrollbars=yes');
            };
            document.getElementById('corsCancelBtn').onclick = () => {
                overlay.remove();
                resolve(false);
            };
        });
    };


    // =========================================================================
    // =========================================================================

    init();
});
