# security.py
# Configuración de seguridad para autenticación y autorización

import os
from jose import jwt, JWTError
from datetime import datetime, timedelta
from typing import Optional
from passlib.context import CryptContext
import bcrypt
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from env_loader import load_dotenv_safe

load_dotenv_safe()

# Configuración de seguridad
SECRET_KEY = os.getenv("SECRET_KEY", "tu_clave_secreta_muy_segura_aqui")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480")) # Default: 8 horas

# Configuración de email
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USERNAME = os.getenv("EMAIL_USERNAME", "")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "")

# Contexto para hash de contraseñas
# Configurar bcrypt para evitar problemas con contraseñas largas
# Inicializar de forma lazy para evitar problemas durante la importación
_pwd_context = None

def get_pwd_context():
    """Obtiene el contexto de contraseñas, inicializándolo si es necesario"""
    global _pwd_context
    if _pwd_context is None:
        try:
            _pwd_context = CryptContext(
                schemes=["bcrypt"], 
                deprecated="auto",
                bcrypt__ident="2b"  # Usar identificación 2b que es más compatible
            )
            # Forzar inicialización con una contraseña corta
            _pwd_context.hash("init")
        except Exception:
            # Si hay error, usar configuración mínima
            _pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return _pwd_context

# Inicializar al importar el módulo
pwd_context = get_pwd_context()

# Bearer token para autenticación
security = HTTPBearer()

def _truncate_password(password: str) -> str:
    """Trunca una contraseña a 72 bytes preservando caracteres UTF-8 válidos"""
    if not isinstance(password, str):
        return password
    password_bytes = password.encode('utf-8')
    if len(password_bytes) <= 72:
        return password
    # Truncar a 72 bytes
    truncated = password_bytes[:72]
    # Asegurarse de que no cortamos en medio de un carácter UTF-8
    # Si el último byte es parte de un carácter multibyte, eliminarlo
    while truncated and (truncated[-1] & 0x80) and not (truncated[-1] & 0x40):
        truncated = truncated[:-1]
    return truncated.decode('utf-8', errors='ignore')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica si la contraseña coincide con el hash"""
    # bcrypt tiene una limitación de 72 bytes, truncar ANTES de verificar
    plain_password = _truncate_password(plain_password)
    
    # Intentar usar passlib primero
    try:
        ctx = get_pwd_context()
        return ctx.verify(plain_password, hashed_password)
    except (ValueError, Exception) as e:
        # Si passlib falla (por ejemplo, durante detect_wrap_bug), usar bcrypt directamente
        if "longer than 72 bytes" in str(e) or "72" in str(e) or "detect_wrap_bug" in str(e):
            try:
                # Usar bcrypt directamente como fallback
                plain_password_bytes = plain_password.encode('utf-8')
                if len(plain_password_bytes) > 72:
                    plain_password_bytes = plain_password_bytes[:72]
                hashed_bytes = hashed_password.encode('utf-8')
                return bcrypt.checkpw(plain_password_bytes, hashed_bytes)
            except Exception:
                # Si aún falla, intentar con una versión más corta
                plain_password_bytes = plain_password.encode('utf-8')[:70]
                while plain_password_bytes and (plain_password_bytes[-1] & 0x80) and not (plain_password_bytes[-1] & 0x40):
                    plain_password_bytes = plain_password_bytes[:-1]
                hashed_bytes = hashed_password.encode('utf-8')
                return bcrypt.checkpw(plain_password_bytes, hashed_bytes)
        raise

def get_password_hash(password: str) -> str:
    """Genera el hash de una contraseña"""
    # bcrypt tiene una limitación de 72 bytes, truncar ANTES de hashear
    password = _truncate_password(password)
    ctx = get_pwd_context()
    return ctx.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Crea un token JWT de acceso"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    """Verifica y decodifica un token JWT"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Obtiene el usuario actual basado en el token"""
    token = credentials.credentials
    payload = verify_token(token)
    return payload

# Roles y permisos
ROLES = {
    "admin": {
        "description": "Administrador del sistema",
        "permissions": ["read", "write", "delete", "manage_users", "manage_roles"]
    },
    "manager": {
        "description": "Gerente con acceso completo a datos",
        "permissions": ["read", "write", "delete"]
    },
    "user": {
        "description": "Usuario básico",
        "permissions": ["read", "write"]
    },
    "viewer": {
        "description": "Solo lectura",
        "permissions": ["read"]
    }
}

def check_permission(required_permission: str):
    """Decorador para verificar permisos"""
    def permission_checker(current_user: dict = Depends(get_current_user)):
        user_permissions = ROLES.get(current_user.get("role", "viewer"), {}).get("permissions", [])
        if required_permission not in user_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para realizar esta acción"
            )
        return current_user
    return permission_checker

def check_database_permission(required_permission: str):
    """Verifica permisos desde la base de datos"""
    def permission_checker(current_user: dict = Depends(get_current_user)):
        # Esta función solo verifica el token, la verificación de permisos se hará en el endpoint
        return current_user
    
    return permission_checker 