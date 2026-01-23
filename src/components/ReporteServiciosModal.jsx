import React, { useMemo, useState } from 'react';
import { useReactTable, getCoreRowModel, getFilteredRowModel, flexRender } from '@tanstack/react-table';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';

/**
 * Modal de Reporte de Servicios con tabla filtrable y exportación a Word
 * Props:
 * - open: boolean
 * - onClose: function
 * - servicios: array de servicios (cada uno con busNumero, itinerarioNombre, tipoServicio, horaInicio, horaFin, estado, puntosRecorridos[])
 */
export default function ReporteServiciosModal({ open, onClose, servicios, resumen }) {
  // Filtros locales para TanStack Table
  const [columnFilters, setColumnFilters] = useState([]);

  // Preprocesar datos para la tabla
  const data = useMemo(() =>
    servicios.map(s => ({
      bus: s.busNumero,
      itinerario: s.itinerarioNombre,
      tipo: s.tipoServicio,
      horaInicio: s.horaInicio ? new Date(s.horaInicio) : null,
      horaFin: s.horaFin ? new Date(s.horaFin) : null,
      tiempoRecorrido: s.horaInicio && s.horaFin ? Math.round((new Date(s.horaFin) - new Date(s.horaInicio)) / 60000) : '',
      estado: s.estado,
      puntos: s.puntosRecorridos ? s.puntosRecorridos.length : 0
    })),
    [servicios]
  );

  // Columnas con filtros por columna
  const columns = useMemo(() => [
    {
      accessorKey: 'bus',
      header: 'Bus',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'itinerario',
      header: 'Itinerario',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo Servicio',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'horaInicio',
      header: 'Hora Inicio',
      cell: info => info.getValue() ? info.getValue().toLocaleTimeString() : '',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'horaFin',
      header: 'Hora Fin',
      cell: info => info.getValue() ? info.getValue().toLocaleTimeString() : '',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'tiempoRecorrido',
      header: 'Tiempo de Recorrido',
      cell: info => {
        const min = info.getValue();
        if (typeof min !== 'number' || isNaN(min)) return '';
        if (min < 1) return '<1 min.';
        const h = Math.floor(min / 60);
        const m = min % 60;
        return (h ? `${h}h${m ? ', ' : ''}` : '') + (m ? `${m} min.` : (!h ? `${min} min.` : ''));
      },
      filterFn: 'includesString',
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'puntos',
      header: 'Puntos Recorridos',
      filterFn: 'includesString',
    }
  ], []);

  // React Table
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      columnFilters,
    },
    onColumnFiltersChange: setColumnFilters,
    enableColumnFilters: true
  });

  // Utilidad para formatear minutos a '1h, 27 min.'
  function formatearMinutosAHorasMinutos(min) {
    if (typeof min !== 'number' || isNaN(min)) return '';
    if (min < 1) return '<1 min.';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return (h ? `${h}h${m ? ', ' : ''}` : '') + (m ? `${m} min.` : (!h ? `${min} min.` : ''));
  }

  // Exportar a Word usando docx
  const exportarWord = async () => {
    // Bloques de resumen
    const resumenBloques = [
      new Paragraph({
        children: [new TextRun({ text: 'Reporte de Servicios', bold: true, size: 36 })],
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `Empresa: `, bold: true }),
          new TextRun({ text: resumen?.empresaNombre || '' }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `Fecha: `, bold: true }),
          new TextRun({ text: resumen?.fecha || '' }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `Shapes cargados: `, bold: true }),
          new TextRun({ text: resumen?.shapes?.length?.toString() || '0' }),
        ],
      }),
      new Paragraph({ text: '' }),
      new Paragraph({ children: [new TextRun({ text: 'Servicios detectados:', bold: true })] }),
      new Paragraph({
        children: [
          new TextRun({ text: `  Directos: `, bold: true }),
          new TextRun({ text: resumen?.servicios_detectados?.directos?.toString() || '0' }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `  Circulares: `, bold: true }),
          new TextRun({ text: resumen?.servicios_detectados?.circulares?.toString() || '0' }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `  Total: `, bold: true }),
          new TextRun({ text: resumen?.servicios_detectados?.total?.toString() || '0' }),
        ],
      }),
      new Paragraph({ text: '' }),
      new Paragraph({ children: [new TextRun({ text: 'Puntos de control:', bold: true })] }),
      new Paragraph({
        children: [
          new TextRun({ text: `  Total: `, bold: true }),
          new TextRun({ text: resumen?.puntos_control?.total?.toString() || '0' }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `  Terminales: `, bold: true }),
          new TextRun({ text: resumen?.puntos_control?.terminales?.toString() || '0' }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `  Intermedios: `, bold: true }),
          new TextRun({ text: resumen?.puntos_control?.intermedios?.toString() || '0' }),
        ],
      }),
      new Paragraph({ text: '' }),
      new Paragraph({ children: [new TextRun({ text: 'Shapes utilizados en trayectos:', bold: true })] }),
      ...(resumen?.shapesUsados ? Object.keys(resumen.shapesUsados).flatMap(idx => {
        const detalles = resumen?.shapesDetalles?.[idx];
        const detallesRows = detalles ? [
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({children:[new Paragraph({children:[new TextRun({text:'Código',bold:true})]})]}),
                  new TableCell({children:[new Paragraph({children:[new TextRun({text:'Línea',bold:true})]})]}),
                  new TableCell({children:[new Paragraph({children:[new TextRun({text:'Ramal',bold:true})]})]}),
                  new TableCell({children:[new Paragraph({children:[new TextRun({text:'Identificación',bold:true})]})]}),
                  new TableCell({children:[new Paragraph({children:[new TextRun({text:'Distancia (km)',bold:true})]})]}),
                  new TableCell({children:[new Paragraph({children:[new TextRun({text:'Tipo',bold:true})]})]})
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({children:[new Paragraph(String(detalles.codigo??''))]}),
                  new TableCell({children:[new Paragraph(String(detalles.linea??''))]}),
                  new TableCell({children:[new Paragraph(String(detalles.ramal??''))]}),
                  new TableCell({children:[new Paragraph(String(detalles.identificacion??''))]}),
                  new TableCell({children:[new Paragraph(String(detalles.distancia??''))]}),
                  new TableCell({children:[new Paragraph(String(detalles.tipo??''))]})
                ]
              })
            ]
          }),
          new Paragraph({ text: '' })
        ] : [new Paragraph({ text: '  (Sin detalles de itinerario)' })];
        return [
          new Paragraph({
            children: [
              new TextRun({ text: `  Shape #${parseInt(idx)+1} — `, bold: true }),
              new TextRun({ text: `${resumen.shapesUsados[idx]} trayectos` }),
            ]
          }),
          ...detallesRows
        ];
      }) : [new Paragraph({ text: '  -' })]),
      new Paragraph({ text: '' }),
      new Paragraph({ children: [new TextRun({ text: 'Detalle de trayectos detectados:', bold: true })] }),
    ];

    // Tabla de detalle (igual que antes)
    const rows = [
      columns.map(col => new TableCell({children:[new Paragraph({children:[new TextRun({text: col.header, bold: true})]})]})),
      ...table.getFilteredRowModel().rows.map(row =>
        columns.map(col => new TableCell({children:[new Paragraph(String(row.getValue(col.accessorKey) ?? ''))]}))
      )
    ];
    const doc = new Document({
      sections: [{children:[...resumenBloques, new Table({rows: rows.map(cells => new TableRow({children: cells}))})]}]
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, 'reporte_servicios.docx');
  };

  if (!open) return null;

  return (
    <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'white',padding:24,borderRadius:10,maxWidth:1000,maxHeight:'90vh',overflow:'auto',boxShadow:'0 8px 32px #0004'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h2 style={{margin:0}}>Reporte de Servicios</h2>
          <button onClick={onClose} style={{fontSize:24,background:'none',border:'none',cursor:'pointer'}}>×</button>
        </div>
        <div style={{marginBottom:12}}>
          <button onClick={exportarWord} style={{padding:'8px 18px',background:'#388e3c',color:'#fff',border:'none',borderRadius:5,fontWeight:'bold',fontSize:16,cursor:'pointer'}}>Guardar en Word</button>
        </div>
        {/* Bloques de resumen tipo imagen */}
        <div style={{marginBottom:24, fontSize:17, lineHeight:1.6}}>
          <div><b>Empresa:</b> {resumen?.empresaNombre}</div>
          <div><b>Fecha:</b> {resumen?.fecha}</div>
          <div><b>Shapes cargados:</b> {Array.isArray(resumen?.shapes) ? resumen.shapes.length : 0}</div>
          <div style={{marginTop:12}}><b>Servicios detectados:</b></div>
          <ul style={{margin:'4px 0 0 18px',padding:0}}>
            <li><b>Directos:</b> {resumen?.servicios_detectados?.directos ?? 0}</li>
            <li><b>Circulares:</b> {resumen?.servicios_detectados?.circulares ?? 0}</li>
            <li><b>Total:</b> {resumen?.servicios_detectados?.total ?? 0}</li>
          </ul>
          <div style={{marginTop:12}}><b>Puntos de control:</b></div>
          <ul style={{margin:'4px 0 0 18px',padding:0}}>
            <li><b>Total:</b> {resumen?.puntos_control?.total ?? 0}</li>
            <li><b>Terminales:</b> {resumen?.puntos_control?.terminales ?? 0}</li>
            <li><b>Intermedios:</b> {resumen?.puntos_control?.intermedios ?? 0}</li>
          </ul>
          <div style={{marginTop:12}}><b>Shapes utilizados en trayectos:</b></div>
          <ul style={{margin:'4px 0 0 18px',padding:0}}>
            {resumen?.shapes && Object.keys(resumen.shapesUsados || {}).map(idx => (
              <li key={idx} style={{marginBottom:8}}>
                <b>Shape #{parseInt(idx)+1}</b> &rarr; {resumen.shapesUsados[idx]} trayectos
                {resumen.shapesDetalles && resumen.shapesDetalles[idx] ? (
                  <table style={{marginTop:4, marginLeft:12, fontSize:13, borderCollapse:'collapse', background:'#f8f8ff'}}>
                    <thead>
                      <tr style={{background:'#e0e0e0'}}>
                        <th style={{padding:'2px 6px', border:'1px solid #bbb'}}>Código</th>
                        <th style={{padding:'2px 6px', border:'1px solid #bbb'}}>Línea</th>
                        <th style={{padding:'2px 6px', border:'1px solid #bbb'}}>Ramal</th>
                        <th style={{padding:'2px 6px', border:'1px solid #bbb'}}>Identificación</th>
                        <th style={{padding:'2px 6px', border:'1px solid #bbb'}}>Distancia (km)</th>
                        <th style={{padding:'2px 6px', border:'1px solid #bbb'}}>Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{padding:'2px 6px', border:'1px solid #bbb'}}>{resumen.shapesDetalles[idx].codigo}</td>
                        <td style={{padding:'2px 6px', border:'1px solid #bbb'}}>{resumen.shapesDetalles[idx].linea}</td>
                        <td style={{padding:'2px 6px', border:'1px solid #bbb'}}>{resumen.shapesDetalles[idx].ramal}</td>
                        <td style={{padding:'2px 6px', border:'1px solid #bbb'}}>{resumen.shapesDetalles[idx].identificacion}</td>
                        <td style={{padding:'2px 6px', border:'1px solid #bbb'}}>{resumen.shapesDetalles[idx].distancia}</td>
                        <td style={{padding:'2px 6px', border:'1px solid #bbb'}}>{resumen.shapesDetalles[idx].tipo}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div style={{marginLeft:12, color:'#888', fontSize:12}}>(Sin detalles de itinerario)</div>
                )}
              </li>
            ))}
          </ul>
          <div style={{marginTop:12}}><b>Detalle de trayectos detectados:</b></div>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:15}}>
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} style={{background:'#e3f2fd',position:'sticky',top:0,zIndex:2}}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <div>
                        {header.column.getCanFilter() ? (
                          <input
                            type="text"
                            value={header.column.getFilterValue() ?? ''}
                            onChange={e => header.column.setFilterValue(e.target.value)}
                            placeholder="Filtrar..."
                            style={{width:'90%',marginTop:2,fontSize:13}}
                          />
                        ) : null}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getFilteredRowModel().rows.map(row => (
                <tr key={row.id} style={{background: row.index % 2 === 0 ? '#fff' : '#f6f6f6'}}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={{border:'1px solid #eee',padding:6}}>
                      {cell.column.id === 'tiempoRecorrido'
                        ? formatearMinutosAHorasMinutos(cell.getValue())
                        : flexRender(cell.column.columnDef.cell ?? cell.column.columnDef.header, cell.getContext())}
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
