Set WshShell = CreateObject("WScript.Shell")

' Ejecutar Backend
WshShell.Run "C:\Users\support\Documents\CIDSA\sist-transporte\scripts\iniciar_backend.bat", 0, False

' Esperar 5 segundos antes de iniciar el frontend
WScript.Sleep 5000

' Ejecutar Frontend
WshShell.Run "C:\Users\support\Documents\CIDSA\sist-transporte\scripts\iniciar_frontend.bat", 0, False

Set WshShell = Nothing
