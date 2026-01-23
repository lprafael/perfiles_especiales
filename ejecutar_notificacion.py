import psycopg2
import pandas as pd
from datetime import date, timedelta, datetime
import smtplib
from email.mime.text import MIMEText
import ssl
from tabulate import tabulate
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import os
import sys

hostCID = "168.90.177.232"
databaseCID = "bbdd-monitoreo-cid"
userCID = "cid_admin_user"
passwordCID = "vmtdmtcidccm"
portCID = "2024"

hostMON = "monitoreo.vmt.gov.py"
databaseMON = "bbdd-monitoreo-prod"
userMON = "jefe-CID"
passwordMON = "vmtdmt"
portMON = "5432"

# Obtener datos de EOTs permisionarios
connCID = None
try:
    connCID = psycopg2.connect(host=hostCID, database=databaseCID, user=userCID, password=passwordCID, port=portCID)
    cur = connCID.cursor()
    cur.execute("SELECT eot_nombre, cod_catalogo, id_eot_vmt_hex, e_mail FROM eots WHERE permisionario = TRUE")
    rows = cur.fetchall()
    colnames = [desc[0] for desc in cur.description]
    datasetEOT = pd.DataFrame(rows, columns=colnames)
except (Exception, psycopg2.Error) as error:
    print("Error al conectar a PostgreSQL", error)
finally:
    if connCID:
        cur.close()
        connCID.close()
        print("Se ejecutó la consulta de los EOTs con los datos de los permisos de los EOTs y se guardó en el datasetEOT")

sw = False  # Deshabilitar ejecución
# Verificar si hoy es lunes y calcular fechas
fecha_actual = datetime.now()
# Lógica de fechas basada en el día del mes
dia_mes = fecha_actual.day
if 12 <= dia_mes <= 20:
    # Si está entre el día 16 y 20, consultar del 1 al 15 del mes actual
    fecha_inicio = fecha_actual.replace(day=1)
    fecha_fin = fecha_actual.replace(day=15)
    sw = True  # Habilitar ejecución
elif 1 <= dia_mes <= 4:
    # Si está entre el día 1 y 4, consultar del 16 al último día del mes anterior
    mes_anterior = fecha_actual.replace(day=1) - timedelta(days=1)
    fecha_inicio = mes_anterior.replace(day=16)
    fecha_fin = mes_anterior
    sw = True  # Habilitar ejecución
else:
    # En cualquier otro caso, no ejecutar
    fecha_inicio = None
    fecha_fin = None
    sw = False  # Deshabilitar ejecución

# CONSULTAR SI SE QUIERE AVANZAR
consultar = True
while consultar:
    respuesta = input(f"¿Deseas avanzar con el procesamiento de la fecha {fecha_inicio.strftime('%Y-%m-%d')} a la fecha {fecha_fin.strftime('%Y-%m-%d')}? (S/N): ").upper()
    if respuesta == "S":
        print("¡Avanzando!")
        consultar = False
    elif respuesta == "N":
        print("Saliendo del programa.")
        sys.exit()
    else:
        print("Por favor, ingresa 'S' para Sí o 'N' para No.")

