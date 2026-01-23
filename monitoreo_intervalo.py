import psycopg2
import pandas as pd
from datetime import date, timedelta, datetime
import smtplib
from email.mime.text import MIMEText
import ssl
import json
import os

import tabulate

from tabulate import tabulate

hostCID = "168.90.177.232"
databaseCID = "bbdd-monitoreo-cid"
userCID = "cid_admin_user"
passwordCID = "vmtdmtcidccm"
portCID = "2024" # Por defecto es 5432

hostMON = "monitoreo.vmt.gov.py"
databaseMON = "bbdd-monitoreo-prod"
userMON = "jefe-CID"
passwordMON = "vmtdmt"
portMON = "5432" # Por defecto es 5432

# prompt: Quiero un código para consultar, con "import psycopg2",
# todos los registros de la tabla eots de la base de datos bbdd-monitoreo-cid que tienen el campo permisionario=true,
# el resultado quiero guardarlo en un dataset

connCID = None
try:
    connCID = psycopg2.connect(host=hostCID, database=databaseCID, user=userCID, password=passwordCID, port=portCID)
    cur = connCID.cursor()

    cur.execute("SELECT eot_nombre, cod_catalogo, id_eot_vmt_hex, e_mail FROM eots WHERE permisionario = TRUE")
    rows = cur.fetchall()

    # Obtener los nombres de las columnas
    colnames = [desc[0] for desc in cur.description]

    # Crear un DataFrame de pandas
    datasetEOT = pd.DataFrame(rows, columns=colnames)

    #print(datasetEOT)
    #print(tabulate(datasetEOT, headers='keys', tablefmt='psql'))

except (Exception, psycopg2.Error) as error:
    print("Error al conectar a PostgreSQL", error)
finally:
    if connCID:
        cur.close()
        connCID.close()
        #print("La conexión a PostgreSQL se cerró")
        print("Se ejecutó la consulta de los EOTs con los datos de los permisos de los EOTs y se guardó en el datasetEOT")

# 2- CONSULTA DE LOS EOTs QUE NO ENVIARON SUS DATOS entre un intervalo de tiempo (inicio y fin)

yesterday = date.today() - timedelta(days=1)
fecha_inicio = datetime.combine(yesterday, datetime.min.time())
fecha_fin = datetime.combine(yesterday, datetime.max.time()).replace(microsecond=0)
#yesterday_str_2 = yesterday.strftime('%d-%m-%Y')

# --- Parametrización de fechas por consola ---
#input_inicio = input('Ingrese la fecha de inicio (YYYY-MM-DD): ')
#input_fin = input('Ingrese la fecha de fin (YYYY-MM-DD): ')

#try:
#    fecha_inicio = datetime.strptime(input_inicio, '%Y-%m-%d')
#    fecha_inicio = fecha_inicio.replace(hour=0, minute=0, second=0)
#    fecha_fin = datetime.strptime(input_fin, '%Y-%m-%d')
#    fecha_fin = fecha_fin.replace(hour=23, minute=59, second=59)
#    if fecha_inicio > fecha_fin:
#        print('Error: la fecha de inicio no puede ser mayor que la fecha de fin.')
#        exit(1)
#except Exception as e:
#    print('Error en el formato de fecha. Debe ser YYYY-MM-DD.')
#    raise e

