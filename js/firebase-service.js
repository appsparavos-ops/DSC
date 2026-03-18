/**
 * Servicio de Firebase para Auth y Database.
 */
import { getTimestampKey } from './utils.js';

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

    const allUpdates = {};
    let processedCount = 0;
    let skippedCount = 0;

    // Trackers for PDF report
    const addedRecords = [];
    const modifiedRecords = [];
    const removedRecords = [];

    const personalKeys = ['DNI', 'NOMBRE', 'FECHA NACIMIENTO', 'NACIONALIDAD', 'TELEFONO', 'EMAIL', 'FM Desde', 'FM Hasta'];
    const seasonalKeys = ['COMPETICION', 'CATEGORIA', 'EQUIPO', 'ESTADO LICENCIA', 'FECHA_ALTA', 'BAJA', 'TIPO', 'TEMPORADA', 'Numero', 'Numeros', 'categoriasAutorizadas'];

    data.forEach(row => {
        const rootNode = row.TIPO.trim().toUpperCase() === 'ENTRENADOR/A' ? 'entrenadores' : 'jugadores';
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

            const match = existingRecords[dni].find(r => r.CATEGORIA === categoria);
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
    const snapshot = await database.ref(`preferenciasUsuarios/${uid}/temporada`).once('value');
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

    // Campos internos que NO deben guardarse como NUEVA SOLICITUD
    const internalKeys = ['NUEVA SOLICITUD'];

    function cleanForPending(record) {
        const clean = {};
        for (const key of Object.keys(record)) {
            if (!internalKeys.includes(key)) {
                clean[key] = record[key];
            }
        }
        return clean;
    }

    function parseDateStr(str) {
        if (!str) return null;
        const parts = str.split('/');
        if (parts.length !== 3) return null;
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }

    data.forEach(row => {
        const nif = (row.NIF || row.DNI || '').trim();
        if (!nif) return;

        const existing = existingPases[nif];

        if (!existing) {
            // No existe → subir directamente
            const record = { ...row };
            // Si hay pendiente del pre-filtro CSV, agregarlo
            if (pendientes.has(nif)) {
                record['NUEVA SOLICITUD'] = cleanForPending(pendientes.get(nif));
                pendingSaved++;
            }
            allUpdates[`/pases/${nif}`] = record;
            uploaded++;
            return;
        }

        // Ya existe en Firebase → aplicar lógica de 4 casos
        const newFechaAcepta = parseDateStr(row['FECHA FEDERACION ACEPTA']);
        const existFechaAcepta = parseDateStr(existing['FECHA FEDERACION ACEPTA']);

        if (newFechaAcepta && existFechaAcepta) {
            // Caso 1: Ambos tienen aceptación
            if (newFechaAcepta.getTime() >= existFechaAcepta.getTime()) {
                const record = { ...row };
                if (pendientes.has(nif)) {
                    record['NUEVA SOLICITUD'] = cleanForPending(pendientes.get(nif));
                    pendingSaved++;
                }
                allUpdates[`/pases/${nif}`] = record;
                uploaded++;
            } else {
                skipped++;
            }
        } else if (!newFechaAcepta && existFechaAcepta) {
            // Caso 2: Nuevo NO tiene aceptación, existente SÍ
            // Mantener existente, guardar nuevo como NUEVA SOLICITUD
            allUpdates[`/pases/${nif}/NUEVA SOLICITUD`] = cleanForPending(row);
            pendingSaved++;
        } else if (newFechaAcepta && !existFechaAcepta) {
            // Caso 4: Existente NO tiene aceptación, nuevo SÍ
            // Sobrescribir, pero guardar existente como NUEVA SOLICITUD
            const record = { ...row };
            record['NUEVA SOLICITUD'] = cleanForPending(existing);
            allUpdates[`/pases/${nif}`] = record;
            uploaded++;
            pendingSaved++;
        } else {
            // Caso 3: Ninguno tiene aceptación → comparar FECHA SOLICITUD
            const newFechaSol = parseDateStr(row['FECHA SOLICITUD']);
            const existFechaSol = parseDateStr(existing['FECHA SOLICITUD']);

            let shouldReplace = false;
            if (newFechaSol && existFechaSol) {
                shouldReplace = newFechaSol.getTime() >= existFechaSol.getTime();
            } else if (newFechaSol) {
                shouldReplace = true;
            }

            if (shouldReplace) {
                const record = { ...row };
                if (pendientes.has(nif)) {
                    record['NUEVA SOLICITUD'] = cleanForPending(pendientes.get(nif));
                    pendingSaved++;
                }
                allUpdates[`/pases/${nif}`] = record;
                uploaded++;
            } else {
                skipped++;
            }
        }
    });

    if (Object.keys(allUpdates).length > 0) {
        await database.ref().update(allUpdates);
        await logAction('upload_pases', { uploaded, skipped, pendingSaved });
    }

    return { uploaded, skipped, pendingSaved };
}
