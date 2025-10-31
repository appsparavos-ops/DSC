document.addEventListener('DOMContentLoaded', function() {
    // Configuración de Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyANWXQvhHpF0LCYjz4AXi3MkcP798PqRfA",
        authDomain: "dsc24-aa5a1.firebaseapp.com",
        databaseURL: "https://dsc24-aa5a1-default-rtdb.firebaseio.com",
        projectId: "dsc24-aa5a1",
        storageBucket: "dsc24-aa5a1.appspot.com",
        messagingSenderId: "798100493177",
        appId: "1:798100493177:web:8e2ae324f8b5cb893a55a8"
    };

    // Inicialización de Firebase
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();
    const auth = firebase.auth();

    // --- ELEMENTOS DEL DOM ---
    const loginContainer = document.getElementById('login-container');
    const mainContainer = document.getElementById('main-container');
    const loginForm = document.getElementById('login-form');
    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const loginErrorMessage = document.getElementById('login-error-message');
    const logoutButton = document.getElementById('logout-button');
    const bitacoraTableBody = document.getElementById('bitacora-table-body');
    const messageArea = document.getElementById('message-area');
    const pageSizeSelect = document.getElementById('page-size');
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    const pageIndicator = document.getElementById('page-indicator');
    const exportPdfButton = document.getElementById('export-pdf');
    const deleteAllButton = document.getElementById('delete-all');

    // --- ESTADO DE LA APLICACIÓN ---
    let allLogEntries = [];
    let currentPage = 1;
    let pageSize = 50;

    // --- FUNCIONES UTILITARIAS ---
    function showMessage(message, isError = false) {
        messageArea.textContent = message;
        messageArea.className = `text-center p-4 mb-4 rounded-lg ${isError ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`;
        messageArea.style.display = 'block';
    }

    function hideMessage() {
        messageArea.style.display = 'none';
    }

    function handleError(error) {
        console.error("Error:", error);
        showMessage(`Error: ${error.message}`, true);
    }

    function showLoginScreen(message) {
        mainContainer.style.display = 'none';
        loginContainer.style.display = 'flex';
        loginEmailInput.value = '';
        loginPasswordInput.value = '';
        if (message) {
            loginErrorMessage.textContent = message;
            loginErrorMessage.classList.remove('hidden');
        } else {
            loginErrorMessage.classList.add('hidden');
        }
    }

    function showMainContent() {
        loginContainer.style.display = 'none';
        mainContainer.style.display = 'block';
    }

    // --- LÓGICA DE BITÁCORA ---
    function getTimestampKey() {
        const now = new Date();
        const timestamp = now.getFullYear().toString() +
               String(now.getMonth() + 1).padStart(2, '0') +
               String(now.getDate()).padStart(2, '0') +
               String(now.getHours()).padStart(2, '0') +
               String(now.getMinutes()).padStart(2, '0') +
               String(now.getSeconds()).padStart(2, '0');
        const randomPart = Math.random().toString(36).substring(2, 7);
        return `${timestamp}-${randomPart}`;
    }

    function logAdminLogin(user) {
        if (!user) return;
        const timestampKey = getTimestampKey();
        const logEntry = {
            usuario: user.email,
            uid: user.uid,
            accion: 'login_admin_bitacora',
            fecha: new Date().toISOString(),
            detalles: { userAgent: navigator.userAgent }
        };
        const logRef = database.ref(`/bitacora/${timestampKey}`);
        logRef.set(logEntry).catch(error => console.error("Error al escribir en la bitácora:", error));
    }

    // --- LÓGICA DE RENDERIZADO Y PAGINACIÓN ---
    function renderTableRows(entries) {
        bitacoraTableBody.innerHTML = '';
        if (entries.length === 0) {
            if (allLogEntries.length > 0) {
                 showMessage('No hay registros en esta página.', false);
            } // Si no hay entradas en absoluto, el mensaje ya se muestra desde loadBitacoraData
            return;
        }
        hideMessage();
        entries.forEach(entry => {
            const row = document.createElement('tr');
            const fecha = new Date(entry.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' });
            
            let detallesHtml = '<div class="text-xs space-y-1">';
            if (entry.detalles && typeof entry.detalles === 'object' && Object.keys(entry.detalles).length > 0) {
                Object.entries(entry.detalles).forEach(([key, value]) => {
                    const formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
                    detallesHtml += `<div><span class="font-semibold">${formattedKey}:</span> ${value}</div>`;
                });
            } else {
                detallesHtml += '<span>-</span>';
            }
            detallesHtml += '</div>';

            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${fecha}</td>
                <td class="px-6 py-4 text-sm text-gray-800 font-medium">${entry.usuario || 'N/A'}</td>
                <td class="px-6 py-4 text-sm text-gray-600">${entry.accion || 'N/A'}</td>
                <td class="px-6 py-4 text-sm text-gray-600">${detallesHtml}</td>
            `;
            bitacoraTableBody.appendChild(row);
        });
    }

    function updatePaginationControls(totalPages) {
        pageIndicator.textContent = `Página ${currentPage} de ${totalPages}`;
        prevPageButton.disabled = currentPage === 1;
        nextPageButton.disabled = currentPage === totalPages;
        prevPageButton.classList.toggle('opacity-50', currentPage === 1);
        nextPageButton.classList.toggle('opacity-50', currentPage === totalPages);
    }

    function renderCurrentPage() {
        const totalEntries = allLogEntries.length;
        const totalPages = Math.ceil(totalEntries / pageSize) || 1;
        currentPage = Math.max(1, Math.min(currentPage, totalPages));

        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageEntries = allLogEntries.slice(start, end);

        renderTableRows(pageEntries);
        updatePaginationControls(totalPages);
    }

    // --- LÓGICA DE CARGA DE DATOS ---
    function loadBitacoraData() {
        const bitacoraRef = database.ref('/bitacora');
        showMessage('Cargando registros...');

        bitacoraRef.orderByKey().limitToLast(500).once('value').then(snapshot => {
            if (!snapshot.exists()) {
                allLogEntries = [];
                showMessage('No se encontraron registros en la bitácora.');
            } else {
                const data = snapshot.val();
                allLogEntries = Object.values(data).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                hideMessage();
            }
            currentPage = 1;
            pageSize = parseInt(pageSizeSelect.value, 10);
            renderCurrentPage();
        }).catch(handleError);
    }

    // --- LÓGICA DE AUTENTICACIÓN ---
    function checkAdminRole(user) {
        database.ref('admins/' + user.uid).once('value').then(snapshot => {
            if (snapshot.exists()) {
                logAdminLogin(user);
                showMainContent();
                loadBitacoraData();
            } else {
                auth.signOut();
                showLoginScreen('Acceso denegado. Solo los administradores pueden ver esta página.');
            }
        }).catch(handleError);
    }

    auth.onAuthStateChanged(user => {
        if (user) {
            checkAdminRole(user);
        } else {
            showLoginScreen('Por favor, inicie sesión para ver la bitácora.');
        }
    });

    // --- MANEJO DE EVENTOS ---
    loginForm.addEventListener('submit', e => {
        e.preventDefault();
        loginErrorMessage.classList.add('hidden');
        auth.signInWithEmailAndPassword(loginEmailInput.value, loginPasswordInput.value).catch(error => {
            loginErrorMessage.textContent = 'Credenciales incorrectas. Intente de nuevo.';
            loginErrorMessage.classList.remove('hidden');
        });
    });

    logoutButton.addEventListener('click', () => auth.signOut());

    pageSizeSelect.addEventListener('change', () => {
        pageSize = parseInt(pageSizeSelect.value, 10);
        currentPage = 1;
        renderCurrentPage();
    });

    nextPageButton.addEventListener('click', () => {
        const totalPages = Math.ceil(allLogEntries.length / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            renderCurrentPage();
        }
    });

    prevPageButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderCurrentPage();
        }
    });

    exportPdfButton.addEventListener('click', () => {
        if (allLogEntries.length === 0) {
            alert("No hay registros para exportar.");
            return;
        }

        const primerRegistro = allLogEntries[allLogEntries.length - 1];
        const ultimoRegistro = allLogEntries[0];

        const fechaPrimerRegistro = new Date(primerRegistro.fecha).toLocaleDateString('es-ES');
        const fechaUltimoRegistro = new Date(ultimoRegistro.fecha).toLocaleDateString('es-ES');

        const titulo = `Bitácora de ${fechaUltimoRegistro} a ${fechaPrimerRegistro}`;
        const nombreArchivo = `Bitacora de ${fechaUltimoRegistro} a ${fechaPrimerRegistro}.pdf`;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });

        doc.text(titulo, 14, 20);

        const tableData = allLogEntries.map(entry => {
            const fecha = new Date(entry.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' });
            const detalles = entry.detalles ? Object.entries(entry.detalles).map(([k, v]) => `${k}: ${v}`).join('\n') : '-';
            return [fecha, entry.usuario, entry.accion, detalles];
        });

        doc.autoTable({
            head: [['Fecha', 'Usuario', 'Acción', 'Detalles']],
            body: tableData,
            startY: 30,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [22, 160, 133] },
            columnStyles: { 3: { cellWidth: 'auto' } }
        });

        doc.save(nombreArchivo);
    });

    deleteAllButton.addEventListener('click', () => {
        const confirmation = prompt("ADVERTENCIA: Esta acción es irreversible.\nPara confirmar, escribe la palabra BORRAR aquí:");
        if (confirmation === 'BORRAR') {
            if (confirm("ÚLTIMA CONFIRMACIÓN:\n¿Estás absolutamente seguro de que quieres borrar TODOS los registros de la bitácora?")) {
                showMessage('Borrando registros...');
                database.ref('/bitacora').remove()
                    .then(() => {
                        allLogEntries = [];
                        renderCurrentPage();
                        showMessage('Todos los registros han sido borrados.');
                    })
                    .catch(handleError);
            }
        } else {
            alert("Borrado cancelado. No se escribió la palabra de confirmación correcta.");
        }
    });
});
