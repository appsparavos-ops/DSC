import sys
import time
import re

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

# URL del formulario de consulta
URL = "https://aps.deporte.gub.uy/ConsultaCarneDeportista/Carnes/consultar"

# Tipos de documento a probar. Estos son los textos visibles en el selector.
DOCUMENT_TYPES = ["Cédula de identidad", "Pasaporte", "Otro"]

# Variable global para el driver
_driver = None


def initialize_driver(logger=print):
    """Inicializa el driver de Chrome una sola vez."""
    global _driver
    if _driver is None:
        logger("Inicializando el driver de Chrome...")
        chrome_options = webdriver.ChromeOptions()
        chrome_options.add_experimental_option('excludeSwitches', ['enable-logging'])
        
        # Ajustes para entornos de servidor (Docker/Linux)
        chrome_options.add_argument('--headless')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--window-size=1920,1080')
        
        # User agent para evitar bloqueos básicos
        chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        _driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
    return _driver


def close_driver(logger=print):
    """Cierra el driver de Chrome."""
    global _driver
    if _driver is not None:
        logger("Cerrando el navegador...")
        _driver.quit()
        _driver = None


def _scrape_loop(driver, dni: str, logger=print):
    """Función auxiliar que contiene la lógica principal del bucle de scraping."""

    # Determinar la lista de tipos de documento a probar basado en el formato del DNI.
    doc_types_to_try = []
    if not dni.isdigit() or len(dni) > 8:
        logger(f"INFO: El formato de '{dni}' sugiere Pasaporte.")
        doc_types_to_try = ["Pasaporte"]
    else:
        logger(f"INFO: El formato de '{dni}' sugiere Cédula de Identidad u Otro.")
        doc_types_to_try = ["Cédula de identidad", "Otro"]

    for doc_type in doc_types_to_try:
        logger(f"Intentando con tipo de documento: '{doc_type}'...")

        try:
            # Navega a la URL en cada iteración para asegurar un estado limpio
            driver.get(URL)
            
            # Espera máximo 5 segundos (reducido de 10)
            wait = WebDriverWait(driver, 2)

            # Localizadores de elementos
            dni_input = wait.until(EC.visibility_of_element_located((By.NAME, 'documento')))
            doc_select_element = wait.until(EC.visibility_of_element_located((By.NAME, 'idtipodocumento')))
            search_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[text()='Buscar']")))

            # Limpia el campo, introduce el DNI y selecciona el tipo
            dni_input.clear()
            dni_input.send_keys(dni)

            doc_select = Select(doc_select_element)
            doc_select.select_by_visible_text(doc_type)

            # Clic en el botón de búsqueda
            search_button.click()

            # Espera máximo 7.5 segundos (reducido de 15)
            wait = WebDriverWait(driver, 2)
            wait.until(EC.visibility_of_element_located((By.XPATH, "//*[contains(text(), 'BÁSQUETBOL')]" )))

            logger("¡Se encontró la tabla de resultados!")

            # Pausa reducida a 1 segundo (reducida de 2)
            time.sleep(1)

            # Una vez que los resultados están, se usa BeautifulSoup para parsear
            soup = BeautifulSoup(driver.page_source, 'html.parser')

            # Encontrar el elemento <strong> que contiene el deporte
            strong_elements = soup.find_all('strong')
            logger(f"DEBUG: Se encontraron {len(strong_elements)} elementos <strong>")

            for strong in strong_elements:
                deporte_text = strong.text.strip().upper()
                logger(f"DEBUG: Revisando deporte: '{deporte_text}'")

                if 'BÁSQUETBOL' in deporte_text:
                    # Encontramos el deporte, ahora buscar las fechas
                    parent_div = strong.find_parent('div')
                    if not parent_div:
                        logger("DEBUG: No se encontró div padre")
                        continue

                    # Obtener todo el texto del div
                    div_text = parent_div.get_text()
                    logger(f"DEBUG: Texto completo del div: '{div_text}'")

                    # Buscar las fechas usando expresión regular
                    fecha_pattern = r'(\d{2}/\d{2}/\d{4})'
                    fechas = re.findall(fecha_pattern, div_text)

                    logger(f"DEBUG: Fechas encontradas: {fechas}")

                    if len(fechas) >= 2:
                        fecha_desde = fechas[0]
                        fecha_hasta = fechas[1]
                        logger(f"Fechas encontradas: Desde {fecha_desde}, Hasta {fecha_hasta}")
                        return fecha_desde, fecha_hasta
                    else:
                        logger(f"ADVERTENCIA: Se encontró BÁSQUETBOL pero no hay suficientes fechas")

            # Si llegamos aquí, no encontramos el patrón esperado
            logger(f"ADVERTENCIA: Se encontró 'BÁSQUETBOL' en la página pero no se pudo extraer las fechas")      
            # Intentar método alternativo: búsqueda simple en el texto
            page_text = soup.get_text()
            if 'desde' in page_text.lower() and 'hasta' in page_text.lower():
                logger(f"DEBUG: Se encontraron palabras clave 'desde' y 'hasta' en la página")
                # Buscar todas las fechas en la página
                fecha_pattern = r'(\d{2}/\d{2}/\d{4})'
                fechas = re.findall(fecha_pattern, page_text)
                logger(f"DEBUG: Todas las fechas encontradas: {fechas}")
                if len(fechas) >= 2:
                    return fechas[0], fechas[1]

        except Exception as e:
            # Si ocurre un error, significa que no se encontró nada para ese tipo de doc.
            logger(f"No se encontraron resultados para el tipo '{doc_type}'. Error: {type(e).__name__}")
            logger("Probando el siguiente tipo de documento.")
            continue

    # Si el bucle termina sin encontrar nada
    return None, None


def scrape_player_data(dni: str, logger=print):
    """
    Realiza scraping en la web de la APS usando Selenium para obtener las fechas.
    Usa un driver compartido que debe ser inicializado previamente.

    Args:
        dni: El DNI del jugador a consultar.
        logger: Función para loggear mensajes.

    Returns:
        Un tuple (fecha_desde, fecha_hasta). Retorna (None, None) si no se encuentran datos.
    """
    logger(f"--- Iniciando scraping con Selenium para DNI: {dni} ---")

    driver = _driver
    if driver is None:
        logger("ERROR: El driver no ha sido inicializado. Llama a initialize_driver() primero.")
        return None, None

    try:
        result = _scrape_loop(driver, dni, logger)
        if result and result[0]:
            logger(f"--- Fin de scraping para DNI: {dni}. Se encontraron datos. ---")
        else:
            logger(f"--- Fin de scraping para DNI: {dni}. No se encontraron datos. ---")
        return result
    except Exception as e:
        logger(f"ERROR durante scraping para {dni}: {type(e).__name__}: {e}")
        return None, None


if __name__ == '__main__':
    # Pequeña prueba para verificar la funcionalidad
    test_dni = '12345678'
    print(f"Ejecutando prueba de scraping con DNI de prueba: {test_dni}")
    initialize_driver()
    desde, hasta = scrape_player_data(test_dni)
    if desde and hasta:
        print(f"\nResultado final de la prueba: Desde='{desde}', Hasta='{hasta}'")
    else:
        print("\nResultado final de la prueba: No se pudo obtener la información.")
    close_driver()