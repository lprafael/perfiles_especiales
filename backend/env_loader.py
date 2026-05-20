# env_loader.py
# Carga .env con fallback si el archivo no es UTF-8 (ej. tiene ó, ñ en contraseñas)

def load_dotenv_safe():
    from dotenv import load_dotenv
    try:
        load_dotenv(encoding="utf-8")
    except UnicodeDecodeError:
        load_dotenv(encoding="latin-1")
