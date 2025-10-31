document.addEventListener('DOMContentLoaded', function() {
    // --- PREVENCIÓN DE PARPADEO (FLICKERING) ---
    // Comprueba si se está cargando un jugador directamente desde la URL.
    const params = new URLSearchParams(window.location.search);
    if (params.has('dni')) {
        // Si hay un DNI en la URL, pre-configuramos la UI para mostrar 
        // la vista de detalles directamente y evitar mostrar el login o la lista.
        const loginContainer = document.getElementById('login-container');
        const mainContainer = document.getElementById('main-container');
        const mainContent = document.getElementById('main-content');
        const playerDetailView = document.getElementById('playerDetailView');

        if (loginContainer) loginContainer.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'block';
        if (mainContent) mainContent.classList.add('hidden');
        if (playerDetailView) {
            playerDetailView.classList.remove('hidden');
            // Mensaje de carga temporal
            playerDetailView.innerHTML = '<div class="text-center p-8 text-white">Cargando jugador...</div>';
        }
    }

    let isDeviceReady = false;
    document.addEventListener('deviceready', () => {
        isDeviceReady = true;
    }, false);

    const firebaseConfig = {
        apiKey: "AIzaSyANWXQvhHpF0LCYjz4AXi3MkcP798PqRfA",
        authDomain: "dsc24-aa5a1.firebaseapp.com",
        databaseURL: "https://dsc24-aa5a1-default-rtdb.firebaseio.com",
        projectId: "dsc24-aa5a1",
        storageBucket: "dsc24-aa5a1.appspot.com",
        messagingSenderId: "798100493177",
        appId: "1:798100493177:web:8e2ae324f8b5cb893a55a8"
    };

    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();
    const auth = firebase.auth();

    const IMG_BASE_URL = 'https://firebasestorage.googleapis.com/v0/b/dsc24-aa5a1.appspot.com/o/';
    const PLACEHOLDER_SVG_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2EwYTBhMCI+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OS00IDQgNHptMCAyYy0yLjY3IDAtOCA0IDQgNHYyYzAgMS4xLjkgMiAyIDJoMTRjMS4xIDAgMi0uOSAyLTJ2LTJjMC0yLjY2LTUuMzMtNC04LTR6Ii8+PC9zdmc+';
    const COLUMN_ORDER = [ 'DNI', 'NOMBRE','FM Hasta', 'Numero','EQUIPO','COMPETICION', 'CATEGORIA'];

    // --- ELEMENTOS DEL DOM ---
    // Contenedores principales
    const loginContainer = document.getElementById('login-container');
    const mainContainer = document.getElementById('main-container');
    
    // Formulario de login nuevo
    const newLoginForm = document.getElementById('login-form');
    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const loginErrorMessage = document.getElementById('login-error-message');
    const logoutButton = document.getElementById('logout-button');

    // Elementos originales de la app
    const toggleSearchButton = document.getElementById('toggleSearchButton');
    const searchBar = document.getElementById('searchBar');
    const nameSearchInput = document.getElementById('nameSearchInput');
    const dniSearchInput = document.getElementById('dniSearchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const equipoFilter = document.getElementById('equipoFilter');
    const seasonFilter = document.getElementById('seasonFilter');
    const expiringButton = document.getElementById('expiringButton');
    const resetButton = document.getElementById('resetButton');
    const printButton = document.getElementById('printButton');
    const messageEl = document.getElementById('message');
    const tableContainer = document.getElementById('tableContainer');
    const nameSuggestionsDatalist = document.getElementById('name-suggestions');
    const dniSuggestionsDatalist = document.getElementById('dni-suggestions');
    const mainContent = document.getElementById('main-content');
    const playerDetailView = document.getElementById('playerDetailView');
    
    // Variables de estado
    let allPlayers = [];
    let originalHeaders = [];
    let isEditModeActive = false; // Controlado por el rol del usuario
    let currentUserRole = null; // 'admin', 'user', o null
    let currentlyDisplayedPlayers = [];
    let currentPlayerIndex = -1;
    let currentSeasonListener = null;

    // --- LÓGICA DE AUTENTICACIÓN PRINCIPAL ---

    function initializeAuth() {
        auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
            .then(() => {
                auth.onAuthStateChanged(user => {
                    if (user) {
                        // Usuario logueado, verificar rol
                        database.ref('admins/' + user.uid).once('value').then(snapshot => {
                            if (snapshot.exists()) {
                                currentUserRole = 'admin';
                                isEditModeActive = true;
                                showMainContent();
                            } else {
                                database.ref('users/' + user.uid).once('value').then(userSnapshot => {
                                    if (userSnapshot.exists()) {
                                        currentUserRole = 'user';
                                        isEditModeActive = false;
                                        showMainContent();
                                    } else {
                                        showToast('Usuario no autorizado.', 'error');
                                        auth.signOut();
                                    }
                                });
                            }
                        }).catch(error => {
                            console.error("Error al verificar rol de admin:", error);
                            auth.signOut();
                        });
                    } else {
                        // Usuario no logueado
                        currentUserRole = null;
                        isEditModeActive = false;
                        showLoginScreen();
                    }
                });
            })
            .catch((error) => {
                console.error("Error al configurar la persistencia de la sesión:", error);
                if(loginErrorMessage) {
                    loginErrorMessage.textContent = "Error de configuración de la sesión.";
                    loginErrorMessage.classList.remove('hidden');
                }
            });
    }

    function showLoginScreen() {
        document.body.classList.remove('uninitialized');
        if(mainContainer) mainContainer.style.display = 'none';
        if(loginContainer) loginContainer.style.display = 'flex';
        if(loginEmailInput) loginEmailInput.value = '';
        if(loginPasswordInput) loginPasswordInput.value = '';
        if(loginErrorMessage) loginErrorMessage.classList.add('hidden');
    }

    function showMainContent() {
        document.body.classList.remove('uninitialized');
        if(loginContainer) loginContainer.style.display = 'none';
        if(mainContainer) mainContainer.style.display = 'block';
        
        const oldAdminLoginButton = document.getElementById('toggleEditModeButton');
        if(oldAdminLoginButton) oldAdminLoginButton.style.display = 'none';

        if (allPlayers.length > 0) {
            applyFilters();
        } else {
            cargarTemporadasDisponibles();
        }
    }

    // --- NUEVOS EVENT LISTENERS PARA LOGIN/LOGOUT ---
    if(newLoginForm) newLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if(loginErrorMessage) loginErrorMessage.classList.add('hidden');
        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        auth.signInWithEmailAndPassword(email, password).catch(error => {
            console.error("Error de login:", error);
            if(loginErrorMessage) {
                loginErrorMessage.textContent = 'Credenciales incorrectas. Intente de nuevo.';
                loginErrorMessage.classList.remove('hidden');
            }
        });
    });

    if(logoutButton) logoutButton.addEventListener('click', () => {
        auth.signOut().then(() => {
            showToast('Has cerrado la sesión.');
        });
    });

    // --- LÓGICA ORIGINAL DE LA APLICACIÓN (con modificaciones menores) ---

    function normalizeCategoryName(name) {
        if (!name) return '';
        let normalized = name.toUpperCase().replace(/\s+/g, ' ').trim();
        normalized = normalized.replace('FEMENINA', 'FEMENINO').replace('MIXTA', 'MIXTO');
        return normalized;
    }

    const categoryProgressionRules = {
        'U11 MIXTO': ['U12 MIXTO'],
        'U12 FEMENINO': ['U12 MIXTO', 'U14 FEMENINO'],
        'U12 MIXTO': ['U14 MIXTO'],
        'U14 FEMENINO': ['U14 MIXTO', 'U16 FEMENINO'],
        'U14 MIXTO': ['U16 MASCULINO'],
        'U16 FEMENINO': ['U19 FEMENINO', 'Liga Femenina de Basquet'],
        'U16 MASCULINO': ['U18 MASCULINO'],
        'U18 MASCULINO': ['U20 MASCULINO', 'Liga de Desarrollo' , 'Liga Uruguaya de Basquet'],
        'U20 MASCULINO': ['Liga de Desarrollo', 'Liga Uruguaya de Basquet'],
        'Liga de Desarrollo': ['Liga Uruguaya de Basquet'],
        'U19 FEMENINO': ['Liga Femenina de Basquet'],
    };

    function getDniFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('dni');
    }

    function showPlayerFromUrl() {
        const dni = getDniFromUrl();
        if (dni && allPlayers.length > 0) {
            const player = allPlayers.find(p => String(p.DNI) === dni);
            if (player) {
                const playerIndex = currentlyDisplayedPlayers.findIndex(p => p._firebaseKey === player._firebaseKey);
                showPlayerDetails(player, isEditModeActive, playerIndex, false);
            }
        }
    }
    
    function showToast(message, type = '') {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.className = `toast-notification ${type}`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.classList.add('show'); }, 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => { if (document.body.contains(toast)) { document.body.removeChild(toast); } }, 300);
        }, 3000);
    }

    function cargarTemporadasDisponibles() {
        if (!messageEl || !seasonFilter) return;
        messageEl.textContent = 'Cargando temporadas...';
        messageEl.style.display = 'block';
        const temporadasRef = database.ref('/temporadas');

        temporadasRef.once('value').then(snapshot => {
            if (!snapshot.exists()) {
                messageEl.textContent = 'No se encontraron temporadas. Un administrador debe subir un CSV.';
                return;
            }
            const seasons = Object.keys(snapshot.val()).sort().reverse();
            while (seasonFilter.options.length > 1) seasonFilter.remove(1);
            seasons.forEach(season => seasonFilter.appendChild(new Option(season, season)));
            if (seasons.length > 0) {
                seasonFilter.value = seasons[0];
                conectarTemporada(seasons[0]);
            } else {
                 messageEl.textContent = 'No hay datos de jugadores para mostrar.';
            }
        }).catch(error => {
            console.error("Error cargando temporadas:", error);
            messageEl.textContent = 'Error al cargar la lista de temporadas.';
        });
    }

    function conectarTemporada(temporada) {
        if (!temporada) {
            allPlayers = [];
            displayPlayers([]);
            if(messageEl) {
                messageEl.textContent = 'Por favor, selecciona una temporada.';
                messageEl.style.display = 'block';
            }
            return;
        }

        if(messageEl) {
            messageEl.textContent = `Conectando a la temporada ${temporada}...`;
            messageEl.style.display = 'block';
        }
        if(tableContainer) tableContainer.innerHTML = '';

        if (currentSeasonListener) {
            currentSeasonListener.ref.off('value', currentSeasonListener.callback);
        }

        const registrosRef = database.ref('/registrosPorTemporada/' + temporada);
        
        const listenerCallback = snapshot => {
            if (!snapshot.exists()) {
                allPlayers = [];
                displayPlayers([]);
                if(messageEl) messageEl.textContent = `No hay datos para la temporada ${temporada}.`;
                return;
            }

            const seasonalRecords = snapshot.val();
            const DNIyTipo = new Set(Object.values(seasonalRecords).map(r => `${r._tipo}|${r._dni}`));

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
                        datosPersonalesMap.set(dni, snap.val());
                    }
                });

                allPlayers = Object.values(seasonalRecords).map(record => ({
                    ...(datosPersonalesMap.get(record._dni) || {}),
                    ...record
                }));

                if (allPlayers.length > 0) {
                    originalHeaders = Object.keys(allPlayers[0]);
                    populateCategoryFilter(allPlayers);
                    applyFilters();
                    if(messageEl) messageEl.style.display = 'none';
                    showPlayerFromUrl();
                } else {
                    if(tableContainer) tableContainer.innerHTML = '';
                    if(messageEl) {
                        messageEl.textContent = 'No se encontraron datos para esta temporada.';
                        messageEl.style.display = 'block';
                    }
                }
            });
        };

        registrosRef.on('value', listenerCallback, (error) => {
            console.error(`Error de Firebase (${temporada}):`, error);
            if(messageEl) messageEl.textContent = `Error al conectar con la temporada ${temporada}.`;
        });

        currentSeasonListener = { ref: registrosRef, callback: listenerCallback };
    }

    function applyPlayerChanges(playerToUpdate) {
        if (!isEditModeActive) {
            alert("No tienes permiso para guardar cambios.");
            return;
        }

        const finalData = { ...playerToUpdate };
        if(playerDetailView) {
            playerDetailView.querySelectorAll('#player-data-list input[type="text"]').forEach(input => finalData[input.dataset.key] = input.value);
            const selectElement = document.getElementById('edit-categoriasAutorizadas');
            finalData.categoriasAutorizadas = selectElement ? Array.from(selectElement.selectedOptions).map(o => o.value) : (playerToUpdate.categoriasAutorizadas || []);
            const newNumeros = { ...(playerToUpdate.Numeros || {}) };
            playerDetailView.querySelectorAll('.numero-input').forEach(input => {
                if (input.dataset.category) newNumeros[input.dataset.category] = input.value;
            });
            finalData.Numeros = newNumeros;
        }

        if (playerToUpdate.DNI !== finalData.DNI || playerToUpdate.TEMPORADA !== finalData.TEMPORADA) {
            showToast("No se puede cambiar el DNI ni la TEMPORADA.", "error");
            return;
        }

        const personalKeys = ['DNI', 'NOMBRE', 'FECHA NACIMIENTO', 'NACIONALIDAD', 'TELEFONO', 'EMAIL'];
        const seasonalKeys = ['COMPETICION', 'CATEGORIA', 'EQUIPO', 'ESTADO LICENCIA', 'FECHA_ALTA', 'BAJA', 'TIPO', 'FM Desde', 'FM Hasta', 'Numero', 'categoriasAutorizadas', 'Numeros', 'TEMPORADA'];
        const personalDataToUpdate = {}, seasonalDataToUpdate = {};
        personalKeys.forEach(k => { if (finalData[k] !== undefined) personalDataToUpdate[k] = finalData[k]; });
        seasonalKeys.forEach(k => { if (finalData[k] !== undefined) seasonalDataToUpdate[k] = finalData[k]; });

        if(seasonalDataToUpdate.Numeros && seasonalDataToUpdate.CATEGORIA){
            const mainNumInput = document.getElementById(`edit-numero-${seasonalDataToUpdate.CATEGORIA}`);
            if(mainNumInput) seasonalDataToUpdate.Numero = mainNumInput.value;
            if(seasonalDataToUpdate.Numero) seasonalDataToUpdate.Numeros[seasonalDataToUpdate.CATEGORIA] = seasonalDataToUpdate.Numero;
        }

        const { _tipo: rootNode, _dni: dni, TEMPORADA: season, _pushId: pushId } = finalData;
        const combinedDataForIndex = { ...seasonalDataToUpdate, _firebaseKey: finalData._firebaseKey, _tipo: rootNode, _dni: dni, _pushId: pushId };

        const updates = {
            [`/${rootNode}/${dni}/datosPersonales`]: personalDataToUpdate,
            [`/${rootNode}/${dni}/temporadas/${season}/${pushId}`]: seasonalDataToUpdate,
            [`/registrosPorTemporada/${season}/${pushId}`]: combinedDataForIndex,
            [`/temporadas/${season}`]: true
        };

        database.ref().update(updates)
            .then(() => {
                showToast("¡Cambios guardados con éxito!");
                hidePlayerDetails();
            })
            .catch((error) => {
                console.error("Error al guardar en Firebase:", error);
                alert(`Error al guardar: ${error.message}`);
            });
    }

    // --- EVENT LISTENERS ORIGINALES ---
    if(toggleSearchButton) toggleSearchButton.addEventListener('click', () => searchBar.classList.toggle('hidden'));
    if(nameSearchInput) nameSearchInput.addEventListener('input', applyFilters);
    if(dniSearchInput) dniSearchInput.addEventListener('input', applyFilters);
    if(categoryFilter) categoryFilter.addEventListener('change', applyFilters);
    if(equipoFilter) equipoFilter.addEventListener('change', applyFilters);
    if(seasonFilter) seasonFilter.addEventListener('change', () => {
        if(nameSearchInput) nameSearchInput.value = '';
        if(dniSearchInput) dniSearchInput.value = '';
        conectarTemporada(seasonFilter.value);
    });
    if(resetButton) resetButton.addEventListener('click', resetAll);
    if(expiringButton) expiringButton.addEventListener('click', showExpiring);
    if(printButton) printButton.addEventListener('click', generatePDF);

    function applyFilters() {
        if(printButton) printButton.classList.add('hidden');
        const nameTerm = nameSearchInput ? nameSearchInput.value.toLowerCase().trim() : '';
        const dniTerm = dniSearchInput ? dniSearchInput.value.toLowerCase().trim() : '';
        const selectedCategory = categoryFilter ? categoryFilter.value : '';
        const selectedEquipo = equipoFilter ? equipoFilter.value : '';
        
        populateCategoryFilter(allPlayers);
        populateEquipoFilter(allPlayers);
        updateSearchSuggestions(allPlayers);

        let filteredPlayers = allPlayers.filter(p => 
            (!nameTerm || (p.NOMBRE && p.NOMBRE.toLowerCase().includes(nameTerm))) &&
            (!dniTerm || (p.DNI && String(p.DNI).toLowerCase().includes(dniTerm))) &&
            (!selectedCategory || p.CATEGORIA === selectedCategory || (Array.isArray(p.categoriasAutorizadas) && p.categoriasAutorizadas.includes(selectedCategory))) &&
            (!selectedEquipo || p.EQUIPO === selectedEquipo)
        );

        if (auth.currentUser && seasonFilter && seasonFilter.value) {
            database.ref('preferenciasUsuarios/' + auth.currentUser.uid).update({ ultimaTemporadaSeleccionada: seasonFilter.value });
        }
        displayPlayers(filteredPlayers);
    }
    
    function parseDateDDMMYYYY(dateString) {
        if (!dateString || typeof dateString !== 'string') return null;
        const parts = dateString.split('/');
        if (parts.length !== 3) return null;
        const [day, month, year] = parts.map(p => parseInt(p, 10));
        if (isNaN(day) || isNaN(month) || isNaN(year) || year < 1900) return null;
        return new Date(year, month - 1, day);
    }

    function showExpiring() {
        if(printButton) printButton.classList.remove('hidden');
        const selectedSeason = seasonFilter ? seasonFilter.value : null;
        if (!selectedSeason) {
            showToast("Por favor, selecciona una temporada para ver los vencimientos.");
            return;
        }
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const limitDate = new Date(); limitDate.setDate(today.getDate() + 60);
        
        let expiringPlayers = allPlayers
            .filter(p => p.TIPO !== 'ENTRENADOR/A' && p['FM Hasta'] && parseDateDDMMYYYY(p['FM Hasta']) <= limitDate)
            .sort((a, b) => {
                const catComp = (a.CATEGORIA || '').localeCompare(b.CATEGORIA || '');
                if (catComp !== 0) return catComp;
                const dateA = parseDateDDMMYYYY(a['FM Hasta']);
                const dateB = parseDateDDMMYYYY(b['FM Hasta']);
                return dateA && dateB ? dateA - dateB : !dateA ? 1 : -1;
            });
        displayPlayers(expiringPlayers, `Vencimientos para la Temporada ${selectedSeason}`, ['CATEGORIA', 'DNI', 'NOMBRE', 'FM Hasta']);
    }

    function resetAll() {
        if(printButton) printButton.classList.add('hidden');
        if(nameSearchInput) nameSearchInput.value = '';
        if(dniSearchInput) dniSearchInput.value = '';
        if(categoryFilter) categoryFilter.selectedIndex = 0;
        if(equipoFilter) equipoFilter.selectedIndex = 0;
        if(nameSuggestionsDatalist) nameSuggestionsDatalist.innerHTML = '';
        if(dniSuggestionsDatalist) dniSuggestionsDatalist.innerHTML = '';
        applyFilters();
    }
    
    function updateSearchSuggestions(players) {
        if (!nameSearchInput || !dniSearchInput || !nameSuggestionsDatalist || !dniSuggestionsDatalist) return;
        const nameTerm = nameSearchInput.value.toLowerCase().trim();
        const dniTerm = dniSearchInput.value.toLowerCase().trim();
        nameSuggestionsDatalist.innerHTML = '';
        dniSuggestionsDatalist.innerHTML = '';
        const addOptions = (datalist, values) => {
            [...new Set(values)].slice(0, 10).forEach(val => {
                const option = document.createElement('option');
                option.value = val;
                datalist.appendChild(option);
            });
        };
        if (nameTerm.length >= 2) addOptions(nameSuggestionsDatalist, players.map(p => p.NOMBRE).filter(n => n && n.toLowerCase().includes(nameTerm)));
        if (dniTerm.length >= 2) addOptions(dniSuggestionsDatalist, players.map(p => String(p.DNI)).filter(d => d && d.toLowerCase().includes(dniTerm)));
    }

    function displayPlayers(players, customTitle = '', columns) {
        if (!tableContainer || !messageEl) return;

        const selectedCategory = categoryFilter ? categoryFilter.value : '';
        const currentColumns = columns || COLUMN_ORDER;
        currentlyDisplayedPlayers = players;

        // Helper para crear una fila, usado por ambas lógicas de renderizado
        const createPlayerRow = (player, categoryContext) => {
            const row = document.createElement('tr');
            row.className = 'clickable-row';
            const originalIndex = currentlyDisplayedPlayers.findIndex(p => p._firebaseKey === player._firebaseKey);
            row.addEventListener('click', () => showPlayerDetails(player, isEditModeActive, originalIndex, false));
            
            const expirationDate = parseDateDDMMYYYY(player['FM Hasta']);
            let colorClass = 'hover:bg-gray-100';
            if (player['TIPO'] === 'ENTRENADOR/A') {
                colorClass = 'bg-blue-100 text-blue-800 hover:bg-blue-200';
            } else if (expirationDate) {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const thirtyDays = new Date(today); thirtyDays.setDate(today.getDate() + 30);
                const sixtyDays = new Date(today); sixtyDays.setDate(today.getDate() + 60);
                const endOfYear = new Date(today.getFullYear(), 11, 24);
                if (expirationDate < today) colorClass = 'bg-red-100 text-red-800 hover:bg-red-200';
                else if (expirationDate <= thirtyDays) colorClass = 'bg-orange-100 text-orange-800 hover:bg-orange-200';
                else if (expirationDate <= sixtyDays) colorClass = 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200';
                else if (expirationDate > endOfYear) colorClass = 'bg-green-100 text-green-800 hover:bg-green-200';
            }
            row.classList.add(...colorClass.split(' '));

            currentColumns.forEach(colName => {
                const td = document.createElement('td');
                td.className = `px-2 py-2 text-sm ${colName === 'NOMBRE' ? 'truncate max-w-48' : 'whitespace-nowrap'}`;
                if ( colName === 'DNI' ||colName === 'FM Hasta' || colName === 'Numero' || colName === 'EQUIPO' || colName === 'CATEGORIA' || colName === 'COMPETICION') {
                    td.classList.add('text-center');
                }
                let cellValue = (colName === 'Numero') ? ((player.Numeros && player.Numeros[categoryContext || player.CATEGORIA]) || player.Numero || '-') : (player[colName] || '-');
                if ((colName === 'FM Hasta' || colName === 'FM DESDE') && cellValue === '1/1/1900') cellValue = '-';
                td.textContent = cellValue;
                row.appendChild(td);
            });
            return row;
        };

        // Helper para crear una tabla completa (header + body)
        const createTable = (players, categoryContext) => {
            const table = document.createElement('table');
            table.className = 'min-w-full divide-y divide-gray-200';
            const thead = table.createTHead();
            thead.className = 'bg-gray-50';
            const headerRow = thead.insertRow();
            currentColumns.forEach(headerText => {
                const th = document.createElement('th');
                th.className = 'px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider';
                th.textContent = headerText;
                headerRow.appendChild(th);
            });
            
            const tbody = table.createTBody();
            tbody.className = 'bg-white divide-y divide-gray-200';
            players.forEach(player => tbody.appendChild(createPlayerRow(player, categoryContext)));
            return table;
        };

        tableContainer.innerHTML = '';
        if (players.length === 0 && !customTitle) {
            messageEl.style.display = 'block';
            messageEl.textContent = 'No se encontraron jugadores que coincidan con la búsqueda.';
            return;
        }
        messageEl.style.display = 'none';

        // LÓGICA DE RENDERIZADO PRINCIPAL
        if (customTitle) {
            const titleEl = document.createElement('h3');
            titleEl.className = 'text-lg font-semibold mb-4 text-gray-800';
            titleEl.textContent = customTitle;
            tableContainer.appendChild(titleEl);
            tableContainer.appendChild(createTable(players, selectedCategory));

        } else if (selectedCategory) {
            // --- NUEVA LÓGICA DE GRUPOS --- 
            const playersInCategory = players
                .filter(p => p.CATEGORIA === selectedCategory && p.TIPO !== 'ENTRENADOR/A')
                .sort((a, b) => {
                    const numA = parseInt((a.Numeros && a.Numeros[selectedCategory]) || a.Numero, 10) || Infinity;
                    const numB = parseInt((b.Numeros && b.Numeros[selectedCategory]) || b.Numero, 10) || Infinity;
                    return numA - numB;
                });

            const coaches = players
                .filter(p => p.TIPO === 'ENTRENADOR/A');
                // No se especifica orden para entrenadores, se mantiene el orden por defecto

            const authorizedPlayers = players
                .filter(p => p.CATEGORIA !== selectedCategory && Array.isArray(p.categoriasAutorizadas) && p.categoriasAutorizadas.includes(selectedCategory))
                .sort((a, b) => (a.NOMBRE || '').localeCompare(b.NOMBRE || ''));

            // Renderizar tabla principal con jugadores y entrenadores
            const mainTable = createTable(playersInCategory, selectedCategory);
            const tbody = mainTable.querySelector('tbody');
            if (coaches.length > 0) {
                const coachHeaderRow = tbody.insertRow();
                coachHeaderRow.className = 'bg-gray-200 font-semibold';
                const cell = coachHeaderRow.insertCell();
                cell.colSpan = currentColumns.length;
                cell.textContent = 'Entrenadores';
                cell.className = 'px-6 py-2 text-sm text-gray-700';
                coaches.forEach(coach => tbody.appendChild(createPlayerRow(coach, selectedCategory)));
            }
            tableContainer.appendChild(mainTable);

            // Renderizar sección colapsable para autorizados
            if (authorizedPlayers.length > 0) {
                const details = document.createElement('details');
                details.className = 'mt-6 bg-gray-50 rounded-lg shadow';
                
                const summary = document.createElement('summary');
                summary.className = 'px-6 py-3 text-md font-medium text-gray-800 cursor-pointer focus:outline-none';
                summary.textContent = `Jugadores Autorizados (${authorizedPlayers.length})`;
                details.appendChild(summary);

                const authorizedContainer = document.createElement('div');
                authorizedContainer.className = 'p-4';
                authorizedContainer.appendChild(createTable(authorizedPlayers, selectedCategory));
                details.appendChild(authorizedContainer);
                
                tableContainer.appendChild(details);
            }

        } else {
            // Lógica original para cuando no hay categoría seleccionada
            tableContainer.appendChild(createTable(players, selectedCategory));
        }
    }
    
    function populateCategoryFilter(players) {
        if (!categoryFilter) return;
        const currentValue = categoryFilter.value;
        const categories = [...new Set(players.flatMap(p => [p.CATEGORIA, ...(p.categoriasAutorizadas || [])]).filter(Boolean))].sort();
        const existingOptions = new Set(Array.from(categoryFilter.options).map(o => o.value));
        categories.forEach(cat => {
            if (!existingOptions.has(cat)) categoryFilter.appendChild(new Option(cat, cat));
        });
        categoryFilter.value = currentValue;
    }

    function populateEquipoFilter(players) {
        if (!equipoFilter) return;
        const currentValue = equipoFilter.value;
        const equipos = [...new Set(players.map(p => p.EQUIPO).filter(Boolean))].sort();
        const existingOptions = new Set(Array.from(equipoFilter.options).map(o => o.value));
        equipos.forEach(eq => {
            if (!existingOptions.has(eq)) equipoFilter.appendChild(new Option(eq, eq));
        });
        equipoFilter.value = currentValue;
    }

    function createDetailHtml(key, value, fmHastaFrameClass) {
        let displayValue = (value === '1/1/1900') ? '-' : (value || '-');
        if (key === 'FM Hasta' && fmHastaFrameClass) {
            return `<div class="border-b border-gray-200 pb-2"><p class="text-xs font-medium text-gray-500 uppercase">${key}</p><div class="${fmHastaFrameClass}"><p class="text-md text-gray-900 font-bold">${displayValue}</p></div></div>`;
        }
        return `<div class="border-b border-gray-200 pb-2"><p class="text-xs font-medium text-gray-500 uppercase">${key}</p><p class="text-md text-gray-900 font-bold">${displayValue}</p></div>`;
    }

    function showPlayerDetails(player, canEdit, playerIndex = -1, isEditing = false) {
        if (!mainContent || !playerDetailView) return;
        if (playerIndex !== -1) currentPlayerIndex = playerIndex;
        mainContent.classList.add('hidden');
        playerDetailView.classList.remove('hidden');
        playerDetailView.innerHTML = '';

        const photoUrl = `${IMG_BASE_URL}${encodeURIComponent(player.DNI)}.jpg?alt=media`;
        const expirationDate = parseDateDDMMYYYY(player['FM Hasta']);
        let borderColor = 'border-gray-200', backgroundColor = 'bg-white', fmHastaFrameClass = '';
        if (expirationDate) {
            const hoy = new Date(); hoy.setHours(0,0,0,0);
            const thirtyDays = new Date(hoy); thirtyDays.setDate(hoy.getDate() + 30);
            const sixtyDays = new Date(hoy); sixtyDays.setDate(hoy.getDate() + 60);
            const endOfYear = new Date(hoy.getFullYear(), 11, 23);
            if (expirationDate < hoy) { borderColor = 'border-red-500'; backgroundColor = 'bg-red-100'; fmHastaFrameClass = 'bg-red-100 border-red-500'; }
            else if (expirationDate < thirtyDays) { borderColor = 'border-orange-500'; backgroundColor = 'bg-orange-100'; fmHastaFrameClass = 'bg-orange-100 border-orange-500'; }
            else if (expirationDate < sixtyDays) { borderColor = 'border-yellow-500'; backgroundColor = 'bg-yellow-100'; fmHastaFrameClass = 'bg-yellow-100 border-yellow-500'; }
            else if (expirationDate > endOfYear) { borderColor = 'border-green-500'; backgroundColor = 'bg-green-100'; fmHastaFrameClass = 'bg-green-100 border-green-500'; }
        }

        const primaryNumberForHeader = (player.Numeros && player.Numeros[player.CATEGORIA]) || player.Numero || 'S/N';
        const saveButtonHtml = isEditing ? `<div class="mt-4"><button id="saveChangesButton" class="w-full justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">Guardar Cambios</button></div>` : '';
        
        const toggleButtonHtml = canEdit ? `<button id="toggle-view-btn" class="py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">${isEditing ? 'Ver Ficha' : 'Editar'}</button>` : '';

        const detailRows = [
            ['CATEGORIA', 'EQUIPO', 'COMPETICION', 'TEMPORADA'],
            ['TELEFONO', 'EMAIL', 'FECHA_ALTA', 'TIPO'],
            ['DNI', 'NOMBRE', 'FECHA NACIMIENTO', 'NACIONALIDAD'],
            ['FM Hasta', 'FM Desde', 'ESTADO LICENCIA', 'BAJA']
        ];

        let detailsHtml = `
            <div class="${backgroundColor} p-6 rounded-xl shadow-md relative">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div class="md:col-span-1 flex flex-col items-center text-center">
                        <img src="${photoUrl}" alt="Foto de ${player.NOMBRE}" class="h-48 w-36 sm:h-64 sm:w-48 object-cover shadow-lg border-4 ${borderColor}" style="border-width: 4px;" onerror="this.onerror=null;this.src='${PLACEHOLDER_SVG_URL}';">
                        <h2 class="text-2xl font-bold text-gray-900 mt-4">${player.NOMBRE || 'Sin Nombre'}</h2>
                        <p class="text-lg text-gray-600">${player.CATEGORIA || 'Sin Categoría'}</p>
                        <p class="text-lg text-gray-600">Número: ${primaryNumberForHeader}</p>
                        <div class="mt-4 flex items-center justify-center space-x-2">
                            <button id="prevButton" class="py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">&lt; Ant</button>
                            <button id="backButton" class="py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Volver</button>
                            ${toggleButtonHtml}
                            <button id="nextButton" class="py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Sig &gt;</button>
                        </div>
                        ${saveButtonHtml}
                    </div>
                    <div class="md:col-span-2">
                        <h3 class="text-xl font-semibold border-b border-gray-300 pb-2 mb-4">Detalles</h3>
                        <div id="player-data-list" class="space-y-4">
                            ${detailRows.map(row => `
                                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                    ${row.map(key => isEditing ?
                                        `<div><label for="edit-${key}" class="block text-sm font-medium text-gray-600">${key}</label><input type="text" id="edit-${key}" data-key="${key}" value="${player[key] || ''}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm"></div>` :
                                        createDetailHtml(key, player[key], fmHastaFrameClass)
                                    ).join('')}
                                </div>
                            `).join('')}
                        </div>
                        ${isEditing ? `
                        <div class="mt-6 flex flex-wrap md:flex-nowrap gap-6">
                            <div class="w-full md:w-1/2">
                                <h4 id="toggle-numeros" class="text-md font-semibold text-gray-700 border-b pb-1 mb-2 cursor-pointer">Gestión de Números <span id="toggle-numeros-icon">►</span></h4>
                                <div id="numeros-content" class="hidden"></div>
                            </div>
                            <div class="w-full md:w-1/2">
                                <h4 id="toggle-categorias" class="text-md font-semibold text-gray-700 border-b pb-1 mb-2 cursor-pointer">Categorías Autorizadas <span id="toggle-categorias-icon">►</span></h4>
                                <div id="categorias-content" class="hidden">
                                    <select multiple id="edit-categoriasAutorizadas" class="mt-1 block w-full h-32 px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm"></select>
                                    <p class="mt-1 text-xs text-gray-500">Mantén Ctrl (o Cmd) para seleccionar varias.</p>
                                </div>
                            </div>
                        </div>` : ''}
                    </div>
                </div>
                ${!isEditing ? `<button id="statsButton" class="absolute bottom-4 right-4 py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700">Estadísticas</button>` : ''}
            </div>`;
        playerDetailView.innerHTML = detailsHtml;

        if (isEditing) {
            const categoriasSelect = document.getElementById('edit-categoriasAutorizadas');
            if (categoriasSelect) {
                const categoriasDeLaTemporada = [...new Set(allPlayers.map(p => p.CATEGORIA).filter(Boolean))].sort();
                categoriasDeLaTemporada.forEach(cat => {
                    const isSelected = player.categoriasAutorizadas && player.categoriasAutorizadas.includes(cat);
                    categoriasSelect.add(new Option(cat, cat, isSelected, isSelected));
                });
                
                const updateNumerosUI = () => {
                    const numerosContent = document.getElementById('numeros-content');
                    if(!numerosContent) return;
                    const selectedCategories = Array.from(categoriasSelect.selectedOptions).map(opt => opt.value);
                    let numerosHtml = '';
                    const primaryCategory = player.CATEGORIA;
                    const primaryNumber = (player.Numeros && player.Numeros[primaryCategory]) || player.Numero || '';
                    numerosHtml += `<div class="mt-2"><label class="block text-sm font-medium text-gray-600">Nº en ${primaryCategory} (Principal)</label><input type="number" data-category="${primaryCategory}" value="${primaryNumber}" class="numero-input mt-1 block w-full ..."></div>`;
                    if (selectedCategories.length > 0) {
                        numerosHtml += `<h5 class="text-sm font-semibold text-gray-600 mt-3 mb-1">Nºs en Categorías Autorizadas</h5>`;
                        selectedCategories.forEach(cat => {
                            if (cat === primaryCategory) return;
                            const authorizedNumber = (player.Numeros && player.Numeros[cat]) || '';
                            numerosHtml += `<div class="mt-2"><label class="block text-sm font-medium text-gray-600">Nº en ${cat}</label><input type="number" data-category="${cat}" value="${authorizedNumber}" class="numero-input mt-1 block w-full ..."></div>`;
                        });
                    }
                    numerosContent.innerHTML = numerosHtml;
                };
                categoriasSelect.addEventListener('change', updateNumerosUI);
                updateNumerosUI();
            }
            document.getElementById('toggle-categorias').addEventListener('click', () => { document.getElementById('categorias-content').classList.toggle('hidden'); });
            document.getElementById('toggle-numeros').addEventListener('click', () => { document.getElementById('numeros-content').classList.toggle('hidden'); });
        }

        document.getElementById('backButton').addEventListener('click', hidePlayerDetails);
        document.getElementById('prevButton').addEventListener('click', () => { if (currentPlayerIndex > 0) showPlayerDetails(currentlyDisplayedPlayers[--currentPlayerIndex], canEdit, currentPlayerIndex, isEditing); });
        document.getElementById('nextButton').addEventListener('click', () => { if (currentPlayerIndex < currentlyDisplayedPlayers.length - 1) showPlayerDetails(currentlyDisplayedPlayers[++currentPlayerIndex], canEdit, currentPlayerIndex, isEditing); });
        
        if (canEdit) {
            const toggleBtn = document.getElementById('toggle-view-btn');
            if (toggleBtn) toggleBtn.addEventListener('click', () => showPlayerDetails(player, canEdit, playerIndex, !isEditing));
        }

        if (isEditing) {
            document.getElementById('saveChangesButton').addEventListener('click', () => applyPlayerChanges(player));
        } else {
            const statsButton = document.getElementById('statsButton');
            if (statsButton) statsButton.addEventListener('click', () => {
                if (player.DNI) window.location.href = `estadisticas.html?dni=${player.DNI}`;
            });
        }
    }
    
    function hidePlayerDetails() {
        if(playerDetailView) playerDetailView.classList.add('hidden');
        if(mainContent) mainContent.classList.remove('hidden');
        if(nameSearchInput) nameSearchInput.focus();
        const url = new URL(window.location);
        if (url.searchParams.has('dni')) {
            url.searchParams.delete('dni');
            window.history.replaceState({}, '', url);
        }
        applyFilters();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    function generatePDF() {
        if (currentlyDisplayedPlayers.length === 0) return showToast("No hay datos para PDF.", "error");
        if (typeof window.jspdf === 'undefined') return showToast("Librería PDF no disponible.", "error");
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const selectedSeason = seasonFilter ? seasonFilter.value : "";
        doc.text(`Vencimientos para la Temporada ${selectedSeason}`, 14, 22);

        const maskDNI = (dni) => {
            const dniStr = String(dni || '');
            if (dniStr.length > 4) {
                return '****' + dniStr.substring(4);
            }
            return dniStr;
        };

        doc.autoTable({
            head: [['CATEGORIA', 'DNI', 'NOMBRE', 'FM Hasta']],
            body: currentlyDisplayedPlayers.map(p => [
                p.CATEGORIA || '-',
                maskDNI(p.DNI),
                p.NOMBRE || '-',
                p['FM Hasta'] || '-'
            ]),
            startY: 30,
        });

        doc.save(`vencimientos_${selectedSeason}.pdf`);
        showToast("PDF generado.", "success");
    }

    // --- INICIALIZACIÓN ---
    initializeAuth();
});
