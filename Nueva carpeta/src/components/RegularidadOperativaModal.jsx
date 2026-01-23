import React from "react";

function RegularidadOperativaModal(props) {
  // Desestructurar props de forma compatible con versiones antiguas de JS
  var empresaId = props.empresaId;
  var fecha = props.fecha;
  var onClose = props.onClose;

  // --- FORZAR RESETEO DE ESTADO AL CAMBIAR empresaId o fecha ---
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [modoGremio, setModoGremio] = React.useState(false); // false: EOT, true: gremio
  const [modoSistema, setModoSistema] = React.useState(false); // nuevo: todo el sistema
  const [gremioId, setGremioId] = React.useState(undefined);
  const [gremioNombre, setGremioNombre] = React.useState("");
  const [empresaNombre, setEmpresaNombre] = React.useState("");
  const [pctMenos, setPctMenos] = React.useState(0);
  const [pctMas, setPctMas] = React.useState(0);
  const [promedioRegularidad, setPromedioRegularidad] = React.useState(100);

  // --- Ref para forzar hard reset del estado interno ---
  const resetKeyRef = React.useRef(0);

  // 1. Resetear solo data, loading y error al cambiar empresaId, fecha o modoSistema
  React.useEffect(function() {
    setData(null);
    setLoading(true);
    setError(null);
  }, [empresaId, fecha, modoSistema]);

  // 2. Buscar nombre de empresa y gre_id al montar o cuando empresaId cambia
  React.useEffect(function() {
    if (!empresaId) return;
    fetch(`http://192.168.100.191:8000/empresas`)
      .then(res => res.json())
      .then(empresas => {
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
  }, [empresaId, fecha]);

  // 3. Cargar datos según modo (EOT, gremio o sistema)
  React.useEffect(function() {
    if (!empresaId || !fecha) return;
    if (modoSistema) {
      setLoading(true);
      setError(null);
      fetch(`http://192.168.100.191:8000/sistema/regularidad_por_hora?fecha=${fecha}`)
        .then(res => res.json())
        .then(json => setData(json))
        .catch(() => setError('Error al obtener datos'))
        .finally(() => setLoading(false));
      return;
    }
    if (modoGremio && !gremioId) return; // Espera a que gremioId esté listo en modo gremio
    setLoading(true);
    setError(null);
    let url = modoGremio && gremioId
      ? `http://192.168.100.191:8000/gremios/${gremioId}/regularidad_por_hora_agregado?fecha=${fecha}`
      : `http://192.168.100.191:8000/empresas/${empresaId}/regularidad_por_hora?fecha=${fecha}`;
    fetch(url)
      .then(res => res.json())
      .then(json => setData(json))
      .catch(() => setError('Error al obtener datos'))
      .finally(() => setLoading(false));
  }, [empresaId, fecha, modoGremio, gremioId, modoSistema]);

  // --- Utilidad para sumar datos de empresas por hora ---
  function sumarEmpresasPorHora(empresas) {
    // Sumar servicios_dia y promedio_horas por hora
    const horasSet = new Set();
    empresas.forEach(emp => {
      (emp.servicios_dia || []).forEach(d => horasSet.add(d.hora));
      (emp.promedio_horas || []).forEach(d => horasSet.add(d.hora));
    });
    const horas = Array.from(horasSet).sort((a, b) => a - b);
    // Sumar servicios_dia
    const servicios_dia = horas.map(h => ({
      hora: h,
      servicios: empresas.reduce((sum, emp) => {
        const found = (emp.servicios_dia || []).find(d => d.hora === h);
        return sum + (found ? found.servicios : 0);
      }, 0)
    }));
    // Sumar promedios
    const promedio_horas = horas.map(h => ({
      hora: h,
      promedio: empresas.reduce((sum, emp) => {
        const found = (emp.promedio_horas || []).find(d => d.hora === h);
        return sum + (found ? found.promedio : 0);
      }, 0)
    }));
    return { servicios_dia, promedio_horas };
  }

  // --- Determinar datos a graficar según modo ---
  let datosGraficar = data;
  if (data && data.empresas && Array.isArray(data.empresas)) {
    datosGraficar = sumarEmpresasPorHora(data.empresas);
  }

  React.useEffect(function() {
    if (!datosGraficar || !window.Chart) return;
    var ctx = document.getElementById('regularidad-chart').getContext('2d');
    if (window._regularidadChart) window._regularidadChart.destroy();
    // Preparar datos (siempre limpiar arrays antes de recalcular)
    var horasSet = new Set();
    if (datosGraficar.servicios_dia) datosGraficar.servicios_dia.forEach(function(d) { horasSet.add(d.hora); });
    if (datosGraficar.promedio_horas) datosGraficar.promedio_horas.forEach(function(d) { horasSet.add(d.hora); });
    var horas = Array.from(horasSet).sort(function(a, b) { return a - b; });
    var serviciosPorHora = horas.map(function(h) {
      var found = (datosGraficar.servicios_dia || []).find(function(d) { return d.hora === h; });
      return found ? found.servicios : 0;
    });
    var promedioPorHora = horas.map(function(h) {
      var found = (datosGraficar.promedio_horas || []).find(function(d) { return d.hora === h; });
      return found ? found.promedio : 0;
    });
    var horasValidas = horas.filter(function(h, i) { return promedioPorHora[i] > 0; });
    var serviciosValidos = horasValidas.map(function(h) {
      var found = (datosGraficar.servicios_dia || []).find(function(d) { return d.hora === h; });
      return found ? found.servicios : 0;
    });
    var promediosValidos = horasValidas.map(function(h) {
      var found = (datosGraficar.promedio_horas || []).find(function(d) { return d.hora === h; });
      return found ? found.promedio : 0;
    });
    var menos = 0, mas = 0, iguales = 0;
    var regularidades = [];
    for (var i = 0; i < horasValidas.length; i++) {
      if (serviciosValidos[i] < promediosValidos[i]) menos++;
      else if (serviciosValidos[i] > promediosValidos[i]) mas++;
      else iguales++;
      var base = promediosValidos[i];
      var actual = serviciosValidos[i];
      var reg = base > 0 ? (actual / base) * 100 : (actual === 0 ? 100 : 0);
      regularidades.push(reg);
    }
    var total = horasValidas.length || 1;
    var pctMenosCalc = Math.round((menos/total)*100);
    var pctMasCalc = Math.round((mas/total)*100);
    var promedioRegularidadCalc = regularidades.length > 0 ? (regularidades.reduce((a,b)=>a+b,0)/regularidades.length) : 100;
    setPctMenos(pctMenosCalc);
    setPctMas(pctMasCalc);
    setPromedioRegularidad(Number(promedioRegularidadCalc.toFixed(1)));
    window._regularidadChart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: horas.map(function(h) { return h + ':00'; }),
        datasets: [
          {
            label: 'Servicios en la fecha',
            data: serviciosPorHora,
            borderColor: '#1976d2',
            backgroundColor: 'rgba(25,118,210,0.10)',
            fill: false,
            tension: 0.2,
            pointBackgroundColor: '#1976d2',
            pointRadius: 5,
            pointHoverRadius: 7,
            datalabels: { align: 'top', anchor: 'end', color: '#1976d2', font: { weight: 'bold' } },
          },
          {
            label: 'Promedio 4 semanas previas',
            data: promedioPorHora,
            borderColor: '#ff9800',
            backgroundColor: 'rgba(255,152,0,0.10)',
            fill: false,
            borderDash: [6, 4],
            tension: 0.2,
            pointBackgroundColor: '#ff9800',
            pointRadius: 5,
            pointHoverRadius: 7,
            datalabels: { align: 'bottom', anchor: 'end', color: '#ff9800', font: { weight: 'bold' } },
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#222',
              font: { size: 15, weight: 'bold' },
              padding: 18,
              boxWidth: 24,
              boxHeight: 12,
              backgroundColor: 'rgba(255,255,255,0.7)',
              borderRadius: 8,
              usePointStyle: true,
            },
            title: {
              display: false
            },
          },
          title: { display: true, text: 'Servicios por hora vs Promedio histórico' },
          datalabels: {
            display: true,
            color: '#222',
            font: { weight: 'bold', size: 13 },
            formatter: function(value, context) {
              return value;
            }
          },
          tooltip: {
            enabled: true,
            backgroundColor: '#222',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: '#1976d2',
            borderWidth: 2,
            padding: 12,
            caretSize: 8,
            cornerRadius: 8,
            displayColors: false,
            titleFont: { weight: 'bold', size: 15 },
            bodyFont: { size: 14 },
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.y}`;
              }
            }
          }
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: { title: { display: true, text: 'Hora del día' }, ticks: { color: '#333', font: { size: 13 } } },
          y: { title: { display: true, text: 'Cantidad de servicios' }, beginAtZero: true, ticks: { color: '#333', font: { size: 13 } } },
        },
        layout: {
          padding: { top: 18, right: 12, left: 12, bottom: 8 }
        },
      },
      plugins: window.ChartDataLabels ? [window.ChartDataLabels] : [],
    });
  }, [datosGraficar]);

  React.useEffect(function() {
    if (window.Chart && window.ChartDataLabels) return;
    // Cargar Chart.js y ChartDataLabels si no están
    var loadDatalabels = function() {
      if (window.ChartDataLabels) return;
      var script2 = document.createElement('script');
      script2.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels';
      script2.onload = function() {};
      document.body.appendChild(script2);
    };
    if (!window.Chart) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = function() { loadDatalabels(); };
      document.body.appendChild(script);
    } else {
      loadDatalabels();
    }
  }, []);

  // --- CÁLCULOS DE MÉTRICAS DASHBOARD (REALES) ---
  let icoValue = 0;
  let stdValue = 0;
  let movAvgValue = 0;
  let parqueValue = 0;
  let inactividadValue = 0;
  let continuidadValue = 0;
  let reservaValue = 0;

  if (datosGraficar && datosGraficar.servicios_dia && datosGraficar.promedio_horas) {
    // 1. Índice de Consistencia Operativa (ICO)
    // % de franjas donde actual está dentro de ±10% del promedio histórico
    const UMBRAL = 0.10;
    let totalFranjas = 0, franjasConsistentes = 0;
    datosGraficar.promedio_horas.forEach((ph) => {
      const actual = (datosGraficar.servicios_dia.find(d => d.hora === ph.hora) || {}).servicios || 0;
      if (ph.promedio > 0) {
        totalFranjas++;
        if (Math.abs(actual - ph.promedio) / ph.promedio <= UMBRAL) franjasConsistentes++;
      }
    });
    icoValue = totalFranjas > 0 ? Math.round((franjasConsistentes / totalFranjas) * 100) : 0;

    // 2. Desviación estándar por franja horaria (promedio de std de cada franja)
    // Si hay data.std_horas, usarla; si no, calcular std simple entre actual y promedio
    if (data.std_horas && data.std_horas.length > 0) {
      // Si el backend provee std_horas
      stdValue = (data.std_horas.reduce((a, b) => a + (b.std || 0), 0) / data.std_horas.length).toFixed(2);
    } else {
      // Calcular std simple entre actual y promedio
      let stds = datosGraficar.promedio_horas.map((ph) => {
        const actual = (datosGraficar.servicios_dia.find(d => d.hora === ph.hora) || {}).servicios || 0;
        return Math.abs(actual - ph.promedio);
      });
      stdValue = stds.length > 0 ? (Math.sqrt(stds.reduce((a, b) => a + b * b, 0) / stds.length)).toFixed(2) : 0;
    }

    // 3. Promedio móvil de regularidad (ventana de 3)
    let regularidades = datosGraficar.promedio_horas.map((ph) => {
      const actual = (datosGraficar.servicios_dia.find(d => d.hora === ph.hora) || {}).servicios || 0;
      return ph.promedio > 0 ? (actual / ph.promedio) * 100 : 100;
    });
    let movAvg = [];
    for (let i = 0; i < regularidades.length; i++) {
      let vals = regularidades.slice(Math.max(0, i - 1), Math.min(regularidades.length, i + 2));
      movAvg.push(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    movAvgValue = movAvg.length > 0 ? movAvg.reduce((a, b) => a + b, 0) / movAvg.length : 0;
    movAvgValue = movAvgValue.toFixed(1);

    // 4. Índice de cumplimiento del parque esperado
    // % de buses esperados (promedio) que efectivamente operaron (actual)
    let totalEsperados = datosGraficar.promedio_horas.reduce((a, b) => a + (b.promedio || 0), 0);
    let totalActual = datosGraficar.servicios_dia.reduce((a, b) => a + (b.servicios || 0), 0);
    parqueValue = totalEsperados > 0 ? Math.round((totalActual / totalEsperados) * 100) : 0;

    // 5. Tasa de inactividad o caída operativa
    // % de franjas donde actual < 90% del promedio
    let franjasInactivas = 0;
    datosGraficar.promedio_horas.forEach((ph) => {
      const actual = (datosGraficar.servicios_dia.find(d => d.hora === ph.hora) || {}).servicios || 0;
      if (ph.promedio > 0 && actual < 0.9 * ph.promedio) franjasInactivas++;
    });
    inactividadValue = totalFranjas > 0 ? Math.round((franjasInactivas / totalFranjas) * 100) : 0;

    // 6. Continuidad horaria de operación (máx. franjas consecutivas con servicios > 0)
    let maxCont = 0, cont = 0;
    datosGraficar.servicios_dia.sort((a, b) => a.hora - b.hora).forEach((d, i, arr) => {
      if (d.servicios > 0) {
        cont++;
        if (cont > maxCont) maxCont = cont;
      } else {
        cont = 0;
      }
    });
    continuidadValue = maxCont;

    // 7. Porcentaje de buses de reserva en operación
    // No se puede calcular sin datos de buses individuales y su historial
    reservaValue = '-'; // Placeholder/documentación
  }

  // --- Tooltips de explicación de métricas ---
  const metricExplanations = {
    ico: '<b>INDICE DE CONSISTENCIA OPERATIVA (ICO)</b><br><br><b>Cálculo:</b> Porcentaje de franjas horarias donde la cantidad de buses operando está dentro de un umbral aceptable (por ejemplo, ±10%) respecto al promedio histórico de esa franja.<br><br><b>Fórmula:</b> (fracciones consistentes / total de franjas) × 100.<br><br><b>¿Qué indica?:</b> Mide cuán constante es la operación respecto al comportamiento histórico. Un valor alto significa que la operación diaria es muy similar a lo esperado.',
    std: '<b>DESVIACIÓN ESTÁNDAR POR FRANJA HORARIA</b><br><br><b>Cálculo:</b> Promedio de la desviación estándar de los servicios por franja horaria, usando los datos históricos (si están disponibles) o la diferencia entre actual y promedio.<br><br><b>Fórmula:</b> √(Σ(x - μ)² / n) donde x = servicios por franja, μ = promedio histórico, n = número de franjas.<br><br><b>¿Qué indica?:</b> Mide la variabilidad de la operación por franja. Un valor bajo indica que la cantidad de buses es estable; un valor alto indica mucha variación.',
    movavg: '<b>PROMEDIO MÓVIL DE REGULARIDAD</b><br><br><b>Cálculo:</b> Promedio móvil (ventana de 3 franjas) del porcentaje de regularidad (buses actuales vs promedio histórico) por franja.<br><br><b>Fórmula:</b> Promedio de (servicios actuales / servicios promedio) × 100 para ventana de 3 franjas.<br><br><b>¿Qué indica?:</b> Muestra la tendencia de regularidad a lo largo del día, suavizando picos y caídas.',
    parque: '<b>ÍNDICE DE CUMPLIMIENTO DEL PARQUE ESPERADO</b><br><br><b>Cálculo:</b> Porcentaje de buses esperados (promedio) que efectivamente operaron (actual).<br><br><b>Fórmula:</b> (total actual / total esperado) × 100.<br><br><b>¿Qué indica?:</b> Mide el grado de cumplimiento de la flota planificada. Un valor bajo indica que faltaron buses respecto a lo esperado.',
    inactividad: '<b>TASA DE INACTIVIDAD O CAÍDA OPERATIVA</b><br><br><b>Cálculo:</b> Porcentaje de franjas donde actual < 90% del promedio.<br><br><b>Fórmula:</b> (franjas inactivas / total de franjas) × 100.<br><br><b>¿Qué indica?:</b> Mide la frecuencia de caídas operativas. Un valor alto indica que hubo muchas franjas con menos buses de lo esperado.',
    continuidad: '<b>CONTINUIDAD HORARIA DE OPERACIÓN</b><br><br><b>Cálculo:</b> Máx. franjas consecutivas con servicios > 0.<br><br><b>Fórmula:</b> Máximo número de franjas consecutivas donde servicios > 0.<br><br><b>¿Qué indica?:</b> Mide la continuidad del servicio a lo largo del día. Un valor bajo puede indicar interrupciones o huecos en la operación.',
    reserva: '<b>PORCENTAJE DE BUSES DE RESERVA EN OPERACIÓN</b><br><br><b>Cálculo:</b> Porcentaje de buses de reserva en operación.<br><br><b>Fórmula:</b> (buses de reserva en operación / total de buses) × 100.<br><br><b>¿Qué indica?:</b> Mide el uso de la reserva operativa. Un valor alto puede indicar incidencias o refuerzos extraordinarios. (No disponible con los datos actuales)',
    promedioPico: '<b>PROMEDIO DE SERVICIOS EN HORA PICO</b><br><br><b>Cálculo:</b> Promedio de servicios realizados en las franjas de 5, 6 y 7 (mañana) y 16, 17 y 18 (tarde) para la fecha seleccionada.<br><br><b>¿Qué indica?:</b> Permite comparar la cantidad de buses activos en los horarios de mayor demanda, tanto en la mañana como en la tarde.'
  };
  const [tooltip, setTooltip] = React.useState({visible: false, x: 0, y: 0, text: ''});
  // Ocultar tooltip al hacer click en otro lado
  React.useEffect(() => {
    if (!tooltip.visible) return;
    const hide = () => setTooltip(t => ({...t, visible: false}));
    window.addEventListener('click', hide);
    return () => window.removeEventListener('click', hide);
  }, [tooltip.visible]);
  // Render del tooltip flotante
  const Tooltip = tooltip.visible ? (
    <div style={{
      position: 'fixed',
      left: tooltip.x + 10,
      top: tooltip.y + 10,
      background: '#222',
      color: '#fff',
      padding: '10px 16px',
      borderRadius: 8,
      fontSize: 15,
      zIndex: 3000,
      maxWidth: 320,
      boxShadow: '0 4px 16px #0005',
      pointerEvents: 'none',
      whiteSpace: 'pre-line',
    }} dangerouslySetInnerHTML={{ __html: tooltip.text }}></div>
  ) : null;

  // --- Ajustes de tamaño del gráfico (fácilmente modificables) ---
  const GRAPH_HEIGHT = 450;        // ← Cambia este valor para el alto del gráfico
  const GRAPH_MAX_HEIGHT = 450;    // ← Cambia este valor para el alto máximo
  const GRAPH_MAX_WIDTH = 1700;     // ← Cambia este valor para el ancho máximo

  // --- Botón para descargar el gráfico ---
  function handleDownloadChart() {
    const canvas = document.getElementById('regularidad-chart');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'regularidad.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.35)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'stretch',
        padding: 0,
        margin: 0,
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 0, // Sin bordes redondeados para fullscreen
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
          Índice de Regularidad Operativa
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
        {/* Dashboard de métricas */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 32,
          marginBottom: 32,
          justifyContent: 'center',
          marginTop: 24,
        }}>
          {/* Índice de Consistencia Operativa (ICO) */}
          <div
            style={{
              background:'#e3f2fd',
              borderRadius:10,
              padding:18,
              minWidth:180,
              boxShadow:'0 2px 8px #1976d222',
              flex:'1 1 180px',
              textAlign:'center',
              cursor:'pointer',
              border:'2px solid #90caf9',
            }}
            onClick={e => {setTooltip({visible:true, x:e.clientX, y:e.clientY, text:metricExplanations.ico}); e.stopPropagation();}}
          >
            <div style={{fontSize:15, color:'#1976d2', fontWeight:'bold', marginBottom:6}}>ICO</div>
            <div style={{fontSize:34, fontWeight:'bold', color:'#1976d2'}}>{icoValue}%</div>
            <div style={{fontSize:13, color:'#1976d2'}}>Consistencia</div>
          </div>
          {/* Desviación estándar */}
          <div
            style={{
              background:'#f3e5f5',
              borderRadius:10,
              padding:18,
              minWidth:180,
              boxShadow:'0 2px 8px #8e24aa22',
              flex:'1 1 180px',
              textAlign:'center',
              cursor:'pointer',
              border:'2px solid #ce93d8',
            }}
            onClick={e => {setTooltip({visible:true, x:e.clientX, y:e.clientY, text:metricExplanations.std}); e.stopPropagation();}}
          >
            <div style={{fontSize:15, color:'#8e24aa', fontWeight:'bold', marginBottom:6}}>STD</div>
            <div style={{fontSize:34, fontWeight:'bold', color:'#8e24aa'}}>{stdValue}</div>
            <div style={{fontSize:13, color:'#8e24aa'}}>Desviación</div>
          </div>
          {/* Promedio móvil */}
          <div
            style={{
              background:'#e8f5e9',
              borderRadius:10,
              padding:18,
              minWidth:180,
              boxShadow:'0 2px 8px #43a04722',
              flex:'1 1 180px',
              textAlign:'center',
              cursor:'pointer',
              border:'2px solid #a5d6a7',
            }}
            onClick={e => {setTooltip({visible:true, x:e.clientX, y:e.clientY, text:metricExplanations.movavg}); e.stopPropagation();}}
          >
            <div style={{fontSize:15, color:'#43a047', fontWeight:'bold', marginBottom:6}}>Promedio</div>
            <div style={{fontSize:34, fontWeight:'bold', color:'#43a047'}}>{movAvgValue}%</div>
            <div style={{fontSize:13, color:'#43a047'}}>Móvil</div>
          </div>
          {/* Parque esperado */}
          <div
            style={{
              background:'#fff3e0',
              borderRadius:10,
              padding:18,
              minWidth:180,
              boxShadow:'0 2px 8px #ff980022',
              flex:'1 1 180px',
              textAlign:'center',
              cursor:'pointer',
              border:'2px solid #ffcc80',
            }}
            onClick={e => {setTooltip({visible:true, x:e.clientX, y:e.clientY, text:metricExplanations.parque}); e.stopPropagation();}}
          >
            <div style={{fontSize:15, color:'#ff9800', fontWeight:'bold', marginBottom:6}}>Parque</div>
            <div style={{fontSize:34, fontWeight:'bold', color:'#ff9800'}}>{parqueValue}%</div>
            <div style={{fontSize:13, color:'#ff9800'}}>Cumplimiento</div>
          </div>
          {/* Inactividad */}
          <div
            style={{
              background:'#fbe9e7',
              borderRadius:10,
              padding:18,
              minWidth:180,
              boxShadow:'0 2px 8px #d8431522',
              flex:'1 1 180px',
              textAlign:'center',
              cursor:'pointer',
              border:'2px solid #ffab91',
            }}
            onClick={e => {setTooltip({visible:true, x:e.clientX, y:e.clientY, text:metricExplanations.inactividad}); e.stopPropagation();}}
          >
            <div style={{fontSize:15, color:'#d84315', fontWeight:'bold', marginBottom:6}}>Inactividad</div>
            <div style={{fontSize:34, fontWeight:'bold', color:'#d84315'}}>{inactividadValue}%</div>
            <div style={{fontSize:13, color:'#d84315'}}>Caída</div>
          </div>
          {/* Continuidad */}
          <div
            style={{
              background:'#e1f5fe',
              borderRadius:10,
              padding:18,
              minWidth:180,
              boxShadow:'0 2px 8px #0288d122',
              flex:'1 1 180px',
              textAlign:'center',
              cursor:'pointer',
              border:'2px solid #81d4fa',
            }}
            onClick={e => {setTooltip({visible:true, x:e.clientX, y:e.clientY, text:metricExplanations.continuidad}); e.stopPropagation();}}
          >
            <div style={{fontSize:15, color:'#0288d1', fontWeight:'bold', marginBottom:6}}>Continuidad</div>
            <div style={{fontSize:34, fontWeight:'bold', color:'#0288d1'}}>{continuidadValue}</div>
            <div style={{fontSize:13, color:'#0288d1'}}>Franjas</div>
          </div>
          {/* Reserva */}
          <div
            style={{
              background:'#f9fbe7',
              borderRadius:10,
              padding:18,
              minWidth:180,
              boxShadow:'0 2px 8px #cddc3922',
              flex:'1 1 180px',
              textAlign:'center',
              cursor:'pointer',
              border:'2px solid #f0f4c3',
            }}
            onClick={e => {setTooltip({visible:true, x:e.clientX, y:e.clientY, text:metricExplanations.reserva}); e.stopPropagation();}}
          >
            <div style={{fontSize:15, color:'#cddc39', fontWeight:'bold', marginBottom:6}}>Reserva</div>
            <div style={{fontSize:34, fontWeight:'bold', color:'#cddc39'}}>{reservaValue}</div>
            <div style={{fontSize:13, color:'#cddc39'}}>Buses</div>
          </div>
          {/* Promedio de servicios en hora pico (mañana y tarde) */}
          <div style={{
            background:'#fffde7',
            borderRadius:12,
            boxShadow:'0 2px 8px #fbc02d33',
            padding:'22px 38px',
            minWidth:220,
            maxWidth:320,
            display:'flex',
            flexDirection:'column',
            alignItems:'center',
            border:'2px solid #ffe082',
          }}
          onClick={e => {setTooltip({visible:true, x:e.clientX, y:e.clientY, text:metricExplanations.promedioPico}); e.stopPropagation();}}
          >
            <div style={{fontSize:15, color:'#fbc02d', fontWeight:'bold', marginBottom:6}}>Promedio de servicios en hora pico</div>
            <div style={{fontSize:34, fontWeight:'bold', color:'#fbc02d'}}>{(() => {
              // Calcular promedios de hora pico mañana (5,6,7) y tarde (16,17,18)
              let promManana = 0, promTarde = 0, nManana = 0, nTarde = 0;
              if (datosGraficar && datosGraficar.servicios_dia) {
                datosGraficar.servicios_dia.forEach(d => {
                  if ([5,6,7].includes(d.hora)) { promManana += d.servicios; nManana++; }
                  if ([16,17,18].includes(d.hora)) { promTarde += d.servicios; nTarde++; }
                });
              }
              promManana = nManana ? (promManana/nManana).toFixed(1) : '-';
              promTarde = nTarde ? (promTarde/nTarde).toFixed(1) : '-';
              return `${promManana} - ${promTarde}`;
            })()}</div>
            <div style={{fontSize:13, color:'#fbc02d'}}>Mañana (5-7) - Tarde (16-18)</div>
          </div>
        </div>
        <div style={{width:'100%', display:'flex', justifyContent:'center', alignItems:'center', margin:'24px 0'}}>
          <canvas id="regularidad-chart" width={GRAPH_MAX_WIDTH} height={GRAPH_HEIGHT} style={{maxWidth:GRAPH_MAX_WIDTH, maxHeight:GRAPH_MAX_HEIGHT, background:'#f8f8ff', borderRadius:12, boxShadow:'0 2px 8px #1976d222'}}></canvas>
        </div>
        {/* Nota y resumen de indicadores */}
        <div style={{width:'100%', maxWidth:900, margin:'0 auto', marginBottom:24, marginTop:-12, textAlign:'center'}}>
          <div style={{fontSize:15, color:'#888', marginBottom:8}}>
            <b>Nota:</b> Se compara la fecha seleccionada con el promedio de los mismos días de la semana de las 4 semanas anteriores.
          </div>
          <div style={{fontSize:18, fontWeight:'bold', textAlign:'center'}}>
            <span style={{color:'#d84315'}}>{pctMenos}% de los horarios tuvo menos servicios que el promedio</span>
            <span style={{margin:'0 18px', color:'#888'}}>|</span>
            <span style={{color:'#43a047'}}>{pctMas}% de los horarios tuvo más servicios que el promedio</span>
            <span style={{margin:'0 18px', color:'#888'}}>|</span>
            <span style={{color:'#1976d2'}}>Regularidad promedio del día: {promedioRegularidad}%</span>
          </div>
        </div>
        {Tooltip}
      </div>
    </div>
  );
}

export default RegularidadOperativaModal; 