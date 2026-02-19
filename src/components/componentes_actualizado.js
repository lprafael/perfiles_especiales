import React, { useEffect, useRef, useState } from "react";
import { API_BASE } from "../config";
// import MapaCiudades from "./mapa";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerRetinaIcon from "leaflet/dist/images/marker-icon-2x.png";
import shadowIcon from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import SimulacionRecorrido from "./SimulacionRecorrido";
import BusesLayer from "./BusesLayer";
import RegularidadOperativaModal from './RegularidadOperativaModal';
import ControlRegularidadFranjaModal from './ControlRegularidadFranjaModal';
import RegularidadBusesModal from './RegularidadBusesModal';
import ModalPromedioOperativaWizard from './ModalPromedioOperativaWizard';
// 1. Importar papaparse para parsear CSV
import Papa from 'papaparse';
import ModalReporteRutas from "./ModalReporteRutas";
import ReporteServiciosModal from "./ReporteServiciosModal";

const PUBLIC_URL = process.env.PUBLIC_URL || "";

// Esta parte genera la cabecera de página
function CabeceradePagina({ onToggleSidebar, statusMessage }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: '#1e40af', color: 'white' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <button className="hamburger-btn" onClick={onToggleSidebar} title="Mostrar/Ocultar menú">
          ☰
        </button>
        <h1 className="header-title" style={{ margin: 0 }}>
          Sistema de Transporte - VMT
        </h1>
      </div>

      {statusMessage && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          padding: '6px 15px',
          borderRadius: '20px',
          fontSize: '0.95rem',
          fontWeight: '600',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ width: '10px', height: '10px', background: '#4ade80', borderRadius: '50%', display: 'inline-block' }}></span>
          {statusMessage}
        </div>
      )}

      <img
        src={`${PUBLIC_URL}/imágenes/Logo_CIDSA2.jpg`}
        alt="Logo CIDSA"
        className="header-logo"
        style={{ height: '45px' }}
      />
    </header>
  );
}


