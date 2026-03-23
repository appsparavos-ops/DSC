/**
 * Servicio de Firebase para Auth y Database.
 */
import { getTimestampKey, deduceGender } from './utils.js';

// Inicializar Firebase si aún no se ha hecho
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const database = firebase.database();
const auth = firebase.auth();

export function logAction(action, details) {
    const user = auth.currentUser;
    if (!user) return;

    const timestampKey = getTimestampKey();
    const logEntry = {
        usuario: user.email,
        uid: user.uid,
        accion: action,
        fecha: new Date().toISOString(),
        detalles: details
    };

    return database.ref(`/bitacora/${timestampKey}`).set(logEntry);
}

export async function uploadSeasonData(data, manualSeason, progressCallback) {
    const temporadaRef = database.ref(`registrosPorTemporada/${manualSeason}`);
    let existingRecords = {};

    const snapshot = await temporadaRef.once('value');
    const val = snapshot.val() || {};
    const unmatchedPushIds = new Set(Object.keys(val));

    Object.values(val).forEach(record => {
        const dni = record._dni || record.DNI;
        if (dni) {
            if (!existingRecords[dni]) existingRecords[dni] = [];
            existingRecords[dni].push(record);
        }
    });

    // --- PRE-FETCH GÉNEROS EXISTENTES ---
    const existingGenders = {};
    try {
        const [jugadoresSnap, entrenadoresSnap] = await Promise.all([
            database.ref('jugadores').once('value'),
            database.ref('entrenadores').once('value')
        ]);
        const jVal = jugadoresSnap.val() || {};
        const eVal = entrenadoresSnap.val() || {};
        Object.keys(jVal).forEach(d => { if (jVal[d].datosPersonales?.genero) existingGenders[d] = jVal[d].datosPersonales.genero; });
        Object.keys(eVal).forEach(d => { if (eVal[d].datosPersonales?.genero) existingGenders[d] = eVal[d].datosPersonales.genero; });
    } catch (e) {
        console.error("Error pre-fetching genders:", e);
    }

    const allUpdates = {};
    let processedCount = 0;
    let skippedCount = 0;

    // Trackers for PDF report
    const addedRecords = [];
    const modifiedRecords = [];
    const removedRecords = [];

    const personalKeys = ['DNI', 'NOMBRE', 'FECHA NACIMIENTO', 'NACIONALIDAD', 'TELEFONO', 'EMAIL', 'FM Desde', 'FM Hasta', 'genero'];
    const seasonalKeys = ['COMPETICION', 'CATEGORIA', 'EQUIPO', 'ESTADO LICENCIA', 'FECHA_ALTA', 'BAJA', 'TIPO', 'TEMPORADA', 'Numero', 'Numeros', 'categoriasAutorizadas'];

    data.forEach(row => {
        const isCoach = row.TIPO.trim().toUpperCase() === 'ENTRENADOR/A';
        const rootNode = isCoach ? 'entrenadores' : 'jugadores';
        const dni = row.DNI.trim();
        const temporada = manualSeason;
        const categoria = row.CATEGORIA ? row.CATEGORIA.trim() : '';
        const estadoLicencia = row['ESTADO LICENCIA'] ? row['ESTADO LICENCIA'].trim() : '';

        let targetPushId = null;
        let accumulatedNumeros = {};

        if (existingRecords[dni]) {
            existingRecords[dni].forEach(r => {
                if (r.Numeros) Object.assign(accumulatedNumeros, r.Numeros);
                else if (r.Numero && r.CATEGORIA) accumulatedNumeros[r.CATEGORIA] = r.Numero;
            });

            const match = existingRecords[dni].find(r => {
                const isCoachMatch = r._tipo === 'entrenadores' || (r.TIPO && r.TIPO.trim().toUpperCase() === 'ENTRENADOR/A');
                if (isCoach && isCoachMatch) {
                    // Para entrenadores, deben coincidir categoría Y fecha (ALTA o LICencia)
                    const rowFecha = row.FECHA_ALTA || '';
                    const recFecha = r.FECHA_ALTA || r.FECHA_LIC || '';
                    return r.CATEGORIA === categoria && recFecha === rowFecha;
                }
                // Para jugadores, solo importa la categoría en la temporada
                return r.CATEGORIA === categoria;
            });
            if (match) {
                unmatchedPushIds.delete(match._pushId);
                const recEstado = match['ESTADO LICENCIA'] || '';
                const recEquipo = match['EQUIPO'] || '';
                const rowEquipo = row['EQUIPO'] ? row['EQUIPO'].trim() : '';

                if (recEstado === estadoLicencia && recEquipo === rowEquipo) {
                    skippedCount++;
                    return;
                }

                // Track modified record
                modifiedRecords.push({
                    nombre: row.NOMBRE || existingRecords[dni][0].NOMBRE || 'N/A',
                    dni: dni,
                    categoria: categoria,
                    cambio: `Equipo: ${recEquipo} -> ${rowEquipo} | Licencia: ${recEstado} -> ${estadoLicencia}`
                });
                targetPushId = match._pushId;
            }
        }

        // Deducir género solo si no está disponible en datosPersonales (para no sobrescribir correcciones manuales)
        const currentGender = existingGenders[dni];
        if (row.NOMBRE && !currentGender) {
            const deduced = deduceGender(row.NOMBRE, categoria);
            if (deduced) row.genero = deduced;
        }

        if (!targetPushId) {
            // Track added record
            addedRecords.push({
                nombre: row.NOMBRE || existingRecords[dni]?.[0]?.NOMBRE || 'N/A',
                dni: dni,
                equipo: row['EQUIPO'] ? row['EQUIPO'].trim() : '',
                categoria: categoria
            });
        }

        const seasonalData = {};
        personalKeys.forEach(key => {
            if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
                allUpdates[`/${rootNode}/${dni}/datosPersonales/${key}`] = row[key];
            }
        });
        seasonalKeys.forEach(key => {
            if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
                seasonalData[key] = row[key];
            }
        });
        seasonalData.TEMPORADA = temporada;

        if (seasonalData.Numero) accumulatedNumeros[categoria] = seasonalData.Numero;
        if (Object.keys(accumulatedNumeros).length > 0) seasonalData.Numeros = accumulatedNumeros;
        delete seasonalData.Numero;

        const newPushKey = targetPushId || database.ref().child(rootNode).child(dni).child('temporadas').child(temporada).push().key;
        const firebaseKey = `${dni}|${newPushKey}`;

        const combinedDataForIndex = {
            ...seasonalData,
            _firebaseKey: firebaseKey,
            _tipo: rootNode,
            _dni: dni,
            _pushId: newPushKey,
            NOMBRE: row.NOMBRE || ''
        };

        allUpdates[`/${rootNode}/${dni}/temporadas/${temporada}/${newPushKey}`] = seasonalData;
        allUpdates[`/registrosPorTemporada/${temporada}/${newPushKey}`] = combinedDataForIndex;
        allUpdates[`/temporadas/${temporada}`] = true;

        processedCount++;
    });

    // Procesar registros que están en Firebase pero no en el CSV (Marcar como SIN INSCRIBIR)
    unmatchedPushIds.forEach(pushId => {
        const record = val[pushId];
        // Solo actualizar si no está ya marcado como SIN INSCRIBIR
        if (record['ESTADO LICENCIA'] !== 'SIN INSCRIBIR') {
            const dni = record._dni || record.DNI;
            const type = record._tipo || (record.TIPO?.trim().toUpperCase() === 'ENTRENADOR/A' ? 'entrenadores' : 'jugadores');

            allUpdates[`/${type}/${dni}/temporadas/${manualSeason}/${pushId}/ESTADO LICENCIA`] = 'SIN INSCRIBIR';
            allUpdates[`/registrosPorTemporada/${manualSeason}/${pushId}/ESTADO LICENCIA`] = 'SIN INSCRIBIR';

            // Track removed record
            removedRecords.push({
                nombre: record.NOMBRE || 'N/A',
                dni: dni,
                equipo: record.EQUIPO || 'N/A',
                categoria: record.CATEGORIA || 'N/A'
            });
        }
    });

    if (Object.keys(allUpdates).length > 0) {
        await database.ref().update(allUpdates);
        await logAction('upload_season_data', { season: manualSeason, processed: processedCount, skipped: skippedCount });
    }

    return { processedCount, skippedCount, addedRecords, modifiedRecords, removedRecords };
}

