import os
import json
import zipfile
import io
from datetime import datetime, timedelta
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
import psycopg2
from psycopg2.extras import execute_values
from typing import Dict, List, Optional, Tuple
from dotenv import load_dotenv
import pytz

# Cargar variables de entorno
load_dotenv()

class CompensacionProcessor:
    def __init__(self):
        """
        Inicializa el procesador de compensación usando variables de entorno
        """
        # Configuración de Slack
        self.slack_token = os.getenv("SLACK_TOKEN")
        if not self.slack_token:
            raise ValueError("SLACK_TOKEN no configurado en .env")

        self.slack_client = WebClient(token=self.slack_token)
        self.channel_name = os.getenv("SLACK_CHANNEL", "compensaciondiaria")

        # Configuración de base de datos
        self.db_config = {
            "host": os.getenv("DB_HOST", "localhost"),
            "port": int(os.getenv("DB_PORT", "5432")),
            "database": os.getenv("DB_NAME"),
            "user": os.getenv("DB_USER"),
            "password": os.getenv("DB_PASSWORD")
        }

        # Validar configuración de BD
        if not all([self.db_config["database"], self.db_config["user"], self.db_config["password"]]):
            raise ValueError("Configuración de base de datos incompleta en .env")

        # Configuración del proceso
        self.dias_restar = int(os.getenv("DIAS_RESTAR", "2"))
        self.empresas = os.getenv("EMPRESAS", "EPAS,TDP").split(",")
        
        # Comisión de interoperabilidad (ejemplo: 0.1 para 10%)
        self.comision_interoperabilidad = float(os.getenv("COMISION_INTEROPERABILIDAD", "0.1"))

        # Zona horaria
        timezone_str = os.getenv("TIMEZONE", "America/Asuncion")
        self.timezone = pytz.timezone(timezone_str)

        print(f"⚙️  Configuración cargada:")
        print(f"   Canal Slack: #{self.channel_name}")
        print(f"   Base de datos: {self.db_config['database']}@{self.db_config['host']}")
        print(f"   Empresas: {', '.join(self.empresas)}")
        print(f"   Días a restar: {self.dias_restar}")
        print(f"   Comisión de interoperabilidad: {self.comision_interoperabilidad*100}%")
        print(f"   Zona horaria: {timezone_str}\n")

    def conectar_db(self):
        """Establece conexión con PostgreSQL"""
        return psycopg2.connect(**self.db_config)

    def obtener_ultima_fecha_cargada(self) -> dict:
        """
        Obtiene la última fecha cargada para cada empresa en la base de datos.
        
        Returns:
            dict: Diccionario con las fechas máximas para cada empresa, ej: {'TDP': fecha_tdp, 'EPAS': fecha_epas}
        """
        print("📅 Obteniendo últimas fechas cargadas por empresa...")
        conn = self.conectar_db()
        cursor = conn.cursor()

        # Obtener la última fecha para cada empresa
        cursor.execute("""
            SELECT 
                MAX(CASE WHEN archivo_tdp IS NOT NULL THEN fecha END) as fecha_tdp,
                MAX(CASE WHEN archivo_epas IS NOT NULL THEN fecha END) as fecha_epas
            FROM compensacion.compensacion_archivos
        """)

        fecha_tdp, fecha_epas = cursor.fetchone()
        cursor.close()
        conn.close()

        # Convertir a datetime si es necesario
        def convertir_fecha(fecha):
            if not fecha:
                return None
            if isinstance(fecha, datetime):
                return fecha
            return datetime.combine(fecha, datetime.min.time())

        fechas = {
            'TDP': convertir_fecha(fecha_tdp),
            'EPAS': convertir_fecha(fecha_epas)
        }

        print("✅ Últimas fechas cargadas:")
        for empresa, fecha in fechas.items():
            print(f"   {empresa}: {fecha.date() if fecha else 'Sin datos'}")
            
        return fechas

    def enviar_notificacion_slack(self, mensaje: str, canal: str = "compensacióndiaria") -> Optional[Dict]:
        """
        Envía un mensaje a un canal de Slack
        """
        try:
            response = self.slack_client.chat_postMessage(
                channel=f"#{canal}",
                text=mensaje
            )
            print(f"  📨 Notificación enviada a #{canal}")
            return response
        except SlackApiError as e:
            print(f"  ❌ Error al enviar notificación a Slack: {e}")
            return None

    def obtener_channel_id(self) -> str:
        """Obtiene el ID del canal de Slack"""
        print(f"🔍 Buscando canal #{self.channel_name}...")
        try:
            result = self.slack_client.conversations_list(types="public_channel,private_channel")
            for channel in result["channels"]:
                if channel["name"] == self.channel_name:
                    print(f"✅ Canal encontrado: {channel['id']}")
                    return channel["id"]
            raise Exception(f"Canal #{self.channel_name} no encontrado")
        except SlackApiError as e:
            print(f"❌ Error al buscar canal: {e}")
            raise

    def buscar_archivo_zip(self, channel_id: str, empresa: str, fecha: datetime) -> Optional[Dict]:
        """
        Busca un archivo específico en Slack, intentando con diferentes variaciones
        de nombre y en un rango de fechas más amplio.

        Args:
            channel_id: ID del canal de Slack
            empresa: Nombre de la empresa (EPAS o TDP)
            fecha: Fecha objetivo para buscar el archivo

        Returns:
            Dict con información del archivo o None si no se encuentra
        """
        fecha_str = fecha.strftime("%Y-%m-%d")
        print(f"\n🔍 Buscando archivo para {empresa} con fecha {fecha_str}")
        
        # Configuración específica por empresa
        if empresa == "EPAS":
            patrones_base = [
                f"Epas_insumos_compensacion_{fecha_str}",
                f"epas_insumos_compensacion_{fecha_str}",
                f"EPAS_insumos_compensacion_{fecha_str}",
                f"Epas insumos compensacion {fecha_str}",
                f"insumos_compensacion_epas_{fecha_str}",
                f"insumos_compensacion_EPAS_{fecha_str}",
                f"compensacion_epas_{fecha_str}",
                f"compensacion_EPAS_{fecha_str}",
                f"epas_compensacion_{fecha_str}",
                f"EPAS_compensacion_{fecha_str}"
            ]
        else:  # TDP
            patrones_base = [
                f"TDP insumos compensacion {fecha_str}",
                f"TDP_insumos_compensacion_{fecha_str}",
                f"tdp_insumos_compensacion_{fecha_str}",
                f"TDP_compensacion_{fecha_str}",
                f"tdp_compensacion_{fecha_str}",
                f"insumos_compensacion_tdp_{fecha_str}",
                f"insumos_compensacion_TDP_{fecha_str}",
                f"compensacion_tdp_{fecha_str}",
                f"compensacion_TDP_{fecha_str}",
                f"TDP_insumos_{fecha_str}"
            ]
        
        # Generar variaciones con diferentes extensiones
        extensiones = ['.zip', '.ZIP', '.Zip', '' ]
        patrones = []
        for patron in patrones_base:
            for ext in extensiones:
                patrones.append(f"{patron}{ext}")
        
        print(f"  🔍 Patrones de búsqueda generados: {', '.join(patrones[:5])}...")
        
        # Primero intentamos buscar sin restricción de fechas
        try:
            print("  🔍 Realizando búsqueda sin restricción de fechas...")
            result = self.slack_client.conversations_history(
                channel=channel_id,
                limit=200
            )
            
            archivo_encontrado = self._buscar_en_resultados(result, patrones)
            if archivo_encontrado:
                return archivo_encontrado
                
        except Exception as e:
            print(f"  ⚠️  Error en búsqueda sin restricciones: {str(e)}")
        
        # Si no se encontró, intentamos con un rango de fechas más amplio
        print("  🔍 Realizando búsqueda con rango de fechas extendido...")
        
        # Buscar en los últimos 90 días
        for dias_atras in range(0, 90, 7):  # Buscar cada 7 días para reducir el número de llamadas
            try:
                fecha_inicio = fecha - timedelta(days=dias_atras + 7)
                fecha_fin = fecha - timedelta(days=dias_atras)
                
                print(f"  🔍 Buscando archivos entre {fecha_inicio.date()} y {fecha_fin.date()}")
                
                result = self.slack_client.conversations_history(
                    channel=channel_id,
                    oldest=str(int(fecha_inicio.timestamp())),
                    latest=str(int(fecha_fin.timestamp())),
                    limit=200
                )
                
                archivo_encontrado = self._buscar_en_resultados(result, patrones)
                if archivo_encontrado:
                    return archivo_encontrado
                    
            except Exception as e:
                print(f"  ⚠️  Error al buscar archivos: {str(e)}")
                continue
        
        print(f"  ❌ No se encontró ningún archivo para {empresa} con fecha cercana a {fecha_str}")
        print(f"  Se intentaron {len(patrones)} patrones diferentes")
        return None
        
    def _buscar_en_resultados(self, result: Dict, patrones: List[str]) -> Optional[Dict]:
        """
        Busca un archivo que coincida con alguno de los patrones en los resultados de la API de Slack.
        
        Args:
            result: Resultado de la API de Slack
            patrones: Lista de patrones a buscar
            
        Returns:
            Dict con información del archivo o None si no se encuentra
        """
        patrones_lower = [p.lower() for p in patrones]
        
        for message in result.get("messages", []):
            if "files" in message:
                for file in message["files"]:
                    file_name = file.get("name", "")
                    file_name_lower = file_name.lower()
                    file_url = file.get("url_private", "").lower()
                    
                    # Verificar si es un archivo ZIP
                    if not (file_name_lower.endswith('.zip') or '.zip?' in file_url):
                        continue
                    
                    # Verificar si el nombre del archivo o la URL coinciden con algún patrón
                    for patron, patron_lower in zip(patrones, patrones_lower):
                        if (patron_lower in file_name_lower) or (patron_lower in file_url):
                            print(f"  ✅ Archivo encontrado: {file_name}")
                            print(f"     Fecha del mensaje: {datetime.fromtimestamp(float(message.get('ts', 0))).strftime('%Y-%m-%d %H:%M')}")
                            print(f"     URL: {file.get('url_private', '')}")
                            return file
        
        return None

    def descargar_archivo(self, file_info: Dict) -> bytes:
        """Descarga el contenido del archivo desde Slack"""
        print(f"  ⬇️  Descargando archivo...")
        try:
            import requests
            url = file_info["url_private"]
            headers = {"Authorization": f"Bearer {self.slack_token}"}
            response = requests.get(url, headers=headers)

            if response.status_code == 200:
                print(f"  ✅ Archivo descargado ({len(response.content)} bytes)")
                return response.content
            else:
                raise Exception(f"Error al descargar: {response.status_code}")

        except Exception as e:
            print(f"  ❌ Error al descargar archivo: {e}")
            raise

    def extraer_json_de_zip(self, zip_content: bytes, empresa: str, fecha: datetime) -> Dict:
        """Extrae y parsea el JSON del archivo ZIP"""
        fecha_str = fecha.strftime("%Y-%m-%d")

        if empresa == "EPAS":
            nombre_json = f"EPAS_alphas_{fecha_str}.json"
        else:  # TDP
            nombre_json = f"TDP_alphas_{fecha_str}.json"

        print(f"  📦 Extrayendo {nombre_json} del ZIP...")

        try:
            with zipfile.ZipFile(io.BytesIO(zip_content)) as zip_file:
                # Buscar el archivo JSON
                if nombre_json in zip_file.namelist():
                    json_content = zip_file.read(nombre_json)
                    datos = json.loads(json_content)
                    print(f"  ✅ JSON extraído y parseado")
                    return datos
                else:
                    raise Exception(f"Archivo {nombre_json} no encontrado en el ZIP")

        except Exception as e:
            print(f"  ❌ Error al extraer JSON: {e}")
            raise

    def guardar_archivo_bd(self, empresa: str, fecha: datetime, zip_content: bytes):
        """Guarda el archivo ZIP en compensacion_archivos"""
        print(f"  💾 Guardando archivo en compensacion_archivos...")

        conn = self.conectar_db()
        cursor = conn.cursor()

        try:
            cursor.execute("""
                INSERT INTO compensacion.compensacion_archivos
                (fecha, archivo_tdp, archivo_epas, archivo_transferencia, fecha_carga)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (fecha)
                DO UPDATE SET
                    archivo_tdp = CASE WHEN %s = 'TDP' THEN EXCLUDED.archivo_tdp ELSE compensacion.compensacion_archivos.archivo_tdp END,
                    archivo_epas = CASE WHEN %s = 'EPAS' THEN EXCLUDED.archivo_epas ELSE compensacion.compensacion_archivos.archivo_epas END
                RETURNING fecha
            """, (
                fecha.date(),
                psycopg2.Binary(zip_content) if empresa == "TDP" else None,
                psycopg2.Binary(zip_content) if empresa == "EPAS" else None,
                None,  # archivo_transferencia
                datetime.now(),
                empresa,
                empresa
            ))

            conn.commit()
            print(f"  ✅ Archivo guardado en BD")

        except Exception as e:
            conn.rollback()
            print(f"  ❌ Error al guardar archivo: {e}")
            raise
        finally:
            cursor.close()
            conn.close()

    def _crear_registro_interoperabilidad(self, fecha: datetime):
        """Crea un registro en compensacion_interoperabilidad si no existe"""
        conn = self.conectar_db()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT INTO compensacion.compensacion_interoperabilidad
                (fecha, a23_tdp, a32_tdp, a23_epas, a32_epas, monto_a_transferir, monto_transferido)
                VALUES (%s, NULL, NULL, NULL, NULL, NULL, NULL)
                ON CONFLICT (fecha) DO NOTHING
                RETURNING fecha
            """, (fecha.date(),))
            
            if cursor.rowcount > 0:
                print(f"  ✅ Registro creado en compensacion_interoperabilidad para {fecha.date()}")
            
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"  ⚠️  Error al crear registro en compensacion_interoperabilidad: {e}")
            raise
        finally:
            cursor.close()
            conn.close()

    def guardar_datos_interoperabilidad(self, empresa: str, fecha: datetime, datos_json: Dict):
        """Guarda los datos extraídos en compensacion_interoperabilidad"""
        print(f"  💾 Guardando datos en compensacion_interoperabilidad...")

        conn = self.conectar_db()
        cursor = conn.cursor()

        try:
            # Extraer datos del JSON
            fecha_json = datos_json.get("fecha")
            transferencia = datos_json.get("transferencia")
            alphas = datos_json.get("alphas", {})

            # Primero aseguramos que exista el registro para la fecha
            self._crear_registro_interoperabilidad(fecha)

            # Determinar columnas según empresa
            if empresa == "EPAS":
                # Para EPAS, solo actualizamos los alphas
                cursor.execute("""
                    UPDATE compensacion.compensacion_interoperabilidad
                    SET 
                        a23_epas = %s,
                        a32_epas = %s
                    WHERE fecha = %s
                """, (
                    alphas.get("A23"),
                    alphas.get("A32"),
                    fecha.date()
                ))
                
                # Actualizamos el monto_a_transferir con el cálculo basado en los alphas de TDP
                cursor.execute("""
                    UPDATE compensacion.compensacion_interoperabilidad
                    SET monto_a_transferir = ABS(a23_tdp - a32_tdp) * (1 - %s)
                    WHERE fecha = %s
                """, (self.comision_interoperabilidad, fecha.date()))
            else:  # TDP
                cursor.execute("""
                    UPDATE compensacion.compensacion_interoperabilidad
                    SET 
                        a23_tdp = %s,
                        a32_tdp = %s,
                        monto_a_transferir = %s
                    WHERE fecha = %s
                """, (
                    alphas.get("A23"),
                    alphas.get("A32"),
                    transferencia,
                    fecha.date()
                ))

            conn.commit()
            print(f"  ✅ Datos actualizados en compensacion_interoperabilidad")

        except Exception as e:
            conn.rollback()
            print(f"  ❌ Error al actualizar datos: {e}")
            raise
        finally:
            cursor.close()
            conn.close()

    def _procesar_empresa(self, empresa: str, channel_id: str, fecha: datetime) -> Tuple[bytes, dict, bool]:
        """Procesa una empresa específica y devuelve los datos necesarios"""
        print(f"\n🏢 Empresa: {empresa}")
        
        # Buscar archivo
        file_info = self.buscar_archivo_zip(channel_id, empresa, fecha)
        if file_info is None:
            print(f"  ⏭️  Archivo no encontrado para {empresa}")
            return None, None, False
            
        try:
            # Descargar archivo
            zip_content = self.descargar_archivo(file_info)
            
            # Extraer JSON
            datos_json = self.extraer_json_de_zip(zip_content, empresa, fecha)
            
            return zip_content, datos_json, True
            
        except Exception as e:
            print(f"  ❌ Error al procesar {empresa}: {e}")
            return None, None, False

    def procesar_fecha(self, channel_id: str, fecha: datetime) -> Tuple[bool, bool]:
        """
        Procesa una fecha específica para ambas empresas de forma independiente
        
        Returns:
            Tuple (epas_procesado, tdp_procesado)
        """
        print(f"\n{'='*60}")
        print(f"📅 Procesando fecha: {fecha.strftime('%Y-%m-%d')}")
        print(f"{'='*60}")

        # Asegurarse de que exista el registro en compensacion_interoperabilidad
        try:
            self._crear_registro_interoperabilidad(fecha)
        except Exception as e:
            print(f"  ❌ Error al crear registro en compensacion_interoperabilidad: {e}")
            return False, False
        
        resultados = {'EPAS': False, 'TDP': False}
        
        # Procesar cada empresa de forma independiente
        for empresa in self.empresas:
            zip_content, datos_json, success = self._procesar_empresa(empresa, channel_id, fecha)
            
            if not success:
                continue
                
            try:
                conn = self.conectar_db()
                cursor = conn.cursor()
                
                # Guardar archivo y datos en una sola transacción
                self.guardar_archivo_bd(empresa, fecha, zip_content)
                self.guardar_datos_interoperabilidad(empresa, fecha, datos_json)
                
                conn.commit()
                resultados[empresa] = True
                print(f"  ✅ {empresa} procesado exitosamente")
                
            except Exception as e:
                conn.rollback()
                print(f"  ❌ Error al guardar datos de {empresa}: {e}")
                
            finally:
                if 'cursor' in locals():
                    cursor.close()
                if 'conn' in locals():
                    conn.close()
        
        return resultados['EPAS'], resultados['TDP']

        return resultados.get("EPAS", False), resultados.get("TDP", False)

    def ejecutar(self):
        """Ejecuta el proceso completo de actualización"""
        print("\n" + "="*60)
        print("🚀 INICIANDO PROCESO DE COMPENSACIÓN")
        print("="*60 + "\n")

        try:
            # Obtener últimas fechas cargadas por empresa
            ultimas_fechas = self.obtener_ultima_fecha_cargada()
            
            if not any(ultimas_fechas.values()):
                print("❌ No se encontraron fechas válidas en la base de datos")
                return
                
            # Obtener fecha de fin de procesamiento
            fecha_fin_date = datetime.now().date() - timedelta(days=self.dias_restar)
            fecha_fin = datetime.combine(fecha_fin_date, datetime.min.time())

            print(f"\n📅 Fecha límite de procesamiento: {fecha_fin.date()}")

            # Obtener canal de Slack
            channel_id = self.obtener_channel_id()

            # Procesar cada empresa por separado
            for empresa in self.empresas:
                # Obtener la última fecha para esta empresa
                ultima_fecha = ultimas_fechas.get(empresa)
                
                if ultima_fecha is None:
                    print(f"\n⚠️  No hay datos previos para {empresa}, se omitirá")
                    continue
                    
                # Calcular fecha de inicio (siguiente día a la última fecha procesada)
                fecha_inicio = ultima_fecha + timedelta(days=1)
                
                print(f"\n{'='*60}")
                print(f"🏢 PROCESANDO EMPRESA: {empresa}")
                print(f"{'='*60}\n")
                print(f"📅 Procesando desde: {fecha_inicio.date()}")
                
                if fecha_inicio > fecha_fin:
                    print(f"✅ {empresa} ya está actualizada hasta {ultima_fecha.date()}")
                    continue
                    
                fecha_actual = fecha_inicio
                empresa_activa = True
                
                print(f"\n{'='*60}")
                print(f"🏢 PROCESANDO EMPRESA: {empresa}")
                print(f"{'='*60}")
                
                # Procesar solo la empresa actual en cada iteración
                while fecha_actual <= fecha_fin and empresa_activa:
                    print(f"\n📅 Procesando fecha: {fecha_actual.strftime('%Y-%m-%d')}")
                    print(f"{'='*60}")
                    
                    # Procesar solo la empresa actual
                    if empresa == "EPAS":
                        zip_content, datos_json, epas_ok = self._procesar_empresa(empresa, channel_id, fecha_actual)
                        if not epas_ok:
                            empresa_activa = False
                            mensaje = f"⚠️ *{empresa}*: Archivo de compensación no encontrado para la fecha *{fecha_actual.strftime('%Y-%m-%d')}*. Por favor, remitir el archivo correspondiente."
                            print(f"\n⚠️  {empresa} pendiente desde {fecha_actual.strftime('%Y-%m-%d')}. No se procesarán fechas posteriores.")
                            self.enviar_notificacion_slack(mensaje)
                        else:
                            try:
                                conn = self.conectar_db()
                                cursor = conn.cursor()
                                
                                # Primero crear el registro en compensacion_interoperabilidad
                                try:
                                    self._crear_registro_interoperabilidad(fecha_actual)
                                    print(f"  ✅ Registro creado en compensacion_interoperabilidad para {fecha_actual.strftime('%Y-%m-%d')}")
                                    
                                    # Luego guardar el archivo
                                    self.guardar_archivo_bd(empresa, fecha_actual, zip_content)
                                    
                                    # Finalmente, guardar los datos de interoperabilidad
                                    if datos_json:
                                        self.guardar_datos_interoperabilidad(empresa, fecha_actual, datos_json)
                                        print(f"  ✅ {empresa} procesado exitosamente")
                                    else:
                                        print(f"  ⚠️  No hay datos para procesar en {empresa} para {fecha_actual.strftime('%Y-%m-%d')}")
                                        
                                except Exception as e:
                                    print(f"  ❌ Error al crear registro en compensacion_interoperabilidad: {e}")
                                    raise
                                
                                conn.commit()
                            except Exception as e:
                                conn.rollback()
                                print(f"  ❌ Error al guardar datos de {empresa}: {e}")
                                empresa_activa = False
                            finally:
                                if 'cursor' in locals():
                                    cursor.close()
                                if 'conn' in locals():
                                    conn.close()
                    else:  # TDP
                        zip_content, datos_json, tdp_ok = self._procesar_empresa(empresa, channel_id, fecha_actual)
                        if not tdp_ok:
                            empresa_activa = False
                            mensaje = f"⚠️ *{empresa}*: Archivo de compensación no encontrado para la fecha *{fecha_actual.strftime('%Y-%m-%d')}*. Por favor, remitir el archivo correspondiente."
                            print(f"\n⚠️  {empresa} pendiente desde {fecha_actual.strftime('%Y-%m-%d')}. No se procesarán fechas posteriores.")
                            self.enviar_notificacion_slack(mensaje)
                        else:
                            try:
                                conn = self.conectar_db()
                                cursor = conn.cursor()
                                
                                # Primero crear el registro en compensacion_interoperabilidad
                                try:
                                    self._crear_registro_interoperabilidad(fecha_actual)
                                    print(f"  ✅ Registro creado en compensacion_interoperabilidad para {fecha_actual.strftime('%Y-%m-%d')}")
                                    
                                    # Luego guardar el archivo
                                    self.guardar_archivo_bd(empresa, fecha_actual, zip_content)
                                    
                                    # Finalmente, guardar los datos de interoperabilidad
                                    if datos_json:
                                        self.guardar_datos_interoperabilidad(empresa, fecha_actual, datos_json)
                                        print(f"  ✅ {empresa} procesado exitosamente")
                                    else:
                                        print(f"  ⚠️  No hay datos para procesar en {empresa} para {fecha_actual.strftime('%Y-%m-%d')}")
                                        
                                except Exception as e:
                                    print(f"  ❌ Error al crear registro en compensacion_interoperabilidad: {e}")
                                    raise
                                
                                conn.commit()
                            except Exception as e:
                                conn.rollback()
                                print(f"  ❌ Error al guardar datos de {empresa}: {e}")
                                empresa_activa = False
                            finally:
                                if 'cursor' in locals():
                                    cursor.close()
                                if 'conn' in locals():
                                    conn.close()
                    
                    # Solo avanzar la fecha si la empresa sigue activa
                    if empresa_activa:
                        fecha_actual += timedelta(days=1)
                
                # Mostrar resumen del procesamiento de la empresa
                if not empresa_activa:
                    print(f"\n⏹️  Procesamiento de {empresa} detenido en {fecha_actual.strftime('%Y-%m-%d')}")
                elif fecha_actual > fecha_fin:
                    print(f"\n✅ {empresa} procesada completamente hasta {fecha_fin.date()}")
                else:
                    print(f"\n✅ {empresa} procesada hasta {fecha_actual - timedelta(days=1)}")

            print("\n" + "="*60)
            print("✅ PROCESO COMPLETADO")
            print("="*60 + "\n")

        except Exception as e:
            print(f"\n❌ ERROR CRÍTICO: {e}")
            raise


# Punto de entrada
if __name__ == "__main__":
    try:
        processor = CompensacionProcessor()
        processor.ejecutar()
    except Exception as e:
        print(f"\n❌ Error al inicializar: {e}")
        exit(1)