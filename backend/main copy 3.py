from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from psycopg2.extras import RealDictCursor
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
    "host": os.getenv("DB_HOST", "168.90.177.232"),
    "user": os.getenv("DB_USER", "cid_admin_user"),
    "password": os.getenv("DB_PASSWORD", "vmtdmtcidccm"),
    "dbname": os.getenv("DB_NAME", "bbdd-monitoreo-cid"),
    "port": int(os.getenv("DB_PORT", 2024)),
}

db_monitoreo = {
    "host": os.getenv("DB_HOST", "monitoreo.vmt.gov.py"),
    "user": os.getenv("DB_USER", "jefe-CID"),
    "password": os.getenv("DB_PASSWORD", "vmtdmt"),
    "dbname": os.getenv("DB_NAME", "bbdd-monitoreo-prod"),
    "port": int(os.getenv("DB_PORT", 5432)),
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
        # Aquí podrías procesar los datos recibidos si lo deseas
        # quiero imprimir en la terminal los datos recibidos
        print("Datos recibidos:", data)
        # Llamo a la función para calcular servicios y le paso los datos
        servicios = calcular_servicios(data)
             
        # Por ahora solo retornamos confirmación y lo recibido
        return {"mensaje": "Selección recibida correctamente", "data": data}
    except Exception as e:
        print("Error al procesar la selección:", e)
        raise HTTPException(status_code=400, detail="Error al procesar la selección")

@app.get("/")
def root():
    return {"mensaje": "Backend Python funcionando correctamente"}
# Ejecutar con: uvicorn main:app --reload

# Consultar del backend las ciudades
# Consultar todos los puntos GPS del agency_id recibido
def obtener_puntos_gps(agency_id: str):
    try:
        with get_conn_monitoreo() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT id, latitud, longitud
                    FROM app_mensajes
                    WHERE agency_id = %s
                """, (agency_id,))
                return cursor.fetchall()
    except Exception as e:
        print("Error al obtener puntos GPS:", e)
        raise HTTPException(status_code=500, detail="Error al obtener puntos GPS")

def calcular_servicios(data):
    # Aquí puedes implementar la lógica para calcular los servicios
    # según los datos recibidos en la selección.
    # Por ahora, solo retornamos un mensaje de ejemplo.
    print("Calculando servicios con los datos:", data)
    return {"mensaje": "Servicios calculados correctamente"}