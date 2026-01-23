@echo off
cd /d C:\Users\support\Documents\CIDSA\sist-transporte
call venv\Scripts\activate.bat
python ejecutar_notificacion.py >> notificacion.log 2>&1
