import React, { useState } from 'react';
import './Login.css'; // Cargará nuestro nuevo CSS con la imagen de fondo de Gemini

const Login = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // La URL del backend central de Catálogos (Sistema de Autenticación)
  // Utilizamos la IP del servidor en el que están centralizados los usuarios
  const AUTH_API_URL = process.env.REACT_APP_AUTH_API_URL || 'http://172.16.222.222:8001/auth';

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${AUTH_API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (response.ok) {
        // Guardar token, refresh token y datos del usuario
        localStorage.setItem('token', data.access_token);
        if (data.refresh_token) {
          localStorage.setItem('refreshToken', data.refresh_token);
        }
        
        const userData = data.user;
        
        // Verificamos si tiene acceso a ESTE sistema (Sistema de Transporte, asumiendo ID 3).
        let hasAccess = false;
        let systemRole = 'viewer';
        
        // Si el usuario tiene permisos globales de admin o permisos locales en este sistema
        if (userData.rol === 'admin') {
           hasAccess = true;
           systemRole = 'admin';
        } else if (userData.habilitaciones_sistemas) {
           const hab = userData.habilitaciones_sistemas.find(h => h.sistema_id === 3 && h.activo);
           if (hab) {
               hasAccess = true;
               systemRole = hab.rol_nombre || 'viewer';
           }
        }
        
        if (!hasAccess) {
           setError('No tienes permisos para acceder a este sistema.');
           localStorage.removeItem('token');
           localStorage.removeItem('refreshToken');
           setLoading(false);
           return;
        }
        
        userData.system_role = systemRole;
        localStorage.setItem('user', JSON.stringify(userData));
        onLogin({ user: userData, token: data.access_token });
      } else {
        setError(data.detail || 'Usuario o contraseña incorrectos');
      }
    } catch (err) {
      setError('Error de conexión. Verifica que el servidor de autenticación esté funcionando.');
      console.error('Error de login:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2>Sistema de Transporte</h2>
          <p>Inicia sesión para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Usuario</label>
            <input
              type="text"
              id="username"
              name="username"
              value={credentials.username}
              onChange={handleChange}
              required
              placeholder="Ingresa tu usuario"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <div className="password-input-container">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={credentials.password}
                onChange={handleChange}
                required
                placeholder="Ingresa tu contraseña"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={togglePasswordVisibility}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="login-footer">
          <button
            type="button"
            className="forgot-password-link"
            disabled={loading || !credentials.username}
            onClick={async () => {
              setLoading(true);
              setError('');
              try {
                const response = await fetch(`${AUTH_API_URL.replace('/auth', '')}/notify/forgot-password`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ username: credentials.username })
                });
                const data = await response.json();
                if (response.ok) {
                  alert('Se ha notificado al administrador. Pronto se pondrá en contacto contigo.');
                } else {
                  if (Array.isArray(data.detail)) {
                    setError(data.detail.map(e => e.msg).join(' | '));
                  } else if (typeof data.detail === 'object') {
                    setError(JSON.stringify(data.detail));
                  } else {
                    setError(data.detail || 'Error al notificar al administrador');
                  }
                }
              } catch (err) {
                setError('Error de conexión');
              } finally {
                setLoading(false);
              }
            }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
