const firebaseConfig = {
    apiKey: "AIzaSyANWXQvhHpF0LCYjz4AXi3MkcP798PqRfA",
    authDomain: "dsc24-aa5a1.firebaseapp.com",
    databaseURL: "https://dsc24-aa5a1-default-rtdb.firebaseio.com",
    projectId: "dsc24-aa5a1",
    storageBucket: "dsc24-aa5a1.appspot.com",
    messagingSenderId: "798100493177",
    appId: "1:798100493177:web:8e2ae324f8b5cb893a55a8"
};

const GUEST_EMAIL = "invitado@dsc.com";
const GUEST_PW = "invitado123";

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const auth = firebase.auth();

// Storage logic replaced by GitHub API (using config.js)
const seasonSelect = document.getElementById('seasonSelect');
const nameSearch = document.getElementById('nameSearch');
const searchResults = document.getElementById('searchResults');
const dniInput = document.getElementById('dniInput');
const generateBtn = document.getElementById('generateBtn');
const statusMessage = document.getElementById('statusMessage');

// State
let playersList = [];
let selectedPlayer = null;
let currentPdfBlob = null;
let currentPdfUrl = null;
let currentFilename = "";

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    autoLogin();
});

// Step 1: Automatic Guest Login
function autoLogin() {
    updateStatus("Verificando sesión...", "info");

    // Check if there's already a user (no automatic login if so)
    auth.onAuthStateChanged((user) => {
        if (user) {
            updateStatus(`Sesión: ${user.email}`, "success");
            fetchPreferencesAndLoad(user.uid);
        } else {
            updateStatus("Iniciando sesión como invitado...", "info");
            auth.signInWithEmailAndPassword(GUEST_EMAIL, GUEST_PW)
                .then((result) => {
                    updateStatus("Conectado como invitado", "success");
                    fetchPreferencesAndLoad(result.user.uid);
                })
                .catch(err => {
                    console.error("Auth Error:", err);
                    updateStatus("Error de conexión", "error");
                    // Fallback to load seasons without preferences
                    loadSeasons();
                });
        }
    });
}

function fetchPreferencesAndLoad(uid) {
    database.ref(`preferenciasUsuarios/${uid}/ultimaTemporadaSeleccionada`).once('value')
        .then(snapshot => {
            const lastSeason = snapshot.val();
            loadSeasons(lastSeason);
        })
        .catch(() => loadSeasons());
}

// Step 2: Load Seasons
function loadSeasons(preference = null) {
    database.ref('/temporadas').once('value').then(snapshot => {
        const seasons = snapshot.val();
        seasonSelect.innerHTML = '<option value="">Selecciona temporada</option>';
        if (seasons) {
            const keys = Object.keys(seasons).sort().reverse();
            keys.forEach(s => {
                const opt = document.createElement('option');
                opt.value = opt.textContent = s;
                seasonSelect.appendChild(opt);
            });

            if (preference && keys.includes(preference)) {
                seasonSelect.value = preference;
                // Trigger change to load players
                const event = new Event('change');
                seasonSelect.dispatchEvent(event);
            }
        }
    });
}

// Step 3: Load Players when Season changes
seasonSelect.addEventListener('change', () => {
    const season = seasonSelect.value;
    if (!season) {
        resetForm(true);
        return;
    }

    updateStatus(`Cargando jugadores ${season}...`, "info");
    nameSearch.disabled = true;

    database.ref(`/registrosPorTemporada/${season}`).once('value').then(snapshot => {
        if (!snapshot.exists()) {
            updateStatus("No hay datos en esta temporada", "error");
            return;
        }

        const records = Object.values(snapshot.val());
        // Map DNI to player data fetching personal info if needed
        // For efficiency, we'll fetch all players of that season
        // (Similar to roster.js but simplified)

        // We only care about players (not coaches for letters usually)
        const dnis = [...new Set(records.map(r => r._dni || r.DNI).filter(Boolean))];

        // Fetch personal names for these DNIs
        const promises = dnis.map(dni =>
            database.ref(`/jugadores/${dni}/datosPersonales`).once('value')
                .then(snap => ({ snap, dni }))
        );

        Promise.all(promises).then(results => {
            playersList = results
                .filter(res => res.snap.exists())
                .map(res => {
                    const data = res.snap.val();
                    return {
                        nombre: data.NOMBRE,
                        dni: res.dni,
                        telefono: data.TELEFONO || data.CELULAR || ''
                    };
                })
                .sort((a, b) => a.nombre.localeCompare(b.nombre));

            nameSearch.disabled = false;
            updateStatus(`${playersList.length} jugadores cargados`, "success");
        });
    });

    // Guardar preferencia
    const user = auth.currentUser;
    if (user) {
        database.ref(`preferenciasUsuarios/${user.uid}`).update({
            ultimaTemporadaSeleccionada: season
        });
    }
});

