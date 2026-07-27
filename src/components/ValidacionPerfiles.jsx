import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';

const ValidacionPerfiles = () => {
  const [unverified, setUnverified] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [emails, setEmails] = useState('');
  const [subject, setSubject] = useState('Listado de Perfiles Validados');
  const [body, setBody] = useState('Adjunto encontrará el listado de perfiles validados.');
  const [batchSize, setBatchSize] = useState(1500);
  const [sending, setSending] = useState(false);

  const [pendingApproval, setPendingApproval] = useState([]);
  const [selectedApprovalIds, setSelectedApprovalIds] = useState([]);

  const [pendingEmission, setPendingEmission] = useState([]);
  const [selectedEmissionIds, setSelectedEmissionIds] = useState([]);
  const [selectFirstX, setSelectFirstX] = useState(150);
  const [epsDestino, setEpsDestino] = useState('TDP');

  const fetchUnverified = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/unverified`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUnverified(data);
        setSelectedIds([]);
      }
    } catch (err) {
      console.error(err);
      alert('Error obteniendo listado de no verificados');
    }
    setLoading(false);
  };

  const fetchPendingApproval = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/pending_approval`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingApproval(data);
        setSelectedApprovalIds([]);
      }
    } catch (err) {
      console.error(err);
      alert('Error obteniendo listado pendientes de aprobación');
    }
    setLoading(false);
  };

  const fetchPendingEmission = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/pending_emission`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingEmission(data);
        setSelectedEmissionIds([]);
      }
    } catch (err) {
      console.error(err);
      alert('Error obteniendo listado pendientes de emisión');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUnverified();
    fetchPendingApproval();
    fetchPendingEmission();
  }, []);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(unverified.map(p => p.orden));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllApproval = (e) => {
    if (e.target.checked) {
      setSelectedApprovalIds(pendingApproval.map(p => p.orden));
    } else {
      setSelectedApprovalIds([]);
    }
  };

  const handleSelectApproval = (id) => {
    setSelectedApprovalIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllEmission = (e) => {
    if (e.target.checked) {
      setSelectedEmissionIds(pendingEmission.map(p => p.orden));
    } else {
      setSelectedEmissionIds([]);
    }
  };

  const handleSelectEmission = (id) => {
    setSelectedEmissionIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectFirstX = (e) => {
    e.preventDefault();
    if (selectFirstX > 0) {
      const ids = pendingEmission.slice(0, selectFirstX).map(p => p.orden);
      setSelectedEmissionIds(ids);
    }
  };

  const handleVerify = async () => {
    if (selectedIds.length === 0) {
      alert("Seleccione al menos un registro para verificar");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/validate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify(selectedIds)
      });
      if (res.ok) {
        alert("Perfiles verificados exitosamente");
        fetchUnverified();
        fetchPendingApproval();
      } else {
        alert("Error al verificar");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    }
    setLoading(false);
  };

  const handleApprove = async () => {
    if (selectedApprovalIds.length === 0) {
      alert("Seleccione al menos un registro para aprobar");
      return;
    }
    
    setLoading(true);
    try {
      const device_id = localStorage.getItem('device_id') || 'unknown-device';
      const res = await fetch(`${API_BASE}/perfiles/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ids: selectedApprovalIds,
          device_id: device_id
        })
      });
      if (res.ok) {
        alert("Perfiles aprobados exitosamente");
        fetchPendingApproval();
        fetchPendingEmission();
      } else {
        alert("Error al aprobar");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    }
    setLoading(false);
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (selectedEmissionIds.length === 0) {
      alert("Debe seleccionar al menos un registro para enviar.");
      return;
    }
    if (!epsDestino) {
      alert("Debe seleccionar una EPS destino.");
      return;
    }
    if (!emails) {
      alert("Debe ingresar al menos un correo destino.");
      return;
    }

    setSending(true);
    const formData = new FormData();
    formData.append('correos', emails);
    formData.append('cantidad_por_correo', batchSize);
    formData.append('asunto', subject);
    formData.append('cuerpo', body);
    formData.append('eps', epsDestino);
    formData.append('ids', selectedEmissionIds.join(','));

    try {
      const res = await fetch(`${API_BASE}/perfiles/send_email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: formData
      });
      
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Correos encolados exitosamente");
        fetchPendingEmission();
        setSelectedEmissionIds([]);
      } else {
        alert(`Error: ${data.detail}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error al solicitar envío de correos");
    }
    setSending(false);
  };

  return (
    <div>
      <h2>Validación de Perfiles Especiales</h2>
      <p>Listado de beneficiarios importados pendientes de validación.</p>

      <div style={{ marginBottom: '1rem' }}>
        <button 
          onClick={handleVerify}
          disabled={selectedIds.length === 0 || loading}
          style={{ 
            padding: '0.5rem 1rem', 
            background: selectedIds.length === 0 ? '#bdc3c7' : '#3498db', 
            color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' 
          }}
        >
          Verificar Seleccionados ({selectedIds.length})
        </button>
      </div>

      {loading ? <p>Cargando...</p> : (
        <div style={{ overflowX: 'auto', maxHeight: '300px', marginBottom: '2rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f0f0f0' }}>
              <tr>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>
                  <input 
                    type="checkbox" 
                    onChange={handleSelectAll}
                    checked={selectedIds.length === unverified.length && unverified.length > 0}
                  />
                </th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Documento</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Nombre y Apellido</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Lote</th>
              </tr>
            </thead>
            <tbody>
              {unverified.length > 0 ? unverified.map(p => (
                <tr key={p.orden}>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(p.orden)}
                      onChange={() => handleSelect(p.orden)}
                    />
                  </td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.cedula_identidad}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.nombre_apellido}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.Lote || '-'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="4" style={{ padding: '1rem', textAlign: 'center', border: '1px solid #ccc' }}>No hay registros pendientes de verificación.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <hr style={{ margin: '2rem 0' }}/>
      
      <h2>Aprobación de Perfiles Especiales</h2>
      <p>Listado de beneficiarios verificados pendientes de aprobación.</p>

      <div style={{ marginBottom: '1rem' }}>
        <button 
          onClick={handleApprove}
          disabled={selectedApprovalIds.length === 0 || loading}
          style={{ 
            padding: '0.5rem 1rem', 
            background: selectedApprovalIds.length === 0 ? '#bdc3c7' : '#f39c12', 
            color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' 
          }}
        >
          Aprobar Seleccionados ({selectedApprovalIds.length})
        </button>
      </div>

      {loading ? <p>Cargando...</p> : (
        <div style={{ overflowX: 'auto', maxHeight: '300px', marginBottom: '2rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f0f0f0' }}>
              <tr>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>
                  <input 
                    type="checkbox" 
                    onChange={handleSelectAllApproval}
                    checked={selectedApprovalIds.length === pendingApproval.length && pendingApproval.length > 0}
                  />
                </th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Documento</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Nombre y Apellido</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Lote</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Verificado por</th>
              </tr>
            </thead>
            <tbody>
              {pendingApproval.length > 0 ? pendingApproval.map(p => (
                <tr key={p.orden}>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedApprovalIds.includes(p.orden)}
                      onChange={() => handleSelectApproval(p.orden)}
                    />
                  </td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.cedula_identidad}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.nombre_apellido}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.Lote || '-'}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.usuario_verif?.nombre_completo || '-'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" style={{ padding: '1rem', textAlign: 'center', border: '1px solid #ccc' }}>No hay registros pendientes de aprobación.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <hr style={{ margin: '2rem 0' }}/>
      
      <h2>Pendientes de Emisión</h2>
      <p>Listado de beneficiarios aprobados que están listos para ser enviados por correo a una EPS.</p>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          Total disponibles: <strong>{pendingEmission.length}</strong>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input 
            type="number" 
            value={selectFirstX}
            onChange={(e) => setSelectFirstX(Number(e.target.value))}
            min="1" max={pendingEmission.length || 1}
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', width: '80px' }}
          />
          <button 
            onClick={handleSelectFirstX}
            disabled={pendingEmission.length === 0}
            style={{ 
              padding: '0.5rem 1rem', 
              background: pendingEmission.length === 0 ? '#bdc3c7' : '#9b59b6', 
              color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' 
            }}
          >
            Seleccionar los primeros {selectFirstX}
          </button>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          Seleccionados: <strong>{selectedEmissionIds.length}</strong>
        </div>
      </div>

      {loading ? <p>Cargando...</p> : (
        <div style={{ overflowX: 'auto', maxHeight: '300px', marginBottom: '2rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f0f0f0' }}>
              <tr>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>
                  <input 
                    type="checkbox" 
                    onChange={handleSelectAllEmission}
                    checked={selectedEmissionIds.length === pendingEmission.length && pendingEmission.length > 0}
                  />
                </th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Documento</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Nombre y Apellido</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Lote</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Aprobado por</th>
              </tr>
            </thead>
            <tbody>
              {pendingEmission.length > 0 ? pendingEmission.map(p => (
                <tr key={p.orden}>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedEmissionIds.includes(p.orden)}
                      onChange={() => handleSelectEmission(p.orden)}
                    />
                  </td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.cedula_identidad}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.nombre_apellido}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.Lote || '-'}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.usuario_aprob?.nombre_completo || '-'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" style={{ padding: '1rem', textAlign: 'center', border: '1px solid #ccc' }}>No hay registros pendientes de emisión.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <hr style={{ margin: '2rem 0' }}/>

      <div style={{ background: '#ecf0f1', padding: '1.5rem', borderRadius: '8px', maxWidth: '600px' }}>
        <h3>Remitir Listado por Correo y Emitir</h3>
        <p style={{ fontSize: '0.9rem', color: '#555' }}>Envíe los perfiles seleccionados a los correos especificados, registrando su EPS correspondiente.</p>
        
        <form onSubmit={handleSendEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>EPS Destino:</label>
            <select 
              value={epsDestino}
              onChange={(e) => setEpsDestino(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', background: 'white' }}
            >
              <option value="TDP">TDP</option>
              <option value="EPAS">EPAS</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Correos Destino (separados por coma):</label>
            <input 
              type="text" 
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="correo1@ejemplo.com, correo2@ejemplo.com"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Asunto:</label>
            <input 
              type="text" 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Cuerpo del mensaje:</label>
            <textarea 
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows="4"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Registros por correo (lotes):</label>
            <input 
              type="number" 
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              min="100" max="10000"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>
          <button 
            type="submit" 
            disabled={sending || selectedEmissionIds.length === 0}
            style={{ 
              padding: '0.75rem', 
              background: (sending || selectedEmissionIds.length === 0) ? '#95a5a6' : '#8e44ad', 
              color: 'white', border: 'none', borderRadius: '4px', cursor: (sending || selectedEmissionIds.length === 0) ? 'not-allowed' : 'pointer' 
            }}
          >
            {sending ? "Iniciando envío..." : `Enviar ${selectedEmissionIds.length} Correos`}
          </button>
        </form>
      </div>

    </div>
  );
};

export default ValidacionPerfiles;
