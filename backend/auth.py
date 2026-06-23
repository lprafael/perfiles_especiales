# auth.py
# Endpoints de autenticación y gestión de usuarios

import secrets
import string
from datetime import datetime, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_
from sqlalchemy.exc import IntegrityError

from models import Usuario, PasswordReset, LogAcceso, UsuarioSistemaRol, Rol, usuario_rol, SistemaApp
from sqlalchemy.orm import selectinload
from sqlalchemy import delete
from schemas import (
    UserLogin, UserCreate, UserUpdate, UserResponse, Token, 
    PasswordChange, PasswordResetRequest, PasswordResetConfirm,
    LogAccesoCreate, LogAccesoResponse, RoleInfo, SistemaAppResponse, SistemaAppCreate, SistemaAppUpdate
)
from security import (
    verify_password, get_password_hash, create_access_token, 
    verify_token, get_current_user, check_permission, ROLES
)
from email_service import email_service

# Importar get_session desde database.py
from database import get_session
from audit_utils import log_audit_action, get_client_ip, get_user_agent

router = APIRouter(prefix="/auth", tags=["Autenticación"])

# Función para generar contraseña aleatoria
def generate_random_password(length: int = 12) -> str:
    """Genera una contraseña aleatoria segura"""
    characters = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(characters) for _ in range(length))

def populate_rol_nombres(user):
    """Llena el campo rol_nombre en las habilitaciones para el frontend"""
    if not user: return
    for hab in getattr(user, 'habilitaciones_sistemas', []):
        if getattr(hab, 'rol', None):
            hab.rol_nombre = hab.rol.nombre


# Función para registrar logs de acceso
async def log_access(session: AsyncSession, log_data: LogAccesoCreate):
    """Registra un log de acceso"""
    log = LogAcceso(**log_data.dict())
    session.add(log)
    await session.commit()

@router.post("/login", response_model=Token)
async def login(
    user_credentials: UserLogin, 
    request: Request,
    session: AsyncSession = Depends(get_session)
):
    """Inicio de sesión de usuario"""
    # Buscar usuario y cargar sus habilitaciones
    result = await session.execute(
        select(Usuario)
        .options(selectinload(Usuario.habilitaciones_sistemas).selectinload(UsuarioSistemaRol.rol), selectinload(Usuario.organismo))
        .where(Usuario.username == user_credentials.username)
    )
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas"
        )
    
    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo"
        )
    
    # Actualizar último acceso
    user.ultimo_acceso = datetime.utcnow()
    await session.commit()
    
    user_rol_catalogos = None
    if user.username == 'admin':
        user_rol_catalogos = 'admin'
    else:
        for hab in getattr(user, 'habilitaciones_sistemas', []):
            if getattr(hab, 'sistema_id', None) == 4 and getattr(hab, 'activo', True):
                user_rol_catalogos = getattr(getattr(hab, 'rol', None), 'nombre', "viewer")
                break
            
    if not user_rol_catalogos:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El usuario no tiene permisos habilitados en este sistema."
        )

    # Asignamos al objeto user de manera que el schema (from_orm) use este rol
    user.rol = user_rol_catalogos
    populate_rol_nombres(user)
    
    access_token = create_access_token(
        data={"sub": user.username, "role": user_rol_catalogos, "user_id": user.id}
    )
    
    # Registrar log
    await log_access(session, LogAccesoCreate(
        usuario_id=user.id,
        username=user.username,
        accion="login",
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent")
    ))
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.from_orm(user)
    )

