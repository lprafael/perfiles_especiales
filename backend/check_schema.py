import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://cid_admin_user:vmtdmtcidccm@168.90.177.232:2024/bbdd-monitoreo-cid"

async def main():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        print("PERFILES_ESPECIALES")
        result = await conn.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'perfiles_especiales' AND table_schema = 'public'"
        ))
        for row in result.fetchall():
            print(row)
            
        print("TIPO_PERFIL_ESPECIAL")
        result2 = await conn.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tipo_perfil_especial' AND table_schema = 'public'"
        ))
        for row in result2.fetchall():
            print(row)

asyncio.run(main())
