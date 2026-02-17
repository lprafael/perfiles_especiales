import React, { useState } from "react";
import * as XLSX from 'xlsx';
import { Line } from 'react-chartjs-2';
import ReporteMaximizadoModal from './ReporteMaximizadoModal';
import GraficoAvanzadoPromedioBuses from './GraficoAvanzadoPromedioBuses';

const FRANJAS_LV = [
  { key: 'pico_manana', label: 'Pico Mañana' },
  { key: 'postpico_manana', label: 'Postpico Mañana' },
  { key: 'pico_tarde', label: 'Pico Tarde' },
  { key: 'postpico_tarde', label: 'Postpico Tarde' },
  { key: 'nocturno', label: 'Nocturno' },
];
const FRANJAS_SAB = [
  { key: 'pico', label: 'Pico' },
  { key: 'postpico', label: 'Postpico' },
  { key: 'nocturno', label: 'Nocturno' },
];
const FRANJA_DOM = [
  { key: 'normal', label: 'Horario Normal' },
];
const MESES = [
  { key: 1, label: 'Enero' },
  { key: 2, label: 'Febrero' },
  { key: 3, label: 'Marzo' },
  { key: 4, label: 'Abril' },
  { key: 5, label: 'Mayo' },
  { key: 6, label: 'Junio' },
  { key: 7, label: 'Julio' },
  { key: 8, label: 'Agosto' },
  { key: 9, label: 'Septiembre' },
  { key: 10, label: 'Octubre' },
  { key: 11, label: 'Noviembre' },
  { key: 12, label: 'Diciembre' },
];

function validarFranjasNoSolapadas(franjas) {
  // Solo considerar las franjas activas y con ambos valores
  const activas = franjas.filter(f => f.checked && f.inicio !== '' && f.fin !== '');
  // Ordenar por inicio
  const ordenadas = [...activas].sort((a, b) => Number(a.inicio) - Number(b.inicio));
  for (let i = 0; i < ordenadas.length - 1; i++) {
    const finActual = Number(ordenadas[i].fin);
    const inicioSiguiente = Number(ordenadas[i + 1].inicio);
    if (finActual > inicioSiguiente) {
      return `Las franjas "${ordenadas[i].label}" y "${ordenadas[i + 1].label}" se solapan o no están bien separadas.`;
    }
    if (finActual === inicioSiguiente) {
      return `El fin de "${ordenadas[i].label}" no puede ser igual al inicio de "${ordenadas[i + 1].label}".`;
    }
    if (Number(ordenadas[i].inicio) >= Number(ordenadas[i].fin)) {
      return `En "${ordenadas[i].label}", la hora de inicio debe ser menor que la de fin.`;
    }
  }
  // Validar la última franja
  if (ordenadas.length > 0) {
    const ult = ordenadas[ordenadas.length - 1];
    if (Number(ult.inicio) >= Number(ult.fin)) {
      return `En "${ult.label}", la hora de inicio debe ser menor que la de fin.`;
    }
  }
  return null;
}

