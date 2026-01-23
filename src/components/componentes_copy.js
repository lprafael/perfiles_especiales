import React, { useEffect } from "react";
import L from "leaflet";

// function CabeceradePagina() {
//   return (
//     <header>
//       <meta charset="UTF-8" />
//       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//       <title>Sistema de Transporte Urbano - Gran Asunción</title>
//     </header>
//   );
// }

function MiPaginaExistente() {
  useEffect(() => {
    // Inicializar mapa
    const map = L.map("map").setView([-25.2944, -57.6324], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // Ciudades (referenciales)
    const ciudades = [
      { nombre: "Asunción", lat: -25.2944, lng: -57.6324 },
      { nombre: "Luque", lat: -25.2686, lng: -57.4906 },
      { nombre: "San Lorenzo", lat: -25.3386, lng: -57.5088 },
    ];
    ciudades.forEach((ciudad) => {
      L.marker([ciudad.lat, ciudad.lng]).addTo(map).bindPopup(ciudad.nombre);
    });

    // Capas dinámicas
    let shapeLayer = null;
    let paradasLayer = null;

    function mostrarItinerarios(empresaId) {
      const lista = document.getElementById("itinerarios-list");
      lista.innerHTML = "<li><em>Cargando itinerarios...</em></li>";
      fetch(`http://192.168.100.191:3001/empresas/${empresaId}/itinerarios`)
        .then((res) => res.json())
        .then((data) => {
          lista.innerHTML = "";
          if (data.length === 0) {
            lista.innerHTML = "<li><em>Sin itinerarios</em></li>";
            return;
          }
          data.forEach((it) => {
            const li = document.createElement("li");
            li.textContent = `Línea ${it.linea ?? "N/D"} - Ramal ${
              it.ramal ?? ""
            }: ${it.origen ?? ""} → ${it.destino ?? ""}`;
            li.className = "list-item";
            li.onclick = () => {
              document
                .querySelectorAll("#itinerarios-list .list-item")
                .forEach((el) => el.classList.remove("active"));
              li.classList.add("active");
              mostrarShape(it.ruta_hex);
              mostrarParadas(it.ruta_hex);
            };
            lista.appendChild(li);
          });
        });
    }

    function mostrarShape(rutaHex) {
      fetch(`http://192.168.100.191:3001/itinerarios/${rutaHex}/shape`)
        .then((res) => res.json())
        .then((shape) => {
          if (shapeLayer) map.removeLayer(shapeLayer);
          shapeLayer = L.polyline(
            shape.map((p) => [p.lat, p.lng]),
            { color: "red" }
          ).addTo(map);
          map.fitBounds(shapeLayer.getBounds());
        });
    }

    function mostrarParadas(rutaHex) {
      fetch(`http://192.168.100.191:3001/itinerarios/${rutaHex}/paradas`)
        .then((res) => res.json())
        .then((paradas) => {
          if (paradasLayer) map.removeLayer(paradasLayer);
          paradasLayer = L.layerGroup();
          paradas.forEach((p) => {
            const m = L.marker([p.lat, p.lng]).bindPopup(p.nombre);
            paradasLayer.addLayer(m);
          });
          paradasLayer.addTo(map);
        });
    }

    // Cargar empresas
    fetch("http://192.168.100.191:3001/empresas")
      .then((res) => res.json())
      .then((data) => {
        const select = document.getElementById("empresa-select");
        select.innerHTML = '<option value="">Seleccione una empresa</option>';
        data.forEach((empresa) => {
          const option = document.createElement("option");
          option.value = empresa.id_eot_vmt_hex;
          option.textContent = empresa.eot_nombre;
          select.appendChild(option);
        });
        select.onchange = (e) => {
          if (e.target.value) {
            mostrarItinerarios(e.target.value);
          }
        };
      });
  }, []);

  return (
    <div className="container" style={{ border: "2px solid blue" }}>
      <header>
        <h1>
          Sistema de Transporte Urbano - Gran Asunción - Viceministerio de
          Transporte (MOPC)
        </h1>
      </header>
      <div className="content">
        <div className="sidebar">
          <label htmlFor="empresa-select">Seleccione una empresa:</label>
          <select id="empresa-select">
            <option value="">Cargando empresas...</option>
          </select>
          <h3>Itinerarios:</h3>
          <ul id="itinerarios-list">
            <li>
              <em>Seleccione una empresa para ver itinerarios</em>
            </li>
          </ul>
        </div>
        <div className="main-content">
          <div
            id="map"
            style={{ height: "500px", border: "2px solid blue" }}
          ></div>
        </div>
      </div>
    </div>
  );
}

// export { CabeceradePagina };
export default MiPaginaExistente;
