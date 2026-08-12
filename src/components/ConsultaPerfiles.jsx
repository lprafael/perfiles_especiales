import React, { useState, useEffect, useMemo } from 'react';
import { API_BASE } from '../config';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' });
};

const ConsultaPerfiles = ({ user }) => {
  const [perfiles, setPerfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [editingSerial, setEditingSerial] = useState(null);
  const [serialValue, setSerialValue] = useState("");

  const handleSaveSerial = async (orden) => {
    try {
      const res = await fetch(`${API_BASE}/perfiles/${orden}/serial_mdp`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({ serial_mdp: serialValue })
      });
      if (res.ok) {
        const updatedProfile = await res.json();
        setPerfiles(prev => prev.map(p => p.orden === orden ? updatedProfile : p));
        setEditingSerial(null);
        setSerialValue('');
      } else {
        alert('Error al guardar el Serial MDP');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al guardar el Serial MDP');
    }
  };

  // Estados para ordenamiento y filtrado por columna
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [columnFilters, setColumnFilters] = useState({
    cedula_identidad: '',
    nombre_apellido: '',
    perfil: '',
    Lote: '',
    serial_mdp: '',
    estado: '',
    usuario_carga: ''
  });

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
    // Carga inicial deshabilitada
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchPerfiles(search);
  };

  // Filtrado y ordenamiento en memoria
  const filteredAndSortedPerfiles = useMemo(() => {
    let result = [...perfiles];

    // Aplicar filtros por columna
    if (columnFilters.cedula_identidad) {
      result = result.filter(p => p.cedula_identidad?.toLowerCase().includes(columnFilters.cedula_identidad.toLowerCase()));
    }
    if (columnFilters.nombre_apellido) {
      result = result.filter(p => p.nombre_apellido?.toLowerCase().includes(columnFilters.nombre_apellido.toLowerCase()));
    }
    if (columnFilters.perfil) {
      result = result.filter(p => {
        const perfilStr = p.tipo_perfil ? p.tipo_perfil.tipo_especial : String(p.id_tipo_perfil);
        return perfilStr?.toLowerCase().includes(columnFilters.perfil.toLowerCase());
      });
    }
    if (columnFilters.Lote) {
      result = result.filter(p => (p.Lote || '-').toLowerCase().includes(columnFilters.Lote.toLowerCase()));
    }
    if (columnFilters.serial_mdp) {
      result = result.filter(p => (p.serial_mdp || '-').toLowerCase().includes(columnFilters.serial_mdp.toLowerCase()));
    }
    if (columnFilters.estado) {
      result = result.filter(p => {
        const estadoStr = p.estado_solicitud ? p.estado_solicitud.descripcion : 'desconocido';
        return estadoStr.toLowerCase().includes(columnFilters.estado.toLowerCase());
      });
    }
    if (columnFilters.usuario_carga) {
      result = result.filter(p => {
        const usr = p.usuario_carga ? p.usuario_carga.nombre_completo : '-';
        return usr.toLowerCase().includes(columnFilters.usuario_carga.toLowerCase());
      });
    }

    // Aplicar ordenamiento
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === 'perfil') {
          aValue = a.tipo_perfil ? a.tipo_perfil.tipo_especial : String(a.id_tipo_perfil);
          bValue = b.tipo_perfil ? b.tipo_perfil.tipo_especial : String(b.id_tipo_perfil);
        } else if (sortConfig.key === 'estado') {
          aValue = a.estado_solicitud ? a.estado_solicitud.descripcion : '';
          bValue = b.estado_solicitud ? b.estado_solicitud.descripcion : '';
        } else if (sortConfig.key === 'Lote') {
          aValue = a.Lote || '-';
          bValue = b.Lote || '-';
        } else if (sortConfig.key === 'serial_mdp') {
          aValue = a.serial_mdp || '-';
          bValue = b.serial_mdp || '-';
        } else if (sortConfig.key === 'usuario_carga') {
          aValue = a.usuario_carga ? a.usuario_carga.nombre_completo : '-';
          bValue = b.usuario_carga ? b.usuario_carga.nombre_completo : '-';
        }

        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';

        if (typeof aValue === 'string') aValue = aValue.toLowerCase();
        if (typeof bValue === 'string') bValue = bValue.toLowerCase();

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [perfiles, columnFilters, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleFilterChange = (e, key) => {
    setColumnFilters(prev => ({ ...prev, [key]: e.target.value }));
  };

  const clearFilters = () => {
    setSearch(''); 
    setColumnFilters({ 
      cedula_identidad: '', nombre_apellido: '', perfil: '', Lote: '', serial_mdp: '', estado: '', usuario_carga: '' 
    });
    setSortConfig({ key: null, direction: 'asc' });
    setPerfiles([]);
  };

  return (
    <div>
      <h2>Consulta de Perfiles Especiales</h2>
      
      <form onSubmit={handleSearch} style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <input 
          type="text" 
          placeholder="Buscar por documento o nombre en el servidor..."  
          value={search} 
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '0.5rem', flex: 1, maxWidth: '300px' }}
        />
        <button type="submit" style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Buscar</button>
        <button type="button" onClick={clearFilters} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Limpiar</button>
      </form>

      {loading ? <p>Cargando...</p> : (
        <div style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', minWidth: '1200px' }}>
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', cursor: 'pointer', verticalAlign: 'top' }} onClick={() => requestSort('cedula_identidad')}>
                  Documento {sortConfig.key === 'cedula_identidad' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                  <div style={{ marginTop: '5px' }}>
                    <input type="text" placeholder="Filtrar..." value={columnFilters.cedula_identidad} onChange={(e) => handleFilterChange(e, 'cedula_identidad')} onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', padding: '2px' }} />
                  </div>
                </th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', cursor: 'pointer', verticalAlign: 'top' }} onClick={() => requestSort('nombre_apellido')}>
                  Nombre y Apellido {sortConfig.key === 'nombre_apellido' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                  <div style={{ marginTop: '5px' }}>
                    <input type="text" placeholder="Filtrar..." value={columnFilters.nombre_apellido} onChange={(e) => handleFilterChange(e, 'nombre_apellido')} onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', padding: '2px' }} />
                  </div>
                </th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', cursor: 'pointer', verticalAlign: 'top' }} onClick={() => requestSort('perfil')}>
                  Perfil {sortConfig.key === 'perfil' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                  <div style={{ marginTop: '5px' }}>
                    <input type="text" placeholder="Filtrar..." value={columnFilters.perfil} onChange={(e) => handleFilterChange(e, 'perfil')} onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', padding: '2px' }} />
                  </div>
                </th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', cursor: 'pointer', verticalAlign: 'top' }} onClick={() => requestSort('Lote')}>
                  Lote {sortConfig.key === 'Lote' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                  <div style={{ marginTop: '5px' }}>
                    <input type="text" placeholder="Filtrar..." value={columnFilters.Lote} onChange={(e) => handleFilterChange(e, 'Lote')} onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', padding: '2px' }} />
                  </div>
                </th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', cursor: 'pointer', verticalAlign: 'top' }} onClick={() => requestSort('serial_mdp')}>
                  Serial MDP {sortConfig.key === 'serial_mdp' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                  <div style={{ marginTop: '5px' }}>
                    <input type="text" placeholder="Filtrar..." value={columnFilters.serial_mdp} onChange={(e) => handleFilterChange(e, 'serial_mdp')} onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', padding: '2px' }} />
                  </div>
                </th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', cursor: 'pointer', verticalAlign: 'top' }} onClick={() => requestSort('estado')}>
                  Estado {sortConfig.key === 'estado' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                  <div style={{ marginTop: '5px' }}>
                    <input type="text" placeholder="Filtrar..." value={columnFilters.estado} onChange={(e) => handleFilterChange(e, 'estado')} onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', padding: '2px' }} />
                  </div>
                </th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', cursor: 'pointer', verticalAlign: 'top' }} onClick={() => requestSort('usuario_carga')}>
                  Cargado por {sortConfig.key === 'usuario_carga' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                  <div style={{ marginTop: '5px' }}>
                    <input type="text" placeholder="Filtrar..." value={columnFilters.usuario_carga} onChange={(e) => handleFilterChange(e, 'usuario_carga')} onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', padding: '2px' }} />
                  </div>
                </th>
                
                {/* Fechas */}
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', cursor: 'pointer', verticalAlign: 'top', fontSize: '0.85rem' }} onClick={() => requestSort('fecha_solicitud')}>
                  F. Solicitud {sortConfig.key === 'fecha_solicitud' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', cursor: 'pointer', verticalAlign: 'top', fontSize: '0.85rem' }} onClick={() => requestSort('fecha_verificacion')}>
                  F. Verif. {sortConfig.key === 'fecha_verificacion' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', cursor: 'pointer', verticalAlign: 'top', fontSize: '0.85rem' }} onClick={() => requestSort('fecha_aprobacion')}>
                  F. Aprob. {sortConfig.key === 'fecha_aprobacion' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', cursor: 'pointer', verticalAlign: 'top', fontSize: '0.85rem' }} onClick={() => requestSort('fecha_emision')}>
                  F. Emisión {sortConfig.key === 'fecha_emision' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedPerfiles.length > 0 ? filteredAndSortedPerfiles.map(p => {
                
                // Color por estado
                let estadoColor = 'black';
                let estadoTxt = p.estado_solicitud ? p.estado_solicitud.descripcion : 'Desconocido';
                if (p.id_estado_solicitud === 1) estadoColor = 'orange'; // Solicitado
                if (p.id_estado_solicitud === 2) estadoColor = 'blue';   // Verificado
                if (p.id_estado_solicitud === 3) estadoColor = 'green';  // Aprobado
                if (p.id_estado_solicitud === 4) estadoColor = 'red';    // Rechazado
                if (p.id_estado_solicitud === 5) estadoColor = 'purple'; // Emitido

                return (
                  <tr key={p.orden}>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.cedula_identidad}</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.nombre_apellido}</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.tipo_perfil ? p.tipo_perfil.tipo_especial : p.id_tipo_perfil}</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.Lote || '-'}</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', minWidth: '150px' }}>
                      {user && (user.rol === 'admin' || user.rol === 'sysadmin') ? (
                        editingSerial === p.orden ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <input 
                              type="text" 
                              value={serialValue} 
                              onChange={e => setSerialValue(e.target.value)} 
                              style={{ width: '80px', padding: '2px' }}
                            />
                            <button onClick={() => handleSaveSerial(p.orden)} style={{ padding: '2px 4px', cursor: 'pointer' }} title="Guardar">💾</button>
                            <button onClick={() => setEditingSerial(null)} style={{ padding: '2px 4px', cursor: 'pointer' }} title="Cancelar">❌</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{p.serial_mdp || '-'}</span>
                            <button 
                              onClick={() => { setEditingSerial(p.orden); setSerialValue(p.serial_mdp || ''); }}
                              style={{ padding: '2px', cursor: 'pointer', border: 'none', background: 'none' }}
                              title="Editar Serial"
                            >✏️</button>
                          </div>
                        )
                      ) : (
                        p.serial_mdp || '-'
                      )}
                    </td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontWeight: 'bold', color: estadoColor }}>
                      {estadoTxt}
                    </td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>
                      {p.usuario_carga ? p.usuario_carga.nombre_completo : '-'}
                    </td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontSize: '0.85rem' }}>{formatDate(p.fecha_solicitud)}</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontSize: '0.85rem' }}>{formatDate(p.fecha_verificacion)}</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontSize: '0.85rem' }}>{formatDate(p.fecha_aprobacion)}</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontSize: '0.85rem' }}>{formatDate(p.fecha_emision)}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="11" style={{ padding: '1rem', textAlign: 'center', border: '1px solid #ccc' }}>No se encontraron registros en esta vista.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ConsultaPerfiles;
