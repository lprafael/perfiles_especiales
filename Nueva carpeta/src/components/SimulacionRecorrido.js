import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { useSimulacionRecorrido } from "./useSimulacionRecorrido";
import * as turf from '@turf/turf';
import { exportarReporteWord } from "./exportarReporteWord";
import html2canvas from "html2canvas";

/**
 * Componente de simulación de recorrido de buses.
 * Props:
 * - simulacionEstado, setSimulacionEstado, historico, setHistorico, mapInstance
 */
export default function SimulacionRecorrido({ simulacionEstado, setSimulacionEstado, historico, setHistorico, mapInstance, empresaId, fecha, incluirValidaciones, cargarValidaciones }) {
  const simulacionTimer = useRef(null);
  const shapesCache = useRef(null);
  const shapeCheckTimer = useRef(null);
  const shapeLayerRef = useRef(null);
  const isInitializedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [validacionesSim, setValidacionesSim] = useState([]);
  const validacionesLayerSim = useRef(null);
  const [puntosControl, setPuntosControl] = useState([]); // [{lat, lng, radio}]
  const [colocandoPuntoControl, setColocandoPuntoControl] = useState(false);
  const [busesEnGeocerca, setBusesEnGeocerca] = useState([]);
  const [promedioTiempo, setPromedioTiempo] = useState(null);
  const [mostrarReporte, setMostrarReporte] = useState(false);
  const [imagenPreview, setImagenPreview] = useState(null); // Nuevo estado para la imagen de previsualización

  // Hook para avance automático y control
  useSimulacionRecorrido(simulacionEstado, setSimulacionEstado);

  // Función para inicializar el shapeLayer si no existe
  const initializeShapeLayer = useCallback(() => {
    if (!mapInstance?.current) return null;
    
    if (!shapeLayerRef.current) {
      console.log('Inicializando shapeLayer');
      shapeLayerRef.current = L.layerGroup().addTo(mapInstance.current);
      isInitializedRef.current = true;
    }
    return shapeLayerRef.current;
  }, [mapInstance]);

  // Función para limpiar todos los recursos
  const cleanupResources = useCallback(() => {
    console.log('Limpiando recursos de simulación');
    
    // Limpiar timers
    if (simulacionTimer.current) {
      clearTimeout(simulacionTimer.current);
      simulacionTimer.current = null;
    }
    if (shapeCheckTimer.current) {
      clearTimeout(shapeCheckTimer.current);
      shapeCheckTimer.current = null;
    }

    // Limpiar capas del mapa
    if (window.simulacionLayer && mapInstance?.current) {
      mapInstance.current.removeLayer(window.simulacionLayer);
      window.simulacionLayer = null;
    }

    // Limpiar shapeLayer
    if (shapeLayerRef.current && mapInstance?.current) {
      mapInstance.current.removeLayer(shapeLayerRef.current);
      shapeLayerRef.current = null;
    }

    // Limpiar caché y estado
    shapesCache.current = null;
    isInitializedRef.current = false;
    setIsReady(false);
  }, [mapInstance]);

  // Inicialización única al montar el componente
  useEffect(() => {
    let mounted = true;

    const initialize = () => {
      if (!mapInstance?.current || !mounted) return;

      const shapeLayer = initializeShapeLayer();
      if (shapeLayer && mounted) {
        console.log('ShapeLayer inicializado correctamente');
        setIsReady(true);
      }
    };

    initialize();

    return () => {
      mounted = false;
      console.log('Componente SimulacionRecorrido desmontado');
      cleanupResources();
    };
  }, [mapInstance, initializeShapeLayer, cleanupResources]);

  // Efecto para detectar cuando se cierra el sidebar
  useEffect(() => {
    if (!simulacionEstado && isInitializedRef.current) {
      console.log('Simulación detenida, limpiando recursos');
      // Limpia la geocerca visual y el estado
      if (window.puntoControlLayer && mapInstance?.current) {
        mapInstance.current.removeLayer(window.puntoControlLayer);
        window.puntoControlLayer = null;
      }
      setPuntosControl([]);
      cleanupResources();
    }
  }, [simulacionEstado, cleanupResources, mapInstance]);

  // Función optimizada para saber si un punto está dentro del buffer
  const estaEnBuffer = useCallback((lat, lng) => {
    if (!turf || !shapeLayerRef.current) {
      console.log('No hay turf o shapeLayer', {
        hasTurf: !!turf,
        hasShapeLayer: !!shapeLayerRef.current
      });
      return false;
    }

    // Inicializar o actualizar caché si es necesario
    const geocercaRadio = window.geocercaRadio || 50;
    if (!shapesCache.current || shapesCache.current.radius !== geocercaRadio) {
      try {
        // Recolectar todas las líneas en una colección
        const lineas = [];
        let shapeCount = 0;
        
        shapeLayerRef.current.eachLayer(layer => {
          shapeCount++;
          if (layer instanceof L.Polyline) {
            const latlngs = layer.getLatLngs();
            if (Array.isArray(latlngs) && latlngs.length > 1) {
              lineas.push(latlngs.map(p => [p.lng, p.lat]));
            }
          }
        });

        console.log('Procesando shapes:', {
          totalLayers: shapeCount,
          lineasEncontradas: lineas.length,
          radio: geocercaRadio
        });

        if (lineas.length > 0) {
          // Crear una multilinestring con todas las líneas
          const multiLineString = turf.multiLineString(lineas);
          
          // Crear un único buffer para todas las líneas
          const bufferKm = geocercaRadio / 1000;
          const buffer = turf.buffer(multiLineString, bufferKm, {
            units: 'kilometers'
          });

          shapesCache.current = {
            buffer,
            radius: geocercaRadio,
            lastUpdate: Date.now()
          };

          console.log('Buffer creado exitosamente');
          return true;
        } 
        // Si no hay líneas válidas, simplemente omitir el warning y retornar false silenciosamente
        // console.warn('No se encontraron líneas válidas para crear el buffer');
        return false;
      } catch (e) {
        console.error('Error creating buffer:', e);
        return false;
      }
    }

    if (!shapesCache.current?.buffer) {
      console.log('No hay buffer en caché');
      return false;
    }

    // Verificar si el punto está dentro del buffer
    try {
      const pt = turf.point([lng, lat]);
      return turf.booleanPointInPolygon(pt, shapesCache.current.buffer);
    } catch (e) {
      console.error('Error checking point in buffer:', e);
      return false;
    }
  }, []);

  // --- OPTIMIZACIÓN DE CAPAS: REUTILIZAR Y LIMPIAR EN VEZ DE CREAR NUEVAS ---
  // Capa para puntos de simulación
  const simulacionLayerRef = useRef(null);

  // Función para limpiar y reutilizar la capa de simulación
  const getOrCreateSimulacionLayer = () => {
    if (!mapInstance?.current) return null;
    if (!simulacionLayerRef.current) {
      simulacionLayerRef.current = L.layerGroup().addTo(mapInstance.current);
      window.simulacionLayer = simulacionLayerRef.current;
    }
    return simulacionLayerRef.current;
  };

  // Limpieza global al desmontar
  useEffect(() => {
    return () => {
      if (simulacionLayerRef.current && mapInstance?.current) {
        mapInstance.current.removeLayer(simulacionLayerRef.current);
        simulacionLayerRef.current = null;
        window.simulacionLayer = null;
      }
      if (validacionesLayerSim.current && mapInstance?.current) {
        mapInstance.current.removeLayer(validacionesLayerSim.current);
        validacionesLayerSim.current = null;
      }
      // Limpia los puntos de control manuales del mapa
      if (window.puntoControlLayer && mapInstance?.current) {
        mapInstance.current.removeLayer(window.puntoControlLayer);
        window.puntoControlLayer = null;
      }
    };
  }, [mapInstance]);

  // Función para renderizar los puntos en el mapa
  const renderizarPuntos = useCallback(() => {
    console.log('Iniciando renderizarPuntos', {
      tieneSimulacionEstado: !!simulacionEstado,
      puntosTotales: simulacionEstado?.puntos?.length,
      horaActual: simulacionEstado?.horaActual,
      isReady
    });

    if (!simulacionEstado?.puntos || !mapInstance?.current || !isReady) {
      console.log('No se cumplen las condiciones para renderizar', {
        tieneSimulacionEstado: !!simulacionEstado,
        tienePuntos: !!simulacionEstado?.puntos,
        tieneMapInstance: !!mapInstance?.current,
        isReady
      });
      return;
    }

    // Limpiar capa previa (sin eliminarla, solo limpiar)
    const simulacionLayer = getOrCreateSimulacionLayer();
    if (!simulacionLayer) return;
    simulacionLayer.clearLayers();

    // Crear iconos una sola vez
    const greenIcon = new L.Icon({
      iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    const redIcon = new L.Icon({
      iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    // Filtrar puntos según el modo histórico y el tiempo actual
    const puntosAMostrar = simulacionEstado.puntos.filter(p => p.ts <= simulacionEstado.horaActual);
    console.log('Puntos filtrados:', {
      totalPuntos: puntosAMostrar.length,
      horaActual: new Date(simulacionEstado.horaActual * 1000).toLocaleTimeString(),
      modoHistorico: historico
    });

    if (puntosAMostrar.length === 0) {
      console.log('No hay puntos para mostrar en el tiempo actual');
      return;
    }

    if (historico) {
      // En modo histórico, mostrar todos los puntos hasta el momento actual
      puntosAMostrar.forEach((punto, index) => {
        const lat = parseFloat(punto.latitud || punto.latitude || punto.lat);
        const lng = parseFloat(punto.longitud || punto.longitude || punto.lng);
        if (isNaN(lat) || isNaN(lng)) {
          console.log('Punto inválido:', { punto, index });
          return;
        }
        const inside = estaEnBuffer(lat, lng);
        L.circleMarker([lat, lng], {
          radius: 5,
          color: inside ? '#008000' : '#d60000',
          fillColor: inside ? '#00ff00' : '#ff0000',
          fillOpacity: 0.8,
          weight: 2
        })
        .addTo(simulacionLayer)
        .bindPopup(`Bus: ${punto.mean_id}${!isNaN(parseInt(punto.mean_id,16)) ? ` (${parseInt(punto.mean_id,16)})` : ''}<br>Hora: ${new Date(punto.ts * 1000).toLocaleTimeString()}`);
      });
    } else {
      // En modo no histórico, mostrar solo el último punto de cada bus
      const busesPorId = {};
      puntosAMostrar.forEach(p => {
        if (!busesPorId[p.mean_id] || busesPorId[p.mean_id].ts < p.ts) {
          busesPorId[p.mean_id] = p;
        }
      });

      console.log('Buses únicos encontrados:', Object.keys(busesPorId).length);

      Object.values(busesPorId).forEach((punto, index) => {
        const lat = parseFloat(punto.latitud || punto.latitude || punto.lat);
        const lng = parseFloat(punto.longitud || punto.longitude || punto.lng);
        
        if (isNaN(lat) || isNaN(lng)) {
          console.log('Punto inválido:', { punto, index });
          return;
        }

        const inside = estaEnBuffer(lat, lng);
        
        L.marker([lat, lng], { 
          icon: inside ? greenIcon : redIcon 
        })
          .addTo(simulacionLayer)
        .bindPopup(`Bus: ${punto.mean_id}${!isNaN(parseInt(punto.mean_id,16)) ? ` (${parseInt(punto.mean_id,16)})` : ''}<br>Hora: ${new Date(punto.ts * 1000).toLocaleTimeString()}`);
      });
    }

    console.log('Renderizado completado');
  }, [simulacionEstado, mapInstance, isReady, historico, estaEnBuffer]);

  // Cargar validaciones para la simulación cuando cambian empresa, fecha o barra de progreso
  useEffect(() => {
    if (!incluirValidaciones || !empresaId || !fecha || !simulacionEstado) return;
    // Cargar todas las validaciones de la fecha (una sola vez por cambio de empresa/fecha)
    cargarValidaciones(empresaId, fecha, false).then(() => {
      // Se actualiza el estado global de validaciones en el componente padre
      // Aquí las tomamos del window o del estado global si se expone
      // Si setValidaciones retorna una promesa con los datos, usar eso
    });
  }, [empresaId, fecha, incluirValidaciones, simulacionEstado]);

  // Renderizar validaciones en la simulación
  const renderizarValidaciones = useCallback(() => {
    if (!incluirValidaciones || !mapInstance?.current || !simulacionEstado) return;
    // Reutilizar capa de validaciones
    if (!validacionesLayerSim.current) {
      validacionesLayerSim.current = L.layerGroup().addTo(mapInstance.current);
    } else {
      validacionesLayerSim.current.clearLayers();
    }
    // Filtrar validaciones por hora y buses seleccionados
    let validaciones = [];
    if (window.validaciones) {
      validaciones = window.validaciones;
    } else if (Array.isArray(validacionesSim)) {
      validaciones = validacionesSim;
    }
    if (!Array.isArray(validaciones) || validaciones.length === 0) return;
    // Solo mostrar validaciones de los buses seleccionados y hasta la hora actual
    const busesSeleccionados = simulacionEstado.busesSeleccionados || [];
    const horaActual = simulacionEstado.horaActual;
    const validacionesFiltradas = validaciones.filter(v => {
      // Filtrar por bus (idsam debe mapearse a mean_id si es posible)
      if (busesSeleccionados.length > 0 && v.idsam && !busesSeleccionados.includes(v.idsam)) return false;
      // Filtrar por hora
      const ts = v.fechahoraevento ? new Date(v.fechahoraevento).getTime()/1000 : null;
      if (ts && ts > horaActual) return false;
      return true;
    });
    if (validacionesFiltradas.length === 0) return;
    // Icono de validación (💳)
    const iconoValidacion = new L.DivIcon({
      html: '<span style="font-size:22px;">💳</span>',
      iconSize: [24, 24],
      className: ''
    });
    validacionesFiltradas.forEach(val => {
      if (!val.latitude || !val.longitude) return;
      L.marker([val.latitude, val.longitude], { icon: iconoValidacion })
        .addTo(validacionesLayerSim.current)
        .bindPopup(
          `<b>Validación</b><br>ID SAM: ${val.idsam || val.id_sam || ''}<br>Fecha: ${val.fechahoraevento || val.fechahora || ''}`
        );
    });
  }, [incluirValidaciones, mapInstance, simulacionEstado, validacionesSim]);

  // Efecto para renderizar validaciones cuando cambia la barra de progreso o selección
  useEffect(() => {
    renderizarValidaciones();
    return () => {
      if (validacionesLayerSim.current && mapInstance?.current) {
        mapInstance.current.removeLayer(validacionesLayerSim.current);
        validacionesLayerSim.current = null;
      }
    };
  }, [renderizarValidaciones, simulacionEstado?.horaActual, simulacionEstado?.busesSeleccionados]);

  // Efecto para renderizar puntos cuando cambia el estado
  useEffect(() => {
    if (simulacionEstado?.horaActual !== undefined && isReady && mapInstance?.current) {
      renderizarPuntos();
    }
  }, [simulacionEstado?.horaActual, isReady, mapInstance, renderizarPuntos]);

  // Calcula buses que pasan por cada punto y servicios completos (todas las veces)
  const [busesPorPunto, setBusesPorPunto] = useState([[], []]);
  const [busesServicioCompleto, setBusesServicioCompleto] = useState(0);
  const [detalleServicios, setDetalleServicios] = useState([]); // Nuevo: detalle de servicios
  const [serviciosCompletosInverso, setServiciosCompletosInverso] = useState(0);
  const [detalleServiciosInverso, setDetalleServiciosInverso] = useState([]);
  useEffect(() => {
    if (puntosControl.length < 2 || !simulacionEstado?.puntos) {
      setBusesPorPunto([[], []]);
      setBusesServicioCompleto(0);
      setDetalleServicios([]);
      setServiciosCompletosInverso(0);
      setDetalleServiciosInverso([]);
      return;
    }
    const [p1, p2] = puntosControl;
    const puntos = simulacionEstado.puntos;

    // Agrupar puntos por bus y ordenar por timestamp
    const puntosPorBus = {};
    puntos.forEach((p) => {
      const mean_id = p.mean_id;
      if (!puntosPorBus[mean_id]) puntosPorBus[mean_id] = [];
      puntosPorBus[mean_id].push(p);
    });
    Object.values(puntosPorBus).forEach(arr => arr.sort((a, b) => a.ts - b.ts));

    // Sets para buses que pasaron por cada punto
    const busesEnP1 = new Set();
    const busesEnP2 = new Set();
    let serviciosCompletos = 0;
    let serviciosDetalle = [];
    let serviciosCompletosInverso = 0;
    let serviciosDetalleInverso = [];

    // Para cada bus, buscar todas las secuencias P1 -> P2
    Object.entries(puntosPorBus).forEach(([mean_id, arr]) => {
      let enP1 = false;
      let ultimoEnP1 = null;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        const plat = parseFloat(p.latitud || p.latitude || p.lat);
        const plng = parseFloat(p.longitud || p.longitude || p.lng);
        if (isNaN(plat) || isNaN(plng)) continue;
        const dist1 = L.latLng(p1.lat, p1.lng).distanceTo([plat, plng]);
        const dist2 = L.latLng(p2.lat, p2.lng).distanceTo([plat, plng]);
        if (dist1 <= p1.radio) {
          busesEnP1.add(mean_id);
          enP1 = true;
          ultimoEnP1 = p; // Guardar el último punto dentro de P1
        }
        // Nuevo: contar todos los buses que pasan por P2, no solo los que completan servicio
        if (dist2 <= p2.radio) {
          busesEnP2.add(mean_id);
          if (!enP1 && ultimoEnP1) {
            // Solo cuenta si venía de P1 y ya salió de P1
            serviciosCompletos++;
            serviciosDetalle.push({
              mean_id,
              inicio: ultimoEnP1.ts,
              fin: p.ts
            });
            ultimoEnP1 = null; // Reiniciar para detectar más servicios
          }
        }
        // Si se aleja de P1, permitir volver a contar si regresa
        if (dist1 > p1.radio) {
          enP1 = false;
        }
      }
      // --- NUEVO: Servicios completos en orden inverso (P2 -> P1) ---
      let enP2 = false;
      let ultimoEnP2 = null;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        const plat = parseFloat(p.latitud || p.latitude || p.lat);
        const plng = parseFloat(p.longitud || p.longitude || p.lng);
        if (isNaN(plat) || isNaN(plng)) continue;
        const dist1 = L.latLng(p1.lat, p1.lng).distanceTo([plat, plng]);
        const dist2 = L.latLng(p2.lat, p2.lng).distanceTo([plat, plng]);
        if (dist2 <= p2.radio) {
          enP2 = true;
          ultimoEnP2 = p;
        }
        if (dist1 <= p1.radio) {
          if (!enP2 && ultimoEnP2) {
            // Solo cuenta si venía de P2 y ya salió de P2
            if (!serviciosDetalleInverso) serviciosDetalleInverso = [];
            if (!serviciosCompletosInverso) serviciosCompletosInverso = 0;
            serviciosCompletosInverso++;
            serviciosDetalleInverso.push({
              mean_id,
              inicio: ultimoEnP2.ts,
              fin: p.ts
            });
            ultimoEnP2 = null;
          }
        }
        if (dist2 > p2.radio) {
          enP2 = false;
        }
      }
    });

    setBusesPorPunto([Array.from(busesEnP1), Array.from(busesEnP2)]);
    setBusesServicioCompleto(serviciosCompletos);
    setDetalleServicios(serviciosDetalle.sort((a, b) => a.inicio - b.inicio));
    // Nuevo: setear los servicios completos inversos
    setServiciosCompletosInverso(serviciosCompletosInverso || 0);
    setDetalleServiciosInverso((serviciosDetalleInverso || []).sort((a, b) => a.inicio - b.inicio));
  }, [puntosControl, simulacionEstado]);

  // Handler para colocar punto de control (ahora permite dos y usa radio del slider)
  useEffect(() => {
    if (!colocandoPuntoControl || !mapInstance?.current) return;
    const map = mapInstance.current;
    const handleClick = (e) => {
      const { lat, lng } = e.latlng;
      const radioActual = window.geocercaRadio || 50;
      setPuntosControl(pcs => {
        if (pcs.length < 2) {
          return [...pcs, { lat, lng, radio: radioActual }];
        } else {
          // Si ya hay dos, reemplaza el más antiguo
          return [{ lat, lng, radio: radioActual }, pcs[1]];
        }
      });
      setColocandoPuntoControl(false);
    };
    map.on('click', handleClick);
    return () => map.off('click', handleClick);
  }, [colocandoPuntoControl, mapInstance]);

  // Sincroniza el radio de ambos puntos con el slider
  useEffect(() => {
    if (!puntosControl.length) return;
    const slider = document.getElementById('slider-radio');
    if (!slider) return;
    const handleInput = () => {
      const radioActual = parseInt(slider.value) || 50;
      setPuntosControl(pcs => pcs.map(p => ({ ...p, radio: radioActual })));
    };
    slider.addEventListener('input', handleInput);
    return () => slider.removeEventListener('input', handleInput);
  }, [puntosControl]);

  // Dibuja los puntos de control en el mapa
  useEffect(() => {
    if (!puntosControl.length || !mapInstance?.current) return;
    if (window.puntoControlLayer && mapInstance.current) {
      mapInstance.current.removeLayer(window.puntoControlLayer);
      window.puntoControlLayer = null;
    }
    const layer = L.layerGroup().addTo(mapInstance.current);
    puntosControl.forEach((p, idx) => {
      L.circle([p.lat, p.lng], {
        radius: p.radio,
        color: idx === 0 ? 'blue' : 'purple',
        fillColor: idx === 0 ? '#3399ff' : '#a020f0',
        fillOpacity: 0.2,
      }).addTo(layer).bindPopup(`Punto de Control ${idx + 1}`);
      // Agregar marcador G1/G2 en el centro
      const divIcon = L.divIcon({
        html: `<div style='font-weight:bold;font-size:18px;color:${idx === 0 ? 'blue' : 'purple'};text-shadow:1px 1px 2px #fff;'>G${idx+1}</div>`,
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      L.marker([p.lat, p.lng], { icon: divIcon, interactive: false }).addTo(layer);
    });
    window.puntoControlLayer = layer;
  }, [puntosControl, mapInstance]);

  if (!simulacionEstado || simulacionEstado.total === 0) return null;

  return (
    <div style={{marginBottom: 16}}>
      <h3 style={{fontSize: 20, marginBottom: 8}}>Simulación de recorrido</h3>
      <div style={{marginBottom: 8}}>
        <label>
          <input
            type="checkbox"
            checked={historico}
            onChange={e => setHistorico(e.target.checked)}
          /> Modo histórico
        </label>
      </div>
      <div style={{marginBottom: 8}}>
        Hora: {simulacionEstado.horaActualStr}
      </div>
      <div style={{marginBottom: 8}}>
      <input
        type="range"
        min={simulacionEstado.minTimestamp}
        max={simulacionEstado.maxTimestamp}
        value={simulacionEstado.horaActual}
        onChange={e => {
            const newTs = parseInt(e.target.value);
          setSimulacionEstado(s => ({
            ...s,
              horaActual: newTs,
              horaActualStr: new Date(newTs*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})
          }));
        }}
          style={{width: '100%'}}
        />
      </div>
      <div style={{display: 'flex', gap: 8, marginBottom: 8}}>
        <button
          onClick={() => setSimulacionEstado(s => ({...s, corriendo: !s.corriendo}))}
          style={{flex: 1}}
        >
          {simulacionEstado.corriendo ? '⏸️ Pausar' : '▶️ Reproducir'}
        </button>
        <button
          onClick={() => {
            let newVel;
            switch (simulacionEstado.velocidad) {
              case 500: newVel = 350; break;
              case 350: newVel = 100; break;
              case 100: newVel = 50; break;
              case 50: newVel = 0.05; break;
              case 0.05: newVel = 500; break;
              default: newVel = 350;
            }
            setSimulacionEstado(s => ({ ...s, velocidad: newVel }));
          }}
          style={{ flex: 1 }}
        >
          {simulacionEstado.velocidad === 500 ? '🐌 Lento' :
            simulacionEstado.velocidad === 350 ? '🐢 Normal' :
            simulacionEstado.velocidad === 100 ? '🏃 Rápido' :
            simulacionEstado.velocidad === 50 ? '🚀 Súper rápido' :
            simulacionEstado.velocidad === 0.05 ? '💨 Match1' :
            '🐢 Normal'
          }
        </button>
        <button
          onClick={() => setColocandoPuntoControl(true)}
          style={{flex: 1, background: colocandoPuntoControl ? '#e0f7fa' : undefined}}
        >
          {puntosControl.length < 2 ? `Colocar Punto de Control ${puntosControl.length + 1}` : 'Reemplazar Punto 1'}
        </button>
        {puntosControl.length === 2 && (
          <button
            onClick={() => {
              setPuntosControl([]);
              // Limpia la capa de puntos de control del mapa
              if (window.puntoControlLayer && mapInstance?.current) {
                mapInstance.current.removeLayer(window.puntoControlLayer);
                window.puntoControlLayer = null;
              }
            }}
            style={{flex: 1, background: '#ffe0e0'}}
          >
            Limpiar Puntos
          </button>
        )}
      </div>
      {puntosControl.length > 0 && (
        <div style={{marginTop:8, fontSize:15, color:'#333', background:'#f0f8ff', padding:8, borderRadius:6}}>
          <b>Punto de Control 1:</b> [{puntosControl[0].lat.toFixed(5)}, {puntosControl[0].lng.toFixed(5)}] (Radio: {puntosControl[0].radio} m)<br/>
          {puntosControl[1] && <>
            <b>Punto de Control 2:</b> [{puntosControl[1].lat.toFixed(5)}, {puntosControl[1].lng.toFixed(5)}] (Radio: {puntosControl[1].radio} m)<br/>
          </>}
          <b>Buses que pasaron por Punto 1:</b> {busesPorPunto[0].length}<br/>
          {puntosControl[1] && <>
            <b>Buses que pasaron por Punto 2:</b> {busesPorPunto[1].length}<br/>
            <b>Servicios completos (pasaron por ambos en orden):</b> {busesServicioCompleto}<br/>
            {detalleServicios.length > 0 && (
              <details style={{marginTop:4}}>
                <summary>Ver detalle de servicios</summary>
                <ul style={{fontSize:14, margin:0, paddingLeft:18}}>
                  {detalleServicios.map((s, idx) => (
                    <li key={idx}>
                      {idx + 1}) Bus: <b>{s.mean_id}</b>{
                        (() => {
                          // Mostrar valor decimal si es hexadecimal
                          let dec = parseInt(s.mean_id, 16);
                          if (!isNaN(dec)) return `(${dec})`;
                          return '';
                        })()
                      } | Inicio: <b>{new Date(s.inicio*1000).toLocaleTimeString()}</b> | Fin: <b>{new Date(s.fin*1000).toLocaleTimeString()}</b>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <b>Servicios completos (pasaron por ambos en orden inverso):</b> {serviciosCompletosInverso}<br/>
            {detalleServiciosInverso.length > 0 && (
              <details style={{marginTop:4}}>
                <summary>Ver detalle de servicios (inverso)</summary>
                <ul style={{fontSize:14, margin:0, paddingLeft:18}}>
                  {detalleServiciosInverso.map((s, idx) => (
                    <li key={idx}>
                      {idx + 1}) Bus: <b>{s.mean_id}</b>{
                        (() => {
                          // Mostrar valor decimal si es hexadecimal
                          let dec = parseInt(s.mean_id, 16);
                          if (!isNaN(dec)) return `(${dec})`;
                          return '';
                        })()
                      } | Inicio: <b>{new Date(s.inicio*1000).toLocaleTimeString()}</b> | Fin: <b>{new Date(s.fin*1000).toLocaleTimeString()}</b>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>}
          {puntosControl[1] && (
            <>
              <button
                style={{marginTop:16, padding:'8px 18px', fontSize:16, background:'#1976d2', color:'#fff', border:'none', borderRadius:5, cursor:'pointer'}}
                onClick={() => setMostrarReporte(true)}
              >
                Generar reporte
              </button>
            </>
          )}
        </div>
      )}
      {/* Ventana emergente para el reporte */}
      {mostrarReporte && (
        <div style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.3)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div style={{background:'#fff', padding:32, borderRadius:10, minWidth:350, maxWidth:700, boxShadow:'0 2px 16px #0003', position:'relative'}}>
            <button onClick={() => setMostrarReporte(false)} style={{position:'absolute', top:10, right:10, fontSize:22, background:'none', border:'none', cursor:'pointer'}}>×</button>
            <h2 style={{marginTop:0}}>Reporte de servicios</h2>
            {/* Previsualización del reporte */}
            <ReportePreview
              puntosControl={puntosControl}
              busesPorPunto={busesPorPunto}
              busesServicioCompleto={busesServicioCompleto}
              detalleServicios={detalleServicios}
              serviciosCompletosInverso={serviciosCompletosInverso}
              detalleServiciosInverso={detalleServiciosInverso}
              empresa={(() => {
                // Buscar el select por id "empresa-select"
                const selectEmpresa = document.getElementById('empresa-select');
                if (selectEmpresa) {
                  return selectEmpresa.options[selectEmpresa.selectedIndex]?.text?.trim() || empresaId || '';
                } else if (window.empresas && empresaId && window.empresas[empresaId]) {
                  return window.empresas[empresaId].nombre || empresaId;
                } else if (simulacionEstado?.empresaNombre) {
                  return simulacionEstado.empresaNombre;
                } else if (simulacionEstado?.empresa) {
                  return simulacionEstado.empresa;
                } else {
                  return empresaId || '';
                }
              })()}
              fechaMonitoreo={fecha || simulacionEstado?.fecha || ''}
              imagenMapaBase64={imagenPreview}
            />
            <button
              style={{padding:'8px 18px', fontSize:16, background:'#388e3c', color:'#fff', border:'none', borderRadius:5, cursor:'pointer', marginTop:16}}
              onClick={async () => {
                // 1) Título
                const titulo = "Reporte de Simulación de Recorrido";
                // 2) Descripción
                const descripcion = "Este reporte detalla el monitoreo/simulación de recorridos de buses, incluyendo el análisis de servicios completos entre dos geocercas, conteo de buses y detalles de los servicios detectados.";
                // 3) Imagen del mapa (captura canvas PNG)
                let imagenMapaBase64 = null;
                const mapDiv = document.querySelector('.leaflet-container');
                // --- DIBUJAR GEOCERCAS, SHAPES Y BUSES EN EL MAPA ANTES DE CAPTURAR ---
                if (mapInstance?.current) {
                  let tempLayer = L.layerGroup();
                  // 1. Shapes
                  if (window.simulacionLayer) {
                    window.simulacionLayer.eachLayer(layer => {
                      if (layer instanceof L.Polyline) {
                        const opts = layer.options || {};
                        L.polyline(layer.getLatLngs(), {
                          color: opts.color || '#444',
                          weight: opts.weight || 4,
                          opacity: opts.opacity || 0.7,
                          dashArray: opts.dashArray || null,
                          interactive: false
                        }).addTo(tempLayer);
                      }
                    });
                  }
                  // 2. Geocercas radiales (asegura que existan y se dibujen)
                  if (window.puntoControlLayer) {
                    window.puntoControlLayer.eachLayer(layer => {
                      if (layer instanceof L.Circle) {
                        const opts = layer.options || {};
                        L.circle(layer.getLatLng(), {
                          radius: layer.getRadius(),
                          color: opts.color || 'blue',
                          fillColor: opts.fillColor || '#3399ff',
                          fillOpacity: opts.fillOpacity ?? 0.2,
                          weight: opts.weight || 2,
                          dashArray: opts.dashArray || null,
                          interactive: false
                        }).addTo(tempLayer);
                      }
                    });
                  } else if (puntosControl.length > 0) {
                    // Si no existe la capa, dibuja las geocercas manualmente
                    puntosControl.forEach((p, idx) => {
                      L.circle([p.lat, p.lng], {
                        radius: p.radio,
                        color: idx === 0 ? 'blue' : 'red',
                        fillColor: idx === 0 ? '#3399ff' : '#ff3333',
                        fillOpacity: 0.2,
                        weight: 2,
                        interactive: false
                      }).addTo(tempLayer);
                    });
                  }
                  // 3. Buses visualizados actualmente
                  if (window.simulacionLayer) {
                    window.simulacionLayer.eachLayer(layer => {
                      if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
                        const latlng = layer.getLatLng();
                        const opts = layer.options || {};
                        L.circleMarker(latlng, {
                          radius: opts.radius || 8,
                          color: opts.color || '#1976d2',
                          fillColor: opts.fillColor || '#1976d2',
                          fillOpacity: opts.fillOpacity || 1,
                          weight: opts.weight || 2,
                          interactive: false
                        }).addTo(tempLayer);
                      }
                    });
                  }
                  tempLayer.addTo(mapInstance.current);
                  window.leafletGeocercasTempLayer = tempLayer;
                  await new Promise(res => setTimeout(res, 350));
                  if (mapDiv) {
                    try {
                      const canvas = await html2canvas(mapDiv, {useCORS:true, backgroundColor: null, logging: false, imageTimeout: 0});
                      imagenMapaBase64 = canvas.toDataURL('image/png');
                    } catch (e) { imagenMapaBase64 = null; }
                  }
                  if (tempLayer && mapInstance?.current) {
                    mapInstance.current.removeLayer(tempLayer);
                    window.leafletGeocercasTempLayer = null;
                  }
                } else {
                  if (mapDiv) {
                    try {
                      const canvas = await html2canvas(mapDiv, {useCORS:true, backgroundColor: null, logging: false, imageTimeout: 0});
                      imagenMapaBase64 = canvas.toDataURL('image/png');
                    } catch (e) { imagenMapaBase64 = null; }
                  }
                }
                // 4) Fecha de monitoreo
                const fechaMonitoreo = fecha || simulacionEstado?.fecha || '';
                // 5) Datos del sidebar
                let datosSidebar = '';
                if (puntosControl.length > 0) {
                  datosSidebar += `Punto de Control 1: [${puntosControl[0].lat.toFixed(5)}, ${puntosControl[0].lng.toFixed(5)}] (Radio: ${puntosControl[0].radio} m)\n`;
                  if (puntosControl[1]) {
                    datosSidebar += `Punto de Control 2: [${puntosControl[1].lat.toFixed(5)}, ${puntosControl[1].lng.toFixed(5)}] (Radio: ${puntosControl[1].radio} m)\n`;
                  }
                  datosSidebar += `Buses que pasaron por Punto 1: ${busesPorPunto[0].length}\n`;
                  if (puntosControl[1]) {
                    datosSidebar += `Buses que pasaron por Punto 2: ${busesPorPunto[1].length}\n`;
                    datosSidebar += `Servicios completos (pasaron por ambos en orden): ${busesServicioCompleto}\n`;
                    if (detalleServicios.length > 0) {
                      datosSidebar += `Detalle de servicios:\n`;
                      detalleServicios.forEach((s, idx) => {
                        let dec = parseInt(s.mean_id, 16);
                        let dur = '';
                        if (!isNaN(s.inicio) && !isNaN(s.fin)) {
                          const segs = s.fin - s.inicio;
                          const h = Math.floor(segs/3600);
                          const m = Math.floor((segs%3600)/60);
                          dur = ` | Duración: ${h > 0 ? h+' h., ' : ''}${m} min.`;
                        }
                        datosSidebar += `  ${idx+1}) Bus: ${s.mean_id}${!isNaN(dec)?`(${dec})`:''} | Inicio: ${new Date(s.inicio*1000).toLocaleTimeString()} | Fin: ${new Date(s.fin*1000).toLocaleTimeString()}${dur}\n`;
                      });
                    }
                    datosSidebar += `Servicios completos (pasaron por ambos en orden inverso): ${serviciosCompletosInverso}\n`;
                    if (detalleServiciosInverso.length > 0) {
                      datosSidebar += `Detalle de servicios (inverso):\n`;
                      detalleServiciosInverso.forEach((s, idx) => {
                        let dec = parseInt(s.mean_id, 16);
                        let dur = '';
                        if (!isNaN(s.inicio) && !isNaN(s.fin)) {
                          const segs = s.fin - s.inicio;
                          const h = Math.floor(segs/3600);
                          const m = Math.floor((segs%3600)/60);
                          dur = ` | Duración: ${h > 0 ? h+' h., ' : ''}${m} min.`;
                        }
                        datosSidebar += `  ${idx+1}) Bus: ${s.mean_id}${!isNaN(dec)?`(${dec})`:''} | Inicio: ${new Date(s.inicio*1000).toLocaleTimeString()} | Fin: ${new Date(s.fin*1000).toLocaleTimeString()}${dur}\n`;
                      });
                    }
                  }
                }
                // 6) Fecha y hora de generación
                const fechaGeneracion = new Date().toLocaleString();
                // 7) Cierre
                const cierre = "Este reporte fue generado automáticamente por el sistema de monitoreo/simulación de recorridos de buses. Para más información, consulte al área técnica.";
                // 8) Empresa monitoreada (nombre del Select, forzado)
                let empresa = '';
                // Buscar el select por id "empresa-select" (igual que en la previsualización)
                const selectEmpresa = document.getElementById('empresa-select');
                if (selectEmpresa) {
                  empresa = selectEmpresa.options[selectEmpresa.selectedIndex]?.text?.trim() || empresaId || '';
                } else if (window.empresas && empresaId && window.empresas[empresaId]) {
                  empresa = window.empresas[empresaId].nombre || empresaId;
                } else if (simulacionEstado?.empresaNombre) {
                  empresa = simulacionEstado.empresaNombre;
                } else if (simulacionEstado?.empresa) {
                  empresa = simulacionEstado.empresa;
                } else {
                  empresa = empresaId || '';
                }
                await exportarReporteWord({
                  titulo,
                  descripcion,
                  imagenMapaBase64,
                  fechaMonitoreo,
                  datosSidebar,
                  fechaGeneracion,
                  cierre,
                  empresa
                });
              }}
            >
              Guardar en Word
            </button>
          </div>
        </div>
      )}
      <div style={{fontSize: 14, color: '#666'}}>
        {historico ? 
          'Modo histórico: muestra todos los buses hasta el momento actual' :
          'Modo actual: muestra solo los buses activos en los últimos 5 minutos'
        }
      </div>
    </div>
  );
}

// --- Componente de previsualización del reporte ---
function ReportePreview({ puntosControl, busesPorPunto, busesServicioCompleto, detalleServicios, serviciosCompletosInverso, detalleServiciosInverso, empresa, fechaMonitoreo, imagenMapaBase64 }) {
  return (
    <div style={{background:'#f8f8fa', borderRadius:8, padding:16, marginBottom:16, fontSize:15, maxHeight:350, overflowY:'auto'}}>
      <div style={{fontWeight:'bold', fontSize:18, textAlign:'center', marginBottom:8}}>Reporte de Simulación de Recorrido</div>
      <div style={{fontWeight:'bold', color:'#1976d2', marginBottom:4}}>Empresa monitoreada: {empresa}</div>
      <div style={{marginBottom:4}}>Fecha de monitoreo: {fechaMonitoreo}</div>
      {puntosControl.length > 0 && (
        <div style={{marginBottom:4}}>
          <div>Punto de Control 1: [{puntosControl[0].lat.toFixed(5)}, {puntosControl[0].lng.toFixed(5)}] (Radio: {puntosControl[0].radio} m)</div>
          {puntosControl[1] && <div>Punto de Control 2: [{puntosControl[1].lat.toFixed(5)}, {puntosControl[1].lng.toFixed(5)}] (Radio: {puntosControl[1].radio} m)</div>}
          <div>Buses que pasaron por Punto 1: {busesPorPunto[0].length}</div>
          {puntosControl[1] && <div>Buses que pasaron por Punto 2: {busesPorPunto[1].length}</div>}
          {puntosControl[1] && <div>Servicios completos (ida): {busesServicioCompleto}</div>}
          {detalleServicios.length > 0 && (
            <details style={{marginTop:4}} open>
              <summary>Detalle de servicios (ida)</summary>
              <ul style={{fontSize:14, margin:0, paddingLeft:18}}>
                {detalleServicios.map((s, idx) => {
                  let dec = parseInt(s.mean_id, 16);
                  let dur = '';
                  if (!isNaN(s.inicio) && !isNaN(s.fin)) {
                    const segs = s.fin - s.inicio;
                    const h = Math.floor(segs/3600);
                    const m = Math.floor((segs%3600)/60);
                    dur = ` | Duración: ${h > 0 ? h+' h., ' : ''}${m} min.`;
                  }
                  return <li key={idx}>{idx+1}) Bus: <b>{s.mean_id}</b>{!isNaN(dec)?`(${dec})`:''} | Inicio: <b>{new Date(s.inicio*1000).toLocaleTimeString()}</b> | Fin: <b>{new Date(s.fin*1000).toLocaleTimeString()}</b>{dur}</li>;
                })}
              </ul>
            </details>
          )}
          {puntosControl[1] && <div>Servicios completos (retorno): {serviciosCompletosInverso}</div>}
          {detalleServiciosInverso.length > 0 && (
            <details style={{marginTop:4}} open>
              <summary>Detalle de servicios (retorno)</summary>
              <ul style={{fontSize:14, margin:0, paddingLeft:18}}>
                {detalleServiciosInverso.map((s, idx) => {
                  let dec = parseInt(s.mean_id, 16);
                  let dur = '';
                  if (!isNaN(s.inicio) && !isNaN(s.fin)) {
                    const segs = s.fin - s.inicio;
                    const h = Math.floor(segs/3600);
                    const m = Math.floor((segs%3600)/60);
                    dur = ` | Duración: ${h > 0 ? h+' h., ' : ''}${m} min.`;
                  }
                  return <li key={idx}>{idx+1}) Bus: <b>{s.mean_id}</b>{!isNaN(dec)?`(${dec})`:''} | Inicio: <b>{new Date(s.inicio*1000).toLocaleTimeString()}</b> | Fin: <b>{new Date(s.fin*1000).toLocaleTimeString()}</b>{dur}</li>;
                })}
              </ul>
            </details>
          )}
        </div>
      )}
      {imagenMapaBase64 && (
        <div style={{marginBottom: 8}}>
          <img src={imagenMapaBase64} alt="Mapa de la simulación" style={{width: '100%', borderRadius: 8}} />
        </div>
      )}
      <div style={{marginTop:8, fontSize:13, color:'#888'}}>Este reporte es una previsualización. El archivo Word incluirá la imagen del mapa y todos estos datos.</div>
    </div>
  );
}