export async function searchRecordsBySeason(season, query) {
    const database = firebase.database();
    const temporadaRef = database.ref(`registrosPorTemporada/${season}`);
    const snapshot = await temporadaRef.once('value');

    if (!snapshot.exists()) return [];

    const allRecords = [];
    const dnisToResolve = new Set();

    snapshot.forEach(childSnapshot => {
        const record = childSnapshot.val();
        allRecords.push(record);
        if (!record.NOMBRE) {
            const dni = record._dni || record.DNI;
            if (dni) dnisToResolve.add(dni);
        }
    });

    const resolvedNames = {};
    if (dnisToResolve.size > 0) {
        // Resolver nombres faltantes desde datosPersonales
        const resolutionPromises = Array.from(dnisToResolve).map(async (dni) => {
            let nameSnap = await database.ref(`jugadores/${dni}/datosPersonales/NOMBRE`).once('value');
            if (!nameSnap.exists()) {
                nameSnap = await database.ref(`entrenadores/${dni}/datosPersonales/NOMBRE`).once('value');
            }
            if (nameSnap.exists()) {
                resolvedNames[dni] = nameSnap.val();
            }
        });
        await Promise.all(resolutionPromises);
    }

    const records = [];
    const lowerQuery = query.toLowerCase().trim();

    allRecords.forEach(record => {
        const dniVal = record._dni || record.DNI || '';
        const nameVal = record.NOMBRE || resolvedNames[dniVal] || '';

        if (dniVal.toLowerCase().includes(lowerQuery) || nameVal.toLowerCase().includes(lowerQuery)) {
            records.push({
                ...record,
                NOMBRE: nameVal // Aseguramos que el registro tenga el nombre para mostrar
            });
        }
    });

    return records;
}