connMON = None
try:
    connMON = psycopg2.connect(
        host=hostMON,
        database=databaseMON,
        user=userMON,
        password=passwordMON,
        port=portMON
    )
    curMON = connMON.cursor()

    # Consulta parametrizada
    query = """
        SELECT DISTINCT agency_id, DATE(fecha_hora) as fecha
        FROM app_monitoreo_mensajeoperativo
        WHERE fecha_hora >= %s AND fecha_hora <= %s
    """
    curMON.execute(query, (fecha_inicio, fecha_fin))

    mon_data = curMON.fetchall()
    colnames = [desc[0] for desc in curMON.description]
    resultados = []
    for row in mon_data:
        row_dict = dict(zip(colnames, row))
        # Convertir cualquier campo de tipo date o datetime a string
        for key, value in row_dict.items():
            if isinstance(value, (date, datetime)):
                row_dict[key] = value.isoformat()
        # Solo guardar agency_id y fecha
        resultados.append({
            'agency_id': row_dict['agency_id'],
            'fecha': row_dict['fecha']
        })

    # Guardar agency_id y fecha (append)
    archivo_agency = r"C:\xampp\htdocs\vmt\resultado_agency_id.json"
    if os.path.exists(archivo_agency):
        with open(archivo_agency, "r", encoding="utf-8") as f:
            datos_existentes = json.load(f)
    else:
        datos_existentes = []
    datos_existentes.extend(resultados)
    with open(archivo_agency, "w", encoding="utf-8") as f:
        json.dump(datos_existentes, f, ensure_ascii=False, indent=4)

    # Segunda consulta: DISTINCT mean_id por agency_id y fecha
    try:
        query_mean = """
            SELECT DISTINCT agency_id, mean_id, DATE(fecha_hora) as fecha
            FROM app_monitoreo_mensajeoperativo
            WHERE fecha_hora >= %s AND fecha_hora <= %s
        """
        curMON.execute(query_mean, (fecha_inicio, fecha_fin))
        mean_data = curMON.fetchall()
        colnames_mean = [desc[0] for desc in curMON.description]
        resultados_mean = []
        for row in mean_data:
            row_dict = dict(zip(colnames_mean, row))
            for key, value in row_dict.items():
                if isinstance(value, (date, datetime)):
                    row_dict[key] = value.isoformat()
            resultados_mean.append({
                'agency_id': row_dict['agency_id'],
                'mean_id': row_dict['mean_id'],
                'fecha': row_dict['fecha']
            })
        archivo_mean = r"C:\xampp\htdocs\vmt\resultado_mean_id.json"
        if os.path.exists(archivo_mean):
            with open(archivo_mean, "r", encoding="utf-8") as f:
                datos_existentes_mean = json.load(f)
        else:
            datos_existentes_mean = []
        datos_existentes_mean.extend(resultados_mean)
        with open(archivo_mean, "w", encoding="utf-8") as f:
            json.dump(datos_existentes_mean, f, ensure_ascii=False, indent=4)
        print("Se guardó el archivo resultado_mean_id.json correctamente.")
    except (Exception, psycopg2.Error) as error:
        print("Error al ejecutar la consulta de mean_id:", error)

    # Tercera consulta: DISTINCT route_id por agency_id y fecha
    try:
        query_route = """
            SELECT DISTINCT agency_id, route_id, DATE(fecha_hora) as fecha
            FROM app_monitoreo_mensajeoperativo
            WHERE fecha_hora >= %s AND fecha_hora <= %s
        """
        curMON.execute(query_route, (fecha_inicio, fecha_fin))
        route_data = curMON.fetchall()
        colnames_route = [desc[0] for desc in curMON.description]
        resultados_route = []
        for row in route_data:
            row_dict = dict(zip(colnames_route, row))
            for key, value in row_dict.items():
                if isinstance(value, (date, datetime)):
                    row_dict[key] = value.isoformat()
            resultados_route.append({
                'agency_id': row_dict['agency_id'],
                'route_id': row_dict['route_id'],
                'fecha': row_dict['fecha']
            })
        archivo_route = r"C:\xampp\htdocs\vmt\resultado_route_id.json"
        if os.path.exists(archivo_route):
            with open(archivo_route, "r", encoding="utf-8") as f:
                datos_existentes_route = json.load(f)
        else:
            datos_existentes_route = []
        datos_existentes_route.extend(resultados_route)
        with open(archivo_route, "w", encoding="utf-8") as f:
            json.dump(datos_existentes_route, f, ensure_ascii=False, indent=4)
        print("Se guardó el archivo resultado_route_id.json correctamente.")
    except (Exception, psycopg2.Error) as error:
        print("Error al ejecutar la consulta de route_id:", error)

except (Exception, psycopg2.Error) as error:
    print("Error al conectar a PostgreSQL o ejecutar la consulta:", error)
finally:
    if connMON:
        if 'curMON' in locals():
            curMON.close()
        connMON.close()
        #print("La conexión a PostgreSQL MON se cerró")
        print("Se ejecutó la consulta de los EOTs con los datos no enviados y se guardó en el datasetCOD_no_filtrados")
