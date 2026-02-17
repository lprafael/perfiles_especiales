import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';

function SelectorEmpresas() {
  const [empresas, setEmpresas] = useState([]);
  const [error, setError] = useState(null);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/empresas`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        setEmpresas(data);
      })
      .catch(err => {
        console.error('Error al cargar empresas:', err);
        setError('Error al cargar las empresas.');
      });
  }, []); // Se ejecuta solo una vez al montar el componente

  const handleChange = (event) => {
    const empresaId = event.target.value;
    setSelectedEmpresaId(empresaId);
    if (empresaId) {
      mostrarAviso("Empresa seleccionada correctamente", "success");
      // Aquí puedes realizar otras acciones al seleccionar una empresa
    }
  };

  return (
    <div className="selector">
      <select id="empresa-select" value={selectedEmpresaId} onChange={handleChange}>
        <option value="">Seleccione una empresa</option>
        {error && <option disabled>{error}</option>}
        {empresas.map(empresa => (
          <option
            key={empresa.id_eot_vmt_hex || empresa.eot_nombre || Math.random()}
            value={empresa.id_eot_vmt_hex || ''}
          >
            {empresa.eot_nombre || 'Sin nombre'}
          </option>
        ))}
      </select>
    </div>
  );
}

// Función de ejemplo para mostrar un aviso (debes implementarla visualmente)
function mostrarAviso(mensaje, tipo) {
  console.log(`Aviso: ${mensaje} (${tipo})`);
  // En tu aplicación real, podrías usar un componente de notificación o actualizar el estado para mostrar un mensaje.
}

export default SelectorEmpresas;