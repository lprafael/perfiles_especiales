import React from "react";
import Chart from 'chart.js/auto';
import annotationPlugin from 'chartjs-plugin-annotation';

Chart.register(annotationPlugin);

function RegularidadBusesModal(props) {
  var empresaId = props.empresaId;
  var fecha = props.fecha;
  var onClose = props.onClose;

  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [modoGremio, setModoGremio] = React.useState(false);
  const [modoSistema, setModoSistema] = React.useState(false);
  const [gremioId, setGremioId] = React.useState(undefined);
  const [gremioNombre, setGremioNombre] = React.useState("");
  const [empresaNombre, setEmpresaNombre] = React.useState("");
  const [pctMenos, setPctMenos] = React.useState(0);
  const [pctMas, setPctMas] = React.useState(0);
  const [promedioRegularidad, setPromedioRegularidad] = React.useState(100);
  // El horario pico siempre vendrá resaltado

  React.useEffect(function () {
    setData(null);
    setLoading(true);
    setError(null);
  }, [empresaId, fecha, modoSistema]);

  React.useEffect(function () {
    if (!empresaId) return;
    fetch(`http://localhost:8000/empresas`)
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

  React.useEffect(function () {
    if (!empresaId || !fecha) return;
    if (modoSistema) {
      setLoading(true);
      setError(null);
      fetch(`http://localhost:8000/sistema/buses_regularidad_por_hora_agregado?fecha=${fecha}`)
        .then(res => res.json())
        .then(json => setData(json))
        .catch(() => setError('Error al obtener datos'))
        .finally(() => setLoading(false));
      return;
    }
    if (modoGremio && !gremioId) return;
    setLoading(true);
    setError(null);
    let url = modoGremio && gremioId
      ? `http://localhost:8000/gremios/${gremioId}/buses_regularidad_por_hora_agregado?fecha=${fecha}`
      : `http://localhost:8000/empresas/${empresaId}/buses_regularidad_por_hora?fecha=${fecha}`;
    fetch(url)
      .then(res => res.json())
      .then(json => setData(json))
      .catch(() => setError('Error al obtener datos'))
      .finally(() => setLoading(false));
  }, [empresaId, fecha, modoGremio, gremioId, modoSistema]);

  // --- Utilidad para sumar datos de empresas por hora ---
  function sumarEmpresasPorHora(empresas) {
    // Sumar buses_dia y promedio_horas por hora
    const horasSet = new Set();
    empresas.forEach(emp => {
      (emp.buses_dia || []).forEach(d => horasSet.add(d.hora));
      (emp.promedio_horas || []).forEach(d => horasSet.add(d.hora));
    });
    const horas = Array.from(horasSet).sort((a, b) => a - b);
    // Sumar buses_dia
    const buses_dia = horas.map(h => ({
      hora: h,
      buses: empresas.reduce((sum, emp) => {
        const found = (emp.buses_dia || []).find(d => d.hora === h);
        return sum + (found ? found.buses : 0);
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
    return { buses_dia, promedio_horas };
  }

  // --- Determinar datos a graficar según modo ---
  let datosGraficar = data;
  if (data && data.empresas && Array.isArray(data.empresas)) {
    datosGraficar = sumarEmpresasPorHora(data.empresas);
  }

  React.useEffect(function () {
    if (!datosGraficar) return;
    // Verifica que el canvas existe y es válido antes de crear el gráfico
    const canvas = document.getElementById('regularidad-buses-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (window._regularidadBusesChart) window._regularidadBusesChart.destroy();
    var horasSet = new Set();
    if (datosGraficar && datosGraficar.buses_dia) datosGraficar.buses_dia.forEach(function (d) { horasSet.add(d.hora); });
    if (datosGraficar && datosGraficar.promedio_horas) datosGraficar.promedio_horas.forEach(function (d) { horasSet.add(d.hora); });
    var horas = Array.from(horasSet).sort(function (a, b) { return a - b; });
    var busesPorHora = horas.map(function (h) {
      var found = (datosGraficar && datosGraficar.buses_dia ? datosGraficar.buses_dia : []).find(function (d) { return d.hora === h; });
      return found ? found.buses : 0;
    });
    var promedioPorHora = horas.map(function (h) {
      var found = (datosGraficar && datosGraficar.promedio_horas ? datosGraficar.promedio_horas : []).find(function (d) { return d.hora === h; });
      return found ? found.promedio : 0;
    });
    var horasValidas = horas.filter(function (h, i) { return promedioPorHora[i] > 0; });
    var busesValidos = horasValidas.map(function (h) {
      var found = (datosGraficar && datosGraficar.buses_dia ? datosGraficar.buses_dia : []).find(function (d) { return d.hora === h; });
      return found ? found.buses : 0;
    });
    var promediosValidos = horasValidas.map(function (h) {
      var found = (datosGraficar && datosGraficar.promedio_horas ? datosGraficar.promedio_horas : []).find(function (d) { return d.hora === h; });
      return found ? found.promedio : 0;
    });
    var menos = 0, mas = 0, iguales = 0;
    var regularidades = [];
    for (var i = 0; i < horasValidas.length; i++) {
      if (busesValidos[i] < promediosValidos[i]) menos++;
      else if (busesValidos[i] > promediosValidos[i]) mas++;
      else iguales++;
      var base = promediosValidos[i];
      var actual = busesValidos[i];
      var reg = base > 0 ? (actual / base) * 100 : (actual === 0 ? 100 : 0);
      regularidades.push(reg);
    }
    var total = horasValidas.length || 1;
    var pctMenosCalc = Math.round((menos / total) * 100);
    var pctMasCalc = Math.round((mas / total) * 100);
    var promedioRegularidadCalc = regularidades.length > 0 ? (regularidades.reduce((a, b) => a + b, 0) / regularidades.length) : 100;
    setPctMenos(pctMenosCalc);
    setPctMas(pctMasCalc);
    setPromedioRegularidad(Number(promedioRegularidadCalc.toFixed(1)));
    // --- Configuración de anotaciones para resaltar horas pico ---
    // Eliminado: No se agregan anotaciones para horas pico para evitar errores de backgroundColor
    let annotation = undefined;
    // Construir pluginsOptions SIN la opción annotation
    const pluginsOptions = {
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
      title: { display: true, text: 'Buses operativos por hora vs Promedio histórico' },
      datalabels: {
        display: true,
        color: '#222',
        font: { weight: 'bold', size: 13 },
        formatter: function (value, context) {
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
          label: function (context) {
            return `${context.dataset.label}: ${context.parsed.y}`;
          }
        }
      },
    };
    // Log de depuración para pluginsOptions
    console.log('pluginsOptions:', pluginsOptions);
    window._regularidadBusesChart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: horas.map(function (h) { return h + ':00'; }),
        datasets: [
          {
            label: 'Buses operativos en la fecha',
            data: busesPorHora,
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
        plugins: pluginsOptions,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: { title: { display: true, text: 'Hora del día' }, ticks: { color: '#333', font: { size: 13 } } },
          y: { title: { display: true, text: 'Cantidad de buses' }, beginAtZero: true, ticks: { color: '#333', font: { size: 13 } } },
        },
        layout: {
          padding: { top: 18, right: 12, left: 12, bottom: 8 }
        },
      },
      plugins: [annotationPlugin, window.ChartDataLabels].filter(Boolean),
    });
    // Cleanup: destruye el gráfico al desmontar y limpia el canvas
    return () => {
      if (window._regularidadBusesChart) {
        window._regularidadBusesChart.destroy();
        window._regularidadBusesChart = null;
      }
      // Limpia el canvas
      const canvas = document.getElementById('regularidad-buses-chart');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [datosGraficar]);

  React.useEffect(function () {
    if (window.Chart && window.ChartDataLabels) return;
    var loadDatalabels = function () {
      if (window.ChartDataLabels) return;
      var script2 = document.createElement('script');
      script2.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels';
      script2.onload = function () { };
      document.body.appendChild(script2);
    };
    if (!window.Chart) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = function () { loadDatalabels(); };
      document.body.appendChild(script);
    } else {
      loadDatalabels();
    }
  }, []);

  // Registrar el plugin de anotaciones si no está registrado
  React.useEffect(() => {
    if (window.Chart && !window.ChartAnnotation) {
      try {
        window.Chart.register(annotationPlugin);
        window.ChartAnnotation = annotationPlugin;
      } catch (e) {
        // Ya registrado o error
      }
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
  let promedioPicoHistoricoManana = '-';
  let promedioPicoHistoricoTarde = '-';

  if (datosGraficar && datosGraficar.buses_dia && datosGraficar.promedio_horas) {
    // 1. Índice de Consistencia Operativa (ICO)
    const UMBRAL = 0.10;
    let totalFranjas = 0, franjasConsistentes = 0;
    datosGraficar.promedio_horas.forEach((ph) => {
      const actual = (datosGraficar.buses_dia.find(d => d.hora === ph.hora) || {}).buses || 0;
      if (ph.promedio > 0) {
        totalFranjas++;
        if (Math.abs(actual - ph.promedio) / ph.promedio <= UMBRAL) franjasConsistentes++;
      }
    });
    icoValue = totalFranjas > 0 ? Math.round((franjasConsistentes / totalFranjas) * 100) : 0;

    // 2. Desviación estándar por franja horaria
    if (data && data.std_horas && data.std_horas.length > 0) {
      stdValue = (data.std_horas.reduce((a, b) => a + (b.std || 0), 0) / data.std_horas.length).toFixed(2);
    } else {
      let stds = datosGraficar.promedio_horas.map((ph) => {
        const actual = (datosGraficar.buses_dia.find(d => d.hora === ph.hora) || {}).buses || 0;
        return Math.abs(actual - ph.promedio);
      });
      stdValue = stds.length > 0 ? (Math.sqrt(stds.reduce((a, b) => a + b * b, 0) / stds.length)).toFixed(2) : 0;
    }

    // 3. Promedio móvil de regularidad (ventana de 3)
    let regularidades = datosGraficar.promedio_horas.map((ph) => {
      const actual = (datosGraficar.buses_dia.find(d => d.hora === ph.hora) || {}).buses || 0;
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
    let totalEsperados = datosGraficar.promedio_horas.reduce((a, b) => a + (b.promedio || 0), 0);
    let totalActual = datosGraficar.buses_dia.reduce((a, b) => a + (b.buses || 0), 0);
    parqueValue = totalEsperados > 0 ? Math.round((totalActual / totalEsperados) * 100) : 0;

    // 5. Tasa de inactividad o caída operativa
    let franjasInactivas = 0;
    datosGraficar.promedio_horas.forEach((ph) => {
      const actual = (datosGraficar.buses_dia.find(d => d.hora === ph.hora) || {}).buses || 0;
      if (ph.promedio > 0 && actual < 0.9 * ph.promedio) franjasInactivas++;
    });
    inactividadValue = totalFranjas > 0 ? Math.round((franjasInactivas / totalFranjas) * 100) : 0;

    // 6. Continuidad horaria de operación
    let maxCont = 0, cont = 0;
    datosGraficar.buses_dia.sort((a, b) => a.hora - b.hora).forEach((d, i, arr) => {
      if (d.buses > 0) {
        cont++;
        if (cont > maxCont) maxCont = cont;
      } else {
        cont = 0;
      }
    });
    continuidadValue = maxCont;

    // 7. Porcentaje de buses de reserva en operación
    // Calcular promedio de buses en hora pico histórico (4 semanas previas)
    let promManana = 0, promTarde = 0, nManana = 0, nTarde = 0;
    datosGraficar.promedio_horas.forEach(d => {
      if ([5, 6, 7].includes(d.hora)) { promManana += d.promedio; nManana++; }
      if ([16, 17, 18].includes(d.hora)) { promTarde += d.promedio; nTarde++; }
    });
    promedioPicoHistoricoManana = nManana ? (promManana / nManana).toFixed(1) : '-';
    promedioPicoHistoricoTarde = nTarde ? (promTarde / nTarde).toFixed(1) : '-';
  }

  // --- Tooltips de explicación de métricas (adaptados a buses) ---
  const metricExplanations = {
    ico: '<b>INDICE DE CONSISTENCIA OPERATIVA (ICO)</b><br><br><b>Cálculo:</b> Porcentaje de franjas horarias donde la cantidad de buses operando está dentro de un umbral aceptable (por ejemplo, ±10%) respecto al promedio histórico de esa franja.<br><br><b>¿Qué indica?:</b> Mide cuán constante es la operación de buses respecto al comportamiento histórico.',
    std: '<b>DESVIACIÓN ESTÁNDAR POR FRANJA HORARIA</b><br><br><b>Cálculo:</b> Promedio de la desviación estándar de los buses por franja horaria, usando los datos históricos (si están disponibles) o la diferencia entre actual y promedio.<br><br><b>¿Qué indica?:</b> Mide la variabilidad de la operación de buses por franja.',
    movavg: '<b>PROMEDIO MÓVIL DE REGULARIDAD</b><br><br><b>Cálculo:</b> Promedio móvil (ventana de 3 franjas) del porcentaje de regularidad (buses actuales vs promedio histórico) por franja.<br><br><b>¿Qué indica?:</b> Muestra la tendencia de regularidad de buses a lo largo del día.',
    parque: '<b>ÍNDICE DE CUMPLIMIENTO DEL PARQUE ESPERADO</b><br><br><b>Cálculo:</b> Porcentaje de buses esperados (promedio) que efectivamente operaron (actual).<br><br><b>¿Qué indica?:</b> Mide el grado de cumplimiento de la flota planificada de buses.',
    inactividad: '<b>TASA DE INACTIVIDAD O CAÍDA OPERATIVA</b><br><br><b>Cálculo:</b> Porcentaje de franjas donde actual < 90% del promedio.<br><br><b>¿Qué indica?:</b> Mide la frecuencia de caídas operativas de buses.',
    continuidad: '<b>CONTINUIDAD HORARIA DE OPERACIÓN</b><br><br><b>Cálculo:</b> Máx. franjas consecutivas con buses > 0.<br><br><b>¿Qué indica?:</b> Mide la continuidad del servicio de buses a lo largo del día.',
    reserva: '<b>PORCENTAJE DE BUSES DE RESERVA EN OPERACIÓN</b><br><br><b>¿Qué indica?:</b> Mide el uso de la reserva operativa de buses. (No disponible con los datos actuales)',
    promedioPico: '<b>PROMEDIO DE BUSES EN HORA PICO</b><br><br><b>Cálculo:</b> Promedio de buses que operaron en las franjas de 5, 6 y 7 (mañana) y 16, 17 y 18 (tarde) para la fecha seleccionada.<br><br><b>¿Qué indica?:</b> Permite comparar la cantidad de buses activos en los horarios de mayor demanda.'
  };
  const [tooltip, setTooltip] = React.useState({ visible: false, x: 0, y: 0, text: '' });
  React.useEffect(() => {
    if (!tooltip.visible) return;
    const hide = () => setTooltip(t => ({ ...t, visible: false }));
    window.addEventListener('click', hide);
    return () => window.removeEventListener('click', hide);
  }, [tooltip.visible]);
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

  // --- Botones de modo ---
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
        <button onClick={onClose} style={{ position: 'fixed', top: 18, right: 18, fontSize: 32, background: '#eee', border: 'none', borderRadius: 20, width: 48, height: 48, cursor: 'pointer', zIndex: 3001, boxShadow: '0 2px 8px #0002' }}>
          ×
        </button>
        <h2 style={{ marginTop: 32, marginLeft: 32, fontSize: 36 }}>
          Índice de Regularidad de Buses
        </h2>
        <div style={{ marginBottom: 8, fontSize: 20, color: '#555', marginLeft: 32 }}>
          {modoSistema
            ? (<span>Mostrando <b>todo el sistema</b>{fecha ? ` | Fecha: ${fecha}` : ''}</span>)
            : modoGremio
              ? (<span>Mostrando <b>todo el gremio</b>{gremioNombre ? `: ${gremioNombre}` : ''}{fecha ? ` | Fecha: ${fecha}` : ''}</span>)
              : (<span>Mostrando <b>empresa</b>{empresaNombre ? `: ${empresaNombre}` : ''}{fecha ? ` | Fecha: ${fecha}` : ''}</span>)}
        </div>
        {/* Botones de modo */}
        <div style={{ display: 'flex', gap: 16, marginLeft: 32, marginBottom: 16 }}>
          {!modoGremio && !modoSistema && (
            <button onClick={() => { setModoGremio(true); setModoSistema(false); }} style={{ background: '#fffde7', color: '#fbc02d', border: '1px solid #ffe082', borderRadius: 8, padding: '8px 18px', fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}>Ampliar a Gremio</button>
          )}
          {modoGremio && !modoSistema && (
            <button onClick={() => { setModoSistema(true); }} style={{ background: '#e3f2fd', color: '#1976d2', border: '1px solid #90caf9', borderRadius: 8, padding: '8px 18px', fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}>Todo el sistema</button>
          )}
          {(modoGremio || modoSistema) && (
            <button onClick={() => { setModoGremio(false); setModoSistema(false); }} style={{ background: '#e0e0e0', color: '#333', border: '1px solid #bbb', borderRadius: 8, padding: '8px 18px', fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}>Volver a empresa</button>
          )}
        </div>
        {/* Dashboard de métricas */}
        <div style={{
          display: 'flex',
          flexWrap: 'nowrap',
          gap: 32,
          marginBottom: 32,
          justifyContent: 'flex-start',
          marginTop: 24,
          overflowX: 'auto',
          width: '100%',
          paddingLeft: 32,
          paddingRight: 32,
          minHeight: 220, // Aumenta el alto mínimo del dashboard
          height: 260, // Altura fija opcional para el dashboard
        }}>
          {/* Índice de Consistencia Operativa (ICO) */}
          <div
            style={{
              background: '#e3f2fd',
              borderRadius: 10,
              padding: 18,
              minWidth: 180,
              minHeight: 180, // Aumenta el alto mínimo de la tarjeta
              height: 210, // Altura fija opcional para la tarjeta
              boxShadow: '0 2px 8px #1976d222',
              flex: '1 1 180px',
              textAlign: 'center',
              cursor: 'pointer',
              border: '2px solid #90caf9',
            }}
            onClick={e => { setTooltip({ visible: true, x: e.clientX, y: e.clientY, text: metricExplanations.ico }); e.stopPropagation(); }}
          >
            <div style={{ fontSize: 15, color: '#1976d2', fontWeight: 'bold', marginBottom: 6 }}>ICO</div>
            <div style={{ fontSize: 34, fontWeight: 'bold', color: '#1976d2' }}>{icoValue}%</div>
            <div style={{ fontSize: 13, color: '#1976d2' }}>Consistencia</div>
          </div>
          {/* Desviación estándar */}
          <div
            style={{
              background: '#f3e5f5',
              borderRadius: 10,
              padding: 18,
              minWidth: 180,
              minHeight: 180, // Aumenta el alto mínimo de la tarjeta
              height: 210, // Altura fija opcional para la tarjeta
              boxShadow: '0 2px 8px #8e24aa22',
              flex: '1 1 180px',
              textAlign: 'center',
              cursor: 'pointer',
              border: '2px solid #ce93d8',
            }}
            onClick={e => { setTooltip({ visible: true, x: e.clientX, y: e.clientY, text: metricExplanations.std }); e.stopPropagation(); }}
          >
            <div style={{ fontSize: 15, color: '#8e24aa', fontWeight: 'bold', marginBottom: 6 }}>STD</div>
            <div style={{ fontSize: 34, fontWeight: 'bold', color: '#8e24aa' }}>{stdValue}</div>
            <div style={{ fontSize: 13, color: '#8e24aa' }}>Desviación</div>
          </div>
          {/* Promedio móvil */}
          <div
            style={{
              background: '#e8f5e9',
              borderRadius: 10,
              padding: 18,
              minWidth: 180,
              minHeight: 180, // Aumenta el alto mínimo de la tarjeta
              height: 210, // Altura fija opcional para la tarjeta
              boxShadow: '0 2px 8px #43a04722',
              flex: '1 1 180px',
              textAlign: 'center',
              cursor: 'pointer',
              border: '2px solid #a5d6a7',
            }}
            onClick={e => { setTooltip({ visible: true, x: e.clientX, y: e.clientY, text: metricExplanations.movavg }); e.stopPropagation(); }}
          >
            <div style={{ fontSize: 15, color: '#43a047', fontWeight: 'bold', marginBottom: 6 }}>Promedio</div>
            <div style={{ fontSize: 34, fontWeight: 'bold', color: '#43a047' }}>{movAvgValue}%</div>
            <div style={{ fontSize: 13, color: '#43a047' }}>Móvil</div>
          </div>
          {/* Parque esperado */}
          <div
            style={{
              background: '#fff3e0',
              borderRadius: 10,
              padding: 18,
              minWidth: 180,
              minHeight: 180, // Aumenta el alto mínimo de la tarjeta
              height: 210, // Altura fija opcional para la tarjeta
              boxShadow: '0 2px 8px #ff980022',
              flex: '1 1 180px',
              textAlign: 'center',
              cursor: 'pointer',
              border: '2px solid #ffcc80',
            }}
            onClick={e => { setTooltip({ visible: true, x: e.clientX, y: e.clientY, text: metricExplanations.parque }); e.stopPropagation(); }}
          >
            <div style={{ fontSize: 15, color: '#ff9800', fontWeight: 'bold', marginBottom: 6 }}>Parque</div>
            <div style={{ fontSize: 34, fontWeight: 'bold', color: '#ff9800' }}>{parqueValue}%</div>
            <div style={{ fontSize: 13, color: '#ff9800' }}>Cumplimiento</div>
          </div>
          {/* Inactividad */}
          <div
            style={{
              background: '#fbe9e7',
              borderRadius: 10,
              padding: 18,
              minWidth: 180,
              minHeight: 180, // Aumenta el alto mínimo de la tarjeta
              height: 210, // Altura fija opcional para la tarjeta
              boxShadow: '0 2px 8px #d8431522',
              flex: '1 1 180px',
              textAlign: 'center',
              cursor: 'pointer',
              border: '2px solid #ffab91',
            }}
            onClick={e => { setTooltip({ visible: true, x: e.clientX, y: e.clientY, text: metricExplanations.inactividad }); e.stopPropagation(); }}
          >
            <div style={{ fontSize: 15, color: '#d84315', fontWeight: 'bold', marginBottom: 6 }}>Inactividad</div>
            <div style={{ fontSize: 34, fontWeight: 'bold', color: '#d84315' }}>{inactividadValue}%</div>
            <div style={{ fontSize: 13, color: '#d84315' }}>Caída</div>
          </div>
          {/* Continuidad */}
          <div
            style={{
              background: '#e1f5fe',
              borderRadius: 10,
              padding: 18,
              minWidth: 180,
              minHeight: 180, // Aumenta el alto mínimo de la tarjeta
              height: 210, // Altura fija opcional para la tarjeta
              boxShadow: '0 2px 8px #0288d122',
              flex: '1 1 180px',
              textAlign: 'center',
              cursor: 'pointer',
              border: '2px solid #81d4fa',
            }}
            onClick={e => { setTooltip({ visible: true, x: e.clientX, y: e.clientY, text: metricExplanations.continuidad }); e.stopPropagation(); }}
          >
            <div style={{ fontSize: 15, color: '#0288d1', fontWeight: 'bold', marginBottom: 6 }}>Continuidad</div>
            <div style={{ fontSize: 34, fontWeight: 'bold', color: '#0288d1' }}>{continuidadValue}</div>
            <div style={{ fontSize: 13, color: '#0288d1' }}>Franjas</div>
          </div>
          {/* Promedio de buses en hora pico (histórico) - reemplaza a Reserva */}
          <div
            style={{
              background: '#ff9800', // naranja fuerte
              borderRadius: 12,
              boxShadow: '0 2px 8px #ff980033',
              padding: '22px 38px',
              minWidth: 220,
              maxWidth: 320,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              border: '2px solid #e65100', // borde naranja oscuro
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onClick={e => { setTooltip({ visible: true, x: e.clientX, y: e.clientY, text: '<b>PROMEDIO DE BUSES EN HORA PICO (HISTÓRICO)</b><br><br>Promedio de buses que operaron en las franjas de 5, 6 y 7 (mañana) y 16, 17 y 18 (tarde) en el promedio de las 4 semanas anteriores.' }); e.stopPropagation(); }}
            onMouseOver={e => e.currentTarget.style.background = '#ffa726'}
            onMouseOut={e => e.currentTarget.style.background = '#ff9800'}
          >
            <div style={{ fontSize: 15, color: '#fff', fontWeight: 'bold', marginBottom: 6 }}>Promedio de buses en hora pico (histórico)</div>
            <div style={{ fontSize: 34, fontWeight: 'bold', color: '#fff' }}>{`${promedioPicoHistoricoManana} - ${promedioPicoHistoricoTarde}`}</div>
            <div style={{ fontSize: 13, color: '#fff' }}>Mañana (5-7) - Tarde (16-18)</div>
          </div>
          {/* Promedio de buses en hora pico (mañana y tarde) */}
          <div
            style={{
              background: '#ff9800', // naranja fuerte
              borderRadius: 12,
              boxShadow: '0 2px 8px #ff980033',
              padding: '22px 38px',
              minWidth: 220,
              maxWidth: 320,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              border: '2px solid #e65100', // borde naranja oscuro
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onClick={e => { setTooltip({ visible: true, x: e.clientX, y: e.clientY, text: metricExplanations.promedioPico }); e.stopPropagation(); }}
            onMouseOver={e => e.currentTarget.style.background = '#ffa726'}
            onMouseOut={e => e.currentTarget.style.background = '#ff9800'}
          >
            <div style={{ fontSize: 15, color: '#fff', fontWeight: 'bold', marginBottom: 6 }}>Promedio de buses en hora pico</div>
            <div style={{ fontSize: 34, fontWeight: 'bold', color: '#fff' }}>{(() => {
              // Calcular promedios de hora pico mañana (5,6,7) y tarde (16,17,18)
              let promManana = 0, promTarde = 0, nManana = 0, nTarde = 0;
              if (datosGraficar && datosGraficar.buses_dia) {
                datosGraficar.buses_dia.forEach(d => {
                  if ([5, 6, 7].includes(d.hora)) { promManana += d.buses; nManana++; }
                  if ([16, 17, 18].includes(d.hora)) { promTarde += d.buses; nTarde++; }
                });
              }
              promManana = nManana ? (promManana / nManana).toFixed(1) : '-';
              promTarde = nTarde ? (promTarde / nTarde).toFixed(1) : '-';
              return `${promManana} - ${promTarde}`;
            })()}</div>
            <div style={{ fontSize: 13, color: '#fff' }}>Mañana (5-7) - Tarde (16-18)</div>
          </div>
        </div>
        {Tooltip}
        {/* Eliminado el checkbox de resaltar horas pico, el horario pico siempre viene resaltado */}
        {/* El resto del render es igual al modal de regularidad operativa, pero con "buses" */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '24px 0' }}>
          <canvas id="regularidad-buses-chart" width={1700} height={450} style={{ maxWidth: 1700, maxHeight: 450, background: '#f8f8ff', borderRadius: 12, boxShadow: '0 2px 8px #1976d222' }}></canvas>
        </div>
        {/* Nota y resumen de indicadores */}
        <div style={{ width: '100%', maxWidth: 900, margin: '0 auto', marginBottom: 24, marginTop: -12, textAlign: 'center' }}>
          <div style={{ fontSize: 15, color: '#888', marginBottom: 8 }}>
            <b>Nota:</b> Se compara la fecha seleccionada con el promedio de los mismos días de la semana de las 4 semanas anteriores.
          </div>
          <div style={{ fontSize: 18, fontWeight: 'bold', textAlign: 'center' }}>
            <span style={{ color: '#d84315' }}>{pctMenos}% de los horarios tuvo menos buses que el promedio</span>
            <span style={{ margin: '0 18px', color: '#888' }}>|</span>
            <span style={{ color: '#43a047' }}>{pctMas}% de los horarios tuvo más buses que el promedio</span>
            <span style={{ margin: '0 18px', color: '#888' }}>|</span>
            <span style={{ color: '#1976d2' }}>Regularidad promedio del día: {promedioRegularidad}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegularidadBusesModal; 