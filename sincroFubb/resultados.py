import os
import re
import time
import requests
from bs4 import BeautifulSoup
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
# Permitir peticiones CORS desde cualquier origen (local, GitHub Actions, GitHub Pages)
CORS(app, resources={r"/*": {"origins": "*"}})

TARGET_URL = 'https://competicionesfubb.gesdeportiva.es/competicion.aspx?delegacion=1'
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9',
}

def is_defensor_sporting(name):
    if not name:
        return False
    norm = name.upper().strip()
    return 'DEFENSOR' in norm or 'DSC' in norm or norm == 'DEFENSOR SPORTING'

def parse_clasificacion_teams(html):
    soup = BeautifulSoup(html, 'html.parser')
    p_clasif = soup.find(id='PClasificacion')
    if not p_clasif:
        return []
    table = p_clasif.find('table')
    if not table:
        return []
    
    # Extraer encabezados para ubicar la columna de Nombre de equipo
    thead = table.find('thead')
    if not thead:
        return []
    header_cells = [cell.get_text().replace(r'\s+', ' ').strip().upper() for cell in thead.find_all(['th', 'td'])]
    
    col_team = -1
    for idx, h in enumerate(header_cells):
        if any(name in h for name in ['NOMBRE', 'EQUIPO', 'CLUB', 'TEAM']):
            col_team = idx
            break
            
    tbody = table.find('tbody')
    if not tbody:
        return []
        
    teams = []
    for tr in tbody.find_all('tr'):
        cells = [cell.get_text().strip() for cell in tr.find_all('td')]
        if len(cells) < 3:
            continue
        if col_team >= 0 and col_team < len(cells):
            team_name = cells[col_team].upper().strip()
        else:
            team_name = max(cells, key=len).upper().strip()
        if team_name:
            teams.append(team_name)
    return teams

def get_hidden_fields(soup):
    def get_val(name):
        el = soup.find('input', {'name': name})
        return el['value'] if el and el.has_attr('value') else ''
    return {
        '__VIEWSTATE': get_val('__VIEWSTATE'),
        '__VIEWSTATEGENERATOR': get_val('__VIEWSTATEGENERATOR'),
        '__EVENTVALIDATION': get_val('__EVENTVALIDATION'),
    }

