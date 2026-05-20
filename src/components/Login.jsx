import React, { useState } from 'react';
import './Login.css'; // Cargará nuestro nuevo CSS con la imagen de fondo de Gemini

const PUBLIC_URL = process.env.PUBLIC_URL || '';

const Login = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Usar /api que está configurado en nginx para hacer proxy al backend
  // Esto evita errores de contenido mixto (HTTPS -> HTTP)
  const apiUrl = process.env.REACT_APP_API_URL || '/api';

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
      const response = await fetch(`${apiUrl}/auth/login`, {
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
        localStorage.setItem('user', JSON.stringify(data.user));
        onLogin(data);
      } else {
        setError(data.detail || 'Error en el inicio de sesión');
      }
    } catch (err) {
      setError('Error de conexión. Verifica que el servidor esté funcionando.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" style={{ background: `url('${PUBLIC_URL}/imágenes/Gemini_Generated_Image_mbooyjmbooyjmboo.png') no-repeat center center fixed`, backgroundSize: 'cover' }}>
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
                const response = await fetch(`${apiUrl}/notify/forgot-password`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ username: credentials.username })
                });
                const data = await response.json();
                if (response.ok) {
                  alert('Se ha notificado al administrador. Pronto se pondrá en contacto contigo.');
                } else {
                  // Si la respuesta es un array de errores, muestra el primer mensaje legible
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
