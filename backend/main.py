# Levantar servidor (desde la carpeta backend): uvicorn main:app --reload --port 8010
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

import auth
import perfiles

load_dotenv()

app = FastAPI(title="Sistema de Administración de Perfiles Especiales")

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
