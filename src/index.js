import React from "react";
// import React, { Component } from "react";
import ReactDOM from "react-dom/client";
//import App from './App'; // Si tienes un componente App
import "./styles/estilos-globales.css"; // Importa tu archivo de estilos

import App from './App.jsx';

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);