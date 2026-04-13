/**
 * Utilitarios para procesamiento de datos y fechas.
 */

export function getTimestampKey() {
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

export function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

export function parseCSV(csvText, currentAction) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) throw new Error('El archivo CSV está vacío o no tiene datos.');

    const headers = lines[0].split(';').map(header => header.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(';').map(value => value.trim());
        if (values.length > headers.length) {
            values.length = headers.length;
        }
        const rowObject = headers.reduce((obj, header, index) => {
            if (header) obj[header] = values[index] || '';
            return obj;
        }, {});

        // Normalizar nombres de columnas
        if (rowObject.NIF && !rowObject.DNI) rowObject.DNI = rowObject.NIF;
        if (rowObject['CATEGORÍA'] && !rowObject.CATEGORIA) rowObject.CATEGORIA = rowObject['CATEGORÍA'];
        if (rowObject['COMPETICIÓN'] && !rowObject.COMPETICION) rowObject.COMPETICION = rowObject['COMPETICIÓN'];
        if (rowObject[' NOMBRE'] && !rowObject.NOMBRE) rowObject.NOMBRE = rowObject[' NOMBRE'];
        if (rowObject.FECHA_LIC && !rowObject.FECHA_ALTA) rowObject.FECHA_ALTA = rowObject.FECHA_LIC;
        
        // Normalizar TIPO (ENT. AYUDANTE -> ENTRENADOR/A)
        if (rowObject.TIPO && rowObject.TIPO.trim().toUpperCase() === 'ENT. AYUDANTE') {
            rowObject.TIPO = 'ENTRENADOR/A';
        }

        // Estandarizar equipo (DSC -> DEFENSOR SPORTING)
        const teamFields = ['EQUIPO', 'CLUB'];
        teamFields.forEach(field => {
            if (rowObject[field] && rowObject[field].trim().toUpperCase() === 'DSC') {
                rowObject[field] = 'DEFENSOR SPORTING';
            }
        });

        if (!rowObject.DNI) continue;

        if (currentAction === 'upload' && !rowObject.TIPO) {
            console.warn('Skipping row due to missing TIPO:', rowObject);
            continue;
        }

        data.push(rowObject);
    }
    return data;
}

export function filterLatestRecords(data) {
    const latestRecordsMap = new Map();
    data.forEach(row => {
        const dni = row.DNI ? row.DNI.trim() : null;
        const categoria = row.CATEGORIA ? row.CATEGORIA.trim() : '';
        if (!dni) return;

        const isCoach = row.TIPO && row.TIPO.trim().toUpperCase() === 'ENTRENADOR/A';
        const key = isCoach ? `${dni}|${categoria}|${row.FECHA_ALTA || ''}` : `${dni}|${categoria}`;
        const existingRecord = latestRecordsMap.get(key);

        if (!existingRecord) {
            latestRecordsMap.set(key, row);
            return;
        }

        const currentDate = parseDate(row.FECHA_ALTA);
        const storedDate = parseDate(existingRecord.FECHA_ALTA);

        if (currentDate && storedDate) {
            if (currentDate.getTime() > storedDate.getTime()) {
                latestRecordsMap.set(key, row);
            } else if (currentDate.getTime() === storedDate.getTime()) {
                const currentBajaDate = parseDate(row.BAJA);
                const storedBajaDate = parseDate(existingRecord.BAJA);

                if (currentBajaDate && !storedBajaDate) {
                    latestRecordsMap.set(key, row);
                } else if (currentBajaDate && storedBajaDate && currentBajaDate.getTime() > storedBajaDate.getTime()) {
                    latestRecordsMap.set(key, row);
                }
            }
        } else if (currentDate) {
            latestRecordsMap.set(key, row);
        }
    });
    return Array.from(latestRecordsMap.values());
}

/**
 * Filtra duplicados de pases dentro del CSV por NIF.
 * Aplica lógica de 4 casos basada en FECHA FEDERACION ACEPTA y FECHA SOLICITUD.
 * Retorna { filtered, pendientes } donde pendientes mapea NIF → datos a guardar como NUEVA SOLICITUD.
 */
