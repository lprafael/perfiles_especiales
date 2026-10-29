from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_, cast, String, nulls_last, func, case, distinct
from typing import List, Optional
import pandas as pd
import io
import math
from datetime import datetime

from models import PerfilEspecial, TipoPerfilEspecial, Usuario, EstadoSolicitudPerfil, EvidenciaImportacion, PerfilObservacion, Organismo
from schemas import PerfilEspecialResponse, SerialUpdate, PerfilObservacionCreate, PerfilObservacionResponse, PerfilObservacionUpdate, EstadoSolicitudResponse, EstadoUpdate
from security import get_current_user, check_permission
from database import get_session
from audit_utils import log_activity
from email_service import email_service
from fastapi.responses import StreamingResponse, FileResponse
import os
import shutil

router = APIRouter(prefix="/perfiles", tags=["Perfiles Especiales"])

@router.get("/", response_model=List[PerfilEspecialResponse])
async def get_perfiles(
    q: Optional[str] = None,
    documento: Optional[str] = None,
    lote: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Consulta de perfiles. Se filtra según la organización del usuario."""
    # Buscar organización del usuario
    res_user = await session.execute(select(Usuario).where(Usuario.id == current_user["user_id"]))
    user = res_user.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    query = select(PerfilEspecial)
    
    # Si el usuario no es admin, filtramos por su organismo
    if user.id_organismo and current_user.get("role") not in ["admin", "sysadmin"]:
        org_id = int(user.id_organismo)
        if org_id == 2:
            query = query.where(PerfilEspecial.id_tipo_perfil == 3)
        elif org_id == 3:
            query = query.where(PerfilEspecial.id_tipo_perfil.in_([4, 5]))
        else:
            # Traer los ID de tipos de perfil correspondientes al organismo
            res_tipos = await session.execute(
                select(TipoPerfilEspecial.id_tipo_especial).where(TipoPerfilEspecial.id_organismo == org_id)
            )
            tipos_ids = [t for t in res_tipos.scalars().all()]
            if not tipos_ids:
                return [] # No hay perfiles para su organización
            query = query.where(PerfilEspecial.id_tipo_perfil.in_(tipos_ids))
        
    if lote:
        if lote == 'Sin Lote Asignado':
            query = query.where(or_(PerfilEspecial.Lote.is_(None), func.trim(PerfilEspecial.Lote) == ''))
        else:
            query = query.where(PerfilEspecial.Lote == lote)

    if q:
        search_term = f"%{q}%"
        query = query.where(
            or_(
                cast(PerfilEspecial.cedula_identidad, String).ilike(search_term),
                cast(PerfilEspecial.nombre_apellido, String).ilike(search_term),
                cast(PerfilEspecial.Lote, String).ilike(search_term)
            )
        )
    elif documento: # Por compatibilidad
        query = query.where(PerfilEspecial.cedula_identidad == documento)
        
    # Añadimos un límite para evitar colgar el servidor y el navegador (timeout 504)
    query = query.limit(500)
    
    result = await session.execute(query)
    perfiles = result.scalars().all()
    
    # Pre-cargar todos los tipos de perfiles en memoria (1 sola consulta rápida)
    res_tipos = await session.execute(select(TipoPerfilEspecial))
    tipos_dict = {t.id_tipo_especial: t for t in res_tipos.scalars().all()}
    
    # Pre-cargar los usuarios en memoria (1 sola consulta rápida)
    res_usuarios = await session.execute(select(Usuario))
    usuarios_dict = {u.id: u for u in res_usuarios.scalars().all()}
    
    # Pre-cargar los estados en memoria
    res_estados = await session.execute(select(EstadoSolicitudPerfil))
    estados_dict = {e.id_estado: e for e in res_estados.scalars().all()}

    # Pre-cargar observaciones de los perfiles consultados
    perfiles_ordens = [p.orden for p in perfiles]
    obs_map = {orden: [] for orden in perfiles_ordens}
    if perfiles_ordens:
        try:
            res_obs = await session.execute(
                select(PerfilObservacion)
                .where(PerfilObservacion.orden.in_(perfiles_ordens))
                .order_by(PerfilObservacion.fecha_creacion.desc())
            )
            for obs in res_obs.scalars().all():
                obs.usuario = usuarios_dict.get(obs.id_usuario)
                obs_map[obs.orden].append(obs)
        except Exception as e:
            await session.rollback()
            # En caso de que la tabla aún no haya sido migrada en el servidor de producción
            print(f"Advertencia: no se pudieron cargar las observaciones: {e}")
            obs_map = {orden: [] for orden in perfiles_ordens}
    
    # Asignar relaciones
    for p in perfiles:
        p.tipo_perfil = tipos_dict.get(p.id_tipo_perfil)
        p.usuario_carga = usuarios_dict.get(p.id_usuario_carga)
        p.usuario_verif = usuarios_dict.get(p.id_usuario_verif)
        p.usuario_aprob = usuarios_dict.get(p.id_usuario_aprob)
        p.usuario_entrega = usuarios_dict.get(p.id_usuario_entrega)
        p.estado_solicitud = estados_dict.get(p.id_estado_solicitud)
        p.observaciones = obs_map.get(p.orden, [])
        
    return perfiles

@router.get("/dashboard_lotes")
async def get_dashboard_lotes(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    Control de remisión a EPS por lote y resumen por tipo de perfil:
    - Métricas globales (KPIs)
    - Resumen por Tipo de Perfil (Lotes solicitados, perfiles totales, perfiles remitidos a EPS)
    - Listado detallado de lotes con estado de remisión (REMITIDO, PENDIENTE, PARCIAL)
    """
    res_user = await session.execute(select(Usuario).where(Usuario.id == current_user["user_id"]))
    user = res_user.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    # 1. Subquery base con lote normalizado y filtros de organismo
    base_query = select(
        func.coalesce(func.nullif(func.trim(PerfilEspecial.Lote), ''), 'Sin Lote Asignado').label("lote_clean"),
        PerfilEspecial.id_tipo_perfil,
        PerfilEspecial.id_estado_solicitud,
        PerfilEspecial.eps,
        PerfilEspecial.serial_mdp,
        PerfilEspecial.fecha_solicitud,
        PerfilEspecial.fecha_remision_eps,
        PerfilEspecial.fecha_emision,
        PerfilEspecial.fecha_entrega,
        PerfilEspecial.entregado_a
    )
    
    # Si el usuario no es admin, filtramos por su organismo
    if user.id_organismo and current_user.get("role") not in ["admin", "sysadmin"]:
        org_id = int(user.id_organismo)
        if org_id == 2:
            base_query = base_query.where(PerfilEspecial.id_tipo_perfil == 3)
        elif org_id == 3:
            base_query = base_query.where(PerfilEspecial.id_tipo_perfil.in_([4, 5]))
        else:
            res_tipos_org = await session.execute(
                select(TipoPerfilEspecial.id_tipo_especial).where(TipoPerfilEspecial.id_organismo == org_id)
            )
            tipos_ids = [t for t in res_tipos_org.scalars().all()]
            if not tipos_ids:
                return {
                    "kpis": {
                        "total_lotes": 0, "lotes_remitidos": 0, "lotes_parciales": 0, "lotes_pendientes": 0,
                        "total_perfiles": 0, "remitidos_eps": 0, "pendientes_remision": 0, "rechazados": 0,
                        "porcentaje_remitido": 0
                    },
                    "resumen_tipos": [],
                    "lotes": []
                }
            base_query = base_query.where(PerfilEspecial.id_tipo_perfil.in_(tipos_ids))
            
    subq = base_query.subquery("sub_perfiles")

    query = select(
        subq.c.lote_clean.label("lote"),
        subq.c.id_tipo_perfil,
        func.count().label("total_perfiles"),
        func.sum(case((subq.c.id_estado_solicitud == 1, 1), else_=0)).label("solicitados"),
        func.sum(case((subq.c.id_estado_solicitud == 2, 1), else_=0)).label("verificados"),
        func.sum(case((subq.c.id_estado_solicitud == 3, 1), else_=0)).label("aprobados"),
        func.sum(case((subq.c.id_estado_solicitud == 4, 1), else_=0)).label("rechazados"),
        func.sum(
            case(
                (
                    or_(
                        subq.c.id_estado_solicitud.in_([5, 6, 7]),
                        subq.c.fecha_remision_eps.isnot(None)
                    ),
                    1
                ),
                else_=0
            )
        ).label("remitidos_eps"),
        func.sum(
            case(
                (
                    and_(
                        subq.c.id_estado_solicitud.in_([5, 7]),
                        subq.c.serial_mdp.isnot(None),
                        func.trim(subq.c.serial_mdp) != ''
                    ),
                    1
                ),
                else_=0
            )
        ).label("emitidos_tarjeta"),
        func.sum(case((subq.c.id_estado_solicitud == 7, 1), else_=0)).label("entregados"),
        func.string_agg(distinct(subq.c.eps), ', ').label("eps_destinos"),
        func.min(subq.c.fecha_solicitud).label("fecha_solicitud"),
        func.max(subq.c.fecha_remision_eps).label("fecha_ultima_remision"),
        func.max(subq.c.fecha_emision).label("fecha_ultima_emision"),
        func.max(subq.c.fecha_entrega).label("fecha_ultima_entrega")
    ).group_by(
        subq.c.lote_clean,
        subq.c.id_tipo_perfil
    ).order_by(
        subq.c.lote_clean
    )
    
    result = await session.execute(query)
    rows = result.all()
    
    # Pre-cargar tipos de perfiles y organismos en memoria
    res_tipos = await session.execute(select(TipoPerfilEspecial))
    tipos_dict = {t.id_tipo_especial: t for t in res_tipos.scalars().all()}
    
    res_orgs = await session.execute(select(Organismo))
    orgs_dict = {o.id: o for o in res_orgs.scalars().all()}
    
    lotes_list = []
    
    for r in rows:
        lote_nombre = r.lote
        id_tp = r.id_tipo_perfil
        t_obj = tipos_dict.get(id_tp)
        tp_nombre = t_obj.tipo_especial if (t_obj and t_obj.tipo_especial) else (f"Tipo {id_tp}" if id_tp else "Sin Tipo Asignado")
        
        org_obj = orgs_dict.get(t_obj.id_organismo) if (t_obj and t_obj.id_organismo) else None
        org_sigla = org_obj.sigla if org_obj else ""
        org_nombre = org_obj.nombre_completo if org_obj else ""
        
        total_p = int(r.total_perfiles or 0)
        solic = int(r.solicitados or 0)
        verif = int(r.verificados or 0)
        aprob = int(r.aprobados or 0)
        rech = int(r.rechazados or 0)
        remit = int(r.remitidos_eps or 0)
        emitidos = int(r.emitidos_tarjeta or 0)
        entregados = int(r.entregados or 0)
        en_impresion = max(0, remit - emitidos)
        
        pend = solic + verif + aprob
        
        # Determinar estado de remisión del lote
        if total_p > 0 and pend == 0 and remit > 0:
            estado_remision = "REMITIDO"
        elif remit > 0 and pend > 0:
            estado_remision = "PARCIAL"
        else:
            estado_remision = "PENDIENTE"
            
        valido = total_p - rech
        porcentaje = round((remit / valido * 100), 1) if valido > 0 else (100.0 if remit > 0 else 0.0)
        
        lotes_list.append({
            "lote": lote_nombre,
            "id_tipo_perfil": id_tp,
            "tipo_perfil": tp_nombre,
            "organismo_sigla": org_sigla,
            "organismo_nombre": org_nombre,
            "total_perfiles": total_p,
            "solicitados": solic,
            "verificados": verif,
            "aprobados": aprob,
            "rechazados": rech,
            "remitidos_eps": remit,
            "en_impresion_eps": en_impresion,
            "emitidos_tarjeta": emitidos,
            "entregados": entregados,
            "pendientes": pend,
            "eps_destinos": r.eps_destinos or "Sin Asignar",
            "fecha_solicitud": r.fecha_solicitud.isoformat() if r.fecha_solicitud else None,
            "fecha_ultima_remision": r.fecha_ultima_remision.isoformat() if r.fecha_ultima_remision else None,
            "fecha_ultima_emision": r.fecha_ultima_emision.isoformat() if r.fecha_ultima_emision else None,
            "fecha_ultima_entrega": r.fecha_ultima_entrega.isoformat() if r.fecha_ultima_entrega else None,
            "estado_remision": estado_remision,
            "porcentaje_remitido": porcentaje
        })
        
    resumen_tipos_map = {}
    
    for l in lotes_list:
        key = l["id_tipo_perfil"]
        if key not in resumen_tipos_map:
            resumen_tipos_map[key] = {
                "id_tipo_perfil": key,
                "tipo_perfil": l["tipo_perfil"],
                "organismo_sigla": l["organismo_sigla"],
                "organismo_nombre": l["organismo_nombre"],
                "total_lotes": 0,
                "lotes_remitidos": 0,
                "lotes_parciales": 0,
                "lotes_pendientes": 0,
                "total_perfiles": 0,
                "solicitados": 0,
                "verificados": 0,
                "aprobados": 0,
                "rechazados": 0,
                "remitidos_eps": 0,
                "pendientes_remision": 0,
            }
        
        rt = resumen_tipos_map[key]
        rt["total_lotes"] += 1
        if l["estado_remision"] == "REMITIDO":
            rt["lotes_remitidos"] += 1
        elif l["estado_remision"] == "PARCIAL":
            rt["lotes_parciales"] += 1
        else:
            rt["lotes_pendientes"] += 1
            
        rt["total_perfiles"] += l["total_perfiles"]
        rt["solicitados"] += l["solicitados"]
        rt["verificados"] += l["verificados"]
        rt["aprobados"] += l["aprobados"]
        rt["rechazados"] += l["rechazados"]
        rt["remitidos_eps"] += l["remitidos_eps"]
        rt["en_impresion_eps"] = rt.get("en_impresion_eps", 0) + l.get("en_impresion_eps", 0)
        rt["emitidos_tarjeta"] = rt.get("emitidos_tarjeta", 0) + l.get("emitidos_tarjeta", 0)
        rt["entregados"] = rt.get("entregados", 0) + l.get("entregados", 0)
        rt["pendientes_remision"] += l["pendientes"]
        
    resumen_tipos = []
    for rt in resumen_tipos_map.values():
        valido = rt["total_perfiles"] - rt["rechazados"]
        pct = round((rt["remitidos_eps"] / valido * 100), 1) if valido > 0 else (100.0 if rt["remitidos_eps"] > 0 else 0.0)
        rt["porcentaje_remitido"] = pct
        resumen_tipos.append(rt)
        
    resumen_tipos.sort(key=lambda x: x["tipo_perfil"] or "")
    
    total_lotes = len(lotes_list)
    lotes_remitidos = sum(1 for l in lotes_list if l["estado_remision"] == "REMITIDO")
    lotes_parciales = sum(1 for l in lotes_list if l["estado_remision"] == "PARCIAL")
    lotes_pendientes = sum(1 for l in lotes_list if l["estado_remision"] == "PENDIENTE")
    
    total_perfiles = sum(l["total_perfiles"] for l in lotes_list)
    total_remitidos = sum(l["remitidos_eps"] for l in lotes_list)
    total_en_impresion = sum(l["en_impresion_eps"] for l in lotes_list)
    total_emitidos = sum(l["emitidos_tarjeta"] for l in lotes_list)
    total_entregados = sum(l.get("entregados", 0) for l in lotes_list)
    total_pendientes = sum(l["pendientes"] for l in lotes_list)
    total_rechazados = sum(l["rechazados"] for l in lotes_list)
    
    valido_global = total_perfiles - total_rechazados
    pct_global = round((total_remitidos / valido_global * 100), 1) if valido_global > 0 else (100.0 if total_remitidos > 0 else 0.0)
    pct_impreso = round((total_emitidos / total_remitidos * 100), 1) if total_remitidos > 0 else 0.0
    
    kpis = {
        "total_lotes": total_lotes,
        "lotes_remitidos": lotes_remitidos,
        "lotes_parciales": lotes_parciales,
        "lotes_pendientes": lotes_pendientes,
        "total_perfiles": total_perfiles,
        "remitidos_eps": total_remitidos,
        "en_impresion_eps": total_en_impresion,
        "emitidos_tarjeta": total_emitidos,
        "entregados": total_entregados,
        "pendientes_remision": total_pendientes,
        "rechazados": total_rechazados,
        "porcentaje_remitido": pct_global,
        "porcentaje_impreso": pct_impreso
    }
    
    return {
        "kpis": kpis,
        "resumen_tipos": resumen_tipos,
        "lotes": lotes_list
    }

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
TEMPLATE_PATH = os.path.join(UPLOAD_DIR, "plantilla_perfiles.xlsx")

@router.get("/template")
async def get_template(current_user: dict = Depends(get_current_user)):
    """Descargar plantilla Excel para importación."""
    if os.path.exists(TEMPLATE_PATH):
        return FileResponse(
            path=TEMPLATE_PATH,
            filename="plantilla_perfiles.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    df = pd.DataFrame(columns=["nombres", "apellidos", "documento", "id_tipo_perfil", "lote"])
    stream = io.BytesIO()
    with pd.ExcelWriter(stream, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    stream.seek(0)
    
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=plantilla_perfiles.xlsx"}
    )

@router.post("/template")
async def upload_template(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Subir una nueva plantilla Excel (Solo Admin)."""
    if current_user.get("role") not in ["admin", "sysadmin"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="El archivo debe ser un Excel (.xlsx, .xls)")
        
    with open(TEMPLATE_PATH, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"message": "Plantilla actualizada exitosamente"}

@router.delete("/template")
async def delete_template(current_user: dict = Depends(get_current_user)):
    """Eliminar la plantilla personalizada (Solo Admin)."""
    if current_user.get("role") not in ["admin", "sysadmin"]:
        raise HTTPException(status_code=403, detail="No autorizado")
        
    if os.path.exists(TEMPLATE_PATH):
        os.remove(TEMPLATE_PATH)
        return {"message": "Plantilla eliminada exitosamente"}
    else:
        return {"message": "No hay una plantilla personalizada para eliminar"}

def format_duplicado_observacion(prev: dict, tipos_dict: dict, estados_dict: dict) -> str:
    tipo_raw = tipos_dict.get(prev.get("id_tipo_perfil"))
    if tipo_raw:
        tipo_str = str(tipo_raw).strip()
        tipo_nombre = tipo_str if tipo_str.lower().startswith("perfil") else f"Perfil {tipo_str}"
    else:
        tipo_nombre = f"Perfil {prev.get('id_tipo_perfil')}" if prev.get("id_tipo_perfil") else "Perfil Especial"
        
    lote_raw = prev.get("lote")
    if lote_raw is not None and str(lote_raw).strip() and str(lote_raw).strip().upper() not in ["NAN", "NONE"]:
        lote_clean = str(lote_raw).strip()
        if lote_clean.lower().startswith("lote"):
            lote_txt = f" en el {lote_clean},"
        else:
            lote_txt = f" en el Lote {lote_clean},"
    else:
        lote_txt = " en el Lote [no registrado],"
        
    fecha_val = prev.get("fecha_solicitud")
    fecha_str = fecha_val.strftime("%d/%m/%Y") if fecha_val else "[fecha no registrada]"
    
    estado_nombre = estados_dict.get(prev.get("id_estado_solicitud"))
    estado_txt = f" con estado '{estado_nombre}'" if estado_nombre else ""
    
    return f"Ya cuenta con {tipo_nombre} solicitado{lote_txt} en fecha {fecha_str}{estado_txt}"

@router.post("/verify")
async def verify_perfiles(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Verificar perfiles desde Excel y devolver rechazados sin guardar."""
    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail="El archivo no es un Excel válido")
        
    required_cols = ["nombres", "apellidos", "documento", "id_tipo_perfil", "lote"]
    for col in required_cols:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Falta la columna requerida: {col}")
            
    df = df.fillna("")
    
    try:
        user = None
        user_id = current_user.get("user_id")
        if user_id:
            res_user = await session.execute(select(Usuario).where(Usuario.id == user_id))
            user = res_user.scalars().first()
        if not user and current_user.get("sub"):
            res_user = await session.execute(select(Usuario).where(Usuario.username == current_user.get("sub")))
            user = res_user.scalars().first()
            
        is_admin = current_user.get("role") in ["admin", "sysadmin"]
        
        # Mapear nombres de tipos de perfil y estados para la observación
        res_tipos = await session.execute(select(TipoPerfilEspecial))
        tipos_dict = {t.id_tipo_especial: t.tipo_especial for t in res_tipos.scalars().all()}
        
        res_estados = await session.execute(select(EstadoSolicitudPerfil))
        estados_dict = {e.id_estado: e.descripcion for e in res_estados.scalars().all()}
        
        # Extraer y normalizar documentos para consulta en bloque
        docs_to_check = []
        for _, row in df.iterrows():
            d = str(row["documento"]).strip()
            if d.endswith(".0"):
                d = d[:-2]
            d = d.upper()
            if d:
                docs_to_check.append(d)
                
        existing_profiles = {}
        if docs_to_check:
            chunk_size = 1000
            for i in range(0, len(docs_to_check), chunk_size):
                chunk = docs_to_check[i:i + chunk_size]
                res_dup = await session.execute(
                    select(
                        PerfilEspecial.cedula_identidad,
                        PerfilEspecial.id_tipo_perfil,
                        PerfilEspecial.fecha_solicitud,
                        PerfilEspecial.id_estado_solicitud,
                        PerfilEspecial.Lote
                    )
                    .where(PerfilEspecial.cedula_identidad.in_(chunk))
                    .order_by(PerfilEspecial.fecha_solicitud.desc().nulls_last())
                )
                for c_doc, c_tipo, c_fecha, c_estado, c_lote in res_dup.all():
                    if c_doc:
                        c_doc_str = str(c_doc).strip().upper()
                        if c_doc_str not in existing_profiles:
                            existing_profiles[c_doc_str] = {
                                "id_tipo_perfil": c_tipo,
                                "fecha_solicitud": c_fecha,
                                "id_estado_solicitud": c_estado,
                                "lote": c_lote
                            }
                        
        rejected_rows = []
        seen_docs = set()
        
        for index, row in df.iterrows():
            row_dict = row.to_dict()
            doc = str(row["documento"]).strip()
            if doc.endswith(".0"):
                doc = doc[:-2]
            doc = doc.upper()
            row_dict["documento"] = doc
            
            if not doc:
                row_dict["motivo_rechazo"] = "Documento vacío"
                row_dict["observacion"] = "La fila no contiene un número de documento válido"
                rejected_rows.append(row_dict)
                continue
                
            if doc in seen_docs:
                row_dict["motivo_rechazo"] = "Documento duplicado en el mismo archivo"
                row_dict["observacion"] = "El número de documento ya fue listado en una fila anterior de esta misma planilla"
                rejected_rows.append(row_dict)
                continue
            seen_docs.add(doc)
                
            try:
                tipo_perfil_final = int(float(str(row["id_tipo_perfil"]).strip()))
            except ValueError:
                row_dict["motivo_rechazo"] = "Tipo de perfil inválido o no numérico"
                row_dict["observacion"] = f"El valor '{row.get('id_tipo_perfil')}' no es un identificador numérico de perfil válido"
                rejected_rows.append(row_dict)
                continue
            
            if not is_admin:
                if user and user.id_organismo == 2:
                    tipo_perfil_final = 3
                elif user and user.id_organismo == 3:
                    if tipo_perfil_final not in [4, 5]:
                        row_dict["motivo_rechazo"] = "Tipo de perfil no permitido para su organismo (solo 4 o 5)"
                        row_dict["observacion"] = f"El tipo de perfil {tipo_perfil_final} no está autorizado para su organismo (solo se permiten tipos 4 o 5)"
                        rejected_rows.append(row_dict)
                        continue
                        
            if doc in existing_profiles:
                prev = existing_profiles[doc]
                row_dict["motivo_rechazo"] = "Documento duplicado"
                row_dict["observacion"] = format_duplicado_observacion(prev, tipos_dict, estados_dict)
                rejected_rows.append(row_dict)
                
        if rejected_rows:
            rejected_df = pd.DataFrame(rejected_rows)
            stream = io.BytesIO()
            with pd.ExcelWriter(stream, engine='openpyxl') as writer:
                rejected_df.to_excel(writer, index=False)
            stream.seek(0)
            
            return StreamingResponse(
                stream,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=rechazados.xlsx"}
            )
            
        return {"message": "El archivo es válido. No se encontraron errores ni duplicados."}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al verificar perfiles: {str(e)}")

@router.post("/import")
async def import_perfiles(
    request: Request,
    file: UploadFile = File(...),
    device_id: str = Form(None),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Importar perfiles desde Excel y devolver rechazados por duplicidad."""
    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail="El archivo no es un Excel válido")
        
    user = None
    user_id = current_user.get("user_id")
    if user_id:
        res_user = await session.execute(select(Usuario).where(Usuario.id == user_id))
        user = res_user.scalars().first()
    if not user and current_user.get("sub"):
        res_user = await session.execute(select(Usuario).where(Usuario.username == current_user.get("sub")))
        user = res_user.scalars().first()
        if user:
            user_id = user.id
            
    final_user_id = user_id or (user.id if user else 1)
        
    try:
        evidencia = EvidenciaImportacion(
            nombre_archivo=file.filename,
            archivo_binario=content,
            id_usuario=final_user_id,
            ip_origen=request.client.host if request.client else None
        )
        session.add(evidencia)
        await session.flush()
    except Exception as e:
        import traceback
        print("ERROR EN IMPORTACION:", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno en BD: {str(e)}. (¿Se corrió la migración de la BD?)")
    
    required_cols = ["nombres", "apellidos", "documento", "id_tipo_perfil", "lote"]
    for col in required_cols:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Falta la columna requerida: {col}")
            
    df = df.fillna("")
    
    try:
        is_admin = current_user.get("role") in ["admin", "sysadmin"]
        
        # Mapear nombres de tipos de perfil y estados para la observación
        res_tipos = await session.execute(select(TipoPerfilEspecial))
        tipos_dict = {t.id_tipo_especial: t.tipo_especial for t in res_tipos.scalars().all()}
        
        res_estados = await session.execute(select(EstadoSolicitudPerfil))
        estados_dict = {e.id_estado: e.descripcion for e in res_estados.scalars().all()}
        
        # Extraer y normalizar documentos para consulta en bloque
        docs_to_check = []
        for _, row in df.iterrows():
            d = str(row["documento"]).strip()
            if d.endswith(".0"):
                d = d[:-2]
            d = d.upper()
            if d:
                docs_to_check.append(d)
                
        existing_profiles = {}
        if docs_to_check:
            chunk_size = 1000
            for i in range(0, len(docs_to_check), chunk_size):
                chunk = docs_to_check[i:i + chunk_size]
                res_dup = await session.execute(
                    select(
                        PerfilEspecial.cedula_identidad,
                        PerfilEspecial.id_tipo_perfil,
                        PerfilEspecial.fecha_solicitud,
                        PerfilEspecial.id_estado_solicitud,
                        PerfilEspecial.Lote
                    )
                    .where(PerfilEspecial.cedula_identidad.in_(chunk))
                    .order_by(PerfilEspecial.fecha_solicitud.desc().nulls_last())
                )
                for c_doc, c_tipo, c_fecha, c_estado, c_lote in res_dup.all():
                    if c_doc:
                        c_doc_str = str(c_doc).strip().upper()
                        if c_doc_str not in existing_profiles:
                            existing_profiles[c_doc_str] = {
                                "id_tipo_perfil": c_tipo,
                                "fecha_solicitud": c_fecha,
                                "id_estado_solicitud": c_estado,
                                "lote": c_lote
                            }
                        
        rejected_rows = []
        seen_docs = set()
        added_count = 0
        local_time = datetime.now()
        
        for index, row in df.iterrows():
            row_dict = row.to_dict()
            doc = str(row["documento"]).strip()
            if doc.endswith(".0"):
                doc = doc[:-2]
            doc = doc.upper()
            row_dict["documento"] = doc
            
            if not doc:
                row_dict["motivo_rechazo"] = "Documento vacío"
                row_dict["observacion"] = "La fila no contiene un número de documento válido"
                rejected_rows.append(row_dict)
                continue
                
            if doc in seen_docs:
                row_dict["motivo_rechazo"] = "Documento duplicado en el mismo archivo"
                row_dict["observacion"] = "El número de documento ya fue listado en una fila anterior de esta misma planilla"
                rejected_rows.append(row_dict)
                continue
            seen_docs.add(doc)
                
            try:
                tipo_perfil_final = int(float(str(row["id_tipo_perfil"]).strip()))
            except ValueError:
                row_dict["motivo_rechazo"] = "Tipo de perfil inválido o no numérico"
                row_dict["observacion"] = f"El valor '{row.get('id_tipo_perfil')}' no es un identificador numérico de perfil válido"
                rejected_rows.append(row_dict)
                continue
            
            if not is_admin:
                if user and user.id_organismo == 2:
                    tipo_perfil_final = 3
                elif user and user.id_organismo == 3:
                    if tipo_perfil_final not in [4, 5]:
                        row_dict["motivo_rechazo"] = "Tipo de perfil no permitido para su organismo (solo 4 o 5)"
                        row_dict["observacion"] = f"El tipo de perfil {tipo_perfil_final} no está autorizado para su organismo (solo se permiten tipos 4 o 5)"
                        rejected_rows.append(row_dict)
                        continue
                        
            if doc in existing_profiles:
                prev = existing_profiles[doc]
                row_dict["motivo_rechazo"] = "Documento duplicado"
                row_dict["observacion"] = format_duplicado_observacion(prev, tipos_dict, estados_dict)
                rejected_rows.append(row_dict)
            else:
                lote_val = str(row["lote"]).strip().upper()
                lote_final = lote_val if lote_val and lote_val != "NAN" else None
                
                nuevo = PerfilEspecial(
                    nombre_apellido=f"{row['nombres']} {row['apellidos']}".upper(),
                    cedula_identidad=doc,
                    id_tipo_perfil=tipo_perfil_final,
                    Lote=lote_final,
                    id_estado_solicitud=1,
                    fecha_solicitud=local_time,
                    id_usuario_carga=final_user_id,
                    ip_origen=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent"),
                    device_id=device_id,
                    id_evidencia=evidencia.id_evidencia
                )
                session.add(nuevo)
                added_count += 1
                existing_profiles[doc] = {
                    "id_tipo_perfil": tipo_perfil_final,
                    "fecha_solicitud": local_time,
                    "id_estado_solicitud": 1,
                    "lote": lote_final
                }
                
        await session.commit()
    except Exception as e:
        await session.rollback()
        import traceback
        print("ERROR DURANTE PROCESAMIENTO O COMMIT:", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error en base de datos al procesar o guardar perfiles: {str(e)}")
        

    if added_count > 0:
        await log_activity(
            session=session,
            request=request,
            current_user=current_user,
            action="import",
            table="perfiles_especiales",
            details=f"Se importaron {added_count} perfiles desde Excel."
        )
    
    if rejected_rows:
        rejected_df = pd.DataFrame(rejected_rows)
        stream = io.BytesIO()
        with pd.ExcelWriter(stream, engine='openpyxl') as writer:
            rejected_df.to_excel(writer, index=False)
        stream.seek(0)
        
        return StreamingResponse(
            stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=rechazados.xlsx"}
        )
        
    return {"message": "Importación exitosa. No hubo registros duplicados ni errores."}

@router.get("/unverified", response_model=List[PerfilEspecialResponse])
async def get_unverified(
    current_user: dict = Depends(get_current_user), # En un entorno real, Depends(check_permission("admin"))
    session: AsyncSession = Depends(get_session)
):
    """Listar beneficiarios sin verificar."""
    # Validación simple de rol, si es admin
    if current_user.get("role") not in ["admin", "sysadmin"]:
         raise HTTPException(status_code=403, detail="No autorizado")

    result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.id_estado_solicitud == 1))
    perfiles = result.scalars().all()
    
    # Pre-cargar relaciones
    res_tipos = await session.execute(select(TipoPerfilEspecial))
    tipos_dict = {t.id_tipo_especial: t for t in res_tipos.scalars().all()}
    
    res_usuarios = await session.execute(select(Usuario))
    usuarios_dict = {u.id: u for u in res_usuarios.scalars().all()}
    
    res_estados = await session.execute(select(EstadoSolicitudPerfil))
    estados_dict = {e.id_estado: e for e in res_estados.scalars().all()}
    
    for p in perfiles:
        p.tipo_perfil = tipos_dict.get(p.id_tipo_perfil)
        p.usuario_carga = usuarios_dict.get(p.id_usuario_carga)
        p.usuario_verif = usuarios_dict.get(p.id_usuario_verif)
        p.usuario_aprob = usuarios_dict.get(p.id_usuario_aprob)
        p.estado_solicitud = estados_dict.get(p.id_estado_solicitud)
        p.observaciones = []
        
    return perfiles

@router.put("/validate")
async def validate_perfiles(
    request: Request,
    ids: List[int],
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Marcar perfiles como verificados."""
    if current_user.get("role") not in ["admin", "sysadmin"]:
         raise HTTPException(status_code=403, detail="No autorizado")

    result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.orden.in_(ids)))
    perfiles = result.scalars().all()
    
    for p in perfiles:
        p.id_estado_solicitud = 2
        p.fecha_verificacion = datetime.now()
        p.id_usuario_verif = current_user["user_id"]
        
    await session.commit()
    
    if perfiles:
        await log_activity(
            session=session,
            request=request,
            current_user=current_user,
            action="update",
            table="perfiles_especiales",
            details=f"Se verificaron {len(perfiles)} perfiles."
        )
        
    return {"message": f"{len(perfiles)} perfiles verificados exitosamente."}

@router.get("/pending_approval", response_model=List[PerfilEspecialResponse])
async def get_pending_approval(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Listar beneficiarios verificados pendientes de aprobación."""
    if current_user.get("role") not in ["admin", "sysadmin", "manager"]:
         raise HTTPException(status_code=403, detail="No autorizado")

    result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.id_estado_solicitud == 2))
    perfiles = result.scalars().all()
    
    # Pre-cargar relaciones
    res_tipos = await session.execute(select(TipoPerfilEspecial))
    tipos_dict = {t.id_tipo_especial: t for t in res_tipos.scalars().all()}
    
    res_usuarios = await session.execute(select(Usuario))
    usuarios_dict = {u.id: u for u in res_usuarios.scalars().all()}
    
    res_estados = await session.execute(select(EstadoSolicitudPerfil))
    estados_dict = {e.id_estado: e for e in res_estados.scalars().all()}
    
    for p in perfiles:
        p.tipo_perfil = tipos_dict.get(p.id_tipo_perfil)
        p.usuario_carga = usuarios_dict.get(p.id_usuario_carga)
        p.usuario_verif = usuarios_dict.get(p.id_usuario_verif)
        p.usuario_aprob = usuarios_dict.get(p.id_usuario_aprob)
        p.estado_solicitud = estados_dict.get(p.id_estado_solicitud)
        p.observaciones = []
        
    return perfiles

@router.get("/pending_emission")
async def get_pending_emission(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Listar beneficiarios aprobados pendientes de emisión por correo."""
    if current_user.get("role") not in ["admin", "sysadmin", "manager"]:
         raise HTTPException(status_code=403, detail="No autorizado")

    result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.id_estado_solicitud == 3))
    perfiles = result.scalars().all()
    
    # Pre-cargar relaciones
    res_tipos = await session.execute(select(TipoPerfilEspecial))
    tipos_dict = {t.id_tipo_especial: t for t in res_tipos.scalars().all()}
    
    res_usuarios = await session.execute(select(Usuario))
    usuarios_dict = {u.id: u for u in res_usuarios.scalars().all()}
    
    res_estados = await session.execute(select(EstadoSolicitudPerfil))
    estados_dict = {e.id_estado: e for e in res_estados.scalars().all()}
    
    for p in perfiles:
        p.tipo_perfil = tipos_dict.get(p.id_tipo_perfil)
        p.usuario_carga = usuarios_dict.get(p.id_usuario_carga)
        p.usuario_verif = usuarios_dict.get(p.id_usuario_verif)
        p.usuario_aprob = usuarios_dict.get(p.id_usuario_aprob)
        p.estado_solicitud = estados_dict.get(p.id_estado_solicitud)
        
    return perfiles