@router.post("/logout")
async def logout(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Cerrar sesión"""
    # Registrar log
    await log_access(session, LogAccesoCreate(
        usuario_id=current_user["user_id"],
        username=current_user["sub"],
        accion="logout",
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent")
    ))
    
    return {"message": "Sesión cerrada exitosamente"}

@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    current_user: dict = Depends(check_permission("manage_users")),
    session: AsyncSession = Depends(get_session)
):
    """Crear nuevo usuario (solo administradores)"""
    # Verificar si el usuario ya existe
    result = await session.execute(
        select(Usuario).where(
            (Usuario.username == user_data.username) | (Usuario.email == user_data.email)
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario o email ya existe"
        )
    
    # Generar contraseña aleatoria
    password = generate_random_password()
    hashed_password = get_password_hash(password)
    
    # Crear usuario
    new_user = Usuario(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        nombre_completo=user_data.nombre_completo,
        id_organismo=user_data.id_organismo,
        creado_por=current_user["user_id"]
    )
    
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)
    
    # Manejar habilitaciones de sistemas
    if hasattr(user_data, 'habilitaciones') and user_data.habilitaciones:
        for hab in user_data.habilitaciones:
            res_rol = await session.execute(select(Rol).where(Rol.nombre == hab.rol))
            rol_obj = res_rol.scalar_one_or_none()
            if rol_obj:
                new_hab = UsuarioSistemaRol(
                    usuario_id=new_user.id,
                    sistema_id=hab.sistema_id,
                    rol_id=rol_obj.id
                )
                session.add(new_hab)
                # Retrocompatibilidad para CBD
                if hab.sistema_id == 1:
                    await session.execute(
                        usuario_rol.insert().values(usuario_id=new_user.id, rol_id=rol_obj.id)
                    )
        await session.commit()
    
    # Enviar email con credenciales
    email_service.send_welcome_email(
        user_data.email, 
        user_data.username, 
        password, 
        user_data.rol
    )
    
    # Registrar log de acceso
    await log_access(session, LogAccesoCreate(
        usuario_id=current_user["user_id"],
        username=current_user["sub"],
        accion="create_user",
        detalles={"mensaje": f"Usuario creado: {user_data.username}"}
    ))
    # Registrar log de auditoría
    await log_audit_action(
        session=session,
        username=current_user["sub"],
        user_id=current_user["user_id"],
        action="create",
        table="usuarios",
        record_id=new_user.id,
        new_data={
            "username": new_user.username,
            "email": new_user.email,
            "activo": new_user.activo,
        },
        details=f"Usuario creado: {new_user.username}"
    )
    
    # Reload for response
    result_final = await session.execute(
        select(Usuario)
        .options(selectinload(Usuario.habilitaciones_sistemas).selectinload(UsuarioSistemaRol.rol), selectinload(Usuario.organismo))
        .where(Usuario.id == new_user.id)
    )
    user_final = result_final.scalar_one()
    
    user_rol_catalogos = "viewer"
    for hab in getattr(user_final, 'habilitaciones_sistemas', []):
        if getattr(hab, 'sistema_id', None) == 4 and getattr(hab, 'activo', True):
            user_rol_catalogos = getattr(getattr(hab, 'rol', None), 'nombre', "viewer")
            break
    user_final.rol = user_rol_catalogos
    populate_rol_nombres(user_final)
    
    return UserResponse.from_orm(user_final)

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    current_user: dict = Depends(check_permission("manage_users")),
    session: AsyncSession = Depends(get_session)
):
    """Listar usuarios (solo administradores)"""
    result = await session.execute(
        select(Usuario).options(selectinload(Usuario.habilitaciones_sistemas).selectinload(UsuarioSistemaRol.rol), selectinload(Usuario.organismo))
    )
    users = result.scalars().all()
    for user in users:
        user_rol_catalogos = "viewer"
        for hab in getattr(user, 'habilitaciones_sistemas', []):
            if getattr(hab, 'sistema_id', None) == 4 and getattr(hab, 'activo', True):
                user_rol_catalogos = getattr(getattr(hab, 'rol', None), 'nombre', "viewer")
                break
        user.rol = user_rol_catalogos
        populate_rol_nombres(user)
    return [UserResponse.from_orm(user) for user in users]

@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: dict = Depends(check_permission("manage_users")),
    session: AsyncSession = Depends(get_session)
):
    """Obtener usuario por ID"""
    result = await session.execute(
        select(Usuario)
        .options(selectinload(Usuario.habilitaciones_sistemas).selectinload(UsuarioSistemaRol.rol), selectinload(Usuario.organismo))
        .where(Usuario.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    user_rol_catalogos = "viewer"
    for hab in getattr(user, 'habilitaciones_sistemas', []):
        if getattr(hab, 'sistema_id', None) == 4 and getattr(hab, 'activo', True):
            user_rol_catalogos = getattr(getattr(hab, 'rol', None), 'nombre', "viewer")
            break
    user.rol = user_rol_catalogos
    populate_rol_nombres(user)
    
    return UserResponse.from_orm(user)

@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: dict = Depends(check_permission("manage_users")),
    session: AsyncSession = Depends(get_session)
):
    """Actualizar usuario"""
    result = await session.execute(select(Usuario).where(Usuario.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Actualizar campos básicos
    update_data = user_data.dict(exclude_unset=True, exclude={'habilitaciones'})
    for field, value in update_data.items():
        setattr(user, field, value)
        
    if getattr(user_data, 'habilitaciones', None) is not None:
        # Borrar habilitaciones actuales y reinsertar
        await session.execute(delete(UsuarioSistemaRol).where(UsuarioSistemaRol.usuario_id == user.id))
        await session.execute(delete(usuario_rol).where(usuario_rol.c.usuario_id == user.id))
        
        for hab in user_data.habilitaciones:
            res_rol = await session.execute(select(Rol).where(Rol.nombre == hab.rol))
            rol_obj = res_rol.scalar_one_or_none()
            if rol_obj:
                new_hab = UsuarioSistemaRol(
                    usuario_id=user.id,
                    sistema_id=hab.sistema_id,
                    rol_id=rol_obj.id
                )
                session.add(new_hab)
                if hab.sistema_id == 1:
                    await session.execute(
                        usuario_rol.insert().values(usuario_id=user.id, rol_id=rol_obj.id)
                    )

    try:
        await session.commit()
        await session.refresh(user)
    except IntegrityError as e:
        await session.rollback()
        if 'email' in str(e.orig):
            raise HTTPException(status_code=400, detail="El correo electrónico ya está registrado")
        raise HTTPException(status_code=400, detail="Error de integridad de datos")
    # Registrar log de acceso
    await log_access(session, LogAccesoCreate(
        usuario_id=current_user["user_id"],
        username=current_user["sub"],
        accion="update_user",
        detalles={"mensaje": f"Usuario actualizado: {user.username}"}
    ))
    # Registrar log de auditoría
    await log_audit_action(
        session=session,
        username=current_user["sub"],
        user_id=current_user["user_id"],
        action="update",
        table="usuarios",
        record_id=user.id,
        new_data={k: v for k, v in update_data.items() if k != "hashed_password"},
        details=f"Usuario actualizado: {user.username}"
    )
    # Reload for response
    result_final = await session.execute(
        select(Usuario)
        .options(selectinload(Usuario.habilitaciones_sistemas).selectinload(UsuarioSistemaRol.rol), selectinload(Usuario.organismo))
        .where(Usuario.id == user.id)
    )
    user_final = result_final.scalar_one()
    
    user_rol_catalogos = "viewer"
    for hab in getattr(user_final, 'habilitaciones_sistemas', []):
        if getattr(hab, 'sistema_id', None) == 4 and getattr(hab, 'activo', True):
            user_rol_catalogos = getattr(getattr(hab, 'rol', None), 'nombre', "viewer")
            break
    user_final.rol = user_rol_catalogos
    populate_rol_nombres(user_final)
    
    return UserResponse.from_orm(user_final)

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: dict = Depends(check_permission("manage_users")),
    session: AsyncSession = Depends(get_session)
):
    """Eliminar usuario (desactivar)"""
    result = await session.execute(select(Usuario).where(Usuario.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    # Proteger admin
    if user.username == 'admin':
        raise HTTPException(status_code=403, detail="No se puede eliminar el usuario admin")
    # Desactivar usuario en lugar de eliminarlo
    user.activo = False
    await session.commit()
    # Registrar log de acceso
    await log_access(session, LogAccesoCreate(
        usuario_id=current_user["user_id"],
        username=current_user["sub"],
        accion="delete_user",
        detalles={"mensaje": f"Usuario desactivado: {user.username}"}
    ))
    # Registrar log de auditoría
    await log_audit_action(
        session=session,
        username=current_user["sub"],
        user_id=current_user["user_id"],
        action="delete",
        table="usuarios",
        record_id=user.id,
        previous_data={
            "username": user.username,
            "email": user.email,
        },
        details=f"Usuario desactivado: {user.username}"
    )
    return {"message": "Usuario desactivado exitosamente"}

@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Cambiar contraseña del usuario actual"""
    result = await session.execute(
        select(Usuario).where(Usuario.id == current_user["user_id"])
    )
    user = result.scalar_one_or_none()
    
    if not verify_password(password_data.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contraseña actual incorrecta"
        )
    
    user.hashed_password = get_password_hash(password_data.new_password)
    await session.commit()
    
    # Registrar log
    await log_access(session, LogAccesoCreate(
        usuario_id=current_user["user_id"],
        username=current_user["sub"],
        accion="change_password"
    ))
    
    return {"message": "Contraseña cambiada exitosamente"}

@router.post("/reset-password-request")
async def request_password_reset(
    reset_request: PasswordResetRequest,
    session: AsyncSession = Depends(get_session)
):
    """Solicitar restablecimiento de contraseña"""
    result = await session.execute(
        select(Usuario).where(Usuario.email == reset_request.email)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        # No revelar si el email existe o no
        return {"message": "Si el email existe, se enviará un enlace de restablecimiento"}
    
    # Generar token
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=1)
    
    # Guardar token
    reset_record = PasswordReset(
        email=reset_request.email,
        token=token,
        expira_en=expires
    )
    session.add(reset_record)
    await session.commit()
    
    # Enviar email
    email_service.send_password_reset_email(
        reset_request.email, 
        user.username, 
        token
    )
    
    return {"message": "Si el email existe, se enviará un enlace de restablecimiento"}

@router.post("/reset-password-confirm")
async def confirm_password_reset(
    reset_confirm: PasswordResetConfirm,
    session: AsyncSession = Depends(get_session)
):
    """Confirmar restablecimiento de contraseña"""
    result = await session.execute(
        select(PasswordReset).where(
            and_(
                PasswordReset.token == reset_confirm.token,
                PasswordReset.usado == False,
                PasswordReset.expira_en > datetime.utcnow()
            )
        )
    )
    reset_record = result.scalar_one_or_none()
    
    if not reset_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido o expirado"
        )
    
    # Buscar usuario
    result = await session.execute(
        select(Usuario).where(Usuario.email == reset_record.email)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Actualizar contraseña
    user.hashed_password = get_password_hash(reset_confirm.new_password)
    reset_record.usado = True
    await session.commit()
    
    return {"message": "Contraseña restablecida exitosamente"}

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Obtener información del usuario actual"""
    result = await session.execute(
        select(Usuario)
        .options(selectinload(Usuario.habilitaciones_sistemas).selectinload(UsuarioSistemaRol.rol), selectinload(Usuario.organismo))
        .where(Usuario.id == current_user["user_id"])
    )
    user = result.scalar_one_or_none()
    
    if user:
        user_rol_catalogos = "viewer"
        for hab in getattr(user, 'habilitaciones_sistemas', []):
            if getattr(hab, 'sistema_id', None) == 4 and getattr(hab, 'activo', True):
                user_rol_catalogos = getattr(getattr(hab, 'rol', None), 'nombre', "viewer")
                break
        user.rol = user_rol_catalogos
        populate_rol_nombres(user)
        
    return UserResponse.from_orm(user)

@router.get("/roles", response_model=List[RoleInfo])
async def get_roles():
    """Obtener información de roles disponibles"""
    return [
        RoleInfo(name=role, **info) 
        for role, info in ROLES.items()
    ]

@router.get("/logs", response_model=List[LogAccesoResponse])
async def get_logs(
    current_user: dict = Depends(check_permission("manage_users")),
    session: AsyncSession = Depends(get_session),
    limit: int = 100
):
    """Obtener logs de acceso (solo administradores)"""
    result = await session.execute(
        select(LogAcceso).order_by(LogAcceso.fecha.desc()).limit(limit)
    )
    logs = result.scalars().all()
    return [LogAccesoResponse.from_orm(log) for log in logs] 

@router.get("/sistemas", response_model=List[SistemaAppResponse])
async def list_sistemas(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Listar sistemas disponibles"""
    result = await session.execute(select(SistemaApp))
    return result.scalars().all()

@router.post("/sistemas", response_model=SistemaAppResponse)
async def create_sistema(
    sistema_data: SistemaAppCreate,
    current_user: dict = Depends(check_permission("manage_users")),
    session: AsyncSession = Depends(get_session)
):
    """Crear nuevo sistema (solo administradores)"""
    new_sistema = SistemaApp(**sistema_data.dict())
    session.add(new_sistema)
    await session.commit()
    await session.refresh(new_sistema)
    return new_sistema

@router.put("/sistemas/{sistema_id}", response_model=SistemaAppResponse)
async def update_sistema(
    sistema_id: int,
    sistema_data: SistemaAppUpdate,
    current_user: dict = Depends(check_permission("manage_users")),
    session: AsyncSession = Depends(get_session)
):
    """Actualizar sistema"""
    result = await session.execute(select(SistemaApp).where(SistemaApp.id == sistema_id))
    sistema = result.scalar_one_or_none()
    if not sistema:
        raise HTTPException(status_code=404, detail="Sistema no encontrado")
    
    update_data = sistema_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(sistema, field, value)
        
    await session.commit()
    await session.refresh(sistema)
    return sistema

@router.delete("/sistemas/{sistema_id}")
async def delete_sistema(
    sistema_id: int,
    current_user: dict = Depends(check_permission("manage_users")),
    session: AsyncSession = Depends(get_session)
):
    """Desactivar sistema"""
    result = await session.execute(select(SistemaApp).where(SistemaApp.id == sistema_id))
    sistema = result.scalar_one_or_none()
    if not sistema:
        raise HTTPException(status_code=404, detail="Sistema no encontrado")
    
    sistema.activo = False
    await session.commit()
    return {"message": "Sistema desactivado exitosamente"}