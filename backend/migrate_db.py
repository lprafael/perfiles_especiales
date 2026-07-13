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
        print("Adding column 'organizacion' to sistema.usuarios if it doesn't exist...")
        try:
            await conn.execute(text("ALTER TABLE sistema.usuarios ADD COLUMN IF NOT EXISTS organizacion VARCHAR(50);"))
            print("Column 'organizacion' added (or already existed).")
        except Exception as e:
            print(f"Error adding column: {e}")
            
        print("Adding new columns to public.perfiles_especiales if they don't exist...")
        try:
            await conn.execute(text("ALTER TABLE public.perfiles_especiales ADD COLUMN IF NOT EXISTS id_usuario_carga INTEGER NOT NULL DEFAULT 1 REFERENCES sistema.usuarios(id);"))
            await conn.execute(text("ALTER TABLE public.perfiles_especiales ADD COLUMN IF NOT EXISTS id_usuario_aprob INTEGER REFERENCES sistema.usuarios(id);"))
            print("Columns 'id_usuario_carga' and 'id_usuario_aprob' added (or already existed).")
        except Exception as e:
            print(f"Error adding new columns: {e}")
            
        print("Migrando estado de solicitudes y fechas...")
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS public.estados_solicitud_perfiles (
                    id_estado SERIAL PRIMARY KEY,
                    descripcion VARCHAR(50) NOT NULL
                );
            """))
            await conn.execute(text("""
                INSERT INTO public.estados_solicitud_perfiles (id_estado, descripcion)
                VALUES (1, 'Solicitado'), (2, 'Verificado'), (3, 'Aprobado'), (4, 'Rechazado'), (5, 'Emitido')
                ON CONFLICT (id_estado) DO NOTHING;
            """))
            
            await conn.execute(text("ALTER TABLE public.perfiles_especiales ADD COLUMN IF NOT EXISTS id_estado_solicitud INTEGER REFERENCES public.estados_solicitud_perfiles(id_estado);"))
            await conn.execute(text("ALTER TABLE public.perfiles_especiales ADD COLUMN IF NOT EXISTS fecha_solicitud TIMESTAMP;"))
            await conn.execute(text("ALTER TABLE public.perfiles_especiales ADD COLUMN IF NOT EXISTS fecha_verificacion TIMESTAMP;"))
            await conn.execute(text("ALTER TABLE public.perfiles_especiales ADD COLUMN IF NOT EXISTS fecha_aprobacion TIMESTAMP;"))
            await conn.execute(text("ALTER TABLE public.perfiles_especiales ADD COLUMN IF NOT EXISTS fecha_emision TIMESTAMP;"))
            
            res = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='perfiles_especiales' AND column_name='verificado';"))
            if res.fetchone():
                print("Migrating 'verificado' data to 'id_estado_solicitud'...")
                await conn.execute(text("UPDATE public.perfiles_especiales SET id_estado_solicitud = 2, fecha_verificacion = CURRENT_TIMESTAMP WHERE verificado = TRUE;"))
                await conn.execute(text("UPDATE public.perfiles_especiales SET id_estado_solicitud = 1, fecha_solicitud = CURRENT_TIMESTAMP WHERE verificado = FALSE OR verificado IS NULL;"))
                
                await conn.execute(text("ALTER TABLE public.perfiles_especiales ALTER COLUMN id_estado_solicitud SET NOT NULL;"))
                await conn.execute(text("ALTER TABLE public.perfiles_especiales ALTER COLUMN id_estado_solicitud SET DEFAULT 1;"))
                
                await conn.execute(text("ALTER TABLE public.perfiles_especiales DROP COLUMN verificado;"))
                print("Column 'verificado' dropped.")
            
            print("Estado solicitudes migration completed.")
        except Exception as e:
            print(f"Error migrating estados: {e}")
            
        print("Creating missing tables...")
        # Create all missing tables (like public.tipo_perfil_especial and public.perfiles_especiales)
        await conn.run_sync(Base.metadata.create_all)
        print("Tables created successfully.")
        
    await engine.dispose()
    print("Done.")

if __name__ == "__main__":
    asyncio.run(migrate())
