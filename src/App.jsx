import React, { useState, useEffect } from 'react';
import Login from './components/Login.jsx';
import MainScreen from './components/MainScreen.jsx';

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    const userData = sessionStorage.getItem('user');

    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const handleLogin = (loginData) => {
    setUser(loginData.user);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
  };

  // Implementación de inactividad (deslogueo después de 1 hora)
  useEffect(() => {
    let timeoutId;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      // 1 hora = 3600000 ms
      timeoutId = setTimeout(() => {
        if (user) {
          handleLogout();
          alert('Tu sesión ha expirado por inactividad.');
        }
      }, 3600000);
    };

    if (user) {
      // Escuchar eventos que indican actividad del usuario
      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('mousedown', resetTimer);
      window.addEventListener('keypress', resetTimer);
      window.addEventListener('scroll', resetTimer, true);

      resetTimer(); // Iniciar temporizador al loguear
    }

    // Limpieza al desmontar o cuando el usuario cambia
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('mousedown', resetTimer);
      window.removeEventListener('keypress', resetTimer);
      window.removeEventListener('scroll', resetTimer, true);
    };
  }, [user]);

  if (loading) {
    return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh'}}>Cargando...</div>;
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return <MainScreen user={user} onLogout={handleLogout} />;
};

export default App;
