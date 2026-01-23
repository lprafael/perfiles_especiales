import { useEffect, useRef } from "react";
import L from "leaflet";

function BusesLayer({ mapInstance, buses, busesSeleccionados, geocercaBuffer, greenIcon, redIcon }) {
  const layerRef = useRef(null);

  useEffect(() => {
    if (!mapInstance?.current) return;
    // Limpiar capa previa
    if (layerRef.current) {
      mapInstance.current.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!buses || buses.length === 0) return;
    // Crear nueva capa
    const group = L.layerGroup();
    // Función para saber si un punto está dentro del buffer
    function estaEnBuffer(lat, lng) {
      if (!window.turf || !geocercaBuffer) return false;
      const pt = { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] } };
      let dentro = false;
      try {
        dentro = window.turf.booleanPointInPolygon(pt, geocercaBuffer);
      } catch (e) {
        dentro = false;
      }
      return dentro;
    }
    // Pintar buses
    buses.forEach(bus => {
      const lat = parseFloat(bus.latitud || bus.latitude);
      const lng = parseFloat(bus.longitud || bus.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      if (busesSeleccionados && busesSeleccionados.length > 0 && !busesSeleccionados.includes(bus.mean_id)) return;
      const inside = estaEnBuffer(lat, lng);
      const icon = inside ? greenIcon : redIcon;
      L.marker([lat, lng], { icon })
        .addTo(group)
        .bindPopup(`Bus: ${bus.mean_id || ""}<br>Fecha: ${bus.fecha_hora || ""}`);
    });
    group.addTo(mapInstance.current);
    layerRef.current = group;
    return () => {
      if (layerRef.current && mapInstance.current) {
        mapInstance.current.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [mapInstance, buses, busesSeleccionados, geocercaBuffer, greenIcon, redIcon]);

  return null;
}

export default BusesLayer;
