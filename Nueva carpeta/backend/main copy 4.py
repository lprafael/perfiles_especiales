# Ejecutar con: uvicorn main:app --reload
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
load_dotenv()
import os


app = FastAPI()

# Habilitar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # podés restringir en producción
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

def get_conn_CID():
    return psycopg2.connect(**db_config)
def get_conn_monitoreo():
    return psycopg2.connect(**db_monitoreo)

@app.get("/empresas")
def obtener_empresas():
    try:
        with get_conn_CID() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT id_eot_vmt_hex, eot_nombre 
                    FROM eots 
                    WHERE permisionario = true 
                    ORDER BY eot_nombre
                """)
                return cursor.fetchall()
    except Exception as e:
        print("Error al obtener empresas:", e)
        raise HTTPException(status_code=500, detail="Error al obtener empresas")

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
                    GROUP BY c.ruta_hex, c.linea, c.ramal, c.origen, c.destino
                    ORDER BY (c.geom IS NULL), c.ruta_hex
                """, (empresa_id,))
                return cursor.fetchall()
    except Exception as e:
        import traceback
        print("Error al obtener itinerarios:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al obtener itinerarios: {e}")

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

@app.get("/")
def root():
    return {"mensaje": "Backend Python funcionando correctamente"}

@app.get("/empresas/{empresa_id}/ultimos_gps")
def obtener_ultimos_gps(empresa_id: str):
    try:
        with get_conn_monitoreo() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Establecer el nivel de aislamiento justo después de abrir la conexión
                cursor.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED;")
                cursor.execute("""
                    SELECT DISTINCT ON (mean_id) mean_id, latitude, longitude, fecha_hora
                        FROM app_monitoreo_mensajeoperativo
                        WHERE agency_id = %s
                        AND fecha_hora BETWEEN (NOW() - INTERVAL '2 hour') AND NOW()
                        ORDER BY mean_id, fecha_hora DESC
                """, (empresa_id,))
                return cursor.fetchall()
    except Exception as e:
        print("Error al obtener últimos GPS de buses:", e)
        raise HTTPException(status_code=500, detail="Error al obtener últimos GPS de buses")

@app.get("/empresas/{empresa_id}/buses")
def obtener_buses_empresa(empresa_id: str, fecha: str):
    """
    Devuelve todos los mean_id (buses) y sus puntos GPS para la empresa y fecha seleccionada.
    """
    try:
        with get_conn_monitoreo() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                fecha_ini = f"{fecha} 00:00:00"
                fecha_fin = f"{fecha} 23:59:59"
                cursor.execute("""
                    SELECT mean_id, latitude, longitude, fecha_hora
                    FROM app_monitoreo_mensajeoperativo
                    WHERE agency_id = %s AND fecha_hora BETWEEN %s AND %s
                    ORDER BY mean_id, fecha_hora
                """, (empresa_id, fecha_ini, fecha_fin))
                rows = cursor.fetchall()
                # Agrupar por mean_id
                # imprimo en la terminal para debug
                print(f"Obtenidos {len(rows)} puntos GPS para la empresa {empresa_id} en la fecha {fecha}")
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
    from datetime import datetime, timedelta
    import math

    def haversine(lat1, lon1, lat2, lon2):
        R = 6371000  # metros
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon1 - lon2)
        a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
        return 2*R*math.atan2(math.sqrt(a), math.sqrt(1 - a))

    agency_id = str(data.get('selectedIndex'))
    fecha = data.get('fecha')
    puntos_control = data.get('puntosDeControl', [])
    try:
        with get_conn_monitoreo() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Establecer el nivel de aislamiento justo después de abrir la conexión
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
                print("Agencia:", agency_id, "Fecha:", fecha, "Puntos de control:", puntos_control)
    except Exception as e:
        print("Error al obtener puntos GPS para servicios:", e)
        return {"error": "Error al obtener puntos GPS"}

    radio = data.get('radio', 50)  # metros
    for punto in gps_data:
        punto['punto_control'] = None
        for idx, pc in enumerate(puntos_control):
            dist = haversine(punto['latitud'], punto['longitud'], pc['lat'], pc['lng'])
            if dist <= radio:
                punto['punto_control'] = idx
                break

    buses = {}
    for punto in gps_data:
        mean_id = punto['mean_id']
        if mean_id not in buses:
            buses[mean_id] = []
        buses[mean_id].append(punto)

    servicios = 0
    servicios_directos = 0
    servicios_circulares = 0
    for bus, puntos in buses.items():
        prev = None
        for p in puntos:
            if prev is not None:
                # Directo: de primer a último punto de control
                if prev['punto_control'] == 0 and p['punto_control'] == len(puntos_control)-1:
                    servicios += 1
                    servicios_directos += 1
                # Circular: de último a primer punto de control
                if prev['punto_control'] == len(puntos_control)-1 and p['punto_control'] == 0:
                    servicios += 1
                    servicios_circulares += 1
            prev = p
    return {
        "servicios": servicios,
        "servicios_directos": servicios_directos,
        "servicios_circulares": servicios_circulares,
        "buses": len(buses),
        "mensaje": f"Servicios calculados: {servicios} (Directos: {servicios_directos}, Circulares: {servicios_circulares})"
    }