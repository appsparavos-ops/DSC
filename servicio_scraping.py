from functools import wraps
from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os

# Añadir el directorio actual al path para importar scraper y firebase_service
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from actualizador import scraper
from actualizador import firebase_service
from actualizador.api_auth import is_valid_bearer_token

app = Flask(__name__)
# Configuración explícita de CORS para permitir peticiones desde cualquier origen (GitHub Pages, localhost, etc.)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# Variable global para la referencia de la base de datos
DB_REF = None

def require_automation_token(view_function):
    """Limita las rutas de datos a llamadas desde el automatismo de GitHub."""
    @wraps(view_function)
    def wrapped(*args, **kwargs):
        expected_token = os.environ.get('FICHAS_AUTOMATION_TOKEN')
        if not expected_token or len(expected_token.strip()) < 32:
            return jsonify({'error': 'La clave del automatismo no está configurada correctamente en Render.'}), 503

        authorization = request.headers.get('Authorization', '')
        if not is_valid_bearer_token(expected_token, authorization):
            return jsonify({'error': 'No autorizado.'}), 401

        return view_function(*args, **kwargs)

    return wrapped

def get_db():
    global DB_REF
    if DB_REF is None:
        print(">>> Inicializando Firebase (lazy-loading)...")
        DB_REF = firebase_service.initialize_firebase()
    return DB_REF

@app.route('/', methods=['GET'])
def index():
    return jsonify({'status': 'online', 'message': 'Servicio de Scraping Activo'})

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/players', methods=['GET'])
@require_automation_token
def get_players():
    season = request.args.get('season')
    print(f">>> Solicitud de lista de jugadores recibida (Temporada: {season or 'Todas'})")
    
    db = get_db()
    if not db:
        return jsonify({'error': 'Firebase no inicializado'}), 500
    
    if season and season.lower() != 'todas':
        players = firebase_service.get_seasonal_players(db, season)
    else:
        players = firebase_service.get_players(db)
        
    return jsonify(players)

@app.route('/seasons', methods=['GET'])
@require_automation_token
def get_seasons():
    print(">>> Solicitud de lista de temporadas recibida")
    db = get_db()
    if not db:
        return jsonify({'error': 'Firebase no inicializado'}), 500
    seasons = firebase_service.get_seasons(db)
    return jsonify(seasons)

@app.route('/auto_seasons', methods=['GET'])
@require_automation_token
def get_auto_seasons():
    """Devuelve solo las temporadas activas configuradas en /AutoSeasons."""
    print(">>> Solicitud de temporadas activas recibida")
    db = get_db()
    if not db:
        return jsonify({'error': 'Firebase no inicializado'}), 503

    try:
        seasons = firebase_service.get_auto_seasons(db)
    except ValueError as e:
        print(f"!!! Configuración AutoSeasons inválida: {e}")
        return jsonify({'error': 'La configuración de AutoSeasons no es válida.'}), 422
    except Exception as e:
        print(f"!!! No se pudo leer AutoSeasons: {e}")
        return jsonify({'error': 'No se pudo leer la configuración AutoSeasons.'}), 503

    if not seasons:
        return jsonify({
            'error': 'El nodo AutoSeasons no existe o está vacío.',
            'seasons': []
        }), 422

    return jsonify(seasons)

@app.route('/report_emails', methods=['GET'])
@require_automation_token
def get_report_emails():
    """Destinatarios del informe; accesibles solo al automatismo autenticado."""
    try:
        db = get_db()
        if db is None:
            return jsonify({'error': 'Firebase no inicializado'}), 503
        recipients = firebase_service.get_report_emails(db)
    except ValueError as e:
        return jsonify({'error': str(e)}), 422
    except Exception:
        return jsonify({'error': 'No se pudo leer la configuración REPORT_EMAIL.'}), 503

    if not recipients:
        return jsonify({'error': 'El nodo REPORT_EMAIL no existe o está vacío.'}), 422

    response = jsonify(recipients)
    response.headers['Cache-Control'] = 'no-store'
    return response

@app.route('/scrape', methods=['POST'])
@require_automation_token
def scrape():
    data = request.json
    dni = data.get('dni')
    print(f">>> Solicitud de scraping recibida para DNI: {dni}")
    
    try:
        scraper.initialize_driver(logger=print)
        desde, hasta = scraper.scrape_player_data(dni, logger=print)
        
        response = {
            'success': True if desde and hasta else False,
            'desde': desde,
            'hasta': hasta
        }
    except Exception as e:
        print(f"!!! Error durante el scraping: {e}")
        response = {'success': False, 'error': str(e)}
    
    return jsonify(response)

@app.route('/update_player', methods=['POST'])
@require_automation_token
def update_player():
    data = request.json
    dni = data.get('dni')
    desde = data.get('desde')
    hasta = data.get('hasta')
    
    print(f">>> Solicitud de actualización en Firebase para DNI: {dni}")
    db = get_db()
    if not db:
        return jsonify({'error': 'Firebase no inicializado'}), 500
    success = firebase_service.update_player_fm(db, dni, desde, hasta)
    
    return jsonify({'success': success})

if __name__ == '__main__':
    # El puerto lo asigna la plataforma de hosting (Render/Railway/etc)
    port = int(os.environ.get('PORT', 5000))
    
    print(f"====================================================")
    print(f" SERVICIO DE PROXY Y SCRAPING ACTIVO - PUERTO {port}")
    print(f"====================================================")
    
    app.run(host='0.0.0.0', port=port)
