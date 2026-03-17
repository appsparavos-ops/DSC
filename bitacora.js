document.addEventListener('DOMContentLoaded', function() {
    // Inicialización de Firebase (ya con firebaseConfig de firebase-config.js)
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
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


    // --- LÓGICA DE RENDERIZADO Y PAGINACIÓN ---
    function getActionBadgeClass(action) {
        const a = (action || '').toUpperCase();
        if (a.includes('MODIFICACION') || a.includes('UPDATE')) return 'bg-blue-100 text-blue-700';
        if (a.includes('CREACION') || a.includes('IMPORTACION')) return 'bg-green-100 text-green-700';
        if (a.includes('ELIMINACION') || a.includes('BORRADO')) return 'bg-red-100 text-red-700';
        if (a.includes('VISTA') || a.includes('CONSULTA')) return 'bg-purple-100 text-purple-700';
        if (a.includes('LOGIN')) return 'bg-gray-100 text-gray-700';
        return 'bg-amber-100 text-amber-700';
    }

    function renderTableRows(entries) {
        bitacoraTableBody.innerHTML = '';
        if (entries.length === 0) {
            if (allLogEntries.length > 0) {
                 showMessage('No hay registros en esta página.', false);
            }
            return;
        }
        hideMessage();
        entries.forEach((entry, index) => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50/80 transition-all cursor-pointer';
            const realIndex = (currentPage - 1) * pageSize + index;
            row.onclick = () => showDetailModal(allLogEntries[realIndex]);

            const fecha = new Date(entry.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' });
            
            const badgeClass = getActionBadgeClass(entry.accion);
            
            let resumenDetalles = '';
            if (entry.detalles) {
                if (entry.detalles.entidad && entry.detalles.registroId) {
                    resumenDetalles = `<span class="font-bold text-gray-900">${entry.detalles.entidad}:</span> ${entry.detalles.registroId}`;
                } else if (entry.detalles.view) {
                    resumenDetalles = `<span class="italic text-gray-500">${entry.detalles.view}</span>`;
                } else if (typeof entry.detalles === 'object') {
                    const keys = Object.keys(entry.detalles).slice(0, 2);
                    resumenDetalles = keys.map(k => `${k}: ${entry.detalles[k]}`).join(', ');
                }
            }

            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-[11px] font-mono text-gray-400">${fecha}</td>
                <td class="px-6 py-4 text-sm text-gray-800">
                    <div class="font-bold">${entry.usuario || '?' }</div>
                    <div class="text-[10px] text-gray-400">${entry.contexto?.url || ''}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="action-badge ${badgeClass}">${entry.accion || 'N/A'}</span>
                </td>
                <td class="px-6 py-4 text-xs text-gray-600">
                    <div class="flex items-center justify-between gap-2">
                        <div class="truncate max-w-[200px]">${resumenDetalles || '-'}</div>
                        <button class="text-blue-600 hover:text-blue-800 font-bold uppercase text-[9px] tracking-widest bg-blue-50 px-2 py-1 rounded">Ver+</button>
                    </div>
                </td>
            `;
            bitacoraTableBody.appendChild(row);
        });
    }

    // --- MODAL DE DETALLES ---
    window.showDetailModal = function(entry) {
        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('detail-modal-content');
        
        let html = `
            <div class="grid grid-cols-2 gap-4 text-sm mb-6 bg-gray-50 p-4 rounded-xl">
                <div><label class="block text-[10px] uppercase font-bold text-gray-400">Fecha</label>${new Date(entry.fecha).toLocaleString()}</div>
                <div><label class="block text-[10px] uppercase font-bold text-gray-400">Usuario</label>${entry.usuario}</div>
                <div><label class="block text-[10px] uppercase font-bold text-gray-400">Acción</label>${entry.accion}</div>
                <div><label class="block text-[10px] uppercase font-bold text-gray-400">Navegador</label><span class="text-[10px]">${entry.contexto?.userAgent || '-'}</span></div>
            </div>
        `;

        if (entry.accion === 'MODIFICACION' && entry.detalles?.diferencias) {
            html += `<h4 class="font-bold text-gray-800 mb-2">Cambios Detectados:</h4>`;
            html += `<div class="space-y-2">`;
            Object.entries(entry.detalles.diferencias).forEach(([ campo, diff ]) => {
                html += `
                    <div class="border border-gray-100 rounded-lg p-3 bg-white shadow-sm">
                        <div class="font-bold text-xs text-gray-500 uppercase mb-1">${campo}</div>
                        <div class="grid grid-cols-2 gap-2">
                            <div class="diff-removed p-2 rounded text-xs">Anterior: ${diff.anterior === null || diff.anterior === undefined ? '<i>(vacio)</i>' : diff.anterior}</div>
                            <div class="diff-added p-2 rounded text-xs">Nuevo: ${diff.nuevo}</div>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        } else if (entry.detalles) {
            html += `<h4 class="font-bold text-gray-800 mb-2">Datos:</h4>`;
            html += `<pre class="bg-gray-900 text-green-400 p-4 rounded-xl text-xs overflow-x-auto">${JSON.stringify(entry.detalles, null, 2)}</pre>`;
        }

        content.innerHTML = html;
        modal.classList.remove('hidden');
    };

    window.closeDetailModal = function() {
        document.getElementById('detail-modal').classList.add('hidden');
    };

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

    // --- INICIALIZACIÓN Y AUTH ---
    auth.onAuthStateChanged(user => {
        document.body.classList.remove('uninitialized');
        if (user) {
            // Verificar si es admin
            database.ref('admins/' + user.uid).once('value').then(snapshot => {
                if (snapshot.exists()) {
                    showMainContent();
                    loadBitacoraData();
                    // Registrar navegación
                    if (typeof AuditLogger !== 'undefined') {
                        AuditLogger.logNavigation('Revisó la Bitácora');
                    }
                } else {
                    showLoginScreen("No tienes permisos de administrador.");
                    auth.signOut();
                }
            }).catch(error => {
                console.error("Error al verificar admin:", error);
                showLoginScreen("Error al verificar permisos.");
            });
        } else {
            showLoginScreen();
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
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [30, 58, 138] }, // Navy blue
            columnStyles: { 
                0: { cellWidth: 30 },
                1: { cellWidth: 40 },
                2: { cellWidth: 40 },
                3: { cellWidth: 'auto' }
            }
        });

        doc.save(nombreArchivo);

        if (typeof AuditLogger !== 'undefined') {
            AuditLogger.log('generó un informe de Bitácora');
        }
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
                        if (typeof AuditLogger !== 'undefined') {
                            AuditLogger.log('borró TODOS los registros de la Bitácora');
                        }
                    })
                    .catch(handleError);
            }
        } else {
            alert("Borrado cancelado. No se escribió la palabra de confirmación correcta.");
        }
    });
});
