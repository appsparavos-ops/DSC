document.addEventListener('DOMContentLoaded', function() {

    // --- CONFIGURACIÓN DE FIREBASE ---
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

    // --- ELEMENTOS DEL DOM ---
    // Formularios
    const loginForm = document.getElementById('login-form');
    const uploaderContainer = document.getElementById('uploader-container');

    // Campos de Login
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('login-button');
    const loginStatusMessage = document.getElementById('login-status-message');

    // Contenido del Uploader
    const userEmailDisplay = document.getElementById('user-email');
    const logoutButton = document.getElementById('logout-button');
    const dateInput = document.getElementById('game-date');
    const opponentInput = document.getElementById('opponent-name');
    const seasonInput = document.getElementById('season');
    const categorySelector = document.getElementById('category-selector');
    const resultInput = document.getElementById('match-result');
    const fileInput = document.getElementById('csv-file');
    const uploadButton = document.getElementById('upload-button');
    const statusMessage = document.getElementById('status-message');

    // --- LÓGICA DE AUTENTICACIÓN ---

    // Observador de estado de autenticación
    auth.onAuthStateChanged(user => {
        if (user) {
            // Usuario está conectado
            loginForm.style.display = 'none';
            uploaderContainer.style.display = 'block';
            userEmailDisplay.textContent = `Conectado como: ${user.email}`;
            setupUploaderEventListeners();
        } else {
            // Usuario no está conectado
            loginForm.style.display = 'block';
            uploaderContainer.style.display = 'none';
            userEmailDisplay.textContent = '';
        }
    });

    // Event listener para el botón de login
    loginButton.addEventListener('click', () => {
        const email = emailInput.value;
        const password = passwordInput.value;

        if (!email || !password) {
            updateLoginStatus('Por favor, introduce email y contraseña.', true);
            return;
        }

        auth.signInWithEmailAndPassword(email, password)
            .then(userCredential => {
                console.log('Login exitoso:', userCredential.user.email);
                updateLoginStatus('', false);
            })
            .catch(error => {
                console.error('Error de login:', error.code, error.message);
                updateLoginStatus(`Error: ${error.message}`, true);
            });
    });

    // Event listener para el botón de logout
    logoutButton.addEventListener('click', () => {
        auth.signOut().then(() => {
            console.log('Usuario desconectado.');
            emailInput.value = '';
            passwordInput.value = '';
        }).catch(error => {
            console.error('Error al cerrar sesión:', error);
        });
    });

    // --- LÓGICA DE SUBIDA ---
    function setupUploaderEventListeners() {
        uploadButton.addEventListener('click', handleUpload);
        seasonInput.addEventListener('change', handleSeasonChange);
    }

    async function handleSeasonChange() {
        const season = seasonInput.value.trim();
        if (season) {
            try {
                const categories = await fetchCategoriesForSeason(season);
                populateCategorySelector(categories);
            } catch (error) {
                console.error("Error fetching categories: ", error);
                populateCategorySelector([]); // Reset selector on error
            }
        } else {
            populateCategorySelector([]); // Reset selector if season is cleared
        }
    }

    function fetchCategoriesForSeason(season) {
        const ref = database.ref(`/registrosPorTemporada/${season}`);
        return ref.once('value').then(snapshot => {
            const categories = new Set();
            if (snapshot.exists()) {
                snapshot.forEach(childSnapshot => {
                    const data = childSnapshot.val();
                    if (data && data.CATEGORIA) {
                        categories.add(data.CATEGORIA);
                    }
                });
            }
            return [...categories].sort();
        });
    }

    function populateCategorySelector(categories) {
        categorySelector.innerHTML = ''; // Clear existing options
        if (categories.length > 0) {
            categorySelector.disabled = false;
            const defaultOption = document.createElement('option');
            defaultOption.value = "";
            defaultOption.textContent = "-- Selecciona una categoría --";
            categorySelector.appendChild(defaultOption);

            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                categorySelector.appendChild(option);
            });
        } else {
            categorySelector.disabled = true;
            const defaultOption = document.createElement('option');
            defaultOption.value = "";
            defaultOption.textContent = "-- No hay categorías para esta temporada --";
            categorySelector.appendChild(defaultOption);
        }
    }

    function handleUpload() {
        const date = dateInput.value;
        const opponent = opponentInput.value.trim();
        const season = seasonInput.value.trim();
        const category = categorySelector.value;
        const result = resultInput.value.trim();
        const file = fileInput.files[0];

        if (!date || !opponent || !season || !category || !result || !file) {
            updateStatus('Por favor, completa todos los campos y selecciona un archivo.', true);
            return;
        }

        updateStatus('Procesando archivo CSV...', false);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            delimiter: ';',
            complete: function(results) {
                if (!results.data || results.data.length === 0) {
                    updateStatus('El archivo CSV está vacío o tiene un formato incorrecto.', true);
                    return;
                }
                uploadCsvData(results.data, date, opponent, season, category, result);
            },
            error: function(error) {
                updateStatus(`Error al leer el archivo CSV: ${error.message}`, true);
            }
        });
    }

    function uploadCsvData(csvData, date, opponent, season, category, result) {
        const uploadPromises = [];
        let processedCount = 0;
        let skippedCount = 0;

        csvData.forEach(row => {
            const playerDNI = row.DNI ? String(row.DNI).trim() : null;

            if (!playerDNI) {
                skippedCount++;
                console.warn('Fila ignorada: DNI vacío para el jugador', row.Jugador);
                return;
            }

            const gameStatsUC = {
                FECHA: date,
                OPONENTE: opponent,
                TEMPORADA: season,
                CATEGORIA: category,
                RESULTADO: result
            };

            for (const header in row) {
                const headerUC = header.toUpperCase();
                if (headerUC !== 'NUM' && headerUC !== 'JUGADOR' && headerUC !== 'DNI') {
                    let value = row[header];

                    // Corregir formato de tiempo: Si viene como HH:MM:SS pero es MM:SS
                    if (typeof value === 'string' && value.includes(':')) {
                        const parts = value.split(':');
                        if (parts.length === 3) {
                            // Caso 00:MM:SS -> MM:SS (formato duración Excel)
                            if (parseInt(parts[0], 10) === 0) {
                                value = `${parts[1]}:${parts[2]}`;
                            }
                            // Caso MM:SS:00 -> MM:SS (formato hora Excel, ej: 12:30:00)
                            else if (parseInt(parts[2], 10) === 0) {
                                value = `${parts[0]}:${parts[1]}`;
                            }
                        }
                    }

                    if (typeof value === 'string' && !value.includes(':') && !value.includes('%')) {
                        const num = Number(value.replace(',', '.'));
                        if (!isNaN(num)) {
                            value = num;
                        }
                    }
                    gameStatsUC[headerUC] = value;
                }
            }

            const playerGamesRef = database.ref(`/estadisticas_partidos/${playerDNI}`);
            uploadPromises.push(playerGamesRef.push(gameStatsUC));
            processedCount++;
        });

        if (uploadPromises.length === 0) {
            updateStatus('No se encontraron jugadores con DNI en el archivo. No se subió nada.', true);
            return;
        }

        updateStatus(`Subiendo estadísticas de ${processedCount} jugador(es) a Firebase...`, false);

        Promise.all(uploadPromises)
            .then(() => {
                let successMessage = `¡Éxito! Se subieron las estadísticas de ${processedCount} jugador(es).`;
                if (skippedCount > 0) {
                    successMessage += ` Se ignoraron ${skippedCount} fila(s) por no tener DNI.`;
                }
                updateStatus(successMessage, false);
                // Limpiar formulario
                dateInput.value = '';
                opponentInput.value = '';
                seasonInput.value = '';
                categorySelector.value = '';
                resultInput.value = '';
                fileInput.value = '';
                populateCategorySelector([]); // Reset category selector
            })
            .catch(error => {
                updateStatus(`Error al subir a Firebase: ${error.message}`, true);
            });
    }

    function updateStatus(message, isError) {
        statusMessage.textContent = message;
        statusMessage.className = isError 
            ? 'mt-6 text-center text-red-600' 
            : 'mt-6 text-center text-green-600';
    }

    function updateLoginStatus(message, isError) {
        loginStatusMessage.textContent = message;
        loginStatusMessage.className = isError 
            ? 'mt-6 text-center text-red-600' 
            : 'mt-6 text-center text-green-600';
    }
});