def scrape_category_html(session, comp_id, opt_value, opt_text, fubb_fase_req, fubb_grupo_req):
    # PASO 1: GET fresco para obtener ViewState y cookies limpios
    print(f"[sincroFubb] Iniciando GET fresco para categoría: {opt_text}")
    res = session.get(TARGET_URL, timeout=20)
    if not res.ok:
        raise Exception(f"GET inicial falló: HTTP {res.status_code}")
        
    soup = BeautifulSoup(res.text, 'html.parser')
    state = get_hidden_fields(soup)
    
    # PASO 1.5: POST para cambiar de competición si es necesario (ej: LFB = 149)
    if comp_id != '141':
        print(f"[sincroFubb] Cambiando de competición a ID: {comp_id}")
        payload = {
            '__EVENTTARGET': 'DDLCompeticiones',
            '__EVENTARGUMENT': '',
            '__LASTFOCUS': '',
            '__VIEWSTATE': state['__VIEWSTATE'],
            '__VIEWSTATEGENERATOR': state['__VIEWSTATEGENERATOR'],
            '__EVENTVALIDATION': state['__EVENTVALIDATION'],
            'DDLCompeticiones': comp_id,
            'DDLCategorias': '',
            'DDLFases': '',
            'DDLGrupos': '',
        }
        res = session.post(TARGET_URL, data=payload, timeout=20)
        if not res.ok:
            raise Exception(f"POST cambio de competición falló: HTTP {res.status_code}")
        soup = BeautifulSoup(res.text, 'html.parser')
        state = get_hidden_fields(soup)

    # PASO 2: POST para seleccionar la categoría deseada
    print(f"[sincroFubb] Seleccionando categoría value: {opt_value}")
    payload = {
        '__EVENTTARGET': 'DDLCategorias',
        '__EVENTARGUMENT': '',
        '__LASTFOCUS': '',
        '__VIEWSTATE': state['__VIEWSTATE'],
        '__VIEWSTATEGENERATOR': state['__VIEWSTATEGENERATOR'],
        '__EVENTVALIDATION': state['__EVENTVALIDATION'],
        'DDLCompeticiones': comp_id,
        'DDLCategorias': opt_value,
        'DDLFases': '',
        'DDLGrupos': '',
    }
    res = session.post(TARGET_URL, data=payload, timeout=20)
    if not res.ok:
        raise Exception(f"POST categoría {opt_value} falló: HTTP {res.status_code}")
        
    soup = BeautifulSoup(res.text, 'html.parser')
    state = get_hidden_fields(soup)
    
    # Extraer las fases disponibles
    fase_select = soup.find('select', {'name': 'DDLFases'}) or soup.find('select', id=re.compile(r'DDLFases$'))
    fases_options = fase_select.find_all('option') if fase_select else []
    fases_options = [o for o in fases_options if o.get('value')]
    
    if not fases_options:
        print(f"[sincroFubb] No se encontraron fases para {opt_text}. Retornando HTML actual.")
        return res.text
        
    # Buscar opción marcada como selected por el servidor FUBB (fase activa por defecto)
    target_fase = ''
    for opt in fase_select.find_all('option'):
        if opt.has_attr('selected'):
            target_fase = opt.get('value')
            print(f"[sincroFubb] Detectada fase activa por defecto: {opt.get_text().strip()}")
            break
            
    # Fallback si ninguna está marcada explícitamente como selected
    if not target_fase and fases_options:
        target_fase = fases_options[0].get('value')
        print(f"[sincroFubb] Usando primera fase disponible como fallback: {fases_options[0].get_text().strip()}")
        
    time.sleep(0.6)
    
    # PASO 3: POST para cambiar la fase
    print(f"[sincroFubb] Cambiando fase a value: {target_fase}")
    payload = {
        '__EVENTTARGET': 'DDLFases',
        '__EVENTARGUMENT': '',
        '__LASTFOCUS': '',
        '__VIEWSTATE': state['__VIEWSTATE'],
        '__VIEWSTATEGENERATOR': state['__VIEWSTATEGENERATOR'],
        '__EVENTVALIDATION': state['__EVENTVALIDATION'],
        'DDLCompeticiones': comp_id,
        'DDLCategorias': opt_value,
        'DDLFases': target_fase,
        'DDLGrupos': '',
    }
    res = session.post(TARGET_URL, data=payload, timeout=20)
    if not res.ok:
        raise Exception(f"POST fase {target_fase} falló: HTTP {res.status_code}")
        
    soup = BeautifulSoup(res.text, 'html.parser')
    state = get_hidden_fields(soup)
    
    # Extraer los grupos disponibles
    grupo_select = soup.find('select', {'name': 'DDLGrupos'}) or soup.find('select', id=re.compile(r'DDLGrupos$'))
    grupos_options = grupo_select.find_all('option') if grupo_select else []
    grupos_options = [o for o in grupos_options if o.get('value')]
    
    if not grupos_options:
        print(f"[sincroFubb] No se encontraron grupos para {opt_text}. Retornando HTML actual.")
        return res.text
        
    best_html = None
    
    # Si especificaron grupo, ir directo
    if fubb_grupo_req:
        target_grupo = ''
        for opt in grupos_options:
            if fubb_grupo_req.lower() in opt.get_text().lower():
                target_grupo = opt.get('value')
                print(f"[sincroFubb] Grupo seleccionado por nombre: {opt.get_text().strip()}")
                break
        if target_grupo:
            time.sleep(0.6)
            payload = {
                '__EVENTTARGET': 'DDLGrupos',
                '__EVENTARGUMENT': '',
                '__LASTFOCUS': '',
                '__VIEWSTATE': state['__VIEWSTATE'],
                '__VIEWSTATEGENERATOR': state['__VIEWSTATEGENERATOR'],
                '__EVENTVALIDATION': state['__EVENTVALIDATION'],
                'DDLCompeticiones': comp_id,
                'DDLCategorias': opt_value,
                'DDLFases': target_fase,
                'DDLGrupos': target_grupo,
            }
            res_g = session.post(TARGET_URL, data=payload, timeout=20)
            if res_g.ok:
                best_html = res_g.text
                
    # Si no se configuró o no se encontró el grupo específico, buscar el grupo que contenga a Defensor Sporting
    if not best_html:
        print(f"[sincroFubb] Buscando en los grupos el club DEFENSOR SPORTING...")
        for opt in grupos_options:
            g_val = opt.get('value')
            time.sleep(0.6)
            print(f"[sincroFubb] Evaluando grupo: {opt.get_text().strip()}")
            payload = {
                '__EVENTTARGET': 'DDLGrupos',
                '__EVENTARGUMENT': '',
                '__LASTFOCUS': '',
                '__VIEWSTATE': state['__VIEWSTATE'],
                '__VIEWSTATEGENERATOR': state['__VIEWSTATEGENERATOR'],
                '__EVENTVALIDATION': state['__EVENTVALIDATION'],
                'DDLCompeticiones': comp_id,
                'DDLCategorias': opt_value,
                'DDLFases': target_fase,
                'DDLGrupos': g_val,
            }
            res_g = session.post(TARGET_URL, data=payload, timeout=20)
            if not res_g.ok:
                continue
                
            teams = parse_clasificacion_teams(res_g.text)
            has_dsc = any(is_defensor_sporting(t) for t in teams)
            if has_dsc:
                print(f"[sincroFubb] ✅ Defensor Sporting encontrado en grupo: {opt.get_text().strip()}")
                best_html = res_g.text
                break
                
        # Fallback al primer grupo si no se encuentra en ninguno
        if not best_html and grupos_options:
            g_val = grupos_options[0].get('value')
            print(f"[sincroFubb] ⚠️ Defensor Sporting no encontrado. Usando grupo por defecto: {grupos_options[0].get_text().strip()}")
            payload = {
                '__EVENTTARGET': 'DDLGrupos',
                '__EVENTARGUMENT': '',
                '__LASTFOCUS': '',
                '__VIEWSTATE': state['__VIEWSTATE'],
                '__VIEWSTATEGENERATOR': state['__VIEWSTATEGENERATOR'],
                '__EVENTVALIDATION': state['__EVENTVALIDATION'],
                'DDLCompeticiones': comp_id,
                'DDLCategorias': opt_value,
                'DDLFases': target_fase,
                'DDLGrupos': g_val,
            }
            res_g = session.post(TARGET_URL, data=payload, timeout=20)
            if res_g.ok:
                best_html = res_g.text
                
    return best_html if best_html else res.text

