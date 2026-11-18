# backend/billetaje_service.py
"""
Servicio de Integración y Sincronización con el Sistema de Billetaje Electrónico (Opentransit / SNBE)
La tabla 'c_modusuario' es la tabla maestra y fuente única de verdad para la asignación de serialmediopago a beneficiarios.
"""

import os
import re
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from env_loader import load_dotenv_safe
from models import PerfilEspecial, PerfilObservacion, EstadoSolicitudPerfil

load_dotenv_safe()

logger = logging.getLogger("billetaje_service")

# Parámetros de conexión a la base de datos de Billetaje Opentransit (Estrictamente READ-ONLY)
DB_HOST = os.getenv("DB_HOST", "192.168.174.21")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "opentransit-prod")
DB_USER = os.getenv("DB_USER", "vmtuser")
DB_PASSWORD = os.getenv("DB_PASSWORD", "$$Tr4nsp0rt3$$")

# Mapeo de id_tipo_perfil en CID a códigoperfil en c_modusuario
# 4: Discapacidad Visual -> 4
# 5: Discapacidad General -> 5
# 3: Estudiante -> 3
MAPA_TIPO_PERFIL_A_CODIGO = {
    4: [4],
    5: [5],
    3: [3]
}

def normalizar_cedula(cedula: Any) -> Optional[str]:
    """Limpia la cédula quitando .0 de exportaciones de Excel y dejando solo dígitos."""
    if cedula is None:
        return None
    s = re.sub(r'\.0$', '', str(cedula).strip())
    limpia = re.sub(r'\D', '', s).strip()
    return limpia if limpia else None

def get_opentransit_connection():
    """Crea una conexión directa a Opentransit (SNBE) en modo solo lectura."""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        connect_timeout=10
    )

