/**
 * Lógica principal de la UI.
 */
import { parseCSV, filterLatestRecords } from './utils.js';
import { logAction, uploadSeasonData, searchRecordsBySeason, deleteSeasonRecord, getSeasons, getUserPreference } from './firebase-service.js';

const auth = firebase.auth();

// Elementos del DOM
const loginSection = document.getElementById('loginSection');
const choiceSection = document.getElementById('choiceSection');
const uploadSection = document.getElementById('uploadSection');
const deleteSection = document.getElementById('deleteSection');

const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const csvFile = document.getElementById('csvFile');
const seasonSelect = document.getElementById('seasonSelect');
const seasonInput = document.getElementById('seasonInput');
const deleteSeasonSelect = document.getElementById('deleteSeasonSelect');
const deleteDniInput = document.getElementById('deleteDniInput');

const loginMessage = document.getElementById('loginMessage');
const messageDiv = document.getElementById('message');
const deleteMessageDiv = document.getElementById('deleteMessage');
const recordsList = document.getElementById('recordsList');

const performActionButton = document.getElementById('performActionButton');

let parsedData = [];
let currentAction = null;

// Auth Observer
auth.onAuthStateChanged(user => {
    if (user) {
        showSection(choiceSection);
        clearMessages();
        loadSeasons(user.uid);
    } else {
        showSection(loginSection);
        emailInput.value = '';
        passwordInput.value = '';
    }
});

// Navigation Functions
function showSection(section) {
    [loginSection, choiceSection, uploadSection, deleteSection].forEach(s => s.classList.add('hidden'));
    section.classList.remove('hidden');
}

function clearMessages() {
    [loginMessage, messageDiv, deleteMessageDiv].forEach(m => {
        m.textContent = '';
        m.className = '';
    });
}

function showUIFeedback(msg, type = '', target = messageDiv) {
    target.textContent = msg;
    target.className = type;
}

// Event Listeners
document.getElementById('loginButton').addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
        showUIFeedback('Por favor, introduce email y contraseña.', 'error', loginMessage);
        return;
    }
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        logAction('login', { email: userCredential.user.email, origin: 'actualizar.html' });
    } catch (error) {
        showUIFeedback(`Error: ${error.message}`, 'error', loginMessage);
    }
});

document.getElementById('logoutButton').addEventListener('click', () => auth.signOut());

document.getElementById('choiceUploadButton').addEventListener('click', () => {
    currentAction = 'upload';
    showSection(uploadSection);
    // seasonSelect ya es visible por defecto en uploadSection (como parte de seasonContainer)
    document.getElementById('uploadTitle').textContent = 'Subir Registros de Temporada';
    performActionButton.textContent = 'Subir a Firebase';
    showUIFeedback('Sube un CSV para añadir nuevos registros de temporada.', '');
});

document.getElementById('choiceDeleteButton').addEventListener('click', () => {
    showSection(deleteSection);
    // deleteSeasonSelect se mantiene con lo cargado en loadSeasons
    deleteDniInput.value = '';
    recordsList.innerHTML = '';
});

document.getElementById('backButton').addEventListener('click', () => {
    showSection(choiceSection);
    csvFile.value = '';
    seasonInput.value = '';
    seasonSelect.value = '';
    seasonInput.classList.add('hidden');
    performActionButton.disabled = true;
    parsedData = [];
    currentAction = null;
});

document.getElementById('backFromDeleteButton').addEventListener('click', () => showSection(choiceSection));

seasonSelect.addEventListener('change', () => {
    if (seasonSelect.value === 'new') {
        seasonInput.classList.remove('hidden');
        seasonInput.focus();
    } else {
        seasonInput.classList.add('hidden');
        seasonInput.value = '';
    }
});

csvFile.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        performActionButton.disabled = false;
        showUIFeedback('Archivo seleccionado. Procesando...', '');
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                parsedData = parseCSV(e.target.result, currentAction);
                showUIFeedback(`CSV cargado: ${parsedData.length} filas encontradas.`, 'success');
            } catch (error) {
                showUIFeedback(`Error: ${error.message}`, 'error');
                performActionButton.disabled = true;
            }
        };
        reader.readAsText(file, 'ISO-8859-1');
    }
});

