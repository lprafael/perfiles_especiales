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
                        json_agg(json_build_object('lat', ST_Y(punto), 'lng', ST_X(punto))) AS shape_points
                    FROM catalogo_rutas c
                    JOIN eots e ON c.id_eot_catalogo = e.cod_catalogo
                    LEFT JOIN LATERAL (
                        SELECT (ST_DumpPoints(c.geom)).geom AS punto
                    ) AS puntos ON true
                    WHERE e.id_eot_vmt_hex = %s
                    GROUP BY c.ruta_hex, c.linea, c.ramal, c.origen, c.destino
                    ORDER BY (COUNT(punto) = 0) ASC, c.ruta_hex                    
                """, (empresa_id,))
                return cursor.fetchall()
    except Exception as e:
        print("Error al obtener itinerarios:", e)
        raise HTTPException(status_code=500, detail="Error al obtener itinerarios")

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
        servicios = calcular_servicios(data)
        print("Datos recibidos:", data)
        return {"mensaje": "Servicios calculados correctamente", "data": servicios}
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

def calcular_servicios(data):
    # data: {selectedIndex, fecha, puntosDeControl, shapes}
    from datetime import datetime, timedelta
    import math

    def haversine(lat1, lon1, lat2, lon2):
        R = 6371000  # metros
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
        return 2*R*math.atan2(math.sqrt(a), math.sqrt(1 - a))

    # 1. Obtener agency_id (empresa seleccionada)
    agency_id = str(data.get('selectedIndex'))
    fecha = data.get('fecha')
    puntos_control = data.get('puntosDeControl', [])
    # 2. Obtener todos los puntos GPS de la empresa y fecha
    try:
        with get_conn_monitoreo() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Suponemos que hay un campo 'mean_id' para el bus y 'fecha_hora' para la fecha
                fecha_ini = f"{fecha} 00:00:00"
                fecha_fin = f"{fecha} 23:59:59"
                cursor.execute("""
                    SELECT latitud, longitud, mean_id, fecha_hora
                    FROM app_monitoreo_mensajeoperativo
                    WHERE agency_id = %s AND fecha_hora BETWEEN %s AND %s
                    ORDER BY mean_id, fecha_hora
                """, (agency_id, fecha_ini, fecha_fin))
                gps_data = cursor.fetchall()
    except Exception as e:
        print("Error al obtener puntos GPS para servicios:", e)
        return {"error": "Error al obtener puntos GPS"}

    # 3. Filtrar los puntos que caen dentro de los puntos de control (con un radio, ej: 50m)
    radio = data.get('radio', 50)  # metros, ahora configurable desde frontend
    for punto in gps_data:
        punto['punto_control'] = None
        for idx, pc in enumerate(puntos_control):
            dist = haversine(punto['latitud'], punto['longitud'], pc['lat'], pc['lng'])
            if dist <= radio:
                punto['punto_control'] = idx  # o pc, si quieres más info
                break

    # 4. Agrupar por bus (mean_id)
    buses = {}
    for punto in gps_data:
        mean_id = punto['mean_id']
        if mean_id not in buses:
            buses[mean_id] = []
        buses[mean_id].append(punto)

    # 5. Contar servicios: cada vez que hay un cambio de GX a GY (de primer a último punto de control)
    servicios = 0
    for bus, puntos in buses.items():
        prev = None
        for p in puntos:
            if prev is not None:
                # Cambio de GX (0) a GY (1) (asumiendo 0=GX, 1=GY)
                if prev['punto_control'] == 0 and p['punto_control'] == 1:
                    servicios += 1
            prev = p
    # 6. Retornar el número de servicios y la lista de buses
    return {
        "servicios": servicios,
        "buses": len(buses),
        "mensaje": f"Servicios calculados: {servicios}"
    }
    #    return {"servicios": servicios, "buses": len(buses), "mensaje": f"Servicios calculados: {servicios}"}