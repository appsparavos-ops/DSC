document.addEventListener('DOMContentLoaded', function () {


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

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const database = firebase.database();
    const auth = firebase.auth();

    const IMG_BASE_URL = 'https://raw.githubusercontent.com/appsparavos-ops/DSC/fotos/';
    const LOGO_URL = 'https://raw.githubusercontent.com/appsparavos-ops/DSC/fotos/Defensor_Sporting.png';
    const PLACEHOLDER_SVG_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2EwYTBhMCI+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OS00IDQgNHptMCAyYy0yLjY3IDAtOCA0IDQgNHYyYzAgMS4xLjkgMiAyIDJoMTRjMS4xIDAgMi0uOSAyLTJ2LTJjMC0yLjY2LTUuMzMtNC04LTR6Ii8+PC9zdmc+';
    const COLUMN_ORDER = ['DNI', 'NOMBRE', 'FM Hasta', 'Numero', 'CATEGORIA', 'EQUIPO',];
    const PROGRESSION_RULES = {
        'U11 Femenino': ['U12 Femenino', 'U11 Mixta', 'U12 Mixta'],
        'U11 Mixta': ['U12 Mixta', 'U12 Femenino'],
        'U12 Femenino': ['U12 Mixta', 'U14 Femenino'],
        'U12 Mixta': ['U14 Masculino'],
        'U14 Femenino': ['U14 Mixta', 'U16 Femenino'],
        'U14 Masculino': ['U16 Masculino'],
        'U16 Femenino': ['U19 Femenina', 'Liga Femenina de Basquet'],
        'U16 Masculino': ['U18 Masculino'],
        'U18 Masculino': ['U20 Masculino', 'Liga de Desarrollo', 'Liga Uruguaya de Basquet'],
        'U20 Masculino': ['Liga de Desarrollo', 'Liga Uruguaya de Basquet'],
        'Liga de Desarrollo': ['Liga Uruguaya de Basquet'],
        'U19 Femenina': ['Liga Femenina de Basquet'],
    };

    // --- ELEMENTOS DEL DOM ---
    const loginContainer = document.getElementById('login-container');
    const mainContainer = document.getElementById('main-container');
    const newLoginForm = document.getElementById('login-form');
    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const loginErrorMessage = document.getElementById('login-error-message');
    const logoutButton = document.getElementById('logout-button');
    const navToGestionNumeros = document.getElementById('navToGestionNumeros');
    const navToRoster = document.getElementById('navToRoster');
    const navToConstancias = document.getElementById('navToConstancias');
    const navToTabla = document.getElementById('navToTabla');
    const forgotPasswordLink = document.getElementById('forgot-password-link');
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
    let allPlayersGlobal = [];
    let currentSortCol = 'NOMBRE', currentSortDir = 'asc';
    let isEditModeActive = false, currentUserRole = null, currentPlayerIndex = -1, currentSeasonListener = null;

    let allGlobalPases = {};

    function daysBetweenDates(d1, d2) {
        return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    }

    function classifyPaseLogic(pase) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const fechaAcepta = pase['FECHA FEDERACION ACEPTA'];

        if (!fechaAcepta || fechaAcepta.trim() === '') return 'pendiente';

        const stringHasta = pase['VALIDO HASTA'];
        const tipoPase = (pase['TIPO PASE'] || '').toUpperCase().trim();
        const clubOrigen = (pase['CLUB ORIGEN'] || '').toUpperCase().trim();

        if (!stringHasta || (tipoPase === 'DEFINITIVO' && stringHasta.includes('31/12/9999'))) return 'vigente';

        const parts = stringHasta.split('/');
        if (parts.length !== 3) return 'vigente';
        const vto = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));

        const daysLeft = daysBetweenDates(today, vto);
        if (daysLeft < 0) {
            if (tipoPase.includes('TEMPORAL') && clubOrigen.includes('DEFENSOR')) {
                return 'finalizado';
            }
            return 'vencido';
        }
        if (daysLeft <= 30) return 'aVencer';
        return 'vigente';
    }


    // --- LÓGICA DE AUTENTICACIÓN ---
    function initializeAuth() {
        auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).then(() => {
            auth.onAuthStateChanged(user => {
                if (user) {
                    if (typeof AuditLogger !== 'undefined') {
                        AuditLogger.logNavigation('se logueó en Gestión de Jugadores (index)');
                    }
                    // Intentar verificar si es administrador
                    database.ref('admins/' + user.uid).once('value')
                        .then(snapshot => {
                            if (snapshot.exists()) {
                                currentUserRole = 'admin';
                                isEditModeActive = true;
                                showMainContent();
                            } else {
                                // Si no existe en admins, verificar en users
                                return checkUserRole(user.uid);
                            }
                        })
                        .catch(error => {
                            // Si da error de permisos (común en usuarios), verificar en users
                            if (error.code === 'PERMISSION_DENIED') {
                                return checkUserRole(user.uid);
                            }
                            console.error("Error al verificar rol:", error);
                            auth.signOut();
                        });

                    function checkUserRole(uid) {
                        return database.ref('users/' + uid).once('value')
                            .then(snapshot => {
                                if (snapshot.exists()) {
                                    currentUserRole = 'user';
                                } else {
                                    currentUserRole = 'guest'; // Opcional: manejar otros casos
                                }
                                isEditModeActive = false;
                                showMainContent();
                            })
                            .catch(err => {
                                console.error("Error al verificar rol de usuario:", err);
                                auth.signOut();
                            });
                    }
                } else {
                    currentUserRole = null;
                    isEditModeActive = false;
                    showLoginScreen();
                }
            });
        }).catch(error => {
            console.error("Error al configurar la persistencia de la sesión:", error);
            if (loginErrorMessage) loginErrorMessage.textContent = "Error de configuración de la sesión.";
        });
    }

    function showLoginScreen() {
        document.body.classList.remove('uninitialized');
        if (mainContainer) mainContainer.style.display = 'none';
        if (loginContainer) loginContainer.style.display = 'flex';
        if (loginEmailInput) loginEmailInput.value = '';
        if (loginPasswordInput) loginPasswordInput.value = '';
        if (loginErrorMessage) loginErrorMessage.classList.add('hidden');
    }

    function showMainContent() {
        document.body.classList.remove('uninitialized');
        if (loginContainer) loginContainer.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'block';

        if (navToGestionNumeros) {
            if (currentUserRole === 'admin') {
                navToGestionNumeros.classList.remove('hidden');
            } else {
                navToGestionNumeros.classList.add('hidden');
            }
        }

        if (navToRoster) {
            if (currentUserRole !== 'admin') {
                navToRoster.classList.remove('hidden');
            } else {
                navToRoster.classList.add('hidden');
            }
        }

        if (navToConstancias) {
            if (currentUserRole !== 'admin') {
                navToConstancias.classList.remove('hidden');
            } else {
                navToConstancias.classList.add('hidden');
            }
        }

        const controlsContainer = document.getElementById('actionButtonsContainer');
        if (controlsContainer) {
            let addButton = document.getElementById('addPlayerButton');
            if (isEditModeActive) {
                if (!addButton) {
                    addButton = document.createElement('button');
                    addButton.id = 'addPlayerButton';
                    addButton.title = 'Agregar Jugador';
                    addButton.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>';
                    addButton.className = 'flex-shrink-0 ml-2 p-2 border border-transparent rounded-lg shadow-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500';
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

    if (newLoginForm) newLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (loginErrorMessage) loginErrorMessage.classList.add('hidden');
        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        auth.signInWithEmailAndPassword(email, password).catch(error => {
            console.error("Error de login:", error);
            if (loginErrorMessage) {
                loginErrorMessage.textContent = 'Credenciales incorrectas. Intente de nuevo.';
                loginErrorMessage.classList.remove('hidden');
            }
        });
    });

    if (logoutButton) logoutButton.addEventListener('click', () => {
        auth.signOut().then(() => {
            showToast('Has cerrado la sesión.');
        });
    });

    if (forgotPasswordLink) {
        console.log("Listener de recuperación de contraseña adjuntado.");
        forgotPasswordLink.addEventListener('click', () => {
            const email = loginEmailInput.value.trim();
            if (!email) {
                showToast("Por favor, ingresa tu correo electrónico primero.", "error");
                return;
            }
            console.log("Intentando enviar correo de restablecimiento a:", email);
            auth.sendPasswordResetEmail(email)
                .then(() => {
                    console.log("Correo de restablecimiento enviado con éxito.");
                    showToast("Se ha enviado un correo para restablecer tu contraseña. Revisa también tu carpeta de SPAM.", "success");
                })
                .catch(error => {
                    console.error("Error al enviar correo de restablecimiento:", error);
                    let msg = "Error al enviar el correo.";
                    if (error.code === 'auth/user-not-found') msg = "No existe un usuario con ese correo.";
                    else if (error.code === 'auth/invalid-email') msg = "El correo electrónico no es válido.";
                    else if (error.code === 'auth/too-many-requests') msg = "Demasiadas solicitudes. Intentalo más tarde.";
                    showToast(msg, "error");
                });
        });
    }

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

    async function conectarTemporada(temporada) {
        if (!temporada) {
            if (messageEl) {
                messageEl.textContent = 'Cargando datos de todas las temporadas...';
                messageEl.style.display = 'block';
            }
            if (tableContainer) tableContainer.innerHTML = '';
            
            if (currentSeasonListener) {
                currentSeasonListener.ref.off('value', currentSeasonListener.callback);
                currentSeasonListener = null;
            }

            try {
                const [jugadoresSnap, entrenadoresSnap] = await Promise.all([
                    database.ref('/jugadores').once('value'),
                    database.ref('/entrenadores').once('value')
                ]);

                const globalPlayers = [];
                const processNode = (snap, tipo) => {
                    if (snap.exists()) {
                        const data = snap.val();
                        Object.keys(data).forEach(dni => {
                            const p = data[dni];
                            if (p.datosPersonales) {
                                const seasons = p.temporadas ? Object.keys(p.temporadas).sort().reverse() : [];
                                globalPlayers.push({
                                    ...p.datosPersonales,
                                    DNI: p.datosPersonales.DNI || dni,
                                    TIPO: tipo,
                                    _allSeasons: seasons,
                                    TEMPORADA: 'Todas',
                                    _isGlobal: true
                                });
                            }
                        });
                    }
                };

                processNode(jugadoresSnap, 'JUGADOR/A');
                processNode(entrenadoresSnap, 'ENTRENADOR/A');

                allPlayers = globalPlayers;
                populateCategoryFilter([]); // Clear or handle differently
                populateEquipoFilter([]);
                if (categoryFilter) categoryFilter.disabled = true;
                if (equipoFilter) equipoFilter.disabled = true;

                applyFilters();
                if (messageEl) messageEl.style.display = 'none';
            } catch (error) {
                console.error("Error cargando todos los jugadores:", error);
                if (messageEl) messageEl.textContent = 'Error al cargar datos globales.';
            }
            return;
        }

        if (categoryFilter) categoryFilter.disabled = false;
        if (equipoFilter) equipoFilter.disabled = false;

        if (messageEl) {
            messageEl.textContent = `Conectando a la temporada ${temporada}...`;
            messageEl.style.display = 'block';
        }
        if (tableContainer) tableContainer.innerHTML = '';

        if (currentSeasonListener) {
            currentSeasonListener.ref.off('value', currentSeasonListener.callback);
        }

        const registrosRef = database.ref('/registrosPorTemporada/' + temporada);

        const listenerCallback = async snapshot => {
            if (!snapshot.exists()) {
                allPlayers = [];
                displayPlayers([]);
                if (messageEl) messageEl.textContent = `No hay datos para la temporada ${temporada}.`;
                return;
            }

            if (Object.keys(allGlobalPases).length === 0) {
                try {
                    const snap = await database.ref('/pases').once('value');
                    allGlobalPases = snap.val() || {};
                } catch (e) { console.error("Error loading pases:", e); }
            }

            const seasonalRecords = snapshot.val();
            const DNIyTipo = new Set(Object.values(seasonalRecords).map(r => {
                const rawTipo = String(r._tipo || "").toLowerCase();
                const rawTIPO = String(r.TIPO || "").toLowerCase();
                // Si cualquiera dice jugador, es jugador (prioridad por Arturo)
                const node = (rawTipo.includes("jugador") || rawTIPO.includes("jugador")) ? "jugadores" : "entrenadores";
                const dni = String(r._dni || r.DNI || "");
                return `${node}|${dni}`;
            }));

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
                    const dni = String(record._dni || record.DNI || "");
                    const personalData = datosPersonalesMap.get(dni) || {};
                    const combined = { ...record, ...personalData };
                    // Fuente de la verdad ÚNICA: estrictamente de datosPersonales si existe
                    if (personalData['FM Hasta'] !== undefined) combined['FM Hasta'] = personalData['FM Hasta'];
                    if (personalData['FM Desde'] !== undefined) combined['FM Desde'] = personalData['FM Desde'];

                    // Extraer info de Pases
                    const pasesValue = allGlobalPases[dni];
                    if (pasesValue) {
                        // Puede ser un solo registro o una colección de empujes
                        const pasesArray = (pasesValue['FECHA FEDERACION ACEPTA'])
                            ? [pasesValue]
                            : Object.values(pasesValue);

                        // Buscar el pase cedido activo más reciente
                        pasesArray.forEach(pase => {
                            const status = classifyPaseLogic(pase);
                            const origen = String(pase['CLUB ORIGEN'] || '').toUpperCase();
                            const destino = String(pase['CLUB DESTINO'] || '').toUpperCase();
                            const tipoPase = String(pase['TIPO PASE'] || '').toUpperCase();

                            const esDeDefensor = origen.includes('DEFENSOR');
                            const esAFuera = !destino.includes('DEFENSOR');
                            const esTemporal = tipoPase.includes('TEMPORAL') || tipoPase.includes('PRÉSTAMO') || tipoPase.includes('PRESTAMO') || tipoPase === 'T' || tipoPase === 'P';
                            const estaActivo = (status === 'vigente' || status === 'aVencer');

                            if (esDeDefensor && esAFuera && esTemporal && estaActivo) {
                                combined._isCedido = true;
                                combined._paseStatus = status;
                            }
                        });
                    }

                    if (String(combined['ESTADO LICENCIA'] || '').toUpperCase() === 'SIN INSCRIBIR' && combined._isCedido) {
                        combined['ESTADO LICENCIA'] = 'Cedido en Pase';
                    }

                    return combined;
                });
                if (allPlayers.length > 0) {
                    originalHeaders = Object.keys(allPlayers[0]);
                    populateCategoryFilter(allPlayers);
                    applyFilters();
                    if (messageEl) messageEl.style.display = 'none';
                    showPlayerFromUrl();
                } else {
                    if (tableContainer) tableContainer.innerHTML = '';
                    if (messageEl) {
                        messageEl.textContent = 'No se encontraron datos para esta temporada.';
                        messageEl.style.display = 'block';
                    }
                }
            });
        };

        registrosRef.on('value', listenerCallback, (error) => {
            console.error(`Error de Firebase (${temporada}):`, error);
            if (messageEl) messageEl.textContent = `Error al conectar con la temporada ${temporada}.`;
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
        let finalDataParaLog;

        // Extraer los números del formulario
        const newNumeros = { ...(playerToUpdate.Numeros || {}) };
        if (playerDetailView) {
            playerDetailView.querySelectorAll('.numero-input').forEach(input => {
                if (input.dataset.category) newNumeros[String(input.dataset.category).trim()] = input.value.trim();
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

            // Fuente de Verdad: Actualizar siempre en datosPersonales (dentro del nodo principal)
            if (playerToUpdate['FM Hasta']) {
                updates[`/${dbNode}/${dni}/datosPersonales/FM Hasta`] = playerToUpdate['FM Hasta'];
            }
            if (playerToUpdate['FM Desde']) {
                updates[`/${dbNode}/${dni}/datosPersonales/FM Desde`] = playerToUpdate['FM Desde'];
            }

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
            finalDataParaLog = { ...playerToUpdate, Numero: newPrimaryNumber, Numeros: newNumeros };

        } else {
            // --- LÓGICA ORIGINAL PARA JUGADORES NO AUTORIZADOS ---
            const finalData = { ...playerToUpdate };
            if (playerDetailView) {
                playerDetailView.querySelectorAll('#player-data-list input, #player-data-list select').forEach(input => {
                    if (input.dataset.key) finalData[input.dataset.key] = input.value;
                });
                const selectElement = document.getElementById('edit-categoriasAutorizadas');
                finalData.categoriasAutorizadas = selectElement ? Array.from(selectElement.selectedOptions).map(o => o.value) : (playerToUpdate.categoriasAutorizadas || []);
                const equipoAuthElement = document.getElementById('edit-equipoAutorizado');
                finalData.equipoAutorizado = equipoAuthElement ? equipoAuthElement.value.trim() : (playerToUpdate.equipoAutorizado || '');
                finalData.Numeros = newNumeros;
                finalData.Numero = newPrimaryNumber;
            }

            if (playerToUpdate.DNI !== finalData.DNI || playerToUpdate.TEMPORADA !== finalData.TEMPORADA) {
                showToast("No se puede cambiar el DNI ni la TEMPORADA.", "error");
                return;
            }

            const personalKeys = ['DNI', 'NOMBRE', 'FECHA NACIMIENTO', 'NACIONALIDAD', 'TELEFONO', 'EMAIL', 'FM Desde', 'FM Hasta', 'genero'];
            const seasonalKeys = ['COMPETICION', 'CATEGORIA', 'EQUIPO', 'ESTADO LICENCIA', 'FECHA_ALTA', 'BAJA', 'TIPO', 'Numero', 'categoriasAutorizadas', 'equipoAutorizado', 'Numeros', 'TEMPORADA'];
            const personalDataToUpdate = {}, seasonalDataToUpdate = {};
            personalKeys.forEach(k => { if (finalData[k] !== undefined) personalDataToUpdate[k] = finalData[k]; });
            seasonalKeys.forEach(k => { if (finalData[k] !== undefined) seasonalDataToUpdate[k] = finalData[k]; });

            const combinedDataForIndex = { ...seasonalDataToUpdate, NOMBRE: personalDataToUpdate.NOMBRE, DNI: personalDataToUpdate.DNI };
            // Asegurar campos técnicos para el índice
            combinedDataForIndex._firebaseKey = pushId;
            combinedDataForIndex._tipo = dbNode;
            combinedDataForIndex._dni = dni;
            combinedDataForIndex._pushId = pushId;

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
            finalDataParaLog = finalData;
        }

        database.ref().update(updates)
            .then(() => {
                showToast("¡Cambios guardados con éxito!");

                // Registro detallado del cambio usando AuditLogger
                AuditLogger.logUpdate('jugador', playerToUpdate.DNI || dni, playerToUpdate, finalDataParaLog);

                hidePlayerDetails();
            })
            .catch((error) => {
                console.error("Error al guardar en Firebase:", error);
                alert(`Error al guardar: ${error.message}`);
            });
    }

    if (toggleSearchButton) toggleSearchButton.addEventListener('click', (e) => { e.preventDefault(); searchBar.classList.toggle('hidden'); });
    if (nameSearchInput) nameSearchInput.addEventListener('input', applyFilters);
    if (dniSearchInput) dniSearchInput.addEventListener('input', applyFilters);
    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
    if (equipoFilter) equipoFilter.addEventListener('change', applyFilters);
    if (navToGestionNumeros) navToGestionNumeros.addEventListener('click', (e) => { e.preventDefault(); window.location.href = 'mantenimiento.html'; });
    if (navToRoster) navToRoster.addEventListener('click', (e) => { e.preventDefault(); window.location.href = 'roster.html'; });
    if (navToConstancias) navToConstancias.addEventListener('click', (e) => { e.preventDefault(); window.location.href = 'carta.html'; });
    if (navToTabla) navToTabla.addEventListener('click', (e) => { 
        e.preventDefault(); 
        sessionStorage.setItem('fromIndex', 'true');
        window.location.href = 'tabla.html'; 
    });
    if (seasonFilter) seasonFilter.addEventListener('change', () => {
        if (nameSearchInput) nameSearchInput.value = '';
        if (dniSearchInput) dniSearchInput.value = '';
        if (categoryFilter) categoryFilter.selectedIndex = 0;
        if (equipoFilter) equipoFilter.selectedIndex = 0;

        const newSeason = seasonFilter.value;
        conectarTemporada(newSeason);

        const user = auth.currentUser;
        if (user && newSeason) {
            database.ref('preferenciasUsuarios/' + user.uid).update({ ultimaTemporadaSeleccionada: newSeason });
        }
    });
    if (resetButton) resetButton.addEventListener('click', (e) => { e.preventDefault(); resetAll(); });
    if (expiringButton) expiringButton.addEventListener('click', (e) => { e.preventDefault(); showExpiring(); });
    if (printButton) printButton.addEventListener('click', (e) => { e.preventDefault(); generatePDF(); });

    function applyFilters() {
        if (printButton) printButton.classList.add('hidden');
        const nameTerm = nameSearchInput ? nameSearchInput.value.toLowerCase().trim() : '';
        const dniTerm = dniSearchInput ? dniSearchInput.value.toLowerCase().trim() : '';
        const selectedCategory = categoryFilter ? categoryFilter.value : '';
        const selectedEquipo = equipoFilter ? equipoFilter.value : '';

        const isGlobalMode = allPlayers.length > 0 && allPlayers[0]._isGlobal;

        if (!isGlobalMode) {
            // Poblar filtros DINÁMICAMENTE basados en la selección cruzada
            // Para el filtro de categorías, consideramos el equipo seleccionado
            const playersForCategoryList = allPlayers.filter(p => !selectedEquipo || p.EQUIPO === selectedEquipo);
            populateCategoryFilter(playersForCategoryList);

            // Para el filtro de equipos, consideramos la categoría seleccionada y las autorizaciones cruzadas
            const playersForEquipoList = allPlayers.filter(p => {
                if (!selectedCategory) return true;
                const matchesMainCat = p.CATEGORIA === selectedCategory;
                const matchesAuthCat = p.categoriasAutorizadas && p.categoriasAutorizadas.includes(selectedCategory);
                const matchesEsAuth = p.esAutorizado && p.CATEGORIA === selectedCategory;
                return matchesMainCat || matchesAuthCat || matchesEsAuth;
            });
            populateEquipoFilter(playersForEquipoList);
        }

        updateSearchSuggestions(allPlayers);

        let filteredPlayers = allPlayers.filter(p => {
            const matchesName = !nameTerm || (p.NOMBRE && p.NOMBRE.toLowerCase().includes(nameTerm));
            const matchesDni = !dniTerm || (p.DNI && String(p.DNI).toLowerCase().includes(dniTerm));
            if (isGlobalMode) {
                // En modo global solo importa nombre y DNI
                return matchesName && matchesDni;
            }
            const matchesCat = !selectedCategory || p.CATEGORIA === selectedCategory || (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(selectedCategory)) || (p.esAutorizado && p.CATEGORIA === selectedCategory);
            const matchesEq = !selectedEquipo || p.EQUIPO === selectedEquipo || (p.equipoAutorizado === selectedEquipo && p.categoriasAutorizadas && p.categoriasAutorizadas.includes(selectedCategory));
            return matchesName && matchesDni && matchesCat && matchesEq;
        });

        if (isGlobalMode) {
            // Solo mostrar resultados si hay un término de búsqueda
            if (!nameTerm && !dniTerm) {
                displayPlayers([], 'Ingrese un nombre para buscar en todas las temporadas');
                return;
            }
            displayPlayers(filteredPlayers, '', ['NOMBRE', 'DNI', 'TIPO', 'TEMPORADAS']);
        } else {
            displayPlayers(filteredPlayers);
        }
    }

    function parseDateDDMMYYYY(dateString) {
        if (!dateString || typeof dateString !== 'string') return null;
        const parts = dateString.split('/');
        if (parts.length !== 3) return null;
        const [day, month, year] = parts.map(p => parseInt(p, 10));
        if (isNaN(day) || isNaN(month) || isNaN(year) || year < 1900) return null;
        return new Date(year, month - 1, day);
    }

    // --- FUNCIONES AUXILIARES DE ORDENamiento ---
    function isFemaleCategory(categoryName) {
        if (!categoryName) return false;
        const cat = categoryName.toLowerCase();
        return (cat.includes('femenino') || cat.includes('femenina') || cat.includes('fem')) && !cat.includes('mixt');
    }

    function isMaleCategory(categoryName) {
        if (!categoryName) return false;
        const cat = categoryName.toLowerCase();
        // Criterios explícitos: Liga de Desarrollo, Liga Uruguaya
        if (cat.includes('liga de desarrollo') || cat.includes('liga uruguaya')) return true;
        return (cat.includes('masculino') || cat.includes('masculina') || cat.includes('masc')) && !cat.includes('mixt');
    }

    function isMixedCategory(categoryName) {
        if (!categoryName) return false;
        const cat = categoryName.toLowerCase();
        return cat.includes('mixt');
    }

    function getCategoryOrder(categoryName) {
        if (!categoryName) return 999;
        const cat = categoryName.toLowerCase();
        if (cat.includes('mini')) return 10;
        if (cat.includes('premini')) return 5;
        if (cat.includes('u11')) return 11;
        if (cat.includes('u12')) return 12;
        if (cat.includes('u13')) return 13;
        if (cat.includes('u14')) return 14;
        if (cat.includes('u15')) return 15;
        if (cat.includes('u16')) return 16;
        if (cat.includes('u17')) return 17;
        if (cat.includes('u18')) return 18;
        if (cat.includes('u19')) return 19;
        if (cat.includes('u20')) return 20;
        if (cat.includes('u21')) return 21;
        if (cat.includes('u22')) return 22;
        if (cat.includes('u23')) return 23;
        if (cat.includes('mayores') || cat.includes('primera')) return 50;
        if (cat.includes('veteranos')) return 60;
        return 100;
    }

    function globalCategorySort(a, b) {
        const catA = a || '';
        const catB = b || '';
        const isFemA = isFemaleCategory(catA);
        const isFemB = isFemaleCategory(catB);

        // Femeninas primero
        if (isFemA && !isFemB) return -1;
        if (!isFemA && isFemB) return 1;

        // Dentro del mismo género, por peso de edad
        const orderA = getCategoryOrder(catA);
        const orderB = getCategoryOrder(catB);
        if (orderA !== orderB) return orderA - orderB;

        // Si son iguales, alfabético
        return catA.localeCompare(catB);
    }

    function getFMStatusStyles(player) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const expDate = parseDateDDMMYYYY(player['FM Hasta']);
        const isExpired = !expDate || expDate < today;
        const season = seasonFilter ? seasonFilter.value : player.TEMPORADA;

        // Determinar fin del torneo según tipo de temporada
        let tournamentEndDate = null;
        if (season && season.includes('-')) {
            const years = season.split('-').map(y => y.trim());
            const lastYear = years[years.length - 1];
            tournamentEndDate = new Date(parseInt(lastYear), 5, 30); // 30/06
        } else if (season) {
            const year = parseInt(season);
            tournamentEndDate = new Date(year, 11, 25); // 25/12
        }

        let bgClass = 'hover:bg-gray-100';
        let textClass = 'text-gray-900';

        if (player['TIPO'] === 'ENTRENADOR/A') {
            return {
                bg: 'bg-blue-100 hover:bg-blue-200',
                text: 'text-blue-800',
                frame: '',
                isGreen: false
            };
        }

        if (isExpired) {
            bgClass = 'bg-red-800 hover:bg-red-900';
            textClass = 'text-white';
        } else if (tournamentEndDate && expDate > tournamentEndDate) {
            bgClass = 'bg-green-600 hover:bg-green-700';
            textClass = 'text-white';
        } else {
            const thirtyDays = new Date(today); thirtyDays.setDate(today.getDate() + 30);
            const sixtyDays = new Date(today); sixtyDays.setDate(today.getDate() + 60);

            if (expDate <= thirtyDays) {
                bgClass = 'bg-orange-500 hover:bg-orange-600';
                textClass = 'text-black';
            } else if (expDate <= sixtyDays) {
                bgClass = 'bg-yellow-200 hover:bg-yellow-300';
                textClass = 'text-black';
            }
        }

        return {
            bg: bgClass,
            text: textClass,
            badge: `${bgClass.split(' ')[0]} ${textClass} font-bold px-2 py-1 rounded-lg shadow-sm`,
            frame: bgClass.replace('hover:', '').split(' ')[0] + ' border-gray-400',
            isGreen: (tournamentEndDate && expDate > tournamentEndDate)
        };
    }

    function showExpiring() {
        if (printButton) printButton.classList.remove('hidden');
        const selectedSeason = seasonFilter ? seasonFilter.value : null;
        if (!selectedSeason) {
            showToast("Por favor, selecciona una temporada para ver los vencimientos.");
            return;
        }

        const selectedEquipo = equipoFilter ? equipoFilter.value : '';
        const selectedCategory = categoryFilter ? categoryFilter.value : '';

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const limitDate = new Date(); limitDate.setDate(today.getDate() + 60);

        // Incluimos jugadores sin ficha ("", nulo, undefined o solo espacios) además de los que vencen pronto
        let expiringPlayers = allPlayers.filter(p => {
            if (p.TIPO === 'ENTRENADOR/A') return false;
            const fmHasta = p['FM Hasta'];
            // Si no tiene FM registrada o ha vencido
            if (!fmHasta || fmHasta.toString().trim() === "" || fmHasta === "1/1/1900") return true;
            const expDate = parseDateDDMMYYYY(fmHasta);
            return !expDate || expDate <= limitDate;
        });

        if (selectedEquipo) expiringPlayers = expiringPlayers.filter(p => p.EQUIPO === selectedEquipo);
        if (selectedCategory) expiringPlayers = expiringPlayers.filter(p => p.CATEGORIA === selectedCategory);

        const title = `Vencimientos y Sin Ficha - Temporada ${selectedSeason}`;

        // Lógica de agrupamiento y presentación visual mejorada
        tableContainer.innerHTML = '';
        messageEl.style.display = 'none';

        if (expiringPlayers.length === 0) {
            messageEl.style.display = 'block';
            messageEl.textContent = 'No hay vencimientos o fichas faltantes para los filtros seleccionados.';
            return;
        }

        if (printButton) printButton.classList.remove('hidden');

        // Agrupar por EQUIPO
        const playersByEquipo = {};
        expiringPlayers.forEach(p => {
            const eq = p.EQUIPO || 'SIN EQUIPO';
            if (!playersByEquipo[eq]) playersByEquipo[eq] = [];
            playersByEquipo[eq].push(p);
        });

        // Ordenar equipos alfabéticamente
        const sortedEquipos = Object.keys(playersByEquipo).sort();

        sortedEquipos.forEach(eqName => {
            const eqContainer = document.createElement('div');
            eqContainer.className = 'mb-10';

            const h2 = document.createElement('h2');
            h2.className = 'text-2xl font-bold text-blue-900 border-b-4 border-blue-900 mb-4 pb-2 uppercase';
            h2.textContent = `EQUIPO: ${eqName}`;
            eqContainer.appendChild(h2);

            // Agrupar por CATEGORIA dentro de este equipo
            const playersByCat = {};
            playersByEquipo[eqName].forEach(p => {
                const cat = p.CATEGORIA || 'SIN CATEGORIA';
                if (!playersByCat[cat]) playersByCat[cat] = [];
                playersByCat[cat].push(p);
            });

            // Ordenar categorías: Femeninas primero, luego por edad
            const sortedCats = Object.keys(playersByCat).sort(globalCategorySort);

            sortedCats.forEach(catName => {
                const catSection = document.createElement('div');
                catSection.className = 'ml-4 mb-6';

                const h3 = document.createElement('h3');
                h3.className = 'text-xl font-semibold text-gray-800 mb-2 border-l-4 border-blue-600 pl-3';
                h3.textContent = `Categoría: ${catName}`;
                catSection.appendChild(h3);

                // Ordenar jugadores dentro de la categoría: Sin ficha primero, luego por fecha ascendente
                const sortedPlayers = playersByCat[catName].sort((a, b) => {
                    const dateA = parseDateDDMMYYYY(a['FM Hasta']);
                    const dateB = parseDateDDMMYYYY(b['FM Hasta']);

                    if (!dateA && !dateB) return (a.NOMBRE || '').localeCompare(b.NOMBRE || '');
                    if (!dateA) return -1;
                    if (!dateB) return 1;
                    return dateA - dateB;
                });

                // Pasamos explícitamente las columnas deseadas para este reporte
                const reportColumns = ['DNI', 'NOMBRE', 'FM Hasta'];
                catSection.appendChild(createTable(sortedPlayers, catName, reportColumns));
                eqContainer.appendChild(catSection);
            });

            tableContainer.appendChild(eqContainer);
        });

        currentlyDisplayedPlayers = expiringPlayers;
        currentColumnsForPDF = ['DNI', 'NOMBRE', 'FM Hasta'];
    }

    function resetAll() {
        if (printButton) printButton.classList.add('hidden');
        if (nameSearchInput) nameSearchInput.value = '';
        if (dniSearchInput) dniSearchInput.value = '';
        if (categoryFilter) categoryFilter.selectedIndex = 0;
        if (equipoFilter) equipoFilter.selectedIndex = 0;
        if (nameSuggestionsDatalist) nameSuggestionsDatalist.innerHTML = '';
        if (dniSuggestionsDatalist) dniSuggestionsDatalist.innerHTML = '';
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

    const createPlayerRow = (player, categoryContext, columns) => {
        const row = document.createElement('tr');
        row.className = 'clickable-row';
        const originalIndex = currentlyDisplayedPlayers.findIndex(p => p._firebaseKey === player._firebaseKey);
        row.addEventListener('click', () => showPlayerDetails(player, isEditModeActive, originalIndex, false));

        const { bg, text } = getFMStatusStyles(player);
        row.className = `clickable-row ${bg} ${text} transition-colors`;

        columns.forEach(colName => {
            const td = document.createElement('td');
            td.className = `px-2 py-2 text-sm ${colName === 'NOMBRE' ? 'truncate max-w-48' : 'whitespace-nowrap'}`;
            if (colName === 'DNI' || colName === 'FM Hasta' || colName === 'Numero' || colName === 'EQUIPO' || colName === 'CATEGORIA' || colName === 'ESTADO LICENCIA') {
                td.classList.add('text-center');
            }

            let cellValue;
            if (colName === 'TEMPORADAS') {
                cellValue = (player._allSeasons || []).join(', ');
            } else if (colName === 'CATEGORIA' && player.esAutorizado) {
                cellValue = player.categoriaOrigen || player.CATEGORIA;
            } else {
                cellValue = (colName === 'Numero') ? ((player.Numeros && player.Numeros[categoryContext || player.CATEGORIA]) || player.Numero || '-') : (player[colName] || '-');
            }

            if (colName === 'FM Hasta' || colName === 'FM DESDE') {
                const isCoach = player['TIPO'] === 'ENTRENADOR/A';
                if (!isCoach && (cellValue === '1/1/1900' || cellValue === '-' || !player[colName])) {
                    cellValue = 'Sin Ficha';
                }
            }
            if (colName === 'NOMBRE') {
                const statusLicencia = String(player['ESTADO LICENCIA'] || '').toUpperCase();
                const isBaja = statusLicencia === 'BAJA';
                const isSinInscribir = statusLicencia === 'SIN INSCRIBIR';
                const isDiligenciado = statusLicencia === 'DILIGENCIADO';
                const isCedido = player._isCedido;

                let iconHtml = '';

                if (player._paseStatus === 'aVencer') {
                    iconHtml += '<span title="Pase a Vencer" class="inline-flex items-center justify-center bg-yellow-400 text-black font-black rounded-full mr-1 shadow-sm" style="width: 1.1rem; height: 1.1rem; font-size: 0.75rem;">!</span>';
                } else if (player._paseStatus === 'vencido') {
                    iconHtml += '<span title="Pase Vencido" class="inline-flex items-center justify-center bg-red-600 text-white font-black rounded-full mr-1 shadow-sm" style="width: 1.1rem; height: 1.1rem; font-size: 0.75rem;">!</span>';
                }

                if (isBaja) {
                    iconHtml += '<span class="inline-flex items-center justify-center bg-white text-red-600 font-bold rounded-full mr-1" style="width: 1.1rem; height: 1.1rem; font-size: 0.75rem;">X</span>';
                } else if (isCedido) {
                    iconHtml += '<span title="Cedido en Pase" class="inline-flex items-center justify-center bg-blue-100 text-blue-800 font-bold rounded-full mr-1" style="width: 1.2rem; height: 1.2rem; font-size: 0.75rem;">⇄</span>';
                } else if (!isDiligenciado && player.TIPO !== 'ENTRENADOR/A' && !player._isGlobal) {
                    if (isSinInscribir) {
                        iconHtml += '<span title="Sin Inscribir" class="inline-flex items-center justify-center bg-red-600 text-white font-black mr-1" style="clip-path: polygon(50% 0%, 0% 100%, 100% 100%); width: 1.1rem; height: 1rem; font-size: 0.65rem; padding-top: 0.3rem;">!</span>';
                    } else {
                        iconHtml += '<span title="Licencia no diligenciada" class="mr-1">⚠️</span>';
                    }
                }

                td.innerHTML = `${iconHtml}${cellValue || '-'}`;
            } else {
                td.textContent = cellValue || '-';
            }
            row.appendChild(td);
        });
        return row;
    };

    const createTable = (players, categoryContext, columns) => {
        const table = document.createElement('table');
        table.className = 'min-w-full divide-y divide-gray-200';
        const thead = table.createTHead();
        thead.className = 'bg-gray-50';
        const headerRow = thead.insertRow();
        columns.forEach(headerText => {
            const th = document.createElement('th');
            const isSortable = ['NOMBRE', 'Numero', 'FM Hasta', 'ESTADO LICENCIA'].includes(headerText);
            th.className = `px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isSortable ? 'cursor-pointer hover:bg-gray-100 hover:text-blue-600 transition-colors' : ''}`;

            let displayText = headerText;
            if (headerText === currentSortCol) {
                displayText += currentSortDir === 'asc' ? ' ↑' : ' ↓';
                th.classList.add('text-blue-600', 'font-bold');
            }
            th.textContent = displayText;

            if (isSortable) {
                th.onclick = () => {
                    if (currentSortCol === headerText) {
                        currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
                    } else {
                        currentSortCol = headerText;
                        currentSortDir = 'asc';
                    }
                    applyFilters(); // Re-renderiza con el nuevo orden
                };
            }
            headerRow.appendChild(th);
        });

        const tbody = table.createTBody();
        tbody.className = 'bg-white divide-y divide-gray-200';
        players.forEach(player => tbody.appendChild(createPlayerRow(player, categoryContext, columns)));
        return table;
    };

    function displayPlayers(players, customTitle = '', columns) {
        if (!tableContainer || !messageEl) return;

        if (customTitle && columns) {
            currentColumnsForPDF = columns;
        } else {
            currentColumnsForPDF = [];
        }

        const selectedCategory = categoryFilter ? categoryFilter.value : '';
        const selectedEquipo = equipoFilter ? equipoFilter.value : '';

        let currentColumns = columns || COLUMN_ORDER;

        // Si se filtra por Equipo Y Categoría, cambiar CATEGORIA por ESTADO LICENCIA
        if (selectedCategory && selectedEquipo && !columns) {
            currentColumns = currentColumns.map(col => col === 'CATEGORIA' ? 'ESTADO LICENCIA' : col);
        }

        currentlyDisplayedPlayers = players;

        tableContainer.innerHTML = '';
        if (players.length === 0) {
            messageEl.style.display = 'block';
            messageEl.textContent = customTitle || 'No se encontraron jugadores que coincidan con la búsqueda.';
            return;
        }
        messageEl.style.display = 'none';

        const sortPlayers = (playersToSort, category) => {
            return playersToSort.sort((a, b) => {
                const aIsBaja = a['ESTADO LICENCIA'] === 'Baja';
                const bIsBaja = b['ESTADO LICENCIA'] === 'Baja';

                if (aIsBaja && !bIsBaja) return 1;
                if (!aIsBaja && bIsBaja) return -1;

                let comparison = 0;
                if (currentSortCol === 'NOMBRE') {
                    comparison = (a.NOMBRE || '').localeCompare(b.NOMBRE || '');
                } else if (currentSortCol === 'Numero') {
                    const getNumVal = (p) => {
                        const raw = (p.Numeros && p.Numeros[category || p.CATEGORIA]) || p.Numero;
                        if (raw === undefined || raw === null || raw === '') return Infinity;
                        const s = String(raw).trim();
                        if (s === '0') return -2;
                        if (s === '00') return -1;
                        const n = parseInt(s, 10);
                        return isNaN(n) ? Infinity : n;
                    };
                    comparison = getNumVal(a) - getNumVal(b);
                } else if (currentSortCol === 'FM Hasta') {
                    const getDateVal = (p) => {
                        const d = p['FM Hasta'];
                        if (!d || d === '1/1/1900' || d === '-') return new Date(0);
                        const parts = d.split('/');
                        if (parts.length !== 3) return new Date(0);
                        return new Date(parts[2], parts[1] - 1, parts[0]);
                    };
                    comparison = getDateVal(a) - getDateVal(b);
                } else if (currentSortCol === 'ESTADO LICENCIA') {
                    comparison = (a['ESTADO LICENCIA'] || '').localeCompare(b['ESTADO LICENCIA'] || '');
                }

                return currentSortDir === 'asc' ? comparison : -comparison;
            });
        };

        if (customTitle) {
            tableContainer.appendChild(createTable(sortPlayers(players, selectedCategory), selectedCategory, currentColumns));
        } else if (selectedCategory) {
            if (printButton) printButton.classList.remove('hidden');
            const playersInCategory = sortPlayers(players.filter(p => p.CATEGORIA === selectedCategory && !p.esAutorizado && p.TIPO !== 'ENTRENADOR/A'), selectedCategory);
            const coaches = players.filter(p => p.CATEGORIA === selectedCategory && p.TIPO === 'ENTRENADOR/A');
            const authorizedPlayers = sortPlayers(players.filter(p => {
                const pAuthEquipo = String(p.equipoAutorizado || "").trim();
                const isSameSeasonAuth = p.categoriasAutorizadas && p.categoriasAutorizadas.includes(selectedCategory) &&
                    (pAuthEquipo === selectedEquipo || (p.EQUIPO === selectedEquipo && !pAuthEquipo)) &&
                    p.CATEGORIA !== selectedCategory;
                const isCrossSeasonAuth = p.esAutorizado && p.CATEGORIA === selectedCategory;
                return isSameSeasonAuth || isCrossSeasonAuth;
            }), selectedCategory);

            const mainTable = createTable(playersInCategory, selectedCategory, currentColumns);
            const tbody = mainTable.querySelector('tbody');
            if (coaches.length > 0) {
                const coachHeaderRow = tbody.insertRow();
                coachHeaderRow.className = 'bg-gray-200 font-semibold';
                const cell = coachHeaderRow.insertCell();
                cell.colSpan = currentColumns.length;
                cell.textContent = 'Entrenadores';
                cell.className = 'px-6 py-2 text-sm text-gray-700';
                coaches.forEach(coach => tbody.appendChild(createPlayerRow(coach, selectedCategory, currentColumns)));
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
                authorizedContainer.appendChild(createTable(authorizedPlayers, selectedCategory, currentColumns));
                details.appendChild(authorizedContainer);
                tableContainer.appendChild(details);
            }

            // --- JUGADORES POTENCIALES PARA AUTORIZAR (Mismo equipo) ---
            if (selectedCategory && selectedEquipo) {
                const potentialPlayers = sortPlayers(allPlayers.filter(p => {
                    if (p.TIPO === 'ENTRENADOR/A') return false;

                    // Ya está en esta categoría
                    if (p.CATEGORIA === selectedCategory) return false;

                    // Ya está autorizado en esta categoría
                    if (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(selectedCategory)) return false;
                    if (p.esAutorizado && p.CATEGORIA === selectedCategory) return false;

                    // Debe ser del mismo equipo
                    if (p.EQUIPO !== selectedEquipo) return false;

                    // Debe cumplir la regla de progresión
                    const possibleDestinations = PROGRESSION_RULES[p.CATEGORIA] || [];
                    if (!possibleDestinations.includes(selectedCategory)) return false;

                    // --- NUEVAS REGLAS DE EXCLUSIÓN MUTUA ---
                    const selectedIsMixed = selectedCategory.toLowerCase().includes('mixta') || selectedCategory.toLowerCase().includes('mixto');
                    const auths = p.categoriasAutorizadas || [];

                    if (selectedIsMixed) {
                        // 1. A MIXTA: No si ya tiene autorizada una SUPERIOR FEMENINA
                        const hasHigherFem = auths.some(a => {
                            const isAMixed = a.toLowerCase().includes('mixta') || a.toLowerCase().includes('mixto');
                            return !isAMixed && getCategoryOrder(a) > getCategoryOrder(p.CATEGORIA);
                        });
                        if (hasHigherFem) return false;
                    } else {
                        // 2. A SUPERIOR FEMENINA: No si ya tiene autorizada una MIXTA (de cualquier nivel)
                        const isHigher = getCategoryOrder(selectedCategory) > getCategoryOrder(p.CATEGORIA);
                        if (isHigher) {
                            const hasMixed = auths.some(a => a.toLowerCase().includes('mixta') || a.toLowerCase().includes('mixto'));
                            if (hasMixed) return false;
                        }
                    }

                    // --- NUEVAS REGLAS DE GÉNERO ---
                    if (p.genero === 'Masculino' && isFemaleCategory(selectedCategory)) return false;
                    if (p.genero === 'Femenino' && isMaleCategory(selectedCategory)) return false;

                    return true;
                }), selectedCategory);

                if (potentialPlayers.length > 0) {
                    const potentialDetails = document.createElement('details');
                    potentialDetails.className = 'mt-4 bg-amber-50 rounded-lg shadow border border-amber-100';
                    const potentialSummary = document.createElement('summary');
                    potentialSummary.className = 'px-6 py-3 text-md font-medium text-amber-800 cursor-pointer focus:outline-none';
                    potentialSummary.textContent = `Sin Autorizar en este Equipo (${potentialPlayers.length})`;
                    potentialDetails.appendChild(potentialSummary);

                    const potentialContainer = document.createElement('div');
                    potentialContainer.className = 'p-4';

                    // Mostrar tabla simplificada para potenciales
                    const potentialColumns = ['DNI', 'NOMBRE', 'CATEGORIA'];
                    potentialContainer.appendChild(createTable(potentialPlayers, null, potentialColumns));
                    potentialDetails.appendChild(potentialContainer);
                    tableContainer.appendChild(potentialDetails);
                }
            }

        } else {
            if (selectedEquipo && printButton) printButton.classList.remove('hidden');
            tableContainer.appendChild(createTable(sortPlayers(players, selectedCategory), selectedCategory, currentColumns));
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

        // Get all unique, sorted teams from the provided list
        const equipos = [...new Set(players.map(p => p.EQUIPO).filter(Boolean))].sort();

        // Preserve the placeholder option (the first option)
        const placeholderText = equipoFilter.options[0].text;
        const placeholderValue = equipoFilter.options[0].value;

        // Clear dropdown
        equipoFilter.innerHTML = '';

        // Add placeholder back
        equipoFilter.appendChild(new Option(placeholderText, placeholderValue));

        // Add sorted teams
        equipos.forEach(eq => {
            equipoFilter.appendChild(new Option(eq, eq));
        });

        // Restore selection if possible
        try {
            equipoFilter.value = currentValue;
        } catch (e) { }
    }

    function createDetailHtml(key, value, fmHastaFrameClass) {
        let displayValue = (value === '1/1/1900') ? '-' : (value || '-');
        if (key === 'FM Hasta' && fmHastaFrameClass) {
            return `
                <div class="border-b border-gray-200 pb-2">
                    <p class="text-xs font-medium text-gray-500 uppercase">${key}</p>
                    <div class="mt-1 flex justify-start">
                        <span class="${fmHastaFrameClass} text-md inline-block text-center min-w-[120px]">
                            ${displayValue}
                        </span>
                    </div>
                </div>`;
        }
        return `<div class="border-b border-gray-200 pb-2"><p class="text-xs font-medium text-gray-500 uppercase">${key}</p><p class="text-md text-gray-900 font-bold">${displayValue}</p></div>`;
    }

    function showPlayerDetails(player, canEdit, playerIndex = -1, isEditing = false) {
        if (!mainContent || !playerDetailView) return;
        const specialCategories = ["Liga Uruguaya de Basquet", "Liga de Desarrollo", "Liga Femenina de Basquet"];

        const isReadOnlyForAuth = player.esAutorizado && isEditing;

        // Ya no se fuerza isEditing = false, se maneja en la UI.
        if (isReadOnlyForAuth) {
            showToast("Modo de edición limitado para jugador autorizado.", "info");
        }

        AuditLogger.logView('detalle_jugador', player.DNI);
        if (playerIndex !== -1) currentPlayerIndex = playerIndex;
        mainContent.classList.add('hidden');
        playerDetailView.classList.remove('hidden');
        playerDetailView.innerHTML = '';

        const photoUrl = `${IMG_BASE_URL}${encodeURIComponent(player.DNI)}.jpg`;
        const { bg, badge } = getFMStatusStyles(player);

        const backgroundColor = 'bg-white';
        // Usamos el formato de badge solicitado en lugar de un marco grueso
        const fmHastaFrameClass = badge;
        // Borde de foto con el color fuerte
        const borderColor = bg.includes('red') ? 'border-red-800' :
            bg.includes('green') ? 'border-green-600' :
                bg.includes('orange') ? 'border-orange-500' :
                    bg.includes('yellow') ? 'border-yellow-200' : 'border-gray-200';

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
                        <h2 class="text-2xl font-bold text-gray-900 mt-4 min-h-[4rem] flex items-center justify-center leading-tight text-center">${player.NOMBRE || 'Sin Nombre'}</h2>
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
                        ${player._isGlobal ? `
                            <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
                                <span class="font-bold">Historial de Temporadas:</span> ${player._allSeasons.join(', ')}
                            </div>
                        ` : ''}
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
                            ${isEditing ? `
                            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                <div>
                                    <label for="edit-genero" class="block text-sm font-medium text-gray-600">Género</label>
                                    <select id="edit-genero" data-key="genero" class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                                        <option value="" ${!player.genero ? 'selected' : ''}>Seleccione...</option>
                                        <option value="Masculino" ${player.genero === 'Masculino' ? 'selected' : ''}>Masculino</option>
                                        <option value="Femenino" ${player.genero === 'Femenino' ? 'selected' : ''}>Femenino</option>
                                    </select>
                                </div>
                            </div>` : ''}
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
                                    
                                    <div class="mt-4">
                                        <label for="edit-equipoAutorizado" class="block text-sm font-medium text-gray-600">Equipo Autorizado (Otro Equipo)</label>
                                        <input type="text" id="edit-equipoAutorizado" list="edit-equipos-list" data-key="equipoAutorizado" value="${player.equipoAutorizado || player.EQUIPO || ''}" 
                                            placeholder="Seleccione o escriba un equipo..."
                                            class="mt-1 block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm">
                                        <datalist id="edit-equipos-list">
                                            ${(() => {
                    const progressionCats = PROGRESSION_RULES[player.CATEGORIA] || [];
                    const allAuthCats = [...new Set([...progressionCats, ...specialCategories])];
                    const teamsForCats = [...new Set(allPlayers.filter(p => allAuthCats.includes(p.CATEGORIA)).map(p => p.EQUIPO).filter(Boolean))].sort();
                    return teamsForCats.map(eq => `<option value="${eq}">${eq}</option>`).join('');
                })()}
                                        </datalist>
                                    </div>
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
                    if (!numerosContent) return;
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

                const primaryCategory = player.CATEGORIA;
                // FIX: Convertir a mayúsculas para que coincida con las claves de las reglas (ej: "U14 Mixto" vs "U14 Mixto")
                const suggestedCategories = PROGRESSION_RULES[primaryCategory] || [];
                const existingAuthorizations = player.categoriasAutorizadas || [];

                let categoriesToShow = [...new Set([...suggestedCategories, ...existingAuthorizations])];

                // --- APLICAR REGLAS DE EXCLUSIÓN MUTUA EN SUGERENCIAS DE EDICIÓN ---
                const hasAnyMixedAuth = existingAuthorizations.some(c => c.toLowerCase().includes('mixta') || c.toLowerCase().includes('mixto'));
                const hasAnySuperiorFemAuth = existingAuthorizations.some(c => {
                    const isMixed = c.toLowerCase().includes('mixta') || c.toLowerCase().includes('mixto');
                    return !isMixed && getCategoryOrder(c) > getCategoryOrder(primaryCategory);
                });

                categoriesToShow = categoriesToShow.filter(cat => {
                    // Si ya está autorizada, la mantenemos para no perder datos
                    if (existingAuthorizations.includes(cat)) return true;

                    const isCatMixed = cat.toLowerCase().includes('mixta') || cat.toLowerCase().includes('mixto');
                    const isCatSuperiorFem = !isCatMixed && getCategoryOrder(cat) > getCategoryOrder(primaryCategory);

                    if (isCatMixed && hasAnySuperiorFemAuth) return false;
                    if (isCatSuperiorFem && hasAnyMixedAuth) return false;

                    // --- NUEVAS REGLAS DE GÉNERO ---
                    if (player.genero === 'Masculino' && isFemaleCategory(cat)) return false;
                    if (player.genero === 'Femenino' && isMaleCategory(cat)) return false;

                    return true;
                });

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

                const enforceMutualExclusion = () => {
                    const selectedOptions = Array.from(categoriasSelect.selectedOptions).map(opt => opt.value);
                    const hasSelectedMixed = selectedOptions.some(val => val.toLowerCase().includes('mixta') || val.toLowerCase().includes('mixto'));
                    const hasSelectedSuperior = selectedOptions.some(val => {
                        const isMixed = val.toLowerCase().includes('mixta') || val.toLowerCase().includes('mixto');
                        return !isMixed && getCategoryOrder(val) > getCategoryOrder(primaryCategory);
                    });

                    Array.from(categoriasSelect.options).forEach(opt => {
                        const val = opt.value;
                        const isOptMixed = val.toLowerCase().includes('mixta') || val.toLowerCase().includes('mixto');
                        const isOptSuperior = !isOptMixed && getCategoryOrder(val) > getCategoryOrder(primaryCategory);

                        if (hasSelectedMixed && isOptSuperior) {
                            opt.disabled = true;
                        } else if (hasSelectedSuperior && isOptMixed) {
                            opt.disabled = true;
                        } else {
                            opt.disabled = false;
                        }
                    });
                };

                categoriasSelect.addEventListener('change', (e) => {
                    enforceMutualExclusion();
                    updateNumerosUI();
                });
                enforceMutualExclusion();
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
        if (playerDetailView) playerDetailView.classList.add('hidden');
        if (mainContent) mainContent.classList.remove('hidden');
        if (nameSearchInput) nameSearchInput.focus();
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

            const personalKeys = ['DNI', 'NOMBRE', 'FECHA NACIMIENTO', 'NACIONALIDAD', 'TELEFONO', 'EMAIL', 'FM Desde', 'FM Hasta', 'genero'];
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
            AuditLogger.log('CREACION', { entidad: 'jugador', registroId: dni, nombre: newPlayerData.NOMBRE, datos: newPlayerData });
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
            AuditLogger.log('IMPORTACION', {
                entidad: 'jugador',
                registroId: originalPlayer.DNI,
                nombre: originalPlayer.NOMBRE,
                nuevaTemporada: newSeason,
                datos: newSeasonalData
            });
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
        const rawTipo = String(originalPlayer._tipo || "").toLowerCase();
        const rawTIPO = String(originalPlayer.TIPO || "").toLowerCase();
        const dbNode = (rawTipo.includes("jugador") || rawTIPO.includes("jugador")) ? "jugadores" : "entrenadores";
        const pushId = database.ref().push().key;

        const combinedDataForIndex = {
            NOMBRE: originalPlayer.NOMBRE,
            DNI: originalPlayer.DNI,
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
            AuditLogger.log('AUTORIZACION', {
                entidad: 'jugador',
                registroId: originalPlayer.DNI,
                nombre: originalPlayer.NOMBRE,
                nuevaTemporada: newSeason,
                nuevaCategoria: newCategory
            });
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
        const selectedCategory = categoryFilter ? categoryFilter.value : '';

        // Priorizar el reporte de Vencimientos si es el que se generó específicamente
        if (currentColumnsForPDF.length === 3 && currentColumnsForPDF.includes('FM Hasta') && currentlyDisplayedPlayers.length > 0) {
            await generateExpiringPDF();
        } else if (selectedCategory || (equipoFilter && equipoFilter.value)) {
            // Mostrar modal de opciones para el PDF de categoría o equipo
            showPDFOptionsModal(selectedCategory, !selectedCategory ? equipoFilter.value : null);
        } else if (currentlyDisplayedPlayers.length > 0 && currentColumnsForPDF.length > 0) {
            await generateExpiringPDF();
        } else {
            showToast("No hay datos para generar el PDF.", "error");
        }
    }

    function showPDFOptionsModal(selectedCategory, selectedEquipo = null) {
        const modal = document.getElementById('pdfOptionsModal');
        const btnYes = document.getElementById('pdfOptionYes');
        const btnNo = document.getElementById('pdfOptionNo');
        const btnAnomalos = document.getElementById('pdfOptionAnomalos');
        const btnPotenciales = document.getElementById('pdfOptionPotenciales');
        const btnCancel = document.getElementById('pdfOptionCancel');

        if (!modal || !btnYes || !btnNo || !btnCancel) return;

        // Mostrar/ocultar botones según contexto (solo equipo tiene anómalos y potenciales)
        if (btnAnomalos) btnAnomalos.style.display = selectedEquipo ? '' : 'none';
        if (btnPotenciales) btnPotenciales.style.display = selectedEquipo ? '' : 'none';

        modal.classList.remove('hidden');

        // Handlers temporales
        const handleYes = async () => {
            const includePotentials = document.getElementById('includePotentialsCheckbox') ? document.getElementById('includePotentialsCheckbox').checked : false;
            closeModal();
            if (selectedEquipo) {
                await generateTeamPDF(selectedEquipo, true, includePotentials);
            } else {
                await generateCategoryPDF(selectedCategory, true, includePotentials);
            }
        };
        const handleNo = async () => {
            const includePotentials = document.getElementById('includePotentialsCheckbox') ? document.getElementById('includePotentialsCheckbox').checked : false;
            closeModal();
            if (selectedEquipo) {
                await generateTeamPDF(selectedEquipo, false, includePotentials);
            } else {
                await generateCategoryPDF(selectedCategory, false, includePotentials);
            }
        };
        const handleAnomalos = async () => {
            closeModal();
            if (selectedEquipo) {
                await generateTeamAnomalousPDF(selectedEquipo);
            }
        };
        const handlePotenciales = async () => {
            closeModal();
            if (selectedEquipo) {
                await generateTeamPotentialPDF(selectedEquipo);
            }
        };
        const closeModal = () => {
            modal.classList.add('hidden');
            // Limpiar checkbox para la próxima vez
            const chk = document.getElementById('includePotentialsCheckbox');
            if (chk) chk.checked = false;

            btnYes.removeEventListener('click', handleYes);
            btnNo.removeEventListener('click', handleNo);
            if (btnAnomalos) btnAnomalos.removeEventListener('click', handleAnomalos);
            if (btnPotenciales) btnPotenciales.removeEventListener('click', handlePotenciales);
            btnCancel.removeEventListener('click', closeModal);
        };

        btnYes.addEventListener('click', handleYes);
        btnNo.addEventListener('click', handleNo);
        if (btnAnomalos) btnAnomalos.addEventListener('click', handleAnomalos);
        if (btnPotenciales) btnPotenciales.addEventListener('click', handlePotenciales);
        btnCancel.addEventListener('click', closeModal);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PDF: ANÓMALOS (jugadores con ESTADO LICENCIA ≠ DILIGENCIADO) por equipo
    // ─────────────────────────────────────────────────────────────────────────────
    async function generateTeamAnomalousPDF(selectedEquipo) {
        if (typeof window.jspdf === 'undefined') {
            return showToast("Librería PDF no disponible.", "error");
        }

        // Filtrar jugadores del equipo (no cedidos, no entrenadores) con estado ≠ DILIGENCIADO
        const anomalousPlayers = currentlyDisplayedPlayers.filter(p => {
            if (p._isCedido) return false;
            if ((p.TIPO || '').toUpperCase() === 'ENTRENADOR/A') return false;
            if (String(p.EQUIPO || '').trim().toUpperCase() !== selectedEquipo.trim().toUpperCase()) return false;
            const estado = String(p['ESTADO LICENCIA'] || '').toUpperCase();
            return estado !== 'DILIGENCIADO';
        });

        if (anomalousPlayers.length === 0) {
            return showToast("No hay jugadores anómalos en este equipo.", "error");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait' });
        const title = `Anómalos - Equipo: ${selectedEquipo}`;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageMargin = 15;
        let yPosition = pageMargin;

        const maskDNI = dni => { const s = String(dni || ''); return s.length > 4 ? '****' + s.substring(4) : s; };

        // Cargar logo
        let logoImage = null;
        try {
            logoImage = await new Promise((resolve, reject) => {
                const img = new Image(); img.crossOrigin = 'Anonymous';
                img.onload = () => resolve(img); img.onerror = err => reject(err);
                img.src = LOGO_URL;
            });
        } catch (e) { console.error("No se pudo cargar el logo:", e); }

        if (logoImage) {
            const logoSize = 15, logoWidth = 10;
            doc.addImage(logoImage, 'PNG', pageMargin, pageMargin, logoWidth, logoSize);
            doc.addImage(logoImage, 'PNG', pageWidth - pageMargin - logoWidth, pageMargin, logoWidth, logoSize);
        }

        doc.setFontSize(16); doc.setFont(undefined, 'bold');
        doc.text(title, pageWidth / 2, pageMargin + 10, { align: 'center' });
        yPosition = pageMargin + 22;

        // Subtítulo explicativo
        doc.setFontSize(9); doc.setFont(undefined, 'italic'); doc.setTextColor(120, 60, 0);
        doc.text('Jugadores con Estado de Licencia distinto de DILIGENCIADO', pageWidth / 2, yPosition, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        yPosition += 8;

        const columns = ['DNI', 'NOMBRE', 'ESTADO LICENCIA', 'FM Hasta'];
        const baseWidth = pageWidth - 2 * pageMargin;
        const colWidths = {
            'DNI': baseWidth * 0.13,
            'NOMBRE': baseWidth * 0.44,
            'ESTADO LICENCIA': baseWidth * 0.27,
            'FM Hasta': baseWidth * 0.16
        };

        // Agrupar por categoría
        const playersByCat = {};
        anomalousPlayers.forEach(p => {
            const cat = p.CATEGORIA || 'SIN CATEGORÍA';
            if (!playersByCat[cat]) playersByCat[cat] = [];
            playersByCat[cat].push(p);
        });
        const sortedCats = Object.keys(playersByCat).sort(globalCategorySort);

        for (const catName of sortedCats) {
            if (yPosition > pageHeight - pageMargin - 30) { doc.addPage(); yPosition = pageMargin + 5; }

            doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(25, 50, 100);
            doc.text(`CATEGORÍA: ${catName.toUpperCase()}`, pageMargin, yPosition);
            doc.line(pageMargin, yPosition + 1, pageWidth - pageMargin, yPosition + 1);
            yPosition += 9;

            const catPlayers = playersByCat[catName].sort((a, b) => (a.NOMBRE || '').localeCompare(b.NOMBRE || ''));
            const rowHeight = 6, headerHeight = 7, fontSize = 8;

            // Encabezado de tabla
            const drawTableHeader = (y) => {
                let x = pageMargin;
                doc.setFontSize(fontSize + 1); doc.setFont(undefined, 'bold');
                columns.forEach(col => {
                    const w = colWidths[col];
                    doc.setFillColor(180, 100, 0); doc.setDrawColor(120, 60, 0); doc.setTextColor(255, 255, 255);
                    doc.rect(x, y, w, headerHeight, 'FD');
                    doc.text(col, x + 2, y + 5);
                    x += w;
                });
                doc.setFont(undefined, 'normal'); doc.setFontSize(fontSize);
                doc.setTextColor(0, 0, 0); doc.setDrawColor(0, 0, 0);
                return y + headerHeight;
            };

            yPosition = drawTableHeader(yPosition);

            for (const player of catPlayers) {
                if (yPosition > pageHeight - pageMargin - rowHeight) {
                    doc.addPage(); yPosition = pageMargin; yPosition = drawTableHeader(yPosition);
                }
                const estado = String(player['ESTADO LICENCIA'] || '-').toUpperCase();
                // Color por tipo de anomalía
                let fillColor = [255, 243, 205]; // amarillo suave por defecto
                let textColor = [0, 0, 0];
                if (estado === 'SIN INSCRIBIR') { fillColor = [254, 226, 226]; textColor = [153, 27, 27]; }
                else if (estado === 'BAJA') { fillColor = [153, 27, 27]; textColor = [255, 255, 255]; }

                let x = pageMargin;
                columns.forEach(colName => {
                    const w = colWidths[colName];
                    doc.setFillColor(...fillColor); doc.setDrawColor(0, 0, 0); doc.setTextColor(...textColor);
                    let cellValue = player[colName] || '-';
                    if (colName === 'DNI') cellValue = maskDNI(player[colName]);
                    if (colName === 'FM Hasta' && (cellValue === '1/1/1900' || cellValue === '-')) cellValue = 'Sin Ficha';
                    doc.rect(x, yPosition, w, rowHeight, 'FD');
                    doc.text(String(cellValue), x + 2, yPosition + 4, { maxWidth: w - 4 });
                    x += w;
                });
                yPosition += rowHeight;
            }
            yPosition += 8;
        }

        drawPDFFooter(doc);
        const tsAno = new Date(); const tsAnoStr = `${tsAno.getFullYear()}${String(tsAno.getMonth() + 1).padStart(2, '0')}${String(tsAno.getDate()).padStart(2, '0')}-${String(tsAno.getHours()).padStart(2, '0')}${String(tsAno.getMinutes()).padStart(2, '0')}`;
        doc.save(`No_Diligenciados_${selectedEquipo.replace(/\s+/g, '_')}_${tsAnoStr}.pdf`);
        showToast("PDF de anómalos generado.", "success");
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PDF: POTENCIALES (jugadores que pueden subir de categoría) por equipo
    // ─────────────────────────────────────────────────────────────────────────────
    async function generateTeamPotentialPDF(selectedEquipo) {
        if (typeof window.jspdf === 'undefined') {
            return showToast("Librería PDF no disponible.", "error");
        }

        // Reunir todas las categorías del equipo para buscar potenciales hacia cada una
        const teamCategories = [...new Set(
            allPlayers
                .filter(p => String(p.EQUIPO || '').trim().toUpperCase() === selectedEquipo.trim().toUpperCase())
                .map(p => p.CATEGORIA)
                .filter(Boolean)
        )].sort(globalCategorySort);

        // Para cada categoría del equipo, buscar jugadores del mismo equipo que puedan subir a ella
        const potentialsByDestCat = {};
        for (const cat of teamCategories) {
            const potentials = allPlayers.filter(p => {
                if ((p.TIPO || '').toUpperCase() === 'ENTRENADOR/A') return false;
                if (p.CATEGORIA === cat) return false;
                if (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(cat)) return false;
                if (p.esAutorizado && p.CATEGORIA === cat) return false;
                if (p._isCedido) return false;
                if (String(p.EQUIPO || '').trim().toUpperCase() !== selectedEquipo.trim().toUpperCase()) return false;
                const possibleDest = PROGRESSION_RULES[p.CATEGORIA] || [];
                if (!possibleDest.includes(cat)) return false;
                // Reglas de género
                if (p.genero === 'Masculino' && isFemaleCategory(cat)) return false;
                if (p.genero === 'Femenino' && isMaleCategory(cat)) return false;
                // Exclusión mutua mixta/superior
                const catIsMixed = isMixedCategory(cat);
                const auths = p.categoriasAutorizadas || [];
                if (catIsMixed) {
                    const hasHigherFem = auths.some(a => !isMixedCategory(a) && getCategoryOrder(a) > getCategoryOrder(p.CATEGORIA));
                    if (hasHigherFem) return false;
                } else {
                    const isHigher = getCategoryOrder(cat) > getCategoryOrder(p.CATEGORIA);
                    if (isHigher) {
                        const hasMixed = auths.some(a => isMixedCategory(a));
                        if (hasMixed) return false;
                    }
                }
                return true;
            }).sort((a, b) => (a.NOMBRE || '').localeCompare(b.NOMBRE || ''));

            if (potentials.length > 0) {
                potentialsByDestCat[cat] = potentials;
            }
        }

        if (Object.keys(potentialsByDestCat).length === 0) {
            return showToast("No hay jugadores potenciales para este equipo.", "error");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait' });
        const title = `Potenciales - Equipo: ${selectedEquipo}`;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageMargin = 15;
        let yPosition = pageMargin;

        const maskDNI = dni => { const s = String(dni || ''); return s.length > 4 ? '****' + s.substring(4) : s; };

        // Cargar logo
        let logoImage = null;
        try {
            logoImage = await new Promise((resolve, reject) => {
                const img = new Image(); img.crossOrigin = 'Anonymous';
                img.onload = () => resolve(img); img.onerror = err => reject(err);
                img.src = LOGO_URL;
            });
        } catch (e) { console.error("No se pudo cargar el logo:", e); }

        if (logoImage) {
            const logoSize = 15, logoWidth = 10;
            doc.addImage(logoImage, 'PNG', pageMargin, pageMargin, logoWidth, logoSize);
            doc.addImage(logoImage, 'PNG', pageWidth - pageMargin - logoWidth, pageMargin, logoWidth, logoSize);
        }

        doc.setFontSize(16); doc.setFont(undefined, 'bold');
        doc.text(title, pageWidth / 2, pageMargin + 10, { align: 'center' });
        yPosition = pageMargin + 22;

        // Subtítulo
        doc.setFontSize(9); doc.setFont(undefined, 'italic'); doc.setTextColor(5, 80, 40);
        doc.text('Jugadores que cumplen reglas de progresión y aún no han sido autorizados', pageWidth / 2, yPosition, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        yPosition += 8;

        const columns = ['DNI', 'NOMBRE', 'CAT. ORIGEN', 'FM Hasta'];
        const baseWidth = pageWidth - 2 * pageMargin;
        const colWidths = {
            'DNI': baseWidth * 0.13,
            'NOMBRE': baseWidth * 0.44,
            'CAT. ORIGEN': baseWidth * 0.27,
            'FM Hasta': baseWidth * 0.16
        };

        const sortedDestCats = Object.keys(potentialsByDestCat).sort(globalCategorySort);

        for (const destCat of sortedDestCats) {
            if (yPosition > pageHeight - pageMargin - 30) { doc.addPage(); yPosition = pageMargin + 5; }

            doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(5, 100, 50);
            doc.text(`PUEDE SUBIR A: ${destCat.toUpperCase()}`, pageMargin, yPosition);
            doc.line(pageMargin, yPosition + 1, pageWidth - pageMargin, yPosition + 1);
            yPosition += 9;

            const rowHeight = 6, headerHeight = 7, fontSize = 8;

            const drawTableHeader = (y) => {
                let x = pageMargin;
                doc.setFontSize(fontSize + 1); doc.setFont(undefined, 'bold');
                columns.forEach(col => {
                    const w = colWidths[col];
                    doc.setFillColor(5, 100, 50); doc.setDrawColor(5, 80, 40); doc.setTextColor(255, 255, 255);
                    doc.rect(x, y, w, headerHeight, 'FD');
                    doc.text(col, x + 2, y + 5);
                    x += w;
                });
                doc.setFont(undefined, 'normal'); doc.setFontSize(fontSize);
                doc.setTextColor(0, 0, 0); doc.setDrawColor(0, 0, 0);
                return y + headerHeight;
            };

            yPosition = drawTableHeader(yPosition);

            for (const player of potentialsByDestCat[destCat]) {
                if (yPosition > pageHeight - pageMargin - rowHeight) {
                    doc.addPage(); yPosition = pageMargin; yPosition = drawTableHeader(yPosition);
                }
                let fmHasta = player['FM Hasta'] || '-';
                if (fmHasta === '1/1/1900' || fmHasta === '-') fmHasta = 'Sin Ficha';

                const rowData = {
                    'DNI': maskDNI(player.DNI),
                    'NOMBRE': player.NOMBRE || '-',
                    'CAT. ORIGEN': player.CATEGORIA || '-',
                    'FM Hasta': fmHasta
                };

                // Colorear según estado FM
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const expDate = parseDateDDMMYYYY(player['FM Hasta']);
                let fillColor = [220, 252, 231]; // verde suave
                let textColor = [0, 0, 0];
                if (!expDate || expDate < today) { fillColor = [254, 226, 226]; }
                else {
                    const thirtyDays = new Date(today); thirtyDays.setDate(today.getDate() + 30);
                    if (expDate <= thirtyDays) fillColor = [255, 237, 213];
                }

                let x = pageMargin;
                columns.forEach(colName => {
                    const w = colWidths[colName];
                    doc.setFillColor(...fillColor); doc.setDrawColor(0, 0, 0); doc.setTextColor(...textColor);
                    doc.rect(x, yPosition, w, rowHeight, 'FD');
                    doc.text(String(rowData[colName]), x + 2, yPosition + 4, { maxWidth: w - 4 });
                    x += w;
                });
                yPosition += rowHeight;
            }
            yPosition += 8;
        }

        drawPDFFooter(doc);
        const tsPot = new Date(); const tsPotStr = `${tsPot.getFullYear()}${String(tsPot.getMonth() + 1).padStart(2, '0')}${String(tsPot.getDate()).padStart(2, '0')}-${String(tsPot.getHours()).padStart(2, '0')}${String(tsPot.getMinutes()).padStart(2, '0')}`;
        doc.save(`Sin_Autorizar_${selectedEquipo.replace(/\s+/g, '_')}_${tsPotStr}.pdf`);
        showToast("PDF de potenciales generado.", "success");
    }

    async function generateExpiringPDF() {
        if (currentlyDisplayedPlayers.length === 0) {
            return showToast("No hay datos para generar el PDF.", "error");
        }
        if (typeof window.jspdf === 'undefined') {
            return showToast("Librería PDF no disponible.", "error");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const today = new Date();
        const formattedDate = today.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const titleText = `Vencimientos de Ficha Médica al ${formattedDate}`;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const logoSize = 15;
        const pageMargin = 15;

        // Cargar logo
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
        }

        const drawHeader = (currentPageTitle) => {
            if (logoImage) {
                const logoWidth = 10;
                doc.addImage(logoImage, 'PNG', pageMargin, pageMargin, logoWidth, logoSize);
                doc.addImage(logoImage, 'PNG', pageWidth - pageMargin - logoWidth, pageMargin, logoWidth, logoSize);
            }
            doc.setFontSize(16);
            doc.text(titleText, pageWidth / 2, pageMargin + logoSize / 2, { align: 'center' });
            return pageMargin + logoSize + 10;
        };

        let yPosition = drawHeader();

        const maskDNI = (dni) => {
            const dniStr = String(dni || '');
            return dniStr.length > 4 ? '****' + dniStr.substring(4) : dniStr;
        };

        const columns = ["DNI", "NOMBRE", "FM Hasta"];
        const colWidths = { "DNI": 30, "NOMBRE": 120, "FM Hasta": 30 };

        // Agrupar igual que en la vista
        const playersByEquipo = {};
        currentlyDisplayedPlayers.forEach(p => {
            const eq = p.EQUIPO || 'SIN EQUIPO';
            if (!playersByEquipo[eq]) playersByEquipo[eq] = [];
            playersByEquipo[eq].push(p);
        });

        const sortedEquipos = Object.keys(playersByEquipo).sort();

        sortedEquipos.forEach((eqName, eqIdx) => {
            if (eqIdx > 0) {
                if (yPosition + 30 > pageHeight) { doc.addPage(); yPosition = drawHeader(); }
                else { yPosition += 10; }
            }

            // Título de Equipo
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(25, 50, 100);
            doc.text(`EQUIPO: ${eqName}`, pageMargin, yPosition);
            yPosition += 8;

            const playersByCat = {};
            playersByEquipo[eqName].forEach(p => {
                const cat = p.CATEGORIA || 'SIN CATEGORIA';
                if (!playersByCat[cat]) playersByCat[cat] = [];
                playersByCat[cat].push(p);
            });

            const sortedCats = Object.keys(playersByCat).sort(globalCategorySort);

            sortedCats.forEach(catName => {
                if (yPosition + 25 > pageHeight) { doc.addPage(); yPosition = drawHeader(); }

                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(60, 60, 60);
                doc.text(`Categoría: ${catName}`, pageMargin + 5, yPosition);
                yPosition += 6;

                const sortedCategoryPlayers = playersByCat[catName].sort((a, b) => {
                    const dateA = parseDateDDMMYYYY(a['FM Hasta']);
                    const dateB = parseDateDDMMYYYY(b['FM Hasta']);
                    if (!dateA && !dateB) return (a.NOMBRE || '').localeCompare(b.NOMBRE || '');
                    if (!dateA) return -1;
                    if (!dateB) return 1;
                    return dateA - dateB;
                });

                const tableData = sortedCategoryPlayers.map(p => {
                    let fmHasta = p['FM Hasta'] || 'Sin Ficha';
                    if (fmHasta === '1/1/1900') fmHasta = 'Sin Ficha';
                    return [
                        maskDNI(p.DNI),
                        p.NOMBRE || '-',
                        fmHasta
                    ];
                });

                doc.autoTable({
                    startY: yPosition,
                    head: [columns],
                    body: tableData,
                    margin: { left: pageMargin + 10 },
                    theme: 'grid',
                    headStyles: { fillColor: [25, 50, 100], textColor: 255 },
                    columnStyles: {
                        0: { cellWidth: colWidths["DNI"] },
                        1: { cellWidth: colWidths["NOMBRE"] },
                        2: { cellWidth: colWidths["FM Hasta"] }
                    },
                    didParseCell: (data) => {
                        if (data.section === 'body') {
                            const player = sortedCategoryPlayers[data.row.index];
                            const expDate = parseDateDDMMYYYY(player['FM Hasta']);
                            const today = new Date(); today.setHours(0, 0, 0, 0);
                            const season = seasonFilter ? seasonFilter.value : player.TEMPORADA;

                            let tournamentEndDate = null;
                            if (season && season.includes('-')) {
                                const years = season.split('-').map(y => y.trim());
                                tournamentEndDate = new Date(parseInt(years[years.length - 1]), 5, 30);
                            } else if (season) {
                                tournamentEndDate = new Date(parseInt(season), 11, 25);
                            }

                            if (!expDate || expDate < today) {
                                data.cell.styles.fillColor = [153, 27, 27]; // Red-800
                                data.cell.styles.textColor = [255, 255, 255];
                            } else if (tournamentEndDate && expDate > tournamentEndDate) {
                                data.cell.styles.fillColor = [22, 163, 74]; // Green-600
                                data.cell.styles.textColor = [255, 255, 255];
                            } else {
                                const thirtyDays = new Date(today); thirtyDays.setDate(today.getDate() + 30);
                                const sixtyDays = new Date(today); sixtyDays.setDate(today.getDate() + 60);

                                if (expDate <= thirtyDays) {
                                    data.cell.styles.fillColor = [249, 115, 22]; // Orange-500
                                    data.cell.styles.textColor = [0, 0, 0];
                                } else if (expDate <= sixtyDays) {
                                    data.cell.styles.fillColor = [254, 240, 138]; // Yellow-200
                                    data.cell.styles.textColor = [0, 0, 0];
                                }
                            }
                        }
                    },
                    didDrawPage: (data) => {
                        yPosition = data.cursor.y;
                    }
                });
                yPosition = doc.lastAutoTable.finalY + 8;
            });
        });

        drawPDFFooter(doc);
        doc.save(`reporte_fichas_${formattedDate}.pdf`);
        showToast("PDF de fichas generado.", "success");
    }

    function drawPDFFooter(doc) {
        const user = auth.currentUser;
        let emailPrefix = user && user.email ? user.email.split('@')[0] : 'usuario';
        // Normalizar nombre: Capitalizar primera letra
        emailPrefix = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);

        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        // Sin comillas y nombre normalizado
        const footerText = `Informe realizado por ${emailPrefix} el ${day}/${month}/${year} a las ${hours}:${minutes}`;

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(128, 128, 128);
            doc.text(footerText, 15, doc.internal.pageSize.getHeight() - 10);
            doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() - 15, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
        }
    }

    // This is the full implementation of generateCategoryPDF, including the nested helpers.
    async function generateTeamPDF(selectedEquipo, includeLicense = false, includePotentials = false) {
        if (typeof window.jspdf === 'undefined') {
            return showToast("Librería PDF no disponible.", "error");
        }

        const playersInTeam = currentlyDisplayedPlayers.filter(p => !p._isCedido && (p.EQUIPO || '').trim().toUpperCase() === selectedEquipo.trim().toUpperCase());

        if (playersInTeam.length === 0) {
            return showToast("No hay jugadores en este equipo para generar el PDF.", "error");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait' });
        const title = `Reporte de Equipo: ${selectedEquipo}`;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageMargin = 15;
        let yPosition = pageMargin;

        const maskDNI = dni => { const s = String(dni || ''); return s.length > 4 ? '****' + s.substring(4) : s; };

        const drawSectionHeader = (text, y, fontSize = 12) => {
            if (y > pageHeight - pageMargin - 20) { doc.addPage(); y = pageMargin; }
            doc.setFontSize(fontSize); doc.setFont(undefined, 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text(text, pageMargin, y);
            doc.setFont(undefined, 'normal');
            return y + 8;
        };

        const drawTable = (columns, data, startY, categoryContext) => {
            let y = startY;
            const rowHeight = 6, headerHeight = 7, fontSize = 8;
            const baseWidth = pageWidth - 2 * pageMargin;
            const columnWidths = {};
            if (includeLicense) {
                columnWidths['DNI'] = baseWidth * 0.12;
                columnWidths['NOMBRE'] = baseWidth * 0.43;
                columnWidths['ESTADO LICENCIA'] = baseWidth * 0.20;
                columnWidths['FM Hasta'] = baseWidth * 0.13;
                columnWidths['Numero'] = baseWidth * 0.12;
            } else {
                columnWidths['DNI'] = baseWidth * 0.15;
                columnWidths['NOMBRE'] = baseWidth * 0.55;
                columnWidths['FM Hasta'] = baseWidth * 0.15;
                columnWidths['Numero'] = baseWidth * 0.15;
            }
            columns.forEach(col => { if (!columnWidths[col]) columnWidths[col] = baseWidth / columns.length; });

            const drawHeader = () => {
                let x = pageMargin;
                doc.setFontSize(fontSize + 1); doc.setFont(undefined, 'bold');
                columns.forEach(col => {
                    const colWidth = columnWidths[col];
                    doc.setFillColor(25, 50, 100); doc.setDrawColor(25, 50, 100); doc.setTextColor(255, 255, 255);
                    doc.rect(x, y, colWidth, headerHeight, 'FD');
                    doc.text(col, x + 2, y + 5);
                    x += colWidth;
                });
                y += headerHeight;
                doc.setFont(undefined, 'normal'); doc.setFontSize(fontSize); doc.setTextColor(0, 0, 0); doc.setDrawColor(0, 0, 0);
            };

            drawHeader();
            data.forEach(player => {
                if (y > pageHeight - pageMargin - rowHeight) { doc.addPage(); y = pageMargin; drawHeader(); }
                const isBaja = player['ESTADO LICENCIA'] === 'Baja';
                const expirationDate = parseDateDDMMYYYY(player['FM Hasta']);
                let fillColor = [255, 255, 255], textColor = [0, 0, 0];

                if (isBaja) { fillColor = [153, 27, 27]; textColor = [255, 255, 255]; }
                else if (player['TIPO'] === 'ENTRENADOR/A') { fillColor = [219, 234, 254]; textColor = [30, 58, 138]; }
                else {
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const season = seasonFilter ? seasonFilter.value : player.TEMPORADA;
                    let tournamentEndDate = null;
                    if (season && season.includes('-')) {
                        const years = season.split('-').map(y => y.trim());
                        tournamentEndDate = new Date(parseInt(years[years.length - 1]), 5, 30);
                    } else if (season) { tournamentEndDate = new Date(parseInt(season), 11, 25); }

                    if (!expirationDate || expirationDate < today) { fillColor = [153, 27, 27]; textColor = [255, 255, 255]; }
                    else if (tournamentEndDate && expirationDate > tournamentEndDate) { fillColor = [22, 163, 74]; textColor = [255, 255, 255]; }
                    else {
                        const thirtyDays = new Date(today); thirtyDays.setDate(today.getDate() + 30);
                        const sixtyDays = new Date(today); sixtyDays.setDate(today.getDate() + 60);
                        if (expirationDate <= thirtyDays) { fillColor = [249, 115, 22]; textColor = [0, 0, 0]; }
                        else if (expirationDate <= sixtyDays) { fillColor = [254, 240, 138]; textColor = [0, 0, 0]; }
                    }
                }

                let x = pageMargin;
                columns.forEach(colName => {
                    const colWidth = columnWidths[colName];
                    doc.setFillColor(...fillColor); doc.setDrawColor(0, 0, 0); doc.setTextColor(...textColor);
                    let cellValue = player[colName] || '-';
                    if (colName === 'DNI') cellValue = maskDNI(player[colName]);
                    else if (colName === 'Numero') cellValue = (player.Numeros && player.Numeros[categoryContext]) || player.Numero || ' ';
                    else if (colName === 'NOMBRE' && isBaja) cellValue = `${player.NOMBRE || ''} - Baja`;
                    if (colName === 'FM Hasta' && (cellValue === '1/1/1900' || cellValue === '-')) cellValue = 'Sin Ficha';

                    doc.rect(x, y, colWidth, rowHeight, 'FD');
                    doc.text(String(cellValue), x + 2, y + 4, { maxWidth: colWidth - 4 });
                    x += colWidth;
                });
                y += rowHeight;
            });
            return y;
        };

        let logoImage = null;
        try {
            logoImage = await new Promise((resolve, reject) => {
                const img = new Image(); img.crossOrigin = 'Anonymous';
                img.onload = () => resolve(img); img.onerror = (err) => reject(err);
                img.src = LOGO_URL;
            });
        } catch (e) { console.error("No se pudo cargar el logo:", e); }

        if (logoImage) {
            const logoSize = 15, logoWidth = 10;
            doc.addImage(logoImage, 'PNG', pageMargin, pageMargin, logoWidth, logoSize);
            doc.addImage(logoImage, 'PNG', pageWidth - pageMargin - logoWidth, pageMargin, logoWidth, logoSize);
        }

        doc.setFontSize(18); doc.setFont(undefined, 'bold');
        doc.text(title, pageWidth / 2, pageMargin + 10, { align: 'center' });
        yPosition = pageMargin + 20;

        // Categorias sorting
        const categories = [...new Set(playersInTeam.map(p => p.CATEGORIA))].sort(globalCategorySort);
        const columns = ['DNI', 'NOMBRE'];
        if (includeLicense) columns.push('ESTADO LICENCIA');
        columns.push('FM Hasta', 'Numero');

        for (const cat of categories) {
            if (yPosition > pageHeight - pageMargin - 30) { doc.addPage(); yPosition = pageMargin + 10; }
            doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.setTextColor(25, 50, 100);
            doc.text(`CATEGORÍA: ${cat.toUpperCase()}`, pageMargin, yPosition);
            doc.line(pageMargin, yPosition + 1, pageWidth - pageMargin, yPosition + 1);
            yPosition += 10;

            const playersInCategory = playersInTeam.filter(p => p.CATEGORIA === cat && !p.esAutorizado && p.TIPO !== 'ENTRENADOR/A').sort((a, b) => {
                const aIsBaja = a['ESTADO LICENCIA'] === 'Baja', bIsBaja = b['ESTADO LICENCIA'] === 'Baja';
                if (aIsBaja && !bIsBaja) return 1; if (!aIsBaja && bIsBaja) return -1;
                const getSortVal = p => {
                    const raw = (p.Numeros && p.Numeros[cat]) || p.Numero;
                    if (raw === undefined || raw === null || raw === '') return Infinity;
                    const s = String(raw).trim();
                    if (s === '0') return -2; if (s === '00') return -1;
                    const n = parseInt(s, 10);
                    return isNaN(n) ? Infinity : n;
                };
                return getSortVal(a) - getSortVal(b);
            });

            const coaches = playersInTeam.filter(p => p.CATEGORIA === cat && p.TIPO === 'ENTRENADOR/A');
            const authorizedPlayers = playersInTeam.filter(p => (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(cat) && p.CATEGORIA !== cat) || (p.esAutorizado && p.CATEGORIA === cat)).sort((a, b) => (a.NOMBRE || '').localeCompare(b.NOMBRE || ''));

            if (playersInCategory.length > 0) {
                yPosition = drawTable(columns, playersInCategory, yPosition, cat);
                yPosition += 5;
            }
            if (coaches.length > 0) {
                yPosition = drawSectionHeader('Entrenadores', yPosition, 10);
                yPosition = drawTable(columns, coaches, yPosition, cat);
                yPosition += 5;
            }
            if (authorizedPlayers.length > 0) {
                yPosition = drawSectionHeader('Jugadores Autorizados (Refuerzos)', yPosition, 10);
                yPosition = drawTable(columns, authorizedPlayers, yPosition, cat);
                yPosition += 5;
            }

            const potentialPlayersList = allPlayers.filter(p => {
                if ((p.TIPO || '').toUpperCase() === 'ENTRENADOR/A') return false;
                if (p.CATEGORIA === cat) return false;
                if (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(cat)) return false;
                if (p.esAutorizado && p.CATEGORIA === cat) return false;
                if (p._isCedido) return false;
                if (String(p.EQUIPO).trim().toUpperCase() !== selectedEquipo.trim().toUpperCase()) return false;
                const possibleDestinations = PROGRESSION_RULES[p.CATEGORIA] || [];
                if (!possibleDestinations.includes(cat)) return false;

                // --- NUEVAS REGLAS DE GÉNERO Y EXCLUSIÓN MUTUA ---
                if (p.genero === 'Masculino' && isFemaleCategory(cat)) return false;
                if (p.genero === 'Femenino' && isMaleCategory(cat)) return false;

                const selectedIsMixed = isMixedCategory(cat);
                const auths = p.categoriasAutorizadas || [];
                if (selectedIsMixed) {
                    const hasHigherFem = auths.some(a => !isMixedCategory(a) && getCategoryOrder(a) > getCategoryOrder(p.CATEGORIA));
                    if (hasHigherFem) return false;
                } else {
                    const isHigher = getCategoryOrder(cat) > getCategoryOrder(p.CATEGORIA);
                    if (isHigher) {
                        const hasMixed = auths.some(a => isMixedCategory(a));
                        if (hasMixed) return false;
                    }
                }
                return true;
            }).sort((a, b) => (a.NOMBRE || '').localeCompare(b.NOMBRE || ''));

            if (includePotentials && potentialPlayersList.length > 0) {
                yPosition = drawSectionHeader('Jugadores Potenciales (Sin Autorizar)', yPosition, 10);
                yPosition = drawTable(columns, potentialPlayersList, yPosition, cat);
                yPosition += 5;
            }

            yPosition += 10;
        }

        drawPDFFooter(doc);
        const tsEq = new Date(); const tsEqStr = `${tsEq.getFullYear()}${String(tsEq.getMonth() + 1).padStart(2, '0')}${String(tsEq.getDate()).padStart(2, '0')}-${String(tsEq.getHours()).padStart(2, '0')}${String(tsEq.getMinutes()).padStart(2, '0')}`;
        doc.save(`Reporte_Equipo_${selectedEquipo}_${tsEqStr}.pdf`);
        showToast("PDF de equipo generado.", "success");
    }

    async function generateCategoryPDF(selectedCategory, includeLicense = false, includePotentials = false) {
        if (typeof window.jspdf === 'undefined') {
            return showToast("Librería PDF no disponible.", "error");
        }

        const playersInCategory = currentlyDisplayedPlayers.filter(p => p.CATEGORIA === selectedCategory && !p.esAutorizado && p.TIPO !== 'ENTRENADOR/A' && !p._isCedido).sort((a, b) => { const aIsBaja = a['ESTADO LICENCIA'] === 'Baja', bIsBaja = b['ESTADO LICENCIA'] === 'Baja'; if (aIsBaja && !bIsBaja) return 1; if (!aIsBaja && bIsBaja) return -1; const getSortVal = p => { const raw = (p.Numeros && p.Numeros[selectedCategory]) || p.Numero; if (raw === undefined || raw === null || raw === '') return Infinity; const s = String(raw).trim(); if (s === '0') return -2; if (s === '00') return -1; const n = parseInt(s, 10); return isNaN(n) ? Infinity : n; }; return getSortVal(a) - getSortVal(b); });
        const coaches = currentlyDisplayedPlayers.filter(p => p.CATEGORIA === selectedCategory && p.TIPO === 'ENTRENADOR/A' && !p._isCedido);
        const authorizedPlayers = currentlyDisplayedPlayers.filter(p => ((p.categoriasAutorizadas && p.categoriasAutorizadas.includes(selectedCategory) && p.CATEGORIA !== selectedCategory) || (p.esAutorizado && p.CATEGORIA === selectedCategory)) && !p._isCedido).sort((a, b) => { const aIsBaja = a['ESTADO LICENCIA'] === 'Baja', bIsBaja = b['ESTADO LICENCIA'] === 'Baja'; if (aIsBaja && !bIsBaja) return 1; if (!aIsBaja && bIsBaja) return -1; return (a.NOMBRE || '').localeCompare(b.NOMBRE || ''); });

        if (playersInCategory.length === 0 && coaches.length === 0 && authorizedPlayers.length === 0) {
            return showToast("No hay jugadores en esta categoría para generar el PDF.", "error");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait' });
        const selectedEquipo = equipoFilter ? equipoFilter.value : '';
        const title = selectedEquipo ? `${selectedCategory} - ${selectedEquipo}` : selectedCategory;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageMargin = 15;
        let yPosition = pageMargin;

        let logoImage = null;
        try {
            logoImage = await new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'Anonymous'; img.onload = () => resolve(img); img.onerror = (err) => reject(err); img.src = LOGO_URL; });
        } catch (e) { console.error("No se pudo cargar el logo para el PDF:", e); }

        if (logoImage) {
            const logoSize = 15, logoWidth = 10;
            doc.addImage(logoImage, 'PNG', pageMargin, pageMargin, logoWidth, logoSize);
            doc.addImage(logoImage, 'PNG', pageWidth - pageMargin - logoWidth, pageMargin, logoWidth, logoSize);
        }

        doc.setFontSize(18);
        doc.text(title, pageWidth / 2, pageMargin + 10, { align: 'center' });
        yPosition = pageMargin + 20;

        const drawSectionHeader = (text, y) => {
            if (y > pageHeight - pageMargin - 20) { doc.addPage(); y = pageMargin; }
            doc.setFontSize(12); doc.setFont(undefined, 'bold');
            doc.setTextColor(0, 0, 0); // Asegurar color negro
            doc.text(text, pageMargin, y);
            doc.setFont(undefined, 'normal');
            return y + 8;
        };

        const columns = ['DNI', 'NOMBRE'];
        if (includeLicense) columns.push('ESTADO LICENCIA');
        columns.push('FM Hasta', 'Numero');

        const drawTableForCategory = (columns, data, startY) => {
            let y = startY;
            const rowHeight = 6, headerHeight = 7, fontSize = 8;
            const baseWidth = pageWidth - 2 * pageMargin;

            // Ajustar anchos proporcionalmente
            const columnWidths = {};
            if (includeLicense) {
                // Si la tabla tiene 4 o 5 columnas y es la de licencia
                columnWidths['DNI'] = baseWidth * 0.12;
                columnWidths['NOMBRE'] = baseWidth * 0.43;
                columnWidths['ESTADO LICENCIA'] = baseWidth * 0.20;
                columnWidths['FM Hasta'] = baseWidth * 0.13;
                columnWidths['Numero'] = baseWidth * 0.12;
            } else {
                columnWidths['DNI'] = baseWidth * 0.15;
                columnWidths['NOMBRE'] = baseWidth * 0.55;
                columnWidths['FM Hasta'] = baseWidth * 0.15;
                columnWidths['Numero'] = baseWidth * 0.15;
            }

            // Fallback robusto para anchos faltantes: Si una columna no está mapeada, 
            // usar el espacio sobrante o dividir equitativamente.
            columns.forEach(col => {
                if (!columnWidths[col]) columnWidths[col] = baseWidth / columns.length;
            });

            // Fallback robusto para anchos faltantes
            columns.forEach(col => {
                if (!columnWidths[col]) columnWidths[col] = baseWidth / columns.length;
            });

            const drawHeader = () => {
                let x = pageMargin;
                doc.setFontSize(fontSize + 1); doc.setFont(undefined, 'bold');
                columns.forEach(col => {
                    const colWidth = columnWidths[col];
                    doc.setFillColor(25, 50, 100);
                    doc.setDrawColor(25, 50, 100);
                    doc.setTextColor(255, 255, 255);
                    doc.rect(x, y, colWidth, headerHeight, 'FD');
                    doc.text(col, x + 2, y + 5, { maxWidth: colWidth - 4, align: 'left' });
                    x += colWidth;
                });
                y += headerHeight;
                doc.setFont(undefined, 'normal'); doc.setFontSize(fontSize);
                doc.setTextColor(0, 0, 0);
                doc.setDrawColor(0, 0, 0);
            };

            const maskDNI = dni => { const s = String(dni || ''); return s.length > 4 ? '****' + s.substring(4) : s; };

            drawHeader();

            data.forEach(player => {
                if (y > pageHeight - pageMargin - rowHeight) { doc.addPage(); y = pageMargin; drawHeader(); }

                const isBaja = player['ESTADO LICENCIA'] === 'Baja';
                const expirationDate = parseDateDDMMYYYY(player['FM Hasta']);
                let fillColor = [255, 255, 255];
                let textColor = [0, 0, 0];

                if (isBaja) {
                    fillColor = [153, 27, 27]; // Red-800
                    textColor = [255, 255, 255];
                } else if (player['TIPO'] === 'ENTRENADOR/A') {
                    fillColor = [219, 234, 254]; // Blue-100
                    textColor = [30, 58, 138]; // Blue-900
                } else {
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const season = seasonFilter ? seasonFilter.value : player.TEMPORADA;

                    let tournamentEndDate = null;
                    if (season && season.includes('-')) {
                        const years = season.split('-').map(y => y.trim());
                        tournamentEndDate = new Date(parseInt(years[years.length - 1]), 5, 30);
                    } else if (season) {
                        tournamentEndDate = new Date(parseInt(season), 11, 25);
                    }

                    if (!expirationDate || expirationDate < today) {
                        fillColor = [153, 27, 27]; // Red-800
                        textColor = [255, 255, 255];
                    } else if (tournamentEndDate && expirationDate > tournamentEndDate) {
                        fillColor = [22, 163, 74]; // Green-600
                        textColor = [255, 255, 255];
                    } else {
                        const thirtyDays = new Date(today); thirtyDays.setDate(today.getDate() + 30);
                        const sixtyDays = new Date(today); sixtyDays.setDate(today.getDate() + 60);

                        if (expirationDate <= thirtyDays) {
                            fillColor = [249, 115, 22]; // Orange-500
                            textColor = [0, 0, 0];
                        } else if (expirationDate <= sixtyDays) {
                            fillColor = [254, 240, 138]; // Yellow-200
                            textColor = [0, 0, 0];
                        }
                    }
                }

                let x = pageMargin;
                doc.setFont(undefined, 'bold');
                columns.forEach(colName => {
                    const colWidth = columnWidths[colName];

                    doc.setFillColor(...fillColor);
                    doc.setDrawColor(0, 0, 0);
                    doc.setTextColor(0, 0, 0);
                    doc.setTextColor(...textColor);

                    let cellValue = player[colName] || '-';
                    if (colName === 'DNI') {
                        cellValue = maskDNI(player[colName]);
                    } else if (colName === 'Numero') {
                        cellValue = (player.Numeros && player.Numeros[selectedCategory]) || player.Numero || ' ';
                    } else if (colName === 'NOMBRE' && isBaja) {
                        cellValue = `${player.NOMBRE || ''} - Baja`;
                    }
                    if (colName === 'FM Hasta' && (cellValue === '1/1/1900' || cellValue === '-')) cellValue = 'Sin Ficha';

                    doc.rect(x, y, colWidth, rowHeight, 'FD');
                    doc.text(String(cellValue), x + 2, y + 4, { maxWidth: colWidth - 4 });
                    x += colWidth;
                });
                doc.setFont(undefined, 'normal');
                y += rowHeight;
            });
            return y;
        };


        if (playersInCategory.length > 0) {
            const teams = [...new Set(playersInCategory.map(p => p.EQUIPO || 'Sin Equipo'))].sort();
            if (teams.length > 1) {
                teams.forEach(team => {
                    const teamPlayers = playersInCategory.filter(p => (p.EQUIPO || 'Sin Equipo') === team);
                    yPosition = drawSectionHeader(`Equipo: ${team}`, yPosition + 5);
                    yPosition = drawTableForCategory(columns, teamPlayers, yPosition);
                });
            } else {
                yPosition = drawTableForCategory(columns, playersInCategory, yPosition);
            }
        }
        if (coaches.length > 0) {
            yPosition = drawSectionHeader('Entrenadores', yPosition + 5);
            yPosition = drawTableForCategory(columns, coaches, yPosition);
        }
        if (authorizedPlayers.length > 0) {
            yPosition = drawSectionHeader('Jugadores Autorizados (Refuerzos)', yPosition + 5);
            yPosition = drawTableForCategory(columns, authorizedPlayers, yPosition);
        }

        // --- JUGADORES POTENCIALES (SIN AUTORIZAR) ---
        const currentFilteredEquipo = equipoFilter ? equipoFilter.value : '';
        if (selectedCategory && currentFilteredEquipo && currentFilteredEquipo !== 'TODOS') {
            const potentialPlayersList = allPlayers.filter(p => {
                const pTipo = (p.TIPO || '').toUpperCase();
                if (pTipo === 'ENTRENADOR/A') return false;
                if (p.CATEGORIA === selectedCategory) return false;
                if (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(selectedCategory)) return false;
                if (p.esAutorizado && p.CATEGORIA === selectedCategory) return false;

                // Excluir cedidos
                if (p._isCedido) return false;

                // Mismo equipo
                if (String(p.EQUIPO).trim().toUpperCase() !== currentFilteredEquipo.trim().toUpperCase()) return false;

                const possibleDestinations = PROGRESSION_RULES[p.CATEGORIA] || [];
                if (!possibleDestinations.includes(selectedCategory)) return false;

                // --- NUEVAS REGLAS DE GÉNERO Y EXCLUSIÓN MUTUA ---
                if (p.genero === 'Masculino' && isFemaleCategory(selectedCategory)) return false;
                if (p.genero === 'Femenino' && isMaleCategory(selectedCategory)) return false;

                const selectedIsMixed = isMixedCategory(selectedCategory);
                const auths = p.categoriasAutorizadas || [];
                if (selectedIsMixed) {
                    const hasHigherFem = auths.some(a => !isMixedCategory(a) && getCategoryOrder(a) > getCategoryOrder(p.CATEGORIA));
                    if (hasHigherFem) return false;
                } else {
                    const isHigher = getCategoryOrder(selectedCategory) > getCategoryOrder(p.CATEGORIA);
                    if (isHigher) {
                        const hasMixed = auths.some(a => isMixedCategory(a));
                        if (hasMixed) return false;
                    }
                }
                return true;
            }).sort((a, b) => (a.NOMBRE || '').localeCompare(b.NOMBRE || ''));

            if (includePotentials && potentialPlayersList.length > 0) {
                // Forzar espacio o nueva página si queda poco espacio
                if (yPosition > doc.internal.pageSize.getHeight() - 40) {
                    doc.addPage();
                    yPosition = pageMargin;
                }
                yPosition = drawSectionHeader('Jugadores Potenciales (Sin Autorizar)', yPosition + 10);
                // Usar las mismas columnas que el resto del reporte (heredado de includeLicense)
                yPosition = drawTableForCategory(columns, potentialPlayersList, yPosition);
            }
        }

        drawPDFFooter(doc);

        // Personalizar nombre de archivo según equipo
        let fileName = selectedCategory;
        if (selectedEquipo === 'DEFENSOR SPORTING') {
            fileName += ' DSC';
        } else if (selectedEquipo === 'FUSIONADO') {
            fileName += ' FUS';
        }

        const tsCat = new Date(); const tsCatStr = `${tsCat.getFullYear()}${String(tsCat.getMonth() + 1).padStart(2, '0')}${String(tsCat.getDate()).padStart(2, '0')}-${String(tsCat.getHours()).padStart(2, '0')}${String(tsCat.getMinutes()).padStart(2, '0')}`;
        doc.save(`${fileName}_${tsCatStr}.pdf`);
        showToast("PDF generado.", "success");
    }

    // --- INICIALIZACIÓN ---
    initializeAuth();
});