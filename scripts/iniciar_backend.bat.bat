@echo off
cd /d C:\Users\support\Documents\CIDSA\sist-transporte\backend
call ..\venv\Scripts\activate.bat
uvicorn main:app --reload --host 0.0.0.0 --port 8000
