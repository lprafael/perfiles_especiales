# Levantar servidor (desde la carpeta backend): uvicorn main:app --reload --port 8010
# --- NUEVO ENDPOINT: Servicios por hora y promedio histórico para regularidad operativa ---
from fastapi import Query
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Request, Body
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
load_dotenv()
import os
from math import radians, sin, cos, sqrt, atan2
from typing import List, Dict, Any

from collections import defaultdict
from pydantic import BaseModel
import auth

app = FastAPI()

# Incluir router de autenticación migrado de sist_catalogos
app.include_router(auth.router)



# Habilitar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # podés restringir en producción
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/test-verification-ping")
def ping():
    return {"message": "pong"}



# Configuración de la base de datos (usar variables de entorno si existen)
db_config = {
    "host": os.getenv("DB_CID_HOST"),
    "user": os.getenv("DB_CID_USER"),
    "password": os.getenv("DB_CID_PASSWORD"),
    "dbname": os.getenv("DB_CID_NAME"),
    "port": int(os.getenv("DB_CID_PORT", 2024)),
}

db_monitoreo = {
    "host": os.getenv("DB_MON_HOST"),
    "user": os.getenv("DB_MON_USER"),
    "password": os.getenv("DB_MON_PASSWORD"),
    "dbname": os.getenv("DB_MON_NAME"),
    "port": int(os.getenv("DB_MON_PORT", 5432)),
}

# Configuración de la base de datos de transacciones (billing)
db_billing = {
    "host": os.getenv("DB_BILL_HOST"),
    "user": os.getenv("DB_BILL_USER"),
    "password": os.getenv("DB_BILL_PASSWORD"),
    "dbname": os.getenv("DB_BILL_NAME"),
    "port": int(os.getenv("DB_BILL_PORT", 5432)),
}


def get_conn_CID():
    return psycopg2.connect(**db_config)
def get_conn_monitoreo():
    return psycopg2.connect(**db_monitoreo)
def get_conn_billing():
    return psycopg2.connect(**db_billing)
   

# --- ENDPOINTS EXISTENTES ---
@app.get("/empresas")
def obtener_empresas():
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT e.id_eot_vmt_hex, e.eot_nombre, e.gre_id, g.gre_nombre, 
                           e.cod_catalogo
                    FROM eots e
                    LEFT JOIN gremios g ON e.gre_id = g.gre_id
                    WHERE e.permisionario = true
                    ORDER BY e.eot_nombre
                """)
                return cursor.fetchall()
    except Exception as e:
        print("Error al obtener empresas:", e)
        raise HTTPException(status_code=500, detail="Error al obtener empresas")

# NUEVO: Resumen de shapes total
@app.get("/shapes/total")
def obtener_total_shapes():
    try:
        with get_conn_CID() as conn:
            with conn.cursor() as cursor:
                # Contar total de rutas con geometría
                cursor.execute("SELECT COUNT(*) FROM catalogo_rutas WHERE geom IS NOT NULL")
                row = cursor.fetchone()
                total = row[0] if row else 0
                return {"total": total, "max": total}
    except Exception as e:
        print("Error al obtener total shapes:", e)
        raise HTTPException(status_code=500, detail="Error al obtener total shapes")

# NUEVO: Resumen de shapes por empresa (usando cod_catalogo)
@app.get("/empresas/{cod_catalogo}/shapes/total")
def obtener_total_shapes_empresa(cod_catalogo: str):
    try:
        with get_conn_CID() as conn:
            with conn.cursor() as cursor:
                # Contar rutas de la empresa especifica
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM catalogo_rutas 
                    WHERE id_eot_catalogo = %s AND geom IS NOT NULL
                """, (cod_catalogo,))
                row = cursor.fetchone()
                total = row[0] if row else 0
                return {"total": total, "max": total}
    except Exception as e:
        print(f"Error al obtener shapes empresa {cod_catalogo}:", e)
        raise HTTPException(status_code=500, detail="Error al obtener shapes empresa")

# --- ENDPOINTS EXISTENTES ---
@app.get("/empresas/{empresa_id}/detalles")
def obtener_detalles_empresa(empresa_id: str):
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT *
                    FROM eots e
                    LEFT JOIN gremios g ON e.gre_id = g.gre_id
                    WHERE e.permisionario = true
                    AND e.id_eot_vmt_hex = %s
                    ORDER BY e.eot_nombre
                """, (empresa_id,))
                return cursor.fetchall()
    except Exception as e:
        print("Error al obtener empresas:", e)
        raise HTTPException(status_code=500, detail="Error al obtener empresas")


# TERMINALES DE LA EMPRESA
@app.get("/empresas/{empresa_id}/terminales")
def obtener_terminales(empresa_id: str):
    try:
        import json
        print(f"Obteniendo terminales para empresa_id: {empresa_id}")
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Primero verificamos si la empresa existe
                cursor.execute("""
                    SELECT cod_catalogo, id_eot_vmt_hex 
                    FROM eots 
                    WHERE id_eot_vmt_hex = %s
                """, (empresa_id,))
                empresa = cursor.fetchone()
                if not empresa:
                    print(f"No se encontró la empresa con id: {empresa_id}")
                    return []
                
                print(f"Empresa encontrada - cod_catalogo: {empresa['cod_catalogo']}, id_eot_vmt_hex: {empresa['id_eot_vmt_hex']}")
                cursor.execute("""
                    SELECT 
                        t.terminal_nombre as nombre,
                        t.terminal_numero,
                        t.centroide_lat as lat,
                        t.centroide_lon as lng,
                        t.radio_metros,
                        t.geocerca,
                        t.cantidad_buses_detectados,
                        t.metodo_deteccion,
                        t.fecha_creacion,
                        t.activo
                    FROM eot_terminales t
                    WHERE t.agency_id = %s
                    AND t.activo = true
                    ORDER BY t.terminal_numero
                """, (empresa['id_eot_vmt_hex'],))
                terminales = cursor.fetchall()
                
                # Procesar las terminales para asegurar el formato correcto
                for terminal in terminales:
                    # Convertir fechas a string ISO
                    if terminal['fecha_creacion']:
                        terminal['fecha_creacion'] = terminal['fecha_creacion'].isoformat()
                    
                    # Asegurar que geocerca sea JSON válido si no es None
                    if terminal['geocerca'] is not None:
                        try:
                            if isinstance(terminal['geocerca'], str):
                                terminal['geocerca'] = json.loads(terminal['geocerca'])
                        except:
                            terminal['geocerca'] = None
                
                return terminales
                return cursor.fetchall()
    except Exception as e:
        import traceback
        print("Error al obtener terminales:", str(e))
        print("Traceback completo:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al obtener terminales: {str(e)}")

# ITINERARIOS DE LA EMPRESA
@app.get("/empresas/{empresa_id}/itinerarios")
def obtener_itinerarios(empresa_id: str):
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT
                        c.ruta_hex,
                        c.linea,
                        c.ramal,
                        c.origen,
                        c.destino,
                        c.identificacion,
                        COALESCE(json_agg(line_points.shape_line ORDER BY line_points.orden_linea) FILTER (WHERE line_points.shape_line IS NOT NULL), '[]') AS shape_lines
                    FROM catalogo_rutas c
                    JOIN eots e ON c.id_eot_catalogo = e.cod_catalogo
                    LEFT JOIN LATERAL (
                        SELECT 
                            json_agg(json_build_object('lat', ST_Y(punto), 'lng', ST_X(punto)) ORDER BY orden_punto) AS shape_line,
                            orden_linea
                        FROM (
                            SELECT 
                                (ST_Dump(c.geom)).geom AS geom_linea,
                                generate_series(1, ST_NumGeometries(c.geom)) AS orden_linea
                        ) dump
                        LEFT JOIN LATERAL (
                            SELECT (ST_DumpPoints(dump.geom_linea)).geom AS punto, generate_series(1, ST_NPoints(dump.geom_linea)) AS orden_punto
                        ) puntos ON true
                        GROUP BY orden_linea
                    ) line_points ON c.geom IS NOT NULL
                    WHERE e.id_eot_vmt_hex = %s
                    GROUP BY c.ruta_hex, c.linea, c.ramal, c.origen, c.destino, c.identificacion
                    ORDER BY (c.geom IS NULL), c.ruta_hex
                """, (empresa_id,))
                return cursor.fetchall()
    except Exception as e:
        import traceback
        print("Error al obtener itinerarios:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al obtener itinerarios: {e}")

