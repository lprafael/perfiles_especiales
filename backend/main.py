# Levantar servidor (desde la carpeta backend): uvicorn main:app --reload --port 8011
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import traceback

import auth
import perfiles

load_dotenv()

app = FastAPI(title="Sistema de Administración de Perfiles Especiales")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Error interno en el servidor: {str(exc)}"}
    )

# Incluir router de autenticación
app.include_router(auth.router)
app.include_router(perfiles.router)

# Habilitar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # podés restringir en producción
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/test-verification-ping")
def ping():
    return {"message": "pong"}

@app.get("/")
def root():
    return {"mensaje": "Backend Python funcionando correctamente - Sistema de Administración de Perfiles Especiales"}