// Search Logic
nameSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    searchResults.innerHTML = '';

    if (term.length < 2) {
        searchResults.style.display = 'none';
        return;
    }

    const matches = playersList.filter(p => p.nombre.toLowerCase().includes(term));

    if (matches.length > 0) {
        matches.slice(0, 10).forEach(p => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.textContent = p.nombre;
            div.onclick = () => selectPlayer(p);
            searchResults.appendChild(div);
        });
        searchResults.style.display = 'block';
    } else {
        searchResults.style.display = 'none';
    }
});

function selectPlayer(p) {
    selectedPlayer = p;
    nameSearch.value = p.nombre;
    searchResults.style.display = 'none';
    dniInput.disabled = false;
    dniInput.value = '';
    dniInput.focus();
    validateForm();
}

dniInput.addEventListener('input', validateForm);

function validateForm() {
    if (!selectedPlayer) {
        generateBtn.disabled = true;
        return;
    }

    const inputDni = dniInput.value.replace(/\D/g, '');
    const playerDni = selectedPlayer.dni.replace(/\D/g, '');

    const isValid = inputDni === playerDni;
    generateBtn.disabled = !isValid;

    if (inputDni.length > 0) {
        if (isValid) {
            updateStatus("DNI Verificado ✓", "success");
        } else if (inputDni.length >= playerDni.length) {
            updateStatus("DNI no coincide con el seleccionado", "error");
        } else {
            updateStatus("Ingresando DNI...", "info");
        }
    } else {
        updateStatus("Ingresa el DNI para verificar", "info");
    }
}

generateBtn.onclick = generatePDF;

function generatePDF() {
    if (!selectedPlayer) return;

    const fechaLarga = getLongDate();
    const nombre = selectedPlayer.nombre;
    const dni = selectedPlayer.dni;

    // Fill Template
    document.getElementById('docDate').textContent = `Montevideo, ${fechaLarga}`;
    document.getElementById('docBody').innerHTML = `
Por intermedio de la presente dejo constancia que <strong>${nombre}</strong> C.I. <strong>${dni}</strong>, forma parte del plantel de básquetbol de nuestro club, concurriendo a prácticas, y participando en las competencias correspondientes.
    `;

    // PDF Options
    const element = document.getElementById('letterPreview');
    element.style.display = 'block'; // Show for rendering

    const opt = {
        margin: 0,
        filename: `Constancia_${nombre.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: 'avoid-all' }
    };

    updateStatus("Generando PDF...", "info");
    const timestamp = new Date().getTime();
    currentFilename = `Constancia_${nombre.replace(/\s+/g, '_')}_${timestamp}.pdf`;
    opt.filename = currentFilename;

    const worker = html2pdf().set(opt).from(element);
    
    worker.save().then(() => {
        element.style.display = 'none'; 
        updateStatus("Descargado con éxito", "success");
        saveToHistory(nombre, dni);
        
        // Disable sharing until upload completes
        const wsBtn = document.getElementById('whatsappBtn');
        if (wsBtn) {
            wsBtn.disabled = true;
            wsBtn.classList.add('opacity-50');
            wsBtn.innerHTML = '<span>⏳ Cargando link...</span>';
        }

        // Capture blob for sharing
        worker.output('blob').then(blob => {
            currentPdfBlob = blob;
            uploadPdfToGitHub(blob, currentFilename);
        });

        showSuccessModal();
    }).catch(err => {
        console.error("PDF Error:", err);
        updateStatus("Error al generar PDF", "error");
    });
}

function uploadPdfToGitHub(blob, filename) {
    if (typeof GITHUB_CONFIG === 'undefined') return;

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        const apiUri = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}/${filename}`;
        
        fetch(apiUri, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_CONFIG.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: `Upload letter: ${filename}`,
                content: base64data
            })
        })
        .then(response => response.json())
        .then(data => {
            const wsBtn = document.getElementById('whatsappBtn');
            if (data.content && data.content.download_url) {
                currentPdfUrl = data.content.download_url;
                console.log("PDF Uploaded to GitHub:", currentPdfUrl);
                
                // Re-enable button
                if (wsBtn) {
                    wsBtn.disabled = false;
                    wsBtn.classList.remove('opacity-50');
                    wsBtn.innerHTML = `
                        <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.29-4.132l.353.21c1.459.869 3.044 1.328 4.678 1.329 5.235 0 9.493-4.258 9.495-9.493.002-2.537-.987-4.922-2.787-6.722-1.8-1.8-4.184-2.79-6.721-2.79-5.234 0-9.492 4.259-9.494 9.493-.002 1.83.52 3.613 1.503 5.168l.23.361-1.001 3.655 3.744-.982zm11.332-5.477c-.12-.201-.442-.321-.925-.562-.483-.241-2.857-1.41-3.299-1.57-.442-.16-.764-.241-1.086.241-.321.482-1.247 1.57-1.528 1.891-.282.321-.563.361-1.046.12-.483-.241-2.039-.751-3.882-2.396-1.435-1.28-2.404-2.86-2.686-3.342-.282-.482-.03-.742.211-.981.218-.215.483-.562.725-.843.242-.281.322-.482.483-.803.161-.321.081-.602-.04-.843-.12-.241-1.086-2.614-1.488-3.578-.392-.942-.78-1.042-1.086-1.057-.282-.014-.603-.016-.925-.016-.322 0-.845.12-1.288.602-.442.482-1.69 1.646-1.69 4.015 0 2.37 1.729 4.657 1.97 4.978.242.321 3.402 5.195 8.242 7.284 1.152.497 2.051.794 2.752 1.017 1.157.368 2.21.316 3.042.192.927-.139 2.857-1.166 3.259-2.29.402-1.124.402-2.088.282-2.289z"/></svg>
                        Enviar por WhatsApp
                    `;
                }
            }
        })
        .catch(err => {
            console.error("GitHub Upload Error:", err);
            const wsBtn = document.getElementById('whatsappBtn');
            if (wsBtn) {
                wsBtn.disabled = false;
                wsBtn.classList.remove('opacity-50');
                wsBtn.innerHTML = '<span>❌ Error. Reintentar</span>';
            }
        });
    };
}