performActionButton.addEventListener('click', async () => {
    if (parsedData.length === 0) {
        showUIFeedback('Selecciona un archivo CSV.', 'error');
        return;
    }

    if (currentAction === 'upload') {
        let season = seasonSelect.value;
        if (season === 'new') {
            season = seasonInput.value.trim();
        }

        if (!season) {
            showUIFeedback('Por favor, selecciona o ingresa una temporada.', 'error');
            return;
        }

        performActionButton.disabled = true;
        showUIFeedback('Filtrando y subiendo datos...', '');

        try {
            const filtered = filterLatestRecords(parsedData);
            const { processedCount, skippedCount } = await uploadSeasonData(filtered, season);
            let msg = `¡${processedCount} registros procesados!`;
            if (skippedCount > 0) msg += ` (${skippedCount} omitidos)`;
            showUIFeedback(msg, 'success');
        } catch (error) {
            showUIFeedback(`Error: ${error.message}`, 'error');
        } finally {
            performActionButton.disabled = false;
        }
    }
});

document.getElementById('searchRecordsButton').addEventListener('click', async () => {
    const season = deleteSeasonSelect.value;
    const query = deleteDniInput.value.trim();
    if (!season || !query) {
        showUIFeedback('Ingresa Temporada y DNI/Nombre.', 'error', deleteMessageDiv);
        return;
    }

    showUIFeedback('Buscando...', '', deleteMessageDiv);
    recordsList.innerHTML = '';

    try {
        const records = await searchRecordsBySeason(season, query);
        if (records.length === 0) {
            showUIFeedback('Sin registros que coincidan.', 'error', deleteMessageDiv);
            return;
        }

        showUIFeedback(`${records.length} registros encontrados.`, 'success', deleteMessageDiv);

        records.forEach(record => {
            const div = document.createElement('div');
            div.className = 'record-item';

            const dni = record._dni || record.DNI || 'N/A';
            const type = record._tipo || 'jugadores';
            const pushId = record._pushId;
            const nombre = record.NOMBRE || 'N/A';

            div.innerHTML = `
                <strong>Nombre:</strong> ${nombre}<br>
                <strong>DNI:</strong> ${dni}<br>
                <strong>ID:</strong> ${pushId}<br>
                <strong>Categoría:</strong> ${record.CATEGORIA || 'N/A'}<br>
                <strong>Equipo:</strong> ${record.EQUIPO || 'N/A'}
            `;

            const delBtn = document.createElement('button');
            delBtn.textContent = 'Eliminar';
            delBtn.className = 'btn-danger';
            delBtn.onclick = async () => {
                if (confirm(`¿Eliminar registro de ${nombre}?`)) {
                    await deleteSeasonRecord(season, dni, type, pushId);
                    div.remove();
                    showUIFeedback('Eliminado.', 'success', deleteMessageDiv);
                }
            };
            div.appendChild(delBtn);
            recordsList.appendChild(div);
        });
    } catch (error) {
        showUIFeedback(`Error: ${error.message}`, 'error', deleteMessageDiv);
    }
});

async function loadSeasons(uid) {
    try {
        const [seasons, prefSeason] = await Promise.all([
            getSeasons(),
            getUserPreference(uid)
        ]);

        // Guardar la opción "Nueva"
        const newOption = seasonSelect.querySelector('option[value="new"]');
        seasonSelect.innerHTML = '';
        deleteSeasonSelect.innerHTML = '';
        
        if (seasons.length === 0) {
            const opt = document.createElement('option');
            opt.value = "";
            opt.textContent = "Sin temporadas";
            seasonSelect.appendChild(opt);

            const optDel = document.createElement('option');
            optDel.value = "";
            optDel.textContent = "Sin temporadas";
            deleteSeasonSelect.appendChild(optDel);
        } else {
            seasons.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                seasonSelect.appendChild(opt);

                const optDel = document.createElement('option');
                optDel.value = s;
                optDel.textContent = s;
                deleteSeasonSelect.appendChild(optDel);
            });
        }
        seasonSelect.appendChild(newOption);

        if (prefSeason && seasons.includes(prefSeason)) {
            seasonSelect.value = prefSeason;
            deleteSeasonSelect.value = prefSeason;
        } else if (seasons.length > 0) {
            seasonSelect.value = seasons[0];
            deleteSeasonSelect.value = seasons[0];
        } else {
            seasonSelect.value = 'new';
            seasonInput.classList.remove('hidden');
        }
        
    } catch (error) {
        console.error("Error cargando temporadas:", error);
        showUIFeedback('Error al cargar temporadas.', 'error');
    }
}
