from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os

# Añadir el directorio actual al path para importar scraper y firebase_service
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from actualizador import scraper
from actualizador import firebase_service

app = Flask(__name__)
# Configuración explícita de CORS para permitir peticiones desde cualquier origen (GitHub Pages, localhost, etc.)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# Variable global para la referencia de la base de datos
DB_REF = None

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
def get_seasons():
    print(">>> Solicitud de lista de temporadas recibida")
    db = get_db()
    if not db:
        return jsonify({'error': 'Firebase no inicializado'}), 500
    seasons = firebase_service.get_seasons(db)
    return jsonify(seasons)

@app.route('/scrape', methods=['POST'])
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
