import React from "react";
// import React, { Component } from "react";
import ReactDOM from "react-dom/client";
//import App from './App'; // Si tienes un componente App
import "./styles/estilos-globales.css"; // Importa tu archivo de estilos

// import MiPaginaExistente, {CabeceradePagina} from "./components/MiPaginaExistente_funcional_completo.js";
import MiPaginaExistente from "./components/componentes_actualizado.js";
//import Mapa from "./components/mapa.js"; // Importa el componente del mapa

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <MiPaginaExistente />
  </React.StrictMode>
);