// sincronizar_fubb.js

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const database = firebase.database();
const auth = firebase.auth();

// DOM Elements
const seasonSelect = document.getElementById('seasonSelect');
const teamSelect = document.getElementById('teamSelect');
const categorySelect = document.getElementById('categorySelect');
const fubbDataInput = document.getElementById('fubbDataInput');
const compareBtn = document.getElementById('compareBtn');
const bookmarkletCode = document.getElementById('bookmarkletCode');
const resultsContent = document.getElementById('resultsContent');
const noResultsState = document.getElementById('noResultsState');
const missingInFirebaseBody = document.getElementById('missingInFirebaseBody');
const missingInFubbBody = document.getElementById('missingInFubbBody');
const statusBadge = document.getElementById('statusBadge');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toastText');

let allPlayers = [];
let fubbPlayers = [];

// Bookmarklet Code - Súper Marcador de Extracción Masiva
// Fuente legible definida como función (más mantenible que base64)
const _bmkFn = async function() {
    if (window._fubbSyncing) return alert('Ya esta corriendo. Recarga la pagina.');
    window._fubbSyncing = true;

    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:Arial,sans-serif;';
    ov.innerHTML = '<div style="background:#1a1a2e;border:2px solid #f97316;border-radius:14px;padding:28px 36px;text-align:center;max-width:520px;width:90%">'
        + '<h2 style="color:#f97316;margin:0 0 8px;font-size:20px">Extraccion Masiva FUBB</h2>'
        + '<p id="fst" style="margin:4px 0;font-size:14px">Iniciando...</p>'
        + '<div style="background:#222;border-radius:4px;margin:12px 0;overflow:hidden;height:8px">'
        + '<div id="fbr" style="width:0%;height:100%;background:#f97316;transition:width 0.3s;border-radius:4px"></div></div>'
        + '<pre id="flg" style="font-size:11px;color:#aaa;min-height:80px;max-height:140px;overflow-y:auto;background:#0d0d1a;border-radius:6px;padding:8px;text-align:left;white-space:pre-wrap;word-break:break-all;margin:0"></pre>'
        + '<button id="fcan" style="margin-top:12px;padding:7px 22px;background:#444;border:1px solid #666;color:#fff;border-radius:8px;cursor:pointer;font-size:12px">Cancelar</button>'
        + '</div>';
    document.body.appendChild(ov);

    var st  = function(t) { document.getElementById('fst').innerText = t; };
    var lg  = function(t) { console.log(t); var e = document.getElementById('flg'); e.innerText += t + '\n'; e.scrollTop = e.scrollHeight; };
    var pr  = function(p) { document.getElementById('fbr').style.width = Math.min(100, p) + '%'; };
    var slp = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };
    var cleanup = function() { try { document.body.removeChild(ov); } catch(e) {} window._fubbSyncing = false; };
    var cancelled = false;
    document.getElementById('fcan').onclick = function() { cancelled = true; st('Cancelado.'); };

    try {
        st('Buscando convocatorias...'); pr(5);
        lg('URL: ' + window.location.href);

        var allA = Array.from(document.querySelectorAll('a[href]'));
        lg('Links <a> totales: ' + allA.length);

        var conv = [];


        conv = allA.filter(function(a) {
            var h   = (a.href  || '').toLowerCase();
            var t   = (a.title || '').toLowerCase();
            var img = a.querySelector('img');
            var alt = img ? (img.alt || '').toLowerCase() : '';
            return !h.startsWith('mailto:') &&
                (h.includes('convocatoria') || t.includes('convocatoria') || alt.includes('convocatoria') ||
                 h.includes('plantel')      || t.includes('plantel'));
        });
        lg('Estrategia 1 (convocatoria/plantel): ' + conv.length);


        if (conv.length === 0) {
            conv = allA.filter(function(a) {
                var h = a.href || '';
                return h && !h.startsWith('javascript:') && !h.startsWith('#') &&
                    a.href !== window.location.href && a.closest('tr') &&
                    (a.querySelector('img') || a.querySelector('i') || a.querySelector('span'));
            });
            lg('Estrategia 2 (icono en tabla, href real): ' + conv.length);
        }


        if (conv.length === 0) {
            conv = allA.filter(function(a) {
                return (a.href || '').includes('__doPostBack') && a.closest('tr');
            });
            lg('Estrategia 3 (__doPostBack en tabla): ' + conv.length);
        }


        if (conv.length === 0) {
            var inTbl = allA.filter(function(a) { return a.closest('tr'); }).slice(0, 8);
            var dbg = '';
            inTbl.forEach(function(a, i) {
                dbg += '[' + (i+1) + '] href=' + (a.href || '').substring(0, 60)
                     + '\n     title=' + (a.title || '(sin title)')
                     + '\n     txt=' + a.innerText.substring(0, 25) + '\n';
            });
            lg('--- Debug ---\n' + (dbg || '(ninguno)'));
            await slp(400);
            cleanup();
            alert('Sin enlaces de convocatoria.\n\nURL: ' + window.location.href
                + '\nTitulo: ' + document.title
                + '\n\nLinks en filas de tabla:\n' + (dbg || '(ninguno)'));
            return;
        }

        var isPostback = conv.some(function(a) { return (a.href || '').includes('__doPostBack'); });
        lg('Modo: ' + (isPostback ? 'ASP.NET Postback' : 'Links directos'));

        var theForm = document.querySelector('form');
        var pageUrl = window.location.origin + window.location.pathname;
        var rawAction = theForm ? theForm.getAttribute('action') : '';
        var formUrl = (rawAction && rawAction.startsWith('http')) ? rawAction : pageUrl;
        if (isPostback) lg('POST a: ' + formUrl);

        st(conv.length + ' partidos. Extrayendo...'); pr(10);
        var allPlayers = [], errors = [];

        for (var i = 0; i < conv.length; i++) {
            if (cancelled) break;
            var link = conv[i];

            var row = link.closest('tr');
            var cat = 'Sin cat', eqL = 'Local', eqV = 'Visitante';
            if (row) {
                var cels = row.querySelectorAll('td,th');
                if (cels.length >= 5) {
                    cat = cels[2].innerText.trim();
                    eqL = cels[3].innerText.trim();
                    eqV = cels[4].innerText.trim();
                }
            }

            st((i + 1) + '/' + conv.length + '  ' + cat);
            pr(10 + (i / conv.length) * 85);
            lg('[' + (i + 1) + '] cat=' + cat);

            try {
                var html = '';
                var interceptedPayload = null;
                var interceptedUrl = null;
                var idCalendario = null;
                var outHtml = link.closest('tr').outerHTML;
                
                var nums = outHtml.match(/\b\d{4,6}\b/g) || [];
                nums = nums.filter(function(n) { var v = parseInt(n); return v > 2200 || v < 1900; });
                
                if (nums.length > 0) {
                    idCalendario = nums[0];
                } else if (window.jQuery) {
                    var jd = window.jQuery(link).closest('tr').data() || {};
                    var jdStr = JSON.stringify(jd);
                    var jm = jdStr.match(/\b\d{4,6}\b/g) || [];
                    jm = jm.filter(function(n) { var v = parseInt(n); return v > 2200 || v < 1900; });
                    if (jm.length > 0) idCalendario = jm[0];
                }

                var interceptedPayload, interceptedUrl, interceptOrigin;

                if (idCalendario) {
                    interceptedPayload = new URLSearchParams({ idCalendario: idCalendario, pagina_retorno: 'index' });
                    interceptedUrl = window.location.origin + '/clubes/es/partido-componentes.aspx';
                    interceptOrigin = 'Extraction Directa ID: ' + idCalendario;
                } else {
                    throw new Error('No se encontro el ID del partido en la fila HTML');
                }

                lg('  -> Interceptor: ' + interceptOrigin + ' | Destino: ' + interceptedUrl.split('/').pop());

                html = await new Promise(function(resolve, reject) {
                    var xhr = new XMLHttpRequest();
                    if (interceptedPayload) {
                        xhr.open('POST', interceptedUrl);
                        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
                    } else {
                        xhr.open('GET', interceptedUrl);
                    }
                    xhr.withCredentials = true;
                    xhr.onload = function() {
                        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
                        else reject(new Error('HTTP ' + xhr.status));
                    };
                    xhr.onerror = function() { reject(new Error('Error de red (XHR)')); };
                    xhr.send(interceptedPayload ? interceptedPayload.toString() : null);
                });

                var doc  = new DOMParser().parseFromString(html, 'text/html');
                var tbls = doc.querySelectorAll('table');
                
                var bodyText = doc.body ? doc.body.innerText.replace(/\s+/g, ' ').trim() : '';
                lg('  -> HTML (' + html.length + 'b). Texto: ' + bodyText.substring(0, 80));
                lg('  -> Total tablas encontradas: ' + tbls.length);

                var validTbls = Array.from(tbls).filter(function(t) { return t.querySelectorAll('td').length > 5; });
                var validTbls = Array.from(tbls).filter(function(t) { return t.querySelectorAll('td').length >= 4; });

                if (validTbls.length < 2) {
                    errors.push('[' + (i + 1) + '] No se encontro tabla de Autorizados');
                    continue;
                }

                var miEquipo = eqL;
                if (/DEFENSOR|FUSIONADO/i.test(eqV)) miEquipo = eqV;
                if (/DEFENSOR|FUSIONADO/i.test(eqL)) miEquipo = eqL;

                var n = 0;
                var tblAutorizados = validTbls[1];
                
                Array.from(tblAutorizados.querySelectorAll('tr')).forEach(function(tr) {
                    var c = tr.querySelectorAll('td');
                    if (c.length < 5) return;
                    
                    var rol = c[4].innerText.trim().toUpperCase();
                    if (rol.indexOf('DIRECTOR') !== -1 || rol.indexOf('TECNICO') !== -1) return;

                    var dni    = c[2].innerText.trim().replace(/\D/g, '');
                    var nombre = c[1].innerText.trim();
                    if (dni && dni.length >= 7) {
                        allPlayers.push({ dni: dni, nombre: nombre, equipo: miEquipo, categoria: cat });
                        n++;
                    }
                });
                
                lg('  -> ' + n + ' jugadores autorizados');

            } catch(e) {
                errors.push('[' + (i + 1) + '] ' + e.message);
                lg('  ERROR: ' + e.message);
            }
            await slp(400);
        }

        pr(100);

        var seen = {};
        var deduped = allPlayers.filter(function(p) {
            var k = p.dni + '_' + p.equipo + '_' + p.categoria;
            return seen[k] ? false : (seen[k] = 1);
        });
        var json   = JSON.stringify(deduped);
        var errMsg = errors.length ? '\n\nErrores (' + errors.length + '):\n' + errors.slice(0, 6).join('\n') : '';
        cleanup();

        try {
            await navigator.clipboard.writeText(json);
            alert('EXITO: ' + deduped.length + ' jugadores de ' + conv.length + ' partidos.' + errMsg + '\n\nPega en el Comparador FUBB.');
        } catch(e) {
            prompt(deduped.length + ' jugadores. Copia manualmente:' + errMsg, json);
        }

    } catch(err) {
        cleanup();
        alert('Error: ' + err.message + '\n' + err.stack);
    }
};

