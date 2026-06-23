import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';

const ValidacionPerfiles = () => {
  const [unverified, setUnverified] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [emails, setEmails] = useState('');
  const [batchSize, setBatchSize] = useState(1500);
  const [sending, setSending] = useState(false);

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
        setSelectedIds([]); // Reset selection
      }
    } catch (err) {
      console.error(err);
      alert('Error obteniendo listado de no verificados');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUnverified();
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

  const handleValidate = async () => {
    if (selectedIds.length === 0) {
      alert("Seleccione al menos un registro para validar");
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
        alert("Perfiles validados exitosamente");
        fetchUnverified();
      } else {
        alert("Error al validar");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    }
    setLoading(false);
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!emails) {
      alert("Debe ingresar al menos un correo");
      return;
    }

    setSending(true);
    const formData = new FormData();
    formData.append('correos', emails);
    formData.append('cantidad_por_correo', batchSize);

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
          onClick={handleValidate}
          disabled={selectedIds.length === 0 || loading}
          style={{ 
            padding: '0.5rem 1rem', 
            background: selectedIds.length === 0 ? '#bdc3c7' : '#f39c12', 
            color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' 
          }}
        >
          Validar Seleccionados ({selectedIds.length})
        </button>
      </div>

      {loading ? <p>Cargando...</p> : (
        <div style={{ overflowX: 'auto', maxHeight: '400px', marginBottom: '2rem' }}>
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
                  <td colSpan="5" style={{ padding: '1rem', textAlign: 'center', border: '1px solid #ccc' }}>No hay registros pendientes de verificación.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <hr style={{ margin: '2rem 0' }}/>

      <div style={{ background: '#ecf0f1', padding: '1.5rem', borderRadius: '8px', maxWidth: '600px' }}>
        <h3>Remitir Listado Validados por Correo</h3>
        <p style={{ fontSize: '0.9rem', color: '#555' }}>Envíe el listado completo de todos los beneficiarios que ya están validados a los correos especificados.</p>
        
        <form onSubmit={handleSendEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
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
            disabled={sending}
            style={{ 
              padding: '0.75rem', 
              background: sending ? '#95a5a6' : '#8e44ad', 
              color: 'white', border: 'none', borderRadius: '4px', cursor: sending ? 'not-allowed' : 'pointer' 
            }}
          >
            {sending ? "Iniciando envío..." : "Enviar Correos"}
          </button>
        </form>
      </div>

    </div>
  );
};

export default ValidacionPerfiles;
