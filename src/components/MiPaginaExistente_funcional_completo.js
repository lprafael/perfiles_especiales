import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

function MiPaginaExistente() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const shapeLayer = useRef(null);
  const paradasLayer = useRef(null);
  const [empresaId, setEmpresaId] = useState('');
  const origenRef = useRef(null);
  const destinoRef = useRef(null);

  useEffect(() => {
    if (!mapInstance.current && mapRef.current) {
      mapInstance.current = L.map(mapRef.current).setView([-25.2944, -57.6324], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapInstance.current);

      const ciudades = [
        { nombre: "Asunción", lat: -25.2944, lng: -57.6324 },
        { nombre: "Luque", lat: -25.2686, lng: -57.4906 },
        { nombre: "San Lorenzo", lat: -25.3386, lng: -57.5088 }
      ];
      ciudades.forEach(ciudad => {
        L.marker([ciudad.lat, ciudad.lng])
          .addTo(mapInstance.current)
          .bindPopup(ciudad.nombre);
      });

      mapInstance.current.on('click', e => {
        const { lat, lng } = e.latlng;
        if (!origenRef.current) {
          origenRef.current = { lat, lng };
          alert('Punto de origen seleccionado');
        } else if (!destinoRef.current) {
          destinoRef.current = { lat, lng };
          alert('Punto de destino seleccionado');
          buscarConexiones();
        } else {
          origenRef.current = { lat, lng };
          destinoRef.current = null;
          alert('Nuevo origen seleccionado. Seleccione un destino.');
        }
      });
    }

    function mostrarItinerarios(empresaId) {
      const lista = document.getElementById('itinerarios-list');
      lista.innerHTML = '<li><em>Cargando itinerarios...</em></li>';

      fetch(`http://localhost:3001/empresas/${empresaId}/itinerarios`)
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
        });
    }

    function mostrarShape(rutaHex) {
      fetch(`http://localhost:3001/itinerarios/${rutaHex}/shape`)
        .then(res => res.json())
        .then(shape => {
          if (shapeLayer.current) {
            mapInstance.current.removeLayer(shapeLayer.current);
          }
          shapeLayer.current = L.polyline(shape.map(p => [p.lat, p.lng]), {
            color: 'red'
          }).addTo(mapInstance.current);
          mapInstance.current.fitBounds(shapeLayer.current.getBounds());
        });
    }

    function mostrarParadas(rutaHex) {
      fetch(`http://localhost:3001/itinerarios/${rutaHex}/paradas`)
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
        });
    }

    function buscarConexiones() {
      if (!origenRef.current || !destinoRef.current || !empresaId) return;

      const { lat: lat1, lng: lng1 } = origenRef.current;
      const { lat: lat2, lng: lng2 } = destinoRef.current;

      fetch(`http://localhost:3001/paradas/cercanas?lat1=${lat1}&lng1=${lng1}&lat2=${lat2}&lng2=${lng2}&empresa=${empresaId}`)
        .then(res => res.json())
        .then(data => {
          if (data.origen && data.destino) {
            L.marker([data.origen.lat, data.origen.lng])
              .addTo(mapInstance.current)
              .bindPopup(`Origen más cercano: ${data.origen.nombre}`)
              .openPopup();

            L.marker([data.destino.lat, data.destino.lng])
              .addTo(mapInstance.current)
              .bindPopup(`Destino más cercano: ${data.destino.nombre}`)
              .openPopup();
          } else {
            alert('No se encontraron paradas cercanas en la misma empresa.');
          }
        });
    }

    fetch('http://localhost:3001/empresas')
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
          setEmpresaId(e.target.value);
          mostrarItinerarios(e.target.value);
        };
      });
  }, [empresaId]);

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

          <div>
            <label htmlFor="search-line">Buscar por línea:</label>
            <input
              type="text"
              id="search-line"
              placeholder="Buscar por número o ramal..."
              onInput={(e) => {
                const val = e.target.value.toLowerCase();
                const items = document.querySelectorAll('#itinerarios-list .list-item');
                items.forEach(item => {
                  item.style.display = item.textContent.toLowerCase().includes(val) ? '' : 'none';
                });
              }}
            />
          </div>

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