from pydantic import BaseModel
class ApproveRequest(BaseModel):
    ids: List[int]
    device_id: Optional[str] = None

@router.put("/approve")
async def approve_perfiles(
    request: Request,
    payload: ApproveRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Marcar perfiles como aprobados."""
    if current_user.get("role") not in ["admin", "sysadmin", "manager"]:
         raise HTTPException(status_code=403, detail="No autorizado")

    result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.orden.in_(payload.ids)))
    perfiles = result.scalars().all()
    
    ip_aprobo = request.client.host if request.client else None
    
    for p in perfiles:
        p.id_estado_solicitud = 3 # Aprobado
        p.fecha_aprobacion = datetime.now()
        p.id_usuario_aprob = current_user["user_id"]
        p.ip_aprobo = ip_aprobo
        p.device_id_aprobo = payload.device_id
        
    await session.commit()
    
    if perfiles:
        await log_activity(
            session=session,
            request=request,
            current_user=current_user,
            action="update",
            table="perfiles_especiales",
            details=f"Se aprobaron {len(perfiles)} perfiles."
        )
        
    return {"message": f"{len(perfiles)} perfiles aprobados exitosamente."}


@router.post("/send_email")
async def send_perfiles_email(
    background_tasks: BackgroundTasks,
    request: Request,
    correos: str = Form(...), # Correos separados por coma
    cantidad_por_correo: int = Form(1500),
    asunto: str = Form(None),
    cuerpo: str = Form(None),
    eps: str = Form(...),
    ids: str = Form(...),
    comentario: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Enviar perfiles seleccionados por correo en lotes y marcarlos como emitidos."""
    if current_user.get("role") not in ["admin", "sysadmin"]:
         raise HTTPException(status_code=403, detail="No autorizado")
         
    id_list = [int(i.strip()) for i in ids.split(",") if i.strip()]
    if not id_list:
        raise HTTPException(status_code=400, detail="No se seleccionaron perfiles para enviar.")

    correos_list = [c.strip() for c in correos.split(",") if c.strip()]
    if not correos_list:
        raise HTTPException(status_code=400, detail="Debe proveer al menos un correo válido.")

    # Traer los seleccionados
    result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.orden.in_(id_list)))
    perfiles = result.scalars().all()
    
    if not perfiles:
        raise HTTPException(status_code=400, detail="No se encontraron los perfiles especificados.")
        
    ahora = datetime.now()
    data = []
    for p in perfiles:
        p.id_estado_solicitud = 6 # Remitido a EPS (en espera de impresión física de tarjeta)
        p.fecha_remision_eps = ahora
        p.eps = eps
        
        if comentario and comentario.strip():
            nueva_obs = PerfilObservacion(
                orden=p.orden,
                observacion=f"[Remisión a EPS {eps}]: {comentario.strip()}",
                id_usuario=current_user["user_id"],
                fecha_creacion=ahora,
                atendido=True,
                resuelto=True
            )
            session.add(nueva_obs)
        
        data.append({
            "Nombre y Apellido": p.nombre_apellido,
            "Documento": p.cedula_identidad,
            "Lote": p.Lote,
            "TipoPerfil ID": p.id_tipo_perfil,
            "Estado ID": p.id_estado_solicitud,
            "EPS": p.eps
        })
        
    await session.commit()

    await log_activity(
        session=session,
        request=request,
        current_user=current_user,
        action="send_email",
        table="perfiles_especiales",
        details=f"Remisión a EPS {eps} de {len(perfiles)} perfiles."
    )
        
    df = pd.DataFrame(data)
    total = len(df)
    
    def process_and_send():
        chunks = math.ceil(total / cantidad_por_correo)
        for i in range(chunks):
            start = i * cantidad_por_correo
            end = start + cantidad_por_correo
            chunk_df = df.iloc[start:end]
            
            stream = io.BytesIO()
            with pd.ExcelWriter(stream, engine='openpyxl') as writer:
                chunk_df.to_excel(writer, index=False)
            content = stream.getvalue()
            
            correo_destino = correos_list[i % len(correos_list)]
            
            attachments = [{
                'filename': f'perfiles_verificados_lote_{i+1}.xlsx',
                'content': content,
                'content_type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }]
            
            final_subject = asunto if asunto else f"Listado de Perfiles Verificados - Lote {i+1}"
            final_body = cuerpo if cuerpo else f"Adjunto encontrará el lote {i+1} de perfiles verificados (Total en este archivo: {len(chunk_df)})."
            
            email_service.send_email(
                to_email=correo_destino,
                subject=final_subject,
                body=final_body,
                attachments=attachments
            )
            
    background_tasks.add_task(process_and_send)
    return {"message": "El envío de correos se ha iniciado en segundo plano."}

@router.post("/resend_email")
async def resend_perfiles_email(
    background_tasks: BackgroundTasks,
    request: Request,
    correos: str = Form(...), # Correos separados por coma
    cantidad_por_correo: int = Form(1500),
    asunto: str = Form(None),
    cuerpo: str = Form(None),
    eps: str = Form(...),
    ids: Optional[str] = Form(None), # IDs separados por coma
    lote: Optional[str] = Form(None), # Nombre del lote
    solo_pendientes_impresion: bool = Form(False), # Si true, solo los que aún no tienen tarjeta/serial
    motivo: str = Form(...), # Motivo obligatorio del reenvío
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    Reenviar solicitud a la EPS para perfiles específicos o todo un lote:
    - Actualiza fecha_remision_eps = datetime.now()
    - Actualiza eps = eps
    - Si el perfil no tiene tarjeta emitida/entregada, asegura estado 6 (Remitido a EPS)
    - Registra automáticamente una observación en 'perfiles_observaciones':
      '[Reenvío de solicitud a EPS {eps}]: {motivo}'
    - Genera el Excel de reenvío y envía los correos en segundo plano a la EPS
    - Registra log de auditoría
    """
    if current_user.get("role") not in ["admin", "sysadmin"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    motivo_clean = motivo.strip() if motivo else ""
    if not motivo_clean:
        raise HTTPException(status_code=400, detail="Debe especificar el motivo o comentario del reenvío.")

    correos_list = [c.strip() for c in correos.split(",") if c.strip()]
    if not correos_list:
        raise HTTPException(status_code=400, detail="Debe proveer al menos un correo válido.")

    # Obtener perfiles según ids o lote
    if ids and ids.strip():
        id_list = [int(i.strip()) for i in ids.split(",") if i.strip()]
        result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.orden.in_(id_list)))
        perfiles = result.scalars().all()
    elif lote and lote.strip():
        lote_clean = lote.strip()
        q = select(PerfilEspecial).where(func.trim(PerfilEspecial.Lote) == lote_clean)
        if solo_pendientes_impresion:
            q = q.where(or_(PerfilEspecial.serial_mdp.is_(None), func.trim(PerfilEspecial.serial_mdp) == ''))
        result = await session.execute(q)
        perfiles = result.scalars().all()
    else:
        raise HTTPException(status_code=400, detail="Debe indicar 'ids' o 'lote' para el reenvío.")

    if not perfiles:
        raise HTTPException(status_code=404, detail="No se encontraron perfiles que coincidan con los criterios para reenviar.")

    ahora = datetime.now()
    data = []
    obs_texto = f"[Reenvío de solicitud a EPS {eps}]: {motivo_clean}"

    for p in perfiles:
        if p.id_estado_solicitud not in [5, 7]:
            p.id_estado_solicitud = 6 # Remitido a EPS
        p.fecha_remision_eps = ahora
        p.eps = eps

        # Registrar automáticamente el comentario en el perfil
        nueva_obs = PerfilObservacion(
            orden=p.orden,
            observacion=obs_texto,
            id_usuario=current_user["user_id"],
            fecha_creacion=ahora,
            atendido=True,
            resuelto=True
        )
        session.add(nueva_obs)

        data.append({
            "Nombre y Apellido": p.nombre_apellido,
            "Documento": p.cedula_identidad,
            "Lote": p.Lote,
            "TipoPerfil ID": p.id_tipo_perfil,
            "Estado ID": p.id_estado_solicitud,
            "EPS": p.eps,
            "Fecha Reenvío": ahora.strftime("%d/%m/%Y %H:%M")
        })

    await session.commit()

    # Log de auditoría
    await log_activity(
        session=session,
        request=request,
        current_user=current_user,
        action="resend_email",
        table="perfiles_especiales",
        details=f"Reenvío de solicitud a EPS {eps} para {len(perfiles)} perfiles. Motivo: {motivo_clean}"
    )

    df = pd.DataFrame(data)
    total = len(df)

    def process_and_send():
        chunks = math.ceil(total / cantidad_por_correo)
        for i in range(chunks):
            start = i * cantidad_por_correo
            end = start + cantidad_por_correo
            chunk_df = df.iloc[start:end]

            stream = io.BytesIO()
            with pd.ExcelWriter(stream, engine='openpyxl') as writer:
                chunk_df.to_excel(writer, index=False)
            content = stream.getvalue()

            correo_destino = correos_list[i % len(correos_list)]

            attachments = [{
                'filename': f'reiteracion_solicitud_eps_{i+1}.xlsx',
                'content': content,
                'content_type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }]

            final_subject = asunto if asunto else f"[Reiteración] Solicitud de Impresión a EPS {eps} - Parte {i+1}"
            final_body = cuerpo if cuerpo else f"Adjunto encontrará la reiteración/reenvío de solicitud para impresión de {len(chunk_df)} perfiles.\n\nMotivo del Reenvío: {motivo_clean}"

            email_service.send_email(
                to_email=correo_destino,
                subject=final_subject,
                body=final_body,
                attachments=attachments
            )

    background_tasks.add_task(process_and_send)
    return {"message": f"Se ha encolado exitosamente el reenvío de solicitud a la EPS {eps} para {len(perfiles)} perfiles."}

@router.get("/evidencias")
async def get_evidencias(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Obtener el historial de importaciones (Solo Admin)."""
    if current_user.get("role") not in ["admin", "sysadmin"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    # Obtener todas las evidencias
    query = select(EvidenciaImportacion).order_by(EvidenciaImportacion.fecha_importacion.desc())
    result = await session.execute(query)
    evidencias = result.scalars().all()
    
    # Contar perfiles por evidencia
    from sqlalchemy import func
    count_query = select(PerfilEspecial.id_evidencia, func.count(PerfilEspecial.orden)).group_by(PerfilEspecial.id_evidencia)
    count_result = await session.execute(count_query)
    counts = {row[0]: row[1] for row in count_result.all()}
    
    response = []
    for ev in evidencias:
        response.append({
            "id_evidencia": ev.id_evidencia,
            "nombre_archivo": ev.nombre_archivo,
            "fecha_importacion": ev.fecha_importacion,
            "id_usuario": ev.id_usuario,
            "cantidad_perfiles": counts.get(ev.id_evidencia, 0)
        })
        
    return response

@router.get("/evidencias/{id_evidencia}/download")
async def download_evidencia(
    id_evidencia: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Descargar el archivo Excel original de una importación (Solo Admin)."""
    if current_user.get("role") not in ["admin", "sysadmin"]:
        raise HTTPException(status_code=403, detail="No autorizado")
        
    result = await session.execute(select(EvidenciaImportacion).where(EvidenciaImportacion.id_evidencia == id_evidencia))
    evidencia = result.scalar_one_or_none()
    
    if not evidencia:
        raise HTTPException(status_code=404, detail="Evidencia no encontrada")
        
    stream = io.BytesIO(evidencia.archivo_binario)
    
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={evidencia.nombre_archivo}"}
    )

@router.delete("/evidencias/{id_evidencia}")
async def delete_evidencia(
    id_evidencia: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Eliminar una importación y todos sus perfiles asociados (Solo Admin)."""
    if current_user.get("role") not in ["admin", "sysadmin"]:
        raise HTTPException(status_code=403, detail="No autorizado")
        
    # Verificar que exista la evidencia
    result = await session.execute(select(EvidenciaImportacion).where(EvidenciaImportacion.id_evidencia == id_evidencia))
    evidencia = result.scalar_one_or_none()
    
    if not evidencia:
        raise HTTPException(status_code=404, detail="Evidencia no encontrada")
        
    # Buscar perfiles asociados
    perfiles_result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.id_evidencia == id_evidencia))
    perfiles = perfiles_result.scalars().all()
    
    # Eliminar perfiles
    for p in perfiles:
        await session.delete(p)
        
    # Eliminar la evidencia
    await session.delete(evidencia)
    
    await session.commit()
    
    return {"message": f"Se ha eliminado la importación y sus {len(perfiles)} perfiles asociados."}

@router.put("/{orden}/serial_mdp", response_model=PerfilEspecialResponse)
async def update_serial_mdp(
    orden: int,
    payload: SerialUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    Actualiza el Serial MDP de un perfil y cambia su estado a 'Emitido' (5).
    Solo para administradores y sysadmins.
    """
    if current_user.get("role") not in ["admin", "sysadmin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos para modificar el serial.")

    result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.orden == orden))
    perfil = result.scalar_one_or_none()
    
    if not perfil:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
        
    perfil.serial_mdp = payload.serial_mdp
    if perfil.id_estado_solicitud != 7:
        perfil.id_estado_solicitud = 5 # Emitido
    if not perfil.fecha_emision:
        perfil.fecha_emision = datetime.now()
    
    await session.commit()
    await session.refresh(perfil)
    
    # Pre-cargar relaciones para la respuesta
    res_tipo = await session.execute(select(TipoPerfilEspecial).where(TipoPerfilEspecial.id_tipo_especial == perfil.id_tipo_perfil))
    perfil.tipo_perfil = res_tipo.scalar_one_or_none()
    
    res_usu_carga = await session.execute(select(Usuario).where(Usuario.id == perfil.id_usuario_carga))
    perfil.usuario_carga = res_usu_carga.scalar_one_or_none()
    
    res_usu_verif = await session.execute(select(Usuario).where(Usuario.id == perfil.id_usuario_verif))
    perfil.usuario_verif = res_usu_verif.scalar_one_or_none()

    res_usu_aprob = await session.execute(select(Usuario).where(Usuario.id == perfil.id_usuario_aprob))
    perfil.usuario_aprob = res_usu_aprob.scalar_one_or_none()

    res_usu_entrega = await session.execute(select(Usuario).where(Usuario.id == perfil.id_usuario_entrega))
    perfil.usuario_entrega = res_usu_entrega.scalar_one_or_none()
    
    res_estado = await session.execute(select(EstadoSolicitudPerfil).where(EstadoSolicitudPerfil.id_estado == perfil.id_estado_solicitud))
    perfil.estado_solicitud = res_estado.scalar_one_or_none()
    
    return perfil

@router.get("/estados", response_model=List[EstadoSolicitudResponse])
async def get_estados_solicitud(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Listado de todos los estados de solicitud posibles para tarjetas."""
    result = await session.execute(select(EstadoSolicitudPerfil).order_by(EstadoSolicitudPerfil.id_estado))
    return result.scalars().all()

@router.put("/{orden}/estado", response_model=PerfilEspecialResponse)
async def update_estado_perfil(
    orden: int,
    payload: EstadoUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    Modifica el estado de una tarjeta/perfil especial.
    Solo para administradores y sysadmins.
    Registra auditoría y opcionalmente añade una observación explicativa del motivo.
    """
    if current_user.get("role") not in ["admin", "sysadmin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos para modificar el estado.")
        
    result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.orden == orden))
    perfil = result.scalar_one_or_none()
    
    if not perfil:
        raise HTTPException(status_code=404, detail="Tarjeta / Perfil no encontrado")
        
    estado_ant_id = perfil.id_estado_solicitud
    nuevo_estado_id = payload.id_estado
    
    # Validar que exista el nuevo estado
    res_est = await session.execute(select(EstadoSolicitudPerfil).where(EstadoSolicitudPerfil.id_estado == nuevo_estado_id))
    nuevo_estado = res_est.scalar_one_or_none()
    if not nuevo_estado:
        raise HTTPException(status_code=400, detail="El estado especificado no existe.")
        
    # Obtener descripción estado anterior
    res_est_ant = await session.execute(select(EstadoSolicitudPerfil).where(EstadoSolicitudPerfil.id_estado == estado_ant_id))
    estado_ant = res_est_ant.scalar_one_or_none()
    desc_ant = estado_ant.descripcion if estado_ant else str(estado_ant_id)
    
    # Actualizar estado y campos de trazabilidad correspondientes
    perfil.id_estado_solicitud = nuevo_estado_id
    ahora = datetime.now()
    
    if nuevo_estado_id == 2 and not perfil.fecha_verificacion:
        perfil.fecha_verificacion = ahora
        perfil.id_usuario_verif = current_user["user_id"]
    elif nuevo_estado_id == 3 and not perfil.fecha_aprobacion:
        perfil.fecha_aprobacion = ahora
        perfil.id_usuario_aprob = current_user["user_id"]
        perfil.ip_aprobo = request.client.host if request.client else None
    elif nuevo_estado_id == 6 and not perfil.fecha_remision_eps:
        perfil.fecha_remision_eps = ahora
    elif nuevo_estado_id == 5 and not perfil.fecha_emision:
        perfil.fecha_emision = ahora
    elif nuevo_estado_id == 7:
        if not perfil.fecha_entrega:
            perfil.fecha_entrega = ahora
        perfil.id_usuario_entrega = current_user["user_id"]
        if payload.entregado_a:
            perfil.entregado_a = payload.entregado_a.strip()
        
    # Si se especificó un motivo, registrar observación
    if payload.motivo and payload.motivo.strip():
        obs_texto = f"[Cambio de estado: {desc_ant} ➔ {nuevo_estado.descripcion}]: {payload.motivo.strip()}"
        nueva_obs = PerfilObservacion(
            orden=perfil.orden,
            observacion=obs_texto,
            id_usuario=current_user["user_id"],
            fecha_creacion=ahora,
            atendido=True,
            resuelto=True
        )
        session.add(nueva_obs)
        
    await session.commit()
    await session.refresh(perfil)
    
    # Registrar log de auditoría
    await log_activity(
        session=session,
        request=request,
        current_user=current_user,
        action="update_status",
        table="perfiles_especiales",
        record_id=perfil.orden,
        previous_data={"id_estado_solicitud": estado_ant_id, "estado": desc_ant},
        new_data={"id_estado_solicitud": nuevo_estado_id, "estado": nuevo_estado.descripcion},
        details=f"Cambio manual de estado de {desc_ant} a {nuevo_estado.descripcion}. Motivo: {payload.motivo or 'Sin motivo'}"
    )
    
    # Pre-cargar relaciones para la respuesta
    res_tipo = await session.execute(select(TipoPerfilEspecial).where(TipoPerfilEspecial.id_tipo_especial == perfil.id_tipo_perfil))
    perfil.tipo_perfil = res_tipo.scalar_one_or_none()
    
    res_usu_carga = await session.execute(select(Usuario).where(Usuario.id == perfil.id_usuario_carga))
    perfil.usuario_carga = res_usu_carga.scalar_one_or_none()
    
    res_usu_verif = await session.execute(select(Usuario).where(Usuario.id == perfil.id_usuario_verif))
    perfil.usuario_verif = res_usu_verif.scalar_one_or_none()
    
    res_usu_aprob = await session.execute(select(Usuario).where(Usuario.id == perfil.id_usuario_aprob))
    perfil.usuario_aprob = res_usu_aprob.scalar_one_or_none()

    res_usu_entrega = await session.execute(select(Usuario).where(Usuario.id == perfil.id_usuario_entrega))
    perfil.usuario_entrega = res_usu_entrega.scalar_one_or_none()
    
    perfil.estado_solicitud = nuevo_estado
    
    # Cargar observaciones
    res_obs = await session.execute(
        select(PerfilObservacion)
        .where(PerfilObservacion.orden == perfil.orden)
        .order_by(PerfilObservacion.fecha_creacion.desc())
    )
    obs_list = res_obs.scalars().all()
    if obs_list:
        user_ids = list({o.id_usuario for o in obs_list})
        res_usuarios = await session.execute(select(Usuario).where(Usuario.id.in_(user_ids)))
        usr_dict = {u.id: u for u in res_usuarios.scalars().all()}
        for o in obs_list:
            o.usuario = usr_dict.get(o.id_usuario)
    perfil.observaciones = obs_list
    
    return perfil

@router.get("/{orden}/trazabilidad")
async def get_trazabilidad_perfil(
    orden: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    Obtiene la trazabilidad completa del ciclo de vida de una tarjeta/perfil:
    - Información del beneficiario y tarjeta
    - Datos de carga/origen (archivo Excel de importación, usuario, fecha)
    - Verificación (usuario, fecha)
    - Aprobación (usuario, fecha, IP, Device ID)
    - Emisión a EPS (fecha, EPS destino, Serial MDP)
    - Historial de observaciones y notas
    """
    result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.orden == orden))
    perfil = result.scalar_one_or_none()
    
    if not perfil:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
        
    # Pre-cargar relaciones
    res_tipo = await session.execute(select(TipoPerfilEspecial).where(TipoPerfilEspecial.id_tipo_especial == perfil.id_tipo_perfil))
    tipo_perfil = res_tipo.scalar_one_or_none()
    
    res_estado = await session.execute(select(EstadoSolicitudPerfil).where(EstadoSolicitudPerfil.id_estado == perfil.id_estado_solicitud))
    estado = res_estado.scalar_one_or_none()
    
    res_usu_carga = await session.execute(select(Usuario).where(Usuario.id == perfil.id_usuario_carga))
    usu_carga = res_usu_carga.scalar_one_or_none()
    
    res_usu_verif = await session.execute(select(Usuario).where(Usuario.id == perfil.id_usuario_verif))
    usu_verif = res_usu_verif.scalar_one_or_none()
    
    res_usu_aprob = await session.execute(select(Usuario).where(Usuario.id == perfil.id_usuario_aprob))
    usu_aprob = res_usu_aprob.scalar_one_or_none()

    res_usu_entrega = await session.execute(select(Usuario).where(Usuario.id == perfil.id_usuario_entrega))
    usu_entrega = res_usu_entrega.scalar_one_or_none()
    
    evidencia = None
    if perfil.id_evidencia:
        res_ev = await session.execute(select(EvidenciaImportacion).where(EvidenciaImportacion.id_evidencia == perfil.id_evidencia))
        ev = res_ev.scalar_one_or_none()
        if ev:
            evidencia = {
                "id_evidencia": ev.id_evidencia,
                "nombre_archivo": ev.nombre_archivo,
                "fecha_importacion": ev.fecha_importacion,
                "ip_origen": ev.ip_origen
            }
            
    # Observaciones
    res_obs = await session.execute(
        select(PerfilObservacion)
        .where(PerfilObservacion.orden == perfil.orden)
        .order_by(PerfilObservacion.fecha_creacion.desc())
    )
    obs_list = res_obs.scalars().all()
    obs_response = []
    if obs_list:
        user_ids = list({o.id_usuario for o in obs_list})
        res_usuarios = await session.execute(select(Usuario).where(Usuario.id.in_(user_ids)))
        usr_dict = {u.id: u for u in res_usuarios.scalars().all()}
        for o in obs_list:
            u_info = usr_dict.get(o.id_usuario)
            obs_response.append({
                "id_observacion": o.id_observacion,
                "observacion": o.observacion,
                "fecha_creacion": o.fecha_creacion,
                "atendido": o.atendido,
                "resuelto": o.resuelto,
                "usuario": {"id": u_info.id, "nombre_completo": u_info.nombre_completo} if u_info else None
            })
            
    return {
        "orden": perfil.orden,
        "cedula_identidad": perfil.cedula_identidad,
        "nombre_apellido": perfil.nombre_apellido,
        "institucion": perfil.institucion,
        "Lote": perfil.Lote,
        "eps": perfil.eps,
        "serial_mdp": perfil.serial_mdp,
        "tipo_perfil": {
            "id_tipo_especial": tipo_perfil.id_tipo_especial,
            "tipo_especial": tipo_perfil.tipo_especial
        } if tipo_perfil else None,
        "estado_solicitud": {
            "id_estado": estado.id_estado,
            "descripcion": estado.descripcion
        } if estado else {"id_estado": perfil.id_estado_solicitud, "descripcion": "Desconocido"},
        "ciclo_vida": {
            "solicitud": {
                "fecha": perfil.fecha_solicitud,
                "usuario": {"id": usu_carga.id, "nombre_completo": usu_carga.nombre_completo} if usu_carga else None,
                "evidencia": evidencia,
                "ip_origen": perfil.ip_origen,
                "user_agent": perfil.user_agent
            },
            "verificacion": {
                "fecha": perfil.fecha_verificacion,
                "usuario": {"id": usu_verif.id, "nombre_completo": usu_verif.nombre_completo} if usu_verif else None
            },
            "aprobacion": {
                "fecha": perfil.fecha_aprobacion,
                "usuario": {"id": usu_aprob.id, "nombre_completo": usu_aprob.nombre_completo} if usu_aprob else None,
                "ip_aprobo": perfil.ip_aprobo,
                "device_id_aprobo": perfil.device_id_aprobo
            },
            "remision_eps": {
                "fecha": perfil.fecha_remision_eps,
                "eps": perfil.eps
            },
            "emision": {
                "fecha": perfil.fecha_emision,
                "serial_mdp": perfil.serial_mdp
            },
            "entrega": {
                "fecha": perfil.fecha_entrega,
                "entregado_a": perfil.entregado_a,
                "usuario": {"id": usu_entrega.id, "nombre_completo": usu_entrega.nombre_completo} if usu_entrega else None
            }
        },
        "fecha_entrega": perfil.fecha_entrega,
        "entregado_a": perfil.entregado_a,
        "usuario_entrega": {"id": usu_entrega.id, "nombre_completo": usu_entrega.nombre_completo} if usu_entrega else None,
        "observaciones": obs_response
    }

@router.get("/{orden}/observaciones", response_model=List[PerfilObservacionResponse])
async def get_observaciones_perfil(
    orden: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    Obtiene todas las observaciones de una tarjeta/perfil ordenadas de más reciente a más antigua.
    """
    try:
        result = await session.execute(
            select(PerfilObservacion)
            .where(PerfilObservacion.orden == orden)
            .order_by(PerfilObservacion.fecha_creacion.desc())
        )
        observaciones = result.scalars().all()
    except Exception as e:
        print(f"Advertencia: no se pudo consultar observaciones: {e}")
        return []
    
    # Pre-cargar usuario autor
    if observaciones:
        user_ids = list({o.id_usuario for o in observaciones})
        res_usuarios = await session.execute(select(Usuario).where(Usuario.id.in_(user_ids)))
        usr_dict = {u.id: u for u in res_usuarios.scalars().all()}
        for o in observaciones:
            o.usuario = usr_dict.get(o.id_usuario)
            
    return observaciones

@router.post("/{orden}/observaciones", response_model=PerfilObservacionResponse)
async def create_observacion_perfil(
    orden: int,
    payload: PerfilObservacionCreate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    Carga una nueva observación para la tarjeta/perfil.
    Registra automáticamente el usuario actual y la fecha de creación.
    """
    texto = payload.observacion.strip()
    if not texto:
        raise HTTPException(status_code=400, detail="La observación no puede estar vacía")

    # Verificar que el perfil exista
    res_perfil = await session.execute(select(PerfilEspecial).where(PerfilEspecial.orden == orden))
    perfil = res_perfil.scalar_one_or_none()
    if not perfil:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    nueva_obs = PerfilObservacion(
        orden=orden,
        observacion=texto,
        id_usuario=current_user["user_id"],
        fecha_creacion=datetime.now()
    )
    session.add(nueva_obs)
    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        # Si la tabla no existe en la base de datos, crearla automáticamente y reintentar
        if "perfiles_observaciones" in str(e).lower() or "undefinedtable" in str(e).lower() or "does not exist" in str(e).lower() or "invalidforeignkey" in str(e).lower():
            from sqlalchemy import text
            await session.execute(text("CREATE SCHEMA IF NOT EXISTS perfiles_especiales;"))
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS perfiles_especiales.perfiles_observaciones (
                    id_observacion SERIAL PRIMARY KEY,
                    orden INTEGER NOT NULL,
                    observacion TEXT NOT NULL,
                    fecha_creacion TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
                    id_usuario INTEGER NOT NULL REFERENCES sistema.usuarios(id),
                    atendido BOOLEAN DEFAULT FALSE,
                    resuelto BOOLEAN DEFAULT FALSE
                )
            """))
            await session.execute(text("CREATE INDEX IF NOT EXISTS idx_perfiles_obs_orden ON perfiles_especiales.perfiles_observaciones(orden)"))
            await session.commit()
            session.add(nueva_obs)
            await session.commit()
        else:
            raise e

    await session.refresh(nueva_obs)
    
    # Cargar datos del usuario creador
    res_u = await session.execute(select(Usuario).where(Usuario.id == current_user["user_id"]))
    nueva_obs.usuario = res_u.scalar_one_or_none()
    
    return nueva_obs

@router.patch("/observaciones/{id_observacion}", response_model=PerfilObservacionResponse)
async def update_observacion_status(
    id_observacion: int,
    payload: PerfilObservacionUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    Actualiza el estado de una observación: atendido, resuelto o texto.
    """
    result = await session.execute(select(PerfilObservacion).where(PerfilObservacion.id_observacion == id_observacion))
    obs = result.scalar_one_or_none()
    if not obs:
        raise HTTPException(status_code=404, detail="Observación no encontrada")

    if payload.atendido is not None:
        obs.atendido = payload.atendido
    if payload.resuelto is not None:
        obs.resuelto = payload.resuelto
    if payload.observacion is not None and payload.observacion.strip():
        obs.observacion = payload.observacion.strip()

    await session.commit()
    await session.refresh(obs)

    res_u = await session.execute(select(Usuario).where(Usuario.id == obs.id_usuario))
    obs.usuario = res_u.scalar_one_or_none()

    return obs



