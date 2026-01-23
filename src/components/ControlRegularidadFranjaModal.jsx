import React from "react";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType } from 'docx';
import RegularidadBusesModal from './RegularidadBusesModal';

function ControlRegularidadFranjaModal(props) {
  // Props esperados: empresaId, fecha, onClose
  const { empresaId, fecha, onClose } = props;
  const [modoGremio, setModoGremio] = React.useState(false);
  const [modoSistema, setModoSistema] = React.useState(false);
  // --- Estados para datos y control ---
  const [data, setData] = React.useState(null); // datos crudos
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [empresas, setEmpresas] = React.useState([]);
  const [gremioId, setGremioId] = React.useState(undefined);
  const [gremioNombre, setGremioNombre] = React.useState("");
  const [empresaNombre, setEmpresaNombre] = React.useState("");
  const [tipoRegularidad, setTipoRegularidad] = React.useState('servicios'); // 'servicios' o 'buses'
  const [showBusesModal, setShowBusesModal] = React.useState(false);
  const [busesModalEmpresaId, setBusesModalEmpresaId] = React.useState(null);
  const [tooltip, setTooltip] = React.useState({visible: false, x: 0, y: 0, text: ''});

  // --- Definición de franjas horarias según el día ---
  const FRANJAS = {
    laboral: [
      { nombre: 'Pico Mañana', inicio: 5, fin: 7.99 },
      { nombre: 'Postpico', inicio: 8, fin: 15.99 },
      { nombre: 'Pico Tarde', inicio: 16, fin: 18.99 },
      { nombre: 'Postpico', inicio: 19, fin: 20.99 },
      { nombre: 'Nocturno', inicio: 21, fin: 22.99 },
    ],
    sabado: [
      { nombre: 'Pico', inicio: 6, fin: 15.99 },
      { nombre: 'Postpico', inicio: 16, fin: 20.99 },
      { nombre: 'Nocturno', inicio: 21, fin: 22.99 },
    ],
    domingo: [
      { nombre: 'Normal', inicio: 7, fin: 19.99 },
    ],
  };

  function getTipoDia(fechaStr) {
    // fechaStr: 'YYYY-MM-DD'
    const fecha = new Date(fechaStr);
    const dia = fecha.getDay(); // 0=Domingo, 6=Sábado
    if (dia === 0) return 'domingo';
    if (dia === 6) return 'sabado';
    return 'laboral';
  }

  function getFranjaParaHora(hora, tipoDia) {
    // hora: número (ej: 5, 6, 7, 8, ...)
    const franjas = FRANJAS[tipoDia];
    if (!franjas) return null;
    for (let f of franjas) {
      if (hora >= f.inicio && hora <= f.fin) return f.nombre;
    }
    return null;
  }

  // --- Buscar nombre de empresa y gremioId al montar o cuando empresaId cambia ---
  React.useEffect(() => {
    if (!empresaId) return;
    fetch(`http://192.168.100.191:8000/empresas`)
      .then(res => res.json())
      .then(empresas => {
        setEmpresas(empresas);
        const emp = empresas.find(e => e.id_eot_vmt_hex === empresaId);
        if (emp) {
          setEmpresaNombre(emp.eot_nombre || empresaId);
          setGremioId(emp.gre_id || undefined);
          setGremioNombre(emp.gre_nombre || "Gremio");
        } else {
          setGremioId(undefined);
          setGremioNombre("");
        }
      });
  }, [empresaId]);

  // --- Cargar datos según modo (empresa, gremio, sistema) ---
  React.useEffect(() => {
    if (!empresaId || !fecha) return;
    setLoading(true);
    setError(null);
    let url = '';
    if (modoSistema) {
      url = tipoRegularidad === 'buses'
        ? `http://192.168.100.191:8000/sistema/regularidad_por_hora_buses?fecha=${fecha}`
        : `http://192.168.100.191:8000/sistema/regularidad_por_hora?fecha=${fecha}`;
    } else if (modoGremio && gremioId) {
      url = tipoRegularidad === 'buses'
        ? `http://192.168.100.191:8000/gremios/${gremioId}/regularidad_por_hora_buses?fecha=${fecha}`
        : `http://192.168.100.191:8000/gremios/${gremioId}/regularidad_por_hora?fecha=${fecha}`;
    } else {
      url = tipoRegularidad === 'buses'
        ? `http://192.168.100.191:8000/empresas/${empresaId}/regularidad_por_hora_buses?fecha=${fecha}`
        : `http://192.168.100.191:8000/empresas/${empresaId}/regularidad_por_hora?fecha=${fecha}`;
    }
    fetch(url)
      .then(res => res.json())
      .then(json => setData(json))
      .catch(() => setError('Error al obtener datos'))
      .finally(() => setLoading(false));
  }, [empresaId, fecha, modoGremio, gremioId, modoSistema, tipoRegularidad]);

  // --- Procesar datos para la tabla ---
  // Estructura esperada: data.empresas: [{ id, nombre, servicios_dia, promedio_horas }]
  // Si es modo empresa, data.servicios_dia y data.promedio_horas (solo una empresa)
  function getEmpresasParaTabla() {
    if (!data) return [];
    if (data.empresas) return data.empresas; // caso antiguo (no optimizado)
    // Si es respuesta sumada (gremio/sistema optimizado)
    if (data.servicios_dia && data.promedio_horas) {
      return [{
        id: modoSistema ? 'sistema' : (modoGremio ? 'gremio' : empresaId),
        nombre: modoSistema ? 'Sistema' : (modoGremio ? gremioNombre : empresaNombre),
        servicios_dia: data.servicios_dia,
        promedio_horas: data.promedio_horas
      }];
    }
    // modo empresa
    return [{
      id: empresaId,
      nombre: empresaNombre,
      servicios_dia: data.servicios_dia,
      promedio_horas: data.promedio_horas
    }];
  }

  // --- Calcular % por franja para cada empresa ---
  function calcularPorcentajePorFranja(servicios_dia, promedio_horas, tipoDia) {
    // Agrupar por franja
    const franjas = FRANJAS[tipoDia];
    const franjaStats = {};
    franjas.forEach(f => {
      franjaStats[f.nombre] = { actual: 0, esperado: 0, n: 0 };
    });
    (servicios_dia || []).forEach(d => {
      const franja = getFranjaParaHora(d.hora, tipoDia);
      if (franja && franjaStats[franja]) {
        franjaStats[franja].actual += d.servicios;
        franjaStats[franja].n++;
      }
    });
    (promedio_horas || []).forEach(d => {
      const franja = getFranjaParaHora(d.hora, tipoDia);
      if (franja && franjaStats[franja]) {
        franjaStats[franja].esperado += d.promedio;
      }
    });
    // Calcular %
    const resultado = {};
    franjas.forEach(f => {
      const act = franjaStats[f.nombre].actual;
      const esp = franjaStats[f.nombre].esperado;
      resultado[f.nombre] = esp > 0 ? Math.round((act / esp) * 100) : '-';
    });
    return resultado;
  }

  // --- Definir el orden y agrupación de columnas ---
  const COLUMNAS = [
    { nombre: 'Pico Mañana', keys: ['Pico Mañana'] },
    { nombre: 'Pico Tarde', keys: ['Pico Tarde', 'Pico'] },
    { nombre: 'Postpico', keys: ['Postpico'] },
    { nombre: 'Nocturno', keys: ['Nocturno', 'Normal'] },
  ];

  // --- Agrupar valores de franjas si hay varias (ej: Postpico) ---
  function agruparPorcentajes(porcentajes) {
    const resultado = {};
    COLUMNAS.forEach(col => {
      let sum = 0, n = 0;
      col.keys.forEach(k => {
        if (porcentajes[k] !== undefined && porcentajes[k] !== '-') {
          sum += porcentajes[k];
          n++;
        }
      });
      resultado[col.nombre] = n > 0 ? Math.round(sum / n) : '-';
    });
    return resultado;
  }

  // --- Exportar a Excel con formato de alerta ---
  function exportarExcel() {
    const tipoDia = getTipoDia(fecha);
    const empresasTabla = getEmpresasParaTabla();
    // Preparar datos para la hoja
    const ws_data = [
      ["Empresa", ...COLUMNAS.map(c => c.nombre)]
    ];
    empresasTabla.forEach(emp => {
      const porcentajes = calcularPorcentajePorFranja(emp.servicios_dia, emp.promedio_horas, tipoDia);
      const agrupados = agruparPorcentajes(porcentajes);
      ws_data.push([
        emp.nombre,
        ...COLUMNAS.map(col => {
          const val = agrupados[col.nombre];
          return val !== undefined && val !== '-' ? val : '';
        })
      ]);
    });
    // Crear hoja
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    // Aplicar formato de colores
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = 1; r <= range.e.r; r++) { // Saltar encabezado
      for (let c = 1; c <= range.e.c; c++) { // Saltar columna empresa
        const cell_address = XLSX.utils.encode_cell({ r, c });
        const val = ws[cell_address] && typeof ws[cell_address].v === 'number' ? ws[cell_address].v : null;
        if (val !== null) {
          let color = null;
          if (val < 60) color = 'FFEBEE'; // rojo claro
          else if (val < 100) color = 'FFFDE7'; // amarillo claro
          else if (val >= 100) color = 'E8F5E9'; // verde claro
          ws[cell_address].s = {
            fill: { patternType: "solid", fgColor: { rgb: color } },
            font: { bold: true, color: { rgb: val < 60 ? 'D84315' : val < 100 ? 'B28704' : '388E3C' } }
          };
        }
      }
    }
    // Crear libro y guardar
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Control Regularidad');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `control_regularidad_${fecha}.xlsx`);
  }

  // --- Exportar a Word con formato de colores ---
  async function exportarWord() {
    const tipoDia = getTipoDia(fecha);
    const empresasTabla = getEmpresasParaTabla();
    // Título y nota
    const titulo = 'Control de Regularidad por Franja';
    // Agregar mención del tipo de regularidad
    let textoTipoRegularidad = '';
    if (tipoRegularidad === 'servicios') {
      textoTipoRegularidad = 'Tipo de regularidad: Por servicio';
    } else if (tipoRegularidad === 'buses') {
      textoTipoRegularidad = 'Tipo de regularidad: Por bus';
    }
    const nota = 'Esta planilla muestra, para cada empresa y franja horaria, el porcentaje de servicios realizados respecto al promedio histórico de los mismos días de las 4 semanas anteriores.\nAlerta: Si una celda está en rojo, significa que la empresa operó por debajo del 60% del promedio histórico en esa franja.\nLas franjas horarias varían según el tipo de día (laboral, sábado, domingo).';
    // Encabezados
    const encabezados = [new TableCell({
      children: [new Paragraph({ text: 'Empresa', bold: true })],
      shading: { fill: 'e3f2fd', type: ShadingType.CLEAR },
      width: { size: 30, type: WidthType.PERCENTAGE }
    })].concat(COLUMNAS.map(col => new TableCell({
      children: [new Paragraph({ text: col.nombre, bold: true })],
      shading: { fill: 'e3f2fd', type: ShadingType.CLEAR },
      width: { size: 17, type: WidthType.PERCENTAGE }
    })));
    // Filas de datos
    const filas = empresasTabla.map(emp => {
      const porcentajes = calcularPorcentajePorFranja(emp.servicios_dia, emp.promedio_horas, tipoDia);
      const agrupados = agruparPorcentajes(porcentajes);
      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: emp.nombre, bold: true })],
            shading: { fill: 'f5f5f5', type: ShadingType.CLEAR },
          }),
          ...COLUMNAS.map(col => {
            const val = agrupados[col.nombre];
            let fill = 'ffffff', color = '1976d2';
            if (typeof val === 'number') {
              if (val < 60) { fill = 'ffebee'; color = 'd84315'; }
              else if (val < 100) { fill = 'fffde7'; color = 'b28704'; }
              else if (val >= 100) { fill = 'e8f5e9'; color = '388e3c'; }
            }
            return new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: val !== undefined ? (val === '-' ? '-' : val + '%') : '-', bold: true, color })],
                alignment: 'center',
              })],
              shading: { fill, type: ShadingType.CLEAR },
            });
          })
        ]
      });
    });
    // Construir tabla
    const tabla = new Table({
      rows: [new TableRow({ children: encabezados }), ...filas],
      width: { size: 100, type: WidthType.PERCENTAGE },
      alignment: 'center',
    });
    // Documento
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({ text: titulo, heading: HeadingLevel.HEADING_1, alignment: 'center' }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: textoTipoRegularidad, heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: nota }),
            new Paragraph({ text: '' }),
            tabla,
            new Paragraph({ text: '' }),
            new Paragraph({ text: `Fecha: ${fecha}` }),
          ]
        }
      ]
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `control_regularidad_${fecha}.docx`);
  }

  // --- Render de la tabla ---
  const tipoDia = getTipoDia(fecha);
  const franjas = FRANJAS[tipoDia];
  const empresasTabla = getEmpresasParaTabla();

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.35)',
        zIndex: 2100,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'stretch',
        padding: 0,
        margin: 0,
      }}
      onClick={() => { if (tooltip.visible) setTooltip(t => ({...t, visible: false})); }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 0,
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        padding: 0,
        width: '100vw',
        height: '100vh',
        maxWidth: '100vw',
        maxHeight: '100vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        justifyContent: 'flex-start',
      }}>
        <button onClick={onClose} style={{position:'fixed',top:18,right:18,fontSize:32,background:'#eee',border:'none',borderRadius:20,width:48,height:48,cursor:'pointer',zIndex:3001,boxShadow:'0 2px 8px #0002'}}>
          ×
        </button>
        <h2 style={{marginTop:32, marginLeft:32, fontSize:36}}>
          Control de Regularidad por Franja
        </h2>
        <div style={{marginBottom:8, fontSize:20, color:'#555', marginLeft:32}}>
          {modoSistema
            ? (<span>Mostrando <b>todo el sistema</b>{fecha ? ` | Fecha: ${fecha}` : ''}</span>)
            : modoGremio
              ? (<span>Mostrando <b>todo el gremio</b>{gremioNombre ? `: ${gremioNombre}` : ''}{fecha ? ` | Fecha: ${fecha}` : ''}</span>)
              : (<span>Mostrando <b>empresa</b>{empresaNombre ? `: ${empresaNombre}` : ''}{fecha ? ` | Fecha: ${fecha}` : ''}</span>)}
        </div>
        {/* Botones de modo */}
        <div style={{display:'flex', gap:16, marginLeft:32, marginBottom:16}}>
          {!modoGremio && !modoSistema && (
            <button onClick={()=>{setModoGremio(true); setModoSistema(false);}} style={{background:'#fffde7',color:'#fbc02d',border:'1px solid #ffe082',borderRadius:8,padding:'8px 18px',fontWeight:'bold',fontSize:16,cursor:'pointer'}}>Ampliar a Gremio</button>
          )}
          {modoGremio && !modoSistema && (
            <button onClick={()=>{setModoSistema(true);}} style={{background:'#e3f2fd',color:'#1976d2',border:'1px solid #90caf9',borderRadius:8,padding:'8px 18px',fontWeight:'bold',fontSize:16,cursor:'pointer'}}>Todo el sistema</button>
          )}
          {(modoGremio || modoSistema) && (
            <button onClick={()=>{setModoGremio(false); setModoSistema(false);}} style={{background:'#e0e0e0',color:'#333',border:'1px solid #bbb',borderRadius:8,padding:'8px 18px',fontWeight:'bold',fontSize:16,cursor:'pointer'}}>Volver a empresa</button>
          )}
        </div>
        {/* Nota explicativa */}
        <div style={{maxWidth:900, margin:'0 auto', marginTop:12, marginBottom:18, background:'#fffde7', color:'#b28704', border:'1px solid #ffe082', borderRadius:8, padding:'16px 24px', fontSize:16, boxShadow:'0 2px 8px #fbc02d22'}}>
          <b>Nota:</b> Esta planilla muestra, para cada empresa y franja horaria, el porcentaje de servicios realizados respecto al promedio histórico de los mismos días de las 4 semanas anteriores. <br />
          <b>Alerta:</b> Si una celda está en rojo, significa que la empresa operó por debajo del 60% del promedio histórico en esa franja.<br />
          Las franjas horarias varían según el tipo de día (laboral, sábado, domingo).
        </div>
        {/* Agregar el select arriba del modal */}
        <div style={{display:'flex',alignItems:'center',gap:16,margin:'24px 0 0 32px'}}>
          <label htmlFor="tipo-regularidad" style={{fontWeight:'bold',fontSize:16}}>Tipo de regularidad:</label>
          <select id="tipo-regularidad" value={tipoRegularidad} onChange={e => setTipoRegularidad(e.target.value)} style={{fontSize:16,padding:'4px 12px',borderRadius:6,border:'1px solid #bbb'}}>
            <option value="servicios">Servicios</option>
            <option value="buses">Buses</option>
          </select>
        </div>
        {/* Espacio para la tabla de control por franja */}
        {/* Render de la tabla con formato de colores */}
        <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', width:'100%', marginTop:24}}>
          {loading ? (
            <div style={{margin:'32px 0', color:'#888'}}>Cargando datos...</div>
          ) : error ? (
            <div style={{margin:'32px 0', color:'#d84315'}}>Error al obtener datos</div>
          ) : (
            <div style={{overflowX:'auto', width:'100%', maxWidth:1200}}>
              <table style={{borderCollapse:'collapse', width:'100%', fontSize:18, background:'#fafafa', boxShadow:'0 2px 8px #0001', borderRadius:12, overflow:'hidden'}}>
                <thead>
                  <tr style={{background:'#e3f2fd'}}>
                    <th></th>
                    <th style={{padding:'10px 18px', border:'1px solid #90caf9', fontWeight:'bold', fontSize:19, textAlign:'left'}}>Empresa</th>
                    {COLUMNAS.map(col => (
                      <th key={col.nombre} style={{padding:'10px 18px', border:'1px solid #90caf9', fontWeight:'bold', fontSize:19}}>{col.nombre}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empresasTabla.map(emp => {
                    const porcentajes = calcularPorcentajePorFranja(emp.servicios_dia, emp.promedio_horas, tipoDia);
                    const agrupados = agruparPorcentajes(porcentajes);
                    return (
                      <tr key={emp.id}>
                        {/* Botón para abrir modal de regularidad de buses */}
                        <td style={{padding:'0 8px', textAlign:'center'}}>
                          <button
                            title="Ver regularidad de buses"
                            style={{background:'#e3f2fd',border:'1px solid #90caf9',borderRadius:8,padding:'6px 10px',cursor:'pointer'}}
                            onClick={() => { setBusesModalEmpresaId(emp.id); setShowBusesModal(true); }}
                          >🚌</button>
                        </td>
                        <td style={{padding:'10px 18px', border:'1px solid #eee', fontWeight:'bold', fontSize:18, background:'#f5f5f5'}}>{emp.nombre}</td>
                        {COLUMNAS.map(col => {
                          const val = agrupados[col.nombre];
                          let bg = '#fff', color = '#1976d2';
                          if (typeof val === 'number') {
                            if (val < 60) { bg = '#ffebee'; color = '#d84315'; }
                            else if (val < 100) { bg = '#fffde7'; color = '#b28704'; }
                            else if (val >= 100) { bg = '#e8f5e9'; color = '#388e3c'; }
                          }
                          // Buscar datos crudos de la franja para tooltip
                          const franja = col.keys[0];
                          // Filtrar datos crudos de esa franja
                          const serviciosFranja = (emp.servicios_dia||[]).filter(d => getFranjaParaHora(d.hora, tipoDia) === franja);
                          const promedioFranja = (emp.promedio_horas||[]).filter(d => getFranjaParaHora(d.hora, tipoDia) === franja);
                          return (
                            <td
                              key={col.nombre}
                              style={{padding:'10px 18px', border:'1px solid #eee', color, fontWeight:'bold', background:bg, cursor:'context-menu'}}
                              onContextMenu={e => {
                                e.preventDefault();
                                setTooltip({
                                  visible: true,
                                  x: e.clientX,
                                  y: e.clientY,
                                  text: `<b>Datos crudos para ${emp.nombre} - ${col.nombre}</b><br/><br/>` +
                                    `<b>Servicios en la franja:</b><br/>` +
                                    serviciosFranja.map(d => `Hora: ${d.hora}, Servicios: ${d.servicios}`).join('<br/>') +
                                    `<br/><b>Promedio histórico en la franja:</b><br/>` +
                                    promedioFranja.map(d => `Hora: ${d.hora}, Promedio: ${d.promedio}`).join('<br/>')
                                });
                              }}
                            >
                              {val !== undefined ? (val === '-' ? '-' : val + '%') : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Tooltip de datos crudos */}
              {tooltip.visible && (
                <div
                  style={{
                    position: 'fixed',
                    left: tooltip.x + 10,
                    top: tooltip.y + 10,
                    background: '#222',
                    color: '#fff',
                    padding: '12px 18px',
                    borderRadius: 8,
                    fontSize: 15,
                    zIndex: 4000,
                    maxWidth: 400,
                    boxShadow: '0 4px 16px #0005',
                    pointerEvents: 'none',
                    whiteSpace: 'pre-line',
                  }}
                  dangerouslySetInnerHTML={{ __html: tooltip.text }}
                ></div>
              )}
            </div>
          )}
        </div>
        {/* Botón para exportar a Excel y Word */}
        <div style={{width:'100%', display:'flex', justifyContent:'center', gap:16, marginBottom:32}}>
          <button onClick={exportarExcel} style={{background:'#e8f5e9',color:'#43a047',border:'2px solid #a5d6a7',borderRadius:8,padding:'12px 32px',fontWeight:'bold',fontSize:18,cursor:'pointer'}}>Exportar a Excel</button>
          <button onClick={exportarWord} style={{background:'#e3f2fd',color:'#1976d2',border:'2px solid #90caf9',borderRadius:8,padding:'12px 32px',fontWeight:'bold',fontSize:18,cursor:'pointer'}}>Exportar a Word</button>
        </div>
        {/* Modal de regularidad de buses */}
        {showBusesModal && busesModalEmpresaId && (
          <RegularidadBusesModal
            empresaId={busesModalEmpresaId}
            fecha={fecha}
            onClose={() => setShowBusesModal(false)}
          />
        )}
      </div>
    </div>
  );
}

export default ControlRegularidadFranjaModal; 