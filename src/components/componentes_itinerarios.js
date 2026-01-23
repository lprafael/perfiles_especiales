import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MiPaginaExistente from "./componentes_actualizado";

function MiPaginaExistente() {
  const mapRef = useRef(null);            // referencia para el contenedor
  const mapInstance = useRef(null);       // referencia para la instancia del mapa
  const shapeLayer = useRef(null);
  const paradasLayer = useRef(null);

  useEffect(() => {
    if (!mapInstance.current && mapRef.current) {
      mapInstance.current = L.map(mapRef.current).setView([-25.2944, -57.6324], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapInstance.current);

      // Marcar ciudades del AMA
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

      ciudades.forEach(ciudad => {
        L.marker([ciudad.lat, ciudad.lng])
          .addTo(mapInstance.current)
          .bindPopup(ciudad.nombre);
      });
    }

    function mostrarItinerarios(empresaId) {
      const lista = document.getElementById('itinerarios-list');
      lista.innerHTML = '<li><em>Cargando itinerarios...</em></li>';

      fetch(`http://192.168.100.191:3001/empresas/${empresaId}/itinerarios`)
        .then(res => res.json())
        .then(data => {
          lista.innerHTML = '';
          if (data.length === 0) {
            lista.innerHTML = '<li><em>Sin itinerarios disponibles</em></li>';
            return;
          }
          data.forEach(it => {
            const li = document.createElement('li');
            li.textContent = `Línea ${it.linea ?? 'N/D'} - Ramal ${it.ramal ?? ''}: ${it.origen ?? ''} → ${it.destino ?? ''}`;
            li.className = 'list-item';
            li.onclick = () => {
              document.querySelectorAll('#itinerarios-list .list-item').forEach(el => el.classList.remove('active'));
              li.classList.add('active');
              mostrarShape(it.ruta_hex);
              mostrarParadas(it.ruta_hex);
            };
            lista.appendChild(li);
          });
        })
        .catch(err => {
          console.error('Error al cargar itinerarios:', err);
          lista.innerHTML = '<li><em>Error al obtener itinerarios</em></li>';
        });
    }

    function mostrarShape(rutaHex) {
      fetch(`http://192.168.100.191:3001/itinerarios/${rutaHex}/shape`)
        .then(res => res.json())
        .then(shape => {
          if (shapeLayer.current) {
            mapInstance.current.removeLayer(shapeLayer.current);
          }
          shapeLayer.current = L.polyline(shape.map(p => [p.lat, p.lng]), {
            color: 'red'
          }).addTo(mapInstance.current);
          mapInstance.current.fitBounds(shapeLayer.current.getBounds());
        })
        .catch(err => {
          console.error('Error al cargar shape:', err);
        });
    }

    function mostrarParadas(rutaHex) {
      fetch(`http://192.168.100.191:3001/itinerarios/${rutaHex}/paradas`)
        .then(res => res.json())
        .then(paradas => {
          if (paradasLayer.current) {
            mapInstance.current.removeLayer(paradasLayer.current);
          }
          paradasLayer.current = L.layerGroup();
          paradas.forEach(p => {
            const marker = L.marker([p.lat, p.lng]).bindPopup(p.nombre);
            paradasLayer.current.addLayer(marker);
          });
          paradasLayer.current.addTo(mapInstance.current);
        })
        .catch(err => {
          console.error('Error al cargar paradas:', err);
        });
    }

    fetch('http://192.168.100.191:3001/empresas')
      .then(res => res.json())
      .then(data => {
        const select = document.getElementById('empresa-select');
        select.innerHTML = '<option value="">Seleccione una empresa</option>';
        data.forEach(empresa => {
          const option = document.createElement('option');
          option.value = empresa.id_eot_vmt_hex;
          option.textContent = empresa.eot_nombre;
          select.appendChild(option);
        });

        select.onchange = (e) => {
          if (e.target.value) {
            mostrarItinerarios(e.target.value);
          }
        };
      })
      .catch(err => {
        console.error('Error al cargar empresas:', err);
      });
  }, []);

  return (
    <div className="container" style={{ border: '2px solid blue' }}>
      <header>
        <h1>Sistema de Transporte Urbano - Gran Asunción - Viceministerio de Transporte (MOPC)</h1>
      </header>

      <div className="content">
        <div className="sidebar">
          <label htmlFor="empresa-select">Seleccione una empresa:</label>
          <select id="empresa-select">
            <option value="">Cargando empresas...</option>
          </select>

          <h3>Itinerarios:</h3>
          <ul id="itinerarios-list">
            <li><em>Seleccione una empresa para ver itinerarios</em></li>
          </ul>
        </div>

        <div className="main-content">
          <div ref={mapRef} id="map" style={{ height: '500px', border: '2px solid blue' }}></div>
        </div>
      </div>
    </div>
  );
}

export default MiPaginaExistente;