export async function deleteSeasonRecord(season, dni, type, pushId) {
    const updates = {};
    updates[`/registrosPorTemporada/${season}/${pushId}`] = null;
    updates[`/${type}/${dni}/temporadas/${season}/${pushId}`] = null;

    await database.ref().update(updates);
    await logAction('delete_record', { season, dni, type, pushId });
}

export async function getSeasons() {
    const snapshot = await database.ref('temporadas').once('value');
    if (!snapshot.exists()) return [];
    return Object.keys(snapshot.val()).sort((a, b) => b.localeCompare(a)); // Orden descendente (ej. 2025, 2024...)
}

export async function getUserPreference(uid) {
    const snapshot = await database.ref(`preferenciasUsuarios/${uid}/ultimaTemporadaSeleccionada`).once('value');
    return snapshot.val() || null;
}

/**
 * Sube datos de pases a /pases/{NIF} aplicando lógica de 4 casos para duplicados.
 * @param {Array} data - Registros filtrados del CSV (salida de filterLatestPases.filtered)
 * @param {Map} pendientes - Map NIF → registro pendiente (salida de filterLatestPases.pendientes)
 * @returns {{ uploaded, skipped, pendingSaved }}
 */
export async function uploadPasesData(data, pendientes) {
    const pasesRef = database.ref('pases');
    const snapshot = await pasesRef.once('value');
    const existingPases = snapshot.val() || {};

    const allUpdates = {};
    let uploaded = 0;
    let skipped = 0;
    let pendingSaved = 0;

    const internalKeys = ['NUEVA SOLICITUD'];

    function cleanForPending(record) {
        const clean = {};
        for (const key of Object.keys(record)) {
            if (!internalKeys.includes(key)) clean[key] = record[key];
        }
        return clean;
    }

    function isSame(o1, o2) {
        return JSON.stringify(o1) === JSON.stringify(o2);
    }

    // 1. NIFs con pase activo en el CSV (data ya filtrado con lo más reciente)
    data.forEach(row => {
        const nif = (row.NIF || row.DNI || '').trim();
        if (!nif) return;

        const record = { ...row };
        if (pendientes.has(nif)) {
            record['NUEVA SOLICITUD'] = cleanForPending(pendientes.get(nif));
            pendingSaved++;
        }

        const existing = existingPases[nif];
        // Si es idéntico a lo que ya hay (incluyendo la ausencia de NUEVA SOLICITUD), saltar
        if (existing && isSame(record, existing)) {
            skipped++;
            return;
        }

        allUpdates[`/pases/${nif}`] = record;
        uploaded++;
    });

    // 2. NIFs que SOLO tienen solicitud pendiente (sin pase activo nuevo en el CSV)
    pendientes.forEach((pendingRow, nif) => {
        // Si ya se procesó en el paso 1, omitir
        if (data.some(r => (r.NIF || r.DNI || '').trim() === nif)) return;

        const existing = existingPases[nif];
        const pendingData = cleanForPending(pendingRow);

        if (existing) {
            // Solo actualizamos el sub-nodo de solicitud si es diferente
            if (existing['NUEVA SOLICITUD'] && isSame(existing['NUEVA SOLICITUD'], pendingData)) {
                skipped++;
                return;
            }
            allUpdates[`/pases/${nif}/NUEVA SOLICITUD`] = pendingData;
        } else {
            // Registro nuevo solo con solicitud
            const record = {
                NIF: nif,
                JUGADOR: pendingRow.JUGADOR || pendingRow.NOMBRE || '',
                'NUEVA SOLICITUD': pendingData
            };
            allUpdates[`/pases/${nif}`] = record;
        }
        pendingSaved++;
    });

    if (Object.keys(allUpdates).length > 0) {
        await database.ref().update(allUpdates);
        await logAction('upload_pases', { uploaded, skipped, pendingSaved });
    }

    return { uploaded, skipped, pendingSaved };
}
