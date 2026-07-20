import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';

const HistorialImportaciones = () => {
  const [evidencias, setEvidencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchEvidencias = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/perfiles/evidencias`, {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEvidencias(data);
      } else {
        const errData = await res.json();
        setErrorMsg(`Error al cargar: ${errData.detail || 'desconocido'}`);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Error de conexión");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEvidencias();
  }, []);

  const handleDownload = async (id, fileName) => {
    try {
      const res = await fetch(`${API_BASE}/perfiles/evidencias/${id}/download`, {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        alert("Error al descargar archivo");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    }
  };

  const handleDelete = async (id, count) => {
    if (!window.confirm(`¿Está completamente seguro de eliminar esta importación? Se eliminarán ${count} perfiles asociados a ella. Esta acción NO se puede deshacer.`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/perfiles/evidencias/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || "Importación eliminada.");
        fetchEvidencias();
      } else {
        const errData = await res.json();
        alert(`Error al eliminar: ${errData.detail || 'desconocido'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Historial de Importaciones</h2>
        <button 
          onClick={fetchEvidencias}
          style={{ padding: '0.5rem 1rem', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          🔄 Actualizar
        </button>
      </div>
      
      <p style={{ color: '#7f8c8d', marginBottom: '2rem' }}>
        A continuación se listan todos los archivos Excel subidos al sistema. Puede descargar el archivo original o eliminarlo para retrotraer (borrar) todos los perfiles asociados a esa subida.
      </p>

      {errorMsg && (
        <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '4px' }}>
          {errorMsg}
        </div>
      )}

      {loading ? (
        <p>Cargando historial...</p>
      ) : evidencias.length === 0 ? (
        <p>No hay importaciones registradas.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f2f2f2', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '12px' }}>ID</th>
                <th style={{ padding: '12px' }}>Archivo</th>
                <th style={{ padding: '12px' }}>Fecha y Hora</th>
                <th style={{ padding: '12px' }}>Perfiles Generados</th>
                <th style={{ padding: '12px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {evidencias.map((ev) => (
                <tr key={ev.id_evidencia} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '12px' }}>#{ev.id_evidencia}</td>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>{ev.nombre_archivo}</td>
                  <td style={{ padding: '12px' }}>{new Date(ev.fecha_importacion).toLocaleString('es-PY')}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ background: '#34495e', color: 'white', padding: '4px 8px', borderRadius: '12px', fontSize: '0.9rem' }}>
                      {ev.cantidad_perfiles}
                    </span>
                  </td>
                  <td style={{ padding: '12px', display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => handleDownload(ev.id_evidencia, ev.nombre_archivo)}
                      style={{ padding: '0.5rem', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}
                      title="Descargar Excel Original"
                    >
                      ⬇ Descargar
                    </button>
                    <button 
                      onClick={() => handleDelete(ev.id_evidencia, ev.cantidad_perfiles)}
                      style={{ padding: '0.5rem', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}
                      title="Eliminar y Retrotraer Perfiles"
                    >
                      🗑 Revertir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default HistorialImportaciones;
