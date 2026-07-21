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
            await conn.execute(text("ALTER TABLE public.perfiles_especiales ADD COLUMN IF NOT EXISTS ip_origen VARCHAR(45);"))
            await conn.execute(text("ALTER TABLE public.perfiles_especiales ADD COLUMN IF NOT EXISTS user_agent TEXT;"))
            await conn.execute(text("ALTER TABLE public.perfiles_especiales ADD COLUMN IF NOT EXISTS device_id VARCHAR(255);"))
            await conn.execute(text("ALTER TABLE public.perfiles_especiales ADD COLUMN IF NOT EXISTS id_evidencia INTEGER;"))
            print("Columns 'id_usuario_carga', 'id_usuario_aprob', 'ip_origen', 'user_agent', 'device_id', 'id_evidencia' added (or already existed).")
        except Exception as e:
            print(f"Error adding new columns: {e}")
            
        print("Fixing 'orden' sequence in public.perfiles_especiales if missing...")
        try:
            async with conn.begin_nested():
                await conn.execute(text("CREATE SEQUENCE IF NOT EXISTS perfiles_especiales_orden_seq;"))
                await conn.execute(text("ALTER TABLE public.perfiles_especiales ALTER COLUMN orden SET DEFAULT nextval('perfiles_especiales_orden_seq');"))
                await conn.execute(text("SELECT setval('perfiles_especiales_orden_seq', COALESCE((SELECT MAX(orden) FROM public.perfiles_especiales), 1));"))
            print("'orden' sequence fixed successfully.")
        except Exception as e:
            print(f"Error fixing 'orden' sequence: {e}")
            
        print("Fixing NOT NULL constraints for optional columns...")
        try:
            async with conn.begin_nested():
                await conn.execute(text("ALTER TABLE public.perfiles_especiales ALTER COLUMN fecha_nacimiento DROP NOT NULL;"))
                await conn.execute(text("ALTER TABLE public.perfiles_especiales ALTER COLUMN institucion DROP NOT NULL;"))
                await conn.execute(text("ALTER TABLE public.perfiles_especiales ALTER COLUMN eps DROP NOT NULL;"))
                await conn.execute(text("ALTER TABLE public.perfiles_especiales ALTER COLUMN serial_mdp DROP NOT NULL;"))
            print("NOT NULL constraints removed successfully.")
        except Exception as e:
            print(f"Error removing NOT NULL constraints: {e}")


            
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
