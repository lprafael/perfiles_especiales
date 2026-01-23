@echo off
echo ============================================
echo   DETENIENDO SISTEMA DE TRANSPORTE - CIDSA
echo ============================================

:: Cerrar FastAPI (Python con uvicorn)
taskkill /F /IM python.exe /T

:: Cerrar React/Vite (Node.js)
taskkill /F /IM node.exe /T

echo Servicios detenidos correctamente.
pause

