import asyncio
import os
import sys

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("No DATABASE_URL found")
    sys.exit(1)

from models import Base

async def migrate():
    print(f"Connecting to {DATABASE_URL} ...")
    engine = create_async_engine(DATABASE_URL, echo=True)
    
    async with engine.begin() as conn:
        print("Creating table sistema.organismos...")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sistema.organismos (
                id SERIAL PRIMARY KEY,
                sigla VARCHAR(20) NOT NULL UNIQUE,
                nombre_completo VARCHAR(200) NOT NULL,
                activo BOOLEAN DEFAULT true
            );
        """))
        
        print("Inserting default organismos...")
        await conn.execute(text("""
            INSERT INTO sistema.organismos (sigla, nombre_completo) VALUES 
            ('VMT', 'Viceministerio de Transporte'),
            ('MEC', 'Ministerio de Educación y Ciencias'),
            ('SENADIS', 'Secretaría Nacional por los Derechos Humanos de las Personas con Discapacidad'),
            ('EPS', 'Empresas Prestadoras de Servicio de Billetaje'),
            ('EOT', 'Empresas Operadoras de Transporte')
            ON CONFLICT (sigla) DO NOTHING;
        """))
        
        print("Updating sistema.usuarios...")
        await conn.execute(text("ALTER TABLE sistema.usuarios ADD COLUMN IF NOT EXISTS id_organismo INTEGER REFERENCES sistema.organismos(id);"))
        try:
            await conn.execute(text("ALTER TABLE sistema.usuarios DROP COLUMN IF EXISTS organizacion;"))
        except Exception as e:
            print(f"Ignored error dropping organizacion from usuarios: {e}")
            
        print("Updating public.tipo_perfil_especial...")
        await conn.execute(text("ALTER TABLE public.tipo_perfil_especial ADD COLUMN IF NOT EXISTS id_organismo INTEGER REFERENCES sistema.organismos(id);"))
        try:
            await conn.execute(text("ALTER TABLE public.tipo_perfil_especial DROP COLUMN IF EXISTS organizacion;"))
        except Exception as e:
            print(f"Ignored error dropping organizacion from tipo_perfil_especial: {e}")

        print("Migration done successfully.")
        
    await engine.dispose()
    print("Done.")

if __name__ == "__main__":
    asyncio.run(migrate())