function ModalPromedioOperativaWizard({ onClose }) {
  const [step, setStep] = useState(0);
  // Paso 1: Franjas y rangos horarios por tipo de día
  const [franjasLV, setFranjasLV] = useState([
    { key: 'pico_manana', label: 'Pico Mañana', checked: true, inicio: '5', fin: '7' },
    { key: 'postpico_manana', label: 'Postpico Mañana', checked: true, inicio: '8', fin: '15' },
    { key: 'pico_tarde', label: 'Pico Tarde', checked: true, inicio: '16', fin: '18' },
    { key: 'postpico_tarde', label: 'Postpico Tarde', checked: true, inicio: '19', fin: '20' },
    { key: 'nocturno', label: 'Nocturno', checked: true, inicio: '21', fin: '22' },
  ]);
  const [franjasSab, setFranjasSab] = useState([
    { key: 'pico', label: 'Pico', checked: true, inicio: '6', fin: '15' },
    { key: 'postpico', label: 'Postpico', checked: true, inicio: '16', fin: '20' },
    { key: 'nocturno', label: 'Nocturno', checked: true, inicio: '21', fin: '22' },
  ]);
  const [franjaDom, setFranjaDom] = useState({ key: 'normal', label: 'Horario Normal', checked: true, inicio: '7', fin: '19' });
  // Acordeón
  const [openGroup, setOpenGroup] = useState('lv');
  // Paso 2: Meses de baja y alta demanda
  const [mesesBaja, setMesesBaja] = useState([12, 1, 2]);
  const [mesesAlta, setMesesAlta] = useState([3, 4, 5, 6, 7, 8, 9, 10, 11]);
  // Validación de meses solapados
  const mesesSolapados = mesesBaja.filter(m => mesesAlta.includes(m));
  const errorMeses = mesesSolapados.length > 0 ? 'Un mes no puede estar en baja y alta demanda a la vez.' : null;
  // Paso 3: Rango de fechas y días de la semana para el informe
  const [fechaInicio, setFechaInicio] = useState(''); // formato: 'YYYY-MM-DD'
  const [fechaFin, setFechaFin] = useState(''); // formato: 'YYYY-MM-DD'
  const [diasSeleccionados, setDiasSeleccionados] = useState([1, 2, 3, 4, 5, 6, 7]); // 1=Lunes ... 7=Domingo
  const [agruparPorMes, setAgruparPorMes] = useState(true);
  const DIAS_SEMANA = [
    { key: 1, label: 'Lunes' },
    { key: 2, label: 'Martes' },
    { key: 3, label: 'Miércoles' },
    { key: 4, label: 'Jueves' },
    { key: 5, label: 'Viernes' },
    { key: 6, label: 'Sábado' },
    { key: 7, label: 'Domingo' },
  ];
  // Validación de rango de fechas
  let errorRangoFechas = null;
  if (fechaInicio && fechaFin) {
    if (fechaInicio > fechaFin) {
      errorRangoFechas = 'La fecha de inicio no puede ser posterior a la de fin.';
    }
    const hoy = new Date().toISOString().slice(0, 10);
    if (fechaFin >= hoy) {
      errorRangoFechas = 'La fecha de fin no puede ser igual ni mayor a hoy.';
    }
  }
  // NUEVO: Selector de formato
  const [formato, setFormato] = useState('tabular'); // 'tabular' o 'agrupado'
  // Paso 4: Generar reporte
  const [generando, setGenerando] = useState(false);
  const [reporte, setReporte] = useState(null);
  const [errorReporte, setErrorReporte] = useState(null);
  const [nombreFranjaMap, setNombreFranjaMap] = useState({});
  const [mostrarGrafico, setMostrarGrafico] = useState(false);
  const [mostrarReporteMax, setMostrarReporteMax] = useState(false);
  const [mostrarGraficoAvanzado, setMostrarGraficoAvanzado] = useState(false);

  // Validaciones de solapamiento
  const errorLV = openGroup === 'lv' ? validarFranjasNoSolapadas(franjasLV) : null;
  const errorSab = openGroup === 'sab' ? validarFranjasNoSolapadas(franjasSab) : null;
  const errorDom = openGroup === 'dom' ? (franjaDom.checked && franjaDom.inicio !== '' && franjaDom.fin !== '' && Number(franjaDom.inicio) >= Number(franjaDom.fin) ? 'En "Horario Normal", la hora de inicio debe ser menor que la de fin.' : null) : null;
  const errorFranjas = errorLV || errorSab || errorDom;

  // Mapear franja (rango) a nombre amigable
  function construirNombreFranjaMap() {
    const map = {};
    franjasLV.filter(f => f.checked).forEach(f => {
      map[`${Number(f.inicio).toString().padStart(2, '0')}-${Number(f.fin).toString().padStart(2, '0')}`] = f.label;
    });
    franjasSab.filter(f => f.checked).forEach(f => {
      map[`${Number(f.inicio).toString().padStart(2, '0')}-${Number(f.fin).toString().padStart(2, '0')}`] = f.label;
    });
    if (franjaDom.checked) {
      map[`${Number(franjaDom.inicio).toString().padStart(2, '0')}-${Number(franjaDom.fin).toString().padStart(2, '0')}`] = franjaDom.label;
    }
    setNombreFranjaMap(map);
  }

  // Llamar al construirNombreFranjaMap cuando cambian las franjas
  React.useEffect(() => {
    construirNombreFranjaMap();
    // eslint-disable-next-line
  }, [franjasLV, franjasSab, franjaDom]);

  // NUEVO: función para armar y enviar el request
  async function generarReporte() {
    setGenerando(true);
    setErrorReporte(null);
    setReporte(null);
    // Armar franjas para el backend
    const franjas = {
      'LunVie': franjasLV.filter(f => f.checked).map(f => [Number(f.inicio), Number(f.fin)]),
      'Sab': franjasSab.filter(f => f.checked).map(f => [Number(f.inicio), Number(f.fin)]),
      'DomFeriado': franjaDom.checked ? [[Number(franjaDom.inicio), Number(franjaDom.fin)]] : []
    };
    // Usar fechas y días seleccionados
    const body = {
      empresas: [],
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      dias_semana: diasSeleccionados, // 1=Lunes ... 7=Domingo
      franjas,
      meses_alta: mesesAlta,
      meses_baja: mesesBaja,
      formato
      // agrupar_por_mes: agruparPorMes // Solo para el endpoint original
    };
    try {
      const endpoint = agruparPorMes
        ? 'http://localhost:8000/buses_promedio_agrupado'
        : 'http://localhost:8000/buses_promedio_global';
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error('Error en el backend');
      const data = await resp.json();
      console.log("Respuesta cruda del backend(X):", data); // <-- AGREGA ESTA LÍNEA
      setReporte(data);
      setMostrarReporteMax(true);
    } catch (e) {
      setErrorReporte('Error al generar el reporte: ' + e.message);
    } finally {
      setGenerando(false);
    }
  }

  // --- NUEVO: función para generar datos completos para vista previa y Excel ---
  function generarDatosReporteCompleto() {
    if (!reporte || !reporte.data) return [];
    // Mapeo de meses a abreviatura
    const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    // Mapeo de tipo de día
    const mapDia = {
      'Lun a Vie': 'Lun a Vie',
      'Sábado': 'Sábado',
      'Dom y Fer': 'Dom y Fer',
      'Lunes a Viernes': 'Lun a Vie',
      'Sabado': 'Sábado',
      'Domingo y Feriado': 'Dom y Fer',
      'Domingo': 'Dom y Fer',
      'Feriado': 'Dom y Fer',
    };
    // Mapeo de periodo
    const mapPeriodo = {
      'ALTA': 'ALTA',
      'BAJA': 'BAJA',
      'Alta': 'ALTA',
      'Baja': 'BAJA',
      'alta': 'ALTA',
      'baja': 'BAJA',
    };
    // Mapear franjas seleccionadas a sus rangos por tipo de día (usando los nombres exactos del backend)
    const franjasSeleccionadas = {
      'Lunes a Viernes': franjasLV.filter(f => f.checked).map(f => ({ key: `${Number(f.inicio).toString().padStart(2, '0')}-${Number(f.fin).toString().padStart(2, '0')}`, inicio: Number(f.inicio), fin: Number(f.fin), label: f.label })),
      'Sábados': franjasSab.filter(f => f.checked).map(f => ({ key: `${Number(f.inicio).toString().padStart(2, '0')}-${Number(f.fin).toString().padStart(2, '0')}`, inicio: Number(f.inicio), fin: Number(f.fin), label: f.label })),
      'Domingos y Feriados': franjaDom.checked ? [{ key: `${Number(franjaDom.inicio).toString().padStart(2, '0')}-${Number(franjaDom.fin).toString().padStart(2, '0')}`, inicio: Number(franjaDom.inicio), fin: Number(franjaDom.fin), label: franjaDom.label }] : []
    };
    // Generar filas para todas las horas de cada franja definida
    let data = [];
    Object.entries(franjasSeleccionadas).forEach(([tipoDia, franjas]) => {
      franjas.forEach(franja => {
        // Buscar todos los registros de este tipo de día y franja
        // Para cada combinación de empresa, año, mes, periodo, gremio
        const registros = reporte.data.filter(r => r.tipo_dia === tipoDia && r.franja === franja.key);
        const combinaciones = Array.from(new Set(registros.map(r => [r.empresa_id, r.empresa_nombre, r.anio, r.mes, mapPeriodo[r.periodo] || r.periodo, r.gre_nombre || ''].join('|'))));
        combinaciones.forEach(comb => {
          const [empresa_id, empresa_nombre, anio, mes, periodo, gre_nombre] = comb.split('|');
          for (let hora = franja.inicio; hora <= franja.fin; hora++) {
            // Buscar si existe un registro para esta combinación y hora
            const registro = reporte.data.find(r =>
              String(r.empresa_id) === empresa_id &&
              r.empresa_nombre === empresa_nombre &&
              (r.anio === Number(anio) || r.anio === anio || r.anio === '---') &&
              (r.mes === Number(mes) || r.mes === mes || r.mes === '---') &&
              ((mapPeriodo[r.periodo] || r.periodo) === periodo || r.periodo === '---') &&
              r.tipo_dia === tipoDia &&
              r.franja === franja.key &&
              r.hora === hora
            );
            data.push({
              'GREMIO': gre_nombre || (registro && registro.gre_nombre) || '',
              'CÓDIGO EMPRESA': empresa_id,
              'EMPRESA': empresa_nombre,
              'MES': `${MESES_ABREV[(Number(mes) - 1)] || mes}-${String(anio).slice(-2)}`,
              'MES_NUM': Number(mes),
              'ANIO': Number(anio),
              'PERIODO': periodo,
              'DÍA': tipoDia,
              'FRANJA': nombreFranjaPorDiaYRango[tipoDia]?.[franja.key] || franja.label || franja.key,
              'FRANJA_KEY': franja.key,
              'HORA': hora,
              'PROMEDIO': registro && registro.promedio_buses !== undefined ? registro.promedio_buses : 0,
            });
          }
        });
      });
    });
    // Ordenar por Empresa, Mes, Día, Franja, Hora
    data.sort((a, b) => {
      if (a['GREMIO'] < b['GREMIO']) return -1;
      if (a['GREMIO'] > b['GREMIO']) return 1;
      if (a['EMPRESA'] < b['EMPRESA']) return -1;
      if (a['EMPRESA'] > b['EMPRESA']) return 1;
      if (a['ANIO'] !== b['ANIO']) return a['ANIO'] - b['ANIO'];
      if (a['MES_NUM'] !== b['MES_NUM']) return a['MES_NUM'] - b['MES_NUM'];
      if (a['DÍA'] < b['DÍA']) return -1;
      if (a['DÍA'] > b['DÍA']) return 1;
      if ((a['FRANJA_KEY'] || '') < (b['FRANJA_KEY'] || '')) return -1;
      if ((a['FRANJA_KEY'] || '') > (b['FRANJA_KEY'] || '')) return 1;
      return a['HORA'] - b['HORA'];
    });
    return data;
  }

  // NUEVO: función para exportar a Excel
  function exportarExcel() {
    if (!reporte || !reporte.data) return;
    const data = generarDatosReporteCompleto();
    // Ordenar columnas según formato solicitado
    const cols = ['GREMIO', 'CÓDIGO EMPRESA', 'EMPRESA', 'MES', 'PERIODO', 'DÍA', 'FRANJA', 'HORA', 'PROMEDIO'];
    const ws = XLSX.utils.json_to_sheet(data.map(d => {
      // Solo las columnas requeridas
      return cols.reduce((acc, k) => { acc[k] = d[k]; return acc; }, {});
    }), { header: cols });

    // Ajustar anchos de columna automáticamente
    const colWidths = cols.map(col => {
      // Obtener el ancho máximo de la columna (incluyendo el header)
      const maxLen = Math.max(
        col.length,
        ...data.map(d => (d[col] !== undefined && d[col] !== null ? String(d[col]).length : 0))
      );
      return { wch: maxLen + 2 };
    });
    ws['!cols'] = colWidths;

    // Crear formato de tabla (SheetJS no soporta tablas nativas, pero podemos simularlo con estilos básicos)
    // Si usas Excel moderno, puedes convertir el rango a tabla manualmente luego

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');

    // Hoja de parámetros igual que antes
    const parametros = [];
    parametros.push(['Lunes a Viernes']);
    franjasLV.filter(f => f.checked).forEach(f => {
      parametros.push([`${f.label}: de ${f.inicio} a ${f.fin} hs`]);
    });
    parametros.push(['Sábados']);
    franjasSab.filter(f => f.checked).forEach(f => {
      parametros.push([`${f.label}: de ${f.inicio} a ${f.fin} hs`]);
    });
    parametros.push(['Domingos y Feriados']);
    if (franjaDom.checked) {
      parametros.push([`${franjaDom.label}: de ${franjaDom.inicio} a ${franjaDom.fin} hs`]);
    }
    parametros.push(['']);
    parametros.push([`Meses de baja demanda:`, mesesBaja.map(m => MESES.find(mm => mm.key === m)?.label).join(', ') || '---']);
    parametros.push([`Meses de alta demanda:`, mesesAlta.map(m => MESES.find(mm => mm.key === m)?.label).join(', ') || '---']);
    parametros.push([`Rango de informe:`, `${fechaInicio || '---'} a ${fechaFin || '---'}`]);
    const wsParams = XLSX.utils.aoa_to_sheet(parametros);
    XLSX.utils.book_append_sheet(wb, wsParams, 'Parámetros');

    XLSX.writeFile(wb, 'reporte_promedio_buses.xlsx');
  }

  // Mapeo de nombres de franjas por tipo de día y rango horario
  const nombreFranjaPorDiaYRango = {
    'Lunes a Viernes': {
      '05-07': 'Pico Mañana',
      '08-15': 'Postpico Mañana',
      '16-18': 'Pico Tarde',
      '19-20': 'Postpico Tarde',
      '21-22': 'Nocturno'
    },
    'Sábados': {
      '06-15': 'Pico',
      '16-20': 'Postpico',
      '21-22': 'Nocturno'
    },
    'Domingos y Feriados': {
      '07-19': 'Horario Normal'
    }
  };

  // Definir columnas para react-table
  const columnasReporte = React.useMemo(() => [
    { header: 'Gremio', accessorKey: 'GREMIO' },
    { header: 'Código Empresa', accessorKey: 'CÓDIGO EMPRESA' },
    { header: 'Empresa', accessorKey: 'EMPRESA' },
    { header: 'Mes/Año', accessorKey: 'MES' },
    { header: 'Demanda', accessorKey: 'PERIODO' },
    { header: 'Día', accessorKey: 'DÍA' },
    { header: 'Franja', accessorKey: 'FRANJA' },
    { header: 'Hora', accessorKey: 'HORA' },
    { header: 'Promedio Buses', accessorKey: 'PROMEDIO' },
  ], []);

  const pasos = [
    {
      titulo: "Definir franjas horarias",
      contenido: (
        <div>
          {/* Lunes a Viernes */}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: 17, background: openGroup === 'lv' ? '#e3f2fd' : '#f5f5f5', padding: '8px 12px', borderRadius: 8, marginBottom: 4 }}
              onClick={() => setOpenGroup(openGroup === 'lv' ? null : 'lv')}
            >
              {openGroup === 'lv' ? '▼' : '►'} Lunes a Viernes
            </div>
            {openGroup === 'lv' && (
              <div style={{ padding: '8px 0 0 12px' }}>
                {franjasLV.map((f, idx) => (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={f.checked}
                      onChange={e => {
                        setFranjasLV(arr => arr.map((fr, i) => i === idx ? { ...fr, checked: e.target.checked } : fr));
                      }}
                    />
                    <span style={{ minWidth: 140 }}>{f.label}</span>
                    <span>de</span>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={f.inicio}
                      onChange={e => {
                        let v = e.target.value;
                        setFranjasLV(arr => arr.map((fr, i) => i === idx ? { ...fr, inicio: v } : fr));
                      }}
                      style={{ width: 50 }}
                      disabled={!f.checked}
                    />
                    <span>a</span>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={f.fin}
                      onChange={e => {
                        let v = e.target.value;
                        setFranjasLV(arr => arr.map((fr, i) => i === idx ? { ...fr, fin: v } : fr));
                      }}
                      style={{ width: 50 }}
                      disabled={!f.checked}
                    />
                    <span>hs</span>
                  </div>
                ))}
                {errorLV && <div style={{ color: '#d84315', marginTop: 8 }}>{errorLV}</div>}
              </div>
            )}
          </div>
          {/* Sábados */}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: 17, background: openGroup === 'sab' ? '#e3f2fd' : '#f5f5f5', padding: '8px 12px', borderRadius: 8, marginBottom: 4 }}
              onClick={() => setOpenGroup(openGroup === 'sab' ? null : 'sab')}
            >
              {openGroup === 'sab' ? '▼' : '►'} Sábados
            </div>
            {openGroup === 'sab' && (
              <div style={{ padding: '8px 0 0 12px' }}>
                {franjasSab.map((f, idx) => (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={f.checked}
                      onChange={e => {
                        setFranjasSab(arr => arr.map((fr, i) => i === idx ? { ...fr, checked: e.target.checked } : fr));
                      }}
                    />
                    <span style={{ minWidth: 140 }}>{f.label}</span>
                    <span>de</span>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={f.inicio}
                      onChange={e => {
                        let v = e.target.value;
                        setFranjasSab(arr => arr.map((fr, i) => i === idx ? { ...fr, inicio: v } : fr));
                      }}
                      style={{ width: 50 }}
                      disabled={!f.checked}
                    />
                    <span>a</span>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={f.fin}
                      onChange={e => {
                        let v = e.target.value;
                        setFranjasSab(arr => arr.map((fr, i) => i === idx ? { ...fr, fin: v } : fr));
                      }}
                      style={{ width: 50 }}
                      disabled={!f.checked}
                    />
                    <span>hs</span>
                  </div>
                ))}
                {errorSab && <div style={{ color: '#d84315', marginTop: 8 }}>{errorSab}</div>}
              </div>
            )}
          </div>
          {/* Domingos y Feriados */}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: 17, background: openGroup === 'dom' ? '#e3f2fd' : '#f5f5f5', padding: '8px 12px', borderRadius: 8, marginBottom: 4 }}
              onClick={() => setOpenGroup(openGroup === 'dom' ? null : 'dom')}
            >
              {openGroup === 'dom' ? '▼' : '►'} Domingos y Feriados
            </div>
            {openGroup === 'dom' && (
              <div style={{ padding: '8px 0 0 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={franjaDom.checked}
                    onChange={e => setFranjaDom(fr => ({ ...fr, checked: e.target.checked }))}
                  />
                  <span style={{ minWidth: 140 }}>{franjaDom.label}</span>
                  <span>de</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={franjaDom.inicio}
                    onChange={e => setFranjaDom(fr => ({ ...fr, inicio: e.target.value }))}
                    style={{ width: 50 }}
                    disabled={!franjaDom.checked}
                  />
                  <span>a</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={franjaDom.fin}
                    onChange={e => setFranjaDom(fr => ({ ...fr, fin: e.target.value }))}
                    style={{ width: 50 }}
                    disabled={!franjaDom.checked}
                  />
                  <span>hs</span>
                </div>
                {errorDom && <div style={{ color: '#d84315', marginTop: 8 }}>{errorDom}</div>}
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      titulo: "Seleccionar meses de baja y alta demanda",
      contenido: (
        <div style={{ display: 'flex', gap: 32 }}>
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Meses de baja demanda</div>
            {MESES.map(m => (
              <label key={m.key} style={{ display: 'block', marginBottom: 2 }}>
                <input
                  type="checkbox"
                  checked={mesesBaja.includes(m.key)}
                  onChange={e => {
                    if (e.target.checked) {
                      setMesesBaja(arr => [...arr, m.key]);
                      setMesesAlta(arr => arr.filter(x => x !== m.key)); // Remover de alta si se selecciona en baja
                    } else {
                      setMesesBaja(arr => arr.filter(x => x !== m.key));
                    }
                  }}
                  disabled={mesesAlta.includes(m.key)}
                /> {m.label}
              </label>
            ))}
          </div>
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Meses de alta demanda</div>
            {MESES.map(m => (
              <label key={m.key} style={{ display: 'block', marginBottom: 2 }}>
                <input
                  type="checkbox"
                  checked={mesesAlta.includes(m.key)}
                  onChange={e => {
                    if (e.target.checked) {
                      setMesesAlta(arr => [...arr, m.key]);
                      setMesesBaja(arr => arr.filter(x => x !== m.key)); // Remover de baja si se selecciona en alta
                    } else {
                      setMesesAlta(arr => arr.filter(x => x !== m.key));
                    }
                  }}
                  disabled={mesesBaja.includes(m.key)}
                /> {m.label}
              </label>
            ))}
          </div>
          {errorMeses && <div style={{ color: '#d84315', marginTop: 12, fontWeight: 'bold', width: '100%' }}>{errorMeses}</div>}
        </div>
      )
    },
    {
      titulo: "Seleccionar rango de fechas y días para el informe",
      contenido: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            <div>
              <label style={{ fontWeight: 'bold' }}>Fecha de inicio: </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={e => setFechaInicio(e.target.value)}
                max={fechaFin || undefined}
              />
            </div>
            <div>
              <label style={{ fontWeight: 'bold' }}>Fecha de fin: </label>
              <input
                type="date"
                value={fechaFin}
                onChange={e => setFechaFin(e.target.value)}
                min={fechaInicio || undefined}
                max={(() => { const hoy = new Date().toISOString().slice(0, 10); return hoy; })()}
              />
            </div>
          </div>
          {errorRangoFechas && <div style={{ color: '#d84315', marginTop: 12, fontWeight: 'bold', width: '100%' }}>{errorRangoFechas}</div>}
          <div>
            <label style={{ fontWeight: 'bold', marginBottom: 8, display: 'block' }}>Días de la semana a incluir:</label>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {DIAS_SEMANA.map(dia => (
                <label key={dia.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={diasSeleccionados.includes(dia.key)}
                    onChange={e => {
                      if (e.target.checked) {
                        setDiasSeleccionados(arr => [...arr, dia.key]);
                      } else {
                        setDiasSeleccionados(arr => arr.filter(x => x !== dia.key));
                      }
                    }}
                  /> {dia.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontWeight: 'bold', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={agruparPorMes}
                onChange={e => setAgruparPorMes(e.target.checked)}
              />
              Agrupar por mes
            </label>
          </div>
        </div>
      )
    },
    {
      titulo: "Generar reporte de promedio de buses operando",
      contenido: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <b>Resumen de selección:</b><br />
            <b>Lunes a Viernes:</b>
            <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>
              {franjasLV.filter(f => f.checked).map(f => (
                <li key={f.key}>{f.label}: de {f.inicio} a {f.fin} hs</li>
              ))}
            </ul>
            <b>Sábados:</b>
            <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>
              {franjasSab.filter(f => f.checked).map(f => (
                <li key={f.key}>{f.label}: de {f.inicio} a {f.fin} hs</li>
              ))}
            </ul>
            <b>Domingos y Feriados:</b>
            <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>
              {franjaDom.checked && (
                <li>{franjaDom.label}: de {franjaDom.inicio} a {franjaDom.fin} hs</li>
              )}
            </ul>
            <b>Rango de informe:</b> {fechaInicio || '---'} a {fechaFin || '---'}<br />
            <b>Días seleccionados:</b> {diasSeleccionados.length > 0 ? diasSeleccionados.map(d => DIAS_SEMANA.find(x => x.key === d)?.label).join(', ') : '---'}<br />
            <br />
            Meses de baja demanda: {mesesBaja.map(m => MESES.find(mm => mm.key === m)?.label).join(', ') || '---'}<br />
            Meses de alta demanda: {mesesAlta.map(m => MESES.find(mm => mm.key === m)?.label).join(', ') || '---'}<br />
            <b>El reporte será el promedio de buses operando, por fecha, por franja, por hora, y diferenciando:</b><br />
            - Lunes a Viernes<br />
            - Sábados<br />
            - Domingos y Feriados
          </div>
          <div style={{ margin: '16px 0 12px 0' }}>
            {/* Formato de respuesta eliminado */}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button
              onClick={generarReporte}
              style={{ background: '#388e3c', color: '#fff', fontWeight: 'bold', padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 18, cursor: 'pointer' }}
              disabled={generando}
            >
              {generando ? 'Generando...' : 'Generar Reporte'}
            </button>
            <button
              onClick={() => setMostrarGraficoAvanzado(true)}
              style={{ background: '#1976d2', color: '#fff', fontWeight: 'bold', padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 18, cursor: (!reporte || !reporte.data) ? 'not-allowed' : 'pointer' }}
              disabled={!reporte || !reporte.data}
            >
              Generar Gráfico
            </button>
            {(reporte && !reporte.data) && (
              <div style={{ color: '#d84315', marginTop: 8 }}>
                Debe generar el reporte antes de poder visualizar el gráfico.
              </div>
            )}
          </div>
          {errorReporte && <div style={{ color: '#d84315', marginTop: 12 }}>{errorReporte}</div>}
          {/* Reporte solo se muestra en el modal maximizado */}
        </div>
      )
    },
    {
      titulo: 'Reporte generado',
      contenido: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <b>Resumen de selección:</b><br />
            <b>Lunes a Viernes:</b>
            <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>
              {franjasLV.filter(f => f.checked).map(f => (
                <li key={f.key}>{f.label}: de {f.inicio} a {f.fin} hs</li>
              ))}
            </ul>
            <b>Sábados:</b>
            <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>
              {franjasSab.filter(f => f.checked).map(f => (
                <li key={f.key}>{f.label}: de {f.inicio} a {f.fin} hs</li>
              ))}
            </ul>
            <b>Domingos y Feriados:</b>
            <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>
              {franjaDom.checked && (
                <li>{franjaDom.label}: de {franjaDom.inicio} a {franjaDom.fin} hs</li>
              )}
            </ul>
            Meses de baja demanda: {mesesBaja.map(m => MESES.find(mm => mm.key === m)?.label).join(', ') || '---'}<br />
            Meses de alta demanda: {mesesAlta.map(m => MESES.find(mm => mm.key === m)?.label).join(', ') || '---'}<br />
            <b>Rango de informe:</b> {fechaInicio || '---'} a {fechaFin || '---'}<br />
          </div>
          <div style={{ margin: '16px 0 12px 0' }}>
            <button
              onClick={exportarExcel}
              style={{ background: '#388e3c', color: '#fff', fontWeight: 'bold', padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 18, cursor: 'pointer' }}
            >Guardar en Excel</button>
          </div>
          {reporte && reporte.formato === 'tabular' ? (
            <div style={{ marginTop: 18, background: '#f3f3f3', padding: 16, borderRadius: 8, color: '#333', maxHeight: 350, overflow: 'auto' }}>
              <b>Reporte:</b><br />
              <table style={{ width: '100%', fontSize: 14, marginTop: 8, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#e3f2fd' }}>
                    <th>Código Empresa</th><th>Empresa</th><th>Mes/Año</th><th>Tipo Día</th><th>Demanda</th><th>Franja</th><th>Hora</th><th>Promedio Buses</th>
                  </tr>
                </thead>
                <tbody>
                  {generarDatosReporteCompleto().map((r, i) => (
                    <tr key={i}>
                      <td>{r['CÓDIGO EMPRESA']}</td>
                      <td>{r['EMPRESA']}</td>
                      <td>{r['MES']}</td>
                      <td>{r['DÍA']}</td>
                      <td>{r['PERIODO']}</td>
                      <td>{r['FRANJA']}</td>
                      <td>{r['HORA']}</td>
                      <td>{r['PROMEDIO']}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : reporte && (
            <pre style={{ fontSize: 12, marginTop: 8, whiteSpace: 'pre-wrap' }}>{JSON.stringify(reporte.data, null, 2)}</pre>
          )}
        </div>
      )
    }
  ];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.35)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 420, maxWidth: 600, boxShadow: '0 4px 24px #0003', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 18, right: 18, fontSize: 22, background: '#e3f2fd', color: '#1976d2', border: '2px solid #90caf9', borderRadius: 20, width: 'auto', height: 48, padding: '0 24px', cursor: 'pointer', zIndex: 3001, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
          ← Volver
        </button>
        <h2 style={{ marginTop: 0, marginBottom: 24, fontSize: 28 }}>{pasos[step].titulo}</h2>
        <div style={{ minHeight: 120 }}>{pasos[step].contenido}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{ background: '#e0e0e0', color: '#333', fontWeight: 'bold', padding: '8px 24px', borderRadius: 8, border: 'none', fontSize: 16, cursor: step === 0 ? 'not-allowed' : 'pointer' }}
          >Anterior</button>
          <button
            onClick={() => setStep(s => Math.min(pasos.length - 1, s + 1))}
            disabled={step === pasos.length - 1 || (step === 0 && errorFranjas) || (step === 1 && errorMeses) || (step === 2 && errorRangoFechas) || (step === 2 && (!fechaInicio || !fechaFin)) || (step === 3 && generando)}
            style={{ background: '#1976d2', color: '#fff', fontWeight: 'bold', padding: '8px 24px', borderRadius: 8, border: 'none', fontSize: 16, cursor: step === pasos.length - 1 || (step === 0 && errorFranjas) || (step === 1 && errorMeses) || (step === 2 && errorRangoFechas) || (step === 2 && (!fechaInicio || !fechaFin)) || (step === 3 && generando) ? 'not-allowed' : 'pointer' }}
          >Siguiente</button>
        </div>
      </div>
      {mostrarGraficoAvanzado && reporte && reporte.data && (
        <GraficoAvanzadoPromedioBuses
          data={reporte.data}
          nombreFranjaMap={nombreFranjaMap}
          onClose={() => setMostrarGraficoAvanzado(false)}
        />
      )}
      {mostrarReporteMax && reporte && (
        <ReporteMaximizadoModal
          data={generarDatosReporteCompleto()}
          columns={columnasReporte}
          onClose={() => setMostrarReporteMax(false)}
          franjasLV={franjasLV}
          franjasSab={franjasSab}
          franjaDom={franjaDom}
          mesesBaja={mesesBaja}
          mesesAlta={mesesAlta}
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          diasSeleccionados={diasSeleccionados}
        />
      )}
    </div>
  );
}

// Componente de gráfico con selectores tipo Power BI
function GraficoPromedioBuses({ data, nombreFranjaMap, onClose }) {
  // Extraer valores únicos para los selectores
  const empresas = [...new Set(data.map(d => d.empresa_nombre))];
  const meses = [...new Set(data.map(d => `${String(d.mes).padStart(2, '0')}/${d.anio}`))];
  const tipoDias = [...new Set(data.map(d => d.tipo_dia))];
  const franjas = [...new Set(data.map(d => d.franja))];

  // Estado local para filtros
  const [empresa, setEmpresa] = useState(empresas[0] || '');
  const [mes, setMes] = useState(meses[0] || '');
  const [tipoDia, setTipoDia] = useState(tipoDias[0] || '');
  const [franja, setFranja] = useState(franjas[0] || '');

  // Obtener el rango de horas para la franja seleccionada
  function obtenerRangoFranja(franjaKey) {
    // El key de franja es del tipo '06-15' (string)
    if (!franjaKey) return null;
    const partes = franjaKey.split('-');
    if (partes.length !== 2) return null;
    const inicio = Number(partes[0]);
    const fin = Number(partes[1]);
    if (isNaN(inicio) || isNaN(fin)) return null;
    return { inicio, fin };
  }
  const rango = obtenerRangoFranja(franja);

  // Filtrar datos según selección y rango de horas
  const datosFiltrados = data.filter(d =>
    d.empresa_nombre === empresa &&
    `${String(d.mes).padStart(2, '0')}/${d.anio}` === mes &&
    d.tipo_dia === tipoDia &&
    d.franja === franja &&
    (rango ? (d.hora >= rango.inicio && d.hora <= rango.fin) : true)
  );

  // Ordenar por hora
  datosFiltrados.sort((a, b) => a.hora - b.hora);

  // Preparar datos para Chart.js
  const chartData = {
    labels: datosFiltrados.map(d => d.hora),
    datasets: [
      {
        label: 'Promedio de Buses',
        data: datosFiltrados.map(d => d.promedio_buses),
        fill: false,
        borderColor: '#1976d2',
        backgroundColor: '#1976d2',
        tension: 0.2
      }
    ]
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.35)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 420, maxWidth: 700, boxShadow: '0 4px 24px #0003', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 18, right: 18, fontSize: 22, background: '#e3f2fd', color: '#1976d2', border: '2px solid #90caf9', borderRadius: 20, width: 'auto', height: 48, padding: '0 24px', cursor: 'pointer', zIndex: 3001, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
          Cerrar
        </button>
        <h3>Gráfico de Promedio de Buses</h3>
        <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
          <select value={empresa} onChange={e => setEmpresa(e.target.value)}>{empresas.map(e => <option key={e}>{e}</option>)}</select>
          <select value={mes} onChange={e => setMes(e.target.value)}>{meses.map(m => <option key={m}>{m}</option>)}</select>
          <select value={tipoDia} onChange={e => setTipoDia(e.target.value)}>{tipoDias.map(t => <option key={t}>{t}</option>)}</select>
          <select value={franja} onChange={e => setFranja(e.target.value)}>{franjas.map(f => <option key={f}>{nombreFranjaMap[f] || f}</option>)}</select>
        </div>
        <div style={{ width: 600, height: 350 }}>
          <Line data={chartData} />
        </div>
      </div>
    </div>
  );
}

export default ModalPromedioOperativaWizard;