import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';

const ConsultaPerfiles = ({ user }) => {
  const [perfiles, setPerfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchPerfiles = async (doc = '') => {
    setLoading(true);
    try {
      const url = new URL(`${API_BASE}/perfiles/`);
      if (doc) url.searchParams.append('q', doc);
      
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPerfiles(data);
      } else {
        alert('Error al consultar perfiles');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión');
    }
    setLoading(false);
  };

  useEffect(() => {
    // Solo hace la búsqueda en vivo si ya ha pasado un pequeño delay (debounce)
    // Esto también maneja la carga inicial cuando search es ''
    const delayDebounceFn = setTimeout(() => {
      fetchPerfiles(search);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchPerfiles(search);
  };

  return (
    <div>
      <h2>Consulta de Perfiles Especiales</h2>
      
      <form onSubmit={handleSearch} style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <input 
          type="text" 
          placeholder="Buscar por documento o nombre..."  
          value={search} 
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '0.5rem', flex: 1, maxWidth: '300px' }}
        />
        <button type="submit" style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Buscar</button>
        <button type="button" onClick={() => {setSearch(''); fetchPerfiles();}} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Limpiar</button>
      </form>

      {loading ? <p>Cargando...</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Documento</th>
              <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Nombre y Apellido</th>
              <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Perfil</th>
              <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Lote</th>
              <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {perfiles.length > 0 ? perfiles.map(p => (
              <tr key={p.orden}>
                <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.cedula_identidad}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.nombre_apellido}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.tipo_perfil ? p.tipo_perfil.tipo_especial : p.id_tipo_perfil}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.Lote || '-'}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>
                  {p.verificado ? <span style={{color: 'green'}}>Verificado</span> : <span style={{color: 'orange'}}>Pendiente</span>}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="5" style={{ padding: '1rem', textAlign: 'center', border: '1px solid #ccc' }}>No se encontraron registros.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ConsultaPerfiles;