if sw:
    start = fecha_inicio.strftime('%Y-%m-%d 00:00:00')
    end = fecha_fin.strftime('%Y-%m-%d 23:59:59')
    print(f"Fecha actual: {fecha_actual.strftime('%Y-%m-%d')}")
    print(f"Período de consulta: {start} a {end}")
    print("Ejecutando script - Condición de fechas cumplida")
    connMON = None
    try:
        connMON = psycopg2.connect(host=hostMON, database=databaseMON, user=userMON, password=passwordMON, port=portMON)
        curMON = connMON.cursor()
        query = """
            SELECT DISTINCT agency_id, DATE(fecha_hora) as fecha
            FROM app_monitoreo_mensajeoperativo
            WHERE fecha_hora >= %s AND fecha_hora <= %s
            ORDER BY fecha
        """
        curMON.execute(query, (start, end))
        mon_data = curMON.fetchall()
        mon_set = set((str(row[0]), row[1].strftime('%Y-%m-%d')) for row in mon_data)

        datasetCOD = datasetEOT[["eot_nombre", "id_eot_vmt_hex", "cod_catalogo", "e_mail"]]
        filtered_data_not_sends = []
        
        # Generar todas las fechas en el rango
        current_date = fecha_inicio
        while current_date <= fecha_fin:
            fecha_str = current_date.strftime('%Y-%m-%d')
            for index, row in datasetCOD.iterrows():
                id_hex = str(row['id_eot_vmt_hex'])
                cod_cat = str(row['cod_catalogo'])
                e_mail = str(row['e_mail'])
                
                # Verificar si no hay datos para esta fecha
                if (id_hex, fecha_str) not in mon_set and (cod_cat, fecha_str) not in mon_set:
                    filtered_data_not_sends.append((row['eot_nombre'], id_hex, cod_cat, e_mail, fecha_str))
            
            current_date += timedelta(days=1)

        if filtered_data_not_sends:
            datasetCOD_no_filtrados = pd.DataFrame(filtered_data_not_sends, 
                columns=["eot_nombre", "id_eot_vmt_hex", "cod_catalogo", "e_mail", "fecha"])
            
            # Agrupar por EOT y crear una lista de fechas
            grouped_data = datasetCOD_no_filtrados.groupby(
                ["eot_nombre", "id_eot_vmt_hex", "cod_catalogo", "e_mail"]
            ).agg({
                "fecha": lambda x: sorted(list(x))
            }).reset_index()
            
            # Convertir la lista de fechas en una cadena formateada
            grouped_data["fechas_sin_datos"] = grouped_data["fecha"].apply(
                lambda x: ", ".join(x)
            )
            
            # Eliminar la columna fecha original y mostrar solo las columnas necesarias
            grouped_data = grouped_data.drop("fecha", axis=1)
            
            print("\nLista de Registros de Empresas que no enviaron datos operativos:")
            print(f"Los filtros se obtienen desde la fecha {fecha_inicio} al {fecha_fin}")
            print(tabulate(grouped_data, headers='keys', tablefmt='psql'))

            # Crear el archivo Excel
            excel_filename = f"reporte_notificaciones_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            grouped_data.to_excel(excel_filename, index=False, sheet_name='Notificaciones')

            # Datos para el correo electrónico
            sender_email = "billetajevmt@gmail.com"
            sender_password = "qlju dhxo jbon exlg"
            
            # Crear el mensaje
            msg = MIMEMultipart()
            msg['Subject'] = f'Reporte de Empresas sin Envío de Datos - {fecha_inicio.strftime("%Y-%m-%d")} al {fecha_fin.strftime("%Y-%m-%d")}'
            msg['From'] = sender_email
            msg['To'] = "rolandog@mopc.gov.py"
            #msg['To'] = "hector.lopez@mopc.gov.py"
            msg['Cc'] = "lprafael1710@gmail.com,hatoweb@gmail.com,transporte.mopc@gmail.com"
            #msg['Cc'] = "dgeec2011@gmail.com"

            # Crear el cuerpo del mensaje en HTML
            body = f"""
            <html>
            <body>
                <h2>Reporte de Empresas sin Envío de Datos Operativos</h2>
                <p>Período: {fecha_inicio.strftime('%Y-%m-%d')} al {fecha_fin.strftime('%Y-%m-%d')}</p>
                <p>Las siguientes empresas no han enviado sus datos operativos en el período indicado:</p>
                {grouped_data.to_html(index=False)}
                <br>
                <p>Se adjunta el archivo Excel con el reporte detallado.</p>
                <br>
                <p>Saludos cordiales,</p>
                <p>Sistema de Monitoreo VMT</p>
            </body>
            </html>
            """
            
            # Adjuntar el cuerpo del mensaje
            msg.attach(MIMEText(body, 'html'))
            
            # Adjuntar el archivo Excel
            with open(excel_filename, 'rb') as f:
                excel_attachment = MIMEBase('application', 'vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                excel_attachment.set_payload(f.read())
                encoders.encode_base64(excel_attachment)
                excel_attachment.add_header(
                    'Content-Disposition',
                    f'attachment; filename={excel_filename}'
                )
                msg.attach(excel_attachment)

            # Enviar el correo
            try:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
                    server.login(sender_email, sender_password)
                    all_recipients = ["rolandog@mopc.gov.py", "lprafael1710@gmail.com", "hatoweb@gmail.com", "transporte.mopc@gmail.com"]
                    #all_recipients = ["hector.lopez@mopc.gov.py", "dgeec2011@gmail.com"]
                    server.send_message(msg, to_addrs=all_recipients)
                print(f"\nCorreo con reporte Excel enviado exitosamente a todos los destinatarios")
                
                # Eliminar el archivo Excel después de enviarlo
                os.remove(excel_filename)
                print(f"Archivo Excel temporal eliminado: {excel_filename}")
                
            except Exception as e:
                print(f"\nError al enviar el correo electrónico: {str(e)}")
            
            # Enviar notificaciones individuales a cada empresa
            print("\nEnviando notificaciones individuales a las empresas...")
            
            for index, row in grouped_data.iterrows():
                empresa_email =  row['e_mail']# "hatoweb@gmail.com"
                empresa_nombre = row['eot_nombre']
                fechas_sin_datos = row['fechas_sin_datos']
                
                # Procesar fechas para tabla Año, Mes, Días
                from datetime import datetime
                fechas_lista = [f.strip() for f in fechas_sin_datos.split(',') if f.strip()]
                agrupado = {}
                for f in fechas_lista:
                    dt = datetime.strptime(f, '%Y-%m-%d')
                    año = dt.year
                    mes = f"{dt.month:02d}"
                    día = f"{dt.day:02d}"
                    if (año, mes) not in agrupado:
                        agrupado[(año, mes)] = []
                    agrupado[(año, mes)].append(día)
                tabla_fechas = '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; margin-top:10px;">'
                tabla_fechas += '<tr><th>Año</th><th>Mes</th><th>Días</th></tr>'
                for (año, mes), dias in agrupado.items():
                    tabla_fechas += f'<tr><td>{año}</td><td>{mes}</td><td>{" ".join(dias)}</td></tr>'
                tabla_fechas += '</table>'
                
                # Crear mensaje individual para cada empresa
                msg_empresa = MIMEMultipart()
                msg_empresa['Subject'] = f'Notificación: Falta de Envío de Datos Operativos - {fecha_inicio.strftime("%Y-%m-%d")} al {fecha_fin.strftime("%Y-%m-%d")}'
                msg_empresa['From'] = sender_email
                msg_empresa['To'] = empresa_email
                msg_empresa['Cc'] = "vmtdeveloperpy@gmail.com"
                
                # Cuerpo del mensaje para la empresa
                body_empresa = f"""
                <html>
                <head>
                    <style>
                        body {{
                            font-family: Arial, sans-serif;
                            line-height: 1.5;
                            width: 70%;
                            margin: 0 auto;
                            padding: 20px;
                            color: #333333;
                        }}
                        p {{
                            text-align: justify;
                            margin-bottom: 15px;
                        }}
                        .header {{
                            border-bottom: 2px solid #1a5276;
                            padding-bottom: 10px;
                            margin-bottom: 20px;
                        }}
                        .footer {{
                            margin-top: 30px;
                            border-top: 1px solid #1a5276;
                            padding-top: 20px;
                        }}
                        strong {{
                            color: #1a5276;
                        }}
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2>Notificación de Falta de Envío de Datos Operativos</h2>
                        <p>Estimada empresa: <strong>{empresa_nombre}</strong></p>
                    </div>

                    <p>Se informa que,  a fin de dar cumplimiento a lo establecido en la Circual DMT Nº 05/2025,  se ha llevado adelante el monitoreo del periodo comprendido entre el 
                    <strong>{fecha_inicio.strftime('%Y-%m-%d')} al {fecha_fin.strftime('%Y-%m-%d')}</strong>, 
                    detectándose las siguientes fechas sin envío de datos:</p>

                    {tabla_fechas}

                    <br>
                    <p>Atendiendo lo establecido en el <strong>Artículo 1°</strong> de la <strong>Resolución GVMT N° 65/2024</strong>, 
                    se notifica por este medio el incumplimiento en el envío de datos, 
                    esta situación constituye un incumplimiento que dará lugar a lo dispuesto en el <strong>Artículo 5°</strong> de la misma normativa.</p>
                    <br>
                    <p>En consecuencia, <strong>se ha generado una notificación formal de incumplimiento, la cual conlleva la aplicación de una multa administrativa conforme al régimen vigente.</strong></p>

                    <p>Ante consulta, no dude en contactar al equipo VMT</p>
                    <br>
                    <div class="footer">
                        <p>
                            <strong>Coordinación de Innovación y Desarrollo<br>
                            Viceministerio de Transporte</strong>
                        </p>
                    </div>
                </body>
                </html>
                """
                
                # Adjuntar el cuerpo del mensaje
                msg_empresa.attach(MIMEText(body_empresa, 'html'))
                
                # Enviar el correo a la empresa
                try:
                    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
                        server.login(sender_email, sender_password)
                        server.send_message(msg_empresa, to_addrs=[empresa_email, "vmtdeveloperpy@gmail.com"])
                    print(f"✓ Notificación enviada a {empresa_nombre} ({empresa_email})")
                except Exception as e:
                    print(f"✗ Error al enviar notificación a {empresa_nombre} ({empresa_email}): {str(e)}")
            
            print("\nProceso de notificaciones completado.")

            try:
                connCID = psycopg2.connect(host=hostCID, database=databaseCID, user=userCID, password=passwordCID, port=portCID)
                cur = connCID.cursor()
                insert_query = """
                    INSERT INTO verificacion_res_65.notificaciones
                    (eot_nombre, cod_catalogo, id_eot_vmt_hex, e_mail, nro_notificacion, fecha_inicio, fecha_fin, fecha_hora, fecha_sin_datos)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, %s)
                """
                for _, row in grouped_data.iterrows():
                    cur.execute(insert_query, (
                        row['eot_nombre'],
                        row['cod_catalogo'],
                        row['id_eot_vmt_hex'],
                        row['e_mail'],
                        None,  # nro_notificacion como NULL
                        start,
                        end,
                        row['fechas_sin_datos']
                    ))
                connCID.commit()
                print("Datos insertados correctamente en la tabla notificaciones")

                # Crear tabla de multas si no existe
                create_table_query = """
                    CREATE TABLE IF NOT EXISTS verificacion_res_65.multas (
                        id_multa SERIAL PRIMARY KEY,
                        eot_nombre VARCHAR(255),
                        cod_catalogo VARCHAR(50),
                        id_eot_vmt_hex VARCHAR(50),
                        fecha_multa TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """
                cur.execute(create_table_query)
                connCID.commit()
                print("Tabla de multas verificada/creada correctamente")

                # Logica para generar multas
                query = """
                    SELECT eot_nombre, cod_catalogo, id_eot_vmt_hex, COUNT(*) as cantidad
                    FROM verificacion_res_65.notificaciones
                    WHERE nro_notificacion IS NULL
                    GROUP BY eot_nombre, cod_catalogo, id_eot_vmt_hex
                    HAVING COUNT(*) >= 1
                """
                cur.execute(query)
                empresas_para_multas = cur.fetchall()

                if empresas_para_multas:
                    print("\nEmpresas que alcanzaron 1 notificaciones serán multadas:\n")
                    print(f"Período analizado: {start} a {end}")
                    
                    # Crear el contenido del correo para empresas multadas
                    email_content_multas = f"""
                    <html>
                    <body style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <p>Buenos días,</p>
                    
                    <p>Se informa que las siguientes empresas han alcanzado 3 notificaciones y serán multadas:</p>
                    
                    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                        <tr style="background-color: #f2f2f2;">
                            <th>Empresa</th>
                            <th>Código Catálogo</th>
                            <th>ID VMT</th>
                            <th>Cantidad de Notificaciones</th>
                        </tr>
                    """

                    for row in empresas_para_multas:
                        eot_nombre = row[0]
                        cod_catalogo = row[1]
                        id_eot_vmt_hex = row[2]
                        cantidad = row[3]
                        print(f"- {eot_nombre} ({cod_catalogo}) - {cantidad} notificaciones")

                        # Agregar fila a la tabla del correo
                        email_content_multas += f"""
                        <tr>
                            <td>{eot_nombre}</td>
                            <td>{cod_catalogo}</td>
                            <td>{id_eot_vmt_hex}</td>
                            <td>{cantidad}</td>
                        </tr>
                        """

                        # Insertar la multa y obtener su ID
                        insert_multa_query = """
                            INSERT INTO verificacion_res_65.multas
                            (eot_nombre, cod_catalogo, id_eot_vmt_hex, fecha_multa)
                            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                            RETURNING id_multa
                        """
                        cur.execute(insert_multa_query, (eot_nombre, cod_catalogo, id_eot_vmt_hex))
                        id_multa = cur.fetchone()[0]  # Obtener el id_multa generado
                        
                        # Actualizar las notificaciones con el id_multa correspondiente
                        update_query = """
                            UPDATE verificacion_res_65.notificaciones
                            SET nro_notificacion = %s
                            WHERE nro_notificacion IS NULL
                              AND cod_catalogo = %s
                              AND id_eot_vmt_hex = %s
                              AND fecha_hora >= CURRENT_DATE - INTERVAL '90 days'
                        """
                        cur.execute(update_query, (id_multa, cod_catalogo, id_eot_vmt_hex))
                        print(f"Actualizadas notificaciones para {eot_nombre} con id_multa: {id_multa}")

                    email_content_multas += """
                    </table>
                    
                    <p>Saludos cordiales,<br>
                    Sistema de Monitoreo VMT</p>
                    </body>
                    </html>
                    """
                    
                    # Configurar el mensaje para multas
                    message_multas = MIMEText(email_content_multas, 'html')
                    message_multas['Subject'] = f'Empresas a Multar - {fecha_actual.strftime("%Y-%m-%d")}'
                    message_multas['From'] = sender_email
                    message_multas['To'] = "vmtcid@mopc.gov.py"
                    
                    # Enviar el correo de multas
                    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
                        server.login(sender_email, sender_password)
                        server.send_message(message_multas)
                        print("Correo de empresas multadas enviado exitosamente a vmtcid@mopc.gov.py")

                    connCID.commit()
                    print("\nMultas generadas y notificaciones actualizadas correctamente.")
                else:
                    print("\nNo hay empresas con 3 notificaciones sin procesar en los últimos 90 días.")

            except (Exception, psycopg2.Error) as error:
                print("Error al insertar o procesar multas:", error)
                if connCID:
                    connCID.rollback()
            finally:
                if connCID:
                    cur.close()
                    connCID.close()


        else:
            print("No se encontraron datos que coincidan con los criterios especificados.")

    except (Exception, psycopg2.Error) as error:
        print("Error al conectar a PostgreSQL o ejecutar la consulta:", error)
    finally:
        if connMON:
            if 'curMON' in locals():
                curMON.close()
            connMON.close()
            print("Se ejecutó la consulta de los EOTs con los datos no enviados y se guardó en el datasetCOD_no_filtrados")
else:
    print("No se ejecuta el script - Condición de fechas no cumplida")
    print(f"Hoy es día {dia_mes}, no está en el rango permitido (10-20)")