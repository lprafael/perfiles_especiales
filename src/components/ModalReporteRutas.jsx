import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { useReactTable, getCoreRowModel, getFilteredRowModel, flexRender } from '@tanstack/react-table';
import { API_BASE } from '../config';

function DefaultColumnFilter({ column }) {
  const columnFilterValue = column.getFilterValue() || '';
  return (
    <input
      value={columnFilterValue}
      onChange={e => column.setFilterValue(e.target.value)}
      placeholder={`Filtrar...`}
      style={{ width: '100%' }}
    />
  );
}

export default function ModalReporteRutas({ onClose }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargarDatos() {
      setLoading(true);
      try {
        const resEmp = await fetch(`${API_BASE}/empresas`);
        const empresasData = await resEmp.json();
        let allRows = [];
        for (const empresa of empresasData) {
          const resIt = await fetch(`${API_BASE}/empresas/${empresa.id_eot_vmt_hex}/itinerarios`);
          const its = await resIt.json();
          const rows = its.map(it => {
            // Lógica del sidebar para shapes
            let hasLines = false;
            if (Array.isArray(it.shape_lines)) {
              hasLines = it.shape_lines.some(line => Array.isArray(line) && line.length > 1);
            }
            // Estado shape (✔️/❌)
            let shapeCortado = false;
            if (!Array.isArray(it.shape_lines) || it.shape_lines.length === 0) {
              shapeCortado = true;
            } else {
              if (it.shape_lines.length > 1) shapeCortado = true;
              it.shape_lines.forEach(line => {
                if (!Array.isArray(line) || line.length < 2) shapeCortado = true;
              });
            }
            return {
              Empresa: empresa.eot_nombre,
              Ruta: it.ruta_hex,
              Linea: it.linea,
              Ramal: it.ramal || '',
              Origen: it.origen,
              Destino: it.destino,
              Identificacion: it.identificacion,
              'Shapes cargados': hasLines ? 'Sí' : 'No',
              'Estado shapes': shapeCortado ? '❌' : '✔️'
            };
          });
          allRows = allRows.concat(rows);
        }
        setData(allRows);
      } catch (e) {
        alert('Error al cargar datos de empresas e itinerarios');
      }
      setLoading(false);
    }
    cargarDatos();
  }, []);

  const columns = React.useMemo(() => [
    { accessorKey: 'Empresa', header: 'Empresa', Filter: DefaultColumnFilter },
    { accessorKey: 'Ruta', header: 'Ruta (Hex)', Filter: DefaultColumnFilter },
    { accessorKey: 'Linea', header: 'Línea', Filter: DefaultColumnFilter },
    { accessorKey: 'Ramal', header: 'Ramal', Filter: DefaultColumnFilter },
    { accessorKey: 'Origen', header: 'Origen', Filter: DefaultColumnFilter },
    { accessorKey: 'Destino', header: 'Destino', Filter: DefaultColumnFilter },
    { accessorKey: 'Identificacion', header: 'Identificación', Filter: DefaultColumnFilter },
    { accessorKey: 'Shapes cargados', header: 'Shapes cargados', Filter: DefaultColumnFilter },
    { accessorKey: 'Estado shapes', header: 'Estado shapes', Filter: DefaultColumnFilter },
  ], []);

  const defaultColumn = React.useMemo(() => ({ Filter: DefaultColumnFilter }), []);

  const table = useReactTable({
    data,
    columns,
    defaultColumn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {},
  });

  function exportarFiltradoExcel() {
    const filasFiltradas = table.getRowModel().rows.map(row => {
      const obj = {};
      row.getVisibleCells().forEach(cell => {
        obj[cell.column.columnDef.header || cell.column.id] = cell.getValue();
      });
      return obj;
    });
    if (filasFiltradas.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(filasFiltradas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rutas');
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const fechaHora = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const nombreArchivo = `reporte_rutas_(${fechaHora}).xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.45)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, minWidth: '90vw', minHeight: '90vh', maxWidth: '98vw', maxHeight: '98vh', boxShadow: '0 4px 24px #0006', position: 'relative', overflow: 'auto' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 18, right: 18, fontSize: 22, background: '#e3f2fd', color: '#1976d2', border: '2px solid #90caf9', borderRadius: 20, width: 'auto', height: 48, padding: '0 24px', cursor: 'pointer', zIndex: 6001, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
          Cerrar
        </button>
        <button onClick={exportarFiltradoExcel} style={{ position: 'absolute', top: 18, right: 140, fontSize: 18, background: '#388e3c', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 24px', fontWeight: 'bold', cursor: 'pointer', zIndex: 6001 }}>
          Guardar en Excel
        </button>
        <h2 style={{ marginTop: 0, marginBottom: 24, fontSize: 28 }}>Reporte de Rutas e Itinerarios</h2>
        <div style={{ overflowX: 'auto', maxHeight: '80vh' }}>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} style={{ background: '#e3f2fd', position: 'sticky', top: 0, zIndex: 2 }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <div>{header.column.getCanFilter() ? flexRender(header.column.columnDef.Filter ?? DefaultColumnFilter, { column: header.column }) : null}</div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={{ borderBottom: '1px solid #ddd', padding: '4px 8px' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
