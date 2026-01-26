document.addEventListener('DOMContentLoaded', function() {
    // --- PREVENCIÓN DE PARPADEO (FLICKERING) ---
    const params = new URLSearchParams(window.location.search);
    if (params.has('dni')) {
        const loginContainer = document.getElementById('login-container');
        const mainContainer = document.getElementById('main-container');
        const mainContent = document.getElementById('main-content');
        const playerDetailView = document.getElementById('playerDetailView');
        if (loginContainer) loginContainer.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'block';
        if (mainContent) mainContent.classList.add('hidden');
        if (playerDetailView) {
            playerDetailView.classList.remove('hidden');
            playerDetailView.innerHTML = '<div class="text-center p-8 text-white">Cargando jugador...</div>';
        }
    }

    let isDeviceReady = false;
    document.addEventListener('deviceready', () => { isDeviceReady = true; }, false);

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

    const IMG_BASE_URL = 'https://raw.githubusercontent.com/appsparavos-ops/DSC/fotos/';
    const LOGO_URL = 'https://raw.githubusercontent.com/appsparavos-ops/DSC/fotos/Defensor_Sporting.png';
    const PLACEHOLDER_SVG_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2EwYTBhMCI+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OS00IDQgNHptMCAyYy0yLjY3IDAtOCA0IDQgNHYyYzAgMS4xLjkgMiAyIDJoMTRjMS4xIDAgMi0uOSAyLTJ2LTJjMC0yLjY2LTUuMzMtNC04LTR6Ii8+PC9zdmc+';
    const COLUMN_ORDER = [ 'DNI', 'NOMBRE','FM Hasta', 'Numero','CATEGORIA','COMPETICION','EQUIPO', ];

    // --- ELEMENTOS DEL DOM ---
    const loginContainer = document.getElementById('login-container');
    const mainContainer = document.getElementById('main-container');
    const newLoginForm = document.getElementById('login-form');
    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const loginErrorMessage = document.getElementById('login-error-message');
    const logoutButton = document.getElementById('logout-button');
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
    
    let allPlayers = [], originalHeaders = [], currentlyDisplayedPlayers = [], currentColumnsForPDF = [];
    let isEditModeActive = false, currentUserRole = null, currentPlayerIndex = -1, currentSeasonListener = null;

    // --- LÓGICA DE BITÁCORA ---
    function getTimestampKey() {
        const now = new Date();
        const timestamp = now.getFullYear().toString() +
               String(now.getMonth() + 1).padStart(2, '0') +
               String(now.getDate()).padStart(2, '0') +
               String(now.getHours()).padStart(2, '0') +
               String(now.getMinutes()).padStart(2, '0') +
               String(now.getSeconds()).padStart(2, '0');
        const randomPart = Math.random().toString(36).substring(2, 7); // 5 random chars
        return `${timestamp}-${randomPart}`;
    }

    function logAction(action, details) {
        const user = auth.currentUser;
        if (!user) return;

        const timestampKey = getTimestampKey();
        const logEntry = {
            usuario: user.email,
            uid: user.uid,
            accion: action,
            fecha: new Date().toISOString(),
            detalles: details
        };

        const logRef = database.ref(`/bitacora/${timestampKey}`);
        logRef.set(logEntry).catch(error => {
            console.error("Error al escribir en la bitácora:", error);
        });
    }

    // --- LÓGICA DE AUTENTICACIÓN ---
    function initializeAuth() {
        auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).then(() => {
            auth.onAuthStateChanged(user => {
                if (user) {
                    logAction('login', { email: user.email });
                    database.ref('admins/' + user.uid).once('value').then(snapshot => {
                        if (snapshot.exists()) {
                            currentUserRole = 'admin';
                            isEditModeActive = true;
                        } else {
                            currentUserRole = 'user';
                            isEditModeActive = false;
                        }
                        showMainContent();
                    }).catch(error => {
                        console.error("Error al verificar rol de admin:", error);
                        auth.signOut();
                    });
                } else {
                    currentUserRole = null;
                    isEditModeActive = false;
                    showLoginScreen();
                }
            });
        }).catch(error => {
            console.error("Error al configurar la persistencia de la sesión:", error);
            if(loginErrorMessage) loginErrorMessage.textContent = "Error de configuración de la sesión.";
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
        
        const controlsContainer = document.getElementById('resetButton')?.parentNode;
        if (controlsContainer) {
            let addButton = document.getElementById('addPlayerButton');
            if (isEditModeActive) {
                if (!addButton) {
                    addButton = document.createElement('button');
                    addButton.id = 'addPlayerButton';
                    addButton.textContent = 'Agregar Jugador';
                    addButton.className = 'ml-2 py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500';
                    addButton.addEventListener('click', showAddPlayerForm);
                    
                    const printButton = document.getElementById('printButton');
                    if (printButton) {
                        printButton.parentNode.insertBefore(addButton, printButton.nextSibling);
                    } else {
                        controlsContainer.appendChild(addButton);
                    }
                }
            } else {
                if (addButton) addButton.remove();
            }
        }

        if (allPlayers.length === 0) {
            cargarTemporadasDisponibles();
        }
    }

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

    // --- LÓGICA DE LA APLICACIÓN ---
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

            const user = auth.currentUser;
            if (user) {
                const userPrefsRef = database.ref('preferenciasUsuarios/' + user.uid + '/ultimaTemporadaSeleccionada');
                userPrefsRef.once('value').then(prefSnapshot => {
                    const preferredSeason = prefSnapshot.val();
                    if (preferredSeason && seasons.includes(preferredSeason)) {
                        seasonFilter.value = preferredSeason;
                        conectarTemporada(preferredSeason);
                    } else if (seasons.length > 0) {
                        seasonFilter.value = seasons[0];
                        conectarTemporada(seasons[0]);
                    } else {
                        messageEl.textContent = 'No hay datos de jugadores para mostrar.';
                    }
                });
            } else if (seasons.length > 0) {
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

                allPlayers = Object.values(seasonalRecords).map(record => {
                    const personalData = datosPersonalesMap.get(String(record._dni)) || {};
                    // Nos aseguramos que los datos de FM vengan de datosPersonales, pero respetamos si ya existen en el registro
                    const fmHasta = record['FM Hasta'] || personalData['FM Hasta'];
                    const fmDesde = record['FM Desde'] || personalData['FM Desde'];
                    const combined = { ...record, ...personalData };
                    if (fmHasta) combined['FM Hasta'] = fmHasta;
                    if (fmDesde) combined['FM Desde'] = fmDesde;
                    return combined;
                });
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

        const { _tipo: tipoValor, _dni: dni, TEMPORADA: season, _pushId: pushId } = playerToUpdate;
        const dbNode = (tipoValor === 'JUGADOR/A' || tipoValor === 'jugadores') ? 'jugadores' : 'entrenadores';
        const updates = {};
        let datosParaBitacora;

        // Extraer los números del formulario
        const newNumeros = { ...(playerToUpdate.Numeros || {}) };
        if (playerDetailView) {
            playerDetailView.querySelectorAll('.numero-input').forEach(input => {
                if (input.dataset.category) newNumeros[input.dataset.category] = input.value;
            });
        }
        const primaryCategory = playerToUpdate.CATEGORIA;
        const newPrimaryNumber = (primaryCategory && newNumeros[primaryCategory] !== undefined) ? newNumeros[primaryCategory] : playerToUpdate.Numero;


        if (playerToUpdate.esAutorizado) {
            // --- LÓGICA PARA JUGADORES AUTORIZADOS ---
            // Solo se actualiza el número, no se tocan otros datos para mantener el estado 'autorizado'.
            updates[`/${dbNode}/${dni}/temporadas/${season}/${pushId}/Numero`] = newPrimaryNumber;
            updates[`/${dbNode}/${dni}/temporadas/${season}/${pushId}/Numeros`] = newNumeros;
            updates[`/registrosPorTemporada/${season}/${pushId}/Numero`] = newPrimaryNumber;
            updates[`/registrosPorTemporada/${season}/${pushId}/Numeros`] = newNumeros;

            // Preparamos un objeto limpio para la bitácora, sin rutas de Firebase como claves.
            datosParaBitacora = {
                Numero: newPrimaryNumber,
                Numeros: newNumeros,
                esAutorizado: true,
                contexto: {
                    dni: dni,
                    temporada: season,
                    pushId: pushId
                }
            };

        } else {
            // --- LÓGICA ORIGINAL PARA JUGADORES NO AUTORIZADOS ---
            const finalData = { ...playerToUpdate };
            if(playerDetailView) {
                playerDetailView.querySelectorAll('#player-data-list input[type="text"]').forEach(input => finalData[input.dataset.key] = input.value);
                const selectElement = document.getElementById('edit-categoriasAutorizadas');
                finalData.categoriasAutorizadas = selectElement ? Array.from(selectElement.selectedOptions).map(o => o.value) : (playerToUpdate.categoriasAutorizadas || []);
                finalData.Numeros = newNumeros;
                finalData.Numero = newPrimaryNumber;
            }

            if (playerToUpdate.DNI !== finalData.DNI || playerToUpdate.TEMPORADA !== finalData.TEMPORADA) {
                showToast("No se puede cambiar el DNI ni la TEMPORADA.", "error");
                return;
            }

            const personalKeys = ['DNI', 'NOMBRE', 'FECHA NACIMIENTO', 'NACIONALIDAD', 'TELEFONO', 'EMAIL', 'FM Desde', 'FM Hasta'];
            const seasonalKeys = ['COMPETICION', 'CATEGORIA', 'EQUIPO', 'ESTADO LICENCIA', 'FECHA_ALTA', 'BAJA', 'TIPO', 'Numero', 'categoriasAutorizadas', 'Numeros', 'TEMPORADA'];
            const personalDataToUpdate = {}, seasonalDataToUpdate = {};
            personalKeys.forEach(k => { if (finalData[k] !== undefined) personalDataToUpdate[k] = finalData[k]; });
            seasonalKeys.forEach(k => { if (finalData[k] !== undefined) seasonalDataToUpdate[k] = finalData[k]; });
            
            const combinedDataForIndex = { ...finalData };

            updates[`/${dbNode}/${dni}/datosPersonales`] = personalDataToUpdate;
            updates[`/${dbNode}/${dni}/temporadas/${season}/${pushId}`] = seasonalDataToUpdate;
            updates[`/registrosPorTemporada/${season}/${pushId}`] = combinedDataForIndex;
            updates[`/temporadas/${season}`] = true;

            // Para la bitácora, registramos los objetos de datos que se van a guardar.
            datosParaBitacora = {
                personal: personalDataToUpdate,
                seasonal: seasonalDataToUpdate,
                registro: combinedDataForIndex
            };
        }

        database.ref().update(updates)
            .then(() => {
                showToast("¡Cambios guardados con éxito!");
                // Usamos el objeto 'datosParaBitacora' que no contiene claves inválidas.
                logAction('modificacion', { dni: playerToUpdate.DNI, nombre: playerToUpdate.NOMBRE, datos: datosParaBitacora });
                hidePlayerDetails();
            })
            .catch((error) => {
                console.error("Error al guardar en Firebase:", error);
                alert(`Error al guardar: ${error.message}`);
            });
    }

    if(toggleSearchButton) toggleSearchButton.addEventListener('click', () => searchBar.classList.toggle('hidden'));
    if(nameSearchInput) nameSearchInput.addEventListener('input', applyFilters);
    if(dniSearchInput) dniSearchInput.addEventListener('input', applyFilters);
    if(categoryFilter) categoryFilter.addEventListener('change', applyFilters);
    if(equipoFilter) equipoFilter.addEventListener('change', applyFilters);
    if(seasonFilter) seasonFilter.addEventListener('change', () => {
        if(nameSearchInput) nameSearchInput.value = '';
        if(dniSearchInput) dniSearchInput.value = '';
        if(categoryFilter) categoryFilter.selectedIndex = 0;
        if(equipoFilter) equipoFilter.selectedIndex = 0;
        
        const newSeason = seasonFilter.value;
        conectarTemporada(newSeason);

        const user = auth.currentUser;
        if (user && newSeason) {
            database.ref('preferenciasUsuarios/' + user.uid).update({ ultimaTemporadaSeleccionada: newSeason });
        }
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
            (!selectedCategory || p.CATEGORIA === selectedCategory || (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(selectedCategory)) || (p.esAutorizado && p.CATEGORIA === selectedCategory)) &&
            (!selectedEquipo || p.EQUIPO === selectedEquipo)
        );

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

        const selectedEquipo = equipoFilter ? equipoFilter.value : '';
        const selectedCategory = categoryFilter ? categoryFilter.value : '';

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const limitDate = new Date(); limitDate.setDate(today.getDate() + 60);
        
        let expiringPlayers = allPlayers.filter(p => p.TIPO !== 'ENTRENADOR/A' && p['FM Hasta'] && parseDateDDMMYYYY(p['FM Hasta']) <= limitDate);
        const displayColumns = ['EQUIPO', 'CATEGORIA', 'DNI', 'NOMBRE', 'FM Hasta'];
        let title = `Vencimientos para la Temporada ${selectedSeason}`;

        const sortByDate = (a, b) => {
            const dateA = parseDateDDMMYYYY(a['FM Hasta']);
            const dateB = parseDateDDMMYYYY(b['FM Hasta']);
            return dateA && dateB ? dateA - dateB : !dateA ? 1 : -1;
        };

        if (selectedEquipo && selectedCategory) {
            title += ` del Equipo: ${selectedEquipo} y Cat: ${selectedCategory}`;
            expiringPlayers = expiringPlayers.filter(p => p.EQUIPO === selectedEquipo && p.CATEGORIA === selectedCategory);
            expiringPlayers.sort(sortByDate);
        } else if (selectedEquipo) {
            title += ` del Equipo: ${selectedEquipo}`;
            expiringPlayers = expiringPlayers.filter(p => p.EQUIPO === selectedEquipo);
            expiringPlayers.sort((a, b) => {
                const catComp = (a.CATEGORIA || '').localeCompare(b.CATEGORIA || '');
                if (catComp !== 0) return catComp;
                return sortByDate(a, b);
            });
        } else if (selectedCategory) {
            title += ` de la Categoría: ${selectedCategory}`;
            expiringPlayers = expiringPlayers.filter(p => p.CATEGORIA === selectedCategory);
            expiringPlayers.sort((a, b) => {
                const equipoComp = (a.EQUIPO || '').localeCompare(b.EQUIPO || '');
                if (equipoComp !== 0) return equipoComp;
                return sortByDate(a, b);
            });
        } else {
            // "Todos los equipos"
            expiringPlayers.sort((a, b) => {
                const equipoComp = (a.EQUIPO || '').localeCompare(b.EQUIPO || '');
                if (equipoComp !== 0) return equipoComp;
                const catComp = (a.CATEGORIA || '').localeCompare(b.CATEGORIA || '');
                if (catComp !== 0) return catComp;
                return sortByDate(a, b);
            });
        }

        displayPlayers(expiringPlayers, title, displayColumns);
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

        if (customTitle && columns) {
            currentColumnsForPDF = columns;
        }

        const selectedCategory = categoryFilter ? categoryFilter.value : '';
        const currentColumns = columns || COLUMN_ORDER;
        currentlyDisplayedPlayers = players;

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
                
                let cellValue;
                if (colName === 'CATEGORIA' && player.esAutorizado) {
                    cellValue = player.categoriaOrigen || player.CATEGORIA;
                } else {
                    cellValue = (colName === 'Numero') ? ((player.Numeros && player.Numeros[categoryContext || player.CATEGORIA]) || player.Numero || '-') : (player[colName] || '-');
                }

                if ((colName === 'FM Hasta' || colName === 'FM DESDE') && cellValue === '1/1/1900') cellValue = '-';
                if (colName === 'NOMBRE' && player['ESTADO LICENCIA'] === 'Baja') {
                    td.innerHTML = `<span class="text-red-600 font-bold mr-1">X</span>${cellValue || '-'}`;
                } else {
                    td.textContent = cellValue || '-';
                }
                row.appendChild(td);
            });
            return row;
        };

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

        if (customTitle) {
            tableContainer.appendChild(createTable(players, selectedCategory));
        } else if (selectedCategory) {
            const playersInCategory = players
                .filter(p => p.CATEGORIA === selectedCategory && !p.esAutorizado && p.TIPO !== 'ENTRENADOR/A')
                .sort((a, b) => {
                    const numA = parseInt((a.Numeros && a.Numeros[selectedCategory]) || a.Numero, 10) || Infinity;
                    const numB = parseInt((b.Numeros && b.Numeros[selectedCategory]) || b.Numero, 10) || Infinity;
                    return numA - numB;
                });

            const coaches = players.filter(p => p.CATEGORIA === selectedCategory && p.TIPO === 'ENTRENADOR/A');

            const authorizedPlayers = players
                .filter(p => {
                    const isSameSeasonAuth = p.categoriasAutorizadas && p.categoriasAutorizadas.includes(selectedCategory) && p.CATEGORIA !== selectedCategory;
                    const isCrossSeasonAuth = p.esAutorizado && p.CATEGORIA === selectedCategory;
                    return isSameSeasonAuth || isCrossSeasonAuth;
                })
                .sort((a, b) => (a.NOMBRE || '').localeCompare(b.NOMBRE || ''));

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
            tableContainer.appendChild(createTable(players, selectedCategory));
        }
    }
    
    function populateCategoryFilter(players) {
        if (!categoryFilter) return;

        const currentValue = categoryFilter.value;

        // Get all unique, sorted categories from the current season's players
        const categories = [...new Set(
            players.flatMap(p => [p.CATEGORIA, p.categoriaOrigen, ...(p.categoriasAutorizadas || [])])
                   .filter(Boolean)
        )].sort();

        // Preserve the placeholder option (the first option)
        const placeholderText = categoryFilter.options[0].text;
        const placeholderValue = categoryFilter.options[0].value;

        // Clear dropdown
        categoryFilter.innerHTML = '';

        // Add placeholder back
        categoryFilter.appendChild(new Option(placeholderText, placeholderValue));

        // Add sorted categories
        categories.forEach(cat => {
            categoryFilter.appendChild(new Option(cat, cat));
        });

        // Restore selection if possible
        try {
            categoryFilter.value = currentValue;
        } catch (e) {
            // This can happen if the previously selected category doesn't exist in the new season
            // The dropdown will safely default to the placeholder.
        }
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
            return `<div class="border-b border-gray-200 pb-2"><p class="text-xs font-medium text-gray-500 uppercase">${key}</p><div class="border-2 rounded-lg p-1 ${fmHastaFrameClass}"><p class="text-md text-gray-900 font-bold text-center">${displayValue}</p></div></div>`;
        }
        return `<div class="border-b border-gray-200 pb-2"><p class="text-xs font-medium text-gray-500 uppercase">${key}</p><p class="text-md text-gray-900 font-bold">${displayValue}</p></div>`;
    }

    function showPlayerDetails(player, canEdit, playerIndex = -1, isEditing = false) {
        if (!mainContent || !playerDetailView) return;

        const isReadOnlyForAuth = player.esAutorizado && isEditing;

        // Ya no se fuerza isEditing = false, se maneja en la UI.
        if (isReadOnlyForAuth) {
            showToast("Modo de edición limitado para jugador autorizado.", "info");
        }

        logAction('Consulta de ficha', { dni: player.DNI, nombre: player.NOMBRE });
        if (playerIndex !== -1) currentPlayerIndex = playerIndex;
        mainContent.classList.add('hidden');
        playerDetailView.classList.remove('hidden');
        playerDetailView.innerHTML = '';

        const photoUrl = `${IMG_BASE_URL}${encodeURIComponent(player.DNI)}.jpg`;
        const expirationDate = parseDateDDMMYYYY(player['FM Hasta']);
        let borderColor = 'border-gray-200', backgroundColor = 'bg-white', fmHastaFrameClass = '';
        
        if (expirationDate) {
            const hoy = new Date(); hoy.setHours(0,0,0,0);
            const thirtyDays = new Date(hoy); thirtyDays.setDate(hoy.getDate() + 30);
            const sixtyDays = new Date(hoy); sixtyDays.setDate(hoy.getDate() + 60);
            const endOfYear = new Date(hoy.getFullYear(), 11, 23);

            let isGreen = false;

            // New special logic for intermediate seasons
            const season = player.TEMPORADA;
            const category = player.CATEGORIA;
            if (season && season.includes('-')) {
                const years = season.split('-');
                if (years.length === 2 && years[1].length === 4) {
                    const endYear = parseInt(years[1], 10);
                    let targetDate;
                    if (category === 'Liga de Desarrollo') {
                        targetDate = new Date(endYear, 3, 1); // April 1st
                    } else if (category === 'Liga Uruguaya de Basquet') {
                        targetDate = new Date(endYear, 6, 15); // July 15th
                    }
                    if (targetDate && expirationDate > targetDate) {
                        isGreen = true;
                    }
                }
            }

            // Old "end of year" green rule for other categories
            if (!isGreen && expirationDate > endOfYear) {
                isGreen = true;
            }

            // --- Main Color Logic ---
            if (isGreen) {
                borderColor = 'border-green-500'; backgroundColor = 'bg-green-100'; fmHastaFrameClass = 'bg-green-100 border-green-500';
            } else if (expirationDate < hoy) {
                borderColor = 'border-red-500'; backgroundColor = 'bg-red-100'; fmHastaFrameClass = 'bg-red-100 border-red-500';
            } else if (expirationDate <= thirtyDays) { // 30 days = orange
                borderColor = 'border-orange-500'; backgroundColor = 'bg-orange-100'; fmHastaFrameClass = 'bg-orange-100 border-orange-500';
            } else if (expirationDate <= sixtyDays) { // 60 days = yellow
                borderColor = 'border-yellow-500'; backgroundColor = 'bg-yellow-100'; fmHastaFrameClass = 'bg-yellow-100 border-yellow-500';
            }
        }

        const primaryNumberForHeader = (player.Numeros && player.Numeros[player.CATEGORIA]) || player.Numero || 'S/N';
        const saveButtonHtml = isEditing ? `
            <div class="mt-4 flex gap-2">
                <button id="importPlayerButton" class="flex-1 justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-red-400 hover:bg-red-400">Importar</button>
                <button id="authorizePlayerButton" class="flex-1 justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700">Autorizar+</button>
                <button id="saveChangesButton" class="flex-1 justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">Guardar Cambios</button>

            </div>
        ` : '';
        
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
                        <p class="text-lg text-gray-600">${(player.esAutorizado && player.categoriaOrigen) ? player.categoriaOrigen : (player.CATEGORIA || 'Sin Categoría')}</p>
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
                                    ${row.map(key => {
                                        let val = player[key] || '';
                                        if (key === 'CATEGORIA' && player.esAutorizado) {
                                            val = player.categoriaOrigen || val;
                                        }
                                        return isEditing ?
                                        `<div><label for="edit-${key}" class="block text-sm font-medium text-gray-600">${key}</label><input type="text" id="edit-${key}" data-key="${key}" value="${val}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm"></div>` :
                                        createDetailHtml(key, val, fmHastaFrameClass)
                                    }).join('')}
                                </div>
                            `).join('')}
                        </div>
                        ${isEditing ? `
                        <div class="mt-6 flex flex-wrap md:flex-nowrap gap-6">
                            <div class="w-full md:w-1/2">
                                <h4 id="toggle-numeros" class="text-md font-semibold text-gray-700 border-b pb-1 mb-2 cursor-pointer">Gestión de Números <span id="toggle-numeros-icon">►</span></h4>
                                <div id="numeros-content" class="hidden"></div>
                            </div>
                            <div class="w-full md:w-1/2" id="categorias-autorizadas-container">
                                <h4 id="toggle-categorias" class="text-md font-semibold text-gray-700 border-b pb-1 mb-2 cursor-pointer">Categorías Autorizadas <span id="toggle-categorias-icon">►</span></h4>
                                <div id="categorias-content" class="hidden">
                                    <select multiple id="edit-categoriasAutorizadas" class="mt-1 block w-full h-24 px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm"></select>
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
                            const authorizedNumber = (player.Numeros && player.Numeros[cat]) || primaryNumber;
                            numerosHtml += `<div class="mt-2"><label class="block text-sm font-medium text-gray-600">Nº en ${cat}</label><input type="number" data-category="${cat}" value="${authorizedNumber}" class="numero-input mt-1 block w-full ..."></div>`;
                        });
                    }
                    numerosContent.innerHTML = numerosHtml;
                };

                const categoryProgressionRules = {
                    'U11 Mixta': ['U12 Mixta'],
                    'U12 Femenino': ['U12 Mixta', 'U14 Femenino'],
                    'U12 Mixta': ['U14 Mixto'],
                    'U14 Femenino': ['U14 Mixto', 'U16 Femenino'],
                    'U14 Mixto': ['U16 Masculino'],
                    'U16 Femenino': ['U19 Femenina', 'Liga Femenina de Basquet'],
                    'U16 Masculino': ['U18 Masculino'],
                    'U18 Masculino': ['U20 Masculino', 'Liga de Desarrollo' , 'Liga Uruguaya de Basquet'],
                    'U20 Masculino': ['Liga de Desarrollo', 'Liga Uruguaya de Basquet'],
                    'Liga de Desarrollo': ['Liga Uruguaya de Basquet'],
                    'U19 Femenina': ['Liga Femenina de Basquet'],
                };

                const primaryCategory = player.CATEGORIA;
                // FIX: Convertir a mayúsculas para que coincida con las claves de las reglas (ej: "U14 Mixto" vs "U14 Mixto")
                const suggestedCategories = categoryProgressionRules[primaryCategory] || [];
                const existingAuthorizations = player.categoriasAutorizadas || [];

                let categoriesToShow = [...new Set([...suggestedCategories, ...existingAuthorizations])];
                
                const specialLeagues = ["Liga de Desarrollo", "Liga Uruguaya de Basquet"];
                categoriesToShow = categoriesToShow.filter(cat => !specialLeagues.includes(cat));

                const categoriasContainer = document.getElementById('categorias-autorizadas-container');

                if (categoriesToShow.length === 0) {
                    if (categoriasContainer) {
                        categoriasContainer.style.display = 'none';
                    }
                } else {
                    if (categoriasContainer) {
                        // Restaurar la visibilidad por defecto, sin forzar 'block'
                        categoriasContainer.style.display = ''; 
                    }
                    categoriesToShow.sort();
                    categoriasSelect.innerHTML = '';
                    categoriesToShow.forEach(cat => {
                        const isAlreadyAuthorized = existingAuthorizations.includes(cat);
                        const shouldBeSelected = isAlreadyAuthorized;
                        categoriasSelect.add(new Option(cat, cat, shouldBeSelected, shouldBeSelected));
                    });
                }

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
            const importBtn = document.getElementById('importPlayerButton');
            if (importBtn) importBtn.addEventListener('click', () => showImportPlayerForm(player));
            const authBtn = document.getElementById('authorizePlayerButton');
            if (authBtn) authBtn.addEventListener('click', () => showAuthorizeForm(player));
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

    function showAddPlayerForm() {
        if (!mainContent || !playerDetailView) return;

        mainContent.classList.add('hidden');
        playerDetailView.classList.remove('hidden');
        playerDetailView.innerHTML = '';

        const currentSeason = seasonFilter ? seasonFilter.value : new Date().getFullYear().toString();

        const allFields = {
            'DNI': '', 'NOMBRE': '', 'FECHA NACIMIENTO': '', 'NACIONALIDAD': 'Uruguaya',
            'TELEFONO': '', 'EMAIL': '', 'TIPO': 'JUGADOR/A', 'CATEGORIA': '', 'EQUIPO': '',
            'COMPETICION': '', 'ESTADO LICENCIA': 'Habilitada', 'FECHA_ALTA': '', 'BAJA': '',
            'FM Desde': '', 'FM Hasta': '', 'Numero': ''
        };

        const getUniqueValues = (players, field) => [...new Set(players.map(p => p[field]).filter(Boolean))].sort();
        const categorias = getUniqueValues(allPlayers, 'CATEGORIA');
        const equipos = getUniqueValues(allPlayers, 'EQUIPO');
        const competiciones = getUniqueValues(allPlayers, 'COMPETICION');

        let formHtml = `
            <div class="bg-white p-6 rounded-xl shadow-md relative">
                <div class="flex justify-between items-end mb-6">
                    <h2 class="text-2xl font-bold text-gray-900">Agregar Nuevo Jugador</h2>
                    <div>
                        <label for="add-TEMPORADA" class="block text-sm font-medium text-gray-600">Temporada</label>
                        <input type="text" id="add-TEMPORADA" data-key="TEMPORADA" value="${currentSeason}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                    </div>
                </div>
                <div id="add-player-form" class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        ${Object.keys(allFields).map(key => {
                            if (key === 'TIPO') {
                                return `<div>
                                    <label for="add-${key}" class="block text-sm font-medium text-gray-600">${key}</label>
                                    <select id="add-${key}" data-key="${key}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                                        <option value="JUGADOR/A" selected>JUGADOR/A</option>
                                        <option value="ENTRENADOR/A">ENTRENADOR/A</option>
                                    </select>
                                </div>`;
                            }
                            if (key === 'CATEGORIA' || key === 'EQUIPO' || key === 'COMPETICION') {
                                const options = key === 'CATEGORIA' ? categorias : (key === 'EQUIPO' ? equipos : competiciones);
                                if (options.length > 0) {
                                    return `<div>
                                        <label for="add-${key}" class="block text-sm font-medium text-gray-600">${key}</label>
                                        <select id="add-${key}" data-key="${key}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                                            <option value="">Seleccione...</option>
                                            ${options.map(o => `<option value="${o}">${o}</option>`).join('')}
                                        </select>
                                    </div>`;
                                }
                                return `<div>
                                    <label for="add-${key}" class="block text-sm font-medium text-gray-600">${key}</label>
                                    <input type="text" id="add-${key}" data-key="${key}" value="${allFields[key]}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                                </div>`;
                            }
                            return `<div>
                                <label for="add-${key}" class="block text-sm font-medium text-gray-600">${key}</label>
                                <input type="text" id="add-${key}" data-key="${key}" value="${allFields[key]}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                            </div>`;
                        }).join('')}
                    </div>
                </div>
                <div class="mt-6 flex items-center justify-end space-x-4">
                    <button id="cancelAddPlayer" class="py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cancelar</button>
                    <button id="saveNewPlayerButton" class="py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">Guardar Jugador</button>
                </div>
            </div>
        `;

        playerDetailView.innerHTML = formHtml;

        document.getElementById('cancelAddPlayer').addEventListener('click', hidePlayerDetails);
        document.getElementById('saveNewPlayerButton').addEventListener('click', guardarNuevoJugador);
    }

    async function guardarNuevoJugador() {
        const dniInput = document.getElementById('add-DNI');
        const dni = dniInput ? dniInput.value.trim() : '';
        if (!dni) {
            showToast("El campo DNI es obligatorio.", "error");
            return;
        }

        const tipoInput = document.getElementById('add-TIPO');
        const tipo = tipoInput ? tipoInput.value : 'JUGADOR/A';
        const dbNode = tipo === 'JUGADOR/A' ? 'jugadores' : 'entrenadores';
        const pathToCheck = `/${dbNode}/${dni}`;

        try {
            const snapshot = await database.ref(pathToCheck).once('value');
            if (snapshot.exists()) {
                showToast("Ya existe un jugador o entrenador con este DNI.", "error");
                return;
            }

            const newPlayerData = {};
            document.querySelectorAll('#add-player-form [data-key]').forEach(input => {
                newPlayerData[input.dataset.key] = input.value.trim();
            });

            const seasonInput = document.getElementById('add-TEMPORADA');
            const season = seasonInput ? seasonInput.value.trim() : '';
            if (!season) {
                showToast("El campo Temporada es obligatorio.", "error");
                return;
            }
            const pushId = database.ref().push().key;

            const personalKeys = ['DNI', 'NOMBRE', 'FECHA NACIMIENTO', 'NACIONALIDAD', 'TELEFONO', 'EMAIL', 'FM Desde', 'FM Hasta'];
            const seasonalKeys = ['COMPETICION', 'CATEGORIA', 'EQUIPO', 'ESTADO LICENCIA', 'FECHA_ALTA', 'BAJA', 'TIPO', 'Numero'];

            const personalDataToSave = {};
            personalKeys.forEach(k => { if (newPlayerData[k] !== undefined) personalDataToSave[k] = newPlayerData[k]; });

            const seasonalDataToSave = {};
            seasonalKeys.forEach(k => { if (newPlayerData[k] !== undefined) seasonalDataToSave[k] = newPlayerData[k]; });
            seasonalDataToSave.TEMPORADA = season;
            if (seasonalDataToSave.CATEGORIA && seasonalDataToSave.Numero) {
                 seasonalDataToSave.Numeros = { [seasonalDataToSave.CATEGORIA]: seasonalDataToSave.Numero };
            } else {
                 seasonalDataToSave.Numeros = {};
            }


            const combinedDataForIndex = {
                ...seasonalDataToSave,
                _firebaseKey: pushId,
                _tipo: dbNode,
                _dni: dni,
                _pushId: pushId
            };
            Object.keys(combinedDataForIndex).forEach(key => combinedDataForIndex[key] === undefined && delete combinedDataForIndex[key]);


            const updates = {};
            updates[`/${dbNode}/${dni}/datosPersonales`] = personalDataToSave;
            updates[`/${dbNode}/${dni}/temporadas/${season}/${pushId}`] = seasonalDataToSave;
            updates[`/registrosPorTemporada/${season}/${pushId}`] = combinedDataForIndex;
            updates[`/temporadas/${season}`] = true;

            const newCategory = seasonalDataToSave.CATEGORIA;
            if (newCategory) {
                updates[`/todasLasCategorias/${newCategory}`] = true;
            }

            await database.ref().update(updates);

            showToast("¡Jugador agregado con éxito!", "success");
            logAction('creacion', { dni: dni, nombre: newPlayerData.NOMBRE, datos: newPlayerData });
            hidePlayerDetails();

        } catch (error) {
            console.error("Error al guardar nuevo jugador:", error);
            showToast(`Error al guardar: ${error.message}`, "error");
        }
    }

    function showImportPlayerForm(player) {
        if (!mainContent || !playerDetailView) return;

        mainContent.classList.add('hidden');
        playerDetailView.classList.remove('hidden');
        playerDetailView.innerHTML = '';

        const nextSeason = new Date().getFullYear() + 1;
        const suggestedSeason = player.TEMPORADA === String(new Date().getFullYear()) ? nextSeason.toString() : new Date().getFullYear().toString();

        const currentNumber = (player.Numeros && player.Numeros[player.CATEGORIA]) || player.Numero || '';

        const seasonalFields = {
            'CATEGORIA': player.CATEGORIA || '',
            'EQUIPO': player.EQUIPO || '',
            'COMPETICION': player.COMPETICION || '',
            'ESTADO LICENCIA': player['ESTADO LICENCIA'] || 'Habilitada',
            'TIPO': player.TIPO || 'JUGADOR/A',
            'Numero': currentNumber,
            'FECHA_ALTA': new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            'BAJA': ''
        };

        const getUniqueValues = (players, field) => [...new Set(players.map(p => p[field]).filter(Boolean))].sort();
        const categorias = getUniqueValues(allPlayers, 'CATEGORIA');
        const equipos = getUniqueValues(allPlayers, 'EQUIPO');
        const competiciones = getUniqueValues(allPlayers, 'COMPETICION');

        let formHtml = `
            <div class="bg-white p-6 rounded-xl shadow-md relative">
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-900">Importar a ${player.NOMBRE}</h2>
                        <p class="text-sm text-gray-600">Creando un nuevo registro para una nueva temporada.</p>
                    </div>
                    <div>
                        <label for="import-TEMPORADA" class="block text-sm font-medium text-gray-700 text-right">Nueva Temporada</label>
                        <input type="text" id="import-TEMPORADA" value="${suggestedSeason}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                    </div>
                </div>
                <div id="import-player-form" class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        ${Object.keys(seasonalFields).map(key => {
                            const value = seasonalFields[key];
                            if (key === 'TIPO') {
                                return `<div>
                                    <label for="import-${key}" class="block text-sm font-medium text-gray-600">${key}</label>
                                    <select id="import-${key}" data-key="${key}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                                        <option value="JUGADOR/A" ${value === 'JUGADOR/A' ? 'selected' : ''}>JUGADOR/A</option>
                                        <option value="ENTRENADOR/A" ${value === 'ENTRENADOR/A' ? 'selected' : ''}>ENTRENADOR/A</option>
                                    </select>
                                </div>`;
                            }
                            if (key === 'CATEGORIA' || key === 'EQUIPO' || key === 'COMPETICION') {
                                const options = key === 'CATEGORIA' ? categorias : (key === 'EQUIPO' ? equipos : competiciones);
                                return `<div>
                                    <label for="import-${key}" class="block text-sm font-medium text-gray-600">${key}</label>
                                    <select id="import-${key}" data-key="${key}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                                        <option value="">Seleccione...</option>
                                        ${options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('')}
                                    </select>
                                </div>`;
                            }
                            return `<div>
                                <label for="import-${key}" class="block text-sm font-medium text-gray-600">${key.replace('_', ' ')}</label>
                                <input type="text" id="import-${key}" data-key="${key}" value="${value}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                            </div>`;
                        }).join('')}
                    </div>
                </div>
                <div class="mt-6 flex items-center justify-end space-x-4">
                    <button id="cancelImport" class="py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cancelar</button>
                    <button id="saveImportButton" class="py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700">Guardar Importación</button>
                </div>
            </div>
        `;

        playerDetailView.innerHTML = formHtml;

        document.getElementById('cancelImport').addEventListener('click', () => showPlayerDetails(player, true, currentPlayerIndex, false));
        document.getElementById('saveImportButton').addEventListener('click', () => importPlayer(player));
    }

    async function importPlayer(originalPlayer) {
        const newSeasonInput = document.getElementById('import-TEMPORADA');
        const newSeason = newSeasonInput ? newSeasonInput.value.trim() : '';
        if (!newSeason) {
            showToast("El campo Nueva Temporada es obligatorio.", "error");
            return;
        }

        const newSeasonalData = {};
        document.querySelectorAll('#import-player-form [data-key]').forEach(input => {
            newSeasonalData[input.dataset.key] = input.value.trim();
        });
        newSeasonalData.TEMPORADA = newSeason;

        const dni = originalPlayer.DNI;
        const tipo = newSeasonalData.TIPO || originalPlayer.TIPO;
        const dbNode = (tipo === 'JUGADOR/A' || tipo === 'jugadores') ? 'jugadores' : 'entrenadores';

        const pushId = database.ref().push().key;

        if (newSeasonalData.CATEGORIA && newSeasonalData.Numero) {
            newSeasonalData.Numeros = { [newSeasonalData.CATEGORIA]: newSeasonalData.Numero };
        } else {
            newSeasonalData.Numeros = {};
        }

        const combinedDataForIndex = {
            NOMBRE: originalPlayer.NOMBRE,
            DNI: originalPlayer.DNI,
            'FM Desde': originalPlayer['FM Desde'],
            'FM Hasta': originalPlayer['FM Hasta'],
            ...newSeasonalData,
            _firebaseKey: pushId,
            _tipo: dbNode,
            _dni: dni,
            _pushId: pushId
        };
        Object.keys(combinedDataForIndex).forEach(key => combinedDataForIndex[key] === undefined && delete combinedDataForIndex[key]);

        const updates = {};
        updates[`/${dbNode}/${dni}/temporadas/${newSeason}/${pushId}`] = newSeasonalData;
        updates[`/registrosPorTemporada/${newSeason}/${pushId}`] = combinedDataForIndex;
        updates[`/temporadas/${newSeason}`] = true;

        const importedCategory = newSeasonalData.CATEGORIA;
        if (importedCategory) {
            updates[`/todasLasCategorias/${importedCategory}`] = true;
        }

        try {
            await database.ref().update(updates);
            showToast(`${originalPlayer.NOMBRE} importado a la temporada ${newSeason} con éxito!`, "success");
            logAction('importacion', { dni: originalPlayer.DNI, nombre: originalPlayer.NOMBRE, nuevaTemporada: newSeason, datos: newSeasonalData });
            hidePlayerDetails();
            if (seasonFilter.value !== newSeason) {
                if (![...seasonFilter.options].some(option => option.value === newSeason)) {
                    seasonFilter.appendChild(new Option(newSeason, newSeason));
                }
                seasonFilter.value = newSeason;
                conectarTemporada(newSeason);
            }
        } catch (error) {
            console.error("Error al importar jugador:", error);
            showToast(`Error al importar: ${error.message}`, "error");
        }
    }

    function showAuthorizeForm(player) {
        if (!mainContent || !playerDetailView) return;

        mainContent.classList.add('hidden');
        playerDetailView.classList.remove('hidden');
        playerDetailView.innerHTML = '';

        let suggestedSeason = '';
        const baseSeason = player.TEMPORADA;
        const baseYear = parseInt(baseSeason, 10);

        if (!isNaN(baseYear) && String(baseYear).length === 4) {
            suggestedSeason = `${baseYear}-${baseYear + 1}`;
        } else {
            const currentYear = new Date().getFullYear();
            suggestedSeason = (baseSeason === String(currentYear)) ? `${currentYear}-${currentYear + 1}` : `${currentYear}-${currentYear + 1}`;
        }

        const specialCategories = ["Liga Uruguaya de Basquet", "Liga de Desarrollo"];
        const equipos = [...new Set(allPlayers.map(p => p.EQUIPO).filter(Boolean))].sort();


        let formHtml = `
            <div class="bg-white p-6 rounded-xl shadow-md relative max-w-lg mx-auto">
                <h2 class="text-2xl font-bold text-gray-900 mb-4">Autorizar a ${player.NOMBRE}</h2>
                <p class="text-sm text-gray-600 mb-6">Creando un registro de autorización simplificado.</p>
                
                <div id="auth-player-form" class="space-y-4">
                    <div>
                        <label for="auth-TEMPORADA" class="block text-sm font-medium text-gray-700">Nueva Temporada</label>
                        <input type="text" id="auth-TEMPORADA" value="${suggestedSeason}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                    </div>
                    <div>
                        <label for="auth-CATEGORIA" class="block text-sm font-medium text-gray-700">Autorizar en Categoría</label>
                        <select id="auth-CATEGORIA" data-key="CATEGORIA" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                            <option value="">Seleccione una liga...</option>
                            ${specialCategories.map(o => `<option value="${o}">${o}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label for="auth-EQUIPO" class="block text-sm font-medium text-gray-700">Equipo</label>
                        <select id="auth-EQUIPO" data-key="EQUIPO" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                            <option value="">Seleccione un equipo...</option>
                            ${equipos.map(o => `<option value="${o}" ${o === player.EQUIPO ? 'selected' : ''}>${o}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label for="auth-ESTADO-LICENCIA" class="block text-sm font-medium text-gray-700">Estado Licencia</label>
                        <input type="text" id="auth-ESTADO-LICENCIA" data-key="ESTADO LICENCIA" value="${player['ESTADO LICENCIA'] || 'Habilitada'}" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                    </div>
                    <div>
                        <label for="auth-Numero" class="block text-sm font-medium text-gray-700">Número en esta categoría (Opcional)</label>
                        <input type="number" id="auth-Numero" data-key="Numero" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                    </div>
                </div>

                <div class="mt-8 flex items-center justify-end space-x-4">
                    <button id="cancelAuthorize" class="py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cancelar</button>
                    <button id="saveAuthorizeButton" class="py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700">Confirmar Autorización</button>
                </div>
            </div>
        `;

        playerDetailView.innerHTML = formHtml;

        document.getElementById('cancelAuthorize').addEventListener('click', () => showPlayerDetails(player, true, currentPlayerIndex, true));
        document.getElementById('saveAuthorizeButton').addEventListener('click', () => authorizePlayerInNewSeason(player));
    }

    async function authorizePlayerInNewSeason(originalPlayer) {
        const newSeasonInput = document.getElementById('auth-TEMPORADA');
        const newCategoryInput = document.getElementById('auth-CATEGORIA');
        const newNumberInput = document.getElementById('auth-Numero');
        const newEquipoInput = document.getElementById('auth-EQUIPO');
        const newEstadoLicenciaInput = document.getElementById('auth-ESTADO-LICENCIA');


        const newSeason = newSeasonInput ? newSeasonInput.value.trim() : '';
        const newCategory = newCategoryInput ? newCategoryInput.value.trim() : '';
        const newNumber = newNumberInput ? newNumberInput.value.trim() : '';
        const newEquipo = newEquipoInput ? newEquipoInput.value.trim() : '';
        const newEstadoLicencia = newEstadoLicenciaInput ? newEstadoLicenciaInput.value.trim() : '';

        if (!newSeason) {
            showToast("El campo Nueva Temporada es obligatorio.", "error");
            return;
        }
        if (!newCategory) {
            showToast("Debe seleccionar una categoría para autorizar.", "error");
            return;
        }

        const newSeasonalData = {
            categoriaOrigen: originalPlayer.CATEGORIA,
            CATEGORIA: newCategory,
            TEMPORADA: newSeason,
            Numero: newNumber,
            esAutorizado: true,
            FECHA_ALTA: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            BAJA: '',
            TIPO: originalPlayer.TIPO,
            Numeros: { ...originalPlayer.Numeros },
            EQUIPO: newEquipo,
            'ESTADO LICENCIA': newEstadoLicencia,
            COMPETICION: newCategory === 'Liga de Desarrollo' ? 'LDD' : (newCategory === 'Liga Uruguaya de Basquet' ? 'LUB' : '')
        };

        if (newCategory && newNumber) {
            newSeasonalData.Numeros[newCategory] = newNumber;
        }

        const dni = originalPlayer.DNI;
        const tipo = originalPlayer.TIPO;
        const dbNode = (tipo === 'JUGADOR/A' || tipo === 'jugadores') ? 'jugadores' : 'entrenadores';
        const pushId = database.ref().push().key;

        const combinedDataForIndex = {
            NOMBRE: originalPlayer.NOMBRE,
            DNI: originalPlayer.DNI,
            'FM Desde': originalPlayer['FM Desde'],
            'FM Hasta': originalPlayer['FM Hasta'],
            ...newSeasonalData,
            _firebaseKey: pushId,
            _tipo: dbNode,
            _dni: dni,
            _pushId: pushId
        };
        Object.keys(combinedDataForIndex).forEach(key => combinedDataForIndex[key] === undefined && delete combinedDataForIndex[key]);

        const updates = {};
        updates[`/${dbNode}/${dni}/temporadas/${newSeason}/${pushId}`] = newSeasonalData;
        updates[`/registrosPorTemporada/${newSeason}/${pushId}`] = combinedDataForIndex;
        updates[`/temporadas/${newSeason}`] = true;
        updates[`/todasLasCategorias/${newCategory}`] = true;

        try {
            await database.ref().update(updates);
            showToast(`${originalPlayer.NOMBRE} autorizado en ${newCategory} para la temporada ${newSeason}!`, "success");
            logAction('autorizacion', { dni: originalPlayer.DNI, nombre: originalPlayer.NOMBRE, nuevaTemporada: newSeason, nuevaCategoria: newCategory });
            hidePlayerDetails();
            if (seasonFilter.value !== newSeason) {
                if (![...seasonFilter.options].some(option => option.value === newSeason)) {
                    seasonFilter.appendChild(new Option(newSeason, newSeason));
                }
                seasonFilter.value = newSeason;
                conectarTemporada(newSeason);
            }
        } catch (error) {
            console.error("Error al autorizar jugador:", error);
            showToast(`Error al autorizar: ${error.message}`, "error");
        }
    }
    
    async function generatePDF() {
        if (currentlyDisplayedPlayers.length === 0 || currentColumnsForPDF.length === 0) {
            return showToast("No hay datos para generar el PDF.", "error");
        }
        if (typeof window.jspdf === 'undefined') {
            return showToast("Librería PDF no disponible.", "error");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const today = new Date();
        const formattedDate = today.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const title = `Vencimientos al ${formattedDate}`;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const logoSize = 15;
        const pageMargin = 15;

        // Cargar el logo de forma asíncrona
        let logoImage = null;
        try {
            logoImage = await new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = () => resolve(img);
                img.onerror = (err) => reject(err);
                img.src = LOGO_URL;
            });
        } catch (e) {
            console.error("No se pudo cargar el logo para el PDF:", e);
            showToast("Advertencia: No se pudo cargar el logo, se generará sin él.", "info");
        }

        // Añadir logos si se cargaron
        if (logoImage) {
            const logoWidth = 10;
            doc.addImage(logoImage, 'PNG', pageMargin, pageMargin, logoWidth, logoSize);
            doc.addImage(logoImage, 'PNG', pageWidth - pageMargin - logoWidth, pageMargin, logoWidth, logoSize);
        }

        // Título centrado
        doc.setFontSize(16);
        const titleWidth = doc.getStringUnitWidth(title) * doc.internal.getFontSize() / doc.internal.scaleFactor;
        const titleX = (pageWidth - titleWidth) / 2;
        doc.text(title, titleX, pageMargin + (logoSize / 2) + 3);

        const maskDNI = (dni) => {
            const dniStr = String(dni || '');
            return dniStr.length > 4 ? '****' + dniStr.substring(4) : dniStr;
        };

        try {
            // Crear tabla manualmente sin autoTable
            const columns = currentColumnsForPDF;
            
            // Definir anchos personalizados por columna
            const columnWidths = {};
            const baseWidth = (pageWidth - 2 * pageMargin);
            
            // Columnas: EQUIPO 25%, CATEGORIA 25%, DNI 10%, NOMBRE 30%, FM Hasta 10% = 100%
            columns.forEach(col => {
                if (col === 'DNI' || col === 'FM Hasta') {
                    columnWidths[col] = baseWidth * 0.1; // 10% para DNI y FM Hasta
                } else if (col === 'NOMBRE') {
                    columnWidths[col] = baseWidth * 0.3; // 30% para NOMBRE
                } else if (col === 'EQUIPO' || col === 'CATEGORIA') {
                    columnWidths[col] = baseWidth * 0.25; // 25% para EQUIPO y CATEGORIA
                } else {
                    columnWidths[col] = baseWidth * 0.1; // 10% por defecto
                }
            });
            
            let yPosition = pageMargin + logoSize + 8;
            const rowHeight = 5;
            const fontSize = 8;
            let xPosition = pageMargin;
            
            // Dibujar encabezados
            doc.setFontSize(fontSize);
            doc.setFont(undefined, 'bold');
            columns.forEach((col) => {
                const colWidth = columnWidths[col];
                doc.setFillColor(25, 50, 100); // Fondo blanco para cada celda
                doc.setDrawColor(25, 50, 100); // Borde azul oscuro
                doc.setTextColor(255, 255, 255); // Texto azul oscuro
                doc.rect(xPosition, yPosition, colWidth, rowHeight, 'FD');
                doc.text(col, xPosition + 0.5, yPosition + 3.5, { maxWidth: colWidth - 1, overflow: 'hidden', align: 'left' });
                xPosition += colWidth;
            });
            
            // Reset font, color y draw color para las filas
            doc.setFont(undefined, 'normal');
            doc.setTextColor(0, 0, 0);
            doc.setDrawColor(0, 0, 0);
            
            yPosition += rowHeight;
            
            // Dibujar filas
            currentlyDisplayedPlayers.forEach((player) => {
                // Verificar si necesita nueva página
                if (yPosition > pageHeight - pageMargin) {
                    doc.addPage();
                    yPosition = pageMargin;
                }
                
                xPosition = pageMargin;
                columns.forEach((colName) => {
                    const colWidth = columnWidths[colName];
                    let cellValue;
                    if (colName === 'DNI') {
                        cellValue = maskDNI(player[colName]);
                    } else {
                        cellValue = player[colName] || '-';
                    }
                    
                    doc.rect(xPosition, yPosition, colWidth, rowHeight);
                    doc.text(String(cellValue), xPosition + 0.5, yPosition + 3.5, { maxWidth: colWidth - 1, overflow: 'hidden' });
                    xPosition += colWidth;
                });
                
                yPosition += rowHeight;
            });
            
            doc.save(`vencimientos_${formattedDate}.pdf`);
            showToast("PDF generado.", "success");
        } catch (error) {
            console.error("Error al generar PDF:", error);
            showToast(`Error al generar PDF: ${error.message}`, "error");
        }
    }

    // --- INICIALIZACIÓN ---
    initializeAuth();
});