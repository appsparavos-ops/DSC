// --- CONFIGURACIÓN BACKEND RENDER ---
// Define la URL del servicio de scraping desplegado en Render
const API_BASE_URL = 'https://dsc-resultados.onrender.com'; // O la URL de tu nuevo servicio

// --- CONFIGURACIÓN AUTOMÁTICA DE LOGINS ---
const AUTO_EMAIL    = 'invitado@dsc.com';
const AUTO_PASSWORD = 'invitado123';

// --- CONFIGURACIÓN DE COMPETENCIAS Y RAMAS ---
const COMPETITIONS = {
    MASC: {
        path: 'tablas_posiciones',
        compId: '141',
        categories: [
            { id: 'U11', name: 'U11 Mixta' },
            { id: 'U12', name: 'U12 Mixta' },
            { id: 'U14', name: 'U14 Masculino' },
            { id: 'U16', name: 'U16 Masculino' },
            { id: 'U18', name: 'U18 Masculino' },
            { id: 'U20', name: 'U20 Masculino' }
        ]
    },
    FEM: {
        path: 'tablas_posiciones_fem',
        compId: '141',
        categories: [
            { id: 'U12', name: 'U12 Femenino' },
            { id: 'U14', name: 'U14 Femenino' },
            { id: 'U16', name: 'U16 Femenino' },
            { id: 'U19', name: 'U19 Femenina' }
        ]
    },
    LFB: {
        path: 'tablas_posiciones_lfb',
        compId: '149',
        categories: [
            { id: 'LFB', name: 'LFB' }
        ]
    },
    LDD: {
        path: 'tablas_posiciones_ldd',
        compId: '141',
        categories: [
            { id: 'LDD', name: 'LDD' }
        ]
    },
    LUB: {
        path: 'tablas_posiciones_lub',
        compId: '141',
        categories: [
            { id: 'LUB', name: 'LUB' }
        ]
    }
};

// --- INICIALIZAR FIREBASE ---
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const database = firebase.database();

// --- LOGGER ---
function log(msg) {
    const t = new Date().toLocaleTimeString();
    console.log(`[${t}] ${msg}`);
    const display = document.getElementById('log-display');
    if (display) {
        display.innerText += `\n[${t}] ${msg}`;
        display.scrollTop = display.scrollHeight;
    }
}

function setStatusBadge(text, type = 'normal') {
    const badge = document.getElementById('status-badge');
    if (!badge) return;
    badge.textContent = text;
    badge.className = "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ";
    if (type === 'success') {
        badge.className += "bg-green-500/20 text-green-400 border border-green-500/30";
    } else if (type === 'error') {
        badge.className += "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse";
    } else {
        badge.className += "bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse";
    }
}

// --- FLUJO DE AUTENTICACIÓN ---
auth.onAuthStateChanged(async user => {
    if (user) {
        log(`Sesión iniciada con éxito (${user.email}). Iniciando proceso...`);
        const userDisplay = document.getElementById('user-display');
        if (userDisplay) userDisplay.textContent = user.email;
        
        try {
            await startSyncProcess();
            setStatusBadge('Completado', 'success');
            log('[FINISH] Proceso completado exitosamente.');
        } catch (err) {
            setStatusBadge('Error', 'error');
            log(`[ERROR] Falló el proceso: ${err.message}`);
        }
    } else {
        log('Iniciando login automático...');
        try {
            await auth.signInWithEmailAndPassword(AUTO_EMAIL, AUTO_PASSWORD);
        } catch (err) {
            setStatusBadge('Error Login', 'error');
            log(`[ERROR] Error al autenticar: ${err.message}`);
        }
    }
});

