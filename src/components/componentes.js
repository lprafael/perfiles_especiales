import React, { useEffect } from 'react';
import MapaCiudades from "./mapa";

function CabeceradePagina() {
  return (
    <header>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Sistema de Transporte Urbano - Gran Asunción</title>
    </header>
  );
}

function MiPaginaExistente() {  
  return (
    <body>
      
      <div class="container" style={{ border: '2px solid blue' }}>
        {/* Contenedor principal */}
        <header>
          <h1>
            Sistema de Transporte Urbano - Gran Asunción - Viceministerio de
            Transporte(MOPC)
          </h1>
        </header>
        <div class="mobile-tabs">
          <div class="mobile-tab active" data-tab="info">
            Información
          </div>
          <div class="mobile-tab" data-tab="map">
            Mapa
          </div>
        </div>
        <div class="content">
          <div class="sidebar" style={{ border: '2px solid blue' }}>
            <div class="selector">
              <label for="empresa-select">Seleccione una empresa:</label>
              <select id="empresa-select">
                <option value="">Cargando empresas...</option>
              </select>
            </div>
            <div class="search-box">
              <label for="search-line">Buscar por línea:</label>
              <input
                type="text"
                id="search-line"
                placeholder="Buscar por línea..."
              />
              <button class="search-button">🔍</button>
            </div>
            <div class="itinerarios">
              <h3>Itinerarios:</h3>
              <ul id="itinerarios-list">
                <li>
                  <em>Seleccione una empresa para ver sus itinerarios</em>
                </li>
              </ul>
            </div>
            <div class="list-container">
              <div class="list-header">Paradas</div>
              <div id="paradas-list">
                {/* <!-- Las paradas se cargarán dinámicamente --> */}
                <div class="loader" id="loader-paradas"></div>
              </div>
            </div>
          </div>
          <div class="main-content">
            <div class="map-container">
              <div id="map" style={{ border: '2px solid blue' }}>
                <MapaCiudades />
                {/* <!-- Aquí se cargará el mapa --> */}
              </div>
            </div>
            <div class="origin-destination" style={{ border: '2px solid blue' }}>
              <h3>Buscar Conexión</h3>
              <div class="origin-destination-inputs">
                <div class="input-group">
                  <label for="origen">Origen:</label>
                  <input
                    type="text"
                    id="origen"
                    placeholder="Ingrese punto de origen"
                  />
                </div>
                <div class="input-group">
                  <label for="destino">Destino:</label>
                  <input
                    type="text"
                    id="destino"
                    placeholder="Ingrese punto de destino"
                  />
                </div>
                <button class="search-route-btn">Buscar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
  );
}

function mostrarAviso(mensaje, tipo = "info") {
  const alerta = document.getElementById("alerta");
  alerta.textContent = mensaje;
  alerta.className = "alert " + tipo;
  alerta.style.display = "block";

  setTimeout(() => {
    alerta.style.display = "none";
  }, 5000); // se oculta luego de 3 segundos
}

export { mostrarAviso };
export { CabeceradePagina };
export default MiPaginaExistente;
