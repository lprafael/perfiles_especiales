import React, { useEffect, useState } from 'react';

const EmpresaSelect = () => {
  const [empresas, setEmpresas] = useState([]);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState('');

  useEffect(() => {
    fetch('http://localhost:3001/empresas')
      // fetch('http://localhost:8000/empresas')
      .then(response => response.json())
      .then(data => setEmpresas(data))
      .catch(error => console.error('Error al cargar empresas:', error));
  }, []);

  return (
    <div>
      <label htmlFor="empresa-select">Seleccione una empresa:</label><br />
      <select
        id="empresa-select"
        value={empresaSeleccionada}
        onChange={e => setEmpresaSeleccionada(e.target.value)}
      >
        <option value="">--Seleccione--</option>
        {empresas.map(emp => (
          <option key={emp.id_eot_vmt_hex} value={emp.id_eot_vmt_hex}>
            {emp.eot_nombre}
          </option>
        ))}
      </select>

      {empresaSeleccionada && (
        <p>Empresa seleccionada: {empresaSeleccionada}</p>
      )}
    </div>
  );
};

export default EmpresaSelect;
