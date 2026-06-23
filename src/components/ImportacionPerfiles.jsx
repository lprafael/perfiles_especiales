import React, { useState } from 'react';
import { API_BASE } from '../config';

const ImportacionPerfiles = () => {
  const [file, setFile] = useState(null);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

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
      setStatusMsg("");
    }
  };

  const handleProcess = async (action) => {
    if (!file) {
      alert("Por favor seleccione un archivo Excel");
      return;
    }

    const endpoint = action === 'verify' ? '/verify' : '/import';
    
    if (action === 'verify') setLoadingVerify(true);
    else setLoadingImport(true);
    
    setStatusMsg("");

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/perfiles${endpoint}`, {
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
          
          if (action === 'verify') {
            setStatusMsg("Se encontraron errores o duplicados. Revise el archivo descargado.");
            alert("Verificación finalizada con errores. Se descargó un archivo Excel.");
          } else {
            setStatusMsg("Importación parcial. Los registros sin errores se guardaron con estado 'Pendiente'.");
            alert("Importación parcial. Se encontraron errores o duplicados, se descargó un archivo con los registros rechazados.");
            setFile(null); // Reset on successful import
          }
        } else {
          const data = await res.json();
          if (action === 'verify') {
            setStatusMsg("El archivo es válido. No se encontraron errores ni duplicados. ¡Listo para importar!");
            alert(data.message || "Verificación exitosa.");
          } else {
            setStatusMsg("Todos los registros se importaron exitosamente.");
            alert(data.message || "Importación exitosa.");
            setFile(null); // Reset on successful import
          }
        }
      } else {
        const errorData = await res.json();
        alert(`Error: ${errorData.detail || 'al procesar archivo'}`);
        setStatusMsg("Ocurrió un error al procesar el archivo.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
      setStatusMsg("Error de conexión con el servidor.");
    }
    
    if (action === 'verify') setLoadingVerify(false);
    else setLoadingImport(false);
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
          style={{ marginBottom: '1.5rem', display: 'block' }}
        />
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => handleProcess('verify')}
            disabled={loadingVerify || loadingImport || !file}
            style={{ 
              flex: 1,
              padding: '0.75rem 1rem', 
              background: loadingVerify || loadingImport || !file ? '#95a5a6' : '#f39c12', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: loadingVerify || loadingImport || !file ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {loadingVerify ? "Verificando..." : "🔍 Verificar Excel"}
          </button>

          <button 
            onClick={() => handleProcess('import')}
            disabled={loadingVerify || loadingImport || !file}
            style={{ 
              flex: 1,
              padding: '0.75rem 1rem', 
              background: loadingVerify || loadingImport || !file ? '#95a5a6' : '#2980b9', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: loadingVerify || loadingImport || !file ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {loadingImport ? "Importando..." : "⬆ Importar Datos"}
          </button>
        </div>
        
        {statusMsg && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#ecf0f1', borderRadius: '4px', borderLeft: '4px solid #3498db' }}>
            {statusMsg}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportacionPerfiles;
