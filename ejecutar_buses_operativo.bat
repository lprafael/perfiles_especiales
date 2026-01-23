@echo off
cd /d C:\Users\support\Documents\CIDSA\sist-transporte
call venv\Scripts\activate.bat
python buses_operativo.py >> buses_operativo.log 2>&1