// --- PROCESO PRINCIPAL ---
async function startSyncProcess() {
    // 1. Obtener temporada activa
    log('Buscando temporada activa en Firebase...');
    const seasonsSnap = await database.ref('temporadas').once('value');
    if (!seasonsSnap.exists()) {
        throw new Error('No se encontraron temporadas en la base de datos.');
    }
    const seasonsData = seasonsSnap.val();
    let activeSeason = null;
    Object.keys(seasonsData).forEach(s => {
        if (seasonsData[s] && seasonsData[s].activa === true) {
            activeSeason = s;
        }
    });
    if (!activeSeason) {
        activeSeason = Object.keys(seasonsData).sort().reverse()[0];
        log(`Advertencia: No hay temporada activa marcada. Usando la más reciente: ${activeSeason}`);
    } else {
        log(`Temporada activa detectada: ${activeSeason}`);
    }

    // 2. Procesar ramas secuencialmente (MASC, FEM, LFB, LDD, LUB)
    const branches = ['MASC', 'FEM', 'LFB', 'LDD', 'LUB'];
    for (const branchKey of branches) {
        const comp = COMPETITIONS[branchKey];
        log(`\n================ RAMA: ${branchKey} ================`);
        
        // Cargar datos de la rama
        const branchSnap = await database.ref(`${comp.path}/${activeSeason}`).once('value');
        if (!branchSnap.exists()) {
            log(`Rama ${branchKey} no disponible para la temporada ${activeSeason}. Omitiendo.`);
            continue;
        }
        
        const branchData = branchSnap.val() || {};
        
        // Determinar etapa actual
        const currentStage = (branchData.config && branchData.config.lastStage) ? String(branchData.config.lastStage) : '1';
        log(`Etapa activa para la rama: ${currentStage}`);
        
        let stageKey = `etapa${currentStage}`;
        let stageData = branchData[stageKey];
        // Fallback Etapa 1 legacy format
        if (currentStage === '1' && (!stageData || !stageData.fixture)) {
            stageData = branchData;
        }
        
        if (!stageData || !stageData.fixture) {
            log(`⚠️ Fixture de la Etapa ${currentStage} no cargado en la base de datos para la rama ${branchKey}. Omitiendo.`);
            continue;
        }
        
        const sharedFixture = stageData.fixture || {};
        log(`Fixture cargado con ${Object.keys(sharedFixture).length} partidos.`);

        // Armar payload de categorías
        const categoriesPayload = [];
        comp.categories.forEach(cat => {
            // Leer configuración de FUBB de esta categoría si existiera en Firebase
            const catConfig = (stageData[cat.id] && stageData[cat.id].config) || {};
            const fubbFase = catConfig.fubbFase || (stageData.config && stageData.config.fubbFase) || '';
            const fubbGrupo = catConfig.fubbGrupo || (stageData.config && stageData.config.fubbGrupo) || '';
            
            categoriesPayload.push({
                id: cat.id,
                name: cat.name,
                fubbFase: fubbFase,
                fubbGrupo: fubbGrupo
            });
        });

        // 3. Consultar al backend de Render
        log(`Llamando al servicio de Render para realizar scraping de ${branchKey}...`);
        let response;
        try {
            response = await fetch(`${API_BASE_URL}/scrape_branch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    comp_id: comp.compId,
                    categories: categoriesPayload
                })
            });
        } catch (fetchErr) {
            log(`❌ Error al conectar con el backend de Render: ${fetchErr.message}`);
            continue;
        }

        if (!response.ok) {
            log(`❌ Respuesta de Render no exitosa: HTTP ${response.status}`);
            continue;
        }

        const dataScraped = await response.json();
        if (!dataScraped.success || !dataScraped.htmls) {
            log(`❌ Falló la extracción de Render: ${dataScraped.error || 'Sin datos de HTMLs'}`);
            continue;
        }

        const htmls = dataScraped.htmls;
        log(`HTMLs recibidos de Render para ${Object.keys(htmls).length} categorías.`);

        // 4. Procesar y parsear cada HTML recibido
        const updates = {};
        let targetPath = `${comp.path}/${activeSeason}/etapa${currentStage}`;
        if (currentStage === '1' && (!branchData.etapa1 || !branchData.etapa1.fixture)) {
            targetPath = `${comp.path}/${activeSeason}`;
        }

        for (const catId of Object.keys(htmls)) {
            const html = htmls[catId];
            const catName = (comp.categories.find(c => c.id === catId) || {name: catId}).name;
            log(`Procesando e integrando categoría: ${catName}`);

            // Parsear standings (clasificación)
            const standings = parseClasificacion(html, catName);
            if (standings) {
                const syncPath = `${targetPath}/fubb_sync/${catId}`;
                updates[`${syncPath}/ultimaActualizacion`] = new Date().toISOString();
                updates[`${syncPath}/fuente`] = 'https://competicionesfubb.gesdeportiva.es/competicion.aspx?delegacion=1';
                updates[`${syncPath}/categoria`] = catName;
                updates[`${syncPath}/standings`] = standings;
                log(`   -> Clasificación parseada correctamente (${Object.keys(standings).length} equipos).`);
            } else {
                log(`   -> ⚠️ No se pudo parsear la clasificación de ${catName}.`);
            }

            // Parsear partidos disputados
            const partidosResultados = parsePartidosYResultados(html, catName, sharedFixture);
            if (partidosResultados) {
                Object.entries(partidosResultados).forEach(([matchId, res]) => {
                    updates[`${targetPath}/${catId}/resultados/${matchId}`] = res;
                });
                log(`   -> Resultados de partidos parseados e integrados (${Object.keys(partidosResultados).length} resultados).`);
            } else {
                log(`   -> No se encontraron nuevos partidos jugados registrados en FUBB.`);
            }
        }

        // Guardar actualizaciones en Firebase
        if (Object.keys(updates).length > 0) {
            log(`Guardando actualizaciones en Firebase para la rama ${branchKey}...`);
            await database.ref().update(updates);
            log(`✅ Sincronización guardada con éxito para la rama ${branchKey}.`);
        } else {
            log(`Sin datos nuevos para registrar en ${branchKey}.`);
        }
    }
}

// --- CLÁSICAS FUNCIONES DE PARSEO E IMPORTACIÓN (Portadas de tabla.js) ---

function isDefensorSporting(name) {
    if (!name) return false;
    const norm = name.toUpperCase().trim();
    return norm.includes('DEFENSOR') || norm.includes('DSC') || norm === 'DEFENSOR SPORTING';
}

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

function parseClasificacion(html, catLabel) {
    const parser = new DOMParser();
    let doc;
    try { doc = parser.parseFromString(html, 'text/html'); }
    catch (e) { return null; }

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

    const headerRow = table.querySelector('thead tr');
    const headerCells = headerRow
        ? Array.from(headerRow.querySelectorAll('th,td'))
              .map(c => (c.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase())
        : [];

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

    return Object.keys(standings).length > 0 ? standings : null;
}

function parsePartidosYResultados(html, catLabel, currentFixture) {
    const parser = new DOMParser();
    let doc;
    try { doc = parser.parseFromString(html, 'text/html'); }
    catch (e) { return null; }

    const divCalendario = doc.getElementById('calendario');
    if (!divCalendario) {
        console.warn(`[SyncFUBB] [${catLabel}] No se encontró el div#calendario.`);
        return null;
    }

    const headings = Array.from(divCalendario.querySelectorAll('h4'));
    const tables = Array.from(divCalendario.querySelectorAll('table'));

    const resultsUpdates = {};
    let parsedCount = 0;

    headings.forEach((heading, idx) => {
        const headingText = (heading.textContent || '').trim();
        const matchJornada = headingText.match(/Jornada\s+(\d+)/i);
        if (!matchJornada) return;

        const jornadaNum = parseInt(matchJornada[1]);
        const table = tables[idx];
        if (!table) return;

        const rows = Array.from(table.querySelectorAll('tbody tr'));
        rows.forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td'));
            if (cells.length < 5) return;

            const homeTeamRaw = (cells[0].textContent || '').trim();
            const awayTeamRaw = (cells[3].textContent || '').trim();
            const ptsHomeRaw = (cells[1].textContent || '').trim();
            const ptsAwayRaw = (cells[2].textContent || '').trim();

            if (!homeTeamRaw || !awayTeamRaw) return;
            if (ptsHomeRaw === '' || ptsAwayRaw === '') return;

            const scoreHome = parseInt(ptsHomeRaw);
            const scoreAway = parseInt(ptsAwayRaw);

            if (isNaN(scoreHome) || isNaN(scoreAway)) return;
            if (scoreHome === 0 && scoreAway === 0 && !catLabel.includes('U11')) return;

            const normHomeScraped = normalizeTeamName(homeTeamRaw);
            const normAwayScraped = normalizeTeamName(awayTeamRaw);

            let isSwapped = false;
            const matchedFixtureEntry = Object.entries(currentFixture).find(([matchId, f]) => {
                const isSameJornada = (f.jornada || 1) === jornadaNum;
                if (!isSameJornada) return false;

                const normHomeFixture = normalizeTeamName(f.home);
                const normAwayFixture = normalizeTeamName(f.away);

                const matchHomeDirect = (isDefensorSporting(f.home) && isDefensorSporting(homeTeamRaw)) ||
                                  normHomeFixture.includes(normHomeScraped) || normHomeScraped.includes(normHomeFixture);
                const matchAwayDirect = (isDefensorSporting(f.away) && isDefensorSporting(awayTeamRaw)) ||
                                  normAwayFixture.includes(normAwayScraped) || normAwayScraped.includes(normAwayFixture);
                
                if (matchHomeDirect && matchAwayDirect) {
                    return true;
                }

                const matchHomeInverted = (isDefensorSporting(f.home) && isDefensorSporting(awayTeamRaw)) ||
                                  normHomeFixture.includes(normAwayScraped) || normAwayScraped.includes(normHomeFixture);
                const matchAwayInverted = (isDefensorSporting(f.away) && isDefensorSporting(homeTeamRaw)) ||
                                  normAwayFixture.includes(normHomeScraped) || normAwayScraped.includes(normAwayFixture);
                
                if (matchHomeInverted && matchAwayInverted) {
                    isSwapped = true;
                    return true;
                }

                return false;
            });

            if (matchedFixtureEntry) {
                const [matchId] = matchedFixtureEntry;
                const finalScoreHome = isSwapped ? scoreAway : scoreHome;
                const finalScoreAway = isSwapped ? scoreHome : scoreAway;

                resultsUpdates[matchId] = {
                    scoreHome: finalScoreHome,
                    scoreAway: finalScoreAway,
                    status: 'played',
                    homeNoShow: (finalScoreHome === 0 && finalScoreAway === 20),
                    awayNoShow: (finalScoreHome === 20 && finalScoreAway === 0)
                };
                parsedCount++;
            }
        });
    });

    return parsedCount > 0 ? resultsUpdates : null;
}
