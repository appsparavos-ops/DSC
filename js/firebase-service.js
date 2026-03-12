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
                if (recEstado === estadoLicencia) {
                    skippedCount++;
                    return;
                }
                targetPushId = match._pushId;
            }
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
        }
    });

    if (Object.keys(allUpdates).length > 0) {
        await database.ref().update(allUpdates);
        await logAction('upload_season_data', { season: manualSeason, processed: processedCount, skipped: skippedCount });
    }

    return { processedCount, skippedCount };
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
