# database.py
import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from env_loader import load_dotenv_safe

# Load .env only if DATABASE_URL is not already provided by the container environment
if not os.getenv("DATABASE_URL"):
    load_dotenv_safe()

# Configuración de las bases de datos
DATABASE_URL = os.getenv("DATABASE_URL")
MONITOREO_DATABASE_URL = os.getenv("MONITOREO_DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("No se encontró DATABASE_URL en el archivo .env")

# Motores asíncronos con configuración de pool
engine = create_async_engine(
    DATABASE_URL, 
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # Verifica conexiones antes de usarlas
    pool_recycle=3600,   # Recicla conexiones después de 1 hora
)  # CID DB

engine_monitoreo = None
if MONITOREO_DATABASE_URL:
    engine_monitoreo = create_async_engine(
        MONITOREO_DATABASE_URL, 
        echo=False,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=3600,
    )

# Fábricas de sesiones usando async_sessionmaker (correcto para async)
SessionLocal = async_sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

SessionMonitoreo = None
if engine_monitoreo:
    SessionMonitoreo = async_sessionmaker(
        engine_monitoreo, 
        class_=AsyncSession, 
        expire_on_commit=False
    )

async def get_session():
    """
    Proveedor de dependencia para obtener una sesión de base de datos CID.
    """
    async with SessionLocal() as session:
        yield session

async def get_monitoreo_session():
    """
    Proveedor de dependencia para obtener una sesión de base de datos de Monitoreo.
    """
    if not SessionMonitoreo:
        raise ValueError("Capa de monitoreo no configurada")
    async with SessionMonitoreo() as session:
        yield session
    async with SessionLocal() as session:
        yield session
