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
const missingInFirebaseBodyOwn = document.getElementById('missingInFirebaseBodyOwn');
const missingInFubbBodyOwn = document.getElementById('missingInFubbBodyOwn');
const missingInFirebaseBodyAuth = document.getElementById('missingInFirebaseBodyAuth');
const missingInFubbBodyAuth = document.getElementById('missingInFubbBodyAuth');
const statusBadge = document.getElementById('statusBadge');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toastText');

let allPlayers = [];
let fubbPlayers = [];
let lastAnalysisResults = null;

// Bookmarklet Code - Súper Marcador de Extracción Masiva
// Fuente legible definida como función (más mantenible que base64)
const _bmkFn = async function () {
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

    var st = function (t) { document.getElementById('fst').innerText = t; };
    var lg = function (t) { console.log(t); var e = document.getElementById('flg'); e.innerText += t + '\n'; e.scrollTop = e.scrollHeight; };
    var pr = function (p) { document.getElementById('fbr').style.width = Math.min(100, p) + '%'; };
    var slp = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var cleanup = function () { try { document.body.removeChild(ov); } catch (e) { } window._fubbSyncing = false; };
    var cancelled = false;
    document.getElementById('fcan').onclick = function () { cancelled = true; st('Cancelado.'); };

    try {
        st('Buscando convocatorias...'); pr(5);
        lg('URL: ' + window.location.href);

        var allA = Array.from(document.querySelectorAll('a[href]'));
        lg('Links <a> totales: ' + allA.length);

        var conv = [];


        conv = allA.filter(function (a) {
            var h = (a.href || '').toLowerCase();
            var t = (a.title || '').toLowerCase();
            var img = a.querySelector('img');
            var alt = img ? (img.alt || '').toLowerCase() : '';
            return !h.startsWith('mailto:') &&
                (h.includes('convocatoria') || t.includes('convocatoria') || alt.includes('convocatoria') ||
                    h.includes('plantel') || t.includes('plantel'));
        });
        lg('Estrategia 1 (convocatoria/plantel): ' + conv.length);


        if (conv.length === 0) {
            conv = allA.filter(function (a) {
                var h = a.href || '';
                return h && !h.startsWith('javascript:') && !h.startsWith('#') &&
                    a.href !== window.location.href && a.closest('tr') &&
                    (a.querySelector('img') || a.querySelector('i') || a.querySelector('span'));
            });
            lg('Estrategia 2 (icono en tabla, href real): ' + conv.length);
        }


        if (conv.length === 0) {
            conv = allA.filter(function (a) {
                return (a.href || '').includes('__doPostBack') && a.closest('tr');
            });
            lg('Estrategia 3 (__doPostBack en tabla): ' + conv.length);
        }


        if (conv.length === 0) {
            var inTbl = allA.filter(function (a) { return a.closest('tr'); }).slice(0, 8);
            var dbg = '';
            inTbl.forEach(function (a, i) {
                dbg += '[' + (i + 1) + '] href=' + (a.href || '').substring(0, 60)
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

        var isPostback = conv.some(function (a) { return (a.href || '').includes('__doPostBack'); });
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
                nums = nums.filter(function (n) { var v = parseInt(n); return v > 2200 || v < 1900; });

                if (nums.length > 0) {
                    idCalendario = nums[0];
                } else if (window.jQuery) {
                    var jd = window.jQuery(link).closest('tr').data() || {};
                    var jdStr = JSON.stringify(jd);
                    var jm = jdStr.match(/\b\d{4,6}\b/g) || [];
                    jm = jm.filter(function (n) { var v = parseInt(n); return v > 2200 || v < 1900; });
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

                html = await new Promise(function (resolve, reject) {
                    var xhr = new XMLHttpRequest();
                    if (interceptedPayload) {
                        xhr.open('POST', interceptedUrl);
                        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
                    } else {
                        xhr.open('GET', interceptedUrl);
                    }
                    xhr.withCredentials = true;
                    xhr.onload = function () {
                        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
                        else reject(new Error('HTTP ' + xhr.status));
                    };
                    xhr.onerror = function () { reject(new Error('Error de red (XHR)')); };
                    xhr.send(interceptedPayload ? interceptedPayload.toString() : null);
                });

                var doc = new DOMParser().parseFromString(html, 'text/html');
                var tbls = doc.querySelectorAll('table');

                var bodyText = doc.body ? doc.body.innerText.replace(/\s+/g, ' ').trim() : '';
                lg('  -> HTML (' + html.length + 'b). Texto: ' + bodyText.substring(0, 80));
                lg('  -> Total tablas encontradas: ' + tbls.length);

                var validTbls = Array.from(tbls).filter(function (t) { return t.querySelectorAll('td').length >= 4; });

                if (validTbls.length === 0) {
                    errors.push('[' + (i + 1) + '] No se encontro tabla de Jugadores');
                    continue;
                }

                var miEquipo = eqL;
                if (/DEFENSOR|FUSIONADO/i.test(eqV)) miEquipo = eqV;
                if (/DEFENSOR|FUSIONADO/i.test(eqL)) miEquipo = eqL;

                var n = 0;
                var tablas = [];
                if (validTbls.length > 0) tablas.push(validTbls[0]);
                if (validTbls.length > 1) tablas.push(validTbls[1]);

                tablas.forEach(function (tbl, tIdx) {
                    var isAuth = (tIdx === 1);
                    Array.from(tbl.querySelectorAll('tr')).forEach(function (tr) {
                        var c = tr.querySelectorAll('td');
                        if (c.length < 5) return;

                        var rol = c[4].innerText.trim().toUpperCase();
                        if (rol.indexOf('DIRECTOR') !== -1 || rol.indexOf('TECNICO') !== -1 || rol.indexOf('ENTRENADOR') !== -1 || rol.indexOf('PREPARADOR') !== -1 || rol.indexOf('DELEGADO') !== -1 || rol.indexOf('MEDICO') !== -1 || rol.indexOf('AYUDANTE') !== -1 || rol.indexOf('UTILERO') !== -1 || rol.indexOf('ESTADISTICO') !== -1) return;

                        var dni = c[2].innerText.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                        var nombre = c[1].innerText.trim();
                        var numero = c[0].innerText.trim().replace(/\D/g, '');
                        if (dni && dni.length >= 7) {
                            allPlayers.push({ dni: dni, nombre: nombre, equipo: miEquipo, categoria: cat, isAuth: isAuth, numero: numero });
                            n++;
                        }
                    });
                });

                lg('  -> ' + n + ' jugadores extraidos');

            } catch (e) {
                errors.push('[' + (i + 1) + '] ' + e.message);
                lg('  ERROR: ' + e.message);
            }
            await slp(400);
        }

        pr(100);

        var seen = {};
        var deduped = allPlayers.filter(function (p) {
            var k = p.dni + '_' + p.equipo + '_' + p.categoria;
            return seen[k] ? false : (seen[k] = 1);
        });
        var json = JSON.stringify(deduped);
        var errMsg = errors.length ? '\n\nErrores (' + errors.length + '):\n' + errors.slice(0, 6).join('\n') : '';
        cleanup();

        try {
            await navigator.clipboard.writeText(json);
            alert('EXITO: ' + deduped.length + ' jugadores de ' + conv.length + ' partidos.' + errMsg + '\n\nPega en el Comparador FUBB.');
        } catch (e) {
            prompt(deduped.length + ' jugadores. Copia manualmente:' + errMsg, json);
        }

    } catch (err) {
        cleanup();
        alert('Error: ' + err.message + '\n' + err.stack);
    }
};

const _bmkSrc = _bmkFn.toString()
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ') // Eliminar comentarios // (respetando http://)
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

    const snapshot = await database.ref('/registrosPorTemporada/' + temporada).once('value');
    if (!snapshot.exists()) {
        allPlayers = [];
        updateCategoryFilter();
        return;
    }

    const rawRecords = snapshot.val();
    window._rawFirebaseRecords = rawRecords; // Guardar para sincronización masiva

    // Filtrar aquellos que no sean jugadores explícitamente (ignorar cuerpo técnico)
    const filteredKeys = Object.keys(rawRecords).filter(key => {
        const r = rawRecords[key];
        const tipo = (r._tipo || '').trim().toLowerCase();
        return !tipo || tipo.includes('jugador');
    });

    const recordsArray = filteredKeys.map(k => rawRecords[k]);

    // Cargar nombres desde /jugadores
    const dniList = [...new Set(recordsArray.map(r => String(r._dni || r.DNI || "")))];
    const namesPromises = dniList.map(dni => database.ref(`/jugadores/${dni}/datosPersonales/NOMBRE`).once('value'));
    const nameSnapshots = await Promise.all(namesPromises);
    const namesMap = {};
    nameSnapshots.forEach((snap, i) => {
        namesMap[dniList[i]] = snap.val() || 'N/N';
    });

    allPlayers = filteredKeys.map(key => {
        const r = rawRecords[key];
        const dni = String(r._dni || r.DNI || "");
        return {
            ...r, // Preservar TODOS los campos originales de Firebase (ESTADO LICENCIA, FM Hasta, etc.)
            dbKey: key,
            DNI: dni,
            NOMBRE: namesMap[dni] || r.NOMBRE || 'N/N',
            EQUIPO: r.EQUIPO || "",
            equipoAutorizado: r.equipoAutorizado || "",
            CATEGORIA: r.CATEGORIA || "",
            categoriasAutorizadas: r.categoriasAutorizadas || [],
            esAutorizado: r.esAutorizado === true || String(r.esAutorizado).toLowerCase() === 'true',
            Numero: r.Numero || "",
            Numeros: r.Numeros || {},
            _tipo: r._tipo || 'jugadores'
        };
    });

    updateTeamFilter();
    showToast("Lista actualizada", "success");
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

    if (!seasonSelect.value) {
        showToast("Selecciona una temporada primero", "error");
        return;
    }

    const isIntermedia = seasonSelect.value.includes('-');

    if (isMassive) {
        fubbPlayers = fubbPlayers.filter(p => {
            const catName = (p.categoria || '').trim().toLowerCase();
            const isPro = catName.includes('liga uruguaya') || catName.includes('liga de desarrollo') || catName === 'lub' || catName === 'ldd';
            return isIntermedia ? isPro : !isPro;
        });

        if (fubbPlayers.length === 0) {
            showToast("No hay jugadores válidos para esta temporada según el filtro de Liga.", "info");
            return;
        }

        runMassiveComparison();
    } else {
        const selectedCat = categorySelect.value;
        if (!selectedTeam || !selectedCat) {
            showToast("Modo Simple: Selecciona equipo y categoría primero", "error");
            return;
        }

        const catName = selectedCat.toLowerCase();
        const isPro = catName.includes('liga uruguaya') || catName.includes('liga de desarrollo') || catName === 'lub' || catName === 'ldd';

        if (isIntermedia && !isPro) {
            showToast("La temporada seleccionada es intermedia: solo admite Liga Uruguaya y Desarrollo.", "error");
            return;
        }
        if (!isIntermedia && isPro) {
            showToast("La temporada seleccionada es entera: no admite ligas como LUB/LDD.", "error");
            return;
        }

        runComparison(selectedTeam, selectedCat);
    }
};

function runMassiveComparison() {
    if (!allPlayers || allPlayers.length === 0) {
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

    let mFirebaseOwn = [], mFubbOwn = [], mFirebaseAuth = [], mFubbAuth = [], mNumbers = [];

    Object.keys(fubbGroups).forEach(team => {
        Object.keys(fubbGroups[team]).forEach(category => {
            const catFubbPlayersOwn = fubbGroups[team][category].filter(p => p.isAuth === false);
            const catFubbPlayersAuth = fubbGroups[team][category].filter(p => p.isAuth === true || p.isAuth === undefined);

            const fubbDnisOwn = new Set(catFubbPlayersOwn.map(p => String(p.dni)));
            const fubbDnisAuth = new Set(catFubbPlayersAuth.map(p => String(p.dni)));

            const fbPlayersOwn = allPlayers.filter(p => p.EQUIPO === team && p.CATEGORIA === category);
            const fbPlayersAuth = allPlayers.filter(p => {
                const matchesTeam = p.EQUIPO === team || p.equipoAutorizado === team;
                const isAuthorized = (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(category));
                return matchesTeam && isAuthorized && p.CATEGORIA !== category;
            });

            const fbDnisOwn = new Set(fbPlayersOwn.map(p => String(p.DNI)));
            const fbDnisAuth = new Set(fbPlayersAuth.map(p => String(p.DNI)));

            catFubbPlayersOwn.filter(p => !fbDnisOwn.has(String(p.dni))).forEach(p => { p.view_categoria = category; p.view_equipo = team; mFirebaseOwn.push(p); });
            fbPlayersOwn.filter(p => !fubbDnisOwn.has(String(p.DNI))).forEach(p => { mFubbOwn.push({ ...p, view_categoria: category, view_equipo: team }); });

            catFubbPlayersAuth.filter(p => !fbDnisAuth.has(String(p.dni))).forEach(p => { p.view_categoria = category; p.view_equipo = team; mFirebaseAuth.push(p); });
            fbPlayersAuth.filter(p => !fubbDnisAuth.has(String(p.DNI))).forEach(p => { mFubbAuth.push({ ...p, view_categoria: category, view_equipo: team }); });

            // Detección de discrepancias en Números (Dorsales)
            const allFbPlayers = [...fbPlayersOwn, ...fbPlayersAuth];
            const allFubbPlayers = [...catFubbPlayersOwn, ...catFubbPlayersAuth];

            allFubbPlayers.forEach(fubbP => {
                const fbP = allPlayers.find(p => String(p.DNI) === String(fubbP.dni) && (p.EQUIPO === team || p.equipoAutorizado === team));
                if (fbP && fubbP.numero) {
                    const fbNum = (fbP.Numeros && fbP.Numeros[category]) || fbP.Numero || "";
                    if (String(fbNum) !== String(fubbP.numero)) {
                        mNumbers.push({
                            dni: fubbP.dni,
                            nombre: fubbP.nombre,
                            fbNum: fbNum,
                            fubbNum: fubbP.numero,
                            categoria: category,
                            equipo: team,
                            dbKey: fbP.dbKey,
                            _tipo: fbP._tipo
                        });
                    }
                }
            });
        });
    });

    renderResults(mFirebaseOwn, mFubbOwn, mFirebaseAuth, mFubbAuth, mNumbers, true);
}

function parseSmartText(text) {
    const lines = text.split('\n');
    const result = [];
    const dniRegex = /([a-zA-Z]?\s*\d{1,3}\.?\d{3}\.?\d{3}-?\d?|[a-zA-Z]?\d{7,9})/;
    const numRegex = /^(\d{1,2})[\s\-\.]+/; // Detectar número al inicio

    lines.forEach(line => {
        if (!line.trim()) return;

        const lineUpper = line.toUpperCase();
        if (lineUpper.indexOf('DIRECTOR') !== -1 || lineUpper.indexOf('TECNICO') !== -1 || lineUpper.indexOf('ENTRENADOR') !== -1 || lineUpper.indexOf('PREPARADOR') !== -1 || lineUpper.indexOf('DELEGADO') !== -1 || lineUpper.indexOf('MEDICO') !== -1 || lineUpper.indexOf('AYUDANTE') !== -1 || lineUpper.indexOf('UTILERO') !== -1 || lineUpper.indexOf('ESTADISTICO') !== -1) return;

        const numMatch = line.match(numRegex);
        const numero = numMatch ? numMatch[1] : null;

        const dniMatch = line.match(dniRegex);
        if (dniMatch) {
            const dniStr = dniMatch[0];
            const dniClean = dniStr.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

            let nombre = line.replace(dniStr, '').replace(/^\s*[\-\.]?\s*/, '').replace(/^\d+\s*/, '').trim();
            if (numero) {
                nombre = nombre.replace(new RegExp('^' + numero + '[\\s\\-\\.]+'), '').trim();
            }

            if (dniClean.length >= 7) {
                result.push({
                    dni: dniClean,
                    nombre: nombre || 'Desconocido',
                    numero: numero
                });
            }
        }
    });
    return result;
}

function runComparison(team, category) {
    const fubbPlayersOwn = fubbPlayers.filter(p => p.isAuth === false);
    const fubbPlayersAuth = fubbPlayers.filter(p => p.isAuth === true || p.isAuth === undefined);

    const fubbDnisOwn = new Set(fubbPlayersOwn.map(p => String(p.dni)));
    const fubbDnisAuth = new Set(fubbPlayersAuth.map(p => String(p.dni)));

    const fbPlayersOwn = allPlayers.filter(p => p.EQUIPO === team && p.CATEGORIA === category);
    const fbPlayersAuth = allPlayers.filter(p => {
        const matchesTeam = p.EQUIPO === team || p.equipoAutorizado === team;
        const isAuthorized = (p.categoriasAutorizadas && p.categoriasAutorizadas.includes(category));
        return matchesTeam && isAuthorized && p.CATEGORIA !== category;
    });

    const fbDnisOwn = new Set(fbPlayersOwn.map(p => String(p.DNI)));
    const fbDnisAuth = new Set(fbPlayersAuth.map(p => String(p.DNI)));

    const mFirebaseOwn = fubbPlayersOwn.filter(p => !fbDnisOwn.has(String(p.dni)));
    const mFubbOwn = fbPlayersOwn.filter(p => !fubbDnisOwn.has(String(p.DNI)));

    const mFirebaseAuth = fubbPlayersAuth.filter(p => !fbDnisAuth.has(String(p.dni)));
    const mFubbAuth = fbPlayersAuth.filter(p => !fubbDnisAuth.has(String(p.DNI)));

    // Detección de discrepancias en Números
    let mNumbers = [];
    fubbPlayers.forEach(fubbP => {
        const fbP = allPlayers.find(p => String(p.DNI) === String(fubbP.dni) && (p.EQUIPO === team || p.equipoAutorizado === team));
        if (fbP && fubbP.numero) {
            const fbNum = (fbP.Numeros && fbP.Numeros[category]) || fbP.Numero || "";
            if (String(fbNum) !== String(fubbP.numero)) {
                mNumbers.push({
                    dni: fubbP.dni,
                    nombre: fubbP.nombre,
                    fbNum: fbNum,
                    fubbNum: fubbP.numero,
                    categoria: category,
                    equipo: team,
                    dbKey: fbP.dbKey,
                    _tipo: fbP._tipo
                });
            }
        }
    });

    renderResults(mFirebaseOwn, mFubbOwn, mFirebaseAuth, mFubbAuth, mNumbers, false);
}

function renderResults(mFirebaseOwn, mFubbOwn, mFirebaseAuth, mFubbAuth, mNumbers = [], isMassive = false) {
    missingInFirebaseBodyOwn.innerHTML = '';
    missingInFubbBodyOwn.innerHTML = '';
    missingInFirebaseBodyAuth.innerHTML = '';
    missingInFubbBodyAuth.innerHTML = '';
    const missingInFirebaseBodyNums = document.getElementById('missingInFirebaseBodyNums');
    if (missingInFirebaseBodyNums) missingInFirebaseBodyNums.innerHTML = '';

    const extTotal = mFirebaseOwn.length + mFubbOwn.length + mFirebaseAuth.length + mFubbAuth.length + mNumbers.length;

    // Guardar para exportación
    lastAnalysisResults = {
        mFirebaseOwn, mFubbOwn, mFirebaseAuth, mFubbAuth, mNumbers,
        isMassive,
        season: seasonSelect.value,
        team: teamSelect.value,
        category: categorySelect.value
    };

    const pdfBtn = document.getElementById('pdfBtn');

    if (extTotal === 0) {
        if (pdfBtn) pdfBtn.classList.add('hidden');
        if (statusBadge) statusBadge.classList.remove('hidden');
        resultsContent.classList.add('hidden');
        noResultsState.classList.remove('hidden');
        noResultsState.innerHTML = `
            <div class="text-center text-green-400">
                <svg class="h-16 w-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-xl font-bold">¡Todo sincronizado!</p>
                <p class="text-sm opacity-60">Los datos de la FUBB coinciden con Firebase en ambas tablas.</p>
            </div>
        `;
    } else {
        if (pdfBtn) pdfBtn.classList.remove('hidden');
        if (statusBadge) statusBadge.classList.add('hidden');
        resultsContent.classList.remove('hidden');
        noResultsState.classList.add('hidden');

        const createFirebaseMissingRow = (p, container, isAuth) => {
            const tr = document.createElement('tr');
            tr.className = "border-t border-white/5 hover:bg-orange-500/10 transition-colors cursor-pointer group";
            tr.onclick = () => authorizePlayer(p, isMassive ? p.view_categoria : null, isMassive ? p.view_equipo : null, isAuth);
            tr.innerHTML = `
                <td class="px-4 py-3 text-center"><input type="checkbox" checked class="row-checkbox accent-orange-500" data-dni="${p.dni}" onclick="event.stopPropagation()"></td>
                <td class="px-4 py-3 font-mono text-orange-300 text-xs">${formatDni(p.dni)}</td>
                <td class="px-4 py-3">
                    <div class="font-medium">${p.nombre} ${isMassive ? '<span class="text-[10px] bg-indigo-900/60 text-indigo-200 px-1 rounded ml-1">' + p.view_equipo + '</span><span class="text-[10px] bg-orange-900/60 px-1 rounded ml-1">' + p.view_categoria + '</span>' : ''}</div>
                    <div class="text-[10px] text-gray-500">${isAuth ? 'Haz clic para autorizar como refuerzo' : 'Haz clic para vincular propio'}</div>
                </td>
                <td class="px-4 py-3 text-right">
                    <button class="bg-orange-600/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-lg text-[10px] font-bold group-hover:bg-orange-600 group-hover:text-white transition-all">
                        Vincular
                    </button>
                </td>
            `;
            container.appendChild(tr);
        };

        const createFubbMissingRow = (p, container, isAuth) => {
            const tr = document.createElement('tr');
            tr.className = "border-t border-white/5 hover:bg-blue-500/10 transition-colors cursor-pointer group";
            tr.onclick = () => removeAuthorization(p, isMassive ? p.view_categoria : null, isAuth);
            tr.innerHTML = `
                <td class="px-4 py-3 text-center"><input type="checkbox" checked class="row-checkbox accent-blue-500" data-dni="${p.DNI}" onclick="event.stopPropagation()"></td>
                <td class="px-4 py-3 font-mono text-blue-300 text-xs">${formatDni(p.DNI)}</td>
                <td class="px-4 py-3">
                    <div class="font-medium">${p.NOMBRE} ${isMassive ? '<span class="text-[10px] bg-indigo-900/60 text-indigo-200 px-1 rounded ml-1">' + p.view_equipo + '</span><span class="text-[10px] bg-blue-900/60 px-1 rounded ml-1">' + p.view_categoria + '</span>' : ''}</div>
                    <div class="text-[10px] text-gray-500">${isAuth ? 'Haz clic para quitar autorización' : 'Haz clic para desvincular'}</div>
                </td>
                <td class="px-4 py-3 text-right">
                    <button class="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-lg text-[10px] font-bold group-hover:bg-blue-600 group-hover:text-white transition-all">
                        Quitar
                    </button>
                </td>
            `;
            container.appendChild(tr);
        };

        const createNumberMissingRow = (numObj, container) => {
            const tr = document.createElement('tr');
            tr.className = "border-t border-white/5 hover:bg-amber-500/10 transition-colors cursor-pointer group";
            tr.onclick = () => updatePlayerNumber(numObj.dbKey, numObj.dni, numObj.fubbNum, numObj.categoria, numObj._tipo);
            tr.innerHTML = `
                <td class="px-4 py-3 text-center"><input type="checkbox" checked class="row-checkbox accent-amber-500" data-dni="${numObj.dni}" data-cat="${numObj.categoria}" onclick="event.stopPropagation()"></td>
                <td class="px-4 py-3">
                    <div class="font-medium">${numObj.nombre} <span class="text-[10px] bg-orange-900/60 px-1 rounded ml-1">${numObj.categoria}</span></div>
                    <div class="text-[10px] text-gray-500">DNI: ${formatDni(numObj.dni)}</div>
                </td>
                <td class="px-4 py-3 font-mono text-gray-400 text-xs text-center">${numObj.fbNum || '---'}</td>
                <td class="px-4 py-3 font-mono text-amber-300 text-xs text-center font-bold">${numObj.fubbNum}</td>
                <td class="px-4 py-3 text-right">
                    <button class="bg-amber-600/20 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-lg text-[10px] font-bold group-hover:bg-amber-600 group-hover:text-white transition-all">
                        Vincular
                    </button>
                </td>
            `;
            container.appendChild(tr);
        };

        mFirebaseOwn.forEach(p => createFirebaseMissingRow(p, missingInFirebaseBodyOwn, false));
        mFubbOwn.forEach(p => createFubbMissingRow(p, missingInFubbBodyOwn, false));
        mFirebaseAuth.forEach(p => createFirebaseMissingRow(p, missingInFirebaseBodyAuth, true));
        mFubbAuth.forEach(p => createFubbMissingRow(p, missingInFubbBodyAuth, true));
        if (missingInFirebaseBodyNums) mNumbers.forEach(n => createNumberMissingRow(n, missingInFirebaseBodyNums));

        const btnTabOwn = document.getElementById('btnTabOwn');
        const btnTabAuth = document.getElementById('btnTabAuth');
        const btnTabNums = document.getElementById('btnTabNums');
        if (btnTabOwn) btnTabOwn.innerHTML = `Jugadores Propios <span class="ml-2 bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full text-xs">${mFirebaseOwn.length + mFubbOwn.length}</span>`;
        if (btnTabAuth) btnTabAuth.innerHTML = `Jugadores Autorizados <span class="ml-2 bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full text-xs">${mFirebaseAuth.length + mFubbAuth.length}</span>`;
        if (btnTabNums) {
            btnTabNums.innerHTML = `Números <span class="ml-2 bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full text-xs">${mNumbers.length}</span>`;
            if (mNumbers.length > 0) btnTabNums.classList.remove('hidden');
            else btnTabNums.classList.add('hidden');
        }

        window._currentMissingOwn = mFirebaseOwn;
        window._currentMissingAuth = mFirebaseAuth;
        window._currentMismatchedNumbers = mNumbers;
    }
}

function formatDni(dni) {
    return String(dni);
}

async function authorizePlayer(fubbPlayer, overrideCategory = null, overrideTeam = null, asAuth = true) {
    const season = seasonSelect.value;
    const team = overrideTeam || teamSelect.value || (fubbPlayer ? fubbPlayer.equipo : null) || (fubbPlayer ? fubbPlayer.view_equipo : null);
    const category = overrideCategory || categorySelect.value;
    const dni = String(fubbPlayer.dni);

    const titleAction = asAuth ? 'autorizar' : 'vincular como PROPIO';
    if (!confirm(`¿Deseas ${titleAction} a ${fubbPlayer.nombre} (${dni}) para ${team} en la categoría ${category}?`)) return;

    try {
        showToast("Procesando...", "info");

        const existingInSeason = allPlayers.find(p => p.DNI === dni);

        if (existingInSeason) {
            const currentCat = existingInSeason.CATEGORIA || "";
            const cats = existingInSeason.categoriasAutorizadas || [];
            const currentNum = (existingInSeason.Numeros && existingInSeason.Numeros[category]) || existingInSeason.Numero || "";
            const isClubPropio = (existingInSeason.EQUIPO === team && currentCat !== "");

            const updates = {};
            // Si la FUBB trae número y Firebase no tiene para esta categoría, lo asignamos
            if (fubbPlayer.numero && !currentNum) {
                const newNumeros = { ...(existingInSeason.Numeros || {}) };
                newNumeros[category] = fubbPlayer.numero;
                updates.Numero = fubbPlayer.numero;
                updates.Numeros = newNumeros;
            }

            if (asAuth) {
                // Vincular como Autorizado
                if (!cats.includes(category) && currentCat !== category) {
                    cats.push(category);
                }
                updates.categoriasAutorizadas = cats;
                updates.equipoAutorizado = team;
                // Solo es "Autorizado" (refuerzo) si NO es ya propio del club
                updates.esAutorizado = !isClubPropio;

                await database.ref(`/registrosPorTemporada/${season}/${existingInSeason.dbKey}`).update(updates);
                await database.ref(`/${existingInSeason._tipo}/${dni}/temporadas/${season}/${existingInSeason.dbKey}`).update(updates);
            } else {
                // Vincular como Propio
                if (currentCat && currentCat !== category) {
                    // Ya tiene otra categoría principal, lo autorizamos en esta nueva pero sigue siendo propio
                    if (!cats.includes(category)) {
                        cats.push(category);
                    }
                    updates.categoriasAutorizadas = cats;
                    updates.equipoAutorizado = team;
                    updates.esAutorizado = false; // Sigue siendo propio

                    await database.ref(`/registrosPorTemporada/${season}/${existingInSeason.dbKey}`).update(updates);
                    await database.ref(`/${existingInSeason._tipo}/${dni}/temporadas/${season}/${existingInSeason.dbKey}`).update(updates);
                    showToast(`Jugador ya propio de ${currentCat}. Vinculado como autorizado en ${category}.`, "info");
                } else {
                    // Misma categoría o primera vez: Establecer como propio
                    updates.CATEGORIA = category;
                    updates.EQUIPO = team;
                    updates.esAutorizado = false;
                    // Limpiar de autorizadas si estaba por error
                    updates.categoriasAutorizadas = cats.filter(c => c !== category);

                    await database.ref(`/registrosPorTemporada/${season}/${existingInSeason.dbKey}`).update(updates);
                    await database.ref(`/${existingInSeason._tipo}/${dni}/temporadas/${season}/${existingInSeason.dbKey}`).update(updates);
                }
            }
        } else {
            const snapshot = await database.ref(`/jugadores/${dni}/datosPersonales`).once('value');
            if (!snapshot.exists()) {
                showToast("El jugador no existe en global (/jugadores). Por favor, regístralo primero.", "error");
                return;
            }

            const personalData = snapshot.val();

            const newRecord = {
                DNI: dni,
                NOMBRE: personalData.NOMBRE || fubbPlayer.nombre,
                EQUIPO: team,
                CATEGORIA: category,
                _tipo: 'jugadores'
            };

            if (fubbPlayer.numero) {
                newRecord.Numero = fubbPlayer.numero;
                newRecord.Numeros = {};
                newRecord.Numeros[category] = fubbPlayer.numero;
            }

            if (asAuth) {
                newRecord.esAutorizado = true;
                newRecord.equipoAutorizado = team;
                newRecord.categoriasAutorizadas = [category];
            }

            const newRef = await database.ref(`/registrosPorTemporada/${season}`).push(newRecord);
            // También al nodo canónico
            await database.ref(`/jugadores/${dni}/temporadas/${season}/${newRef.key}`).set(newRecord);
        }

        showToast("¡Jugador procesado correctamente!", "success");
        await loadPlayersForSeason(season);
        if (fubbDataInput.value.trim().length > 0) compareBtn.click();

    } catch (e) {
        console.error("Error al procesar:", e);
        showToast("Error al procesar en Firebase", "error");
    }
}

async function updatePlayerNumber(pushId, dni, nuevoNumero, categoria, tipo = 'jugadores') {
    const season = seasonSelect.value;
    if (!confirm(`¿Vincular número ${nuevoNumero} a ${dni} en la categoría ${categoria}?`)) return;

    try {
        showToast("Actualizando número...", "info");

        const snap = await database.ref(`/registrosPorTemporada/${season}/${pushId}`).once('value');
        const data = snap.val() || {};
        const newNumeros = { ...(data.Numeros || {}) };
        newNumeros[categoria] = nuevoNumero;

        const updates = {
            Numero: nuevoNumero,
            Numeros: newNumeros
        };

        await database.ref(`/registrosPorTemporada/${season}/${pushId}`).update(updates);
        await database.ref(`/${tipo}/${dni}/temporadas/${season}/${pushId}`).update(updates);

        showToast("Número actualizado", "success");
        await loadPlayersForSeason(season);
        if (fubbDataInput.value.trim().length > 0) compareBtn.click();
    } catch (e) {
        console.error(e);
        showToast("Error al actualizar número", "error");
    }
}

async function syncAllNumbers() {
    const records = window._currentMismatchedNumbers || [];
    if (records.length === 0) return;

    // Filtrar por selección de checkbox
    const container = document.getElementById('missingInFirebaseBodyNums');
    const checkedDnis = Array.from(container.querySelectorAll('.row-checkbox:checked')).map(cb => ({ dni: cb.dataset.dni, cat: cb.dataset.cat }));
    const filteredRecords = records.filter(rec => checkedDnis.some(c => String(c.dni) === String(rec.dni) && c.cat === rec.categoria));

    if (filteredRecords.length === 0) {
        showToast("No hay registros seleccionados para vincular.", "warning");
        return;
    }

    if (!confirm(`¿Vincular los ${filteredRecords.length} números seleccionados automáticamente?`)) return;

    try {
        showToast(`Procesando ${filteredRecords.length} números...`, "info");
        const season = seasonSelect.value;
        const updates = {};

        for (const rec of filteredRecords) {
            const snap = await database.ref(`/registrosPorTemporada/${season}/${rec.dbKey}`).once('value');
            const currentData = snap.val() || {};
            const newNumeros = { ...(currentData.Numeros || {}) };
            newNumeros[rec.categoria] = rec.fubbNum;

            updates[`/registrosPorTemporada/${season}/${rec.dbKey}/Numero`] = rec.fubbNum;
            updates[`/registrosPorTemporada/${season}/${rec.dbKey}/Numeros`] = newNumeros;
            updates[`/${rec._tipo || 'jugadores'}/${rec.dni}/temporadas/${season}/${rec.dbKey}/Numero`] = rec.fubbNum;
            updates[`/${rec._tipo || 'jugadores'}/${rec.dni}/temporadas/${season}/${rec.dbKey}/Numeros`] = newNumeros;
        }

        await database.ref().update(updates);
        showToast(`¡${filteredRecords.length} números sincronizados!`, "success");
        await loadPlayersForSeason(season);
        if (fubbDataInput.value.trim().length > 0) compareBtn.click();
    } catch (e) {
        console.error(e);
        showToast("Error en sincronización masiva", "error");
    }
}

async function removeAuthorization(player, overrideCategory = null, asAuth = true) {
    const season = seasonSelect.value;
    const category = overrideCategory || categorySelect.value;

    const actionText = asAuth ? 'QUITAR la autorización' : 'DESVINCULAR de los propios';
    if (!confirm(`¿Deseas ${actionText} a ${player.NOMBRE} para la categoría ${category}?`)) return;

    try {
        showToast("Procesando...", "info");

        let shouldRemove = false;
        let updates = {};

        if (asAuth) {
            let cats = player.categoriasAutorizadas || [];
            cats = cats.filter(c => c !== category);

            if (cats.length === 0) {
                // Sin más autorizaciones: si tampoco tiene categoría propia válida, eliminar el nodo completo
                const isPropio = player.CATEGORIA && player.CATEGORIA !== "";
                if (!isPropio) {
                    shouldRemove = true;
                } else {
                    // Tiene categoría propia → solo limpiar los campos de autorización
                    updates = {
                        categoriasAutorizadas: [],
                        esAutorizado: false,
                        equipoAutorizado: ""
                    };
                }
            } else {
                // Aún quedan autorizaciones → solo actualizar la lista
                updates = {
                    categoriasAutorizadas: cats
                };
                // Si es propio, asegurar que esAutorizado sea siempre false
                if (player.CATEGORIA && player.CATEGORIA !== "") {
                    updates.esAutorizado = false;
                }
            }
        } else {
            // Regla de Negocio: si deja de ser propio, automáticamente deja de ser autorizado (limpiar todo)
            // Para evitar dejar un nodo vacío sin rol, borramos el "registro" pero mantenemos la lógica solicitada
            updates = {
                CATEGORIA: "",
                categoriasAutorizadas: [],
                esAutorizado: false,
                equipoAutorizado: ""
            };
            shouldRemove = true; // Por ahora el flujo borra el nodo si deja de ser propio para no dejar basura
        }

        if (shouldRemove) {
            // Eliminar de Firebase para no acumular basura (arrastrando cualquier autorización previa si la hubiera)
            await database.ref(`/registrosPorTemporada/${season}/${player.dbKey}`).remove();
        } else {
            // Solo actualizamos (mantiene su llave) si aún le quedan asignaciones funcionales (ej: quitamos autorización pero sigue en categoría propia)
            await database.ref(`/registrosPorTemporada/${season}/${player.dbKey}`).update(updates);
        }

        showToast("Acción completada", "success");
        await loadPlayersForSeason(season);
        if (fubbDataInput.value.trim().length > 0) compareBtn.click();
    } catch (e) {
        console.error("Error al quitar/desvincular:", e);
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

async function syncAllMissing(asAuth = false) {
    const players = asAuth ? window._currentMissingAuth : window._currentMissingOwn;
    if (!players || players.length === 0) return;

    // Filtrar por selección de checkbox
    const containerId = asAuth ? 'missingInFirebaseBodyAuth' : 'missingInFirebaseBodyOwn';
    const container = document.getElementById(containerId);
    const checkedDnis = Array.from(container.querySelectorAll('.row-checkbox:checked')).map(cb => String(cb.dataset.dni));
    const filteredPlayers = players.filter(p => checkedDnis.includes(String(p.dni)));

    if (filteredPlayers.length === 0) {
        showToast("No hay jugadores seleccionados para vincular.", "warning");
        return;
    }

    const typeLabel = asAuth ? 'autorizados' : 'propios';
    if (!confirm(`¿Deseas vincular los ${filteredPlayers.length} jugadores ${typeLabel} seleccionados?`)) return;

    try {
        const season = seasonSelect.value;
        const updates = {};
        let count = 0;
        let skipped = 0;

        showToast(`Procesando ${filteredPlayers.length} jugadores...`, "info");

        for (const p of filteredPlayers) {
            const dni = String(p.dni);
            const team = p.view_equipo || teamSelect.value;
            const category = p.view_categoria || categorySelect.value;

            const existingInSeason = allPlayers.find(rec => String(rec.DNI) === dni);

            if (existingInSeason) {
                // Ya tiene registro en la temporada -> Actualizar
                const currentCat = existingInSeason.CATEGORIA || "";
                const cats = existingInSeason.categoriasAutorizadas || [];
                const isClubPropio = (existingInSeason.EQUIPO === team && currentCat !== "");

                const up = {};
                if (asAuth) {
                    if (!cats.includes(category) && currentCat !== category) {
                        cats.push(category);
                    }
                    up.categoriasAutorizadas = cats;
                    up.equipoAutorizado = team;
                    up.esAutorizado = !isClubPropio;
                } else {
                    if (currentCat && currentCat !== category) {
                        if (!cats.includes(category)) cats.push(category);
                        up.categoriasAutorizadas = cats;
                        up.equipoAutorizado = team;
                        up.esAutorizado = false;
                    } else {
                        up.CATEGORIA = category;
                        up.EQUIPO = team;
                        up.esAutorizado = false;
                        up.categoriasAutorizadas = cats.filter(c => c !== category);
                    }
                }

                // Número
                if (p.numero) {
                    const newNumeros = { ...(existingInSeason.Numeros || {}) };
                    newNumeros[category] = p.numero;
                    up.Numero = p.numero;
                    up.Numeros = newNumeros;
                }

                const originalRecord = (window._rawFirebaseRecords && window._rawFirebaseRecords[existingInSeason.dbKey]) || existingInSeason;
                updates[`/registrosPorTemporada/${season}/${existingInSeason.dbKey}`] = { ...originalRecord, ...up };
                updates[`/${existingInSeason._tipo || 'jugadores'}/${dni}/temporadas/${season}/${existingInSeason.dbKey}`] = { ...originalRecord, ...up };
                count++;

            } else {
                // No tiene registro en la temporada -> Verificar global
                const snap = await database.ref(`/jugadores/${dni}/datosPersonales`).once('value');
                if (snap.exists()) {
                    const personalData = snap.val();
                    const newId = database.ref(`/registrosPorTemporada/${season}`).push().key;

                    const newRecord = {
                        DNI: dni,
                        NOMBRE: personalData.NOMBRE || p.nombre,
                        EQUIPO: team,
                        CATEGORIA: asAuth ? "" : category,
                        _tipo: 'jugadores',
                        dbKey: newId,
                        _pushId: newId,
                        _dni: dni
                    };

                    if (p.numero) {
                        newRecord.Numero = p.numero;
                        newRecord.Numeros = {};
                        newRecord.Numeros[category] = p.numero;
                    }

                    if (asAuth) {
                        newRecord.esAutorizado = true;
                        newRecord.equipoAutorizado = team;
                        newRecord.categoriasAutorizadas = [category];
                    } else {
                        newRecord.esAutorizado = false;
                        newRecord.categoriasAutorizadas = [];
                    }

                    updates[`/registrosPorTemporada/${season}/${newId}`] = newRecord;
                    updates[`/jugadores/${dni}/temporadas/${season}/${newId}`] = newRecord;
                    count++;
                } else {
                    skipped++;
                }
            }
        }

        if (count > 0) {
            await database.ref().update(updates);
            showToast(`¡Sincronización completa! ${count} registros afectados.`, "success");
            if (skipped > 0) showToast(`${skipped} jugadores no encontrados en el sistema global.`, "warning");
            await loadPlayersForSeason(season);
            if (fubbDataInput.value.trim().length > 0) compareBtn.click();
        } else {
            showToast("No se pudo vincular a nadie. Asegúrate que existan en el sistema global.", "error");
        }

    } catch (e) {
        console.error(e);
        showToast("Error en vinculación masiva", "error");
    }
}

function toggleAllCheckboxes(master, bodyId) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    const checkboxes = body.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => cb.checked = master.checked);
}

// Auto Team Fix
fubbDataInput.addEventListener('input', () => {
    try {
        const val = fubbDataInput.value.trim();
        if (val.startsWith('[')) {
            const arr = JSON.parse(val);
            if (arr.length && arr[0].equipo) {
                const teams = [...new Set(arr.map(p => p.equipo))].sort();
                let current = teamSelect.value;

                const existingOptions = Array.from(teamSelect.options).map(o => o.value);
                teams.forEach(t => {
                    if (!existingOptions.includes(t)) {
                        teamSelect.appendChild(new Option(t, t));
                    }
                });

                if (teams.includes(current)) teamSelect.value = current;
                showToast("Modo Masivo Detectado. Hemos cargado los equipos, selecciona el tuyo.", "info");
            }
        }
    } catch (e) { }
});

/**
 * Genera un reporte PDF profesional con las discrepancias encontradas.
 */
async function exportToPDF() {
    if (!lastAnalysisResults) {
        showToast("No hay resultados para exportar", "error");
        return;
    }

    const { mFirebaseOwn, mFubbOwn, mFirebaseAuth, mFubbAuth, mNumbers, isMassive, season, team, category } = lastAnalysisResults;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const logoUrl = 'https://raw.githubusercontent.com/appsparavos-ops/DSC/fotos/Defensor_SportingCuad.png';

    // Función para dibujar el encabezado
    const drawHeader = (data) => {
        // Fondo del encabezado (opcional, estilo premium)
        doc.setFillColor(30, 27, 75); // Indigo oscuro del club
        doc.rect(0, 0, 210, 40, 'F');

        // Logo
        try {
            doc.addImage(logoUrl, 'PNG', 15, 5, 25, 25);
        } catch (e) {
            console.warn("No se pudo cargar el logo en el PDF", e);
        }

        // Títulos
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('Defensor Sporting Club', 50, 18);

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text('Informe de Discrepancias FUBB vs Firebase', 50, 26);

        doc.setFontSize(10);
        const fecha = new Date().toLocaleString();
        doc.text(`Generado el: ${fecha}`, 150, 35);
    };

    drawHeader();

    // Información del contexto
    let y = 50;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Temporada: ${season || 'N/A'}`, 15, y);
    y += 7;
    doc.text(`Equipo: ${team || (isMassive ? 'Múltiples' : 'N/A')}`, 15, y);
    if (!isMassive) {
        y += 7;
        doc.text(`Categoría: ${category || 'N/A'}`, 15, y);
    }
    y += 10;

    // Función auxiliar para tablas
    const addSection = (title, data, columns, color) => {
        if (data.length === 0) return;

        doc.setFontSize(14);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(title, 15, y);
        y += 5;

        doc.autoTable({
            startY: y,
            head: [columns],
            body: data,
            theme: 'striped',
            headStyles: { fillColor: color },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            margin: { left: 15, right: 15 },
            didDrawPage: (data) => {
                y = data.cursor.y + 15;
            }
        });
        y = doc.lastAutoTable.finalY + 15;
    };

    // 1. Propios Faltantes en Firebase
    addSection(
        'Jugadores de la Categoría: Faltan en la Base de Datos',
        mFirebaseOwn.map((p, i) => [i + 1, formatDni(p.dni), p.nombre, p.view_equipo || p.equipo || team || '---', p.view_categoria || category || '---']),
        ['#', 'DNI', 'Nombre', 'Equipo', 'Categoría'],
        [249, 115, 22] // Naranja
    );

    // 2. Propios Sobrantes en Firebase
    addSection(
        'Jugadores de la Categoría: No figuran en FUBB',
        mFubbOwn.map((p, i) => [i + 1, formatDni(p.DNI), p.NOMBRE, p.view_equipo || p.EQUIPO || team || '---', p.view_categoria || category || '---']),
        ['#', 'DNI', 'Nombre', 'Equipo', 'Categoría'],
        [37, 99, 235] // Azul
    );

    // 3. Autorizados Faltantes en Firebase
    addSection(
        'Jugadores Autorizados: Faltan en Firebase',
        mFirebaseAuth.map((p, i) => [i + 1, formatDni(p.dni), p.nombre, p.view_equipo || p.equipo || team || '---', p.view_categoria || category || '---']),
        ['#', 'DNI', 'Nombre', 'Equipo', 'Categoría'],
        [220, 38, 38] // Rojo
    );

    // 4. Autorizados Sobrantes en Firebase
    addSection(
        'Jugadores Autorizados: No figuran en FUBB',
        mFubbAuth.map((p, i) => [i + 1, formatDni(p.DNI), p.NOMBRE, p.view_equipo || p.EQUIPO || team || '---', p.view_categoria || category || '---']),
        ['#', 'DNI', 'Nombre', 'Equipo', 'Categoría'],
        [79, 70, 229] // Indigo
    );


    // Guardar el PDF
    const filename = `Reporte_Diferencias_${season}_${team || 'Club'}_${new Date().getTime()}.pdf`;
    doc.save(filename);
    showToast("PDF generado con éxito", "success");
}
