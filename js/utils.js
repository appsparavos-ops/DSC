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

        const key = `${dni}|${categoria}`;
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
    const map = new Map();        // NIF → registro principal
    const pending = new Map();    // NIF → registro pendiente (NUEVA SOLICITUD)

    data.forEach(row => {
        const nif = (row.NIF || row.DNI || '').trim();
        if (!nif) return;

        const existing = map.get(nif);
        if (!existing) {
            map.set(nif, row);
            return;
        }

        const newFechaAcepta = parseDate(row['FECHA FEDERACION ACEPTA']);
        const existFechaAcepta = parseDate(existing['FECHA FEDERACION ACEPTA']);

        if (newFechaAcepta && existFechaAcepta) {
            // Caso 1: Ambos tienen aceptación → mantener más reciente
            if (newFechaAcepta.getTime() >= existFechaAcepta.getTime()) {
                map.set(nif, row);
            }
            // Si es más viejo, se omite (existing se mantiene)
        } else if (!newFechaAcepta && existFechaAcepta) {
            // Caso 2: Nuevo NO tiene aceptación, existente SÍ
            // Mantener existente, guardar nuevo como pendiente
            pending.set(nif, row);
        } else if (newFechaAcepta && !existFechaAcepta) {
            // Caso 4: Existente NO tiene aceptación, nuevo SÍ
            // Sobrescribir con el nuevo, preservar existente como pendiente
            pending.set(nif, existing);
            map.set(nif, row);
        } else {
            // Caso 3: Ninguno tiene aceptación → comparar FECHA SOLICITUD
            const newFechaSol = parseDate(row['FECHA SOLICITUD']);
            const existFechaSol = parseDate(existing['FECHA SOLICITUD']);

            if (newFechaSol && existFechaSol) {
                if (newFechaSol.getTime() >= existFechaSol.getTime()) {
                    map.set(nif, row);
                }
            } else if (newFechaSol) {
                map.set(nif, row);
            }
        }
    });

    return { filtered: Array.from(map.values()), pendientes: pending };
}
