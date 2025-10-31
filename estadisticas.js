document.addEventListener('DOMContentLoaded', function () {
    console.log('estadisticas.js loaded');

    // --- GLOBAL STATE ---
    let allPlayerGames = [];
    let filteredPlayerGames = [];
    let filteredTeamGames = [];
    let playerData = null;
    let statChart = null;
    let comparisonStatChart = null;
    let allTeamGames = [];

    // --- FIREBASE CONFIG ---
    const firebaseConfig = {
        apiKey: "AIzaSyANWXQvhHpF0LCYjz4AXi3MkcP798PqRfA",
        authDomain: "dsc24-aa5a1.firebaseapp.com",
        databaseURL: "https://dsc24-aa5a1-default-rtdb.firebaseio.com",
        projectId: "dsc24-aa5a1",
        storageBucket: "dsc24-aa5a1.appspot.com",
        messagingSenderId: "798100493177",
        appId: "1:798100493177:web:8e2ae324f8b5cb893a55a8"
    };
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const database = firebase.database();
    const auth = firebase.auth();

    // --- DOM ELEMENTS ---
    const playerNameTitle = document.getElementById('player-name');
    const playerGamesPlayed = document.getElementById('player-games-played');
    const toggleSearchButton = document.getElementById('toggleSearchButton');
    const searchBar = document.getElementById('searchBar');
    const tabsNav = document.getElementById('tabs-nav');
    const statsTables = document.getElementById('stats-tables');
    const noStatsMessage = document.getElementById('no-stats-message');
    const backButton = document.getElementById('backToPlayerDetail');
    const seasonSelector = document.getElementById('season-selector');
    const categorySelector = document.getElementById('category-selector');
    const opponentSelector = document.getElementById('opponent-selector');
    const dateSelector = document.getElementById('date-selector');
    const totalesContainer = document.getElementById('stats-totales-container');
    const promediosContainer = document.getElementById('stats-promedios-container');
    const compareButton = document.getElementById('compare-button');
    const resultDisplay = document.getElementById('match-result-display');
    const resultValue = document.getElementById('result-value');
    const equipoTotalesContainer = document.getElementById('stats-equipo-totales-container');
    const equipoPromediosContainer = document.getElementById('stats-equipo-promedios-container');

    // --- DYNAMIC MAPPING CONFIGURATION ---
    const statMap = {
        PUNTOS:    { label: 'Puntos', aliases: ['2 PUNTOS' , 'Pts'] },
        VAL:       { label: 'Valoración', aliases: ['3 EFICIENCIA', 'VALORACION','Ef'] },
        MAS_MENOS: { label: '+/-', aliases: ['MAS_MENOS', '+/-'] },
        T2C:       { label: 'T2 Convertidos', aliases: ['7 2PC','2PC'] },
        T2I:       { label: 'T2 Intentados', aliases: ['8 2PI','2PI'] },
        T3C:       { label: 'T3 Convertidos', aliases: ['4 3PC', '3PC'] },
        T3I:       { label: 'T3 Intentados', aliases: ['3PI', '5 3PI'] },
        TLC:       { label: 'TL Convertidos', aliases: ['10 TLC', 'TLC',] },
        TLI:       { label: 'TL Intentados', aliases: ['11 TLI','TLI'] },
        REB_OF:    { label: 'Rebotes Ofensivos', aliases: ['13 REB OFENSIVOS','RO'] },
        REB_DEF:   { label: 'Rebotes Defensivos', aliases: ['14 REB DEFENSIVOS','RD'] },
        REB_TOT:   { label: 'Rebotes Totales', aliases: ['15 REBOTES', 'REB'] },
        AS:        { label: 'Asistencias', aliases: ['AS', '17 ASISTENCIAS','As'] },
        ROB:       { label: 'Recuperos', aliases: ['19 RECUPEROS','ST'] },
        PER:       { label: 'Pérdidas', aliases: ['18 PERDIDDAS','PER'] },
        TAP:       { label: 'Bloqueos', aliases: ['16 BLOQUEOS','Blq'] },
        FC:        { label: 'Faltas Cometidas', aliases: ['20 FALTAS PERSONALES','FP'] },
        FP:        { label: 'Faltas Provocadas', aliases: ['21 FALTAS RECIBIDAS','FR'] },
        MIN:       { label: 'Minutos', aliases: ['MIN', 'MINUTOS', '1 MINUTOS'] },
        T2P:       { label: '% T2', isPercentage: true },
        T3P:       { label: '% T3', isPercentage: true },
        TLP:       { label: '% TL', isPercentage: true }
    };
    const aliasToCanonicalMap = new Map();
    for (const canonicalKey in statMap) {
        const statInfo = statMap[canonicalKey];
        if (statInfo.aliases) {
            statInfo.aliases.forEach(alias => aliasToCanonicalMap.set(alias.toUpperCase(), canonicalKey));
        }
    }
    const statOrder = ['MIN', 'PUNTOS', 'VAL', 'T3C', 'T3I', 'T3P', 'T2C', 'T2I', 'T2P', 'TLC', 'TLI', 'TLP', 'REB_OF', 'REB_DEF', 'REB_TOT', 'TAP', 'AS', 'PER', 'ROB', 'FC', 'FP', 'MAS_MENOS'];

    function getCanonicalKey(firebaseKey) { return aliasToCanonicalMap.get(firebaseKey.toUpperCase()); }
    function getStatLabel(key) { return statMap[key]?.label || key; }

    // --- AUTHENTICATION WRAPPER ---
    auth.onAuthStateChanged(function(user) {
        if (user) {
            initialize();
        } else {
            console.error("Permission Denied: User is not authenticated.");
            showError("Acceso denegado. Debes iniciar sesión para ver las estadísticas.");
        }
    });

    // --- MAIN LOGIC ---
    function initialize() {
        const playerDNI = getPlayerDNIFromUrl();
        if (!playerDNI) {
            showError('No se ha proporcionado un DNI de jugador en la URL.');
            return;
        }

        Promise.all([
            fetchPlayerData(playerDNI),
            fetchPlayerStats(playerDNI),
            fetchAllPlayersStats()
        ]).then(([pData, gamesData, teamGamesData]) => {
            playerData = pData;
            allPlayerGames = gamesData;
            allTeamGames = teamGamesData;

            playerNameTitle.textContent = playerData?.NOMBRE || 'Jugador Desconocido';

            if (allTeamGames.length > 0) {
                populateFilters();
                applyFiltersAndRender();
                tabsNav.style.display = 'flex';
            } else {
                noStatsMessage.textContent = 'No hay estadísticas disponibles.';
                noStatsMessage.style.display = 'block';
            }
            setupEventListeners();
        }).catch(error => {
            console.error("Error fetching data:", error);
            showError("Error al cargar los datos del jugador. Es posible que no exista o no tengas permiso.");
        });
    }

    function fetchPlayerData(dni) {
        return database.ref(`/jugadores/${dni}/datosPersonales`).once('value').then(snapshot => {
            if (!snapshot.exists()) throw new Error('No se encontraron los datos personales del jugador.');
            return snapshot.val();
        });
    }

    function fetchPlayerStats(dni) {
        return database.ref(`/estadisticas_partidos/${dni}`).once('value').then(snapshot => {
            const gamesObject = snapshot.val();
            return gamesObject ? Object.values(gamesObject) : [];
        });
    }

    function fetchAllPlayersStats() {
        return database.ref('/estadisticas_partidos').once('value').then(snapshot => {
            const allStats = snapshot.val();
            let allGames = [];
            if (allStats) {
                for (const dni in allStats) {
                    const playerGames = Object.values(allStats[dni]);
                    allGames = allGames.concat(playerGames);
                }
            }
            return allGames;
        });
    }

    function populateFilters(changedElement = null) {
        const selSeason = seasonSelector.value;
        const selCategory = categorySelector.value;
        const selOpponent = opponentSelector.value;
        const selDate = dateSelector.value;
    
        const seasons = [...new Set(allTeamGames.map(g => g.TEMPORADA))].sort();
        populateSelect('season-selector', seasons, 'Todas');
        seasonSelector.value = selSeason;
    
        let gamesForCat = selSeason === 'all' ? allTeamGames : allTeamGames.filter(g => g.TEMPORADA === selSeason);
        const categories = [...new Set(gamesForCat.map(g => g.CATEGORIA))].sort();
        populateSelect('category-selector', categories, 'Todas');
        if (categories.includes(selCategory)) categorySelector.value = selCategory; else categorySelector.value = 'all';
    
        let gamesForOppDate = categorySelector.value === 'all' ? gamesForCat : gamesForCat.filter(g => g.CATEGORIA === categorySelector.value);
        
        if (changedElement === dateSelector && selDate !== 'all') gamesForOppDate = gamesForOppDate.filter(g => g.FECHA === selDate);
        const opponents = [...new Set(gamesForOppDate.map(g => g.OPONENTE))].sort();
        populateSelect('opponent-selector', opponents, 'Todos');
        if (opponents.includes(selOpponent)) opponentSelector.value = selOpponent; else opponentSelector.value = 'all';
    
        if (opponentSelector.value !== 'all') gamesForOppDate = gamesForOppDate.filter(g => g.OPONENTE === opponentSelector.value);
        const dates = [...new Set(gamesForOppDate.map(g => g.FECHA))].sort((a, b) => new Date(b) - new Date(a));
        populateSelect('date-selector', dates, 'Todas');
        if (dates.includes(selDate)) dateSelector.value = selDate; else dateSelector.value = 'all';
    }

    function applyFiltersAndRender() {
        const season = seasonSelector.value, category = categorySelector.value, opponent = opponentSelector.value, date = dateSelector.value;

        filteredPlayerGames = allPlayerGames.filter(game => 
            (season === 'all' || game.TEMPORADA === season) &&
            (category === 'all' || game.CATEGORIA === category) &&
            (opponent === 'all' || game.OPONENTE === opponent) &&
            (date === 'all' || game.FECHA === date)
        );

        const numGames = filteredPlayerGames.length;
        playerNameTitle.textContent = playerData?.NOMBRE || 'Jugador Desconocido';
        playerGamesPlayed.textContent = `(${numGames} Partido${numGames !== 1 ? 's' : ''})`;

        if (numGames > 0) {
            if (numGames === 1 && filteredPlayerGames[0].RESULTADO) {
                resultValue.textContent = filteredPlayerGames[0].RESULTADO;
                resultDisplay.style.display = 'block';
            } else {
                resultDisplay.style.display = 'none';
            }
            const totales = calculateTotalStats(filteredPlayerGames);
            const promedios = calculateAverageStats(totales);
            updateDisplay(totales, promedios);
            statsTables.style.display = 'block';
            noStatsMessage.style.display = 'none';
        } else {
            statsTables.style.display = 'none';
            noStatsMessage.style.display = 'block';
            noStatsMessage.textContent = 'No hay estadísticas para los filtros seleccionados.';
        }

        if (compareButton) compareButton.style.display = (opponent !== 'all' && numGames > 1) ? 'block' : 'none';

        filteredTeamGames = allTeamGames.filter(game => 
            (season === 'all' || game.TEMPORADA === season) &&
            (category === 'all' || game.CATEGORIA === category) &&
            (opponent === 'all' || game.OPONENTE === opponent) &&
            (date === 'all' || game.FECHA === date)
        );

        if (filteredTeamGames.length > 0) {
            const teamTotals = calculateTotalStats(filteredTeamGames);
            const numUniqueGames = new Set(filteredTeamGames.map(g => `${g.FECHA}|${g.OPONENTE}|${g.CATEGORIA}|${g.TEMPORADA}`)).size;
            const teamAverages = calculateTeamAverageStats(teamTotals, numUniqueGames);
            renderTeamStats(teamTotals, teamAverages);
        } else {
            equipoTotalesContainer.innerHTML = '<p class="col-span-full text-gray-500">No hay datos de equipo.</p>';
            equipoPromediosContainer.innerHTML = '<p class="col-span-full text-gray-500">No hay datos de equipo.</p>';
        }
    }

    function calculateTotalStats(games) {
        const initialTotals = { partidosJugados: games.length };
        const totales = games.reduce((acc, game) => {
            for (const firebaseKey in game) {
                const canonicalKey = getCanonicalKey(firebaseKey);
                if (!canonicalKey || statMap[canonicalKey]?.isPercentage) continue;
                let value = (canonicalKey === 'MIN' && typeof game[firebaseKey] === 'string' && game[firebaseKey].includes(':')) 
                    ? (parseInt(game[firebaseKey].split(':')[0],10)||0) + (parseInt(game[firebaseKey].split(':')[1],10)||0)/60 
                    : Number(game[firebaseKey]);
                if (!isNaN(value)) acc[canonicalKey] = (acc[canonicalKey] || 0) + value;
            }
            return acc;
        }, initialTotals);

        for (const key in statMap) {
            if (statMap[key].isPercentage) {
                const prefix = key.slice(0, -1), madeKey = prefix + 'C', attemptedKey = prefix + 'I';
                if (totales[attemptedKey] > 0) totales[key] = (totales[madeKey] / totales[attemptedKey]) * 100; else totales[key] = 0;
            }
        }
        return totales;
    }

    function calculateAverageStats(totals) {
        const gamesCount = totals.partidosJugados;
        if (gamesCount === 0) return {};
        const averages = {};
        for (const key in totals) {
            if (key === 'partidosJugados') continue;
            averages[key] = statMap[key]?.isPercentage ? totals[key] : totals[key] / gamesCount;
        }
        return averages;
    }

    function calculateTeamAverageStats(totals, numUniqueGames) {
        if (numUniqueGames === 0) return {};
        const averages = { partidosJugados: numUniqueGames };
        for (const key in totals) {
            if (key === 'partidosJugados') continue;
            averages[key] = statMap[key]?.isPercentage ? totals[key] : totals[key] / numUniqueGames;
        }
        return averages;
    }

    function updateDisplay(totales, promedios) {
        const render = (container, data, isChartable) => {
            container.innerHTML = getSortedStatKeys(Object.keys(data))
                .map(key => createStatItem(getStatLabel(key), data[key], key, isChartable))
                .join('');
        };
        delete totales.partidosJugados;
        render(totalesContainer, totales, true);
        render(promediosContainer, promedios, false);
    }

    function renderTeamStats(totals, averages) {
        delete totals.partidosJugados;
        const render = (container, data) => {
            container.innerHTML = getSortedStatKeys(Object.keys(data))
                .map(key => createStatItem(getStatLabel(key), data[key], key, true))
                .join('');
        };
        render(equipoTotalesContainer, totals);
        render(equipoPromediosContainer, averages);
    }

    function getSortedStatKeys(statKeys) {
        return statKeys.sort((a, b) => {
            const indexA = statOrder.indexOf(a), indexB = statOrder.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return getStatLabel(a).localeCompare(getStatLabel(b));
        });
    }

    function setupEventListeners() {
        if (toggleSearchButton) toggleSearchButton.addEventListener('click', () => searchBar.classList.toggle('hidden'));
        [seasonSelector, categorySelector, opponentSelector, dateSelector].forEach(selector => {
            if (selector) selector.addEventListener('change', e => { populateFilters(e.target); applyFiltersAndRender(); });
        });
        if (backButton) backButton.addEventListener('click', () => { window.location.href = `index.html?dni=${getPlayerDNIFromUrl()}` || 'index.html'; });

        const tabs = { 'tab-totales': 'tabla-totales', 'tab-promedios': 'tabla-promedios', 'tab-equipo-totales': 'tabla-equipo-totales', 'tab-equipo-promedios': 'tabla-equipo-promedios' };
        Object.keys(tabs).forEach(tabId => {
            const tab = document.getElementById(tabId);
            if (tab) tab.addEventListener('click', e => {
                e.preventDefault();
                Object.keys(tabs).forEach(t => document.getElementById(t)?.classList.remove('border-blue-500', 'text-blue-600'));
                Object.values(tabs).forEach(tableId => document.getElementById(tableId).style.display = 'none');
                tab.classList.add('border-blue-500', 'text-blue-600');
                document.getElementById(tabs[tabId]).style.display = 'block';
            });
        });

        const modal = document.getElementById('chart-modal'), closeChartModalButton = document.getElementById('close-chart-modal');
        if (modal && closeChartModalButton) {
            closeChartModalButton.addEventListener('click', () => modal.style.display = 'none');
            window.addEventListener('click', e => { if (e.target == modal) modal.style.display = 'none'; });
        }
        if (totalesContainer) totalesContainer.addEventListener('click', handleStatClick);
        if (equipoTotalesContainer) equipoTotalesContainer.addEventListener('click', handleTeamStatClick);

        const comparisonModal = document.getElementById('comparison-chart-modal'), closeComparisonModalButton = document.getElementById('close-comparison-chart-modal');
        if (comparisonModal && closeComparisonModalButton) {
            closeComparisonModalButton.addEventListener('click', () => comparisonModal.style.display = 'none');
            window.addEventListener('click', e => { if (e.target == comparisonModal) comparisonModal.style.display = 'none'; });
        }
        if (compareButton) compareButton.addEventListener('click', handleComparisonClick);
    }

    function getValueFromGame(game, canonicalKey) {
        const firebaseKey = Object.keys(game).find(k => getCanonicalKey(k) === canonicalKey);
        if (firebaseKey === undefined) return 0;
        let value = game[firebaseKey];
        if (canonicalKey === 'MIN' && typeof value === 'string' && value.includes(':')) {
            const parts = value.split(':');
            return (parseInt(parts[0], 10) || 0) + (parseInt(parts[1], 10) || 0) / 60;
        }
        return Number(value) || 0;
    }

    function handleStatClick(event) {
        const card = event.target.closest('.stat-card');
        if (!card || !card.dataset.statKey) return;
        const statKey = card.dataset.statKey, statLabel = card.dataset.statLabel;

        if (filteredPlayerGames.length === 1) {
            showTeammateComparisonChart(statKey, statLabel, filteredPlayerGames[0]);
        } else {
            const sortedGames = [...filteredPlayerGames].sort((a, b) => new Date(a.FECHA) - new Date(b.FECHA));
            const gameLabels = sortedGames.map(game => `${game.FECHA} vs ${game.OPONENTE}`);
            const isPercentage = statMap[statKey]?.isPercentage;
            const gameData = sortedGames.map(game => {
                if (isPercentage) {
                    const prefix = statKey.slice(0, -1), madeKey = prefix + 'C', attemptedKey = prefix + 'I';
                    const made = getValueFromGame(game, madeKey), attempted = getValueFromGame(game, attemptedKey);
                    return attempted > 0 ? (made / attempted) * 100 : 0;
                } else {
                    return getValueFromGame(game, statKey);
                }
            });
            renderChart(gameLabels, gameData, statLabel);
        }
    }

    function handleTeamStatClick(event) {
        const card = event.target.closest('.stat-card');
        if (!card || !card.dataset.statKey) return;
        const statKey = card.dataset.statKey, statLabel = card.dataset.statLabel;
        const gamesData = new Map();
        filteredTeamGames.forEach(pg => {
            const gameId = `${pg.FECHA}|${pg.OPONENTE}|${pg.CATEGORIA}|${pg.TEMPORADA}`;
            if (!gamesData.has(gameId)) gamesData.set(gameId, { FECHA: pg.FECHA, OPONENTE: pg.OPONENTE, playerGameList: [] });
            gamesData.get(gameId).playerGameList.push(pg);
        });
        const sortedGames = [...gamesData.values()].sort((a, b) => new Date(a.FECHA) - new Date(b.FECHA));
        const gameLabels = sortedGames.map(g => `${g.FECHA} vs ${g.OPONENTE}`);
        const isPercentage = statMap[statKey]?.isPercentage;
        const gameData = sortedGames.map(game => {
            if (isPercentage) {
                const prefix = statKey.slice(0, -1), madeKey = prefix + 'C', attemptedKey = prefix + 'I';
                let totalMade = 0, totalAttempted = 0;
                game.playerGameList.forEach(pg => { totalMade += getValueFromGame(pg, madeKey); totalAttempted += getValueFromGame(pg, attemptedKey); });
                return totalAttempted > 0 ? (totalMade / totalAttempted) * 100 : 0;
            } else {
                return game.playerGameList.reduce((sum, pg) => sum + getValueFromGame(pg, statKey), 0);
            }
        });
        renderChart(gameLabels, gameData, `Evolución Equipo: ${statLabel}`);
    }

    async function showTeammateComparisonChart(statKey, statLabel, singleGame) {
        const canonicalStatKey = getCanonicalKey(statKey) || statKey;
        const gameIdentifier = { TEMPORADA: singleGame.TEMPORADA, CATEGORIA: singleGame.CATEGORIA, OPONENTE: singleGame.OPONENTE, FECHA: singleGame.FECHA };
        const allGamesSnapshot = await database.ref('/estadisticas_partidos').once('value');
        const allGamesData = allGamesSnapshot.val();
        const playersInThisGame = [], playerDNItoNameMap = {};

        for (const dni in allGamesData) {
            if (allGamesData.hasOwnProperty(dni)) {
                const matchingGame = Object.values(allGamesData[dni]).find(g => g.TEMPORADA === gameIdentifier.TEMPORADA && g.CATEGORIA === gameIdentifier.CATEGORIA && g.OPONENTE === gameIdentifier.OPONENTE && g.FECHA === gameIdentifier.FECHA);
                if (matchingGame) playersInThisGame.push({ dni: dni, gameStats: matchingGame });
            }
        }
        await Promise.all(playersInThisGame.map(async p => { playerDNItoNameMap[p.dni] = (await database.ref(`/jugadores/${p.dni}/datosPersonales/NOMBRE`).once('value')).val() || `Jugador ${p.dni}`; }));

        const labels = playersInThisGame.map(p => playerDNItoNameMap[p.dni]);
        const data = playersInThisGame.map(p => {
            if (statMap[canonicalStatKey]?.isPercentage) {
                const prefix = canonicalStatKey.slice(0, -1), madeKey = prefix + 'C', attemptedKey = prefix + 'I';
                const made = getValueFromGame(p.gameStats, madeKey), attempted = getValueFromGame(p.gameStats, attemptedKey);
                return attempted > 0 ? (made / attempted) * 100 : 0;
            } else {
                return getValueFromGame(p.gameStats, canonicalStatKey);
            }
        });
        renderComparisonChart(labels, data, `Comparación de ${statLabel} en el partido del ${singleGame.FECHA} vs ${singleGame.OPONENTE}`, 'bar');
    }

    function renderChart(gameLabels, gameData, statLabel) {
        const modal = document.getElementById('chart-modal');
        const modalTitle = document.getElementById('chart-modal-title');
        const ctx = document.getElementById('stat-chart').getContext('2d');
        modalTitle.textContent = `Evolución de: ${statLabel}`;
        if (statChart) statChart.destroy();
        statChart = new Chart(ctx, { type: 'line', data: { labels: gameLabels, datasets: [{ label: statLabel, data: gameData, borderColor: 'rgba(59, 130, 246, 1)', backgroundColor: 'rgba(59, 130, 246, 0.2)', borderWidth: 2, tension: 0.1, fill: true }] }, options: { scales: { y: { beginAtZero: true } }, responsive: true, maintainAspectRatio: false } });
        modal.style.display = 'block';
    }

    function handleComparisonClick() {
        const statsToCompare = Object.keys(statMap).filter(key => !statMap[key].isPercentage && statMap[key].aliases);
        const maxValues = {};
        statsToCompare.forEach(stat => { maxValues[stat] = Math.max(...filteredPlayerGames.map(g => getValueFromGame(g, stat)), 0); });
        const datasets = filteredPlayerGames.map(game => {
            const data = statsToCompare.map(stat => maxValues[stat] > 0 ? (getValueFromGame(game, stat) / maxValues[stat]) * 100 : 0);
            const color = generateRandomColor();
            return { label: `${game.FECHA} vs ${game.OPONENTE}`, data: data, borderColor: color, backgroundColor: color.replace('1)', '0.2)'), borderWidth: 2, fill: true };
        });
        renderComparisonChart(statsToCompare.map(getStatLabel), datasets, `Comparación de Partidos vs ${opponentSelector.value}`, 'radar');
    }

    function renderComparisonChart(labels, dataOrDatasets, title, type) {
        const modal = document.getElementById('comparison-chart-modal');
        const modalTitle = document.getElementById('comparison-chart-modal-title');
        const ctx = document.getElementById('comparison-stat-chart').getContext('2d');
        modalTitle.textContent = title;
        if (comparisonStatChart) comparisonStatChart.destroy();
        const data = type === 'bar' ? { labels: labels, datasets: [{ label: 'Valor', data: dataOrDatasets, backgroundColor: 'rgba(59, 130, 246, 0.6)' }] } : { labels: labels, datasets: dataOrDatasets };
        comparisonStatChart = new Chart(ctx, { type: type, data: data, options: { responsive: true, maintainAspectRatio: false, scales: { r: { angleLines: { display: false }, suggestedMin: 0, suggestedMax: 100 } } } });
        modal.style.display = 'block';
    }
    
    function generateRandomColor() { return `rgba(${Math.floor(Math.random()*255)}, ${Math.floor(Math.random()*255)}, ${Math.floor(Math.random()*255)}, 1)`; }

    function populateSelect(selectorId, options, defaultOptionText) {
        const selector = document.getElementById(selectorId);
        selector.innerHTML = `<option value="all">${defaultOptionText}</option>`;
        if (options && options.length > 0) {
            options.forEach(opt => selector.add(new Option(opt, opt)));
            selector.disabled = false;
        } else {
            selector.disabled = true;
        }
    }

    function createStatItem(label, value, key = '', isChartable = false) {
        const displayLabel = label.replace(/^(\d+)\s*/, '');
        if (typeof value === 'number' && value % 1 !== 0) value = value.toFixed(1);
        const clickableClass = isChartable ? 'cursor-pointer hover:bg-gray-200 transition-colors' : '';
        const dataAttributes = isChartable ? `data-stat-key="${key}" data-stat-label="${displayLabel}"` : '';
        return `<div class="stat-card bg-gray-50 p-3 rounded-lg shadow-sm flex flex-col items-center justify-center text-center h-24 ${clickableClass}" ${dataAttributes}><span class="text-sm font-medium text-gray-500">${displayLabel}</span><span class="text-2xl font-bold text-blue-800 mt-1">${value}</span></div>`;
    }

    function showError(message) {
        playerNameTitle.textContent = 'Error';
        playerGamesPlayed.textContent = '';
        if (statsTables) statsTables.style.display = 'none';
        if (searchBar) searchBar.style.display = 'none';
        if (tabsNav) tabsNav.style.display = 'none';
        if (noStatsMessage) {
            noStatsMessage.textContent = message;
            noStatsMessage.style.display = 'block';
        }
    }

    function getPlayerDNIFromUrl() { return new URLSearchParams(window.location.search).get('dni'); }
});