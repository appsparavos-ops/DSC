const IMG_BASE_URL = 'https://raw.githubusercontent.com/appsparavos-ops/DSC/fotos/';

document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.database();

    const seasonSelect = document.getElementById('seasonSelect');
    const startBtn = document.getElementById('startAuditBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const progressLabel = document.getElementById('progressLabel');
    const resultsBody = document.getElementById('resultsBody');
    const tableFilter = document.getElementById('tableFilter');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const missingCountBadge = document.getElementById('missingCountBadge');

    const statTotal = document.getElementById('statTotal');
    const statVerified = document.getElementById('statVerified');
    const statWithPhoto = document.getElementById('statWithPhoto');
    const statMissingPhoto = document.getElementById('statMissingPhoto');

    let allPlayers = [];
    let playersWithoutPhoto = [];
    let isAuditing = false;

    // --- AUTH & INITIALIZATION ---
    auth.onAuthStateChanged(user => {
        if (user) {
            db.ref('admins/' + user.uid).once('value').then(snapshot => {
                if (snapshot.exists()) {
                    loadSeasons();
                    if (typeof AuditLogger !== 'undefined') {
                        AuditLogger.logNavigation('ingresó a Auditoría de Fotos');
                    }
                } else {
                    window.location.href = 'index.html';
                }
            });
        } else {
            window.location.href = 'index.html';
        }
    });

    function loadSeasons() {
        console.log("Cargando temporadas desde /temporadas...");
        db.ref('temporadas').on('value', snapshot => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const seasons = Object.keys(data).sort((a, b) => b.localeCompare(a));
                console.log("Temporadas encontradas:", seasons);
                
                seasonSelect.innerHTML = '<option value="">Seleccionar Temporada</option>';
                seasons.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = opt.textContent = s;
                    seasonSelect.appendChild(opt);
                });
                // Auto-seleccionar la más reciente
                if (seasons.length > 0 && !seasonSelect.value) {
                    seasonSelect.value = seasons[0];
                }
            } else {
                console.warn("No se encontraron temporadas en '/temporadas'");
                showToast("No se encontraron temporadas.", "error");
            }
        }, error => {
            console.error("Error cargando temporadas:", error);
            showToast("Error al cargar temporadas.", "error");
        });
    }

    // --- AUDIT LOGIC ---
    startBtn.addEventListener('click', async () => {
        const season = seasonSelect.value;
        if (!season) return showToast("Selecciona una temporada.", "error");

        isAuditing = true;
        updateUIState(true);
        resetStats();

        try {
            // 1. Cargar registros por temporada
            const registrationsSnap = await db.ref(`registrosPorTemporada/${season}`).once('value');
            if (!registrationsSnap.exists()) {
                isAuditing = false;
                updateUIState(false);
                return showToast("No hay registros para esta temporada.", "error");
            }

            // 2. Cargar datos de jugadores para obtener nombres
            const jugadoresSnap = await db.ref('jugadores').once('value');
            const allJugadoresData = jugadoresSnap.exists() ? jugadoresSnap.val() : {};

            const registrations = Object.values(registrationsSnap.val());
            
            // 3. Mapear datos completos
            allPlayers = registrations.map(r => {
                const dni = String(r._dni || r.DNI || r.dni || '').trim();
                if (!dni) return null;
                const personal = allJugadoresData[dni] ? allJugadoresData[dni].datosPersonales : null;
                return {
                    DNI: dni,
                    NOMBRE: personal ? personal.NOMBRE : (r.Nombre || r.NOMBRE || 'Sin Nombre'),
                    EQUIPO: r.EQUIPO || r.Equipo || '-',
                    CATEGORIA: r.CATEGORIA || r.Categoria || '-'
                };
            }).filter(Boolean);

            statTotal.textContent = allPlayers.length;
            playersWithoutPhoto = [];
            resultsBody.innerHTML = '';
            progressContainer.classList.remove('hidden');

            // 4. Verificación por lotes
            const batchSize = 10;
            for (let i = 0; i < allPlayers.length; i += batchSize) {
                if (!isAuditing) break;

                const batch = allPlayers.slice(i, i + batchSize);
                const promises = batch.map(player => checkPlayerPhoto(player));
                await Promise.all(promises);

                const processed = Math.min(i + batchSize, allPlayers.length);
                const percent = Math.round((processed / allPlayers.length) * 100);
                progressBar.style.width = `${percent}%`;
                progressPercent.textContent = `${percent}%`;
                progressLabel.textContent = `Verificando ${processed} de ${allPlayers.length}...`;
                statVerified.textContent = processed;
            }

            isAuditing = false;
            updateUIState(false);
            renderResults();
            showToast("Auditoría completada.", "success");
            
            if (typeof AuditLogger !== 'undefined') {
                AuditLogger.log('completó Auditoría de Fotos', {
                    temporada: season,
                    sinFoto: playersWithoutPhoto.length
                });
            }
        } catch (error) {
            console.error("Error durante la auditoría:", error);
            showToast("Ocurrió un error inesperado.", "error");
            isAuditing = false;
            updateUIState(false);
        }
    });

    async function checkPlayerPhoto(player) {
        const dni = String(player.DNI || '').trim();
        if (!dni) {
            recordMissing(player);
            return;
        }

        const photoUrl = `${IMG_BASE_URL}${encodeURIComponent(dni)}.jpg`;
        const exists = await checkImageExists(photoUrl);

        if (exists) {
            statWithPhoto.textContent = parseInt(statWithPhoto.textContent) + 1;
        } else {
            recordMissing(player);
        }
    }

    function checkImageExists(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
        });
    }

    function recordMissing(player) {
        playersWithoutPhoto.push(player);
        statMissingPhoto.textContent = playersWithoutPhoto.length;
        missingCountBadge.textContent = playersWithoutPhoto.length;
        missingCountBadge.classList.remove('hidden');
    }

    function renderResults(filter = '') {
        const filtered = playersWithoutPhoto.filter(p => 
            (p.NOMBRE || '').toLowerCase().includes(filter.toLowerCase()) ||
            (p.EQUIPO || '').toLowerCase().includes(filter.toLowerCase()) ||
            (p.CATEGORIA || '').toLowerCase().includes(filter.toLowerCase()) ||
            (p.DNI || '').toString().includes(filter)
        );

        resultsBody.innerHTML = '';
        if (filtered.length === 0) {
            resultsBody.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500 italic">No se encontraron jugadores sin foto${filter ? ' con este filtro' : ''}.</td></tr>`;
            exportPdfBtn.disabled = true;
            return;
        }

        exportPdfBtn.disabled = false;
        filtered.forEach(p => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-white/5 transition-colors';
            const photoUrl = `${IMG_BASE_URL}${encodeURIComponent(p.DNI)}.jpg`;
            
            row.innerHTML = `
                <td class="px-6 py-4 font-medium text-white">${p.NOMBRE || '-'}</td>
                <td class="px-6 py-4 text-gray-400 font-mono text-xs">${p.DNI || '-'}</td>
                <td class="px-6 py-4 text-gray-400">${p.EQUIPO || '-'}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-md bg-purple-500/10 text-purple-400 text-xs">${p.CATEGORIA || '-'}</span>
                </td>
                <td class="px-6 py-4 text-center">
                    <a href="${photoUrl}" target="_blank" class="text-indigo-400 hover:text-indigo-300 text-xs underline">Ver URL</a>
                </td>
            `;
            resultsBody.appendChild(row);
        });
    }

    // --- UI HELPERS ---
    tableFilter.addEventListener('input', (e) => {
        renderResults(e.target.value);
    });

    function updateUIState(active) {
        startBtn.disabled = active;
        seasonSelect.disabled = active;
        if (active) {
            startBtn.innerHTML = '<span class="animate-pulse-subtle">Auditando...</span>';
        } else {
            startBtn.textContent = 'Iniciar Auditoría';
        }
    }

    function resetStats() {
        statTotal.textContent = '0';
        statVerified.textContent = '0';
        statWithPhoto.textContent = '0';
        statMissingPhoto.textContent = '0';
        missingCountBadge.classList.add('hidden');
    }

    function showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `px-6 py-3 rounded-xl shadow-2xl transform transition-all duration-300 translate-y-10 opacity-0 flex items-center gap-3 ${
            type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`;
        
        toast.innerHTML = `
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${type === 'success' 
                    ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
                    : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
                }
            </svg>
            <span class="font-medium">${message}</span>
        `;
        
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.remove('translate-y-10', 'opacity-0');
        }, 10);
        
        setTimeout(() => {
            toast.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // --- PDF EXPORT ---
    exportPdfBtn.addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const season = seasonSelect.value;

        doc.setFontSize(18);
        doc.text(`Reporte de Jugadores sin Foto - Temporada ${season}`, 14, 20);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 28);
        doc.text(`Total faltantes: ${playersWithoutPhoto.length}`, 14, 33);

        const tableData = playersWithoutPhoto.map(p => [
            p.NOMBRE || '-',
            p.DNI || '-',
            p.EQUIPO || '-',
            p.CATEGORIA || '-'
        ]);

        doc.autoTable({
            startY: 40,
            head: [['Nombre', 'DNI', 'Equipo', 'Categoría']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [124, 58, 237] }, // Purple-600
            styles: { fontSize: 8 }
        });

        doc.save(`Faltantes_Fotos_${season}.pdf`);
        showToast("PDF exportado correctamente.");
    });
});