# PARADAS DE UN ITINERARIO
@app.get("/itinerarios/{ruta_hex}/paradas")
def obtener_paradas(ruta_hex: str):
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT nombre, latitud AS lat, longitud AS lng
                    FROM paradas
                    WHERE ruta_hex = %s
                    ORDER BY orden
                """, (ruta_hex,))
                return cursor.fetchall()
    except Exception as e:
        print("Error al obtener paradas:", e)
        raise HTTPException(status_code=500, detail="Error al obtener paradas")

# PROCESAR SELECCIÓN DE EMPRESA, FECHA Y PUNTOS DE CONTROL
@app.post("/procesar_seleccion")
async def procesar_seleccion(request: Request):
    try:
        data = await request.json()
        # 1. Obtener cantidad de rutas y shapes de la empresa
        agency_id = str(data.get('selectedIndex'))
        rutas = []
        shapes = []
        try:
            with get_conn_CID() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute("""
                        SELECT c.ruta_hex, COUNT(puntos.punto) as shape_points
                        FROM catalogo_rutas c
                        JOIN eots e ON c.id_eot_catalogo = e.cod_catalogo
                        LEFT JOIN LATERAL (
                            SELECT (ST_DumpPoints(c.geom)).geom AS punto
                        ) AS puntos ON true
                        WHERE e.id_eot_vmt_hex = %s
                        GROUP BY c.ruta_hex
                    """, (agency_id,))
                    rutas = cursor.fetchall()
                    shapes = [r['shape_points'] for r in rutas]
        except Exception as e:
            print("Error al obtener rutas/shapes:", e)
        # 2. Calcular servicios y puntos de control
        servicios = calcular_servicios(data)
        # 3. Calcular puntos de control terminales/intermedios
        puntos_control = data.get('puntosDeControl', [])
        n_puntos_total = len(puntos_control)
        n_terminales = 2 if n_puntos_total >= 2 else n_puntos_total
        n_intermedios = max(0, n_puntos_total - 2)
        # 4. Responder con toda la info
        return {
            "mensaje": "Servicios calculados correctamente",
            "data": servicios,
            "rutas_asignadas": len(rutas),
            "shapes_cargados": sum(shapes),
            "puntos_control": {
                "total": n_puntos_total,
                "terminales": n_terminales,
                "intermedios": n_intermedios,
                "detalle": puntos_control
            },
            "servicios_detectados": {
                "directos": servicios.get('servicios_directos', 0),
                "circulares": servicios.get('servicios_circulares', 0),
                "total": servicios.get('servicios', 0)
            },
            "buses_detectados": servicios.get('buses', 0),
            "fecha": data.get('fecha')
        }
    except Exception as e:
        print("Error al procesar la selección:", e)
        raise HTTPException(status_code=400, detail="Error al procesar la selección")

# Raíz
@app.get("/")
def root():
    return {"mensaje": "Backend Python funcionando correctamente"}

# ÚLTIMOS GPS DE BUSES DE LA EMPRESA
@app.get("/empresas/{empresa_id}/ultimos_gps")
def obtener_ultimos_gps(empresa_id: str, n: int = Query(1)):
    """
    Obtiene los últimos N puntos GPS de cada bus de la empresa.
    Si n=1, devuelve el último punto. Si n>1, devuelve una lista de puntos por cada bus.
    """
    try:
        with get_conn_monitoreo() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED;")
                
                # Usar ROW_NUMBER para obtener los últimos N puntos por cada bus
                # Esto funciona tanto para N=1 como para N>1
                query = """
                    SELECT mean_id, latitude, longitude, fecha_hora
                    FROM (
                        SELECT mean_id, latitude, longitude, fecha_hora,
                               ROW_NUMBER() OVER (PARTITION BY mean_id ORDER BY fecha_hora DESC) as rn
                        FROM app_monitoreo_mensajeoperativo
                        WHERE agency_id = %s
                        AND fecha_hora BETWEEN (NOW() - INTERVAL '4 hour') AND NOW()
                    ) t
                    WHERE rn <= %s
                    ORDER BY mean_id, fecha_hora DESC
                """
                cursor.execute(query, (empresa_id, n))
                rows = cursor.fetchall()
                
                # Agrupar por mean_id para devolver el formato esperado por el frontend
                buses_dict = {}
                for row in rows:
                    mid = row['mean_id']
                    if mid not in buses_dict:
                        buses_dict[mid] = []
                    
                    # Limpiar y convertir datos
                    punto = {
                        "lat": float(row['latitude']) if row['latitude'] is not None else 0,
                        "lng": float(row['longitude']) if row['longitude'] is not None else 0,
                        "fecha_hora": row['fecha_hora'].isoformat() if hasattr(row['fecha_hora'], 'isoformat') else str(row['fecha_hora'])
                    }
                    buses_dict[mid].append(punto)
                
                # Devolver formato consistente: lista de objetos con mean_id y puntos
                return [{"mean_id": mid, "puntos": puntos} for mid, puntos in buses_dict.items()]


                
    except Exception as e:
        import traceback
        print(f"ERROR en /ultimos_gps para empresa {empresa_id} (n={n}):")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))




# GPS DE BUSES DE LA EMPRESA EN UNA FECHA
@app.get("/empresas/{empresa_id}/buses")
def obtener_buses_empresa(empresa_id: str, fecha: str, limit: int = 5000, offset: int = 0):
    """
    Devuelve todos los mean_id (buses) y sus puntos GPS para la empresa y fecha seleccionada de forma paginada.
    """
    try:
        with get_conn_monitoreo() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                fecha_ini = f"{fecha} 00:00:00"
                fecha_fin = f"{fecha} 23:59:59"
                cursor.execute("""
                    SELECT mean_id, latitude, longitude, fecha_hora AT TIME ZONE 'America/Asuncion' AS fecha_hora
                    FROM app_monitoreo_mensajeoperativo
                    WHERE agency_id = %s AND fecha_hora BETWEEN %s AND %s
                    ORDER BY mean_id, fecha_hora
                    LIMIT %s OFFSET %s
                """, (empresa_id, fecha_ini, fecha_fin, limit, offset))
                rows = cursor.fetchall()
                # Agrupar por mean_id
                # imprimo en la terminal para debug
                print(f"Obtenidos {len(rows)} puntos GPS para la empresa {empresa_id} en la fecha {fecha} (Limit: {limit}, Offset: {offset})")
                buses = {}
                for row in rows:
                    mid = row['mean_id']
                    if mid not in buses:
                        buses[mid] = []
                    buses[mid].append({
                        'lat': row['latitude'],
                        'lng': row['longitude'],
                        'fecha_hora': row['fecha_hora']
                    })
                # Resumido: lista de mean_id y sus recorridos
                return [{
                    'mean_id': mid,
                    'recorrido': buses[mid]
                } for mid in buses]
    except Exception as e:
        print("Error al obtener buses de la empresa:", e)
        raise HTTPException(status_code=500, detail="Error al obtener buses de la empresa")

@app.get("/validaciones")
def obtener_validaciones(empresa_id: str = None, fecha: str = None, tiempo_real: bool = False):
    """
    Devuelve los puntos de validación (transacciones) para la empresa seleccionada.
    - Si tiempo_real=True: busca los id_sam de la última fecha global en declaracion_jurada y la última transacción de cada uno.
    - Si tiempo_real=False y fecha: busca los id_sam de esa fecha y la última transacción de cada uno en esa fecha.
    """
    try:
        # 1. Obtener cod_catalogo de la empresa
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("SELECT cod_catalogo FROM eots WHERE id_eot_vmt_hex = %s", (empresa_id,))
                row = cursor.fetchone()
                if not row:
                    return []
                cod_catalogo = row["cod_catalogo"]
        # 2. Obtener ids_sam de declaracion_jurada
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                if tiempo_real:
                    # Obtener la fecha máxima global para ese catálogo
                    cursor.execute("SELECT MAX(fecha) as max_fecha FROM declaracion_jurada WHERE id_eot_vmt = %s", (cod_catalogo,))
                    max_fecha_row = cursor.fetchone()
                    if not max_fecha_row or not max_fecha_row["max_fecha"]:
                        return []
                    max_fecha = max_fecha_row["max_fecha"]
                    cursor.execute("""
                        SELECT DISTINCT id_sam
                        FROM declaracion_jurada
                        WHERE id_eot_vmt = %s AND fecha = %s
                    """, (cod_catalogo, max_fecha))
                else:
                    cursor.execute("""
                        SELECT DISTINCT id_sam
                        FROM declaracion_jurada
                        WHERE id_eot_vmt = %s AND fecha = %s
                    """, (cod_catalogo, fecha))
                ids = cursor.fetchall()
                ids_sam = [r["id_sam"] for r in ids]
        if not ids_sam:
            return []
        # 3. Buscar la última transacción de cada id_sam en c_transacciones (billing)
        puntos = []
        with get_conn_billing() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                for id_sam in ids_sam:
                    if tiempo_real:
                        cursor.execute("""
                            SELECT latitude, longitude, fechahoraevento, idsam
                            FROM c_transacciones
                            WHERE idsam = %s
                            ORDER BY fechahoraevento DESC
                            LIMIT 1
                        """, (id_sam,))
                    else:
                        cursor.execute("""
                            SELECT latitude, longitude, fechahoraevento, idsam
                            FROM c_transacciones
                            WHERE idsam = %s AND fechahoraevento::date = %s
                            ORDER BY fechahoraevento DESC
                            LIMIT 1
                        """, (id_sam, fecha))
                    punto = cursor.fetchone()
                    if punto:
                        puntos.append(punto)
        return puntos
    except Exception as e:
        print("Error al obtener validaciones:", e)
        raise HTTPException(status_code=500, detail="Error al obtener validaciones")

# calcular_servicios(data):
# Esta función recibe un diccionario 'data' con información de la selección realizada en el frontend (empresa, fecha, puntos de control, etc.).
# Su objetivo es calcular la cantidad de servicios realizados por los buses de la empresa en la fecha indicada, distinguiendo entre servicios directos (de terminal a terminal) y circulares (de terminal final al inicial).
# Pasos principales:
# 1. Obtiene los datos GPS de los buses para la empresa y fecha seleccionadas desde la base de datos de monitoreo.
# 2. Para cada punto GPS, determina si está cerca de algún punto de control (usando la fórmula de Haversine y el radio configurado).
# 3. Agrupa los puntos GPS por bus (mean_id).
# 4. Para cada bus, recorre sus puntos GPS y cuenta los servicios directos (cuando pasa del primer al último punto de control) y circulares (del último al primero).
# 5. Devuelve un resumen con la cantidad de servicios, servicios directos, circulares, cantidad de buses y un mensaje descriptivo.
def calcular_servicios(data):
    # data: {selectedIndex, fecha, puntosDeControl, shapes}
    from datetime import datetime
    import math

    def distancia_metros(a, b):
        R = 6371000
        dLat = math.radians(b['lat'] - a['lat'])
        dLng = math.radians(b['lng'] - a['lng'])
        lat1 = math.radians(a['lat'])
        lat2 = math.radians(b['lat'])
        aVal = math.sin(dLat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dLng / 2) ** 2
        c = 2 * math.atan2(math.sqrt(aVal), math.sqrt(1 - aVal))
        return R * c

    def dentro_geocerca(p, centro, radio):
        return distancia_metros(p, centro) <= radio

    def es_terminal_shape(pt, shapes, tolerancia=30):
        for shape in shapes:
            if distancia_metros(pt, shape[0]) < tolerancia or distancia_metros(pt, shape[-1]) < tolerancia:
                return True
        return False

    def punto_en_shape(p, shape, tolerancia=40):
        minDist = float('inf')
        for s in shape:
            d = distancia_metros(p, s)
            if d < minDist:
                minDist = d
        return minDist <= tolerancia

    agency_id = str(data.get('selectedIndex'))
    fecha = data.get('fecha')
    puntos_control = data.get('puntosDeControl', [])
    shapes = data.get('shapes', [])
    radio = data.get('radio', 50)

    # Convertir shapes a lista de listas de dicts {lat, lng}
    shapes_proc = []
    for shape in shapes:
        if isinstance(shape, list):
            shapes_proc.append([{ 'lat': p['lat'], 'lng': p['lng'] } if isinstance(p, dict) else { 'lat': p[0], 'lng': p[1] } for p in shape])
        elif isinstance(shape, dict) and 'shape_lines' in shape:
            for line in shape['shape_lines']:
                shapes_proc.append([{ 'lat': p['lat'], 'lng': p['lng'] } for p in line])

    # Obtener datos GPS
    try:
        with get_conn_monitoreo() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED;")
                fecha_ini = f"{fecha} 00:00:00"
                fecha_fin = f"{fecha} 23:59:59"
                cursor.execute("""
                    SELECT latitude, longitude, mean_id, fecha_hora
                    FROM app_monitoreo_mensajeoperativo
                    WHERE agency_id = %s AND fecha_hora BETWEEN %s AND %s
                    ORDER BY mean_id, fecha_hora
                """, (agency_id, fecha_ini, fecha_fin))
                gps_data = cursor.fetchall()
    except Exception as e:
        print("Error al obtener puntos GPS para servicios:", e)
        return {"error": "Error al obtener puntos GPS"}

    # Agrupar por bus
    buses = {}
    for punto in gps_data:
        mean_id = punto['mean_id']
        if mean_id not in buses:
            buses[mean_id] = []
        buses[mean_id].append({
            'lat': punto['latitude'],
            'lng': punto['longitude'],
            'fecha_hora': punto['fecha_hora']
        })

    trayectos = []
    for bus_id, recorrido in buses.items():
        recorrido = sorted(recorrido, key=lambda x: x['fecha_hora'])
        # Detectar terminales
        idxTerminales = [idx for idx, pc in enumerate(puntos_control) if es_terminal_shape(pc, shapes_proc)]
        # Lógica lineal
        if len(idxTerminales) >= 2:
            for t1 in idxTerminales:
                for t2 in idxTerminales:
                    if t1 == t2:
                        continue
                    idxInicioPC = t1
                    idxFinPC = t2
                    ultimoDentroInicio = None
                    enInicio = False
                    for i, p in enumerate(recorrido):
                        if dentro_geocerca(p, puntos_control[idxInicioPC], puntos_control[idxInicioPC].get('radius', radio)):
                            ultimoDentroInicio = { 'idx': i, 'punto': dict(p) }
                            enInicio = True
                        else:
                            if enInicio:
                                enInicio = False
                        if dentro_geocerca(p, puntos_control[idxFinPC], puntos_control[idxFinPC].get('radius', radio)):
                            if ultimoDentroInicio and ultimoDentroInicio['idx'] < i:
                                trayectos.append({
                                    'bus_id': bus_id,
                                    'inicio': ultimoDentroInicio['punto'],
                                    'fin': dict(p),
                                    'idxInicio': ultimoDentroInicio['idx'],
                                    'idxFin': i,
                                    'idxGeocercaInicio': idxInicioPC,
                                    'idxGeocercaFin': idxFinPC,
                                    'recorrido': recorrido[ultimoDentroInicio['idx']:i+1]
                                })
                                ultimoDentroInicio = None
        # Lógica circular
        if len(idxTerminales) == 1 and len(puntos_control) >= 3:
            idxTerminal = idxTerminales[0]
            intermedios = [idx for idx, pc in enumerate(puntos_control) if not es_terminal_shape(pc, shapes_proc)]
            estado = {
                'enTrayecto': False,
                'idxInicio': None,
                'puntoInicio': None,
                'intermediosVisitados': set(),
            }
            for i, p in enumerate(recorrido):
                if not estado['enTrayecto']:
                    if dentro_geocerca(p, puntos_control[idxTerminal], puntos_control[idxTerminal].get('radius', radio)):
                        estado['enTrayecto'] = True
                        estado['idxInicio'] = i
                        estado['puntoInicio'] = dict(p)
                        estado['intermediosVisitados'] = set()
                else:
                    for idxInt in intermedios:
                        if dentro_geocerca(p, puntos_control[idxInt], puntos_control[idxInt].get('radius', radio)):
                            estado['intermediosVisitados'].add(idxInt)
                    if dentro_geocerca(p, puntos_control[idxTerminal], puntos_control[idxTerminal].get('radius', radio)) and i > estado['idxInicio']:
                        if len(estado['intermediosVisitados']) >= 2:
                            trayectos.append({
                                'bus_id': bus_id,
                                'inicio': estado['puntoInicio'],
                                'fin': dict(p),
                                'idxInicio': estado['idxInicio'],
                                'idxFin': i,
                                'idxGeocercaInicio': idxTerminal,
                                'idxGeocercaFin': idxTerminal,
                                'recorrido': recorrido[estado['idxInicio']:i+1],
                                'intermediosVisitados': list(estado['intermediosVisitados'])
                            })
                        estado = {
                            'enTrayecto': False,
                            'idxInicio': None,
                            'puntoInicio': None,
                            'intermediosVisitados': set(),
                        }

    # Asignar shape predominante
    def shape_predominante(trayecto):
        shapeCounts = [0 for _ in shapes_proc]
        for p in trayecto['recorrido']:
            for idx, shape in enumerate(shapes_proc):
                if punto_en_shape(p, shape):
                    shapeCounts[idx] += 1
        maxIdx = 0
        for i in range(1, len(shapeCounts)):
            if shapeCounts[i] > shapeCounts[maxIdx]:
                maxIdx = i
        return maxIdx, shapeCounts

    trayectosConShape = []
    for t in trayectos:
        idx, shapeCounts = shape_predominante(t)
        t2 = dict(t)
        t2['shapePredominante'] = idx
        t2['shapeCounts'] = shapeCounts
        trayectosConShape.append(t2)

    # Deduplicar trayectos por bus y hora de inicio, dejar el de mayor cantidad de puntos
    trayectosUnicos = {}
    for t in trayectosConShape:
        key = f"{t['bus_id']}|{t['inicio'].get('fecha_hora','')}"
        if key not in trayectosUnicos or len(t['recorrido']) > len(trayectosUnicos[key]['recorrido']):
            trayectosUnicos[key] = t
    trayectosConShape = list(trayectosUnicos.values())
    trayectosConShape.sort(key=lambda t: (t['bus_id'], t['inicio'].get('fecha_hora','')))

    # Contar directos/circulares
    directos = sum(1 for t in trayectosConShape if t['idxGeocercaInicio'] != t['idxGeocercaFin'])
    circulares = sum(1 for t in trayectosConShape if t['idxGeocercaInicio'] == t['idxGeocercaFin'])

    # Shapes usados
    shapesUsados = {}
    for t in trayectosConShape:
        idx = t.get('shapePredominante')
        if idx is not None:
            shapesUsados[idx] = shapesUsados.get(idx, 0) + 1

    # --- Construir shapesDetalles alineado con shapesUsados (requiere itinerariosEmpresa) ---
    shapesDetalles = {}
    itinerariosEmpresa = data.get('itinerariosEmpresa', [])
    # Si viene como dict, convertir a lista
    if isinstance(itinerariosEmpresa, dict):
        itinerariosEmpresa = [itinerariosEmpresa[k] for k in sorted(itinerariosEmpresa.keys(), key=lambda x: int(x) if str(x).isdigit() else x)]
    for idx in shapesUsados:
        idx_int = int(idx)
        it = None
        if isinstance(itinerariosEmpresa, list) and len(itinerariosEmpresa) > idx_int:
            it = itinerariosEmpresa[idx_int]
        elif isinstance(itinerariosEmpresa, dict) and str(idx_int) in itinerariosEmpresa:
            it = itinerariosEmpresa[str(idx_int)]
        if it:
            # Calcular distancia total del shape (en km)
            totalDistancia = 0
            if isinstance(it.get('shape_lines'), list):
                for line in it['shape_lines']:
                    if isinstance(line, list) and len(line) > 1:
                        for i in range(1, len(line)):
                            prev = line[i-1]
                            curr = line[i]
                            totalDistancia += distancia_metros(prev, curr)
            km = f"{(totalDistancia/1000):.2f}"
            # Determinar tipo de itinerario
            tipoItinerario = "N/D"
            distanciaInicioFin = None
            if isinstance(it.get('shape_lines'), list) and len(it['shape_lines']) > 0 and isinstance(it['shape_lines'][0], list):
                line = it['shape_lines'][0]
                if len(line) > 1:
                    inicio = line[0]
                    fin = line[-1]
                    distanciaInicioFin = distancia_metros(inicio, fin)
                    tipoItinerario = "Lineal" if distanciaInicioFin > 100 else "Circular"
            shapesDetalles[idx] = {
                'codigo': it.get('ruta_hex') or it.get('codigo') or '',
                'linea': it.get('linea') or '',
                'ramal': it.get('ramal') or '',
                'identificacion': it.get('identificacion') or it.get('nombre') or '',
                'distancia': km,
                'tipo': tipoItinerario
            }
    # Resumen de puntos de control
    totalPC = len(puntos_control)
    terminales = 0
    intermedios = 0
    for pc in puntos_control:
        if es_terminal_shape(pc, shapes_proc):
            terminales += 1
        else:
            intermedios += 1
    puntos_control_res = {
        'total': totalPC,
        'terminales': terminales,
        'intermedios': intermedios,
        'detalle': puntos_control
    }
    empresaNombre = data.get('empresaNombre') or data.get('empresa_nombre') or data.get('empresaId') or data.get('selectedIndex')
    fecha = data.get('fecha')
    return {
        'empresaNombre': empresaNombre,
        'fecha': fecha,
        'trayectos': trayectosConShape,
        'totalTrayectos': len(trayectosConShape),
        'shapesUsados': shapesUsados,
        'shapes': shapes_proc,
        'shapesDetalles': shapesDetalles,
        'mensaje': f"Se detectaron {len(trayectosConShape)} trayectos entre puntos de control.",
        'servicios_detectados': { 'directos': directos, 'circulares': circulares, 'total': len(trayectosConShape) },
        'puntos_control': puntos_control_res
    }

# Distancia en metros entre dos puntos lat/lng (fórmula Haversine)
def distancia_en_metros(p1, p2):
    R = 6371000
    dLat = radians(p2['lat'] - p1['lat'])
    dLng = radians(p2['lng'] - p1['lng'])
    a = (
        sin(dLat / 2) ** 2 +
        cos(radians(p1['lat'])) * cos(radians(p2['lat'])) * sin(dLng / 2) ** 2
    )
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))

# Agrupar puntos cercanos y calcular su punto medio
def agrupar_cercanos(puntos: List[Dict[str, Any]], umbral: float = 100):
    grupos = []
    for p in puntos:
        agregado = False
        for grupo in grupos:
            if distancia_en_metros(grupo['centro'], p) < umbral:
                grupo['puntos'].append(p)
                lat_sum = sum(pt['lat'] for pt in grupo['puntos'])
                lng_sum = sum(pt['lng'] for pt in grupo['puntos'])
                grupo['centro'] = {
                    'lat': lat_sum / len(grupo['puntos']),
                    'lng': lng_sum / len(grupo['puntos'])
                }
                agregado = True
                break
        if not agregado:
            grupos.append({'puntos': [p], 'centro': p})
    return [g['centro'] for g in grupos]

@app.post("/puntos_control")
def puntos_control(
    data: Dict[str, Any] = Body(...)
):
    shapes = data.get('shapes', [])
    distancia_unificacion = data.get('distanciaUnificacion', 100)
    geocerca_radio = 50  # Siempre 50m según requerimiento
    if not shapes or not isinstance(shapes, list):
        raise HTTPException(status_code=400, detail="Shapes no proporcionados o formato incorrecto")

    puntos_crudos = []
    puntos_intermedios = []
    for shape in shapes:
        if not shape or len(shape) < 2:
            continue
        inicio = shape[0]
        fin = shape[-1]
        # Distancia entre inicio y fin (usar distancia_en_metros para consistencia)
        d_inicio_fin = distancia_en_metros(inicio, fin)
        if d_inicio_fin < distancia_unificacion:
            # Shape cerrado: considerar inicio y fin como el mismo punto (circular)
            # Usar el punto medio para el control principal
            mid = {
                'lat': (inicio['lat'] + fin['lat']) / 2,
                'lng': (inicio['lng'] + fin['lng']) / 2,
                'tipo': 'GX'
            }
            puntos_crudos.append(mid)
            idx1 = len(shape) // 3
            idx2 = (2 * len(shape)) // 3
            puntos_intermedios.append({**shape[idx1], 'tipo': 'GZInt'})
            puntos_intermedios.append({**shape[idx2], 'tipo': 'GZInt'})
        else:
            # Shape abierto: GX y GY
            puntos_crudos.append({**inicio, 'tipo': 'GX'})
            puntos_crudos.append({**fin, 'tipo': 'GY'})
    # Agrupar solo GX, GY, GGX (no GZInt) a menos de 100m
    def agrupar_no_intermedios(puntos, umbral=100):
        grupos = []
        for p in puntos:
            if p.get('tipo', '').startswith('GZ'):  # No agrupar intermedios
                continue
            agregado = False
            for grupo in grupos:
                if distancia_en_metros(grupo['centro'], p) < umbral:
                    grupo['puntos'].append(p)
                    latSum = sum(pt['lat'] for pt in grupo['puntos'])
                    lngSum = sum(pt['lng'] for pt in grupo['puntos'])
                    grupo['centro'] = {
                        'lat': latSum / len(grupo['puntos']),
                        'lng': lngSum / len(grupo['puntos']),
                        'tipo': 'GGX'
                    }
                    agregado = True
                    break
            if not agregado:
                grupo_tipo = p['tipo'] if p['tipo'] in ['GX', 'GY'] else 'GGX'
                grupos.append({'puntos': [p], 'centro': {**p, 'tipo': grupo_tipo}})
        return [g['centro'] for g in grupos]
    puntos_finales = agrupar_no_intermedios(puntos_crudos, 100)
    # Agregar los intermedios (GZInt) sin agrupar, asegurando que tengan el radio y formato correcto
    for p in puntos_intermedios:
        p = dict(p)  # Copia defensiva
        p['radius'] = geocerca_radio
        puntos_finales.append(p)
    # Asegurar que todos los puntos tengan el radio de geocerca
    for p in puntos_finales:
        if 'radius' not in p:
            p['radius'] = geocerca_radio
    # Devolver también el radio para que el frontend pueda dibujar los círculos
    return {"puntos_control": puntos_finales, "geocercaRadio": geocerca_radio}




# A PARTIR DE ACA, SE TRABAJA CON LA TABLA servicios_diarios##################################################
# --- NUEVO ENDPOINT: Regularidad por hora para una empresa ---
@app.get("/empresas/{empresa_id}/regularidad_por_hora")
def regularidad_por_hora(
    empresa_id: str,
    fecha: str = Query(..., description="Fecha en formato YYYY-MM-DD")
):
    """
    Devuelve la cantidad de servicios por hora para la empresa y fecha seleccionada,
    y el promedio por hora de los mismos días de la semana de las 4 semanas anteriores.
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # 1. Servicios por hora para la fecha seleccionada
                # primero creo la cadena SQL y luego ejecutar la consulta
                # imprimo en la terminal la sentencia completa SQL para debug  
                query = '''
                    SELECT hora, COUNT(*) as servicios
                    FROM servicios_diarios
                    WHERE id_eot_catalogo = (
                        SELECT cod_catalogo FROM eots WHERE id_eot_vmt_hex = %s
                    )
                    AND fecha = %s
                    GROUP BY hora
                    ORDER BY hora
                '''
                # print(f"Ejecutando consulta: {query} con parámetros: ({empresa_id}, {fecha})")
                cursor.execute(query, (empresa_id, fecha))
                servicios_dia_empresa = cursor.fetchall()
                
                # 2. Calcular el día de la semana (0=lunes, 6=domingo)
                dia_semana = datetime.strptime(fecha, "%Y-%m-%d").weekday()

                # 3. Fechas de los mismos días de las 4 semanas anteriores
                fechas_previas = [
                    (datetime.strptime(fecha, "%Y-%m-%d") - timedelta(weeks=w)).strftime("%Y-%m-%d")
                    for w in range(1, 5)  # 4 semanas previas
                ]

                # 4. Servicios por hora para los días previos (solo filtrar por fechas previas, ya que ya son del mismo día de la semana)
                cursor.execute('''
                    SELECT fecha, hora, COUNT(*) as servicios
                    FROM servicios_diarios
                    WHERE id_eot_catalogo = (
                        SELECT cod_catalogo FROM eots WHERE id_eot_vmt_hex = %s
                    )
                    AND fecha = ANY(%s::date[])
                    GROUP BY fecha, hora
                    ORDER BY fecha, hora
                ''', (empresa_id, fechas_previas))
                rows = cursor.fetchall()

                # Agrupar por hora y calcular promedio
                from collections import defaultdict
                horas = defaultdict(list)
                for row in rows:
                    horas[row['hora']].append(row['servicios'])
                promedio_horas_empresa = [
                    {"hora": h, "promedio": round(sum(vals)/len(vals), 2) if vals else 0}
                    for h, vals in sorted(horas.items())
                ]

                return {
                    "servicios_dia": servicios_dia_empresa,
                    "promedio_horas": promedio_horas_empresa
                }
    except Exception as e:
        print("Error en regularidad_por_hora:", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener regularidad por hora: {e}")
 
# --- NUEVO ENDPOINT: Regularidad por hora para el sistema ---
@app.get("/sistema/regularidad_por_hora")
def regularidad_por_hora_sistema(
    fecha: str = Query(..., description="Fecha en formato YYYY-MM-DD")
):
    """
    Devuelve la cantidad de servicios por hora para cada empresa del sistema y fecha seleccionada,
    y el promedio por hora de los mismos días de la semana de las 4 semanas anteriores, por empresa.
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # 1. Obtener todas las empresas
                cursor.execute('''
                    SELECT e.id_eot_vmt_hex, e.eot_nombre
                    FROM eots e
                    WHERE e.permisionario = true
                    ORDER BY e.eot_nombre
                ''')
                empresas = cursor.fetchall()
                empresas_result = []
                for emp in empresas:
                    empresa_id = emp['id_eot_vmt_hex']
                    empresa_nombre = emp['eot_nombre']
                    # Servicios por hora para la fecha seleccionada
                    cursor.execute('''
                        SELECT hora, COUNT(*) as servicios
                        FROM servicios_diarios
                        WHERE id_eot_catalogo = (
                            SELECT cod_catalogo FROM eots WHERE id_eot_vmt_hex = %s
                        )
                        AND fecha = %s
                        GROUP BY hora
                        ORDER BY hora
                    ''', (empresa_id, fecha))
                    servicios_dia = cursor.fetchall()
                    # Fechas de los mismos días de las 4 semanas anteriores
                    fechas_previas = [
                        (datetime.strptime(fecha, "%Y-%m-%d") - timedelta(weeks=w)).strftime("%Y-%m-%d")
                        for w in range(1, 5)
                    ]
                    # Servicios por hora para los días previos
                    cursor.execute('''
                        SELECT fecha, hora, COUNT(*) as servicios
                        FROM servicios_diarios
                        WHERE id_eot_catalogo = (
                            SELECT cod_catalogo FROM eots WHERE id_eot_vmt_hex = %s
                        )
                        AND fecha = ANY(%s::date[])
                        GROUP BY fecha, hora
                        ORDER BY fecha, hora
                    ''', (empresa_id, fechas_previas))
                    rows = cursor.fetchall()
                    horas = defaultdict(list)
                    for row in rows:
                        horas[row['hora']].append(row['servicios'])
                    promedio_horas = [
                        {"hora": h, "promedio": round(sum(vals)/len(vals), 2) if vals else 0}
                        for h, vals in sorted(horas.items())
                    ]
                    empresas_result.append({
                        "id": empresa_id,
                        "nombre": empresa_nombre,
                        "servicios_dia": servicios_dia,
                        "promedio_horas": promedio_horas
                    })
                return {"empresas": empresas_result}
    except Exception as e:
        print("Error en regularidad_por_hora_sistema:", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener regularidad por hora para el sistema: {e}")

# --- Ajuste: Contar solo idsam no nulos para evitar falsos ceros en buses_por_hora ---
# Esto es importante porque algunos registros pueden tener idsam NULL, especialmente en agregados por gremio o sistema.
# Se agrega AND idsam IS NOT NULL en el WHERE de cada consulta COUNT(DISTINCT idsam)

# Eliminar los endpoints de buses_por_hora que ya no se usan
# --- ELIMINADO: @app.get("/empresas/{empresa_id}/buses_por_hora") ---
# --- ELIMINADO: @app.get("/gremios/{gre_id}/buses_por_hora") ---
# --- ELIMINADO: @app.get("/sistema/buses_por_hora") ---

# --- NUEVO ENDPOINT: Buses por hora (regularidad) para una empresa ---
@app.get("/empresas/{empresa_id}/buses_regularidad_por_hora")
def buses_regularidad_por_hora(
    empresa_id: str,
    fecha: str = Query(..., description="Fecha en formato YYYY-MM-DD")
):
    """
    Devuelve la cantidad de buses distintos (idsam) por hora para la empresa y fecha seleccionada,
    y el promedio por hora de los mismos días de la semana de las 4 semanas anteriores.
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Buses por hora para la fecha seleccionada
                query = '''
                    SELECT hora, COUNT(DISTINCT idsam) as buses
                    FROM servicios_diarios
                    WHERE id_eot_catalogo = (
                        SELECT cod_catalogo FROM eots WHERE id_eot_vmt_hex = %s
                    )
                    AND fecha = %s
                    AND idsam IS NOT NULL
                    GROUP BY hora
                    ORDER BY hora
                '''
                cursor.execute(query, (empresa_id, fecha))
                buses_dia_empresa = cursor.fetchall()
                # Fechas de los mismos días de las 4 semanas anteriores
                fechas_previas = [
                    (datetime.strptime(fecha, "%Y-%m-%d") - timedelta(weeks=w)).strftime("%Y-%m-%d")
                    for w in range(1, 5)
                ]
                cursor.execute('''
                    SELECT fecha, hora, COUNT(DISTINCT idsam) as buses
                    FROM servicios_diarios
                    WHERE id_eot_catalogo = (
                        SELECT cod_catalogo FROM eots WHERE id_eot_vmt_hex = %s
                    )
                    AND fecha = ANY(%s::date[])
                    AND idsam IS NOT NULL
                    GROUP BY fecha, hora
                    ORDER BY fecha, hora
                ''', (empresa_id, fechas_previas))
                rows = cursor.fetchall()
                horas = defaultdict(list)
                for row in rows:
                    horas[row['hora']].append(row['buses'])
                promedio_horas_empresa = [
                    {"hora": h, "promedio": round(sum(vals)/len(vals), 2) if vals else 0}
                    for h, vals in sorted(horas.items())
                ]
                return {
                    "buses_dia": buses_dia_empresa,
                    "promedio_horas": promedio_horas_empresa
                }
    except Exception as e:
        print("Error en buses_regularidad_por_hora:", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener buses por hora: {e}")

# --- ENDPOINT OPTIMIZADO: Regularidad de buses por hora para un gremio (agregado) ---
@app.get("/gremios/{gre_id}/buses_regularidad_por_hora_agregado")
def buses_regularidad_por_hora_gremio_agregado(
    gre_id: str,
    fecha: str = Query(..., description="Fecha en formato YYYY-MM-DD")
):
    """
    Devuelve la cantidad de buses distintos (idsam) por hora para el gremio (sumando todas las empresas) y fecha seleccionada,
    y el promedio por hora de los mismos días de la semana de las 4 semanas anteriores (también sumado).
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Buses por hora para la fecha seleccionada (agregado gremio)
                cursor.execute('''
                    SELECT sd.hora, COUNT(DISTINCT sd.idsam) as buses
                    FROM servicios_diarios sd
                    JOIN eots e ON sd.id_eot_catalogo = e.cod_catalogo
                    WHERE e.gre_id = %s
                      AND sd.fecha = %s
                      AND sd.idsam IS NOT NULL
                    GROUP BY sd.hora
                    ORDER BY sd.hora
                ''', (gre_id, fecha))
                buses_dia = cursor.fetchall()
                # Fechas de los mismos días de las 4 semanas anteriores
                fechas_previas = [
                    (datetime.strptime(fecha, "%Y-%m-%d") - timedelta(weeks=w)).strftime("%Y-%m-%d")
                    for w in range(1, 5)
                ]
                # Promedio por hora para los días previos (agregado gremio)
                cursor.execute('''
                    SELECT sd.fecha, sd.hora, COUNT(DISTINCT sd.idsam) as buses
                    FROM servicios_diarios sd
                    JOIN eots e ON sd.id_eot_catalogo = e.cod_catalogo
                    WHERE e.gre_id = %s
                      AND sd.fecha = ANY(%s::date[])
                      AND sd.idsam IS NOT NULL
                    GROUP BY sd.fecha, sd.hora
                    ORDER BY sd.fecha, sd.hora
                ''', (gre_id, fechas_previas))
                rows = cursor.fetchall()
                from collections import defaultdict
                horas = defaultdict(list)
                for row in rows:
                    horas[row['hora']].append(row['buses'])
                promedio_horas = [
                    {"hora": h, "promedio": round(sum(vals)/len(vals), 2) if vals else 0}
                    for h, vals in sorted(horas.items())
                ]
                return {"buses_dia": buses_dia, "promedio_horas": promedio_horas}
    except Exception as e:
        print("Error en buses_regularidad_por_hora_gremio_agregado:", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener buses por hora para gremio (agregado): {e}")

# --- ENDPOINT OPTIMIZADO: Regularidad de buses por hora para el sistema (agregado) ---
@app.get("/sistema/buses_regularidad_por_hora_agregado")
def buses_regularidad_por_hora_sistema_agregado(
    fecha: str = Query(..., description="Fecha en formato YYYY-MM-DD")
):
    """
    Devuelve la cantidad de buses distintos (idsam) por hora para todo el sistema (sumando todas las empresas) y fecha seleccionada,
    y el promedio por hora de los mismos días de la semana de las 4 semanas anteriores (también sumado).
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Buses por hora para la fecha seleccionada (agregado sistema)
                cursor.execute('''
                    SELECT sd.hora, COUNT(DISTINCT sd.idsam) as buses
                    FROM servicios_diarios sd
                    JOIN eots e ON sd.id_eot_catalogo = e.cod_catalogo
                    WHERE e.permisionario = true
                      AND sd.fecha = %s
                      AND sd.idsam IS NOT NULL
                    GROUP BY sd.hora
                    ORDER BY sd.hora
                ''', (fecha,))
                buses_dia = cursor.fetchall()
                # Fechas de los mismos días de las 4 semanas anteriores
                fechas_previas = [
                    (datetime.strptime(fecha, "%Y-%m-%d") - timedelta(weeks=w)).strftime("%Y-%m-%d")
                    for w in range(1, 5)
                ]
                # Promedio por hora para los días previos (agregado sistema)
                cursor.execute('''
                    SELECT sd.fecha, sd.hora, COUNT(DISTINCT sd.idsam) as buses
                    FROM servicios_diarios sd
                    JOIN eots e ON sd.id_eot_catalogo = e.cod_catalogo
                    WHERE e.permisionario = true
                      AND sd.fecha = ANY(%s::date[])
                      AND sd.idsam IS NOT NULL
                    GROUP BY sd.fecha, sd.hora
                    ORDER BY sd.fecha, sd.hora
                ''', (fechas_previas,))
                rows = cursor.fetchall()
                from collections import defaultdict
                horas = defaultdict(list)
                for row in rows:
                    horas[row['hora']].append(row['buses'])
                promedio_horas = [
                    {"hora": h, "promedio": round(sum(vals)/len(vals), 2) if vals else 0}
                    for h, vals in sorted(horas.items())
                ]
                return {"buses_dia": buses_dia, "promedio_horas": promedio_horas}
    except Exception as e:
        print("Error en buses_regularidad_por_hora_sistema_agregado:", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener buses por hora para el sistema (agregado): {e}")

# --- ENDPOINT OPTIMIZADO: Regularidad de servicios por hora para un gremio (agregado) ---
@app.get("/gremios/{gre_id}/regularidad_por_hora_agregado")
def regularidad_por_hora_gremio_agregado(
    gre_id: str,
    fecha: str = Query(..., description="Fecha en formato YYYY-MM-DD")
):
    """
    Devuelve la cantidad de servicios por hora para el gremio (sumando todas las empresas) y fecha seleccionada,
    y el promedio por hora de los mismos días de la semana de las 4 semanas anteriores (también sumado).
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Servicios por hora para la fecha seleccionada (agregado gremio)
                cursor.execute('''
                    SELECT sd.hora, COUNT(*) as servicios
                    FROM servicios_diarios sd
                    JOIN eots e ON sd.id_eot_catalogo = e.cod_catalogo
                    WHERE e.gre_id = %s
                      AND sd.fecha = %s
                    GROUP BY sd.hora
                    ORDER BY sd.hora
                ''', (gre_id, fecha))
                servicios_dia = cursor.fetchall()
                # Fechas de los mismos días de las 4 semanas anteriores
                fechas_previas = [
                    (datetime.strptime(fecha, "%Y-%m-%d") - timedelta(weeks=w)).strftime("%Y-%m-%d")
                    for w in range(1, 5)
                ]
                # Promedio por hora para los días previos (agregado gremio)
                cursor.execute('''
                    SELECT sd.fecha, sd.hora, COUNT(*) as servicios
                    FROM servicios_diarios sd
                    JOIN eots e ON sd.id_eot_catalogo = e.cod_catalogo
                    WHERE e.gre_id = %s
                      AND sd.fecha = ANY(%s::date[])
                    GROUP BY sd.fecha, sd.hora
                    ORDER BY sd.fecha, sd.hora
                ''', (gre_id, fechas_previas))
                rows = cursor.fetchall()
                from collections import defaultdict
                horas = defaultdict(list)
                for row in rows:
                    horas[row['hora']].append(row['servicios'])
                promedio_horas = [
                    {"hora": h, "promedio": round(sum(vals)/len(vals), 2) if vals else 0}
                    for h, vals in sorted(horas.items())
                ]
                return {"servicios_dia": servicios_dia, "promedio_horas": promedio_horas}
    except Exception as e:
        print("Error en regularidad_por_hora_gremio_agregado:", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener regularidad por hora para gremio (agregado): {e}")

# --- NUEVO ENDPOINT: Regularidad por hora de BUSES para una empresa ---
@app.get("/empresas/{empresa_id}/regularidad_por_hora_buses")
def regularidad_por_hora_buses_empresa(
    empresa_id: str,
    fecha: str = Query(..., description="Fecha en formato YYYY-MM-DD")
):
    """
    Devuelve la cantidad de buses distintos (idsam) por hora para la empresa y fecha seleccionada,
    y el promedio por hora de los mismos días de la semana de las 4 semanas anteriores.
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                query = '''
                    SELECT hora, COUNT(DISTINCT idsam) as servicios
                    FROM servicios_diarios
                    WHERE id_eot_catalogo = (
                        SELECT cod_catalogo FROM eots WHERE id_eot_vmt_hex = %s
                    )
                    AND fecha = %s
                    AND idsam IS NOT NULL
                    GROUP BY hora
                    ORDER BY hora
                '''
                cursor.execute(query, (empresa_id, fecha))
                servicios_dia = cursor.fetchall()
                fechas_previas = [
                    (datetime.strptime(fecha, "%Y-%m-%d") - timedelta(weeks=w)).strftime("%Y-%m-%d")
                    for w in range(1, 5)
                ]
                cursor.execute('''
                    SELECT fecha, hora, COUNT(DISTINCT idsam) as servicios
                    FROM servicios_diarios
                    WHERE id_eot_catalogo = (
                        SELECT cod_catalogo FROM eots WHERE id_eot_vmt_hex = %s
                    )
                    AND fecha = ANY(%s::date[])
                    AND idsam IS NOT NULL
                    GROUP BY fecha, hora
                    ORDER BY fecha, hora
                ''', (empresa_id, fechas_previas))
                rows = cursor.fetchall()
                from collections import defaultdict
                horas = defaultdict(list)
                for row in rows:
                    horas[row['hora']].append(row['servicios'])
                promedio_horas = [
                    {"hora": h, "promedio": round(sum(vals)/len(vals), 2) if vals else 0}
                    for h, vals in sorted(horas.items())
                ]
                return {"servicios_dia": servicios_dia, "promedio_horas": promedio_horas}
    except Exception as e:
        print("Error en regularidad_por_hora_buses_empresa:", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener regularidad por hora de buses para empresa: {e}")

# --- NUEVO ENDPOINT: Regularidad por hora de SERVICIOS para un gremio (por empresa) ---
@app.get("/gremios/{gre_id}/regularidad_por_hora")
def regularidad_por_hora_gremio(
    gre_id: str,
    fecha: str = Query(..., description="Fecha en formato YYYY-MM-DD")
):
    """
    Devuelve la cantidad de servicios por hora para cada empresa del gremio y fecha seleccionada,
    y el promedio por hora de los mismos días de la semana de las 4 semanas anteriores, por empresa.
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # 1. Servicios por hora para la fecha seleccionada, agrupados por empresa y hora
                cursor.execute('''
                    SELECT e.id_eot_vmt_hex AS empresa_id, e.eot_nombre AS empresa_nombre, sd.hora, COUNT(*) as servicios
                    FROM servicios_diarios sd
                    JOIN eots e ON sd.id_eot_catalogo = e.cod_catalogo
                    WHERE e.gre_id = %s AND sd.fecha = %s AND e.permisionario = true
                    GROUP BY e.id_eot_vmt_hex, e.eot_nombre, sd.hora
                    ORDER BY e.eot_nombre, sd.hora
                ''', (gre_id, fecha))
                servicios_dia_rows = cursor.fetchall()

                # 2. Fechas de los mismos días de las 4 semanas anteriores
                fechas_previas = [
                    (datetime.strptime(fecha, "%Y-%m-%d") - timedelta(weeks=w)).strftime("%Y-%m-%d")
                    for w in range(1, 5)
                ]
                # 3. Servicios por hora para los días previos, agrupados por empresa, fecha y hora
                cursor.execute('''
                    SELECT e.id_eot_vmt_hex AS empresa_id, e.eot_nombre AS empresa_nombre, sd.fecha, sd.hora, COUNT(*) as servicios
                    FROM servicios_diarios sd
                    JOIN eots e ON sd.id_eot_catalogo = e.cod_catalogo
                    WHERE e.gre_id = %s AND sd.fecha = ANY(%s::date[]) AND e.permisionario = true
                    GROUP BY e.id_eot_vmt_hex, e.eot_nombre, sd.fecha, sd.hora
                    ORDER BY e.eot_nombre, sd.fecha, sd.hora
                ''', (gre_id, fechas_previas))
                promedio_rows = cursor.fetchall()

                # 4. Armar estructura por empresa
                empresas = {}
                for row in servicios_dia_rows:
                    eid = row['empresa_id']
                    if eid not in empresas:
                        empresas[eid] = {
                            'id': eid,
                            'nombre': row['empresa_nombre'],
                            'servicios_dia': [],
                            'promedio_horas': []
                        }
                    empresas[eid]['servicios_dia'].append({'hora': row['hora'], 'servicios': row['servicios']})
                # Agrupar promedios por empresa y hora
                from collections import defaultdict
                horas_por_empresa = defaultdict(lambda: defaultdict(list))
                for row in promedio_rows:
                    horas_por_empresa[row['empresa_id']][row['hora']].append(row['servicios'])
                for eid, horas_dict in horas_por_empresa.items():
                    for hora, vals in horas_dict.items():
                        promedio = round(sum(vals)/len(vals), 2) if vals else 0
                        if eid in empresas:
                            empresas[eid]['promedio_horas'].append({'hora': hora, 'promedio': promedio})
                # 5. Devolver lista de empresas
                return {'empresas': list(empresas.values())}
    except Exception as e:
        print("Error en regularidad_por_hora_gremio (opt):", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener regularidad por hora para gremio: {e}")

# --- NUEVO ENDPOINT: Regularidad por hora de BUSES para un gremio ---
@app.get("/gremios/{gre_id}/regularidad_por_hora_buses")
def regularidad_por_hora_buses_gremio(
    gre_id: str,
    fecha: str = Query(..., description="Fecha en formato YYYY-MM-DD")
):
    """
    Devuelve la cantidad de buses distintos (idsam) por hora para cada empresa del gremio y fecha seleccionada,
    y el promedio por hora de los mismos días de la semana de las 4 semanas anteriores, por empresa.
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # 1. Buses por hora para la fecha seleccionada, agrupados por empresa y hora
                cursor.execute('''
                    SELECT e.id_eot_vmt_hex AS empresa_id, e.eot_nombre AS empresa_nombre, sd.hora, COUNT(DISTINCT sd.idsam) as buses
                    FROM servicios_diarios sd
                    JOIN eots e ON sd.id_eot_catalogo = e.cod_catalogo
                    WHERE e.gre_id = %s AND sd.fecha = %s AND sd.idsam IS NOT NULL AND e.permisionario = true
                    GROUP BY e.id_eot_vmt_hex, e.eot_nombre, sd.hora
                    ORDER BY e.eot_nombre, sd.hora
                ''', (gre_id, fecha))
                buses_dia_rows = cursor.fetchall()

                # 2. Fechas de los mismos días de las 4 semanas anteriores
                fechas_previas = [
                    (datetime.strptime(fecha, "%Y-%m-%d") - timedelta(weeks=w)).strftime("%Y-%m-%d")
                    for w in range(1, 5)
                ]
                # 3. Buses por hora para los días previos, agrupados por empresa, fecha y hora
                cursor.execute('''
                    SELECT e.id_eot_vmt_hex AS empresa_id, e.eot_nombre AS empresa_nombre, sd.fecha, sd.hora, COUNT(DISTINCT sd.idsam) as buses
                    FROM servicios_diarios sd
                    JOIN eots e ON sd.id_eot_catalogo = e.cod_catalogo
                    WHERE e.gre_id = %s AND sd.fecha = ANY(%s::date[]) AND sd.idsam IS NOT NULL AND e.permisionario = true
                    GROUP BY e.id_eot_vmt_hex, e.eot_nombre, sd.fecha, sd.hora
                    ORDER BY e.eot_nombre, sd.fecha, sd.hora
                ''', (gre_id, fechas_previas))
                promedio_rows = cursor.fetchall()

                # 4. Armar estructura por empresa
                empresas = {}
                for row in buses_dia_rows:
                    eid = row['empresa_id']
                    if eid not in empresas:
                        empresas[eid] = {
                            'id': eid,
                            'nombre': row['empresa_nombre'],
                            'servicios_dia': [],
                            'promedio_horas': []
                        }
                    empresas[eid]['servicios_dia'].append({'hora': row['hora'], 'servicios': row['buses']})
                # Agrupar promedios por empresa y hora
                from collections import defaultdict
                horas_por_empresa = defaultdict(lambda: defaultdict(list))
                for row in promedio_rows:
                    horas_por_empresa[row['empresa_id']][row['hora']].append(row['buses'])
                for eid, horas_dict in horas_por_empresa.items():
                    for hora, vals in horas_dict.items():
                        promedio = round(sum(vals)/len(vals), 2) if vals else 0
                        if eid in empresas:
                            empresas[eid]['promedio_horas'].append({'hora': hora, 'promedio': promedio})
                # 5. Devolver lista de empresas
                return {'empresas': list(empresas.values())}
    except Exception as e:
        print("Error en regularidad_por_hora_buses_gremio (opt):", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener regularidad por hora de buses para gremio: {e}")

# --- NUEVO ENDPOINT: Regularidad por hora de BUSES para el sistema (por empresa) ---
@app.get("/sistema/regularidad_por_hora_buses")
def regularidad_por_hora_buses_sistema(
    fecha: str = Query(..., description="Fecha en formato YYYY-MM-DD")
):
    """
    Devuelve la cantidad de buses distintos (idsam) por hora para cada empresa del sistema y fecha seleccionada,
    y el promedio por hora de los mismos días de la semana de las 4 semanas anteriores, por empresa.
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # 1. Obtener todas las empresas del sistema
                cursor.execute('''
                    SELECT e.id_eot_vmt_hex, e.eot_nombre
                    FROM eots e
                    WHERE e.permisionario = true
                    ORDER BY e.eot_nombre
                ''')
                empresas = cursor.fetchall()
                empresas_result = []
                for emp in empresas:
                    empresa_id = emp['id_eot_vmt_hex']
                    empresa_nombre = emp['eot_nombre']
                    # Buses por hora para la fecha seleccionada
                    cursor.execute('''
                        SELECT hora, COUNT(DISTINCT idsam) as servicios
                        FROM servicios_diarios
                        WHERE id_eot_catalogo = (
                            SELECT cod_catalogo FROM eots WHERE id_eot_vmt_hex = %s
                        )
                        AND fecha = %s
                        AND idsam IS NOT NULL
                        GROUP BY hora
                        ORDER BY hora
                    ''', (empresa_id, fecha))
                    servicios_dia = cursor.fetchall()
                    # Fechas de los mismos días de las 4 semanas anteriores
                    fechas_previas = [
                        (datetime.strptime(fecha, "%Y-%m-%d") - timedelta(weeks=w)).strftime("%Y-%m-%d")
                        for w in range(1, 5)
                    ]
                    # Buses por hora para los días previos
                    cursor.execute('''
                        SELECT fecha, hora, COUNT(DISTINCT idsam) as servicios
                        FROM servicios_diarios
                        WHERE id_eot_catalogo = (
                            SELECT cod_catalogo FROM eots WHERE id_eot_vmt_hex = %s
                        )
                        AND fecha = ANY(%s::date[])
                        AND idsam IS NOT NULL
                        GROUP BY fecha, hora
                        ORDER BY fecha, hora
                    ''', (empresa_id, fechas_previas))
                    rows = cursor.fetchall()
                    horas = defaultdict(list)
                    for row in rows:
                        horas[row['hora']].append(row['servicios'])
                    promedio_horas = [
                        {"hora": h, "promedio": round(sum(vals)/len(vals), 2) if vals else 0}
                        for h, vals in sorted(horas.items())
                    ]
                    empresas_result.append({
                        "id": empresa_id,
                        "nombre": empresa_nombre,
                        "servicios_dia": servicios_dia,
                        "promedio_horas": promedio_horas
                    })
                return {"empresas": empresas_result}
    except Exception as e:
        print("Error en regularidad_por_hora_buses_sistema:", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener regularidad por hora de buses para sistema: {e}")

class FiltrosPromedioBuses(BaseModel):
    empresas: list = None  # lista de id_eot_vmt_hex, o None para general
    fecha_inicio: str  # YYYY-MM-DD
    fecha_fin: str     # YYYY-MM-DD
    franjas: dict      # {"LunVie": [[h1,h2],...], "Sab": [[h1,h2],...], "DomFeriado": [[h1,h2],...]}
    meses_alta: list   # [1,2,3,...]
    meses_baja: list   # [1,2,3,...]
    formato: str       # 'tabular' o 'agrupado'
    dias_semana: list = None  # [1,2,3,...,7] (1=Lunes, 7=Domingo)
    agrupar_por_mes: bool = True

@app.post("/buses_promedio_agrupado")
def buses_promedio_agrupado(filtros: FiltrosPromedioBuses):
    """
    Devuelve el promedio diario de buses distintos (idsam) por hora y franja, discriminando por empresa (o general), tipo de día, periodo de demanda, mes y año.
    El formato de respuesta puede ser tabular o agrupado.
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # 1. Obtener feriados
                cursor.execute("SELECT fecha FROM feriados")
                feriados = set([str(row['fecha']) if not isinstance(row['fecha'], str) else row['fecha'] for row in cursor.fetchall()])
                # 2. Armar consulta base
                empresas = filtros.empresas
                fecha_inicio = filtros.fecha_inicio
                fecha_fin = filtros.fecha_fin
                meses_alta = set(filtros.meses_alta)
                meses_baja = set(filtros.meses_baja)
                franjas = filtros.franjas
                formato = filtros.formato
                dias_semana = filtros.dias_semana if filtros.dias_semana else None  # [1,2,3,...,7]
                agrupar_por_mes = getattr(filtros, 'agrupar_por_mes', True)
                # 3. Filtro de empresas
                if empresas:
                    cursor.execute("""
                                   SELECT g.gre_nombre, e.id_eot_vmt_hex, e.cod_catalogo, e.eot_nombre 
                                   FROM eots e
                                        LEFT JOIN gremios g ON e.gre_id = g.gre_id
                                   WHERE id_eot_vmt_hex = ANY(%s)""", 
                                   (empresas,))
                else:
                    cursor.execute("""
                                   SELECT g.gre_nombre, e.id_eot_vmt_hex, e.cod_catalogo, e.eot_nombre 
                                   FROM eots e
                                      LEFT JOIN gremios g ON e.gre_id = g.gre_id
                                   WHERE permisionario = true""")
                empresas_info = cursor.fetchall()
                empresas_map = {e['cod_catalogo']: {'id': e['id_eot_vmt_hex'], 'nombre': e['eot_nombre'], 'gremio': e['gre_nombre']} for e in empresas_info}
                codigos = tuple(empresas_map.keys())
                # 4. Traer todos los servicios_diarios en el rango y empresas (optimizado)
                query = f"""
                    SELECT fecha, hora, id_eot_catalogo, COUNT(DISTINCT idsam) AS conteo_buses_diario
                    FROM servicios_diarios
                    WHERE fecha BETWEEN %s AND %s
                    AND id_eot_catalogo IN %s
                    AND idsam IS NOT NULL
                    GROUP BY fecha, hora, id_eot_catalogo
                """
                cursor.execute(query, (fecha_inicio, fecha_fin, codigos))
                rows = cursor.fetchall()
                # 5. Clasificar cada fila y agrupar para promediar por día
                from collections import defaultdict
                if agrupar_por_mes:
                    agrupador = defaultdict(lambda: defaultdict(dict))  # clave: (empresa, anio, mes, tipo_dia, periodo, franja, hora) -> {fecha: conteo}
                else:
                    agrupador = defaultdict(dict)  # clave: (empresa, tipo_dia, periodo, franja, hora, fecha) -> conteo
                for row in rows:
                    fecha = row['fecha']
                    dt = datetime.strptime(str(fecha), "%Y-%m-%d")
                    mes = dt.month
                    anio = dt.year
                    dia_semana = dt.weekday()  # 0=lunes
                    # Clasificación de tipo de día
                    if str(fecha) in feriados:
                        tipo_dia = 'DomFeriado'
                    elif dia_semana < 5:
                        tipo_dia = 'LunVie'
                    elif dia_semana == 5:
                        tipo_dia = 'Sab'
                    else:
                        tipo_dia = 'DomFeriado'
                    periodo = 'alta' if mes in meses_alta else ('baja' if mes in meses_baja else 'otro')
                    if periodo == 'otro':
                        continue
                    # Buscar franja
                    franja = None
                    for f, rangos in franjas.items():
                        if f != tipo_dia:
                            continue
                        for h1, h2 in rangos:
                            if h1 <= row['hora'] <= h2:
                                franja = f"{h1:02d}-{h2:02d}"
                                break
                        if franja:
                            break
                    if not franja:
                        continue
                    fecha_str = dt.strftime('%Y-%m-%d')
                    if agrupar_por_mes:
                        clave = (
                            empresas_map[row['id_eot_catalogo']]['id'],
                            anio,
                            mes,
                            tipo_dia,
                            periodo,
                            franja,
                            row['hora']
                        )
                        agrupador[clave][fecha_str] = row['conteo_buses_diario']
                    else:
                        clave = (
                            empresas_map[row['id_eot_catalogo']]['id'],
                            tipo_dia,
                            periodo,
                            franja,
                            row['hora'],
                            fecha_str
                        )
                        agrupador[clave] = row['conteo_buses_diario']
                # 6. Generar todas las combinaciones posibles de días reales para asegurar ceros
                tipo_dia_map = {
                    'LunVie': 'Lunes a Viernes',
                    'Sab': 'Sábados',
                    'DomFeriado': 'Domingos y Feriados',
                }
                empresas_ids = [e['id_eot_vmt_hex'] for e in empresas_info]
                empresas_nombres = {e['id_eot_vmt_hex']: e['eot_nombre'] for e in empresas_info}
                empresas_gremios = {e['id_eot_vmt_hex']: e['gre_nombre'] for e in empresas_info}
                periodos = ['alta', 'baja']
                # Calcular meses y años válidos hasta fecha_fin
                dt_ini = datetime.strptime(fecha_inicio, "%Y-%m-%d")
                dt_fin = datetime.strptime(fecha_fin, "%Y-%m-%d")
                meses_validos = []
                y, m = dt_ini.year, dt_ini.month
                while (y < dt_fin.year) or (y == dt_fin.year and m <= dt_fin.month):
                    meses_validos.append((y, m))
                    if m == 12:
                        y += 1
                        m = 1
                    else:
                        m += 1
                meses_alta_baja = sorted(list(meses_alta | meses_baja))
                # Generar días reales por tipo de día
                from calendar import monthrange
                dias_por_tipo = defaultdict(lambda: defaultdict(list))  # dias_por_tipo[(anio, mes)][tipo_dia] = [fechas]
                for anio, mes in meses_validos:
                    if mes not in meses_alta_baja:
                        continue
                    _, last_day = monthrange(anio, mes)
                    for d in range(1, last_day+1):
                        dt = datetime(anio, mes, d)
                        fecha_str = dt.strftime('%Y-%m-%d')
                        dia_semana_dt = dt.weekday()  # 0=lunes ... 6=domingo
                        # Si hay filtro de días de la semana, solo incluir si corresponde
                        if dias_semana:
                            # Convertir weekday (0=lunes) a 1=lunes ... 7=domingo
                            dia_semana_1_7 = dia_semana_dt + 1
                            if dia_semana_1_7 not in dias_semana:
                                continue
                        if fecha_str in feriados:
                            dias_por_tipo[(anio, mes)]['DomFeriado'].append(fecha_str)
                        elif dia_semana_dt < 5:
                            dias_por_tipo[(anio, mes)]['LunVie'].append(fecha_str)
                        elif dia_semana_dt == 5:
                            dias_por_tipo[(anio, mes)]['Sab'].append(fecha_str)
                        else:
                            dias_por_tipo[(anio, mes)]['DomFeriado'].append(fecha_str)
                combinaciones = []
                if agrupar_por_mes:
                    for empresa_id in empresas_ids:
                        empresa_nombre = empresas_nombres[empresa_id]
                        gremio_nombre = empresas_gremios.get(empresa_id)
                        for anio, mes in meses_validos:
                            if mes not in meses_alta_baja:
                                continue
                            for tipo_dia in ['LunVie', 'Sab', 'DomFeriado']:
                                if tipo_dia not in franjas or not franjas[tipo_dia]:
                                    continue
                                for periodo in periodos:
                                    if periodo == 'alta' and mes not in meses_alta:
                                        continue
                                    if periodo == 'baja' and mes not in meses_baja:
                                        continue
                                    fechas_reales = dias_por_tipo[(anio, mes)][tipo_dia]
                                    for franja_rango in franjas[tipo_dia]:
                                        h1, h2 = franja_rango
                                        franja_str = f"{h1:02d}-{h2:02d}"
                                        for hora in range(h1, h2+1):  # Incluir hora final
                                            combinaciones.append({
                                                'empresa_id': empresa_id,
                                                'empresa_nombre': empresa_nombre,
                                                'gre_nombre': gremio_nombre,
                                                'anio': anio,
                                                'mes': mes,
                                                'tipo_dia': tipo_dia,
                                                'periodo': periodo,
                                                'franja': franja_str,
                                                'hora': hora,
                                                'fechas_reales': fechas_reales
                                            })
                else:
                    # Sin agrupación por mes: juntar todas las fechas del rango
                    fechas_rango = []
                    dt_ini = datetime.strptime(fecha_inicio, "%Y-%m-%d")
                    dt_fin = datetime.strptime(fecha_fin, "%Y-%m-%d")
                    from datetime import timedelta
                    d = dt_ini
                    while d <= dt_fin:
                        mes = d.month
                        if mes in meses_alta_baja:
                            fecha_str = d.strftime('%Y-%m-%d')
                            dia_semana_dt = d.weekday()
                            # Si hay filtro de días de la semana, solo incluir si corresponde
                            if dias_semana:
                                dia_semana_1_7 = dia_semana_dt + 1
                                if dia_semana_1_7 not in dias_semana:
                                    d += timedelta(days=1)
                                    continue
                            if fecha_str in feriados:
                                tipo_dia = 'DomFeriado'
                            elif dia_semana_dt < 5:
                                tipo_dia = 'LunVie'
                            elif dia_semana_dt == 5:
                                tipo_dia = 'Sab'
                            else:
                                tipo_dia = 'DomFeriado'
                            fechas_rango.append((fecha_str, tipo_dia, mes))
                        d += timedelta(days=1)
                    for empresa_id in empresas_ids:
                        empresa_nombre = empresas_nombres[empresa_id]
                        gremio_nombre = empresas_gremios.get(empresa_id)
                        for tipo_dia in ['LunVie', 'Sab', 'DomFeriado']:
                            if tipo_dia not in franjas or not franjas[tipo_dia]:
                                continue
                            for periodo in periodos:
                                for franja_rango in franjas[tipo_dia]:
                                    h1, h2 = franja_rango
                                    franja_str = f"{h1:02d}-{h2:02d}"
                                    for hora in range(h1, h2+1):
                                        # Filtrar fechas del rango para este tipo_dia y periodo
                                        fechas_reales = [f for f, td, mes in fechas_rango if td == tipo_dia and ((periodo == 'alta' and mes in meses_alta) or (periodo == 'baja' and mes in meses_baja))]
                                        combinaciones.append({
                                            'empresa_id': empresa_id,
                                            'empresa_nombre': empresa_nombre,
                                            'gre_nombre': gremio_nombre,
                                            'tipo_dia': tipo_dia,
                                            'periodo': periodo,
                                            'franja': franja_str,
                                            'hora': hora,
                                            'fechas_reales': fechas_reales
                                        })
                # 7. Construir tabla final con promedio diario (incluyendo ceros para días sin datos)
                tabla = []
                for c in combinaciones:
                    if agrupar_por_mes:
                        key = (
                            c['empresa_id'],
                            c['anio'],
                            c['mes'],
                            c['tipo_dia'],
                            c['periodo'],
                            c['franja'],
                            c['hora']
                        )
                        valores = []
                        for fecha in c['fechas_reales']:
                            valores.append(agrupador.get(key, {}).get(fecha, 0))
                        divisor = len(c['fechas_reales']) if c['fechas_reales'] else 1
                        promedio_buses = round(sum(valores)/divisor, 2)
                        row_dict = {
                            'empresa_id': c['empresa_id'],
                            'empresa_nombre': c['empresa_nombre'],
                            'gre_nombre': c['gre_nombre'],
                            'anio': c['anio'],
                            'mes': c['mes'],
                            'tipo_dia': tipo_dia_map.get(c['tipo_dia'], c['tipo_dia']),
                            'periodo': c['periodo'],
                            'franja': c['franja'],
                            'hora': c['hora'],
                            'promedio_buses': promedio_buses
                        }
                        tabla.append(row_dict)
                    else:
                        key_base = (
                            c['empresa_id'],
                            c['tipo_dia'],
                            c['periodo'],
                            c['franja'],
                            c['hora']
                        )
                        valores = []
                        for fecha in c['fechas_reales']:
                            clave = key_base + (fecha,)
                            valores.append(agrupador.get(clave, 0))
                        divisor = len(c['fechas_reales']) if c['fechas_reales'] else 1
                        promedio_buses = round(sum(valores)/divisor, 2)
                        row_dict = {
                            'empresa_id': c['empresa_id'],
                            'empresa_nombre': c['empresa_nombre'],
                            'gre_nombre': c['gre_nombre'],
                            'tipo_dia': tipo_dia_map.get(c['tipo_dia'], c['tipo_dia']),
                            'periodo': c['periodo'],
                            'franja': c['franja'],
                            'hora': c['hora'],
                            'promedio_buses': promedio_buses
                        }
                        tabla.append(row_dict)
                return {'formato': 'tabular', 'data': tabla}
    except Exception as e:
        print("Error en buses_promedio_agrupado:", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener promedio de buses: {e}")

class ServiciosPorHoraRequest(BaseModel):
    empresas: list
    fecha: str  # 'YYYY-MM-DD'
    tipo_dia: str

@app.post('/servicios_por_hora')
def servicios_por_hora(req: ServiciosPorHoraRequest):
    try:
        empresas_nombres = req.empresas
        fecha = req.fecha
        tipo_dia = req.tipo_dia  # Por ahora no se usa, pero se puede usar para lógica futura
        # 1. Mapear nombres de empresa a id_eot_vmt_hex y cod_catalogo
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT id_eot_vmt_hex, cod_catalogo, eot_nombre FROM eots WHERE eot_nombre = ANY(%s) AND permisionario = TRUE
                """, (empresas_nombres,))
                empresas_info = cursor.fetchall()
                if not empresas_info:
                    return []
                codigos = tuple(e['cod_catalogo'] for e in empresas_info)
                if len(codigos) == 1:
                    codigos_sql = f"('{codigos[0]}')"
                else:
                    codigos_sql = str(codigos)
                # 2. Consultar servicios_diarios para esas empresas y fecha
                cursor.execute(f"""
                    SELECT hora, SUM(servicios) as servicios
                    FROM (
                        SELECT hora, COUNT(DISTINCT idsam) as servicios
                        FROM servicios_diarios
                        WHERE id_eot_catalogo IN {codigos_sql}
                        AND fecha = %s
                        GROUP BY hora
                    ) t
                    GROUP BY hora
                    ORDER BY hora
                """, (fecha,))
                rows = cursor.fetchall()
                return rows
    except Exception as e:
        print("Error en servicios_por_hora:", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener servicios por hora: {e}")

@app.post('/promedio_semanas_por_hora')
def promedio_semanas_por_hora(body: dict = Body(...)):
    empresas_nombres = body.get('empresas', [])
    fecha = body.get('fecha')  # 'YYYY-MM-DD'
    semanas = int(body.get('semanas', 4))
    if not empresas_nombres or not fecha:
        return []
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # 1. Mapear nombres de empresa a cod_catalogo
                cursor.execute("""
                    SELECT cod_catalogo FROM eots WHERE eot_nombre = ANY(%s)
                """, (empresas_nombres,))
                empresas_info = cursor.fetchall()
                if not empresas_info:
                    return []
                codigos = tuple(e['cod_catalogo'] for e in empresas_info)
                if len(codigos) == 1:
                    codigos_sql = f"('{codigos[0]}')"
                else:
                    codigos_sql = str(codigos)
                # 2. Calcular el día de la semana de la fecha seleccionada
                dia_semana = datetime.strptime(fecha, "%Y-%m-%d").weekday()
                # 3. Buscar feriados
                cursor.execute("SELECT fecha FROM feriados")
                feriados = set([str(row['fecha']) if not isinstance(row['fecha'], str) else row['fecha'] for row in cursor.fetchall()])
                # 4. Buscar las X fechas anteriores del mismo día de la semana, saltando feriados
                fechas_previas = []
                fecha_base = datetime.strptime(fecha, "%Y-%m-%d")
                i = 1
                while len(fechas_previas) < semanas:
                    f = fecha_base - timedelta(weeks=i)
                    if f.strftime('%Y-%m-%d') not in feriados and f.weekday() == dia_semana:
                        fechas_previas.append(f.strftime('%Y-%m-%d'))
                    i += 1
                    if i > 52: break  # evitar bucle infinito
                if not fechas_previas:
                    return []
                # 5. Traer los datos por hora para esas fechas y empresas
                cursor.execute(f"""
                    SELECT hora, AVG(buses) as promedio
                    FROM (
                        SELECT hora, COUNT(DISTINCT idsam) as buses
                        FROM servicios_diarios
                        WHERE id_eot_catalogo IN {codigos_sql}
                        AND fecha = ANY(%s::date[])
                        GROUP BY fecha, hora
                    ) t
                    GROUP BY hora
                    ORDER BY hora
                """, (fechas_previas,))
                rows = cursor.fetchall()
                return rows
    except Exception as e:
        print("Error en promedio_semanas_por_hora:", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener promedio de semanas por hora: {e}")

class FiltrosPromedioBusesGlobal(BaseModel):
    empresas: list = None  # lista de id_eot_vmt_hex, o None para general
    fecha_inicio: str  # YYYY-MM-DD
    fecha_fin: str     # YYYY-MM-DD
    franjas: dict      # {"LunVie": [[h1,h2],...], "Sab": [[h1,h2],...], "DomFeriado": [[h1,h2],...]}
    meses_alta: list   # [1,2,3,...]
    meses_baja: list   # [1,2,3,...]
    formato: str       # 'tabular' o 'agrupado'
    dias_semana: list = None  # [1,2,3,...,7] (1=Lunes, 7=Domingo)

@app.post("/buses_promedio_global")
def buses_promedio_global(filtros: FiltrosPromedioBusesGlobal):
    """
    Devuelve el promedio diario de buses distintos (idsam) por hora y franja, discriminando por empresa (o general) y tipo de día, para todo el rango de fechas (sin separar por mes ni periodo).
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # 1. Obtener feriados
                cursor.execute("SELECT fecha FROM feriados")
                feriados = set([str(row['fecha']) if not isinstance(row['fecha'], str) else row['fecha'] for row in cursor.fetchall()])
                # 2. Armar consulta base
                empresas = filtros.empresas
                fecha_inicio = filtros.fecha_inicio
                fecha_fin = filtros.fecha_fin
                franjas = filtros.franjas
                dias_semana = filtros.dias_semana if filtros.dias_semana else None
                # 3. Filtro de empresas
                if empresas:
                    cursor.execute("SELECT g.gre_nombre, e.id_eot_vmt_hex, e.cod_catalogo, e.eot_nombre FROM eots e LEFT JOIN gremios g ON e.gre_id = g.gre_id WHERE id_eot_vmt_hex = ANY(%s)", (empresas,))
                else:
                    cursor.execute("SELECT g.gre_nombre, e.id_eot_vmt_hex, e.cod_catalogo, e.eot_nombre FROM eots e LEFT JOIN gremios g ON e.gre_id = g.gre_id WHERE permisionario = true")
                empresas_info = cursor.fetchall()
                empresas_map = {e['cod_catalogo']: {'id': e['id_eot_vmt_hex'], 'nombre': e['eot_nombre'], 'gremio': e['gre_nombre']} for e in empresas_info}
                empresas_nombres = {e['id_eot_vmt_hex']: e['eot_nombre'] for e in empresas_info}
                empresas_gremios = {e['id_eot_vmt_hex']: e['gre_nombre'] for e in empresas_info}
                codigos = tuple(empresas_map.keys())
                # 4. Traer todos los servicios_diarios en el rango y empresas (optimizado)
                query = f"""
                    SELECT fecha, hora, id_eot_catalogo, COUNT(DISTINCT idsam) AS conteo_buses_diario
                    FROM servicios_diarios
                    WHERE fecha BETWEEN %s AND %s
                    AND id_eot_catalogo IN %s
                    AND idsam IS NOT NULL
                    GROUP BY fecha, hora, id_eot_catalogo
                """
                cursor.execute(query, (fecha_inicio, fecha_fin, codigos))
                rows = cursor.fetchall()
                # 5. Agrupar por (empresa, tipo_dia, franja, hora)
                from collections import defaultdict
                agrupador = defaultdict(lambda: defaultdict(int))  # clave: (empresa, tipo_dia, franja, hora) -> {fecha: conteo}
                for row in rows:
                    fecha = row['fecha']
                    dt = datetime.strptime(str(fecha), "%Y-%m-%d")
                    dia_semana = dt.weekday()  # 0=lunes
                    # Clasificación de tipo de día
                    if str(fecha) in feriados:
                        tipo_dia = 'DomFeriado'
                    elif dia_semana < 5:
                        tipo_dia = 'LunVie'
                    elif dia_semana == 5:
                        tipo_dia = 'Sab'
                    else:
                        tipo_dia = 'DomFeriado'
                    # Buscar franja
                    franja = None
                    for f, rangos in franjas.items():
                        if f != tipo_dia:
                            continue
                        for h1, h2 in rangos:
                            if h1 <= row['hora'] <= h2:
                                franja = f"{h1:02d}-{h2:02d}"
                                break
                        if franja:
                            break
                    if not franja:
                        continue
                    clave = (
                        empresas_map[row['id_eot_catalogo']]['id'],
                        tipo_dia,
                        franja,
                        row['hora']
                    )
                    fecha_str = dt.strftime('%Y-%m-%d')
                    # Validar que el catalogo esté en empresas_map
                    catalogo = row['id_eot_catalogo']
                    if catalogo not in empresas_map:
                        continue
                    empresa_id = empresas_map[catalogo]['id']

                    clave = (
                        empresa_id,
                        tipo_dia,
                        franja,
                        row['hora']
                    )
                    fecha_str = dt.strftime('%Y-%m-%d')
                    # Acumular si ya existe
                    agrupador[clave][fecha_str] += row['conteo_buses_diario']

                # 6. Generar fechas del rango SOLO para los días de la semana seleccionados
                from datetime import timedelta
                tipo_dia_map = {
                    'LunVie': 'Lunes a Viernes',
                    'Sab': 'Sábados',
                    'DomFeriado': 'Domingos y Feriados',
                }
                dt_ini = datetime.strptime(fecha_inicio, "%Y-%m-%d")
                dt_fin = datetime.strptime(fecha_fin, "%Y-%m-%d")
                fechas_rango = []
                d = dt_ini
                while d <= dt_fin:
                    fecha_str = d.strftime('%Y-%m-%d')
                    dia_semana = d.weekday()  # 0=lunes ... 6=domingo
                    if dias_semana:
                        dia_semana_1_7 = dia_semana + 1
                        if dia_semana_1_7 not in dias_semana:
                            d += timedelta(days=1)
                            continue
                    if fecha_str in feriados:
                        tipo_dia = 'DomFeriado'
                    elif dia_semana < 5:
                        tipo_dia = 'LunVie'
                    elif dia_semana == 5:
                        tipo_dia = 'Sab'
                    else:
                        tipo_dia = 'DomFeriado'
                    fechas_rango.append((fecha_str, tipo_dia))
                    d += timedelta(days=1)
                # 7. Generar todas las combinaciones posibles de empresa, tipo de día, franja y hora SOLO para los días seleccionados
                empresas_ids = [e['id_eot_vmt_hex'] for e in empresas_info]
                empresas_nombres = {e['id_eot_vmt_hex']: e['eot_nombre'] for e in empresas_info}
                empresas_gremios = {e['id_eot_vmt_hex']: e['gre_nombre'] for e in empresas_info}
                combinaciones = []
                for empresa_id in empresas_ids:
                    empresa_nombre = empresas_nombres[empresa_id]
                    gremio_nombre = empresas_gremios.get(empresa_id)
                    for tipo_dia in ['LunVie', 'Sab', 'DomFeriado']:
                        if tipo_dia not in franjas or not franjas[tipo_dia]:
                            continue
                        # Solo generar combinaciones si hay fechas reales para ese tipo_dia
                        fechas_reales = [f for f, td in fechas_rango if td == tipo_dia]
                        if not fechas_reales:
                            continue
                        for franja_rango in franjas[tipo_dia]:
                            h1, h2 = franja_rango
                            franja_str = f"{h1:02d}-{h2:02d}"
                            for hora in range(h1, h2+1):
                                combinaciones.append({
                                    'empresa_id': empresa_id,
                                    'empresa_nombre': empresa_nombre,
                                    'gre_nombre': gremio_nombre,
                                    'tipo_dia': tipo_dia,
                                    'franja': franja_str,
                                    'hora': hora,
                                    'fechas_reales': fechas_reales
                                })
                # Generar tabla final usando combinaciones
                tabla = []
                for c in combinaciones:
                    key = (
                        c['empresa_id'],
                        c['tipo_dia'],
                        c['franja'],
                        c['hora']
                    )
                    fechas_dict = agrupador.get(key, {})
                    valores = [fechas_dict.get(f, 0) for f in c['fechas_reales']]
                    divisor = len(c['fechas_reales']) if c['fechas_reales'] else 1
                    promedio_buses = round(sum(valores)/divisor, 2)
                    row_dict = {
                        'empresa_id': c['empresa_id'],
                        'empresa_nombre': c['empresa_nombre'],
                        'gre_nombre': c['gre_nombre'],
                        'anio': '---',
                        'mes': '---',
                        'tipo_dia': tipo_dia_map.get(c['tipo_dia'], c['tipo_dia']),
                        'periodo': '---',
                        'franja': c['franja'],
                        'hora': c['hora'],
                        'promedio_buses': promedio_buses
                    }
                    tabla.append(row_dict)
                return {'formato': 'tabular', 'data': tabla}
    except Exception as e:
        print("Error en buses_promedio_global:", e)
        raise HTTPException(status_code=500, detail=f"Error al obtener promedio global de buses: {e}")
    
# --- NUEVO ENDPOINT: Feriados ---
@app.get("/feriados/")
def obtener_feriados():
    """
    Devuelve la lista de fechas de feriados.
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("SELECT fecha FROM feriados")
                rows = cursor.fetchall()
                # Devolver solo la lista de fechas
                return [row['fecha'] for row in rows]
    except Exception as e:
        print("Error al obtener feriados:", e)
        raise HTTPException(status_code=500, detail="Error al obtener feriados")
    
@app.get("/feriados/{anho}/por_anho")
def obtener_feriados_por_anho(anho: int):
    """
    Devuelve la lista de fechas de feriados para un año específico.
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("SELECT fecha FROM feriados WHERE EXTRACT(YEAR FROM fecha) = %s", (anho,))
                rows = cursor.fetchall()
                return [row['fecha'] for row in rows]
    except Exception as e:
        print("Error al obtener feriados:", e)
        raise HTTPException(status_code=500, detail="Error al obtener feriados")
    
# --- ENDPOINT: Total de shapes para una empresa ---
@app.get("/empresas/{empresa_id}/shapes/total")
def total_shapes_empresa(empresa_id: str):
    """
    Devuelve el total de shapes (itinerarios) para una empresa y el total máximo posible para esa empresa.
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor() as cursor:
                # Total de shapes de la empresa
                cursor.execute("""
                    SELECT COUNT(*) FROM catalogo_rutas
                    WHERE id_eot_catalogo = %s AND geom IS NOT NULL
                """, (empresa_id,))
                total = cursor.fetchone()[0]
                # Total máximo de shapes posibles para la empresa (todos los itinerarios)
                cursor.execute("SELECT COUNT(*) FROM catalogo_rutas WHERE id_eot_catalogo = %s", (empresa_id,))
                max_total = cursor.fetchone()[0]
                return {"total": total, "max": max_total}
    except Exception as e:
        print("Error en /empresas/{empresa_id}/shapes/total:", e)
        raise HTTPException(status_code=500, detail="Error al obtener total de shapes para empresa")
    
# --- ENDPOINT: Shapes cargados y total en catalogo_rutas (global) ---
@app.get("/shapes/total")
@app.get("/catalogo_rutas/shapes/total")
def total_shapes_catalogo_rutas():
    """
    Devuelve el total de shapes cargados (geo IS NOT NULL) y el total de registros en catalogo_rutas.
    """
    try:
        with get_conn_CID() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM catalogo_rutas WHERE geom IS NOT NULL")
                total = cursor.fetchone()[0]
                cursor.execute("SELECT COUNT(*) FROM catalogo_rutas WHERE estado IS TRUE")
                max_total = cursor.fetchone()[0]
                return {"total": total, "max": max_total}
    except Exception as e:
        print("Error en /catalogo_rutas/shapes/total:", e)
        raise HTTPException(status_code=500, detail="Error al obtener shapes globales de catalogo_rutas")
