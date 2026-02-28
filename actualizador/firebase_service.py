import os
import sys
import random
import string
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, db
from dotenv import load_dotenv

def initialize_firebase():
    """
    Inicializa la conexión con Firebase usando las credenciales y la URL de la DB.
    Devuelve una referencia a la base de datos.
    """
    try:
        load_dotenv()
        database_url = os.getenv('FIREBASE_DATABASE_URL')
        service_account_json = os.getenv('FIREBASE_SERVICE_ACCOUNT')
        
        # Rutas posibles para archivos de credenciales
        RENDER_SECRET_PATH = '/etc/secrets/serviceAccountKey.json'
        LOCAL_CRED_PATH = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')

        cred = None
        
        # 1. Intentar con Secret File de Render (RECOMENDADO para evitar problemas de firma)
        if os.path.exists(RENDER_SECRET_PATH):
            from datetime import datetime
            print(f">>> Diagnóstico: Hora del sistema (UTC): {datetime.utcnow()}")
            print(f">>> Cargando Secret File: {RENDER_SECRET_PATH}")
            try:
                import json
                with open(RENDER_SECRET_PATH, 'r') as f:
                    info = json.load(f)
                
                if 'private_key' in info:
                    pk = info['private_key']
                    print(f">>> Repr de llave original (primeros 60): {repr(pk[:60])}")
                    
                    # Limpieza profunda de la llave
                    # 1. Quitar posibles espacios accidentales al inicio/final del string
                    pk_clean = pk.strip()
                    # 2. Corregir saltos de línea literales (\n) por reales
                    pk_clean = pk_clean.replace('\\n', '\n').replace('\\\\n', '\n')
                    # 3. Asegurar que empiece y termine correctamente (por si se perdieron guiones)
                    header = "-----BEGIN PRIVATE KEY-----"
                    footer = "-----END PRIVATE KEY-----"
                    
                    if header in pk_clean and footer in pk_clean:
                        # Extraer el cuerpo y reconstruir para asegurar formato PEM puro
                        try:
                            parts = pk_clean.split(header)
                            body_and_footer = parts[1].split(footer)
                            body = body_and_footer[0].strip().replace(' ', '').replace('\n', '').replace('\r', '')
                            # Reconstruir con saltos de línea cada 64 caracteres (estándar PEM)
                            formatted_body = '\n'.join([body[i:i+64] for i in range(0, len(body), 64)])
                            pk_final = f"{header}\n{formatted_body}\n{footer}\n"
                            info['private_key'] = pk_final
                            print(">>> PEM reconstruido forzosamente para asegurar validez.")
                        except:
                            info['private_key'] = pk_clean
                            print(">>> PEM limpiado (no reconstruido).")
                    else:
                        print("!!! ADVERTENCIA: Cabeceras PEM no encontradas tras limpieza.")
                        info['private_key'] = pk_clean

                print(f">>> Project ID: {info.get('project_id')}")
                print(f">>> Private Key ID: {info.get('private_key_id')}")
                
                cred = credentials.Certificate(info)
                print(">>> Credenciales inicializadas con éxito.")
            except Exception as e:
                print(f"!!! Error al procesar Secret File: {e}")
        
        # 2. Intentar con Variable de Entorno
        elif service_account_json and service_account_json.strip():
            print(">>> Variable FIREBASE_SERVICE_ACCOUNT detectada. Intentando parsear...")
            import json
            try:
                clean_json = service_account_json.strip()
                if clean_json.startswith("'") and clean_json.endswith("'"):
                    clean_json = clean_json[1:-1]
                elif clean_json.startswith('"') and clean_json.endswith('"'):
                    clean_json = clean_json[1:-1]
                
                service_account_info = json.loads(clean_json)
                
                # Corrección de saltos de línea
                if 'private_key' in service_account_info:
                    pk = service_account_info['private_key']
                    service_account_info['private_key'] = pk.replace('\\n', '\n').replace('\\\\n', '\n')
                
                cred = credentials.Certificate(service_account_info)
                print(">>> Credenciales cargadas exitosamente desde variable de entorno.")
            except Exception as json_err:
                print(f"!!! ERROR al parsear el JSON de la variable: {json_err}")
        
        # 3. Intentar con archivo local (Desarrollo)
        if not cred and os.path.exists(LOCAL_CRED_PATH):
            print(f">>> Usando archivo local: {LOCAL_CRED_PATH}")
            cred = credentials.Certificate(LOCAL_CRED_PATH)

        if not cred:
            print("!!! ERROR CRÍTICO: No se encontró Secret File, Variable de Entorno ni Archivo Local.")
            return None

        if not database_url:
            print("Error: La variable de entorno FIREBASE_DATABASE_URL no está configurada.")
            return None

        # Evitar reinicializar la app si ya existe una instancia
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {
                'databaseURL': database_url
            })
        
        print("Conexión con Firebase inicializada correctamente.")
        return db.reference()
    except Exception as e:
        print(f"Error al inicializar Firebase: {e}")
        return None