// Distancia en metros entre dos puntos lat/lng (fórmula Haversine)
function distanciaEnMetros(p1, p2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Calcular el rumbo (bearing) entre dos puntos en grados
function calcularRumbo(p1, p2) {
  const dLon = (p2.lng - p1.lng) * (Math.PI / 180);
  const lat1 = p1.lat * (Math.PI / 180);
  const lat2 = p2.lat * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
}

// Función para animar el movimiento de un marcador
function animateMarker(marker, startLatLng, endLatLng, duration = 1000) {
  if (!marker || !startLatLng || !endLatLng) return;
  const startTime = performance.now();

  function frame(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Interpolación lineal
    const lat = startLatLng.lat + (endLatLng.lat - startLatLng.lat) * progress;
    const lng = startLatLng.lng + (endLatLng.lng - startLatLng.lng) * progress;

    marker.setLatLng([lat, lng]);

    if (progress < 1) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}


// Agrupar puntos cercanos y calcular su punto medio
// Esta función agrupa puntos que están dentro de un umbral dado (en metros) y devuelve el centro de cada grupo
function agruparCercanos(puntos, umbral = 100) {
  const grupos = [];

  puntos.forEach((p) => {
    let agregado = false;

    for (let grupo of grupos) {
      if (distanciaEnMetros(grupo.centro, p) < umbral) {
        grupo.puntos.push(p);
        const latSum = grupo.puntos.reduce((sum, pt) => sum + pt.lat, 0);
        const lngSum = grupo.puntos.reduce((sum, pt) => sum + pt.lng, 0);
        grupo.centro = {
          lat: latSum / grupo.puntos.length,
          lng: lngSum / grupo.puntos.length,
        };
        agregado = true;
        break;
      }
    }

    if (!agregado) {
      grupos.push({ puntos: [p], centro: p });
    }
  });

  return grupos.map((g) => g.centro);
}

// ✅ Función principal para calcular y mostrar los puntos de control
function MiPaginaExistente() {
  // ...existing code...
  // ...
  const [itinerariosEmpresa, setItinerariosEmpresa] = useState([]);
  // Estado para mostrar el modal de reporte de servicios
  const [mostrarModalReporteServicios, setMostrarModalReporteServicios] = useState(false);
  //Definición de variables
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const shapeLayer = useRef(null);
  const paradasLayer = useRef(null);
  const [empresaId, setEmpresaId] = useState("");
  const [fecha, setFecha] = useState(""); // <-- NUEVO
  const [empresas, setEmpresas] = useState([]);

  // Estado para resumen de shapes (tarjeta Power BI)
  const [shapesResumen, setShapesResumen] = useState({
    totalShapes: null,
    totalShapesEmpresa: null,
    totalShapesEmpresaMax: null,
    empresaNombre: ''
  });

  // Efecto para cargar resumen de shapes
  useEffect(() => {
    // Cargar total de shapes global
    fetch(`${API_BASE}/shapes/total`)
      .then(res => res.json())
      .then(data => {
        setShapesResumen(prev => ({
          ...prev,
          totalShapes: data.total || 0,
          totalShapesMax: data.max || 0
        }));
      })
      .catch(() => setShapesResumen(prev => ({ ...prev, totalShapes: 0, totalShapesMax: 0 })));

    // Cargar shapes de la empresa seleccionada usando cod_catalogo
    if (empresaId) {
      const empresaObj = empresas.find(e => e.id_eot_vmt_hex === empresaId);
      const cod_catalogo = empresaObj?.cod_catalogo;
      if (cod_catalogo) {
        fetch(`${API_BASE}/empresas/${cod_catalogo}/shapes/total`)
          .then(res => res.json())
          .then(data => {
            setShapesResumen(prev => ({
              ...prev,
              totalShapesEmpresa: data.total || 0,
              totalShapesEmpresaMax: data.max || data.total || 0,
              empresaNombre: empresaObj.eot_nombre || empresaId
            }));
          })
          .catch(() => setShapesResumen(prev => ({ ...prev, totalShapesEmpresa: 0, totalShapesEmpresaMax: 0 })));
      } else {
        setShapesResumen(prev => ({ ...prev, totalShapesEmpresa: 0, totalShapesEmpresaMax: 0 }));
      }
    } else {
      setShapesResumen(prev => ({ ...prev, totalShapesEmpresa: null, totalShapesEmpresaMax: null, empresaNombre: '' }));
    }
  }, [empresaId, empresas]);

  // Hooks para sliders de control
  const [geocercaRadio, setGeocercaRadio] = useState(50);
  const [distanciaUnificacion, setDistanciaUnificacion] = useState(100);

  // Estado para el auto-iterador
  const [autoIterar, setAutoIterar] = useState(false);
  const autoIterarRef = useRef(null);

  // Configuración de la URL base del backend

  // Estado para controlar la visibilidad del sidebar izquierdo
  const [mostrarSidebarIzquierdo, setMostrarSidebarIzquierdo] = useState(true);

  // Estado para la simulación de buses
  const [simulacionEstado, setSimulacionEstado] = useState(null);
  const [historico, setHistorico] = useState(true);
  const simulacionTimer = useRef(null); // Nuevo: referencia al timer

  // Estado para shape de prueba
  const [shapePrueba, setShapePrueba] = useState(null);
  const [shapePruebaLayer, setShapePruebaLayer] = useState(null);

  // Nuevo: Estados y referencias para buses en tiempo real
  const [busesTiempoRealActivo, setBusesTiempoRealActivo] = useState(false);
  const busesTiempoRealInterval = useRef(null);
  const [busesTiempoReal, setBusesTiempoReal] = useState([]);
  const [busesTiempoRealSeleccionados, setBusesTiempoRealSeleccionados] = useState([]);
  const [busStatus, setBusStatus] = useState("");
  const markerRefs = useRef({});
  const [incluirValidaciones, setIncluirValidaciones] = useState(false); // Nuevo estado

  const validacionesLayer = useRef(null);
  const [validaciones, setValidaciones] = useState([]);

  const [mostrarModalReporteRutas, setMostrarModalReporteRutas] = useState(false);

  const [mostrarPanelRegularidad, setMostrarPanelRegularidad] = useState(false);
  const [mostrarPanelControlFranja, setMostrarPanelControlFranja] = useState(false);
  const [mostrarPanelRegularidadBuses, setMostrarPanelRegularidadBuses] = useState(false);

  // Forzar reset de estado del modal de regularidad al cambiar empresa o fecha
  const prevEmpresaId = useRef("");
  const prevFecha = useRef("");

  useEffect(() => {
    // Si cambia la empresa o la fecha, cerrar y reabrir el modal para forzar reset
    if (mostrarPanelRegularidad && (empresaId !== prevEmpresaId.current || fecha !== prevFecha.current)) {
      setMostrarPanelRegularidad(false);
      setTimeout(() => setMostrarPanelRegularidad(true), 50); // Pequeño delay para desmontar/remontar
    }
    prevEmpresaId.current = empresaId;
    prevFecha.current = fecha;
  }, [empresaId, fecha]);

  // Referencia para la capa de terminales
  const terminalesLayer = useRef(null);

  // Función para mostrar el sidebar izquierdo al cambiar de empresas
  // Función para cargar y mostrar terminales
  function mostrarTerminales(empresaId) {
    // Limpiar capa anterior de terminales si existe
    if (terminalesLayer.current && mapInstance.current) {
      mapInstance.current.removeLayer(terminalesLayer.current);
      terminalesLayer.current = null;
    }

    terminalesLayer.current = L.layerGroup().addTo(mapInstance.current);

    // Icono personalizado para las terminales
    const terminalIcon = new L.Icon({
      iconUrl: `${PUBLIC_URL}/iconos/terminal_py3.png`,
      iconSize: [35, 60],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40],
    });

    fetch(`${API_BASE}/empresas/${empresaId}/terminales`)
      .then((res) => res.json())
      .then((terminales) => {
        terminales.forEach((terminal) => {
          // Crear marcador para la terminal
          const marker = L.marker([terminal.lat, terminal.lng], {
            icon: terminalIcon
          }).addTo(terminalesLayer.current);

          // Agregar evento de clic al marcador
          marker.on('click', () => {
            // Hacer zoom a la ubicación del terminal
            mapInstance.current.setView([terminal.lat, terminal.lng], 18);
          });

          // Popup con información de la terminal
          const googleMapsLink = `https://www.google.com/maps/place/${terminal.lat},${terminal.lng}/@${terminal.lat},${terminal.lng},250m/data=!3m1!1e3`;
          marker.bindPopup(`
            <b>Terminal:</b> ${terminal.nombre || 'Sin nombre'}<br>
            <b>Número:</b> ${terminal.terminal_numero || 'N/A'}<br>
            <b>Buses detectados:</b> ${terminal.cantidad_buses_detectados || 0}<br>
            <a href="${googleMapsLink}" target="_blank" style="color: blue; text-decoration: underline;">Ver Vista Satelital</a>
          `);

          // Si hay geocerca, dibujarla
          if (terminal.geocerca) {
            try {
              const geocerca = terminal.geocerca;
              const polygon = L.polygon(geocerca, {
                color: '#FF4500',
                fillColor: '#FFA07A',
                fillOpacity: 0.3,
                weight: 2
              }).addTo(terminalesLayer.current);

              // Al hacer clic en el polígono, mostrar el popup del marcador
              polygon.on('click', () => marker.openPopup());
            } catch (e) {
              console.error("Error al dibujar geocerca:", e);
            }
          }

          // Si tiene radio_metros, dibujar círculo
          if (terminal.radio_metros) {
            L.circle([terminal.lat, terminal.lng], {
              radius: terminal.radio_metros,
              color: '#FF4500',
              fillColor: '#FFA07A',
              fillOpacity: 0.2,
              weight: 1,
              dashArray: '5, 5'
            }).addTo(terminalesLayer.current);
          }
        });
      })
      .catch((err) => {
        console.error("Error al cargar terminales:", err);
      });
    const listaTerminales = document.getElementById("terminales-list");
    if (!listaTerminales) return;

    listaTerminales.innerHTML = "<li><em>Cargando terminales...</em></li>";

    // Limpiar capa anterior de terminales si existe
    if (window.terminalesLayer && mapInstance.current) {
      mapInstance.current.removeLayer(window.terminalesLayer);
      window.terminalesLayer = null;
    }

    window.terminalesLayer = L.layerGroup().addTo(mapInstance.current);

    fetch(`${API_BASE}/empresas/${empresaId}/terminales`)
      .then((res) => res.json())
      .then((terminales) => {
        listaTerminales.innerHTML = "";
        if (terminales.length === 0) {
          listaTerminales.innerHTML = "<li><em>Sin terminales registradas</em></li>";
          return;
        }

        terminales.forEach((terminal) => {
          const li = document.createElement("li");
          li.className = "list-item terminal-item";
          li.style.fontSize = "13px";
          li.style.backgroundColor = "#e6f3ff";  // Color azul claro para terminales

          // Crear contenido de la terminal
          li.innerHTML = `
            <span style="font-size: 18px; margin-right: 8px;">🏢</span>
            <b>Terminal:</b> ${terminal.nombre || "Sin nombre"}<br>
            <b>Dirección:</b> ${terminal.direccion || "No especificada"}
          `;

          // Si hay geocerca, dibujarla en el mapa
          if (terminal.geocerca) {
            try {
              const geocerca = JSON.parse(terminal.geocerca);
              const polygon = L.polygon(geocerca, {
                color: '#0066cc',
                fillColor: '#3399ff',
                fillOpacity: 0.3,
                weight: 2
              }).addTo(window.terminalesLayer);

              polygon.bindPopup(`Terminal: ${terminal.nombre}`);

              // Al hacer clic en la terminal en la lista, hacer zoom a su geocerca
              li.onclick = () => {
                mapInstance.current.fitBounds(polygon.getBounds());
              };
            } catch (e) {
              console.error("Error al procesar geocerca de terminal:", e);
            }
          }

          listaTerminales.appendChild(li);
        });
      })
      .catch((err) => {
        console.error("Error al cargar terminales:", err);
        listaTerminales.innerHTML = "<li><em>Error al obtener terminales</em></li>";
      });
  }

  function mostrarItinerarios(empresaId) {
    setMostrarSidebarIzquierdo(true); // Mostrar el sidebar izquierdo al cargar itinerarios

    // Cargar terminales después de itinerarios
    mostrarTerminales(empresaId);

    // Esperar a que el DOM esté listo para buscar el elemento
    setTimeout(() => {
      const lista = document.getElementById("itinerarios-list");
      if (!lista) return; // Evitar error si el elemento no existe
      lista.innerHTML = "<li><em>Cargando itinerarios...</em></li>";
      // Limpiar shapes anteriores si existen
      if (shapeLayer.current) {
        mapInstance.current.removeLayer(shapeLayer.current);
        shapeLayer.current = null;
      }
      // Limpiar puntos de control al cambiar de empresa
      if (window.puntosDeControlLayer && mapInstance.current) {
        mapInstance.current.removeLayer(window.puntosDeControlLayer);
        window.puntosDeControlLayer = null;
      }
      // --- NUEVO: Mapeo para shapes y buffers por itinerario ---
      if (!window.shapeRefs) window.shapeRefs = {};
      window.shapeRefs = {}; // Limpiar referencias previas
      fetch(`${API_BASE}/empresas/${empresaId}/itinerarios`)
        .then((res) => res.json())
        .then((data) => {
          lista.innerHTML = "";
          if (data.length === 0) {
            lista.innerHTML = "<li><em>Sin itinerarios disponibles</em></li>";
            return;
          }
          const group = L.layerGroup();
          const colors = [
            "red", "blue", "green", "purple", "orange", "black", "teal"
          ];
          setItinerariosEmpresa(data);
          data.forEach((it, index) => {
            // Calcular distancia total del shape (en km)
            let totalDistancia = 0;
            let shapeCortado = false;
            let tipoItinerario = "";
            let distanciaInicioFin = null;
            if (!Array.isArray(it.shape_lines) || it.shape_lines.length === 0) {
              shapeCortado = true;
            } else {
              // Si hay más de un tramo, o algún tramo tiene menos de 2 puntos, es cortado
              if (it.shape_lines.length > 1) shapeCortado = true;
              it.shape_lines.forEach(line => {
                if (!Array.isArray(line) || line.length < 2) shapeCortado = true;
                if (Array.isArray(line) && line.length > 1) {
                  for (let i = 1; i < line.length; i++) {
                    const prev = line[i - 1];
                    const curr = line[i];
                    const d = L.latLng(prev.lat, prev.lng).distanceTo([curr.lat, curr.lng]);
                    totalDistancia += d;
                  }
                  // Calcular distancia inicio-fin solo para la primera línea válida
                  if (distanciaInicioFin === null) {
                    const inicio = line[0];
                    const fin = line[line.length - 1];
                    distanciaInicioFin = L.latLng(inicio.lat, inicio.lng).distanceTo([fin.lat, fin.lng]);
                  }
                }
              });
            }
            // Determinar tipo de itinerario
            if (distanciaInicioFin !== null) {
              if (distanciaInicioFin > distanciaUnificacion) {
                tipoItinerario = "Lineal";
              } else {
                tipoItinerario = "Circular";
              }
            } else {
              tipoItinerario = "N/D";
            }
            const km = (totalDistancia / 1000).toFixed(2);
            // Icono de estado del shape
            const iconoEstado = shapeCortado ? '❌' : '✔️';
            const li = document.createElement("li");
            li.style.fontSize = "13px"; // Letra más chica para itinerarios
            // --- Agregar icono de estado como span para mejor visualización ---
            const spanEstado = document.createElement("span");
            spanEstado.textContent = iconoEstado;
            spanEstado.style.marginRight = "8px";
            spanEstado.style.fontSize = "18px";
            spanEstado.style.verticalAlign = "middle";
            li.appendChild(spanEstado);
            // Texto del itinerario con tipo
            // Crear el fragmento con "Cód. Ruta:" en negrita
            li.innerHTML += `
              <b>Cód. Ruta:</b> ${it.ruta_hex} - Línea ${it.linea ?? "N/D"} - Ramal ${it.ramal ?? ""}: ${it.origen ?? ""} → ${it.destino ?? ""}  |
              <b>Identificación:</b> ${it.identificacion ?? "N/D"}  |
              <b>Distancia:</b> ${km} km  |
              <b>Tipo:</b> ${tipoItinerario}
            `;
            // Mostrar TODOS los itinerarios, aunque no tengan shape_lines
            let hasLines = false;
            if (Array.isArray(it.shape_lines)) {
              // Si shape_lines es un array de arrays (MULTILINESTRING)
              hasLines = it.shape_lines.some(line => Array.isArray(line) && line.length > 1);
            } else if (it.shape_lines === null) {
              // Si shape_lines es null, NO tiene líneas
              hasLines = false;
            } else if (Array.isArray(it.shape_lines) && it.shape_lines.length === 0) {
              // Si shape_lines es un array vacío, NO tiene líneas
              hasLines = false;
            }
            li.className = "list-item " + (hasLines ? "shape-ok" : "shape-missing");
            if (hasLines) {
              li.style.backgroundColor = "#d4f7d4";
            } else {
              li.style.backgroundColor = "#ffe4e1";
            }
            // Dibujar cada línea del shape_lines
            if (hasLines) {
              const color = colors[index % colors.length];
              const shapePolylines = [];
              const bufferPolys = [];
              it.shape_lines.forEach((line, idx) => {
                if (!Array.isArray(line) || line.length < 2) return;
                // --- DEBUG: Mostrar cada línea en consola ---
                console.log("Shape line para", it.ruta_hex, line);
                const latlngs = line.map((p) => [p.lat, p.lng]);
                const shape = L.polyline(latlngs, { color, weight: 4 }).bindPopup(li.textContent);
                group.addLayer(shape);
                shapePolylines.push(shape);
                // --- DIBUJAR GEOCERCA POLIGONAL (BUFFER) DE 50M ALREDEDOR DE LA LÍNEA ---
                let bufferPoly = null;
                if (window.turf) {
                  const lineFeature = {
                    type: "Feature",
                    geometry: {
                      type: "LineString",
                      coordinates: line.map((p) => [p.lng, p.lat]),
                    },
                  };
                  const buffered = window.turf.buffer(lineFeature, 0.05, { units: "kilometers" });
                  if (buffered && buffered.geometry && buffered.geometry.type === "Polygon") {
                    const coords = buffered.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
                    bufferPoly = L.polygon(coords, {
                      color: color,
                      fillColor: color,
                      fillOpacity: 0.18,
                      weight: 1,
                      dashArray: "4 4",
                    });
                    bufferPoly.addTo(group);
                    bufferPolys.push(bufferPoly);
                  }
                }
              });
              // --- Guardar referencias para mostrar/ocultar ---
              window.shapeRefs[it.ruta_hex || index] = {
                shapes: shapePolylines,
                buffers: bufferPolys,
                visible: true,
                li
              };
              // --- Agregar icono de visibilidad ---
              const icono = document.createElement("span");
              icono.textContent = "👁️";
              icono.style.marginRight = "8px";
              icono.style.cursor = "pointer";
              li.prepend(icono);
            }
            // Si NO tiene líneas, deshabilitar selección y opacidad
            if (!hasLines) {
              li.style.cursor = "not-allowed";
              li.style.opacity = 0.7;
              li.onclick = null;
            } else {
              // Evento de selección: mostrar/ocultar shape
              li.onclick = (e) => {
                if (e.target.tagName === "SPAN") {
                  e.stopPropagation();
                }
                const ref = window.shapeRefs[it.ruta_hex || index];
                if (ref) {
                  if (ref.visible) {
                    ref.shapes.forEach(s => group.removeLayer(s));
                    ref.buffers.forEach(b => group.removeLayer(b));
                    ref.visible = false;
                    li.style.opacity = 0.5;
                    if (li.firstChild && li.firstChild.tagName === "SPAN") li.firstChild.textContent = "🚫";
                  } else {
                    ref.shapes.forEach(s => group.addLayer(s));
                    ref.buffers.forEach(b => group.addLayer(b));
                    ref.visible = true;
                    li.style.opacity = 1;
                    if (li.firstChild && li.firstChild.tagName === "SPAN") li.firstChild.textContent = "👁️";
                    // Hacer zoom a todos los shapes
                    const allBounds = ref.shapes.map(s => s.getBounds());
                    if (allBounds.length > 0) {
                      let bounds = allBounds[0];
                      for (let i = 1; i < allBounds.length; i++) {
                        bounds = bounds.extend(allBounds[i]);
                      }
                      mapInstance.current.fitBounds(bounds);
                    }
                  }
                }
                document.querySelectorAll("#itinerarios-list .list-item").forEach((el) => el.classList.remove("active"));
                if (ref && ref.visible) li.classList.add("active");
              };
            }
            lista.appendChild(li);
          });
          group.addTo(mapInstance.current);
          shapeLayer.current = group;
        })
        .catch((err) => {
          console.error("Error al cargar itinerarios:", err);
          lista.innerHTML = "<li><em>Error al obtener itinerarios</em></li>";
        });
    }, 0);
  }

  function mostrarParadas(rutaHex) {
    fetch(`${API_BASE}/itinerarios/${rutaHex}/paradas`)
      .then((res) => res.json())
      .then((data) => {
        if (paradasLayer.current) {
          mapInstance.current.removeLayer(paradasLayer.current);
        }
        paradasLayer.current = L.layerGroup().addTo(mapInstance.current);
        data.forEach((p) => {
          const marker = L.marker([p.lat, p.lng]).addTo(paradasLayer.current);
          marker.bindPopup(p.nombre);
        });
      });
  }

  //Este se carga al cambiar el SELECT de empresas
  function mostrarbuses(empresaId) {
    // Limpiar capa previa de buses si existe ANTES de la petición
    if (window.busesLayer && mapInstance.current) {
      mapInstance.current.removeLayer(window.busesLayer);
      window.busesLayer = null;
      markerRefs.current = {};
      setBusStatus("");
    }
    fetch(`${API_BASE}/empresas/${empresaId}/ultimos_gps`)
      .then((res) => res.json())
      .then((data) => {
        if (!mapInstance.current) return;
        window.busesLayer = L.layerGroup().addTo(mapInstance.current);
        data.forEach((bus) => {
          const lat = parseFloat(bus.latitud || bus.latitude);
          const lng = parseFloat(bus.longitud || bus.longitude);
          if (isNaN(lat) || isNaN(lng)) return;
          const busIcon = new L.Icon({
            // iconUrl: "/iconos/BUS_CID_VMT.png",
            iconUrl: `${PUBLIC_URL}/iconos/BUS_CID_VMT.png`,
            iconSize: [50, 50],
            iconAnchor: [25, 25],
            popupAnchor: [0, -25],
            shadowUrl: `${PUBLIC_URL}/iconos/marker-shadow.png`,
            shadowSize: [41, 41],
            shadowAnchor: [0, 41],
            className: 'transparent-icon', // Hace el fondo transparente
            backgroundColor: 'transparent',
            backgroundClip: 'padding-box'
          });
          L.marker([lat, lng], { icon: busIcon })
            .addTo(window.busesLayer)
            .bindPopup(
              `Bus: ${bus.mean_id || ""}<br>Fecha: ${bus.fecha_hora || ""}`
            );
        });
      })
      .catch((err) => {
        mostrarAviso("Error al cargar buses en el mapa", "error");
      });
  }

  // Función para cargar y mostrar buses en tiempo real
  const cargarBusesTiempoReal = async () => {
    if (!empresaId) {
      mostrarAviso("Seleccione una empresa primero", "error");
      return;
    }
    // Inicializar capa si no existe, NO borrarla (para permitir transición)
    if (!window.busesLayer && mapInstance.current) {
      window.busesLayer = L.layerGroup().addTo(mapInstance.current);
    }

    const ahora = new Date();

    // Traer los 2 últimos puntos de cada bus
    let rawBuses = [];
    try {
      const res = await fetch(`${API_BASE}/empresas/${empresaId}/ultimos_gps?n=2`);
      rawBuses = await res.json();
    } catch (e) {
      mostrarAviso("Error al obtener buses en tiempo real", "error");
      return;
    }

    // Adaptar los datos
    const buses = rawBuses
      .filter(b => b.puntos && b.puntos.length > 0)
      .map(b => {
        const pActual = b.puntos[0];
        return {
          ...pActual,
          mean_id: b.mean_id,
          lat: parseFloat(pActual.latitude || pActual.latitud || pActual.lat),
          lng: parseFloat(pActual.longitude || pActual.longitud || pActual.lng),
          puntos: b.puntos
        };
      });

    setBusesTiempoReal(buses);
    setBusesTiempoRealSeleccionados(buses.map(b => b.mean_id));
    setMostrarSidebarDerecho(true);
    setInfoServicios({
      tipo: 'buses-tiempo-real',
      empresaId,
      fecha: ahora.toISOString().slice(0, 10),
      buses,
      busesSeleccionados: buses.map(b => b.mean_id)
    });

    if (!mapInstance.current || !window.busesLayer) return;

    // Limpiar polígonos previos
    window.busesLayer.eachLayer(layer => {
      if (layer instanceof L.Polygon && !(layer instanceof L.Marker)) {
        window.busesLayer.removeLayer(layer);
      }
    });

    // Crear buffer alrededor de todos los shapes de la empresa
    let bufferPolygons = [];
    if (shapeLayer.current && window.turf) {
      shapeLayer.current.eachLayer(layer => {
        if (layer instanceof L.Polyline) {
          const latlngs = layer.getLatLngs();
          if (Array.isArray(latlngs) && latlngs.length > 1) {
            const lineFeature = {
              type: "Feature",
              geometry: { type: "LineString", coordinates: latlngs.map(p => [p.lng, p.lat]) }
            };
            const bufferKm = geocercaRadio / 1000;
            const buffer = window.turf.buffer(lineFeature, bufferKm, { units: "kilometers" });
            if (buffer && buffer.geometry) bufferPolygons.push(buffer);
          }
        }
      });
    }

    let unionBuffer = null;
    if (bufferPolygons.length > 0 && window.turf.union) {
      unionBuffer = bufferPolygons[0];
      for (let i = 1; i < bufferPolygons.length; i++) {
        try { unionBuffer = window.turf.union(unionBuffer, bufferPolygons[i]); } catch (e) { }
      }
    }

    // Dibujar el buffer
    if (unionBuffer && unionBuffer.geometry) {
      const polys = unionBuffer.geometry.type === "Polygon" ? [unionBuffer.geometry.coordinates] : unionBuffer.geometry.coordinates;
      polys.forEach(coordsArr => {
        coordsArr.forEach(ring => {
          const latlngs = ring.map(([lng, lat]) => [lat, lng]);
          L.polygon(latlngs, {
            color: "#3388ff",
            fillColor: "#3388ff",
            fillOpacity: 0.12,
            weight: 2,
            dashArray: "4 4"
          }).addTo(window.busesLayer);
        });
      });
    }

    const estaEnBuffer = (lat, lng) => {
      if (!window.turf || !unionBuffer) return false;
      try {
        return window.turf.booleanPointInPolygon({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] } }, unionBuffer);
      } catch (e) { return false; }
    };

    const greenIcon = new L.Icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-green.png", shadowUrl: shadowIcon, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });
    const redIcon = new L.Icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-red.png", shadowUrl: shadowIcon, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });

    // ACTUALIZAR MARCADOERS
    const nuevosIds = buses.map(b => String(b.mean_id));
    Object.keys(markerRefs.current).forEach(id => {
      if (!nuevosIds.includes(id)) {
        window.busesLayer.removeLayer(markerRefs.current[id]);
        delete markerRefs.current[id];
      }
    });

    buses.forEach(bus => {
      const inside = estaEnBuffer(bus.lat, bus.lng);
      let rumbo = 0, velocidad = 0, mostrarFlecha = false;

      if (bus.puntos && bus.puntos.length >= 2) {
        const pActual = bus.puntos[0], pAnterior = bus.puntos[1];
        const lat1 = parseFloat(pAnterior.latitude || pAnterior.latitud || pAnterior.lat), lng1 = parseFloat(pAnterior.longitude || pAnterior.longitud || pAnterior.lng);
        const dist = distanciaEnMetros({ lat: lat1, lng: lng1 }, { lat: bus.lat, lng: bus.lng });
        if (dist > 1) {
          rumbo = calcularRumbo({ lat: lat1, lng: lng1 }, { lat: bus.lat, lng: bus.lng });
          mostrarFlecha = true;
          const dt = (new Date(pActual.fecha_hora).getTime() - new Date(pAnterior.fecha_hora).getTime()) / 1000;
          if (dt > 0) velocidad = (dist / dt) * 3.6;
        }
      }

      let icon;
      const speedLabel = mostrarFlecha ? `<div style="background: white; border: 1px solid black; border-radius: 3px; padding: 0 2px; font-size: 10px; margin-top: 2px; white-space: nowrap;">${velocidad.toFixed(0)} km/h</div>` : '';

      if (mostrarFlecha) {
        const color = inside ? '#2e7d32' : '#c62828';
        icon = L.divIcon({
          html: `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
                  <div style="transform: rotate(${rumbo}deg); width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" fill="${color}" stroke="white" stroke-width="1.5"/>
                    </svg>
                  </div>
                  ${speedLabel}
                </div>`,
          className: '', iconSize: [30, 45], iconAnchor: [15, 15]
        });
      } else { icon = inside ? greenIcon : redIcon; }

      const popupContent = `
        <div style="font-family: Arial, sans-serif;">
          <b style="color: #1a73e8;">Bus: ${bus.mean_id}</b><br>
          <b>Última actualización:</b> ${bus.fecha_hora?.slice(11, 19) || ""}<br>
          ${mostrarFlecha ? `<b>Velocidad aprox:</b> ${velocidad.toFixed(1)} km/h<br>` : '<b>Estado:</b> Detenido o mov. lento<br>'}
          <b>Ubicación:</b> ${inside ? '<span style="color: green;">En Ruta</span>' : '<span style="color: red;">Fuera de Ruta</span>'}
        </div>
      `;

      let marker = markerRefs.current[String(bus.mean_id)];
      if (marker) {
        const oldPos = marker.getLatLng();
        const newPos = L.latLng(bus.lat, bus.lng);
        if (oldPos.lat !== newPos.lat || oldPos.lng !== newPos.lng) {
          //  Segundos para el desplazamiento
          animateMarker(marker, oldPos, newPos, 15000);
        }
        marker.setIcon(icon);
        marker.setPopupContent(popupContent);
      } else {
        marker = L.marker([bus.lat, bus.lng], { icon })
          .addTo(window.busesLayer)
          .bindPopup(popupContent);
        markerRefs.current[String(bus.mean_id)] = marker;
      }
    });
    const enItinerario = buses.filter(b => estaEnBuffer(b.lat, b.lng)).length;
    const descStatus = `${enItinerario} (de ${buses.length}) buses en itinerario`;
    setBusStatus(descStatus);
    mostrarAviso(descStatus, "success");
  };


  useEffect(() => {
    // Inicialización del mapa
    // Configurar íconos
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: markerRetinaIcon,
      iconUrl: markerIcon,
      shadowUrl: shadowIcon,
    });

    if (!mapInstance.current && mapRef.current) {
      mapInstance.current = L.map(mapRef.current).setView(
        [-25.2944, -57.6324],
        11
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapInstance.current);

      const ciudades = [
        { nombre: "Asunción", lat: -25.2920, lng: -57.6199 },
        { nombre: "Luque", lat: -25.2467, lng: -57.4613 },
        { nombre: "San Lorenzo", lat: -25.3545, lng: -57.5116 },
        { nombre: "Lambaré", lat: -25.3546, lng: -57.6158 },
        { nombre: "Fernando de la Mora", lat: -25.3299, lng: -57.5532 },

        { nombre: "Capiatá", lat: -25.3551, lng: -57.4249 },
        { nombre: "Ñemby", lat: -25.3935, lng: -57.5371 },
        { nombre: "Villa Elisa", lat: -25.3667, lng: -57.5833 },
        { nombre: "Mariano Roque Alonso", lat: -25.2095, lng: -57.5429 },
        { nombre: "Ypané", lat: -25.4141, lng: -57.4886 },
        { nombre: "Itauguá", lat: -25.3933, lng: -57.3575 },
        { nombre: "San Antonio", lat: -25.4091, lng: -57.5752 },
        { nombre: "Limpio", lat: -25.1701, lng: -57.4752 },
        { nombre: "Ypacaraí", lat: -25.4077, lng: -57.2888 },
        { nombre: "Areguá", lat: -25.3103, lng: -57.388 },
        { nombre: "Benjamin Aceval", lat: -24.970, lng: -57.566 }, // ﻿-24.970277777778, -57.566666666667
      ];

      ciudades.forEach((ciudad) => {
        const municipioIcon = new L.Icon({
          iconUrl: `${PUBLIC_URL}/iconos/municipios.png`,
          iconSize: [25, 25],
          iconAnchor: [20, 40],
          popupAnchor: [0, -40],
        });
        L.marker([ciudad.lat, ciudad.lng], { icon: municipioIcon })
          .addTo(mapInstance.current)
          .bindPopup(ciudad.nombre);
      });

      // Eliminado: evento de click para origen/destino
      // mapInstance.current.on("click", (e) => {
      //   const { lat, lng } = e.latlng;
      //   if (!origenRef.current) {
      //     origenRef.current = { lat, lng };
      //     mostrarAviso("Punto de origen seleccionado");
      //   } else if (!destinoRef.current) {
      //     destinoRef.current = { lat, lng };
      //     mostrarAviso("Punto de destino seleccionado");
      //     buscarConexiones();
      //   } else {
      //     destinoRef.current = null;
      //     mostrarAviso("Nuevo origen seleccionado. Seleccione un destino.");
      //   }
      // });
    }

    // Eliminado: función buscarConexiones para origen/destino
    // function buscarConexiones() { ... }

    // Para cargar las paradas al cargar la página
    fetch(`${API_BASE}/empresas`)
      .then((res) => res.json())
      .then((data) => {
        setEmpresas(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error("Error al cargar empresas:", err);
        setEmpresas([]); // Asegura que siempre sea un array
      });
  }, [empresaId]);

  // Iterador automático de empresas
  useEffect(() => {
    if (autoIterar) {
      autoIterarRef.current = setInterval(() => {
        const select = document.getElementById("empresa-select");
        if (!select) return;
        let idx = select.selectedIndex;
        // Buscar el siguiente índice válido
        let nextIdx = idx + 1;
        if (nextIdx >= select.options.length) nextIdx = 1; // Saltar el placeholder
        select.selectedIndex = nextIdx;
        const nextValue = select.options[nextIdx].value;
        setEmpresaId(nextValue);
        mostrarItinerarios(nextValue);
      }, 10000);
    } else {
      if (autoIterarRef.current) clearInterval(autoIterarRef.current);
    }
    return () => {
      if (autoIterarRef.current) clearInterval(autoIterarRef.current);
    };
  }, [autoIterar, empresas]);

  // Estado para controlar la visibilidad del sidebar derecho
  const [mostrarSidebarDerecho, setMostrarSidebarDerecho] = useState(false);
  // Estado para la información de servicios calculados
  const [infoServicios, setInfoServicios] = useState(null);

  function verificarSeleccion() {
    // Obtener el elemento select de empresas y los valores seleccionados
    const select = document.getElementById("empresa-select");
    const empresaNombre = select?.options[select.selectedIndex]?.text;
    const selectedIndex = select?.selectedIndex;

    // Validar que se haya seleccionado una empresa y una fecha
    if (empresaId && fecha) {
      // 1. Obtener puntos de control del mapa (si existen)
      let puntosDeControl = [];
      if (window.puntosDeControlLayer) {
        window.puntosDeControlLayer.eachLayer((layer) => {
          if (layer instanceof L.Marker || layer instanceof L.Circle) {
            const latlng = layer.getLatLng();
            puntosDeControl.push({ lat: latlng.lat, lng: latlng.lng });
          }
        });
      }
      // 2. Obtener los shapes (rutas) actualmente dibujados en el mapa
      let shapes = [];
      if (shapeLayer.current) {
        shapeLayer.current.eachLayer((layer) => {
          if (layer instanceof L.Polyline) {
            const latlngs = layer.getLatLngs();
            if (Array.isArray(latlngs) && latlngs.length > 0) {
              shapes.push(latlngs.map((p) => ({ lat: p.lat, lng: p.lng })));
            }
          }
        });
      }
      // 3. Enviar los datos seleccionados al backend mediante POST
      fetch(`${API_BASE}/procesar_seleccion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedIndex, // índice de la empresa seleccionada
          fecha,         // fecha seleccionada
          radio: geocercaRadio, // radio de geocerca actual
          // puntosDeControl, // (opcional: puedes enviar estos datos si el backend los requiere)
          // shapes,         // (opcional: puedes enviar estos datos si el backend los requiere)
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          // Mostrar la información en el sidebar derecho
          setInfoServicios({
            empresaNombre,
            fecha,
            ...data
          });
          setMostrarSidebarDerecho(true);
          mostrarAviso("Datos enviados correctamente al backend", "success");
        })
        .catch((err) => {
          mostrarAviso("Error al enviar datos al backend", "error");
        });
    } else {
      alert("Por favor seleccione una empresa y una fecha");
    }
  }

  // ✅ Función principal para calcular y mostrar los puntos de control
  const calcularPuntosDeControl = () => {
    if (window.puntosDeControlLayer && mapInstance.current) {
      mapInstance.current.removeLayer(window.puntosDeControlLayer);
    }
    window.puntosDeControlLayer = L.layerGroup().addTo(mapInstance.current);

    const shapes = shapeLayer.current?.getLayers() || [];
    if (!shapes.length) {
      alert("No hay shapes cargados para la empresa seleccionada.");
      return;
    }

    const puntosCrudos = [];
    const puntosIntermedios = [];

    // shapes.forEach((shape) => {
    //   const latlngs = shape.getLatLngs();
    //   if (!latlngs || latlngs.length < 2) return;
    //   const inicio = latlngs[0];
    //   const fin = latlngs[latlngs.length - 1];
    //   if (inicio.lat === fin.lat && inicio.lng === fin.lng) {
    //     // Shape cerrado: 1 GX y 2 GZInt
    //     puntosCrudos.push({ ...inicio, tipo: "GX" });
    //     const idx1 = Math.floor(latlngs.length / 3);
    //     const idx2 = Math.floor((2 * latlngs.length) / 3);
    //     puntosIntermedios.push({ ...latlngs[idx1], tipo: "GZInt" });
    //     puntosIntermedios.push({ ...latlngs[idx2], tipo: "GZInt" });
    //   } else {
    //     // Shape abierto: GX y GY
    //     puntosCrudos.push({ ...inicio, tipo: "GX" });
    //     puntosCrudos.push({ ...fin, tipo: "GY" });
    //   }
    // });
    shapes.forEach((shape) => {
      const latlngs = shape.getLatLngs();
      if (!latlngs || latlngs.length < 2) return;
      const inicio = latlngs[0];
      const fin = latlngs[latlngs.length - 1];
      // Calcular la distancia entre el inicio y el fin del shape
      const distancia = mapInstance.current.distance(inicio, fin);
      const esCerrado = distancia <= distanciaUnificacion;

      if (esCerrado) {
        // Shape cerrado: 1 GX y 2 GZInt
        puntosCrudos.push({ lat: inicio.lat, lng: inicio.lng, tipo: " GX" });
        const idx1 = Math.floor(latlngs.length / 3);
        const idx2 = Math.floor((2 * latlngs.length) / 3);
        puntosIntermedios.push({ lat: latlngs[idx1].lat, lng: latlngs[idx1].lng, tipo: "GZInt" });
        puntosIntermedios.push({ lat: latlngs[idx2].lat, lng: latlngs[idx2].lng, tipo: "GZInt" });
      } else {
        // Shape abierto: GX y GY
        puntosCrudos.push({ lat: inicio.lat, lng: inicio.lng, tipo: "GX" });
        puntosCrudos.push({ lat: fin.lat, lng: fin.lng, tipo: "GY" });
      }
    });
    // Agrupar solo GX y GY, los GZInt (intermedios) no se agrupan
    const puntosAgrupados = agruparCercanos(puntosCrudos, distanciaUnificacion);
    const todosPuntos = [...puntosAgrupados, ...puntosIntermedios];

    // Definir icono personalizado para puntos de control usando un icono local
    const controlIcon = new L.Icon({
      iconUrl: `${PUBLIC_URL}/iconos/landmark-159035_1920.png`,
      shadowUrl: `${PUBLIC_URL}/iconos/marker-shadow.png`,
      iconSize: [27, 37],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
      shadowSize: [41, 41],
    });
    // Dibujar puntos de control en el mapa with radio configurable
    todosPuntos.forEach((p, i) => {
      // Círculo de geocerca
      L.circle([p.lat, p.lng], {
        radius: geocercaRadio,
        color: "green",
        fillColor: "#00ff00",
        fillOpacity: 0.3,
      })
        .addTo(window.puntosDeControlLayer)
        .bindPopup(`Punto de Control #${i + 1}`);
      // Marcador con icono personalizado
      L.marker([p.lat, p.lng], { icon: controlIcon }).addTo(
        window.puntosDeControlLayer
      );
    });

    mostrarAviso(
      `Se generaron ${todosPuntos.length} puntos de control para la empresa seleccionada`,
      "success"
    );
  };

  // --- useEffect para renderizar los puntos al cambiar la hora de la barra de progreso ---
  // (Eliminado: ahora está en SimulacionRecorrido)

  // --- FUNCION DE AVANCE DE SIMULACION (AJUSTADA PARA USAR EL ESTADO MAS RECENTE) ---
  // (Eliminado: ahora está en useSimulacionRecorrido)

  // --- useEffect para avance automático de la simulación tipo reproductor ---
  // (Eliminado: ahora está en useSimulacionRecorrido)

  // Limpia todas las capas del mapa (buses, validaciones, paradas, puntos de control)
  // NO elimina shapeLayer (itinerarios), que depende solo de la selección del sidebar izquierdo
  const limpiarCapasMapa = React.useCallback(() => {
    // Limpiar capa de terminales
    if (terminalesLayer.current && mapInstance.current) {
      mapInstance.current.removeLayer(terminalesLayer.current);
      terminalesLayer.current = null;
    }
    if (window.busesLayer && mapInstance.current) {
      mapInstance.current.removeLayer(window.busesLayer);
      window.busesLayer = null;
      markerRefs.current = {};
      setBusStatus("");
    }
    if (validacionesLayer.current && mapInstance.current) {
      mapInstance.current.removeLayer(validacionesLayer.current);
      validacionesLayer.current = null;
    }
    if (paradasLayer.current && mapInstance.current) {
      mapInstance.current.removeLayer(paradasLayer.current);
      paradasLayer.current = null;
    }
    if (window.puntosDeControlLayer && mapInstance.current) {
      mapInstance.current.removeLayer(window.puntosDeControlLayer);
      window.puntosDeControlLayer = null;
    }
    // NO eliminar shapeLayer aquí
    // if (shapeLayer.current && mapInstance.current) {
    //   mapInstance.current.removeLayer(shapeLayer.current);
    //   shapeLayer.current = null;
    // }
  }, [mapInstance]);

  // Handler seguro para cerrar el sidebar derecho y limpiar simulación
  const handleCerrarSidebarDerecho = React.useCallback(() => {
    setMostrarSidebarDerecho(false);
    setSimulacionEstado(null);
    limpiarCapasMapa();
  }, [setMostrarSidebarDerecho, setSimulacionEstado, limpiarCapasMapa]);

  // Nuevo efecto para cargar buses al iniciar
  useEffect(() => {
    if (empresaId) {
      mostrarbuses(empresaId);
    }
  }, [empresaId]);

  // Efecto para refresco automático cada 10s
  useEffect(() => {
    if (busesTiempoRealActivo) {
      // Siempre pinta en el mapa aunque no se abra el sidebar
      const pintarBuses = async () => {
        if (!empresaId) return;
        // Inicializar capa si no existe, NO borrarla (para evitar parpadeo)
        if (!window.busesLayer && mapInstance.current) {
          window.busesLayer = L.layerGroup().addTo(mapInstance.current);
        }

        // Obtener datos de los últimos 2 puntos
        let rawBuses = [];
        try {
          const res = await fetch(`${API_BASE}/empresas/${empresaId}/ultimos_gps?n=2`);
          rawBuses = await res.json();
        } catch (e) {
          console.error("Error al refrescar buses:", e);
          return;
        }

        const buses = rawBuses
          .filter(b => b.puntos && b.puntos.length > 0)
          .map(b => {
            const pActual = b.puntos[0];
            return {
              ...pActual,
              mean_id: b.mean_id,
              lat: parseFloat(pActual.latitude || pActual.latitud || pActual.lat),
              lng: parseFloat(pActual.longitude || pActual.longitud || pActual.lng),
              puntos: b.puntos
            };
          });

        setBusesTiempoReal(buses);

        if (!mapInstance.current || !window.busesLayer) return;

        // --- MANEJO DE GEOCERCAS/BUFFERS ---
        // Limpiamos solo los polígonos antes de redibujarlos (si existen)
        window.busesLayer.eachLayer(layer => {
          if (layer instanceof L.Polygon && !(layer instanceof L.Marker)) {
            window.busesLayer.removeLayer(layer);
          }
        });

        let bufferPolygons = [];
        if (shapeLayer.current && window.turf) {
          shapeLayer.current.eachLayer(layer => {
            if (layer instanceof L.Polyline) {
              const latlngs = layer.getLatLngs();
              if (Array.isArray(latlngs) && latlngs.length > 1) {
                const lineFeature = {
                  type: "Feature",
                  geometry: { type: "LineString", coordinates: latlngs.map(p => [p.lng, p.lat]) }
                };
                const buffer = window.turf.buffer(lineFeature, geocercaRadio / 1000, { units: "kilometers" });
                if (buffer && buffer.geometry) bufferPolygons.push(buffer);
              }
            }
          });
        }
        let unionBuffer = null;
        if (bufferPolygons.length > 0 && window.turf.union) {
          unionBuffer = bufferPolygons[0];
          for (let i = 1; i < bufferPolygons.length; i++) {
            try { unionBuffer = window.turf.union(unionBuffer, bufferPolygons[i]); } catch (e) { }
          }
        }
        if (unionBuffer && unionBuffer.geometry) {
          const polys = unionBuffer.geometry.type === "Polygon" ? [unionBuffer.geometry.coordinates] : unionBuffer.geometry.coordinates;
          polys.forEach(coordsArr => {
            coordsArr.forEach(ring => {
              const latlngs = ring.map(([lng, lat]) => [lat, lng]);
              L.polygon(latlngs, { color: "#3388ff", fillOpacity: 0.12, weight: 2, dashArray: "4 4" }).addTo(window.busesLayer);
            });
          });
        }

        const estaEnBuffer = (lat, lng) => {
          if (!window.turf || !unionBuffer) return false;
          try { return window.turf.booleanPointInPolygon({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] } }, unionBuffer); } catch (e) { return false; }
        };

        const greenIcon = new L.Icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-green.png", shadowUrl: shadowIcon, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });
        const redIcon = new L.Icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-red.png", shadowUrl: shadowIcon, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });

        // Filtrar por selección si existe
        let busesParaMostrar = buses;
        if (busesTiempoRealSeleccionados.length > 0 && busesTiempoRealSeleccionados.length < buses.length) {
          busesParaMostrar = buses.filter(b => busesTiempoRealSeleccionados.includes(b.mean_id));
        }

        // --- ACTUALIZACIÓN DE MARCADORES CON DESPLAZAMIENTO SUAVE ---
        const nuevosIds = busesParaMostrar.map(b => String(b.mean_id));

        // 1. Eliminar marcadores obsoletos
        Object.keys(markerRefs.current).forEach(id => {
          if (!nuevosIds.includes(id)) {
            window.busesLayer.removeLayer(markerRefs.current[id]);
            delete markerRefs.current[id];
          }
        });

        busesParaMostrar.forEach(bus => {
          const inside = estaEnBuffer(bus.lat, bus.lng);
          let rumbo = 0, velocidad = 0, mostrarFlecha = false;
          if (bus.puntos && bus.puntos.length >= 2) {
            const pActual = bus.puntos[0], pAnterior = bus.puntos[1];
            const lat1 = parseFloat(pAnterior.latitude || pAnterior.latitud || pAnterior.lat), lng1 = parseFloat(pAnterior.longitude || pAnterior.longitud || pAnterior.lng);
            const dist = distanciaEnMetros({ lat: lat1, lng: lng1 }, { lat: bus.lat, lng: bus.lng });
            if (dist > 1) { // Umbral de movimiento de 1 metro
              rumbo = calcularRumbo({ lat: lat1, lng: lng1 }, { lat: bus.lat, lng: bus.lng });
              mostrarFlecha = true;
              const dt = (new Date(pActual.fecha_hora).getTime() - new Date(pAnterior.fecha_hora).getTime()) / 1000;
              if (dt > 0) velocidad = (dist / dt) * 3.6;
            }
          }

          let icon;
          const speedLabel = mostrarFlecha ? `<div style="background: white; border: 1px solid black; border-radius: 3px; padding: 0 2px; font-size: 10px; margin-top: 2px; white-space: nowrap;">${velocidad.toFixed(0)} km/h</div>` : '';

          if (mostrarFlecha) {
            const color = inside ? '#2e7d32' : '#c62828';
            icon = L.divIcon({
              html: `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
                      <div style="transform: rotate(${rumbo}deg); width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" fill="${color}" stroke="white" stroke-width="1.5"/>
                        </svg>
                      </div>
                      ${speedLabel}
                    </div>`,
              className: '', iconSize: [30, 45], iconAnchor: [15, 15]
            });
          } else { icon = inside ? greenIcon : redIcon; }

          const popupContent = `
            <div style="font-family: Arial, sans-serif;">
              <b style="color: #1a73e8;">Bus: ${bus.mean_id}</b><br>
              <b>Actualización:</b> ${bus.fecha_hora?.slice(11, 19) || ""}<br>
              ${mostrarFlecha ? `<b>Velocidad:</b> ${velocidad.toFixed(1)} km/h<br>` : '<b>Estado:</b> Estacionado/Lento<br>'}
              <b>Ubicación:</b> ${inside ? '<span style="color: green;">En Ruta</span>' : '<span style="color: red;">Fuera de Ruta</span>'}
            </div>
          `;

          let marker = markerRefs.current[String(bus.mean_id)];
          if (marker) {
            // Desplazamiento suave de la posición anterior a la actual
            const oldPos = marker.getLatLng();
            const newPos = L.latLng(bus.lat, bus.lng);
            if (oldPos.lat !== newPos.lat || oldPos.lng !== newPos.lng) {
              animateMarker(marker, oldPos, newPos, 15000); // 15 segundos de desplazamiento
            }
            marker.setIcon(icon);
            marker.setPopupContent(popupContent);
          } else {
            // Nuevo marcador
            marker = L.marker([bus.lat, bus.lng], { icon })
              .addTo(window.busesLayer)
              .bindPopup(popupContent);
            markerRefs.current[String(bus.mean_id)] = marker;
          }
        });
        const enItinerario = busesParaMostrar.filter(b => estaEnBuffer(b.lat, b.lng)).length;
        const descStatus = `${enItinerario} (de ${busesParaMostrar.length}) buses en itinerario`;
        setBusStatus(descStatus);
        mostrarAviso(descStatus, "success");
      };
      pintarBuses();
      busesTiempoRealInterval.current = setInterval(pintarBuses, 15000);

    } else {
      if (busesTiempoRealInterval.current) {
        clearInterval(busesTiempoRealInterval.current);
        busesTiempoRealInterval.current = null;
      }
      // Limpiar capa de buses al detener
      if (window.busesLayer && mapInstance.current) {
        mapInstance.current.removeLayer(window.busesLayer);
        window.busesLayer = null;
      }
      markerRefs.current = {}; // Limpiar referencias
      setBusStatus("");
      setBusesTiempoReal([]);
      setBusesTiempoRealSeleccionados([]);
      // Limpiar validaciones si estaban activas
      if (validacionesLayer.current && mapInstance.current) {
        mapInstance.current.removeLayer(validacionesLayer.current);
        validacionesLayer.current = null;
      }
      setValidaciones([]);
    }
    return () => {
      if (busesTiempoRealInterval.current) {
        clearInterval(busesTiempoRealInterval.current);
        busesTiempoRealInterval.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busesTiempoRealActivo, empresaId, geocercaRadio, incluirValidaciones]);

  // Referencia para el intervalo de refresco de validaciones en tiempo real
  const validacionesTiempoRealInterval = useRef(null);

  // --- useEffect para refresco automático de validaciones en tiempo real cada 20s ---
  useEffect(() => {
    if (busesTiempoRealActivo && incluirValidaciones) {
      // Refrescar validaciones cada 20 segundos
      const refrescar = () => cargarValidaciones(empresaId, null, true);
      refrescar(); // Llamada inicial
      validacionesTiempoRealInterval.current = setInterval(refrescar, 20000);
    } else {
      if (validacionesTiempoRealInterval.current) {
        clearInterval(validacionesTiempoRealInterval.current);
        validacionesTiempoRealInterval.current = null;
      }
    }
    return () => {
      if (validacionesTiempoRealInterval.current) {
        clearInterval(validacionesTiempoRealInterval.current);
        validacionesTiempoRealInterval.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busesTiempoRealActivo, incluirValidaciones, empresaId]);

  // --- Función para cargar y mostrar validaciones en el mapa ---
  async function cargarValidaciones(empresaId, fecha, modoTiempoReal) {
    console.log('[VALIDACIONES] llamada a cargarValidaciones', { empresaId, fecha, modoTiempoReal });
    if (!empresaId) return;
    // Construir la URL
    let url = `${API_BASE}/validaciones?empresa_id=${empresaId}`;
    if (modoTiempoReal) {
      url += `&tiempo_real=true`;
    } else if (fecha) {
      url += `&fecha=${fecha}`;
    }
    try {
      const res = await fetch(url);
      const data = await res.json();
      // --- OPTIMIZACIÓN ANTI-FLICKER ---
      // Compara si los datos realmente cambiaron antes de limpiar y redibujar
      let datosIguales = false;
      if (Array.isArray(validaciones) && Array.isArray(data) && validaciones.length === data.length) {
        // Compara por idsam o id_sam y lat/lng
        datosIguales = validaciones.every((v, i) => {
          const d = data[i];
          return (
            (v.idsam || v.id_sam) === (d.idsam || d.id_sam) &&
            v.latitude === d.latitude &&
            v.longitude === d.longitude
          );
        });
      }
      if (datosIguales && validacionesLayer.current) {
        // Si los datos no cambiaron, no hacer nada
        console.log('[VALIDACIONES] Sin cambios, no se actualiza la capa.');
        return;
      }
      setValidaciones(data);
      console.log(`[VALIDACIONES] Datos recibidos (${data.length}):`, data);
      // Limpiar capa previa SOLO si hay cambios
      if (validacionesLayer.current && mapInstance.current) {
        mapInstance.current.removeLayer(validacionesLayer.current);
        validacionesLayer.current = null;
      }
      if (!mapInstance.current) return;
      validacionesLayer.current = L.layerGroup().addTo(mapInstance.current);
      // Icono de validación (💳)
      const iconoValidacion = new L.DivIcon({
        html: '<span style="font-size:22px;">💳</span>',
        iconSize: [24, 24],
        className: ''
      });
      let count = 0;
      data.forEach(val => {
        if (!val.latitude || !val.longitude) return;
        count++;
        L.marker([val.latitude, val.longitude], { icon: iconoValidacion })
          .addTo(validacionesLayer.current)
          .bindPopup(
            `<b>Validación</b><br>ID SAM: ${val.idsam || val.id_sam || ''}<br>Fecha: ${val.fechahoraevento || val.fechahora || ''}`
          );
      });
      mostrarAviso(`Se mostraron ${count} validaciones en el mapa`, "success");
      if (count === 0) {
        alert('No se encontraron validaciones para la empresa y fecha seleccionadas.');
      }
    } catch (e) {
      mostrarAviso("Error al cargar validaciones", "error");
      alert('Error al cargar validaciones: ' + e);
    }
  }

  // --- useEffect para cargar validaciones cuando cambia el checkbox o el modo ---
  useEffect(() => {
    if (incluirValidaciones) {
      if (busesTiempoRealActivo) {
        cargarValidaciones(empresaId, null, true);
      }
    } else {
      // Si se desactiva, limpiar del mapa
      if (validacionesLayer.current && mapInstance.current) {
        mapInstance.current.removeLayer(validacionesLayer.current);
        validacionesLayer.current = null;
      }
      setValidaciones([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incluirValidaciones, busesTiempoRealActivo, empresaId]);

  const [mostrarPanelPromedioOperativa, setMostrarPanelPromedioOperativa] = useState(false);

  // 2. Estado para recorrido de prueba
  const [recorridoPrueba, setRecorridoPrueba] = useState(null);

  // 3. Función para cargar y parsear el CSV
  function handleCargarRecorridoPrueba(e) {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: ';',
      complete: function (results) {
        // Validar columnas requeridas
        const requiredCols = ['Coche', 'Tiempo', 'Latitud', 'Longitud'];
        const headers = results.meta.fields || [];
        const missing = requiredCols.filter(col => !headers.includes(col));
        if (missing.length > 0) {
          mostrarAviso(
            `El archivo CSV debe tener las siguientes columnas: Coche;Tiempo;Latitud;Longitud\n` +
            `Faltan: ${missing.join(', ')}\n` +
            `Ejemplo de cabecera: Coche;Tiempo;Latitud;Longitud\n` +
            `Ejemplo de fila: 12;1/5/2025 06:22;-25.306707;-57.478077`,
            'error'
          );
          return;
        }
        // Agrupar por número de bus
        const buses = {};
        results.data.forEach(row => {
          const mean_id = row['numero_bus'] || row['bus'] || row['mean_id'] || row['id'] || row['Coche'] || 'bus';
          const fecha_hora = row['fecha_hora'] || row['fecha'] || row['datetime'] || row['Tiempo'];
          const lat = parseFloat(row['latitud'] || row['lat'] || row['Latitud']);
          const lng = parseFloat(row['longitud'] || row['lng'] || row['Longitud']);
          if (!buses[mean_id]) buses[mean_id] = [];
          buses[mean_id].push({
            mean_id,
            fecha_hora,
            lat,
            lng
          });
        });
        // Formato esperado por SimulacionRecorrido: array de buses con {mean_id, recorrido: [{lat, lng, fecha_hora}]}
        const busesArr = Object.entries(buses).map(([mean_id, puntos]) => ({
          mean_id,
          recorrido: puntos.sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora))
        }));
        setRecorridoPrueba(busesArr);
        setSimulacionEstado({
          buses: busesArr,
          total: busesArr.length,
          corriendo: false
        });
        setMostrarSidebarDerecho(true);
        mostrarAviso('Recorrido de prueba cargado correctamente', 'success');
      }
    });
  }

  // 5. Función para cargar shape de prueba (extraída del botón)
  function handleCargarShapePrueba(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let data;
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.shp') || fileName.endsWith('.zip')) {
          if (!window.shp) {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = 'https://unpkg.com/shpjs@latest/dist/shp.js';
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
            });
          }
          const arrayBuffer = event.target.result;
          const geojson = await window.shp.parseShp(arrayBuffer);
          const dbf = await window.shp.parseDbf(arrayBuffer);
          data = {
            type: "FeatureCollection",
            features: geojson.map((geometry, i) => ({
              type: "Feature",
              geometry: geometry,
              properties: dbf[i] || {}
            }))
          };
          if (data.features.length === 1) {
            data = data.features[0];
          }
        } else {
          data = JSON.parse(event.target.result);
        }
        if (!data.type || !data.geometry || !data.geometry.coordinates) {
          throw new Error("Formato GeoJSON inválido");
        }
        if (shapePruebaLayer && mapInstance.current) {
          mapInstance.current.removeLayer(shapePruebaLayer);
        }
        const layer = L.layerGroup().addTo(mapInstance.current);
        const drawFeature = (feature) => {
          if (feature.geometry.type === "LineString") {
            const coords = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
            L.polyline(coords, {
              color: '#ff0000',
              weight: 4,
              opacity: 0.8
            }).addTo(layer).bindPopup("Shape de prueba - LineString");
          } else if (feature.geometry.type === "Polygon") {
            const coords = feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
            L.polygon(coords, {
              color: '#ff0000',
              fillColor: '#ff0000',
              fillOpacity: 0.2,
              weight: 2
            }).addTo(layer).bindPopup("Shape de prueba - Polygon");
          } else if (feature.geometry.type === "MultiLineString") {
            feature.geometry.coordinates.forEach((line, index) => {
              const coords = line.map(([lng, lat]) => [lat, lng]);
              L.polyline(coords, {
                color: '#ff0000',
                weight: 4,
                opacity: 0.8
              }).addTo(layer).bindPopup(`Shape de prueba - MultiLineString ${index + 1}`);
            });
          } else if (feature.geometry.type === "MultiPolygon") {
            feature.geometry.coordinates.forEach((polygon, index) => {
              const coords = polygon[0].map(([lng, lat]) => [lat, lng]);
              L.polygon(coords, {
                color: '#ff0000',
                fillColor: '#ff0000',
                fillOpacity: 0.2,
                weight: 2
              }).addTo(layer).bindPopup(`Shape de prueba - MultiPolygon ${index + 1}`);
            });
          } else {
            throw new Error("Tipo de geometría no soportado");
          }
        };
        if (data.type === "FeatureCollection") {
          data.features.forEach((feature, index) => {
            drawFeature(feature);
          });
        } else {
          drawFeature(data);
        }
        setShapePruebaLayer(layer);
        setShapePrueba(data);
        mostrarAviso("Shape de prueba cargado correctamente", "success");
        const bounds = L.latLngBounds();
        let hasBounds = false;
        layer.eachLayer((layer) => {
          if (layer.getBounds) {
            bounds.extend(layer.getBounds());
            hasBounds = true;
          }
        });
        if (hasBounds && bounds.isValid()) {
          mapInstance.current.fitBounds(bounds);
        }
      } catch (error) {
        console.error("Error al cargar shape:", error);
        mostrarAviso(`Error al cargar shape: ${error.message}`, "error");
      }
    };
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.shp') || fileName.endsWith('.zip')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }

  return (
    <div className="container">
      <CabeceradePagina
        onToggleSidebar={() => setMostrarSidebarIzquierdo(!mostrarSidebarIzquierdo)}
        statusMessage={busesTiempoRealActivo ? busStatus : ""}
      />

      <div className="content">

        {/* Sidebar principal para selectores y botones */}
        <div className={`sidebar ${!mostrarSidebarIzquierdo ? 'hidden' : ''}`}>

          <div className="selector">
            <b><label htmlFor="empresa-select">Seleccione una empresa:</label></b>
            <select
              id="empresa-select"
              value={empresaId}
              onChange={(e) => {
                const newEmpresaId = e.target.value;
                setEmpresaId(newEmpresaId);
                setMostrarSidebarDerecho(false); // Ocultar sidebar derecho al cambiar empresa
                setBusesTiempoRealActivo(false); // Detener visualización en tiempo real
                setBusesTiempoReal([]); // Limpiar buses en tiempo real
                setBusesTiempoRealSeleccionados([]); // Limpiar selección
                limpiarCapasMapa(); // Limpiar todas las capas del mapa
                setValidaciones([]); // Limpiar validaciones del estado
                // Mostrar las terminales de la empresa
                if (newEmpresaId) {
                  mostrarTerminales(newEmpresaId);
                }
                setIncluirValidaciones(false); // Desactivar checkbox de validaciones para evitar residuos
                if (window.innerWidth < 768) {
                  setMostrarSidebarIzquierdo(false);
                }
                mostrarItinerarios(e.target.value);
                // mostrarbuses(e.target.value);
              }}
            >
              <option value="">Seleccione una empresa</option>
              {empresas.map((empresa) => (
                <option
                  key={empresa.id_eot_vmt_hex}
                  value={empresa.id_eot_vmt_hex}
                >
                  {empresa.eot_nombre}
                </option>
              ))}
            </select>
            <button
              style={{ marginTop: '10px', width: '100%', background: '#e3f2fd', color: '#1976d2', fontWeight: 'bold', borderRadius: 6, border: 'none', padding: '8px 0', fontSize: 16 }}
              onClick={() => setMostrarModalReporteRutas(true)}
            >
              Generar reporte rutas
            </button>
            <div style={{ marginTop: "8px" }}>
              <b><label htmlFor="auto-iterar" style={{ marginLeft: "6px" }}>
                Iterar automáticamente
              </label></b>
              <input
                type="checkbox"
                name="auto-iterar"
                title="Iterar automáticamente"
                id="auto-iterar"
                checked={autoIterar}
                onChange={(e) => setAutoIterar(e.target.checked)}
              />
            </div>
          </div>
          <div className="fecha-selector">
            <b><label htmlFor="fecha">Seleccione una fecha:</label></b>
            <input
              type="date"
              id="fecha"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            {/* <p>Fecha seleccionada: {fecha}</p> */}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              width: "100%",
            }}
          >
            <button onClick={calcularPuntosDeControl} style={{ width: "100%" }}>
              Calcular Puntos de Control
            </button>
            {/* <button
              style={{marginTop:'10px', width:'100%', background:'#e3f2fd', color:'#1976d2', fontWeight:'bold', borderRadius:6, border:'none', padding:'8px 0', fontSize:16}}
              onClick={() => calcularServicios()}
            >
              <b>Calcular servicios</b>
            </button> */}
            <button
              onClick={async () => {
                // --- Lógica avanzada de trayectos y shape predominante ---
                if (!empresaId || !fecha) {
                  alert("Por favor seleccione una empresa y una fecha");
                  return;
                }
                // 1. Obtener puntos de control (círculos de geocerca)
                let puntosDeControl = [];
                if (window.puntosDeControlLayer) {
                  window.puntosDeControlLayer.eachLayer((layer) => {
                    if (layer instanceof L.Circle) {
                      const latlng = layer.getLatLng();
                      const radius = layer.getRadius();
                      puntosDeControl.push({ lat: latlng.lat, lng: latlng.lng, radius });
                    }
                  });
                }
                if (puntosDeControl.length < 2) {
                  alert("Debe haber al menos dos puntos de control para calcular trayectos.");
                  return;
                }
                // 2. Obtener shapes (itinerarios)
                let shapes = [];
                if (shapeLayer.current) {
                  shapeLayer.current.eachLayer((layer) => {
                    if (layer instanceof L.Polyline) {
                      const latlngs = layer.getLatLngs();
                      if (Array.isArray(latlngs) && latlngs.length > 0) {
                        shapes.push(latlngs.map((p) => ({ lat: p.lat, lng: p.lng })));
                      }
                    }
                  });
                }
                if (shapes.length === 0) {
                  alert("No hay shapes cargados para la empresa seleccionada.");
                  return;
                }
                // 3. Obtener los buses y sus recorridos para la empresa y fecha
                let busesData = [];
                try {
                  const res = await fetch(`${API_BASE}/empresas/${empresaId}/buses?fecha=${fecha}`);
                  busesData = await res.json();
                } catch (e) {
                  mostrarAviso("Error al obtener buses", "error");
                  return;
                }
                if (!Array.isArray(busesData) || busesData.length === 0) {
                  mostrarAviso("No se encontraron buses para la empresa y fecha seleccionadas", "error");
                  return;
                }
                // 4. Para cada bus, detectar trayectos entre puntos de control
                // Utilidad: distancia entre dos puntos (Haversine)
                function distanciaMetros(a, b) {
                  const R = 6371000;
                  const toRad = (x) => (x * Math.PI) / 180;
                  const dLat = toRad(b.lat - a.lat);
                  const dLng = toRad(b.lng - a.lng);
                  const lat1 = toRad(a.lat);
                  const lat2 = toRad(b.lat);
                  const aVal = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
                  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
                  return R * c;
                }
                // Utilidad: saber si un punto está dentro de una geocerca
                function dentroGeocerca(p, centro, radio) {
                  return distanciaMetros(p, centro) <= radio;
                }
                // Utilidad: saber si un punto es "inicio/fin" de shape (punto de control coincide con shape)
                function esTerminalShape(pt, shapes, tolerancia = 30) {
                  for (let shape of shapes) {
                    if (distanciaMetros(pt, shape[0]) < tolerancia || distanciaMetros(pt, shape[shape.length - 1]) < tolerancia) {
                      return true;
                    }
                  }
                  return false;
                }
                // 5. Detectar trayectos y shape predominante
                let trayectos = [];
                busesData.forEach((bus) => {
                  if (!Array.isArray(bus.recorrido) || bus.recorrido.length === 0) return;
                  // Ordenar por fecha_hora
                  const recorrido = [...bus.recorrido].sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
                  // --- LÓGICA PARA LINEALES: tomar la última salida del punto de control de inicio antes de llegar al de destino ---
                  // Suponemos que los terminales son los extremos del array puntosDeControl
                  const idxTerminales = puntosDeControl.map((pc, idx) => esTerminalShape(pc, shapes) ? idx : null).filter(idx => idx !== null);
                  if (idxTerminales.length >= 2) {
                    // Solo si hay al menos dos terminales (lineal)
                    for (let t1 = 0; t1 < idxTerminales.length; t1++) {
                      for (let t2 = 0; t2 < idxTerminales.length; t2++) {
                        if (t1 === t2) continue;
                        const idxInicioPC = idxTerminales[t1];
                        const idxFinPC = idxTerminales[t2];
                        // Lógica mejorada: evitar trayectos solapados
                        let i = 0;
                        while (i < recorrido.length) {
                          let idxUltimoDentroInicio = null;
                          // Buscar el último punto dentro de la geocerca de inicio antes de salir
                          while (i < recorrido.length && !dentroGeocerca(recorrido[i], puntosDeControl[idxInicioPC], puntosDeControl[idxInicioPC].radius)) {
                            i++;
                          }
                          // Ahora estamos dentro de la geocerca de inicio
                          while (i < recorrido.length && dentroGeocerca(recorrido[i], puntosDeControl[idxInicioPC], puntosDeControl[idxInicioPC].radius)) {
                            idxUltimoDentroInicio = i;
                            i++;
                          }
                          if (idxUltimoDentroInicio === null) {
                            // No se encontró punto de inicio, terminar
                            break;
                          }
                          // Buscar el primer punto dentro de la geocerca de fin después del inicio
                          let idxPrimerDentroFin = null;
                          let j = i;
                          while (j < recorrido.length) {
                            if (dentroGeocerca(recorrido[j], puntosDeControl[idxFinPC], puntosDeControl[idxFinPC].radius)) {
                              idxPrimerDentroFin = j;
                              break;
                            }
                            j++;
                          }
                          if (idxPrimerDentroFin !== null && idxUltimoDentroInicio < idxPrimerDentroFin) {
                            trayectos.push({
                              bus_id: bus.mean_id,
                              inicio: recorrido[idxUltimoDentroInicio],
                              fin: recorrido[idxPrimerDentroFin],
                              idxInicio: idxUltimoDentroInicio,
                              idxFin: idxPrimerDentroFin,
                              idxGeocercaInicio: idxInicioPC,
                              idxGeocercaFin: idxFinPC,
                              recorrido: recorrido.slice(idxUltimoDentroInicio, idxPrimerDentroFin + 1),
                            });
                            // Continuar la búsqueda después del punto de fin para evitar solapamientos
                            i = idxPrimerDentroFin + 1;
                          } else {
                            // No se encontró punto de fin, terminar
                            break;
                          }
                        }
                      }
                    }
                  }
                  // --- LÓGICA PARA CIRCULARES: debe pasar por dos intermedios antes de volver al terminal ---
                  // Un servicio circular es: sale de un terminal, pasa por al menos dos intermedios distintos, y vuelve al mismo terminal
                  if (idxTerminales.length === 1 && puntosDeControl.length >= 3) {
                    const idxTerminal = idxTerminales[0];
                    let intermedios = puntosDeControl.map((pc, idx) => (!esTerminalShape(pc, shapes) ? idx : null)).filter(idx => idx !== null);
                    let estado = {
                      enTrayecto: false,
                      idxInicio: null,
                      puntoInicio: null,
                      intermediosVisitados: new Set(),
                    };
                    for (let i = 0; i < recorrido.length; i++) {
                      const p = recorrido[i];
                      if (!estado.enTrayecto) {
                        if (dentroGeocerca(p, puntosDeControl[idxTerminal], puntosDeControl[idxTerminal].radius)) {
                          estado.enTrayecto = true;
                          estado.idxInicio = i;
                          estado.puntoInicio = { ...p };
                          estado.intermediosVisitados = new Set();
                        }
                      } else {
                        // Si pasa por un intermedio, lo marca
                        for (let idxInt of intermedios) {
                          if (dentroGeocerca(p, puntosDeControl[idxInt], puntosDeControl[idxInt].radius)) {
                            estado.intermediosVisitados.add(idxInt);
                          }
                        }
                        // Si vuelve al terminal y pasó por al menos dos intermedios distintos
                        if (dentroGeocerca(p, puntosDeControl[idxTerminal], puntosDeControl[idxTerminal].radius) && i > estado.idxInicio) {
                          if (estado.intermediosVisitados.size >= 2) {
                            trayectos.push({
                              bus_id: bus.mean_id,
                              inicio: estado.puntoInicio,
                              fin: { ...p },
                              idxInicio: estado.idxInicio,
                              idxFin: i,
                              idxGeocercaInicio: idxTerminal,
                              idxGeocercaFin: idxTerminal,
                              recorrido: recorrido.slice(estado.idxInicio, i + 1),
                              intermediosVisitados: Array.from(estado.intermediosVisitados),
                            });
                          }
                          // Reiniciar para buscar el siguiente trayecto circular
                          estado = {
                            enTrayecto: false,
                            idxInicio: null,
                            puntoInicio: null,
                            intermediosVisitados: new Set(),
                          };
                        }
                      }
                    }
                  }
                }); // <-- Cierra busesData.forEach
                // 6. Para cada trayecto, determinar shape predominante
                function puntoEnShape(p, shape, tolerancia = 40) {
                  // Busca el punto más cercano del shape
                  let minDist = Infinity;
                  for (let i = 0; i < shape.length; i++) {
                    const d = distanciaMetros(p, shape[i]);
                    if (d < minDist) minDist = d;
                  }
                  return minDist <= tolerancia;
                }
                let trayectosConShape = trayectos.map((t) => {
                  // Contar para cada shape cuántos puntos del trayecto caen en él
                  let shapeCounts = shapes.map((shape) => 0);
                  t.recorrido.forEach((p) => {
                    shapes.forEach((shape, idx) => {
                      if (puntoEnShape(p, shape)) shapeCounts[idx]++;
                    });
                  });
                  // Buscar el shape con más puntos
                  let maxIdx = 0;
                  for (let i = 1; i < shapeCounts.length; i++) {
                    if (shapeCounts[i] > shapeCounts[maxIdx]) maxIdx = i;
                  }
                  return {
                    ...t,
                    shapePredominante: maxIdx,
                    shapeCounts,
                  };
                });

                // Eliminar trayectos duplicados por bus y hora de inicio, dejar el de mayor cantidad de puntos recorridos
                const trayectosUnicos = [];
                const seen = {};
                trayectosConShape.forEach(t => {
                  const key = t.bus_id + '|' + (t.inicio?.fecha_hora || '');
                  if (!seen[key]) {
                    seen[key] = t;
                  } else {
                    // Si ya existe, dejar el de mayor cantidad de puntos recorridos
                    if ((t.recorrido?.length || 0) > (seen[key].recorrido?.length || 0)) {
                      seen[key] = t;
                    }
                  }
                });
                for (const k in seen) trayectosUnicos.push(seen[k]);
                trayectosConShape = trayectosUnicos;
                // Ordenar trayectos por bus y por fecha/hora de inicio
                trayectosConShape = trayectosConShape.sort((a, b) => {
                  if (a.bus_id < b.bus_id) return -1;
                  if (a.bus_id > b.bus_id) return 1;
                  // Si es el mismo bus, ordenar por inicio
                  const fechaA = new Date(a.inicio?.fecha_hora || 0);
                  const fechaB = new Date(b.inicio?.fecha_hora || 0);
                  return fechaA - fechaB;
                });
                // 7. Calcular resumen y mostrar resultados en el sidebar derecho
                // Contar directos/circulares y shapes
                let directos = 0, circulares = 0;
                trayectosConShape.forEach(t => {
                  if (t.idxGeocercaInicio !== t.idxGeocercaFin) directos++;
                  else circulares++;
                });
                // Contar shapes usados
                let shapesUsados = {};
                trayectosConShape.forEach(t => {
                  if (t.shapePredominante !== undefined && t.shapePredominante !== null) {
                    shapesUsados[t.shapePredominante] = (shapesUsados[t.shapePredominante] || 0) + 1;
                  }
                });
                // Resumen de puntos de control
                const totalPC = puntosDeControl.length;
                let terminales = 0, intermedios = 0;
                puntosDeControl.forEach(pc => {
                  if (esTerminalShape(pc, shapes)) terminales++;
                  else intermedios++;
                });
                // Construir shapesDetalles alineado con shapesUsados
                const shapesDetalles = {};
                Object.keys(shapesUsados).forEach(idx => {
                  const it = itinerariosEmpresa[idx] || itinerariosEmpresa[parseInt(idx)];
                  if (it) {
                    // Calcula distancia total del shape (en km)
                    let totalDistancia = 0;
                    if (Array.isArray(it.shape_lines)) {
                      it.shape_lines.forEach(line => {
                        if (Array.isArray(line) && line.length > 1) {
                          for (let i = 1; i < line.length; i++) {
                            const prev = line[i - 1];
                            const curr = line[i];
                            totalDistancia += L.latLng(prev.lat, prev.lng).distanceTo([curr.lat, curr.lng]);
                          }
                        }
                      });
                    }
                    const km = (totalDistancia / 1000).toFixed(2);
                    // Determinar tipo de itinerario
                    let tipoItinerario = "N/D";
                    let distanciaInicioFin = null;
                    if (Array.isArray(it.shape_lines) && it.shape_lines.length > 0 && Array.isArray(it.shape_lines[0])) {
                      const line = it.shape_lines[0];
                      if (line.length > 1) {
                        const inicio = line[0];
                        const fin = line[line.length - 1];
                        distanciaInicioFin = L.latLng(inicio.lat, inicio.lng).distanceTo([fin.lat, fin.lng]);
                        tipoItinerario = distanciaInicioFin > 100 ? "Lineal" : "Circular";
                      }
                    }
                    shapesDetalles[idx] = {
                      codigo: it.ruta_hex || it.codigo || '',
                      linea: it.linea || '',
                      ramal: it.ramal || '',
                      identificacion: it.identificacion || it.nombre || '',
                      distancia: km,
                      tipo: tipoItinerario
                    };
                  }
                });
                setInfoServicios({
                  empresaNombre: empresas.find(e => e.id_eot_vmt_hex === empresaId)?.eot_nombre || empresaId,
                  fecha,
                  trayectos: trayectosConShape,
                  totalTrayectos: trayectosConShape.length,
                  shapesUsados,
                  shapes,
                  shapesDetalles,
                  mensaje: `Se detectaron ${trayectosConShape.length} trayectos entre puntos de control.`,
                  servicios_detectados: { directos, circulares, total: trayectosConShape.length },
                  puntos_control: { total: totalPC, terminales, intermedios, detalle: puntosDeControl },
                });
                setMostrarSidebarDerecho(true);
                mostrarAviso(`Se detectaron ${trayectosConShape.length} trayectos entre puntos de control.`, "success");
              }}
              style={{ width: "100%" }}
            >
              <b>Calcular servicios</b>
            </button>
            <button
              onClick={() => {
                // Nueva funcionalidad: Verificar recorrido
                if (!empresaId || !fecha) {
                  alert("Seleccione una empresa y una fecha");
                  return;
                }
                setBusesTiempoRealActivo(false); // Detener visualización en tiempo real
                setBusesTiempoReal([]); // Limpiar buses en tiempo real
                setBusesTiempoRealSeleccionados([]); // Limpiar selección
                limpiarCapasMapa(); // Limpiar todas las capas del mapa
                fetch(`${API_BASE}/empresas/${empresaId}/buses?fecha=${fecha}`)
                  .then(res => res.json())
                  .then(busesData => {
                    setMostrarSidebarDerecho(true);
                    setInfoServicios({
                      tipo: 'buses',
                      empresaId,
                      fecha,
                      buses: busesData,
                      busesSeleccionados: busesData.map(b => b.mean_id), // por defecto todos seleccionados
                    });
                    // Si el checkbox de validaciones está activo, cargar validaciones para la fecha seleccionada
                    if (incluirValidaciones) {
                      cargarValidaciones(empresaId, fecha, false);
                    } else if (validacionesLayer.current && mapInstance.current) {
                      mapInstance.current.removeLayer(validacionesLayer.current);
                      validacionesLayer.current = null;
                    }
                  })
                  .catch(() => mostrarAviso("Error al obtener buses", "error"));
              }}
              style={{ width: "100%", background: '#e0e0ff', color: '#222' }}
            >
              Verificar recorrido
            </button>
            {/* Botón para mostrar buses en tiempo real */}
            <button
              style={{ width: "100%", background: busesTiempoRealActivo ? '#ffe0e0' : '#e0ffe0', color: '#222', fontWeight: 'bold' }}
              onClick={() => setBusesTiempoRealActivo(act => !act)}
            >
              {busesTiempoRealActivo ? 'Detener visualización tiempo real' : 'Visualizar buses en tiempo real'}
            </button>
            {/* Checkbox para incluir validaciones */}
            <label style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={incluirValidaciones}
                onChange={e => setIncluirValidaciones(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Incluir validaciones
            </label>
            <button
              className="btn-regularidad"
              onClick={() => {
                if (window._regularidadChart) {
                  try { window._regularidadChart.destroy(); } catch (e) { }
                  window._regularidadChart = null;
                }
                window._regularidadPctMenos = undefined;
                window._regularidadPctMas = undefined;
                window._regularidadPromedio = undefined;
                setMostrarPanelRegularidad(true);
              }}
              style={{ width: "100%", backgroundColor: '#e0f7fa', color: '#00796b', fontWeight: 'bold' }}
            >
              Índice de Regularidad Operativa
            </button>
            <button
              className="btn-regularidad-buses"
              onClick={() => setMostrarPanelRegularidadBuses(true)}
              style={{ width: "100%", backgroundColor: '#e3f2fd', color: '#1976d2', fontWeight: 'bold', marginTop: 8 }}
            >
              Índice de Regularidad de Buses
            </button>
            <button
              className="btn-control-franja"
              onClick={() => setMostrarPanelControlFranja(true)}
              style={{ width: "100%", backgroundColor: '#fffde7', color: '#fbc02d', fontWeight: 'bold', marginTop: 8 }}
            >
              Control de Regularidad por Franja
            </button>
            {/* Nuevo botón para análisis avanzado de demanda y promedios */}
            <button
              className="btn-promedio-operativa"
              onClick={() => setMostrarPanelPromedioOperativa(true)}
              style={{ width: "100%", backgroundColor: '#e8f5e9', color: '#388e3c', fontWeight: 'bold', marginTop: 8 }}
            >
              Verificar promedio de operativa
            </button>
            {/* Modal wizard para análisis avanzado (placeholder) */}
            {mostrarPanelPromedioOperativa && (
              <ModalPromedioOperativaWizard onClose={() => setMostrarPanelPromedioOperativa(false)} />
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="btn-shape-prueba"
                onClick={() => {
                  if (shapePrueba) {
                    // Eliminar shape de prueba
                    if (shapePruebaLayer && mapInstance.current) {
                      mapInstance.current.removeLayer(shapePruebaLayer);
                      setShapePruebaLayer(null);
                    }
                    setShapePrueba(null);
                    mostrarAviso("Shape de prueba eliminado", "success");
                  } else {
                    // Lógica de cargar shape de prueba existente
                    document.getElementById('input-shape-prueba').click();
                  }
                }}
                style={{ width: "100%", backgroundColor: shapePrueba ? '#ffe0e0' : '#e0ffe0', color: '#222', fontWeight: 'bold', marginTop: '8px' }}
              >
                {shapePrueba ? 'Eliminar shape de prueba' : 'Cargar shape de prueba'}
              </button>
              <input id="input-shape-prueba" type="file" accept=".json,.geojson" style={{ display: 'none' }} onChange={handleCargarShapePrueba} />
              <button
                className="btn-recorrido-prueba"
                onClick={() => document.getElementById('input-recorrido-prueba').click()}
                style={{ width: "100%", backgroundColor: recorridoPrueba ? '#ffe0e0' : '#e0ffe0', color: '#222', fontWeight: 'bold', marginTop: '8px' }}
              >
                {recorridoPrueba ? 'Eliminar recorrido de prueba' : 'Cargar recorrido de prueba'}
              </button>
              <input id="input-recorrido-prueba" type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCargarRecorridoPrueba} />
            </div>
          </div>

          {/* Control deslizante para parámetros de puntos de control */}
          <div
          // style={{
          //   margin: "20px 0",
          //   padding: "10px",
          //   border: "1px solid #aaa",
          //   borderRadius: "8px",
          //   background: "#f8f8f8",
          // }}
          >
            <label htmlFor="slider-radio">
              <b>Radio de geocerca:</b> {geocercaRadio} m
            </label>
            <input
              id="slider-radio"
              type="range"
              min="20"
              max="1000"
              step="20"
              value={geocercaRadio}
              onChange={(e) => setGeocercaRadio(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <label
              htmlFor="slider-distancia"
              style={{ marginTop: "10px", display: "block" }}
            >
              <b>Distancia para unificar puntos:</b> {distanciaUnificacion} m
            </label>
            <input
              id="slider-distancia"
              type="range"
              min="20"
              max="300"
              value={distanciaUnificacion}
              onChange={(e) => setDistanciaUnificacion(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
          <div className="search-box">
            <label htmlFor="search-line">Buscar por línea:</label>
            <input
              type="text"
              id="search-line"
              placeholder="Buscar por línea..."
            />
            <button className="search-button">🔍</button>
          </div>
        </div>
        <div className="main-content" style={{ position: "relative", display: "flex", height: "100%" }}>
          {/* Tarjeta Power BI flotante arriba del mapa */}
          {/* alinear en la parte de abajo del mapa */}

          <div style={{
            position: 'absolute',
            //top: 58,
            bottom: 58,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1200,
            background: 'linear-gradient(90deg, #e3f2fd 60%, #bbdefb 100%)',
            boxShadow: '0 4px 16px rgba(30,60,120,0.13)',
            borderRadius: 16,
            padding: '18px 38px 14px 38px',
            minWidth: 320,
            maxWidth: 480,
            textAlign: 'center',
            border: '2px solid #1976d2',
            fontFamily: 'Segoe UI, Arial, sans-serif',
            fontWeight: 500,
            color: '#1976d2',
            fontSize: 22,
            letterSpacing: 0.2,
            opacity: 0.70
          }}>
            <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 2 }}>
              Shapes: {shapesResumen.totalShapes !== null && shapesResumen.totalShapesMax !== null
                ? `${shapesResumen.totalShapes}/${shapesResumen.totalShapesMax}`
                : '...'}
            </div>
            <div style={{ fontSize: 18, color: '#0d47a1', marginTop: 2 }}>
              {shapesResumen.empresaNombre && shapesResumen.totalShapesEmpresa !== null && shapesResumen.totalShapesEmpresaMax !== null
                // ? `Shapes de la empresa ${shapesResumen.empresaNombre}: ${shapesResumen.totalShapesEmpresa}/${shapesResumen.totalShapesEmpresaMax}`
                ? `${shapesResumen.empresaNombre}: ${shapesResumen.totalShapesEmpresa}/${shapesResumen.totalShapesEmpresaMax}`
                : 'Seleccione una empresa para ver shapes'}
            </div>
          </div>
          {/* NOTA: Se eliminó del resumen la sección de 'Shapes utilizados en trayectos' para evitar duplicidad e incongruencias. Solo se muestra el bloque detallado arriba. */}
          {/* Sidebar izquierdo flotante dentro del panel del mapa */}
          {mostrarSidebarIzquierdo && (
            <div
              className="sidebar sidebar-izquierdo"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: "100%",
                width: "340px",
                background: "rgba(255, 255, 255, 0.4)",
                zIndex: 1000,
                boxShadow: "2px 0 10px rgba(0,0,0,0.1)",
                overflowY: "auto",
                display: "flex",
                alignItems: "top",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: "normal"
              }}
              id="sidebar-izquierdo"
            >
              <button
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  zIndex: 1100,
                  background: "#fff",
                  border: "1px solid #aaa",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: 18,
                  opacity: 0.7,
                }}
                onClick={() => setMostrarSidebarIzquierdo(false)}
                title="Cerrar"
              >
                ×
              </button>
              <div style={{ padding: 16, width: "100%" }}>
                <div className="itinerarios">
                  <h3>Itinerarios:</h3>
                  <ul id="itinerarios-list">
                    <li>
                      <em>Seleccione una empresa para ver sus itinerarios</em>
                    </li>
                  </ul>
                </div>
                <div className="terminales">
                  <h3>Terminales:</h3>
                  <ul id="terminales-list">
                    <li>
                      <em>Seleccione una empresa para ver sus terminales</em>
                    </li>
                  </ul>
                </div>
                <div className="list-container">
                  <div className="list-header">Paradas</div>
                  <div id="paradas-list">
                    <div className="loader" id="loader-paradas"></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Sidebar derecho flotante y semitransparente */}
          {mostrarSidebarDerecho && (
            <div
              className="sidebar sidebar-derecho"
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                height: "100%",
                width: "340px",
                background: "rgba(255, 255, 255, 0.4)",
                zIndex: 1000,
                boxShadow: "-2px 0 10px rgba(0,0,0,0.1)",
                overflowY: "auto",
                display: "flex",
                alignItems: "top",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: "normal"
              }}
              id="sidebar-derecho"
            >
              <button
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  zIndex: 1100,
                  background: "#fff",
                  border: "1px solid #aaa",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: 18,
                  opacity: 0.7,
                }}
                onClick={handleCerrarSidebarDerecho}
                title="Cerrar"
              >
                ×
              </button>
              <div style={{ padding: 16, width: "100%" }}>
                {/* Bloque de detalles de itinerarios por shape usado */}
                {infoServicios && infoServicios.shapesUsados && infoServicios.shapesDetalles && (
                  <div style={{ marginBottom: 18 }}>
                    <h3 style={{ fontSize: 18, margin: '8px 0 8px 0' }}>Shapes utilizados en trayectos:</h3>
                    <ul style={{ margin: '0 0 0 12px', padding: 0 }}>
                      {Array.isArray(itinerariosEmpresa) && itinerariosEmpresa.map((it, idx) => (
                        <li key={idx} style={{ marginBottom: 10 }}>
                          <b>Shape #{idx + 1}</b> &rarr; {(infoServicios.shapesUsados && infoServicios.shapesUsados[idx]) ? infoServicios.shapesUsados[idx] : 0} trayectos
                          {infoServicios.shapesDetalles && infoServicios.shapesDetalles[idx] ? (
                            <table style={{ marginTop: 4, marginLeft: 12, fontSize: 13, borderCollapse: 'collapse', background: '#f8f8ff' }}>
                              <thead>
                                <tr style={{ background: '#e0e0e0' }}>
                                  <th style={{ padding: '2px 6px', border: '1px solid #bbb' }}>Código</th>
                                  <th style={{ padding: '2px 6px', border: '1px solid #bbb' }}>Línea</th>
                                  <th style={{ padding: '2px 6px', border: '1px solid #bbb' }}>Ramal</th>
                                  <th style={{ padding: '2px 6px', border: '1px solid #bbb' }}>Identificación</th>
                                  <th style={{ padding: '2px 6px', border: '1px solid #bbb' }}>Distancia (km)</th>
                                  <th style={{ padding: '2px 6px', border: '1px solid #bbb' }}>Tipo</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td style={{ padding: '2px 6px', border: '1px solid #ccc' }}>{infoServicios.shapesDetalles[idx].codigo}</td>
                                  <td style={{ padding: '2px 6px', border: '1px solid #ccc' }}>{infoServicios.shapesDetalles[idx].linea}</td>
                                  <td style={{ padding: '2px 6px', border: '1px solid #ccc' }}>{infoServicios.shapesDetalles[idx].ramal}</td>
                                  <td style={{ padding: '2px 6px', border: '1px solid #ccc' }}>{infoServicios.shapesDetalles[idx].identificacion}</td>
                                  <td style={{ padding: '2px 6px', border: '1px solid #ccc' }}>{infoServicios.shapesDetalles[idx].distancia}</td>
                                  <td style={{ padding: '2px 6px', border: '1px solid #ccc' }}>{infoServicios.shapesDetalles[idx].tipo}</td>
                                </tr>
                              </tbody>
                            </table>
                          ) : (
                            <div style={{ marginLeft: 12, color: '#888', fontSize: 12 }}>(Sin detalles de itinerario)</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* Renderizar SimulacionRecorrido si hay simulacionEstado */}
                {simulacionEstado && simulacionEstado.total > 0 && (
                  <SimulacionRecorrido
                    simulacionEstado={simulacionEstado}
                    setSimulacionEstado={setSimulacionEstado}
                    historico={historico}
                    setHistorico={setHistorico}
                    mapInstance={mapInstance}
                    empresaId={empresaId}
                    fecha={fecha}
                    incluirValidaciones={incluirValidaciones}
                    cargarValidaciones={cargarValidaciones}
                  />
                )}
                {/* Renderizar selección de buses solo si está pausada la simulación o no hay simulación */}
                {(infoServicios && (infoServicios.tipo === 'buses' || infoServicios.tipo === 'buses-tiempo-real') && (!simulacionEstado || (simulacionEstado && !simulacionEstado.corriendo))) ? (
                  <div>
                    <h2 style={{ fontSize: 22, marginBottom: 8 }}>Buses detectados</h2>
                    <div><b>Empresa:</b> {empresas.find(e => e.id_eot_vmt_hex === infoServicios.empresaId)?.eot_nombre || infoServicios.empresaId}</div>
                    <div><b>Fecha:</b> {infoServicios.fecha}</div>
                    <div style={{ marginTop: 8, marginBottom: 8, display: 'flex', gap: 8 }}>
                      <button style={{ flex: 1, background: '#e0ffe0', border: '1px solid #aaa', borderRadius: 4, cursor: 'pointer' }}
                        onClick={() => setInfoServicios({ ...infoServicios, busesSeleccionados: infoServicios.buses.map(b => b.mean_id) })}>
                        Marcar todos
                      </button>
                      <button style={{ flex: 1, background: '#ffe0e0', border: '1px solid #aaa', borderRadius: 4, cursor: 'pointer' }}
                        onClick={() => setInfoServicios({ ...infoServicios, busesSeleccionados: [] })}>
                        Desmarcar todos
                      </button>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <b>Buses ({infoServicios.buses.length}):</b>
                      <ul style={{ maxHeight: 180, overflowY: 'auto', marginTop: 6, marginBottom: 6, border: '1px solid #ccc', borderRadius: 4, padding: 8, background: '#f8f8ff' }}>
                        {infoServicios.buses.map((bus, idx) => (
                          <li key={bus.mean_id} style={{ marginBottom: 4 }}>
                            <input
                              type="checkbox"
                              checked={infoServicios.busesSeleccionados?.includes(bus.mean_id)}
                              onChange={e => {
                                const nuevos = e.target.checked
                                  ? [...infoServicios.busesSeleccionados, bus.mean_id]
                                  : infoServicios.busesSeleccionados.filter(id => id !== bus.mean_id);
                                setInfoServicios({ ...infoServicios, busesSeleccionados: nuevos });
                                // Si es tiempo real, también filtrar en el mapa
                                if (infoServicios.tipo === 'buses-tiempo-real') {
                                  setBusesTiempoRealSeleccionados(nuevos);
                                }
                              }}
                              style={{ marginRight: 8 }}
                            />
                            <b>{bus.mean_id}</b>{!isNaN(parseInt(bus.mean_id, 16)) ? ` (${parseInt(bus.mean_id, 16)}) - ` : ''}{bus.recorrido ? ` (${bus.recorrido.length} puntos)` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* Solo mostrar botón de simulación si es tipo 'buses' */}
                    {infoServicios.tipo === 'buses' && (
                      <button
                        style={{ width: '100%', background: '#d0ffe0', color: '#222', fontWeight: 'bold', marginTop: 8 }}
                        disabled={!!simulacionEstado} // Deshabilita si ya hay simulación activa
                        onClick={e => {
                          e.target.disabled = true;
                          if (!infoServicios.busesSeleccionados?.length) {
                            mostrarAviso('Seleccione al menos un bus para simular', 'error');
                            e.target.disabled = false;
                            return;
                          }
                          if (window.simulacionLayer && mapInstance.current) {
                            mapInstance.current.removeLayer(window.simulacionLayer);
                          }
                          window.simulacionLayer = L.layerGroup().addTo(mapInstance.current);
                          const busesSim = infoServicios.buses.filter(b => infoServicios.busesSeleccionados.includes(b.mean_id));
                          let puntos = [];
                          busesSim.forEach(bus => {
                            bus.recorrido.forEach(p => puntos.push({ ...p, mean_id: bus.mean_id }));
                          });
                          puntos.sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
                          const timestamps = puntos.map(p => Math.floor(new Date(p.fecha_hora).getTime() / 1000));
                          const fechaBase = infoServicios.fecha || (busesSim[0]?.recorrido[0]?.fecha_hora?.slice(0, 10));
                          const inicioDia = new Date(fechaBase + 'T00:00:00').getTime() / 1000;
                          const finDia = new Date(fechaBase + 'T23:59:59').getTime() / 1000;
                          setSimulacionEstado({
                            total: puntos.length,
                            actual: 0,
                            velocidad: simulacionEstado?.velocidad || 350,
                            corriendo: true,
                            puntos: puntos.map((p, i) => ({ ...p, ts: timestamps[i] })),
                            minTimestamp: inicioDia,
                            maxTimestamp: finDia,
                            horaActual: inicioDia,
                            horaActualStr: new Date(inicioDia * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          });
                          setTimeout(() => setInfoServicios(null), 0); // Limpia infoServicios tras iniciar simulación
                          mostrarAviso('Simulación iniciada', 'success');
                        }}
                      >
                        Iniciar simulación
                      </button>
                    )}
                  </div>
                ) : busesTiempoRealActivo && busesTiempoReal.length > 0 ? (
                  <div>

                    <h2 style={{ fontSize: 22, marginBottom: 8 }}>Buses en tiempo real</h2>
                    <div><b>Empresa:</b> {empresas.find(e => e.id_eot_vmt_hex === empresaId)?.eot_nombre || empresaId}</div>
                    <div style={{ marginTop: 8, marginBottom: 8, display: 'flex', gap: 8 }}>
                      <button style={{ flex: 1, background: '#e0ffe0', border: '1px solid #aaa', borderRadius: 4, cursor: 'pointer' }}
                        onClick={() => setBusesTiempoRealSeleccionados(busesTiempoReal.map(b => b.mean_id))}>
                        Marcar todos
                      </button>
                      <button style={{ flex: 1, background: '#e0e0e0', border: '1px solid #aaa', borderRadius: 4, cursor: 'pointer' }}
                        onClick={() => setBusesTiempoRealSeleccionados([])}>
                        Desmarcar todos
                      </button>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <b>Buses ({busesTiempoReal.length}):</b>
                      <ul style={{ maxHeight: 180, overflowY: 'auto', marginTop: 6, marginBottom: 6, border: '1px solid #ccc', borderRadius: 4, padding: 8, background: '#f8f8ff' }}>
                        {busesTiempoReal.map((bus, idx) => (
                          <li key={bus.mean_id} style={{ marginBottom: 4 }}>
                            <input
                              type="checkbox"
                              checked={busesTiempoRealSeleccionados.includes(bus.mean_id)}
                              onChange={e => {
                                const nuevos = e.target.checked
                                  ? [...busesTiempoRealSeleccionados, bus.mean_id]
                                  : busesTiempoRealSeleccionados.filter(id => id !== bus.mean_id);
                                setBusesTiempoRealSeleccionados(nuevos);
                              }}
                              style={{ marginRight: 8 }}
                            />
                            <b>{bus.mean_id}</b> <span style={{ fontSize: 14, color: '#888' }}>{bus.fecha_hora?.slice(11, 19) || ''}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div style={{ marginTop: 8, color: '#888', fontSize: 15 }}>
                      Solo los buses seleccionados se mostrarán en el mapa.
                    </div>
                  </div>
                ) : infoServicios && (!simulacionEstado || (simulacionEstado && !simulacionEstado.corriendo)) ? (
                  <div>
                    <h2 style={{ fontSize: 22, marginBottom: 8 }}>Resumen de Servicios</h2>
                    <div><b>Empresa:</b> {infoServicios.empresaNombre}</div>
                    <div><b>Fecha:</b> {infoServicios.fecha}</div>
                    <div style={{ marginTop: 8 }}><b>{infoServicios.mensaje}</b></div>
                    <hr style={{ margin: '10px 0' }} />
                    <div><b>Shapes cargados:</b> {infoServicios.shapes?.length}</div>
                    <div><b>Servicios detectados:</b></div>
                    <ul style={{ marginLeft: 18 }}>
                      <li><b>Directos:</b> {infoServicios.servicios_detectados?.directos}</li>
                      <li><b>Circulares:</b> {infoServicios.servicios_detectados?.circulares}</li>
                      <li><b>Total:</b> {infoServicios.servicios_detectados?.total}</li>
                    </ul>
                    <div><b>Puntos de control:</b></div>
                    <ul style={{ marginLeft: 18 }}>
                      <li><b>Total:</b> {infoServicios.puntos_control?.total}</li>
                      <li><b>Terminales:</b> {infoServicios.puntos_control?.terminales}</li>
                      <li><b>Intermedios:</b> {infoServicios.puntos_control?.intermedios}</li>
                    </ul>
                    <div style={{ marginTop: 8 }}>
                      <b>Shapes utilizados en trayectos:</b>
                      <ul style={{ marginLeft: 18 }}>
                        {infoServicios.shapes && Object.keys(infoServicios.shapesUsados || {}).map(idx => (
                          <li key={idx}>Shape #{parseInt(idx) + 1} &rarr; {infoServicios.shapesUsados[idx]} trayectos</li>
                        ))}
                      </ul>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <b>Detalle de trayectos detectados:</b>
                      <div style={{ maxHeight: 220, overflowY: 'auto', background: '#f8f8f8', borderRadius: 4, padding: 8 }}>
                        {Array.isArray(infoServicios.trayectos) && infoServicios.trayectos.length > 0 ? (
                          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: '#e0e0e0' }}>
                                <th style={{ padding: '4px', border: '1px solid #ccc' }}>Bus</th>
                                <th style={{ padding: '4px', border: '1px solid #ccc' }}>Inicio</th>
                                <th style={{ padding: '4px', border: '1px solid #ccc' }}>Fin</th>
                                <th style={{ padding: '4px', border: '1px solid #ccc' }}>Shape</th>
                                <th style={{ padding: '4px', border: '1px solid #ccc' }}>Puntos</th>
                              </tr>
                            </thead>
                            <tbody>
                              {infoServicios.trayectos.map((t, i) => (
                                <tr key={i}>
                                  <td style={{ padding: '4px', border: '1px solid #ccc' }}>{t.bus_id}</td>
                                  <td style={{ padding: '4px', border: '1px solid #ccc' }}>
                                    {t.inicio?.fecha_hora ? new Date(t.inicio.fecha_hora).toLocaleTimeString() : ''}<br />
                                    <span style={{ fontSize: 11, color: '#888' }}>{t.idxGeocercaInicio !== undefined ? `PC#${t.idxGeocercaInicio + 1}` : ''}</span>
                                  </td>
                                  <td style={{ padding: '4px', border: '1px solid #ccc' }}>
                                    {t.fin?.fecha_hora ? new Date(t.fin.fecha_hora).toLocaleTimeString() : ''}<br />
                                    <span style={{ fontSize: 11, color: '#888' }}>{t.idxGeocercaFin !== undefined ? `PC#${t.idxGeocercaFin + 1}` : ''}</span>
                                  </td>
                                  <td style={{ padding: '4px', border: '1px solid #ccc' }}>
                                    {t.shapePredominante !== undefined && t.shapePredominante !== null ? `#${t.shapePredominante + 1}` : '-'}
                                  </td>
                                  <td style={{ padding: '4px', border: '1px solid #ccc' }}>{t.recorrido?.length || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ color: '#888' }}>No hay trayectos detectados.</div>
                        )}
                      </div>
                    </div>
                    {/* Botón para generar reporte usando modal ReactTable */}
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <button
                        style={{ padding: '8px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 5, fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}
                        onClick={() => setMostrarModalReporteServicios(true)}
                      >
                        Generar reporte
                      </button>
                      <ReporteServiciosModal
                        open={mostrarModalReporteServicios}
                        onClose={() => setMostrarModalReporteServicios(false)}
                        resumen={{
                          empresaNombre: infoServicios.empresaNombre,
                          fecha: infoServicios.fecha,
                          shapes: infoServicios.shapes,
                          servicios_detectados: infoServicios.servicios_detectados,
                          puntos_control: infoServicios.puntos_control,
                          shapesUsados: infoServicios.shapesUsados
                        }}
                        servicios={(infoServicios.trayectos || []).map(t => ({
                          busNumero: t.bus_id,
                          itinerarioNombre: t.shapePredominante !== undefined ? `Shape #${t.shapePredominante + 1}` : '-',
                          tipoServicio: t.tipoServicio || '-',
                          horaInicio: t.inicio?.fecha_hora ? new Date(t.inicio.fecha_hora) : null,
                          horaFin: t.fin?.fecha_hora ? new Date(t.fin.fecha_hora) : null,
                          estado: t.estado || '-',
                          puntosRecorridos: t.recorrido || []
                        }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: '#888' }}>No hay datos para mostrar.</div>
                )}
              </div>
            </div>
          )}
          <div className="map-container" style={{ width: "100%", height: "100%" }}>
            <div
              ref={mapRef}
              id="map"
              style={{
                width: "100%",
                height: "100%",
                border: "2px solid blue",
              }}
            ></div>
          </div>
        </div>
      </div>
      <div id="alerta" className="alert" style={{ display: "none" }}></div>
      {mostrarModalReporteRutas && (
        <ModalReporteRutas
          onClose={() => setMostrarModalReporteRutas(false)}
        />
      )}

      {/* Panel emergente para el dashboard de regularidad */}
      {mostrarPanelRegularidad && (
        <RegularidadOperativaModal empresaId={empresaId} fecha={fecha} onClose={() => setMostrarPanelRegularidad(false)} />
      )}
      {mostrarPanelRegularidadBuses && (
        <RegularidadBusesModal empresaId={empresaId} fecha={fecha} onClose={() => setMostrarPanelRegularidadBuses(false)} />
      )}
      {mostrarPanelControlFranja && (
        <ControlRegularidadFranjaModal empresaId={empresaId} fecha={fecha} onClose={() => setMostrarPanelControlFranja(false)} />
      )}
    </div>
  );
}

// --- FUNCION DE AVANCE DE SIMULACION (AJUSTADA PARA USAR EL ESTADO MAS RECIENTE) ---
function avanzarSimulacion(ts, historico, simulacionTimer, setSimulacionEstado, mapInstance) {
  setSimulacionEstado(s => {
    if (!s || !s.corriendo) return s;
    const maxTimestamp = s.maxTimestamp;
    let nuevoTs = ts;
    if (nuevoTs > maxTimestamp) {
      simulacionTimer.current = null;
      return { ...s, horaActual: maxTimestamp, horaActualStr: new Date(maxTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), corriendo: false };
    }
    // El renderizado lo hace el useEffect
    if (nuevoTs < maxTimestamp && s.corriendo) {
      simulacionTimer.current = setTimeout(() => avanzarSimulacion(nuevoTs + 1, historico, simulacionTimer, setSimulacionEstado, mapInstance), s.velocidad);
    } else {
      simulacionTimer.current = null;
    }
    return { ...s, horaActual: nuevoTs, horaActualStr: new Date(nuevoTs * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
  });
}

function mostrarAviso(mensaje, tipo = "info") {
  const alerta = document.getElementById("alerta");
  alerta.textContent = mensaje;
  alerta.className = "alert " + tipo;
  alerta.style.display = "block";

  setTimeout(() => {
    alerta.style.display = "none";
  }, 5000); // se oculta luego de 5 segundos
}

export { mostrarAviso };
export { CabeceradePagina };
export default MiPaginaExistente;
