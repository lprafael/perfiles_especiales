import React from 'react';
import { useReactTable, getCoreRowModel, getFilteredRowModel, flexRender } from '@tanstack/react-table';
import * as XLSX from 'xlsx';

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

export default function ReporteMaximizadoModal({ data, columns, onClose, franjasLV, franjasSab, franjaDom, mesesBaja, mesesAlta, fechaInicio, fechaFin, diasSeleccionados }) {
  const defaultColumn = React.useMemo(
    () => ({
      Filter: DefaultColumnFilter,
    }),
    []
  );

  const table = useReactTable({
    data,
    columns,
    defaultColumn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {},
  });

  // --- Exportar a Excel con hoja de parámetros ---
  function exportarFiltradoExcel() {
    // Obtener solo los datos visibles tras el filtro
    const filasFiltradas = table.getRowModel().rows.map(row => {
      const obj = {};
      row.getVisibleCells().forEach(cell => {
        obj[cell.column.columnDef.header || cell.column.id] = cell.getValue();
      });
      return obj;
    });
    if (filasFiltradas.length === 0) return;
    // Exportar a Excel
    const ws = XLSX.utils.json_to_sheet(filasFiltradas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Filtrado');

    // Hoja de parámetros (idéntica a ModalPromedioOperativaWizard)
    const MESES = [
      { key: 1, label: 'Enero' }, { key: 2, label: 'Febrero' }, { key: 3, label: 'Marzo' },
      { key: 4, label: 'Abril' }, { key: 5, label: 'Mayo' }, { key: 6, label: 'Junio' },
      { key: 7, label: 'Julio' }, { key: 8, label: 'Agosto' }, { key: 9, label: 'Septiembre' },
      { key: 10, label: 'Octubre' }, { key: 11, label: 'Noviembre' }, { key: 12, label: 'Diciembre' },
    ];
    const DIAS_SEMANA = [
      { key: 1, label: 'Lunes' }, { key: 2, label: 'Martes' }, { key: 3, label: 'Miércoles' },
      { key: 4, label: 'Jueves' }, { key: 5, label: 'Viernes' }, { key: 6, label: 'Sábado' }, { key: 7, label: 'Domingo' },
    ];
    const parametros = [];
    parametros.push(['Lunes a Viernes']);
    (franjasLV||[]).filter(f=>f.checked).forEach(f => {
      parametros.push([`${f.label}: de ${f.inicio} a ${f.fin} hs`]);
    });
    parametros.push(['Sábados']);
    (franjasSab||[]).filter(f=>f.checked).forEach(f => {
      parametros.push([`${f.label}: de ${f.inicio} a ${f.fin} hs`]);
    });
    parametros.push(['Domingos y Feriados']);
    if (franjaDom && franjaDom.checked) {
      parametros.push([`${franjaDom.label}: de ${franjaDom.inicio} a ${franjaDom.fin} hs`]);
    }
    parametros.push(['']);
    parametros.push([`Meses de baja demanda:`, (mesesBaja||[]).map(m=>MESES.find(mm=>mm.key===m)?.label).join(', ') || '---']);
    parametros.push([`Meses de alta demanda:`, (mesesAlta||[]).map(m=>MESES.find(mm=>mm.key===m)?.label).join(', ') || '---']);
    parametros.push([`Rango de informe:`, `${fechaInicio || '---'} a ${fechaFin || '---'}`]);
    parametros.push([`Días seleccionados:`, (diasSeleccionados||[]).map(d => DIAS_SEMANA.find(x=>x.key===d)?.label).join(', ') || '---']);
    const wsParams = XLSX.utils.aoa_to_sheet(parametros);
    XLSX.utils.book_append_sheet(wb, wsParams, 'Parámetros');

    // Obtener fecha y hora actual para el nombre del archivo
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const fechaHora = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const nombreArchivo = `reporte_filtrado_(${fechaHora}).xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  }

  return (
    <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.45)',zIndex:5000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#fff',borderRadius:12,padding:24,minWidth:'90vw',minHeight:'90vh',maxWidth:'98vw',maxHeight:'98vh',boxShadow:'0 4px 24px #0006',position:'relative',overflow:'auto'}}>
        <button onClick={onClose} style={{position:'absolute',top:18,right:18,fontSize:22,background:'#e3f2fd',color:'#1976d2',border:'2px solid #90caf9',borderRadius:20,width:'auto',height:48,padding:'0 24px',cursor:'pointer',zIndex:5001,fontWeight:'bold',display:'flex',alignItems:'center',gap:8}}>
          Cerrar
        </button>
        <button onClick={exportarFiltradoExcel} style={{position:'absolute',top:18,right:140,fontSize:18,background:'#388e3c',color:'#fff',border:'none',borderRadius:8,padding:'8px 24px',fontWeight:'bold',cursor:'pointer',zIndex:5001}}>
          Guardar en Excel
        </button>
        <h2 style={{marginTop:0,marginBottom:24,fontSize:28}}>Reporte de Promedio de Buses</h2>
        <div style={{overflowX:'auto',maxHeight:'80vh'}}>
          <table style={{width:'100%',fontSize:14,borderCollapse:'collapse'}}>
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} style={{background:'#e3f2fd',position:'sticky',top:0,zIndex:2}}>
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
                    <td key={cell.id} style={{borderBottom:'1px solid #ddd',padding:'4px 8px'}}>
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