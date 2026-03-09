/**
 * Lógica principal de la UI.
 */
import { parseCSV, filterLatestRecords } from './utils.js';
import { logAction, uploadSeasonData, searchRecordsBySeason, deleteSeasonRecord } from './firebase-service.js';

const auth = firebase.auth();

// Elementos del DOM
const loginSection = document.getElementById('loginSection');
const choiceSection = document.getElementById('choiceSection');
const uploadSection = document.getElementById('uploadSection');
const deleteSection = document.getElementById('deleteSection');

const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const seasonInput = document.getElementById('seasonInput');
const csvFile = document.getElementById('csvFile');
const deleteSeasonInput = document.getElementById('deleteSeasonInput');
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
    seasonInput.classList.remove('hidden');
    document.getElementById('uploadTitle').textContent = 'Subir Registros de Temporada';
    performActionButton.textContent = 'Subir a Firebase';
    showUIFeedback('Sube un CSV para añadir nuevos registros de temporada.', '');
});

document.getElementById('choiceDeleteButton').addEventListener('click', () => {
    showSection(deleteSection);
    deleteSeasonInput.value = '';
    deleteDniInput.value = '';
    recordsList.innerHTML = '';
});

document.getElementById('backButton').addEventListener('click', () => {
    showSection(choiceSection);
    csvFile.value = '';
    seasonInput.value = '';
    performActionButton.disabled = true;
    parsedData = [];
    currentAction = null;
});

document.getElementById('backFromDeleteButton').addEventListener('click', () => showSection(choiceSection));

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
        const season = seasonInput.value.trim();
        if (!season) {
            showUIFeedback('Ingresa la temporada.', 'error');
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
    const season = deleteSeasonInput.value.trim();
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