@app.route('/', methods=['GET'])
def index():
    return jsonify({'status': 'online', 'service': 'FUBB Scraping Backend'})

@app.route('/scrape_branch', methods=['POST'])
def scrape_branch():
    data = request.get_json() or {}
    comp_id = data.get('comp_id')
    categories = data.get('categories', [])
    
    if not comp_id or not categories:
        return jsonify({'success': False, 'error': 'Missing comp_id or categories'}), 400
        
    session = requests.Session()
    session.headers.update(HEADERS)
    
    # Obtener el HTML inicial para leer las categorías del select de FUBB
    try:
        res = session.get(TARGET_URL, timeout=20)
        if not res.ok:
            return jsonify({'success': False, 'error': f'GET inicial falló: HTTP {res.status_code}'}), 500
            
        soup = BeautifulSoup(res.text, 'html.parser')
        state = get_hidden_fields(soup)
        
        if comp_id != '141':
            payload = {
                '__EVENTTARGET': 'DDLCompeticiones',
                '__EVENTARGUMENT': '',
                '__LASTFOCUS': '',
                '__VIEWSTATE': state['__VIEWSTATE'],
                '__VIEWSTATEGENERATOR': state['__VIEWSTATEGENERATOR'],
                '__EVENTVALIDATION': state['__EVENTVALIDATION'],
                'DDLCompeticiones': comp_id,
                'DDLCategorias': '',
                'DDLFases': '',
                'DDLGrupos': '',
            }
            res = session.post(TARGET_URL, data=payload, timeout=20)
            if not res.ok:
                return jsonify({'success': False, 'error': f'POST cambio de competencia falló: HTTP {res.status_code}'}), 500
            soup = BeautifulSoup(res.text, 'html.parser')
            
        # Leer categorías disponibles
        ddl_cat = soup.find('select', {'name': 'DDLCategorias'}) or soup.find('select', id=re.compile(r'DDLCategorias$'))
        if not ddl_cat:
            return jsonify({'success': False, 'error': 'Select DDLCategorias no encontrado'}), 500
            
        options = ddl_cat.find_all('option')
        available_options = [{'value': o.get('value'), 'text': o.get_text().strip()} for o in options if o.get('value')]
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error leyendo categorías FUBB: {str(e)}'}), 500
        
    htmls = {}
    
    for cat_req in categories:
        cat_id = cat_req.get('id')
        cat_name = cat_req.get('name')
        fubb_fase = cat_req.get('fubbFase', '')
        fubb_grupo = cat_req.get('fubbGrupo', '')
        
        # Encontrar la opción correspondiente
        matched_opt = None
        for opt in available_options:
            # Coincidencia flexible de nombres
            if cat_name.lower() in opt['text'].lower() or opt['text'].lower() in cat_name.lower():
                matched_opt = opt
                break
                
        if not matched_opt:
            print(f"[sincroFubb] Categoría {cat_name} no disponible en las opciones del servidor FUBB.")
            continue
            
        try:
            # Hacer el scraping aislado
            html = scrape_category_html(session, comp_id, matched_opt['value'], matched_opt['text'], fubb_fase, fubb_grupo)
            if html:
                htmls[cat_id] = html
            # Pausa para no saturar al servidor
            time.sleep(1.0)
        except Exception as err:
            print(f"[sincroFubb] Error al raspar la categoría {cat_name}: {str(err)}")
            
    return jsonify({
        'success': True,
        'htmls': htmls
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"====================================================")
    print(f" SERVICIO DE AUTOMATIZACION FUBB EN PUERTO {port}")
    print(f"====================================================")
    app.run(host='0.0.0.0', port=port)
