from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_
from typing import List, Optional
import pandas as pd
import io
import math
from datetime import datetime

from models import PerfilEspecial, TipoPerfilEspecial, Usuario
from schemas import PerfilEspecialResponse
from security import get_current_user, check_permission
from database import get_session
from email_service import email_service
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/perfiles", tags=["Perfiles Especiales"])

@router.get("/", response_model=List[PerfilEspecialResponse])
async def get_perfiles(
    q: Optional[str] = None,
    documento: Optional[str] = None,
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
        
    if q:
        search_term = f"%{q}%"
        query = query.where(
            or_(
                PerfilEspecial.cedula_identidad.ilike(search_term),
                PerfilEspecial.nombre_apellido.ilike(search_term)
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
    
    # Asignar la relación desde el diccionario
    for p in perfiles:
        p.tipo_perfil = tipos_dict.get(p.id_tipo_perfil)
        p.usuario_carga = usuarios_dict.get(p.id_usuario_carga)
        
    return perfiles

@router.get("/template")
async def get_template(current_user: dict = Depends(get_current_user)):
    """Descargar plantilla Excel para importación."""
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
    
    res_user = await session.execute(select(Usuario).where(Usuario.id == current_user["user_id"]))
    user = res_user.scalar_one_or_none()
    
    rejected_rows = []
    
    for index, row in df.iterrows():
        doc = str(row["documento"]).strip()
        if not doc:
            row["motivo_rechazo"] = "Documento vacío"
            rejected_rows.append(row)
            continue
            
        tipo_perfil_excel = str(row["id_tipo_perfil"]).strip()
        tipo_perfil_final = int(tipo_perfil_excel) if tipo_perfil_excel.isdigit() else 1
        
        if user and user.id_organismo == 2:
            tipo_perfil_final = 3
        elif user and user.id_organismo == 3:
            if tipo_perfil_final not in [4, 5]:
                row["motivo_rechazo"] = "Tipo de perfil no permitido para su organismo (solo 4 o 5)"
                rejected_rows.append(row)
                continue
                
        res_dup = await session.execute(select(PerfilEspecial).where(PerfilEspecial.cedula_identidad == doc))
        dup = res_dup.scalar_one_or_none()
        
        if dup:
            row["motivo_rechazo"] = "Documento duplicado"
            rejected_rows.append(row)
            
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

@router.post("/import")
async def import_perfiles(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Importar perfiles desde Excel y devolver rechazados por duplicidad."""
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
    
    res_user = await session.execute(select(Usuario).where(Usuario.id == current_user["user_id"]))
    user = res_user.scalar_one_or_none()
    
    rejected_rows = []
    
    for index, row in df.iterrows():
        doc = str(row["documento"]).strip()
        if not doc:
            row["motivo_rechazo"] = "Documento vacío"
            rejected_rows.append(row)
            continue
            
        tipo_perfil_excel = str(row["id_tipo_perfil"]).strip()
        tipo_perfil_final = int(tipo_perfil_excel) if tipo_perfil_excel.isdigit() else 1
        
        if user and user.id_organismo == 2:
            tipo_perfil_final = 3
        elif user and user.id_organismo == 3:
            if tipo_perfil_final not in [4, 5]:
                row["motivo_rechazo"] = "Tipo de perfil no permitido para su organismo (solo 4 o 5)"
                rejected_rows.append(row)
                continue
                
        res_dup = await session.execute(select(PerfilEspecial).where(PerfilEspecial.cedula_identidad == doc))
        dup = res_dup.scalar_one_or_none()
        
        if dup:
            row["motivo_rechazo"] = "Documento duplicado"
            rejected_rows.append(row)
        else:
            nuevo = PerfilEspecial(
                nombre_apellido=f"{row['nombres']} {row['apellidos']}",
                cedula_identidad=doc,
                id_tipo_perfil=tipo_perfil_final,
                Lote=str(row["lote"]),
                verificado=False,
                id_usuario_carga=current_user["user_id"]
            )
            session.add(nuevo)
            
    await session.commit()
    
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

    result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.verificado == False))
    perfiles = result.scalars().all()
    
    for p in perfiles:
        res_tipo = await session.execute(select(TipoPerfilEspecial).where(TipoPerfilEspecial.id_tipo_especial == p.id_tipo_perfil))
        p.tipo_perfil = res_tipo.scalar_one_or_none()
        
    return perfiles

@router.put("/validate")
async def validate_perfiles(
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
        p.verificado = True
        p.id_usuario_aprob = current_user["user_id"]
        
    await session.commit()
    return {"message": f"{len(perfiles)} perfiles verificados exitosamente."}

@router.post("/send_email")
async def send_perfiles_email(
    background_tasks: BackgroundTasks,
    correos: str = Form(...), # Correos separados por coma
    cantidad_por_correo: int = Form(1500),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Enviar perfiles verificados por correo en lotes."""
    if current_user.get("role") not in ["admin", "sysadmin"]:
         raise HTTPException(status_code=403, detail="No autorizado")
         
    # Traer todos los verificados
    result = await session.execute(select(PerfilEspecial).where(PerfilEspecial.verificado == True))
    perfiles = result.scalars().all()
    
    if not perfiles:
        raise HTTPException(status_code=400, detail="No hay perfiles verificados para enviar.")
        
    correos_list = [c.strip() for c in correos.split(",") if c.strip()]
    if not correos_list:
        raise HTTPException(status_code=400, detail="Debe proveer al menos un correo válido.")
        
    data = []
    for p in perfiles:
        data.append({
            "Nombre y Apellido": p.nombre_apellido,
            "Documento": p.cedula_identidad,
            "Lote": p.Lote,
            "TipoPerfil ID": p.id_tipo_perfil,
            "Verificado": p.verificado
        })
        
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
            
            email_service.send_email(
                to_email=correo_destino,
                subject=f"Listado de Perfiles Verificados - Lote {i+1}",
                body=f"Adjunto encontrará el lote {i+1} de perfiles verificados (Total en este archivo: {len(chunk_df)}).",
                attachments=attachments
            )
            
    background_tasks.add_task(process_and_send)
    return {"message": "El envío de correos se ha iniciado en segundo plano."}
