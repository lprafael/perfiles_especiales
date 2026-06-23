import React, { useState } from 'react';
import { API_BASE } from '../config';

const ImportacionPerfiles = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch(`${API_BASE}/perfiles/template`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "plantilla_perfiles.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        alert("Error al descargar plantilla");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!file) {
      alert("Por favor seleccione un archivo Excel");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/perfiles/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: formData
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("spreadsheetml")) {
          // Descargar archivo de rechazados
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = "rechazados.xlsx";
          document.body.appendChild(a);
          a.click();
          a.remove();
          alert("Importación parcial. Se encontraron duplicados, se descargó un archivo con los registros rechazados.");
        } else {
          const data = await res.json();
          alert(data.message || "Importación exitosa.");
        }
      } else {
        const errorData = await res.json();
        alert(`Error: ${errorData.detail || 'al importar archivo'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    }
    setLoading(false);
    setFile(null); // Reset
  };

  return (
    <div>
      <h2>Importación de Perfiles Especiales</h2>
      <p>Descargue la plantilla, complete los datos e importe el archivo modificado.</p>

      <div style={{ marginBottom: '2rem' }}>
        <button 
          onClick={handleDownloadTemplate}
          style={{ padding: '0.75rem 1.5rem', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          ⬇ Descargar Plantilla Excel
        </button>
      </div>

      <div style={{ border: '1px solid #ccc', padding: '1.5rem', borderRadius: '8px', maxWidth: '500px' }}>
        <h3>Subir Archivo de Beneficiarios</h3>
        <input 
          type="file" 
          accept=".xlsx, .xls" 
          onChange={handleFileChange}
          style={{ marginBottom: '1rem', display: 'block' }}
        />
        <button 
          onClick={handleImport}
          disabled={loading || !file}
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: loading || !file ? '#95a5a6' : '#2980b9', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: loading || !file ? 'not-allowed' : 'pointer' 
          }}
        >
          {loading ? "Importando..." : "⬆ Importar Datos"}
        </button>
      </div>
    </div>
  );
};

export default ImportacionPerfiles;
