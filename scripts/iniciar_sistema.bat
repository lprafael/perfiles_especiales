@echo off
echo ============================================
echo    INICIANDO SISTEMA DE TRANSPORTE - CIDSA
echo ============================================

:: Iniciar backend (FastAPI)
start "FastAPI Backend" cmd /k "cd /d C:\Users\support\Documents\CIDSA\sist-transporte\backend && call ..\venv\Scripts\activate.bat && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

timeout /t 5 > nul

:: Iniciar frontend React
start "Frontend React" cmd /k "cd /d C:\Users\support\Documents\CIDSA\sist-transporte && npm start"

exit

