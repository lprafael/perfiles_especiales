import React, { useState, useEffect, useRef } from 'react';
import DetectorServicios, { crearDetectorDesdeBackend, CONFIG_SERVICIOS } from './ControlServicios';

/**
 * Componente de interfaz para el Control de Servicios de Transporte
 * Integra la lógica de detección de servicios con la UI existente
 */

const ControlServiciosUI = ({ 
  empresaId, 
  fecha, 
  mapInstance, 
  API_BASE = "http://192.168.100.191:8000",
  onMostrarAviso 
}) => {
  // Estados del componente
  const [detector, setDetector] = useState(null);
  const [serviciosCalculados, setServiciosCalculados] = useState([]);
  const [puntosControlCalculados, setPuntosControlCalculados] = useState([]);
  const [procesandoServicios, setProcesandoServicios] = useState(false);
  const [procesandoPuntos, setProcesandoPuntos] = useState(false);
  const [reporteDiario, setReporteDiario] = useState(null);
  const [mostrarReporte, setMostrarReporte] = useState(false);
  
  // Referencias para layers del mapa
  const serviciosLayer = useRef(null);
  const puntosControlLayer = useRef(null);
  
  // Configuración de procesamiento
  const [configuracion, setConfiguracion] = useState({
    radioProximidad: CONFIG_SERVICIOS.RADIO_PROXIMIDAD_PUNTO,
    tiempoMinimoPermanencia: CONFIG_SERVICIOS.TIEMPO_MINIMO_PERMANENCIA,
    velocidadMaxima: CONFIG_SERVICIOS.VELOCIDAD_MAXIMA,
    completitudMinima: CONFIG_SERVICIOS.PORCENTAJE_MINIMO_COMPLETITUD
  });

  // Inicializar detector cuando cambie empresa
  useEffect(() => {
    if (empresaId) {
      inicializarDetector();
    }
  }, [empresaId]);

  // Limpiar layers al desmontar
  useEffect(() => {
    return () => {
      limpiarLayers();
    };
  }, []);

  const inicializarDetector = async () => {
    try {
      // Obtener datos del backend
      const [empresasRes, itinerariosRes, busesRes] = await Promise.all([
        fetch(`${API_BASE}/empresas`),
        fetch(`${API_BASE}/empresas/${empresaId}/itinerarios`),
        fetch(`${API_BASE}/empresas/${empresaId}/buses`)
      ]);

      const empresasData = await empresasRes.json();
      const itinerariosData = await itinerariosRes.json();
      const busesData = await busesRes.json();

      // Crear detector con datos del backend
      const nuevoDetector = crearDetectorDesdeBackend(
        empresasData.filter(emp => emp.id === empresaId),
        itinerariosData,
        busesData
      );

      setDetector(nuevoDetector);
      onMostrarAviso?.("Detector de servicios inicializado correctamente", "success");

    } catch (error) {
      console.error("Error inicializando detector:", error);
      onMostrarAviso?.("Error inicializando detector de servicios", "error");
    }
  };

  const calcularPuntosControl = async () => {
    if (!detector || !empresaId || !fecha) {
      onMostrarAviso?.("Seleccione empresa y fecha antes de calcular puntos de control", "warning");
      return;
    }

    setProcesandoPuntos(true);
    
    try {
      // Obtener datos GPS del día seleccionado
      const response = await fetch(`${API_BASE}/empresas/${empresaId}/gps-data?fecha=${fecha}`);
      const datosGPS = await response.json();

      if (!datosGPS || datosGPS.length === 0) {
        onMostrarAviso?.("No hay datos GPS disponibles para la fecha seleccionada", "warning");
        setProcesandoPuntos(false);
        return;
      }

      // Procesar datos GPS para identificar puntos de control
      const puntosControl = await procesarPuntosControl(datosGPS);
      
      setPuntosControlCalculados(puntosControl);
      mostrarPuntosControlEnMapa(puntosControl);
      
      onMostrarAviso?.(`Calculados ${puntosControl.length} puntos de control`, "success");

    } catch (error) {
      console.error("Error calculando puntos de control:", error);
      onMostrarAviso?.("Error calculando puntos de control", "error");
    } finally {
      setProcesandoPuntos(false);
    }
  };

  const procesarPuntosControl = async (datosGPS) => {
    const puntosControl = new Map();
    
    // Agrupar datos por bus
    const datosPorBus = new Map();
    datosGPS.forEach(dato => {
      if (!datosPorBus.has(dato.bus_id)) {
        datosPorBus.set(dato.bus_id, []);
      }
      datosPorBus.get(dato.bus_id).push(dato);
    });

    // Procesar cada bus
    for (const [busId, datos] of datosPorBus.entries()) {
      // Ordenar por timestamp
      datos.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Identificar paradas y puntos de control
      const puntosControlBus = identificarPuntosControlBus(datos, busId);
      
      puntosControlBus.forEach(punto => {
        const key = `${punto.lat.toFixed(6)}_${punto.lng.toFixed(6)}`;
        if (!puntosControl.has(key)) {
          puntosControl.set(key, {
            lat: punto.lat,
            lng: punto.lng,
            frecuencia: 0,
            buses: new Set(),
            tiemposPromedio: [],
            tipo: punto.tipo || 'INTERMEDIO'
          });
        }
        
        const puntoExistente = puntosControl.get(key);
        puntoExistente.frecuencia++;
        puntoExistente.buses.add(busId);
        if (punto.tiempoParada) {
          puntoExistente.tiemposPromedio.push(punto.tiempoParada);
        }
      });
    }

    // Convertir a array y calcular estadísticas
    return Array.from(puntosControl.values()).map(punto => ({
      ...punto,
      buses: Array.from(punto.buses),
      tiempoPromedioParada: punto.tiemposPromedio.length > 0 
        ? punto.tiemposPromedio.reduce((a, b) => a + b, 0) / punto.tiemposPromedio.length 
        : 0
    }));
  };

  const identificarPuntosControlBus = (datos, busId) => {
    const puntosControl = [];
    let puntoAnterior = null;
    let tiempoParadaInicio = null;

    for (let i = 0; i < datos.length; i++) {
      const puntoActual = datos[i];
      
      if (puntoAnterior) {
        const distancia = calcularDistancia(
          puntoAnterior.lat, puntoAnterior.lng,
          puntoActual.lat, puntoActual.lng
        );
        
        const tiempoDiff = (new Date(puntoActual.timestamp) - new Date(puntoAnterior.timestamp)) / 1000;
        const velocidad = distancia > 0 ? (distancia / tiempoDiff) * 3.6 : 0; // km/h

        // Detectar parada (velocidad baja y tiempo significativo)
        if (velocidad < 5 && tiempoDiff > configuracion.tiempoMinimoPermanencia) {
          if (!tiempoParadaInicio) {
            tiempoParadaInicio = new Date(puntoAnterior.timestamp);
          }
        } else if (tiempoParadaInicio && velocidad >= 5) {
          // Fin de parada
          const tiempoParada = (new Date(puntoAnterior.timestamp) - tiempoParadaInicio) / 1000;
          
          if (tiempoParada >= configuracion.tiempoMinimoPermanencia) {
            puntosControl.push({
              lat: puntoAnterior.lat,
              lng: puntoAnterior.lng,
              timestamp: puntoAnterior.timestamp,
              tiempoParada: tiempoParada,
              busId: busId,
              tipo: determinarTipoPunto(puntoAnterior, i, datos.length)
            });
          }
          
          tiempoParadaInicio = null;
        }
      }
      
      puntoAnterior = puntoActual;
    }

    return puntosControl;
  };

  const determinarTipoPunto = (punto, indice, totalPuntos) => {
    if (indice < totalPuntos * 0.1) return 'INICIO';
    if (indice > totalPuntos * 0.9) return 'FIN';
    return 'INTERMEDIO';
  };

  const calcularServicios = async () => {
    if (!detector || !empresaId || !fecha) {
      onMostrarAviso?.("Seleccione empresa y fecha antes de calcular servicios", "warning");
      return;
    }

    setProcesandoServicios(true);
    
    try {
      // Obtener datos GPS del día seleccionado
      const response = await fetch(`${API_BASE}/empresas/${empresaId}/gps-data?fecha=${fecha}`);
      const datosGPS = await response.json();

      if (!datosGPS || datosGPS.length === 0) {
        onMostrarAviso?.("No hay datos GPS disponibles para la fecha seleccionada", "warning");
        setProcesandoServicios(false);
        return;
      }

      // Procesar datos GPS con el detector
      await procesarDatosGPSParaServicios(datosGPS);
      
      // Generar reporte diario
      const reporte = detector.generarReporteDiario(empresaId, fecha);
      setReporteDiario(reporte);
      setServiciosCalculados(reporte.serviciosDetalle);
      
      // Mostrar servicios en el mapa
      mostrarServiciosEnMapa(reporte.serviciosDetalle);
      
      onMostrarAviso?.(`Calculados ${reporte.totalServicios} servicios`, "success");
      setMostrarReporte(true);

    } catch (error) {
      console.error("Error calculando servicios:", error);
      onMostrarAviso?.("Error calculando servicios", "error");
    } finally {
      setProcesandoServicios(false);
    }
  };

  const procesarDatosGPSParaServicios = async (datosGPS) => {
    // Agrupar por bus y ordenar por timestamp
    const datosPorBus = new Map();
    datosGPS.forEach(dato => {
      if (!datosPorBus.has(dato.bus_id)) {
        datosPorBus.set(dato.bus_id, []);
      }
      datosPorBus.get(dato.bus_id).push(dato);
    });

    // Procesar cada bus secuencialmente
    for (const [busId, datos] of datosPorBus.entries()) {
      datos.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Procesar eventos GPS uno por uno
      for (const dato of datos) {
        detector.procesarEventoGPS(
          busId,
          dato.lat,
          dato.lng,
          dato.timestamp,
          dato.velocidad || 0
        );
      }
    }
  };

  const mostrarPuntosControlEnMapa = (puntosControl) => {
    if (!mapInstance?.current) return;

    // Limpiar layer anterior
    if (puntosControlLayer.current) {
      mapInstance.current.removeLayer(puntosControlLayer.current);
    }

    // Crear nuevo layer
    puntosControlLayer.current = L.layerGroup();

    puntosControl.forEach(punto => {
      const color = punto.tipo === 'INICIO' ? 'green' : 
                   punto.tipo === 'FIN' ? 'red' : 'blue';
      
      const marker = L.circleMarker([punto.lat, punto.lng], {
        radius: Math.min(8 + punto.frecuencia / 2, 15),
        fillColor: color,
        color: 'white',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.7
      });

      marker.bindPopup(`
        <div>
          <strong>Punto de Control ${punto.tipo}</strong><br>
          Frecuencia: ${punto.frecuencia} pasos<br>
          Buses: ${punto.buses.length}<br>
          Tiempo promedio parada: ${Math.round(punto.tiempoPromedioParada)}s
        </div>
      `);

      puntosControlLayer.current.addLayer(marker);
    });

    mapInstance.current.addLayer(puntosControlLayer.current);
  };

  const mostrarServiciosEnMapa = (servicios) => {
    if (!mapInstance?.current) return;

    // Limpiar layer anterior
    if (serviciosLayer.current) {
      mapInstance.current.removeLayer(serviciosLayer.current);
    }

    // Crear nuevo layer
    serviciosLayer.current = L.layerGroup();

    servicios.forEach(servicio => {
      if (servicio.puntosRecorridos.length < 2) return;

      const color = servicio.tipoServicio === 'IDA' ? 'blue' :
                   servicio.tipoServicio === 'VUELTA' ? 'red' : 'purple';

      // Crear línea del recorrido
      const coordenadas = servicio.puntosRecorridos.map(p => [p.coordenadas.lat, p.coordenadas.lng]);
      
      const polyline = L.polyline(coordenadas, {
        color: color,
        weight: 3,
        opacity: 0.7
      });

      polyline.bindPopup(`
        <div>
          <strong>Servicio ${servicio.tipoServicio}</strong><br>
          Bus: ${servicio.busNumero}<br>
          Itinerario: ${servicio.itinerarioNombre}<br>
          Inicio: ${servicio.horaInicio.toLocaleTimeString()}<br>
          Fin: ${servicio.horaFin ? servicio.horaFin.toLocaleTimeString() : 'En curso'}<br>
          Duración: ${Math.round(servicio.getDuracion())} min<br>
          Estado: ${servicio.estado}
        </div>
      `);

      serviciosLayer.current.addLayer(polyline);

      // Agregar marcadores de inicio y fin
      const inicio = servicio.puntosRecorridos[0];
      const fin = servicio.puntosRecorridos[servicio.puntosRecorridos.length - 1];

      const markerInicio = L.marker([inicio.coordenadas.lat, inicio.coordenadas.lng], {
        icon: L.divIcon({
          className: 'servicio-marker inicio',
          html: `<div style="background: ${color}; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">I</div>`,
          iconSize: [20, 20]
        })
      });

      const markerFin = L.marker([fin.coordenadas.lat, fin.coordenadas.lng], {
        icon: L.divIcon({
          className: 'servicio-marker fin',
          html: `<div style="background: ${color}; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">F</div>`,
          iconSize: [20, 20]
        })
      });

      serviciosLayer.current.addLayer(markerInicio);
      serviciosLayer.current.addLayer(markerFin);
    });

    mapInstance.current.addLayer(serviciosLayer.current);
  };

  const limpiarLayers = () => {
    if (mapInstance?.current) {
      if (serviciosLayer.current) {
        mapInstance.current.removeLayer(serviciosLayer.current);
        serviciosLayer.current = null;
      }
      if (puntosControlLayer.current) {
        mapInstance.current.removeLayer(puntosControlLayer.current);
        puntosControlLayer.current = null;
      }
    }
  };

  const calcularDistancia = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + 
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const exportarReporte = () => {
    if (!reporteDiario) return;

    const csv = generarCSVReporte(reporteDiario);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `reporte_servicios_${empresaId}_${fecha}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const generarCSVReporte = (reporte) => {
    const headers = [
      'Bus', 'Itinerario', 'Tipo Servicio', 'Hora Inicio', 'Hora Fin', 
      'Duración (min)', 'Velocidad Promedio (km/h)', 'Estado', 'Puntos Recorridos'
    ];

    const rows = reporte.serviciosDetalle.map(servicio => [
      servicio.busNumero,
      servicio.itinerarioNombre,
      servicio.tipoServicio,
      servicio.horaInicio.toLocaleString(),
      servicio.horaFin ? servicio.horaFin.toLocaleString() : 'En curso',
      Math.round(servicio.getDuracion()),
      Math.round(servicio.getVelocidadPromedio() * 100) / 100,
      servicio.estado,
      servicio.puntosRecorridos.length
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  return (
    <div className="control-servicios-ui">
      {/* Panel de configuración */}
      <div className="configuracion-panel" style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
        <h4>Configuración de Análisis</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          <div>
            <label>Radio Proximidad (m):</label>
            <input 
              type="number" 
              value={configuracion.radioProximidad}
              onChange={(e) => setConfiguracion({...configuracion, radioProximidad: parseInt(e.target.value)})}
              min="10" max="500"
            />
          </div>
          <div>
            <label>Tiempo Mín. Permanencia (s):</label>
            <input 
              type="number" 
              value={configuracion.tiempoMinimoPermanencia}
              onChange={(e) => setConfiguracion({...configuracion, tiempoMinimoPermanencia: parseInt(e.target.value)})}
              min="5" max="300"
            />
          </div>
          <div>
            <label>Velocidad Máxima (km/h):</label>
            <input 
              type="number" 
              value={configuracion.velocidadMaxima}
              onChange={(e) => setConfiguracion({...configuracion, velocidadMaxima: parseInt(e.target.value)})}
              min="20" max="120"
            />
          </div>
          <div>
            <label>Completitud Mínima (%):</label>
            <input 
              type="number" 
              value={configuracion.completitudMinima}
              onChange={(e) => setConfiguracion({...configuracion, completitudMinima: parseInt(e.target.value)})}
              min="50" max="100"
            />
          </div>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="botones-accion" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          onClick={calcularPuntosControl}
          disabled={procesandoPuntos || !empresaId || !fecha}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: procesandoPuntos ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: procesandoPuntos ? 'not-allowed' : 'pointer'
          }}
        >
          {procesandoPuntos ? 'Calculando...' : 'Calcular Puntos de Control'}
        </button>

        <button 
          onClick={calcularServicios}
          disabled={procesandoServicios || !empresaId || !fecha}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: procesandoServicios ? '#ccc' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: procesandoServicios ? 'not-allowed' : 'pointer'
          }}
        >
          {procesandoServicios ? 'Calculando...' : 'Calcular Servicios'}
        </button>

        <button 
          onClick={limpiarLayers}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Limpiar Mapa
        </button>

        {reporteDiario && (
          <button 
            onClick={exportarReporte}
            style={{ 
              padding: '10px 20px', 
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Exportar Reporte
          </button>
        )}
      </div>

      {/* Resumen de resultados */}
      {puntosControlCalculados.length > 0 && (
        <div className="resumen-puntos" style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
          <h5>Puntos de Control Calculados: {puntosControlCalculados.length}</h5>
          <div style={{ fontSize: '14px' }}>
            Inicio: {puntosControlCalculados.filter(p => p.tipo === 'INICIO').length} | 
            Intermedios: {puntosControlCalculados.filter(p => p.tipo === 'INTERMEDIO').length} | 
            Fin: {puntosControlCalculados.filter(p => p.tipo === 'FIN').length}
          </div>
        </div>
      )}

      {serviciosCalculados.length > 0 && (
        <div className="resumen-servicios" style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
          <h5>Servicios Calculados: {serviciosCalculados.length}</h5>
          <div style={{ fontSize: '14px' }}>
            Completados: {serviciosCalculados.filter(s => s.estado === 'COMPLETADO').length} | 
            En curso: {serviciosCalculados.filter(s => s.estado === 'EN_CURSO').length} | 
            Cancelados: {serviciosCalculados.filter(s => s.estado === 'CANCELADO').length}
          </div>
        </div>
      )}

      {/* Modal de reporte detallado */}
      {mostrarReporte && reporteDiario && (
        <div className="modal-reporte" style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: 'white', padding: '20px', borderRadius: '10px',
            maxWidth: '800px', maxHeight: '80%', overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3>Reporte Diario de Servicios</h3>
              <button 
                onClick={() => setMostrarReporte(false)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div className="reporte-contenido">
              <div style={{ marginBottom: '20px' }}>
                <h4>{reporteDiario.empresa} - {reporteDiario.fecha}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                  <div>
                    <strong>Total Servicios:</strong> {reporteDiario.totalServicios}
                  </div>
                  <div>
                    <strong>Completados:</strong> {reporteDiario.serviciosCompletados}
                  </div>
                  <div>
                    <strong>Puntualidad:</strong> {reporteDiario.puntualidadGeneral}%
                  </div>
                  <div>
                    <strong>Buses Activos:</strong> {reporteDiario.busesActivos}/{reporteDiario.totalBuses}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h5>Métricas por Itinerario</h5>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '8px', border: '1px solid #ddd' }}>Itinerario</th>
                      <th style={{ padding: '8px', border: '1px solid #ddd' }}>Servicios</th>
                      <th style={{ padding: '8px', border: '1px solid #ddd' }}>Completados</th>
                      <th style={{ padding: '8px', border: '1px solid #ddd' }}>Tiempo Prom.</th>
                      <th style={{ padding: '8px', border: '1px solid #ddd' }}>Velocidad Prom.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporteDiario.metricasPorItinerario.map(metrica => (
                      <tr key={metrica.itinerarioId}>
                        <td style={{ padding: '8px', border: '1px solid #ddd' }}>{metrica.nombre}</td>
                        <td style={{ padding: '8px', border: '1px solid #ddd' }}>{metrica.totalServicios}</td>
                        <td style={{ padding: '8px', border: '1px solid #ddd' }}>{metrica.serviciosCompletados}</td>
                        <td style={{ padding: '8px', border: '1px solid #ddd' }}>{Math.round(metrica.tiempoPromedio)} min</td>
                        <td style={{ padding: '8px', border: '1px solid #ddd' }}>{Math.round(metrica.velocidadPromedio)} km/h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControlServiciosUI;