def consultar_seriales_en_modusuario(
    cedulas: List[str], 
    codigos_perfil: Optional[List[int]] = None
) -> Dict[str, Dict[str, Any]]:
    """
    Consulta en la tabla maestra c_modusuario el último serialmediopago asignado
    para cada cédula.
    Retorna un diccionario {cedula_normalizada: {serial, fechaevento, codigoperfil, nombreusuario}}
    """
    if not cedulas:
        return {}

    # Limpiar cédulas de entrada
    cedulas_limpias = list({normalizar_cedula(c) for c in cedulas if normalizar_cedula(c)})
    if not cedulas_limpias:
        return {}

    if codigos_perfil is None:
        codigos_perfil = [4, 5]  # Por defecto SENADIS (Visual y General)

    conn = get_opentransit_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT 
                    NULLIF(regexp_replace(credencialusuario, '\\D', '', 'g'), '') as doc_clean,
                    serialmediopago,
                    fechaevento,
                    "códigoperfil" as codigoperfil,
                    nombreusuario
                FROM c_modusuario
                WHERE NULLIF(regexp_replace(credencialusuario, '\\D', '', 'g'), '') = ANY(%s)
                  AND "códigoperfil" = ANY(%s)
                ORDER BY fechaevento DESC;
            """
            cur.execute(query, (cedulas_limpias, codigos_perfil))
            rows = cur.fetchall()

            resultado = {}
            for r in rows:
                doc = r["doc_clean"]
                # Como viene ordenado por fechaevento DESC, el primero que encontremos es el más reciente
                if doc and doc not in resultado:
                    resultado[doc] = {
                        "serial": str(r["serialmediopago"]).strip() if r["serialmediopago"] else None,
                        "fechaevento": r["fechaevento"],
                        "codigoperfil": r["codigoperfil"],
                        "nombreusuario": r["nombreusuario"]
                    }
            return resultado
    finally:
        conn.close()

async def sincronizar_perfiles_con_modusuario(
    session: AsyncSession,
    lote: Optional[str] = None,
    orden: Optional[int] = None,
    id_usuario: int = 1,
    marcar_entregado: bool = False,
    entregado_a: Optional[str] = None,
    forzar_reemplazo_serial: bool = False
) -> Dict[str, Any]:
    """
    Sincroniza los seriales de perfiles especiales consultando la tabla maestra c_modusuario.
    - Si orden viene especificado, sincroniza únicamente ese perfil.
    - Si lote viene especificado, sincroniza los perfiles de ese lote.
    - Si ninguno viene, sincroniza todos los perfiles de discapacidad (4 y 5) que aún no tienen serial.
    """
    stmt = select(PerfilEspecial)

    filtros = []
    if orden:
        filtros.append(PerfilEspecial.orden == orden)
    elif lote:
        filtros.append(func.trim(PerfilEspecial.Lote) == str(lote).strip())
    else:
        # Global: perfiles especiales de discapacidad
        filtros.append(PerfilEspecial.id_tipo_perfil.in_([4, 5]))

    if not forzar_reemplazo_serial:
        # Por defecto solo procesar aquellos sin serial o con serial vacío
        filtros.append(
            or_(
                PerfilEspecial.serial_mdp.is_(None),
                func.trim(PerfilEspecial.serial_mdp) == '',
                PerfilEspecial.serial_mdp == '#N/D'
            )
        )

    # Excluir rechazados (4) y anulados (8)
    filtros.append(PerfilEspecial.id_estado_solicitud.notin_([4, 8]))

    stmt = stmt.where(and_(*filtros))
    res = await session.execute(stmt)
    perfiles = res.scalars().all()

    if not perfiles:
        return {
            "success": True,
            "total_evaluados": 0,
            "total_sincronizados": 0,
            "total_pendientes": 0,
            "mensaje": "No se encontraron perfiles pendientes de asignación de serial para los filtros especificados.",
            "detalles": []
        }

    # Extraer lista de cédulas a consultar
    cedula_map = {}
    for p in perfiles:
        clean_ci = normalizar_cedula(p.cedula_identidad)
        if clean_ci:
            if clean_ci not in cedula_map:
                cedula_map[clean_ci] = []
            cedula_map[clean_ci].append(p)

    todas_las_cis = list(cedula_map.keys())

    # Consultar c_modusuario
    info_modusuario = consultar_seriales_en_modusuario(todas_las_cis, codigos_perfil=[4, 5])

    ahora = datetime.now()
    detalles_actualizados = []
    total_sincronizados = 0

    for ci_clean, lista_perfiles in cedula_map.items():
        if ci_clean in info_modusuario:
            info = info_modusuario[ci_clean]
            nuevo_serial = info["serial"]
            fecha_evento = info["fechaevento"]
            cod_perfil = info["codigoperfil"]

            if nuevo_serial:
                for p in lista_perfiles:
                    serial_anterior = p.serial_mdp
                    estado_anterior = p.id_estado_solicitud

                    p.serial_mdp = nuevo_serial
                    if not p.fecha_emision:
                        p.fecha_emision = fecha_evento or ahora

                    # Transición de estado:
                    # Si se solicita marcar como entregado:
                    if marcar_entregado:
                        p.id_estado_solicitud = 7  # Entregado
                        p.fecha_entrega = ahora
                        p.entregado_a = entregado_a or "Entregado a la SENADIS"
                        p.id_usuario_entrega = id_usuario
                        nuevo_estado_texto = "Entregado a la SENADIS"
                    else:
                        # Si estaba en un estado previo a Impreso (1, 2, 3, 5), pasa a 6 (Impreso en EPS)
                        if p.id_estado_solicitud in [1, 2, 3, 5]:
                            p.id_estado_solicitud = 6  # Impreso en EPS / Listo para entrega
                        nuevo_estado_texto = "Impreso en EPS (Listo para entrega)" if p.id_estado_solicitud == 6 else f"Estado {p.id_estado_solicitud}"

                    # Crear registro de auditoría en perfiles_observaciones
                    fecha_str = fecha_evento.strftime('%d/%m/%Y %H:%M') if fecha_evento else 'N/D'
                    obs_texto = (
                        f"[Sincronización Automática c_modusuario]: Serial MDP '{nuevo_serial}' asignado "
                        f"desde la tabla maestra de Billetaje Electrónico (Perfil {cod_perfil}, Fecha registro: {fecha_str}). "
                        f"Estado actualizado a: {nuevo_estado_texto}."
                    )

                    nueva_obs = PerfilObservacion(
                        orden=p.orden,
                        observacion=obs_texto,
                        fecha_creacion=ahora,
                        id_usuario=id_usuario,
                        atendido=True,
                        resuelto=True
                    )
                    session.add(nueva_obs)

                    total_sincronizados += 1
                    detalles_actualizados.append({
                        "orden": p.orden,
                        "cedula": p.cedula_identidad,
                        "nombre": p.nombre_apellido,
                        "lote": p.Lote,
                        "serial_mdp": nuevo_serial,
                        "serial_anterior": serial_anterior,
                        "estado_anterior": estado_anterior,
                        "nuevo_estado": p.id_estado_solicitud,
                        "fecha_evento_billetaje": fecha_evento.strftime('%Y-%m-%d %H:%M:%S') if fecha_evento else None
                    })

    if total_sincronizados > 0:
        await session.commit()

    total_pendientes = len(perfiles) - total_sincronizados

    return {
        "success": True,
        "total_evaluados": len(perfiles),
        "total_sincronizados": total_sincronizados,
        "total_pendientes": total_pendientes,
        "lote": lote,
        "mensaje": f"Se sincronizaron con éxito {total_sincronizados} de {len(perfiles)} perfiles evaluados desde c_modusuario.",
        "detalles": detalles_actualizados
    }

def obtener_auditoria_uso_tarjeta(
    serial_mdp: str,
    cedula: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    limite: int = 200
) -> Dict[str, Any]:
    """
    Obtiene el control de uso detallado de una tarjeta desde c_transacciones (Opentransit):
    - Métricas globales de validaciones
    - Geoposicionamiento (coordenadas GPS de cada validación en colectivos)
    - Puntos para mapa interactivo
    - Detección de uso concurrente / alertas de picos diarios
    - Otras tarjetas emitidas al mismo titular en c_modusuario
    """
    serial_clean = re.sub(r'\D', '', str(serial_mdp)).strip()
    if not serial_clean:
        return {
            "error": "Número de serial inválido",
            "totales": {"total_viajes": 0, "con_gps": 0}
        }

    conn = get_opentransit_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Forzar índices sobre c_transacciones
            cur.execute("SET enable_seqscan = off;")

            # 1. Si hay cédula, consultar todas las tarjetas asociadas a esta persona en c_modusuario
            otras_tarjetas = []
            ci_clean = normalizar_cedula(cedula)
            if ci_clean:
                cur.execute("""
                    SELECT 
                        serialmediopago, 
                        "códigoperfil" as codigoperfil, 
                        fechaevento, 
                        nombreusuario
                    FROM c_modusuario
                    WHERE NULLIF(regexp_replace(credencialusuario, '\\D', '', 'g'), '') = %s
                    ORDER BY fechaevento DESC;
                """, (ci_clean,))
                seen_serials = set()
                for r in cur.fetchall():
                    s_str = str(r["serialmediopago"]).strip()
                    if s_str not in seen_serials:
                        seen_serials.add(s_str)
                        cod = r["codigoperfil"]
                        desc_p = "Perfil 4 (Visual)" if cod == 4 else ("Perfil 5 (General)" if cod == 5 else ("Perfil 3 (Estudiante)" if cod == 3 else f"Perfil {cod}"))
                        otras_tarjetas.append({
                            "serial": s_str,
                            "codigo_perfil": cod,
                            "tipo_perfil": desc_p,
                            "fecha_evento": r["fechaevento"].strftime('%Y-%m-%d %H:%M:%S') if r["fechaevento"] else None,
                            "es_actual": s_str == serial_clean
                        })

            # 2. Consultar métricas globales en c_transacciones
            query_tot = """
                SELECT 
                    COUNT(*) as total_viajes,
                    MIN(fechaevento) as primer_viaje,
                    MAX(fechaevento) as ultimo_viaje,
                    COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as con_gps
                FROM c_transacciones
                WHERE serialmediopago = %s
                  AND tipoevento = 4
            """
            params_tot = [int(serial_clean)]
            if fecha_desde:
                query_tot += " AND fechaevento >= %s"
                params_tot.append(fecha_desde)
            if fecha_hasta:
                query_tot += " AND fechaevento <= %s"
                params_tot.append(fecha_hasta)

            cur.execute(query_tot, tuple(params_tot))
            tot_row = cur.fetchone()

            total_viajes = tot_row["total_viajes"] if tot_row else 0
            con_gps = tot_row["con_gps"] if tot_row else 0
            primer_viaje = tot_row["primer_viaje"].strftime('%Y-%m-%d %H:%M:%S') if tot_row and tot_row["primer_viaje"] else None
            ultimo_viaje = tot_row["ultimo_viaje"].strftime('%Y-%m-%d %H:%M:%S') if tot_row and tot_row["ultimo_viaje"] else None

            # 3. Resumen agrupado por día
            query_dias = """
                SELECT 
                    fechaevento::date as dia,
                    COUNT(*) as viajes_dia,
                    COUNT(DISTINCT iddispositivo) as coches_distintos
                FROM c_transacciones
                WHERE serialmediopago = %s
                  AND tipoevento = 4
            """
            params_dias = [int(serial_clean)]
            if fecha_desde:
                query_dias += " AND fechaevento >= %s"
                params_dias.append(fecha_desde)
            if fecha_hasta:
                query_dias += " AND fechaevento <= %s"
                params_dias.append(fecha_hasta)

            query_dias += " GROUP BY fechaevento::date ORDER BY dia DESC;"
            cur.execute(query_dias, tuple(params_dias))
            dias_rows = cur.fetchall()

            total_dias = len(dias_rows)
            max_dia = max((r["viajes_dia"] for r in dias_rows), default=0)
            promedio_dia = round(total_viajes / total_dias, 1) if total_dias > 0 else 0
            dias_pico = [
                {
                    "fecha": r["dia"].strftime('%Y-%m-%d'),
                    "viajes": r["viajes_dia"],
                    "coches": r["coches_distintos"]
                }
                for r in dias_rows if r["viajes_dia"] >= 8
            ]

            # 4. Transacciones recientes con GPS y detalles
            query_tx = """
                SELECT 
                    id,
                    fechaevento,
                    fechahoraevento,
                    latitude,
                    longitude,
                    iddispositivo,
                    identidad,
                    idrutaestacion,
                    númeropassbacks,
                    consecutivoevento
                FROM c_transacciones
                WHERE serialmediopago = %s
                  AND tipoevento = 4
            """
            params_tx = [int(serial_clean)]
            if fecha_desde:
                query_tx += " AND fechaevento >= %s"
                params_tx.append(fecha_desde)
            if fecha_hasta:
                query_tx += " AND fechaevento <= %s"
                params_tx.append(fecha_hasta)

            query_tx += " ORDER BY fechaevento DESC LIMIT %s;"
            params_tx.append(min(limite, 500))

            cur.execute(query_tx, tuple(params_tx))
            tx_rows = cur.fetchall()

            transacciones = []
            puntos_gps = []
            for t in tx_rows:
                f_str = t["fechaevento"].strftime('%Y-%m-%d %H:%M:%S') if t["fechaevento"] else None
                lat = float(t["latitude"]) if t["latitude"] is not None else None
                lng = float(t["longitude"]) if t["longitude"] is not None else None

                tx_item = {
                    "id": str(t["id"]),
                    "fecha": f_str,
                    "coche": str(t["iddispositivo"]).strip() if t["iddispositivo"] else "S/D",
                    "empresa_id": str(t["identidad"]).strip() if t["identidad"] else "S/D",
                    "ruta_hex": str(t["idrutaestacion"]).strip() if t["idrutaestacion"] else None,
                    "passback": t["númeropassbacks"] or 0,
                    "consecutivo": t["consecutivoevento"],
                    "lat": lat,
                    "lng": lng,
                    "tiene_gps": lat is not None and lng is not None
                }
                transacciones.append(tx_item)

                if lat is not None and lng is not None:
                    puntos_gps.append({
                        "id": str(t["id"]),
                        "lat": lat,
                        "lng": lng,
                        "fecha": f_str,
                        "coche": tx_item["coche"],
                        "empresa": tx_item["empresa_id"],
                        "passback": tx_item["passback"]
                    })

            # Generar alertas de auditoría
            alertas = []
            if len(otras_tarjetas) > 1:
                alertas.append({
                    "nivel": "warning",
                    "titulo": "Múltiples Tarjetas Registradas",
                    "detalle": f"El titular posee {len(otras_tarjetas)} tarjetas registradas en c_modusuario."
                })
            if max_dia >= 15:
                alertas.append({
                    "nivel": "danger",
                    "titulo": "Pico Crítico de Viajes en un Día",
                    "detalle": f"Se registró un día con {max_dia} validaciones, lo que excede el patrón normal de uso personal."
                })
            elif max_dia >= 8:
                alertas.append({
                    "nivel": "info",
                    "titulo": "Frecuencia Alta de Movilidad",
                    "detalle": f"Máximo de {max_dia} validaciones en una sola jornada."
                })

            return {
                "serial_consultado": serial_clean,
                "cedula": ci_clean,
                "otras_tarjetas": otras_tarjetas,
                "totales": {
                    "total_viajes": total_viajes,
                    "dias_uso": total_dias,
                    "promedio_diario": promedio_dia,
                    "max_viajes_dia": max_dia,
                    "primer_viaje": primer_viaje,
                    "ultimo_viaje": ultimo_viaje,
                    "con_gps": con_gps
                },
                "alertas": alertas,
                "dias_pico": dias_pico[:15],
                "historial_diario": [
                    {
                        "dia": r["dia"].strftime('%Y-%m-%d'),
                        "viajes": r["viajes_dia"],
                        "coches": r["coches_distintos"]
                    }
                    for r in dias_rows[:30]
                ],
                "puntos_gps": puntos_gps,
                "transacciones": transacciones
            }
    finally:
        conn.close()