def add_log_entry(message: str, source: str = "SCRIPT"):
    """
    Añade una nueva entrada a la bitácora en Firebase con una clave personalizada.
    Formato de clave: YYYYMMDDHHmmss-xxxxx
    Estructura: accion, fecha, usuario, detalles
    """
    try:
        now = datetime.now()
        
        # Para la fecha
        fecha = now.strftime("%Y-%m-%d %H:%M:%S")
        
        # Para la clave personalizada
        timestamp_key_part = now.strftime("%Y%m%d%H%M%S")
        random_key_part = ''.join(random.choices(string.ascii_lowercase + string.digits, k=5))
        custom_key = f"{timestamp_key_part}-{random_key_part}"
        
        log_entry = {
            'accion': 'Actualizacion de Fichas Medicas',
            'fecha': fecha,
            'usuario': 'SISTEMA',
            'detalles': {
                'userAgent': message
            }
        }
        
        # Usar la clave personalizada con set() en lugar de push()
        db.reference(f'bitacora/{custom_key}').set(log_entry)
        return True
    except Exception as e:
        # Imprime el error pero no detiene la ejecución principal
        print(f"ERROR al escribir en bitácora: {e}")
        return False

def get_players(db_ref):
    """
    Obtiene todos los jugadores de la base de datos.
    """
    try:
        # Log de diagnóstico
        db_url = firebase_admin.get_app().options.get('databaseURL')
        print(f"DEBUG: Consultando base de datos en: {db_url}")
        
        # Verificar qué hay en la raíz
        root_data = db.reference('/').get()
        if root_data:
            print(f"DEBUG: Nodos encontrados en la raíz: {list(root_data.keys()) if isinstance(root_data, dict) else 'No es un diccionario'}")
        else:
            print("DEBUG: La base de datos está totalmente vacía (Root es None).")

        jugadores_ref = db.reference('jugadores')
        data = jugadores_ref.get()

        if data is None:
            print("DEBUG: El nodo 'jugadores' no existe o está vacío (None).")
            return None

        print(f"DEBUG: Datos de 'jugadores' recibidos. Tipo: {type(data)}")
        return data
    except Exception as e:
        print(f"Error al obtener los jugadores: {e}")
        return None

def get_seasons(db_ref):
    """
    Obtiene todas las temporadas de la base de datos desde /temporadas.
    """
    try:
        seasons_ref = db.reference('temporadas')
        data = seasons_ref.get()
        if data is None:
            return []
        
        # Las temporadas son las llaves del diccionario
        seasons = sorted(list(data.keys()), reverse=True)
        return seasons
    except Exception as e:
        print(f"Error al obtener las temporadas: {e}")
        return []

def get_seasonal_players(db_ref, season_name):
    """
    Obtiene los jugadores registrados en una temporada específica desde /registrosPorTemporada.
    Se obtiene el mapa de datos personales para cada DNI encontrado.
    """
    try:
        seasonal_ref = db.reference(f'registrosPorTemporada/{season_name}')
        records = seasonal_ref.get()
        if not records:
            return {}

        # Obtener todos los jugadores para cruzar datos personales
        # Podríamos optimizar esto pidiendo solo los específicos, pero por ahora seguimos el patrón del proyecto
        all_players = get_players(db_ref)
        if not all_players:
            return {}

        result = {}
        for push_id, record in records.items():
            dni = str(record.get('_dni')).strip()
            if dni in all_players:
                # Combinamos los datos del registro estacional con los datos personales
                result[dni] = all_players[dni]
                # Aseguramos que el DNI esté en el resultado para consistencia
                if 'datosPersonales' not in result[dni]:
                    result[dni]['datosPersonales'] = {}
                result[dni]['datosPersonales']['DNI'] = dni
                
        return result
    except Exception as e:
        print(f"Error al obtener jugadores de la temporada {season_name}: {e}")
        return {}

def update_player_fm(db_ref, dni, fm_desde, fm_hasta):
    """
    Actualiza la Ficha Médica (Desde y Hasta) para un jugador específico,
    dentro del objeto anidado 'datosPersonales'.
    """
    try:
        dni_str = str(dni).strip()
        print(f"DEBUG: Intentando actualizar Firebase para DNI: {dni_str}")
        
        ruta = f'jugadores/{dni_str}/datosPersonales'
        print(f"DEBUG: Ruta de actualización: /{ruta}")
        
        update_data = {
            'FM Desde': fm_desde,
            'FM Hasta': fm_hasta
        }
        print(f"DEBUG: Datos a actualizar: {update_data}")

        ref = db.reference(ruta)
        ref.update(update_data)
        print(f"DEBUG: Actualización exitosa para DNI {dni_str}")
        return True
        
    except Exception as e:
        print(f"ERROR al actualizar el jugador con DNI {dni}: {type(e).__name__}: {e}")
        return False

if __name__ == '__main__':
    print("Ejecutando prueba del servicio de Firebase...")
    db_ref = initialize_firebase()
    if db_ref:
        players = get_players(db_ref)
        if players:
            print(f"Se encontraron {len(players)} jugadores.")
    print("Prueba finalizada.")