export function filterLatestPases(data) {
    const bestMain = new Map();    // NIF → registro principal (activo)
    const bestPending = new Map(); // NIF → registro pendiente (solicitud)

    data.forEach(row => {
        const nif = (row.NIF || row.DNI || '').trim();
        if (!nif) return;

        const fedStatus = (row['FEDERACION ACEPTA'] || '').trim().toUpperCase();
        const hasAcepta = fedStatus === 'SÍ' || fedStatus === 'SI';

        const rawAcepta = row['FECHA FEDERACION ACEPTA'];
        const rawSolicitud = row['FECHA SOLICITUD'];
        
        const rowDate = parseDate(rawAcepta) || parseDate(rawSolicitud);
        if (!rowDate) return;

        if (hasAcepta) {
            const currentMain = bestMain.get(nif);
            const currentMainDate = currentMain ? (parseDate(currentMain['FECHA FEDERACION ACEPTA']) || parseDate(currentMain['FECHA SOLICITUD'])) : null;

            if (!currentMain || rowDate.getTime() > currentMainDate.getTime()) {
                bestMain.set(nif, row);
            }
        } else {
            const currentPending = bestPending.get(nif);
            const currentPendingDate = currentPending ? parseDate(currentPending['FECHA SOLICITUD']) : null;

            if (!currentPending || rowDate.getTime() > currentPendingDate.getTime()) {
                bestPending.set(nif, row);
            }
        }
    });

    // Arbitraje Final: Si la aceptación es posterior o igual a la solicitud, eliminar la solicitud.
    // (Un pase aceptado es el resultado final, no necesita mostrarse además como pendiente)
    bestPending.forEach((pendingRow, nif) => {
        const main = bestMain.get(nif);
        if (main) {
            const mainDate = parseDate(main['FECHA FEDERACION ACEPTA']) || parseDate(main['FECHA SOLICITUD']);
            const pendingDate = parseDate(pendingRow['FECHA SOLICITUD']);
            
            if (mainDate && pendingDate && mainDate.getTime() >= pendingDate.getTime()) {
                bestPending.delete(nif);
            }
        }
    });

    return { filtered: Array.from(bestMain.values()), pendientes: bestPending };
}

/**
 * Deduce el género basado en el nombre de pila y la categoría.
 * @param {string} fullName - Nombre completo (ej: "APELLIDO, NOMBRE")
 * @param {string} category - Categoría (ej: "U11 Mixta")
 * @returns {string|null} - "Masculino", "Femenino" o null
 */
export function deduceGender(fullName, category) {
    if (!fullName) return null;
    
    const catUpper = (category || "").toUpperCase();
    if (catUpper.includes("FEMENINO")) return "Femenino";
    if (catUpper.includes("MASCULINO")) return "Masculino";
    // Criterios explícitos: Liga de Desarrollo, Liga Uruguaya
    if (catUpper.includes("LIGA DE DESARROLLO") || catUpper.includes("LIGA URUGUAYA")) return "Masculino";

    // Extraer nombre de pila
    let firstName = "";
    if (fullName.includes(",")) {
        firstName = fullName.split(",")[1].trim().split(" ")[0];
    } else {
        const parts = fullName.trim().split(" ");
        firstName = parts[parts.length - 1];
    }

    if (!firstName) return null;
    
    const name = firstName.toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Quitar acentos

    // Reglas de terminación para español
    const femaleEndings = ["A", "ELA", "INA", "ITA", "ETTE", "ELLE", "IS", "ID"];
    const maleEndings = ["O", "UR", "OR", "EL", "AS", "AN", "ON", "ES", "US", "AM", "IM"];

    // Casos especiales frecuentes
    const specialMale = ["LUCA", "BAUTISTA", "JOSHUA", "MATIAS", "JOSE", "LUIS", "JUAN", "VICENTE", "MANUEL", "JAVIER"];
    const specialFemale = ["ANDREA", "MARIA", "ANA", "INES", "RAQUEL", "ISABEL", "CARMEN", "ESTER", "LIZ", "RUTH"];

    if (specialMale.includes(name)) return "Masculino";
    if (specialFemale.includes(name)) return "Femenino";

    // Heurística por terminación
    if (femaleEndings.some(e => name.endsWith(e))) return "Femenino";
    if (maleEndings.some(e => name.endsWith(e))) return "Masculino";

    return null;
}
