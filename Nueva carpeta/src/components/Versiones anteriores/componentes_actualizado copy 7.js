import React, { useEffect, useRef, useState } from "react";
// import MapaCiudades from "./mapa";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerRetinaIcon from "leaflet/dist/images/marker-icon-2x.png";
import shadowIcon from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";

function CabeceradePagina() {
  return (
    <header>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Sistema de Transporte Urbano - VMT</title>
      <h1>
        Sistema de Transporte Urbano - Área Metropolitana de Asunción -
        Viceministerio de Transporte(MOPC)
      </h1>
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

// Agrupar puntos cercanos y calcular su punto medio
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
  //Definición de variables
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const shapeLayer = useRef(null);
  const paradasLayer = useRef(null);
  const [empresaId, setEmpresaId] = useState("");
  const origenRef = useRef(null);
  const destinoRef = useRef(null);
  const [fecha, setFecha] = useState(""); // <-- NUEVO
  const [empresas, setEmpresas] = useState([]);

  // Hooks para sliders de control
  const [geocercaRadio, setGeocercaRadio] = useState(50);
  const [distanciaUnificacion, setDistanciaUnificacion] = useState(100);

  // Estado para el auto-iterador
  const [autoIterar, setAutoIterar] = useState(false);
  const autoIterarRef = useRef(null);

  // Configuración de la URL base del backend
  const API_BASE = "http://192.168.100.191:8000";
  //const API_BASE = "http://192.168.100.191:3001";

  // Estado para controlar la visibilidad del sidebar izquierdo
  const [mostrarSidebarIzquierdo, setMostrarSidebarIzquierdo] = useState(true);

  function mostrarItinerarios(empresaId) {
    setMostrarSidebarIzquierdo(true); // Mostrar el sidebar izquierdo al cargar itinerarios
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
          data.forEach((it, index) => {
            const li = document.createElement("li");
            li.textContent = `Cód. Ruta: ${it.ruta_hex} - Línea ${it.linea ?? "N/D"} - Ramal ${it.ramal ?? ""}: ${it.origen ?? ""} → ${it.destino ?? ""}`;
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

  function mostrarbuses(empresaId) {
    // Limpiar capa previa de buses si existe ANTES de la petición
    if (window.busesLayer && mapInstance.current) {
      mapInstance.current.removeLayer(window.busesLayer);
      window.busesLayer = null;
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
            iconUrl: "https://cdn-icons-png.flaticon.com/512/61/61231.png",
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32],
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
        { nombre: "Asunción", lat: -25.2944, lng: -57.6324 },
        { nombre: "Luque", lat: -25.2686, lng: -57.4906 },
        { nombre: "San Lorenzo", lat: -25.3386, lng: -57.5088 },
        { nombre: "Lambaré", lat: -25.3468, lng: -57.6063 },
        { nombre: "Fernando de la Mora", lat: -25.3164, lng: -57.5217 },
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
        { nombre: "Cerro Porteño", lat: -25.2944, lng: -57.6324 },
        { nombre: "Benjamin Aceval", lat: -24.970, lng: -57.566 }, // ﻿-24.970277777778, -57.566666666667
      ];

      ciudades.forEach((ciudad) => {
        L.marker([ciudad.lat, ciudad.lng])
          .addTo(mapInstance.current)
          .bindPopup(ciudad.nombre);
      });

      mapInstance.current.on("click", (e) => {
        const { lat, lng } = e.latlng;
        if (!origenRef.current) {
          origenRef.current = { lat, lng };
          mostrarAviso("Punto de origen seleccionado");
        } else if (!destinoRef.current) {
          destinoRef.current = { lat, lng };
          mostrarAviso("Punto de destino seleccionado");
          buscarConexiones();
        } else {
          origenRef.current = { lat, lng };
          destinoRef.current = null;
          mostrarAviso("Nuevo origen seleccionado. Seleccione un destino.");
        }
      });
    }

    // Para buscar las conexiones
    function buscarConexiones() {
      if (!origenRef.current || !destinoRef.current) {
        mostrarAviso("Seleccione un origen y un destino");
        return;
      }
      const origen = origenRef.current;
      const destino = destinoRef.current;
      fetch(
        `${API_BASE}/conexiones?origen=${origen.lat},${origen.lng}&destino=${destino.lat},${destino.lng}`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.length === 0) {
            mostrarAviso("No se encontraron conexiones");
            return;
          }
          if (shapeLayer.current) {
            mapInstance.current.removeLayer(shapeLayer.current);
          }
          shapeLayer.current = L.layerGroup().addTo(mapInstance.current);
          data.forEach((ruta) => {
            const polyline = L.polyline(
              ruta.shape.map((p) => [p.lat, p.lng]),
              { color: "blue" }
            ).addTo(shapeLayer.current);
            const marker = L.marker([ruta.origen.lat, ruta.origen.lng]).addTo(
              shapeLayer.current
            );
            marker.bindPopup("Origen: " + ruta.origen.nombre);
            const marker2 = L.marker([
              ruta.destino.lat,
              ruta.destino.lng,
            ]).addTo(shapeLayer.current);
            marker2.bindPopup("Destino: " + ruta.destino.nombre);
            polyline.bindPopup(
              `Ruta: ${ruta.linea} - Ramal: ${ruta.ramal} - Origen: ${ruta.origen.nombre} - Destino: ${ruta.destino.nombre}`
            );
            polyline.on("click", () => {
              polyline.openPopup();
            });
            mapInstance.current.fitBounds(shapeLayer.current.getBounds());
          });
          mostrarAviso("Conexiones encontradas");
        })
        .catch((error) => {
          console.error("Error al buscar conexiones:", error);
          mostrarAviso("Error al buscar conexiones");
        });
    }

    // Para cargar las paradas al cargar la página
    fetch(`${API_BASE}/empresas`)
      .then((res) => res.json())
      .then((data) => {
        setEmpresas(data); // 👉 guardamos en el estado
      })
      .catch((err) => {
        console.error("Error al cargar empresas:", err);
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

    shapes.forEach((shape) => {
      const latlngs = shape.getLatLngs();
      if (!latlngs || latlngs.length < 2) return;
      const inicio = latlngs[0];
      const fin = latlngs[latlngs.length - 1];
      if (inicio.lat === fin.lat && inicio.lng === fin.lng) {
        // Shape cerrado: 1 GX y 2 GZInt
        puntosCrudos.push({ ...inicio, tipo: "GX" });
        const idx1 = Math.floor(latlngs.length / 3);
        const idx2 = Math.floor((2 * latlngs.length) / 3);
        puntosCrudos.push({ ...latlngs[idx1], tipo: "GZInt" });
        puntosCrudos.push({ ...latlngs[idx2], tipo: "GZInt" });
      } else {
        // Shape abierto: GX y GY
        puntosCrudos.push({ ...inicio, tipo: "GX" });
        puntosCrudos.push({ ...fin, tipo: "GY" });
      }
    });

    // Agrupar puntos cercanos (<distanciaUnificacion m) y fusionarlos en el punto medio (GGX)
    const puntosAgrupados = agruparCercanos(puntosCrudos, distanciaUnificacion);

    // Dibujar puntos de control en el mapa con radio configurable
    puntosAgrupados.forEach((p, i) => {
      // Círculo de geocerca
      L.circle([p.lat, p.lng], {
        radius: geocercaRadio,
        color: "green",
        fillColor: "#00ff00",
        fillOpacity: 0.3,
      })
        .addTo(window.puntosDeControlLayer)
        .bindPopup(`Punto de Control #${i + 1}`);
      // Marcador tipo Leaflet pero verde vibrante
      const greenIcon = new L.Icon({
        iconUrl:
          "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
        shadowUrl: shadowIcon,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });
      L.marker([p.lat, p.lng], { icon: greenIcon }).addTo(
        window.puntosDeControlLayer
      );
    });

    mostrarAviso(
      `Se generaron ${puntosAgrupados.length} puntos de control para la empresa seleccionada`,
      "success"
    );
  };

  return (
    <div className="container" style={{ border: "2px solid blue" }}>
      <div className="mobile-tabs">
        <div className="mobile-tab active" data-tab="info">
          Información
        </div>
        <div className="mobile-tab" data-tab="map">
          Mapa
        </div>
      </div>
      <div className="content">
        {/* Sidebar principal para selectores y botones */}
        <div className="sidebar" style={{ border: "2px solid blue" }}>
          <div className="selector">
            <label htmlFor="empresa-select">Seleccione una empresa:</label>
            <select
              id="empresa-select"
              value={empresaId}
              onChange={(e) => {
                setEmpresaId(e.target.value);
                setMostrarSidebarDerecho(false); // Ocultar sidebar derecho al cambiar empresa
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
            <div style={{ marginTop: "8px" }}>
              <label htmlFor="auto-iterar" style={{ marginLeft: "6px" }}>
                Iterar automáticamente
              </label>
              <input
                type="checkbox"
                name="auto-iterar"
                title ="Iterar automáticamente"
                id="auto-iterar"
                checked={autoIterar}
                onChange={(e) => setAutoIterar(e.target.checked)}
              />
            </div>
          </div>
          <div className="fecha-selector">
            <label htmlFor="fecha">Seleccione una fecha:</label>
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
            <button
              onClick={() => {
                verificarSeleccion();
                // setMostrarSidebarDerecho(true); // Mostrar el sidebar derecho al calcular servicios
              }}
              style={{ width: "100%" }}
            >
              Calcular servicios
            </button>
          </div>

          {/* Control deslizante para parámetros de puntos de control */}
          <div
            style={{
              margin: "20px 0",
              padding: "10px",
              border: "1px solid #aaa",
              borderRadius: "8px",
              background: "#f8f8f8",
            }}
          >
            <label htmlFor="slider-radio">
              <b>Radio de geocerca:</b> {geocercaRadio} m
            </label>
            <input
              id="slider-radio"
              type="range"
              min="10"
              max="200"
              step="5"
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
              step="5"
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
                onClick={() => setMostrarSidebarDerecho(false)}
                title="Cerrar"
              >
                ×
              </button>
              <div style={{ padding: 16, width: "100%" }}>
                {infoServicios ? (
                  <div>
                    <h2 style={{fontSize:22, marginBottom:8}}>Resumen de Servicios</h2>
                    <div><b>Empresa:</b> {infoServicios.empresaNombre}</div>
                    <div><b>Fecha:</b> {infoServicios.fecha}</div>
                    <div style={{marginTop:8}}><b>{infoServicios.mensaje}</b></div>
                    <hr style={{margin: '10px 0'}}/>
                    <div><b>Rutas asignadas:</b> {infoServicios.rutas_asignadas}</div>
                    <div><b>Shapes cargados:</b> {infoServicios.shapes_cargados}</div>
                    <div><b>Buses detectados:</b> {infoServicios.buses_detectados}</div>
                    <div><b>Servicios detectados:</b></div>
                    <ul style={{marginLeft:18}}>
                      <li><b>Directos:</b> {infoServicios.servicios_detectados?.directos}</li>
                      <li><b>Circulares:</b> {infoServicios.servicios_detectados?.circulares}</li>
                      <li><b>Total:</b> {infoServicios.servicios_detectados?.total}</li>
                    </ul>
                    <div><b>Puntos de control:</b></div>
                    <ul style={{marginLeft:18}}>
                      <li><b>Total:</b> {infoServicios.puntos_control?.total}</li>
                      <li><b>Terminales:</b> {infoServicios.puntos_control?.terminales}</li>
                      <li><b>Intermedios:</b> {infoServicios.puntos_control?.intermedios}</li>
                    </ul>
                    <div style={{marginTop:8}}>
                      <b>Detalle de puntos de control:</b>
                      <pre style={{fontSize:14, background:'#f4f4f4', padding:8, borderRadius:4, maxHeight:120, overflowY:'auto'}}>
                        {JSON.stringify(infoServicios.puntos_control?.detalle, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div style={{textAlign:'center', color:'#888'}}>No hay datos para mostrar.</div>
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
    </div>
  );
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
