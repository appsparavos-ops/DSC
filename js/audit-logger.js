/**
 * AuditLogger - Utilidad centralizada para el registro de auditoría (Bitácora)
 * Permite registrar quién, qué vio y qué modificó en todas las aplicaciones.
 */
const AuditLogger = (function() {
    // Referencia a la base de datos de Firebase
    // Se asume que firebase ya está inicializado en la aplicación principal
    
    function getDatabase() {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            return firebase.database();
        }
        console.error("AuditLogger: Firebase no está inicializado.");
        return null;
    }

    function getAuth() {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            return firebase.auth();
        }
        return null;
    }

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

    /**
     * Calcula las diferencias entre dos objetos.
     */
    function calculateDiff(oldData, newData) {
        const diff = {};
        const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
        
        allKeys.forEach(key => {
            // Ignorar claves internas de Firebase o metadata si es necesario
            if (key.startsWith('_') && key !== '_tipo') return;
            
            const oldVal = oldData ? oldData[key] : undefined;
            const newVal = newData ? newData[key] : undefined;
            
            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                diff[key] = {
                    anterior: oldVal !== undefined ? oldVal : null,
                    nuevo: newVal !== undefined ? newVal : null
                };
            }
        });
        return diff;
    }

    /**
     * Registra una acción genérica.
     * @param {string} action - Nombre de la acción (ej: 'login', 'error')
     * @param {Object} details - Detalles adicionales
     */
    async function log(action, details = {}) {
        const db = getDatabase();
        if (!db) return;

        const auth = getAuth();
        const user = auth ? auth.currentUser : null;
        
        const logEntry = {
            usuario: user ? user.email : 'anonimo/invitado',
            uid: user ? user.uid : 'n/a',
            accion: action,
            fecha: new Date().toISOString(),
            detalles: details,
            contexto: {
                url: window.location.href,
                userAgent: navigator.userAgent
            }
        };

        const timestampKey = getTimestampKey();
        try {
            await db.ref(`/bitacora/${timestampKey}`).set(logEntry);
        } catch (error) {
            console.error("AuditLogger: Error al escribir en la bitácora:", error);
        }
    }

    /**
     * Registra que un usuario vio un registro específico.
     * @param {string} viewName - Nombre de la vista (ej: 'detalle_jugador')
     * @param {string} identifier - Identificador del registro (ej: DNI)
     */
    function logView(viewName, identifier) {
        return log('VISTA', {
            seccion: viewName,
            registroId: identifier
        });
    }

    /**
     * Registra una modificación, calculando automáticamente el diff.
     * @param {string} target - Qué se modificó (ej: 'jugador', 'sancion')
     * @param {string} identifier - Identificador del registro
     * @param {Object} oldData - Datos antes del cambio
     * @param {Object} newData - Datos después del cambio
     */
    function logUpdate(target, identifier, oldData, newData) {
        const diff = calculateDiff(oldData, newData);
        
        // No registrar si no hay cambios reales
        if (Object.keys(diff).length === 0) return Promise.resolve();

        return log('MODIFICACION', {
            entidad: target,
            registroId: identifier,
            cambios: diff
        });
    }

    /**
     * Registra una navegación entre secciones (salto de página).
     * Útil para rastrear el flujo del usuario sin registrar logins redundantes.
     * @param {string} customMessage - Opcional: Mensaje personalizado para la bitácora
     */
    function logNavigation(customMessage = null) {
        const urlActual = window.location.pathname.split('/').pop() || 'index.html';
        const urlOrigen = document.referrer ? document.referrer.split('/').pop() : 'directo/externo';
        
        // No registrar si el origen y destino son el mismo (ej: recarga) para no ensuciar
        // A menos que haya un mensaje personalizado explícito
        if (!customMessage && urlOrigen === urlActual) return Promise.resolve();

        const actionName = customMessage || `Navegó hacia ${urlActual}`;

        return log(actionName, {
            desde: urlOrigen,
            hacia: urlActual
        });
    }

    // API Pública
    return {
        log: log,
        logView: logView,
        logUpdate: logUpdate,
        logNavigation: logNavigation
    };
})();
