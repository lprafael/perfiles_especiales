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
            
        print("Creating missing tables...")
        # Create all missing tables (like public.tipo_perfil_especial and public.perfiles_especiales)
        await conn.run_sync(Base.metadata.create_all)
        print("Tables created successfully.")
        
    await engine.dispose()
    print("Done.")

if __name__ == "__main__":
    asyncio.run(migrate())