function saveToHistory(nombre, dni) {
    const timestamp = new Date().toISOString();
    const deviceId = getDeviceId();
    
    database.ref('cartas').push({
        fecha: timestamp,
        nombre: nombre,
        dni: dni,
        dispositivo: deviceId,
        userEmail: auth.currentUser ? auth.currentUser.email : 'anonimo'
    }).catch(err => console.error("History Log Error:", err));
}

function getDeviceId() {
    // Generate or retrieve a persistent ID for the browser/device
    let dsc_did = localStorage.getItem('dsc_device_id');
    if (!dsc_did) {
        dsc_did = 'DID-' + Math.random().toString(36).substr(2, 9).toUpperCase() + '-' + Date.now();
        localStorage.setItem('dsc_device_id', dsc_did);
    }
    return dsc_did;
}

function showSuccessModal() {
    const modal = document.getElementById('successModal');
    const wsBtn = document.getElementById('whatsappBtn');
    const user = auth.currentUser;
    
    // Show WhatsApp button only if admin and player has phone
    if (user && user.email !== GUEST_EMAIL && selectedPlayer && selectedPlayer.telefono) {
        wsBtn.style.display = 'flex';
    } else {
        wsBtn.style.display = 'none';
    }
    
    modal.style.display = 'flex';
}

document.getElementById('whatsappBtn').onclick = () => {
    if (!selectedPlayer || !selectedPlayer.telefono) return;
    
    let tel = selectedPlayer.telefono.replace(/\D/g, '');
    if (tel.startsWith('09')) tel = '598' + tel.substring(1);
    else if (tel.startsWith('9')) tel = '598' + tel;
    
    const text = `Hola ${selectedPlayer.nombre}, te envío la constancia de Defensor Sporting Club.`;
    const msg = encodeURIComponent(`${text} \n\nDescargar aquí: ${currentPdfUrl || '(vuelve a intentar en unos segundos si el link no aparece)'}`);
    
    // Abrir directamente WhatsApp al numero específico
    window.open(`https://wa.me/${tel}?text=${msg}`, '_blank');
};

document.getElementById('anotherBtn').onclick = () => {
    document.getElementById('successModal').style.display = 'none';
    resetForm(false); // Reset DNI and search but keep season
    updateStatus("Selecciona un nuevo jugador", "info");
};

document.getElementById('exitBtn').onclick = () => {
    const user = auth.currentUser;
    if (user && user.email === GUEST_EMAIL) {
        window.close();
        // Fallback for browsers that block window.close
        setTimeout(() => {
            window.location.href = 'about:blank';
        }, 500);
    } else {
        window.location.href = 'mantenimiento.html';
    }
};

// Helpers
function getLongDate() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const d = new Date();
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function updateStatus(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.style.color = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#1e3a8a';
}

function resetForm(full = false) {
    nameSearch.value = '';
    if (full) {
        nameSearch.disabled = true;
    }
    dniInput.value = '';
    dniInput.disabled = true;
    generateBtn.disabled = true;
    selectedPlayer = null;
    searchResults.style.display = 'none';
}

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        searchResults.style.display = 'none';
    }
});
