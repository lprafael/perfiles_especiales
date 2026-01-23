@echo off
cd /d C:\Users\support\Documents\CIDSA\sist-transporte
call venv\Scripts\activate.bat
python monitoreo_intervalo.py >> monitoreo.log 2>&1
