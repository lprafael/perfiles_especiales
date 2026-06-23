# email_service.py
# Servicio para envío de emails

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import os
from env_loader import load_dotenv_safe

load_dotenv_safe()

class EmailService:
    def __init__(self):
        self.host = os.getenv("EMAIL_HOST", "smtp.gmail.com")
        self.port = int(os.getenv("EMAIL_PORT", "587"))
        self.username = os.getenv("EMAIL_USERNAME", "")
        self.password = os.getenv("EMAIL_PASSWORD", "")
        self.from_email = os.getenv("EMAIL_FROM", "")

    def send_email(self, to_email: str, subject: str, body: str, is_html: bool = False, attachments: list = None) -> bool:
        """Envía un email con soporte para adjuntos opcionales"""
        try:
            from email.mime.base import MIMEBase
            from email import encoders
            
            if not self.username or not self.password or not self.from_email:
                print("Error enviando email: EMAIL_USERNAME, EMAIL_PASSWORD o EMAIL_FROM no configurados en .env")
                return False
            if not to_email or not to_email.strip():
                print("Error enviando email: to_email vacío")
                return False

            msg = MIMEMultipart()
            msg['From'] = self.from_email
            msg['To'] = to_email
            msg['Subject'] = subject

            if is_html:
                msg.attach(MIMEText(body, 'html'))
            else:
                msg.attach(MIMEText(body, 'plain'))
                
            if attachments:
                for attachment in attachments:
                    # attachment is expected to be a dict: {'filename': str, 'content': bytes, 'content_type': str}
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(attachment['content'])
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', f"attachment; filename= {attachment['filename']}")
                    msg.attach(part)

            # Timeout 15s para evitar bloquear y causar 502 en nginx
            server = smtplib.SMTP(self.host, self.port, timeout=15)
            server.starttls()
            server.login(self.username, self.password)
            text = msg.as_string()
            server.sendmail(self.from_email, to_email, text)
            server.quit()
            return True
        except Exception as e:
            print(f"Error enviando email: {e}")
            return False

    def send_welcome_email(self, to_email: str, username: str, password: str, role: str) -> bool:
        """Envía email de bienvenida con credenciales"""
        subject = "Bienvenido al Sistema de Catálogos VMT-CID"
        
        html_body = f"""
        <html>
        <body>
            <h2>Bienvenido al Sistema de Catálogos VMT-CID</h2>
            <p>Hola <strong>{username}</strong>,</p>
            <p>Tu cuenta ha sido creada exitosamente con los siguientes datos:</p>
            <ul>
                <li><strong>Usuario:</strong> {username}</li>
                <li><strong>Contraseña:</strong> {password}</li>
                <li><strong>Rol:</strong> {role}</li>
            </ul>
            <p>Por seguridad, te recomendamos cambiar tu contraseña después del primer inicio de sesión.</p>
            <p>Saludos,<br>Equipo VMT-CID</p>
        </body>
        </html>
        """
        
        return self.send_email(to_email, subject, html_body, is_html=True)

    def send_password_reset_email(self, to_email: str, username: str, reset_token: str) -> bool:
        """Envía email para restablecer contraseña"""
        subject = "Restablecimiento de Contraseña - Sistema VMT-CID"
        
        html_body = f"""
        <html>
        <body>
            <h2>Restablecimiento de Contraseña</h2>
            <p>Hola <strong>{username}</strong>,</p>
            <p>Has solicitado restablecer tu contraseña. Usa el siguiente token:</p>
            <h3>{reset_token}</h3>
            <p>Este token expira en 1 hora.</p>
            <p>Si no solicitaste este cambio, ignora este email.</p>
            <p>Saludos,<br>Equipo VMT-CID</p>
        </body>
        </html>
        """
        
        return self.send_email(to_email, subject, html_body, is_html=True)

# Instancia global del servicio de email
email_service = EmailService() 