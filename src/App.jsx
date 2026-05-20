import React, { useState, useEffect } from 'react';
import Login from './components/Login.jsx';
import MiPaginaExistente from './components/componentes_actualizado.js';

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const handleLogin = (loginData) => {
    setUser(loginData.user);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) {
    return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh'}}>Cargando...</div>;
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // Pasamos información del usuario y función de logout si el componente la necesitara
  return <MiPaginaExistente user={user} onLogout={handleLogout} />;
};

export default App;
