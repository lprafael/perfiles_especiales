import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerRetinaIcon from "leaflet/dist/images/marker-icon-2x.png";
import shadowIcon from "leaflet/dist/images/marker-shadow.png";
import MiPaginaExistente from "./componentes_actualizado";

function MapaCiudades() {
  const mapContainerRef = useRef(null);
  const [ciudades] = useState([
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
  ]);

  useEffect(() => {
    // Asegúrate de que el contenedor del mapa exista
    if (!mapContainerRef.current) return;

    // Inicializa el mapa solo si aún no está inicializado
    if (!mapContainerRef.current._leaflet_id) {
      const map = L.map(mapContainerRef.current).setView(
        [-25.2944, -57.6324],
        11
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Configura el icono por defecto de Leaflet
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: markerRetinaIcon,
        iconUrl: markerIcon,
        shadowUrl: shadowIcon,
      });

      // Marcadores de ciudades
      ciudades.forEach((ciudad) => {
        L.marker([ciudad.lat, ciudad.lng]).addTo(map).bindPopup(ciudad.nombre);
      });

      // Limpieza al desmontar el componente
      return () => {
        if (map) {
          map.remove();
        }
      };
    }
  }, [ciudades]);

  return (
    <div 
      ref={MiPaginaExistente.mapRef}
      id="map" 
      style={{width: '100%', height: '100%', border: '2px solid blue' }
    }>
      
    {/* <div
      id="map" // Puedes mantener el ID si lo necesitas para CSS externo
      ref={mapContainerRef}
      style={{ height: "100%", width: "100%" }}
    > */}

    </div>
  );
}

export default MapaCiudades;