const _bmkSrc = _bmkFn.toString()
    .replace(/\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
const bookmarkletSource = 'javascript:(' + _bmkSrc + ')();';
if (bookmarkletCode) {
    bookmarkletCode.value = bookmarkletSource;
}

// Auth check
auth.onAuthStateChanged(user => {
    if (user) {
        database.ref('admins/' + user.uid).once('value').then(snapshot => {
            if (snapshot.exists()) {
                document.body.classList.remove('uninitialized');
                loadSeasons();
            } else {
                window.location.href = 'index.html';
            }
        });
    } else {
        window.location.href = 'index.html';
    }
});

function loadSeasons() {
    database.ref('/temporadas').once('value').then(snapshot => {
        seasonSelect.innerHTML = '<option value="">Selecciona temporada</option>';
        const seasons = snapshot.val();
        if (seasons) {
            Object.keys(seasons).sort().reverse().forEach(s => {
                seasonSelect.appendChild(new Option(s, s));
            });
        }
    });
}

seasonSelect.onchange = () => {
    loadPlayersForSeason(seasonSelect.value);
};

async function loadPlayersForSeason(temporada) {
    if (!temporada) {
        allPlayers = [];
        updateCategoryFilter();
        return;
    }

    showToast("Cargando datos de temporada...", "info");

    database.ref('/registrosPorTemporada/' + temporada).once('value', async snapshot => {
        if (!snapshot.exists()) {
            allPlayers = [];
            updateCategoryFilter();
            return;
        }

        const records = snapshot.val();
        const recordsArray = Object.values(records);

        // Cargar nombres desde /jugadores
        const dniList = [...new Set(recordsArray.map(r => String(r._dni || r.DNI || "")))];
        const namesPromises = dniList.map(dni => database.ref(`/jugadores/${dni}/datosPersonales/NOMBRE`).once('value'));
        const nameSnapshots = await Promise.all(namesPromises);
        const namesMap = {};
        nameSnapshots.forEach((snap, i) => {
            namesMap[dniList[i]] = snap.val() || 'N/N';
        });

        allPlayers = Object.keys(records).map(key => {
            const r = records[key];
            const dni = String(r._dni || r.DNI || "");
            return {
                dbKey: key,
                DNI: dni,
                NOMBRE: namesMap[dni] || r.NOMBRE || 'N/N',
                EQUIPO: r.EQUIPO || "",
                equipoAutorizado: r.equipoAutorizado || "",
                CATEGORIA: r.CATEGORIA || "",
                categoriasAutorizadas: r.categoriasAutorizadas || [],
                esAutorizado: r.esAutorizado === true || String(r.esAutorizado).toLowerCase() === 'true'
            };
        });

        updateTeamFilter();
        showToast("Lista actualizada", "success");
    });
}

function updateTeamFilter() {
    const teamsSet = new Set();
    allPlayers.forEach(p => {
        if (p.EQUIPO) teamsSet.add(p.EQUIPO);
        if (p.equipoAutorizado) teamsSet.add(p.equipoAutorizado);
    });

    const current = teamSelect.value;
    teamSelect.innerHTML = '<option value="">Selecciona equipo</option>';
    Array.from(teamsSet).sort().forEach(t => {
        teamSelect.appendChild(new Option(t, t));
    });
    if (teamsSet.has(current)) teamSelect.value = current;
    
    updateCategoryFilter();
}

teamSelect.onchange = () => {
    updateCategoryFilter();
};

function updateCategoryFilter() {
    const selectedTeam = teamSelect.value;
    const categoriesSet = new Set();
    
    allPlayers.forEach(p => {
        // Solo considerar categorías del equipo seleccionado (o de todos si no hay equipo)
        const isOriginalTeam = p.EQUIPO === selectedTeam;
        const isAuthorizedTeam = p.equipoAutorizado === selectedTeam;

        if (!selectedTeam || isOriginalTeam || isAuthorizedTeam) {
            if (p.CATEGORIA) categoriesSet.add(p.CATEGORIA);
            if (p.categoriasAutorizadas) {
                p.categoriasAutorizadas.forEach(c => categoriesSet.add(c));
            }
        }
    });

    const current = categorySelect.value;
    categorySelect.innerHTML = '<option value="">Selecciona categoría</option>';
    Array.from(categoriesSet).sort().forEach(c => {
        categorySelect.appendChild(new Option(c, c));
    });
    if (categoriesSet.has(current)) categorySelect.value = current;
}

compareBtn.onclick = async () => {
    let rawData = fubbDataInput.value.trim();
    const selectedTeam = teamSelect.value;

    if (!rawData) {
        showToast("Pega los datos de la FUBB", "error");
        return;
    }

    // Intentar detectar formato JSON
    let isMassive = false;
    if (rawData.startsWith('[') && rawData.endsWith(']')) {
        try {
            fubbPlayers = JSON.parse(rawData);
            if (fubbPlayers.length > 0 && fubbPlayers[0].equipo && fubbPlayers[0].categoria) {
                isMassive = true;
            }
        } catch (e) {
            showToast("Formato JSON inválido", "error");
            return;
        }
    } else {
        fubbPlayers = parseSmartText(rawData);
        if (fubbPlayers.length === 0) {
            showToast("No se encontraron jugadores en el texto", "error");
            return;
        }
        showToast(`Se detectaron ${fubbPlayers.length} jugadores del texto`, "info");
    }

    if (isMassive) {
        // Force season 2026 automatically in massive mode
        if (seasonSelect.value !== '2026') {
            seasonSelect.value = '2026';
            await loadPlayersForSeason('2026');
        }
        runMassiveComparison();
    } else {
        const selectedCat = categorySelect.value;
        if (!selectedTeam || !selectedCat) {
            showToast("Modo Simple: Selecciona equipo y categoría primero", "error"); return;
        }
        runComparison(selectedTeam, selectedCat);
    }
    fubbDataInput.value = '';
};

function runMassiveComparison() {
    if(!allPlayers || allPlayers.length === 0) {
        showToast("Esperando datos de la base...", "info");
        setTimeout(() => runMassiveComparison(), 1000);
        return;
    }

    // Agrupar fubbPlayers por Equipo y Categoría
    const fubbGroups = {};
    fubbPlayers.forEach(p => {
        const eq = p.equipo || 'Sin Equipo';
        if (!fubbGroups[eq]) fubbGroups[eq] = {};
        if (!fubbGroups[eq][p.categoria]) fubbGroups[eq][p.categoria] = [];
        fubbGroups[eq][p.categoria].push(p);
    });

    let totalMissingFirebase = [];
    let totalMissingFubb = [];

    Object.keys(fubbGroups).forEach(team => {
        Object.keys(fubbGroups[team]).forEach(category => {
            const catFubbPlayers = fubbGroups[team][category];
            const fubbDnis = new Set(catFubbPlayers.map(p => String(p.dni)));

            const firebasePlayers = allPlayers.filter(p => {
                const matchesTeam = p.EQUIPO === team || p.equipoAutorizado === team;
                const isAuthorized = (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(category)) || p.esAutorizado;
                const isRefuerzo = isAuthorized && (p.CATEGORIA !== category);
                return matchesTeam && (isAuthorized || isRefuerzo);
            });

            const firebaseDnis = new Set(firebasePlayers.map(p => String(p.DNI)));

            // Missing in Firebase
            catFubbPlayers.filter(p => !firebaseDnis.has(String(p.dni))).forEach(p => {
                p.view_categoria = category;
                p.view_equipo = team;
                totalMissingFirebase.push(p);
            });

            // Missing in Fubb
            firebasePlayers.filter(p => !fubbDnis.has(String(p.DNI))).forEach(p => {
                const copy = {...p, view_categoria: category, view_equipo: team};
                totalMissingFubb.push(copy);
            });
        });
    });

    renderResults(totalMissingFirebase, totalMissingFubb, true);
}

function parseSmartText(text) {
    const lines = text.split('\n');
    const result = [];
    const dniRegex = /(\d{1,3}\.?\d{3}\.?\d{3}-?\d?)/;
    
    lines.forEach(line => {
        if (!line.trim()) return;
        const dniMatch = line.match(dniRegex);
        if (dniMatch) {
            const dniStr = dniMatch[0];
            const dniNumeric = dniStr.replace(/\D/g, '');
            
            let nombre = line.replace(dniStr, '').replace(/^\d+/, '').trim();
            
            if (dniNumeric.length >= 7) {
                result.push({
                    dni: dniNumeric,
                    nombre: nombre || 'Desconocido'
                });
            }
        }
    });
    return result;
}

function runComparison(team, category) {
    const firebasePlayers = allPlayers.filter(p => {
        const matchesTeam = p.EQUIPO === team || p.equipoAutorizado === team;
        const isAuthorized = (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(category)) || p.esAutorizado;
        const isRefuerzo = isAuthorized && (p.CATEGORIA !== category);
        
        return matchesTeam && (isAuthorized || isRefuerzo);
    });

    const fubbDnis = new Set(fubbPlayers.map(p => String(p.dni)));
    const firebaseDnis = new Set(firebasePlayers.map(p => String(p.DNI)));

    const missingInFirebase = fubbPlayers.filter(p => !firebaseDnis.has(String(p.dni)));
    const missingInFubb = firebasePlayers.filter(p => !fubbDnis.has(String(p.DNI)));

    renderResults(missingInFirebase, missingInFubb);
}

function renderResults(missingInFirebase, missingInFubb, isMassive = false) {
    missingInFirebaseBody.innerHTML = '';
    missingInFubbBody.innerHTML = '';

    if (missingInFirebase.length === 0 && missingInFubb.length === 0) {
        if (statusBadge) statusBadge.classList.remove('hidden');
        resultsContent.classList.add('hidden');
        noResultsState.classList.remove('hidden');
        noResultsState.innerHTML = `
            <div class="text-center text-green-400">
                <svg class="h-16 w-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-xl font-bold">¡Todo sincronizado!</p>
                <p class="text-sm opacity-60">Los datos de la FUBB coinciden con Firebase.</p>
            </div>
        `;
    } else {
        if (statusBadge) statusBadge.classList.add('hidden');
        resultsContent.classList.remove('hidden');
        noResultsState.classList.add('hidden');

        if (window.mobileView) {
            missingInFirebase.forEach(p => {
                const div = document.createElement('div');
                div.className = "bg-white/5 border border-white/10 p-4 rounded-xl flex justify-between items-center mb-2 active:bg-orange-600/20";
                div.onclick = () => authorizePlayer(p, isMassive ? p.view_categoria : null, isMassive ? p.view_equipo : null);
                div.innerHTML = `
                    <div>
                        <div class="font-bold text-sm">${p.nombre} ${isMassive ? '<span class="text-[9px] bg-indigo-900/60 px-1 rounded ml-1">' + p.view_equipo + '</span><span class="text-[9px] bg-orange-900/60 px-1 rounded ml-1">' + p.view_categoria + '</span>' : ''}</div>
                        <div class="text-[10px] text-orange-300 font-mono">${formatDni(p.dni)}</div>
                    </div>
                    <button class="bg-orange-600 px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-orange-900/40">Autorizar</button>
                `;
                missingInFirebaseBody.appendChild(div);
            });

            missingInFubb.forEach(p => {
                const div = document.createElement('div');
                div.className = "bg-white/5 border border-white/10 p-4 rounded-xl flex justify-between items-center mb-2 active:bg-blue-600/20";
                div.onclick = () => removeAuthorization(p, isMassive ? p.view_categoria : null);
                div.innerHTML = `
                    <div>
                        <div class="font-bold text-sm">${p.NOMBRE} ${isMassive ? '<span class="text-[9px] bg-indigo-900/60 px-1 rounded ml-1">' + p.view_equipo + '</span><span class="text-[9px] bg-blue-900/60 px-1 rounded ml-1">' + p.view_categoria + '</span>' : ''}</div>
                        <div class="text-[10px] text-blue-300 font-mono">${formatDni(p.DNI)}</div>
                    </div>
                    <button class="bg-blue-600 px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-blue-900/40">Quitar</button>
                `;
                missingInFubbBody.appendChild(div);
            });
        } else {
            missingInFirebase.forEach(p => {
                const tr = document.createElement('tr');
                tr.className = "border-t border-white/5 hover:bg-orange-500/10 transition-colors cursor-pointer group";
                tr.onclick = () => authorizePlayer(p, isMassive ? p.view_categoria : null, isMassive ? p.view_equipo : null);
                tr.innerHTML = `
                    <td class="px-4 py-3 font-mono text-orange-300 text-xs">${formatDni(p.dni)}</td>
                    <td class="px-4 py-3">
                        <div class="font-medium">${p.nombre} ${isMassive ? '<span class="text-[10px] bg-indigo-900/60 text-indigo-200 px-1 rounded ml-1">' + p.view_equipo + '</span><span class="text-[10px] bg-orange-900/60 px-1 rounded ml-1">' + p.view_categoria + '</span>' : ''}</div>
                        <div class="text-[10px] text-gray-500">Haz clic para autorizar como refuerzo${isMassive ? ' ('+p.view_categoria+')' : ''}</div>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <button class="bg-orange-600/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-lg text-[10px] font-bold group-hover:bg-orange-600 group-hover:text-white transition-all">
                            Autorizar
                        </button>
                    </td>
                `;
                missingInFirebaseBody.appendChild(tr);
            });

            missingInFubb.forEach(p => {
                const tr = document.createElement('tr');
                tr.className = "border-t border-white/5 hover:bg-blue-500/10 transition-colors cursor-pointer group";
                tr.onclick = () => removeAuthorization(p, isMassive ? p.view_categoria : null);
                tr.innerHTML = `
                    <td class="px-4 py-3 font-mono text-blue-300 text-xs">${formatDni(p.DNI)}</td>
                    <td class="px-4 py-3">
                        <div class="font-medium">${p.NOMBRE} ${isMassive ? '<span class="text-[10px] bg-indigo-900/60 text-indigo-200 px-1 rounded ml-1">' + p.view_equipo + '</span><span class="text-[10px] bg-blue-900/60 px-1 rounded ml-1">' + p.view_categoria + '</span>' : ''}</div>
                        <div class="text-[10px] text-gray-500">Haz clic para quitar autorización${isMassive ? ' ('+p.view_categoria+')' : ''}</div>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <button class="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-lg text-[10px] font-bold group-hover:bg-blue-600 group-hover:text-white transition-all">
                            Quitar
                        </button>
                    </td>
                `;
                missingInFubbBody.appendChild(tr);
            });
        }
    }
}

function formatDni(dni) {
    return String(dni);
}

async function authorizePlayer(fubbPlayer, overrideCategory = null, overrideTeam = null) {
    const season = seasonSelect.value;
    const team = overrideTeam || teamSelect.value || (fubbPlayer ? fubbPlayer.equipo : null) || (fubbPlayer ? fubbPlayer.view_equipo : null);
    const category = overrideCategory || categorySelect.value;
    const dni = String(fubbPlayer.dni);

    if (!confirm(`¿Deseas autorizar a ${fubbPlayer.nombre} (${dni}) para ${team} en la categoría ${category}?`)) return;

    try {
        showToast("Procesando autorización...", "info");
        
        const existingInSeason = allPlayers.find(p => p.DNI === dni);
        
        if (existingInSeason) {
            const cats = existingInSeason.categoriasAutorizadas || [];
            if (!cats.includes(category)) {
                cats.push(category);
            }
            
            const updates = {
                categoriasAutorizadas: cats,
                equipoAutorizado: team,
                esAutorizado: true
            };

            await database.ref(`/registrosPorTemporada/${season}/${existingInSeason.dbKey}`).update(updates);
        } else {
            const snapshot = await database.ref(`/jugadores/${dni}/datosPersonales`).once('value');
            if (!snapshot.exists()) {
                showToast("El jugador no existe en la base global (/jugadores). Por favor, regístralo primero.", "error");
                return;
            }

            const personalData = snapshot.val();
            
            const newRecord = {
                DNI: dni,
                NOMBRE: personalData.NOMBRE || fubbPlayer.nombre,
                EQUIPO: team,
                CATEGORIA: category,
                esAutorizado: true,
                equipoAutorizado: team,
                categoriasAutorizadas: [category],
                _tipo: 'jugadores'
            };

            await database.ref(`/registrosPorTemporada/${season}`).push(newRecord);
        }

        showToast("¡Jugador autorizado correctamente!", "success");
        loadPlayersForSeason(season);
        
    } catch (e) {
        console.error("Error al autorizar:", e);
        showToast("Error al procesar la autorización", "error");
    }
}

async function removeAuthorization(player, overrideCategory = null) {
    const season = seasonSelect.value;
    const category = overrideCategory || categorySelect.value;

    if (!confirm(`¿Deseas QUITAR la autorización de ${player.NOMBRE} para la categoría ${category}?`)) return;

    try {
        showToast("Procesando...", "info");
        
        let cats = player.categoriasAutorizadas || [];
        cats = cats.filter(c => c !== category);
        
        const updates = {
            categoriasAutorizadas: cats
        };

        if (cats.length === 0) {
            updates.esAutorizado = false;
            updates.equipoAutorizado = "";
        }

        await database.ref(`/registrosPorTemporada/${season}/${player.dbKey}`).update(updates);
        
        showToast("Autorización quitada", "success");
        loadPlayersForSeason(season);
    } catch (e) {
        console.error("Error al quitar autorización:", e);
        showToast("Error al procesar", "error");
    }
}

function showToast(message, type = 'info') {
    if (!toast || !toastText) return;
    toastText.textContent = message;
    toast.classList.remove('translate-y-24', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    const bgColor = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-gray-900';
    toast.firstElementChild.className = `${bgColor} text-white px-8 py-4 rounded-2xl shadow-2xl font-semibold flex items-center gap-3`;

    setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3000);
}

// Auto Team Fix
fubbDataInput.addEventListener('input', () => {
    try {
        const val = fubbDataInput.value.trim();
        if(val.startsWith('[')) {
            const arr = JSON.parse(val);
            if(arr.length && arr[0].equipo) {
                const teams = [...new Set(arr.map(p => p.equipo))].sort();
                let current = teamSelect.value;
                
                const existingOptions = Array.from(teamSelect.options).map(o => o.value);
                teams.forEach(t => {
                    if(!existingOptions.includes(t)) {
                        teamSelect.appendChild(new Option(t, t));
                    }
                });
                
                if(teams.includes(current)) teamSelect.value = current;
                showToast("Modo Masivo Detectado. Hemos cargado los equipos, selecciona el tuyo.", "info");
            }
        }
    } catch(e){}
});
