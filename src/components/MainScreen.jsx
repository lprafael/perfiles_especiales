import React, { useState } from 'react';
import ConsultaPerfiles from './ConsultaPerfiles';
import ImportacionPerfiles from './ImportacionPerfiles';
import ValidacionPerfiles from './ValidacionPerfiles';

const MainScreen = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('consulta');

  const isAdmin = user?.rol === 'admin' || user?.rol === 'sysadmin';
  const isUsuario = user?.rol === 'user';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {/* Sidebar Navigation */}
      <div style={{ width: '250px', background: '#2c3e50', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '2rem 1rem', background: '#1a252f', textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>CID Perfiles Especiales</h2>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#bdc3c7' }}>Organismo: {user?.organismo?.sigla || 'General'}</p>
        </div>
        
        <nav style={{ flex: 1, padding: '1rem 0' }}>
          <button 
            onClick={() => setActiveTab('consulta')}
            style={{ 
              width: '100%', padding: '1rem', textAlign: 'left', border: 'none', 
              background: activeTab === 'consulta' ? '#34495e' : 'transparent', 
              color: 'white', cursor: 'pointer', fontSize: '1rem'
            }}
          >
            🔍 Consulta de Perfiles
          </button>

          {(isUsuario || isAdmin) && (
            <button 
              onClick={() => setActiveTab('importacion')}
              style={{ 
                width: '100%', padding: '1rem', textAlign: 'left', border: 'none', 
                background: activeTab === 'importacion' ? '#34495e' : 'transparent', 
                color: 'white', cursor: 'pointer', fontSize: '1rem'
              }}
            >
              📥 Importar Beneficiarios
            </button>
          )}

          {isAdmin && (
            <button 
              onClick={() => setActiveTab('validacion')}
              style={{ 
                width: '100%', padding: '1rem', textAlign: 'left', border: 'none', 
                background: activeTab === 'validacion' ? '#34495e' : 'transparent', 
                color: 'white', cursor: 'pointer', fontSize: '1rem'
              }}
            >
              ✅ Validación y Correos
            </button>
          )}
        </nav>
        
        <div style={{ padding: '1rem' }}>
          <button 
            onClick={onLogout}
            style={{ width: '100%', padding: '0.75rem', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '2rem', background: '#f8f9fa' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #dee2e6', paddingBottom: '1rem' }}>
          <h1 style={{ margin: 0, color: '#2c3e50' }}>
            {activeTab === 'consulta' && 'Consulta de Beneficiarios'}
            {activeTab === 'importacion' && 'Gestión de Importaciones'}
            {activeTab === 'validacion' && 'Validación Administrativa'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontWeight: 'bold', color: '#34495e' }}>{user?.username} ({user?.rol})</span>
          </div>
        </header>

        <main style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          {activeTab === 'consulta' && <ConsultaPerfiles user={user} />}
          {activeTab === 'importacion' && (isUsuario || isAdmin) && <ImportacionPerfiles />}
          {activeTab === 'validacion' && isAdmin && <ValidacionPerfiles />}
        </main>
      </div>
    </div>
  );
};

export default MainScreen;
