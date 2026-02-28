from datetime import datetime, timedelta
import firebase_service
import scraper

# --- Configuración ---
# Número de días de antelación para considerar una ficha médica "próxima a vencer"
DAYS_THRESHOLD = 30

def main():
    """
    Función principal que orquesta el proceso de actualización de fichas médicas.
    """
    print("======================================================")
    print("== INICIO DEL SCRIPT DE ACTUALIZACIÓN DE FICHAS MÉDICAS ==")
    print("======================================================")

    db_ref = firebase_service.initialize_firebase()

    if not db_ref:
        print("\nNo se pudo inicializar Firebase. Abortando script.")
        firebase_service.add_log_entry("FALLO CRÍTICO: No se pudo inicializar Firebase. El script se ha detenido.", "SISTEMA")
        return

    # Se mantiene una única entrada de log al inicio.
    firebase_service.add_log_entry("Inicio del proceso de actualización de fichas.", "SISTEMA")
    print("Inicio del proceso de actualización de fichas.")


    print("Obteniendo lista de jugadores desde Firebase...")
    players = firebase_service.get_players(db_ref)

    if not players:
        print("No se encontraron jugadores en la base de datos o hubo un error. Abortando.")
        return

    print(f"Se encontraron {len(players)} registros en el nodo 'jugadores'.")

    if 'entrenadores' in players:
        print("INFO: Se encontró un sub-nodo 'entrenadores' anidado. Será excluido del procesamiento.")
        del players['entrenadores']

    threshold_date = datetime.now() + timedelta(days=DAYS_THRESHOLD)
    print(f"Fecha límite para la actualización: {threshold_date.strftime('%d/%m/%Y')}")
    
    players_to_update = []
    
    print("Filtrando jugadores con fichas médicas vencidas, próximas a vencer o inexistentes...")
    for dni_key, player_data in players.items():
        if not isinstance(player_data, dict):
            print(f"ADVERTENCIA: La entrada para la clave '{dni_key}' no es un diccionario válido. Saltando.")
            continue

        datos_personales = player_data.get('datosPersonales')
        if not isinstance(datos_personales, dict):
            print(f"INFO: Jugador con clave '{dni_key}' no tiene 'datosPersonales'. Saltando.")
            continue

        nombre = datos_personales.get('NOMBRE', '[Nombre Desconocido]')
        dni_from_data = datos_personales.get('DNI', dni_key)
        fm_hasta_str = datos_personales.get('FM Hasta')

        player_info_dict = {'dni': dni_from_data, 'nombre': nombre, 'fm_hasta': fm_hasta_str}

        if not fm_hasta_str:
            print(f"Jugador necesita actualización: {nombre} ({dni_from_data}). No tiene fecha de 'FM Hasta'.")
            players_to_update.append(player_info_dict)
            continue

        try:
            expire_date = datetime.strptime(fm_hasta_str, '%d/%m/%Y')
            if expire_date < threshold_date:
                print(f"Jugador necesita actualización: {nombre} ({dni_from_data}). Vence el: {fm_hasta_str}")
                players_to_update.append(player_info_dict)
        except (ValueError, TypeError) as e:
            print(f"ADVERTENCIA: No se pudo procesar la fecha para {nombre} ({dni_from_data}). Valor: '{fm_hasta_str}'. Error: {e}")

    if not players_to_update:
        print("No hay jugadores que necesiten actualización. Proceso finalizado.")
        summary_lines = [
            "================ RESUMEN FINAL ================",
            "No hay jugadores que necesiten actualización. Proceso finalizado.",
            "=================================================",
            "== FIN DEL SCRIPT DE ACTUALIZACIÓN =="
        ]
        summary_log_entry = "\n".join(summary_lines)
        firebase_service.add_log_entry(summary_log_entry, "SISTEMA")
        return

    print(f"Se encontraron {len(players_to_update)} jugadores para actualizar.")

    scraper.initialize_driver(logger=print)

    updated_count = 0
    not_found_count = 0
    
    for player_info in players_to_update:
        dni_for_update = player_info['dni']
        nombre = player_info['nombre']
        old_fm_hasta_str = player_info['fm_hasta']

        print(f"--- Procesando a: {nombre} (DNI: {dni_for_update}) ---")
        
        cleaned_dni = str(dni_for_update).replace('.', '').replace('-', '')
        new_desde, new_hasta = scraper.scrape_player_data(cleaned_dni, logger=print)

        if new_desde and new_hasta:
            try:
                new_fm_hasta_date = datetime.strptime(new_hasta, '%d/%m/%Y')
                should_update = False
                
                if old_fm_hasta_str is None:
                    should_update = True
                else:
                    old_fm_hasta_date = datetime.strptime(old_fm_hasta_str, '%d/%m/%Y')
                    if new_fm_hasta_date > old_fm_hasta_date:
                        should_update = True
                    else:
                        print(f"La ficha médica encontrada para {nombre} ({new_hasta}) no es más reciente que la registrada ({old_fm_hasta_str}). No se actualiza.")
                
                if should_update:
                    print(f"Actualizando Firebase para {nombre} con fechas: {new_desde} - {new_hasta}")
                    success = firebase_service.update_player_fm(db_ref, dni_for_update, new_desde, new_hasta)
                    if success:
                        print(f"¡Éxito! Jugador {nombre} actualizado en Firebase.")
                        updated_count += 1
                    else:
                        print(f"FALLO: No se pudo actualizar a {nombre} en Firebase.")

            except (ValueError, TypeError) as e:
                print(f"ADVERTENCIA: No se pudo procesar la(s) fecha(s) para {nombre} ({dni_for_update}). Error: {e}")
        else:
            print(f"No se encontraron nuevas fechas para {nombre} en la web de la APS.")
            not_found_count += 1

    scraper.close_driver(logger=print)

    # --- Resumen Final ---
    print("\n================ RESUMEN FINAL ================")
    print(f"Jugadores que necesitaban actualización: {len(players_to_update)}")
    print(f"Jugadores actualizados correctamente: {updated_count}")
    print(f"Jugadores para los que no se encontraron datos: {not_found_count}")
    print("=================================================")
    print("== FIN DEL SCRIPT DE ACTUALIZACIÓN ==")

    summary_lines = [
        "================ RESUMEN FINAL ================",
        f"Jugadores que necesitaban actualización: {len(players_to_update)}",
        f"Jugadores actualizados correctamente: {updated_count}",
        f"Jugadores para los que no se encontraron datos: {not_found_count}",
        "=================================================",
        "== FIN DEL SCRIPT DE ACTUALIZACIÓN =="
    ]
    summary_log_entry = "\n".join(summary_lines)
    firebase_service.add_log_entry(summary_log_entry, "SISTEMA")


if __name__ == "__main__":
    main()
