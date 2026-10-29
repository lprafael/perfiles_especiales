import React, { useState, useEffect, useMemo } from 'react';
import { API_BASE } from '../config';
import ModalTrazabilidadTarjeta from './ModalTrazabilidadTarjeta';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' });
};

const ConsultaPerfiles = ({ user }) => {
  const isAdmin = Boolean(user && (user.rol === 'admin' || user.rol === 'sysadmin'));
  const [perfiles, setPerfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [editingSerial, setEditingSerial] = useState(null);
  const [serialValue, setSerialValue] = useState("");

  // Estados para Modal de Trazabilidad y Cambio de Estado
  const [selectedPerfilTrazabilidad, setSelectedPerfilTrazabilidad] = useState(null);
  const [initialTrazabilidadTab, setInitialTrazabilidadTab] = useState('timeline');

  const openModalTrazabilidad = (perfil, tab = 'timeline') => {
    setSelectedPerfilTrazabilidad(perfil);
    setInitialTrazabilidadTab(tab);
  };

  const handlePerfilUpdated = (updatedPerfil) => {
    setPerfiles(prev => prev.map(p => p.orden === updatedPerfil.orden ? updatedPerfil : p));
    setSelectedPerfilTrazabilidad(updatedPerfil);
  };

  // Estados para Observaciones
  const [selectedPerfilObs, setSelectedPerfilObs] = useState(null); // Perfil cuyo modal de observaciones está abierto
  const [observacionesList, setObservacionesList] = useState([]);
  const [loadingObs, setLoadingObs] = useState(false);
  const [newObsText, setNewObsText] = useState("");
  const [submittingObs, setSubmittingObs] = useState(false);

  const openObservaciones = async (perfil) => {
    setSelectedPerfilObs(perfil);
    setNewObsText("");
    setLoadingObs(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/${perfil.orden}/observaciones`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setObservacionesList(data);
      } else {
        setObservacionesList(perfil.observaciones || []);
      }
    } catch (err) {
      console.error(err);
      setObservacionesList(perfil.observaciones || []);
    }
    setLoadingObs(false);
  };

  const handleAddObservacion = async (e) => {
    e.preventDefault();
    if (!newObsText.trim()) return;
    setSubmittingObs(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/${selectedPerfilObs.orden}/observaciones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({ observacion: newObsText })
      });
      if (res.ok) {
        const createdObs = await res.json();
        const updatedList = [createdObs, ...observacionesList];
        setObservacionesList(updatedList);
        setNewObsText("");
        
        // Actualizar el perfil en el listado principal
        setPerfiles(prev => prev.map(p => {
          if (p.orden === selectedPerfilObs.orden) {
            return {
              ...p,
              observaciones: [createdObs, ...(p.observaciones || [])]
            };
          }
          return p;
        }));
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || 'Error al guardar observación');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al guardar la observación');
    }
    setSubmittingObs(false);
  };

  const handleToggleObsStatus = async (obsId, field, currentValue) => {
    try {
      const res = await fetch(`${API_BASE}/perfiles/observaciones/${obsId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({ [field]: !currentValue })
      });
      if (res.ok) {
        const updatedObs = await res.json();
        // Actualizar en la lista del modal
        setObservacionesList(prev => prev.map(o => o.id_observacion === obsId ? updatedObs : o));
        
        // Actualizar en el estado de perfiles principal
        setPerfiles(prev => prev.map(p => {
          if (p.orden === updatedObs.orden) {
            return {
              ...p,
              observaciones: (p.observaciones || []).map(o => o.id_observacion === obsId ? updatedObs : o)
            };
          }
          return p;
        }));
      } else {
        alert('Error al actualizar el estado de la observación');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión');
    }
  };

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
    usuario_carga: '',
    observaciones_filter: '' // '', 'con_obs', 'pendientes_resolver', 'resueltas', 'atendidas', 'pendientes_atender'
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
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.detail || 'Error al consultar perfiles');
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

    // Filtrar por estado de observaciones (pendientes de resolver, etc.)
    if (columnFilters.observaciones_filter) {
      if (columnFilters.observaciones_filter === 'pendientes_resolver') {
        // Al menos una observación con resuelto = false
        result = result.filter(p => (p.observaciones || []).some(o => !o.resuelto));
      } else if (columnFilters.observaciones_filter === 'resueltas') {
        // Tiene observaciones y todas están resueltas
        result = result.filter(p => (p.observaciones || []).length > 0 && (p.observaciones || []).every(o => o.resuelto));
      } else if (columnFilters.observaciones_filter === 'pendientes_atender') {
        // Al menos una observación con atendido = false
        result = result.filter(p => (p.observaciones || []).some(o => !o.atendido));
      } else if (columnFilters.observaciones_filter === 'con_obs') {
        result = result.filter(p => (p.observaciones || []).length > 0);
      } else if (columnFilters.observaciones_filter === 'sin_obs') {
        result = result.filter(p => (!p.observaciones || p.observaciones.length === 0));
      }
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
        } else if (sortConfig.key === 'observaciones') {
          aValue = (a.observaciones || []).length;
          bValue = (b.observaciones || []).length;
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
      cedula_identidad: '', nombre_apellido: '', perfil: '', Lote: '', serial_mdp: '', estado: '', usuario_carga: '', observaciones_filter: '' 
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
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', verticalAlign: 'top', textAlign: 'center', width: '90px' }}>
                  Trazabilidad
                </th>
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
                
                <th style={{ padding: '0.5rem', border: '1px solid #ccc', verticalAlign: 'top', textAlign: 'center', minWidth: '130px' }} onClick={() => requestSort('observaciones')}>
                  Observaciones {sortConfig.key === 'observaciones' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                  <div style={{ marginTop: '5px' }}>
                    <select
                      value={columnFilters.observaciones_filter}
                      onChange={(e) => handleFilterChange(e, 'observaciones_filter')}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '2px', fontSize: '0.8rem' }}
                    >
                      <option value="">Todas</option>
                      <option value="pendientes_resolver">⚠️ Pendientes Resolver</option>
                      <option value="resueltas">✅ Resueltas</option>
                      <option value="pendientes_atender">🕒 Pendientes Atender</option>
                      <option value="con_obs">💬 Con Observaciones</option>
                      <option value="sin_obs">Sin Observaciones</option>
                    </select>
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
                if (p.id_estado_solicitud === 6) estadoColor = '#0284c7'; // Remitido a EPS

                const obsList = p.observaciones || [];
                const obsCount = obsList.length;
                const pendientesResolverCount = obsList.filter(o => !o.resuelto).length;

                return (
                  <tr key={p.orden}>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}>
                      <button 
                        onClick={() => openModalTrazabilidad(p, 'timeline')}
                        style={{
                          padding: '3px 8px',
                          cursor: 'pointer',
                          backgroundColor: '#e0f2fe',
                          border: '1px solid #7dd3fc',
                          borderRadius: '4px',
                          fontSize: '0.82rem',
                          color: '#0369a1',
                          fontWeight: 'bold',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                        title="Ver ficha de trazabilidad y ciclo de vida de la tarjeta"
                      >
                        🛡️ Ficha
                      </button>
                    </td>
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
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveSerial(p.orden);
                                if (e.key === 'Escape') setEditingSerial(null);
                              }}
                              style={{ width: '80px', padding: '2px' }}
                              autoFocus
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
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.82rem',
                          fontWeight: 'bold',
                          backgroundColor: `${estadoColor}15`,
                          color: estadoColor,
                          border: `1px solid ${estadoColor}40`
                        }}>
                          {estadoTxt}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => openModalTrazabilidad(p, 'estado')}
                            style={{
                              padding: '2px 4px',
                              cursor: 'pointer',
                              border: 'none',
                              background: 'none',
                              fontSize: '0.9rem'
                            }}
                            title="Modificar estado de esta tarjeta"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>
                      {p.usuario_carga ? p.usuario_carga.nombre_completo : '-'}
                    </td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}>
                      <button 
                        onClick={() => openObservaciones(p)}
                        style={{
                          padding: '4px 8px',
                          cursor: 'pointer',
                          backgroundColor: pendientesResolverCount > 0 ? '#fff3e0' : obsCount > 0 ? '#e8f5e9' : '#f5f5f5',
                          border: `1px solid ${pendientesResolverCount > 0 ? '#ffb74d' : obsCount > 0 ? '#a5d6a7' : '#e0e0e0'}`,
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                        title={pendientesResolverCount > 0 ? `${pendientesResolverCount} pendiente(s) de resolver` : "Ver / Agregar observaciones"}
                      >
                        <span>💬 {obsCount}</span>
                        {pendientesResolverCount > 0 ? (
                          <span style={{
                            backgroundColor: '#e65100',
                            color: 'white',
                            fontSize: '0.7rem',
                            padding: '1px 5px',
                            borderRadius: '10px',
                            fontWeight: 'bold'
                          }}>
                            {pendientesResolverCount} pend.
                          </span>
                        ) : obsCount > 0 ? (
                          <span style={{ color: '#2e7d32', fontSize: '0.85rem' }}>✓</span>
                        ) : null}
                      </button>
                    </td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontSize: '0.85rem' }}>{formatDate(p.fecha_solicitud)}</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontSize: '0.85rem' }}>{formatDate(p.fecha_verificacion)}</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontSize: '0.85rem' }}>{formatDate(p.fecha_aprobacion)}</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontSize: '0.85rem' }}>{formatDate(p.fecha_emision)}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="13" style={{ padding: '1rem', textAlign: 'center', border: '1px solid #ccc' }}>No se encontraron registros en esta vista.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Observaciones */}
      {selectedPerfilObs && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '680px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1rem',
              borderBottom: '1px solid #eee',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#f8f9fa'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#333' }}>
                  Observaciones - Tarjeta #{selectedPerfilObs.orden}
                </h3>
                <small style={{ color: '#666' }}>
                  {selectedPerfilObs.nombre_apellido} | CI: {selectedPerfilObs.cedula_identidad}
                </small>
              </div>
              <button 
                onClick={() => setSelectedPerfilObs(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  color: '#888'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body - Lista de notas */}
            <div style={{
              padding: '1rem',
              overflowY: 'auto',
              flex: 1,
              backgroundColor: '#fafafa'
            }}>
              {loadingObs ? (
                <p style={{ textAlign: 'center', color: '#666' }}>Cargando observaciones...</p>
              ) : observacionesList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#888' }}>
                  <span style={{ fontSize: '2rem' }}>📝</span>
                  <p style={{ margin: '8px 0 0' }}>No hay observaciones registradas para esta tarjeta.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {observacionesList.map((obs) => (
                    <div 
                      key={obs.id_observacion}
                      style={{
                        background: 'white',
                        border: `1px solid ${obs.resuelto ? '#c8e6c9' : obs.atendido ? '#bbdefb' : '#ffccbc'}`,
                        borderLeft: `5px solid ${obs.resuelto ? '#4caf50' : obs.atendido ? '#2196f3' : '#ff5722'}`,
                        borderRadius: '6px',
                        padding: '0.75rem 1rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                        fontSize: '0.82rem',
                        color: '#666'
                      }}>
                        <span style={{ fontWeight: 'bold', color: '#1976d2' }}>
                          👤 {obs.usuario ? obs.usuario.nombre_completo : `Usuario #${obs.id_usuario}`}
                        </span>
                        <span>🕒 {formatDate(obs.fecha_creacion)}</span>
                      </div>
                      
                      <p style={{
                        margin: '0 0 10px 0',
                        color: '#333',
                        whiteSpace: 'pre-wrap',
                        fontSize: '0.92rem',
                        lineHeight: '1.4'
                      }}>
                        {obs.observacion}
                      </p>

                      {/* Controles Atendido / Resuelto */}
                      <div style={{
                        display: 'flex',
                        gap: '15px',
                        paddingTop: '8px',
                        borderTop: '1px dashed #eee',
                        fontSize: '0.85rem'
                      }}>
                        <label style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          userSelect: 'none',
                          color: obs.atendido ? '#1565c0' : '#666',
                          fontWeight: obs.atendido ? 'bold' : 'normal'
                        }}>
                          <input 
                            type="checkbox"
                            checked={!!obs.atendido}
                            onChange={() => handleToggleObsStatus(obs.id_observacion, 'atendido', obs.atendido)}
                          />
                          <span>👀 Atendido</span>
                        </label>

                        <label style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          userSelect: 'none',
                          color: obs.resuelto ? '#2e7d32' : '#d84315',
                          fontWeight: 'bold'
                        }}>
                          <input 
                            type="checkbox"
                            checked={!!obs.resuelto}
                            onChange={() => handleToggleObsStatus(obs.id_observacion, 'resuelto', obs.resuelto)}
                          />
                          <span>{obs.resuelto ? '✅ Resuelto' : '⏳ Pendiente de resolver'}</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer - Formulario nueva observación */}
            <form onSubmit={handleAddObservacion} style={{
              padding: '1rem',
              borderTop: '1px solid #eee',
              backgroundColor: 'white'
            }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#444' }}>
                Agregar nueva observación:
              </label>
              <textarea
                value={newObsText}
                onChange={(e) => setNewObsText(e.target.value)}
                placeholder="Escribe un comentario o nota sobre esta tarjeta..."
                rows="3"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '0.9rem',
                  resize: 'vertical'
                }}
                disabled={submittingObs}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedPerfilObs(null)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    backgroundColor: '#fff',
                    cursor: 'pointer'
                  }}
                  disabled={submittingObs}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={submittingObs || !newObsText.trim()}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: submittingObs || !newObsText.trim() ? '#90caf9' : '#1976d2',
                    color: 'white',
                    fontWeight: 'bold',
                    cursor: submittingObs || !newObsText.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  {submittingObs ? 'Guardando...' : 'Guardar Observación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Trazabilidad y Cambio de Estado */}
      {selectedPerfilTrazabilidad && (
        <ModalTrazabilidadTarjeta
          perfil={selectedPerfilTrazabilidad}
          onClose={() => setSelectedPerfilTrazabilidad(null)}
          onPerfilUpdated={handlePerfilUpdated}
          isAdmin={isAdmin}
          initialTab={initialTrazabilidadTab}
        />
      )}
    </div>
  );
};

export default ConsultaPerfiles;
