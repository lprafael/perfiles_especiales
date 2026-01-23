import L from 'leaflet';
import MiPaginaExistente from './componentes_actualizado';


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
function calcularPuntosDeControl() {
  const shapes = MiPaginaExistente.shapeLayer.current?.getLayers() || [];

  if (!shapes.length) {
    alert("No hay shapes cargados.");
    return;
  }

  const puntosCrudos = [];

  shapes.forEach((shape) => {
    const latlngs = shape.getLatLngs();
    if (!latlngs || latlngs.length < 2) return;

    const inicio = latlngs[0];
    const fin = latlngs[latlngs.length - 1];

    if (inicio.lat === fin.lat && inicio.lng === fin.lng) {
      // Shape cerrado
      puntosCrudos.push({ ...inicio, tipo: "GX" });
      const idx1 = Math.floor(latlngs.length / 3);
      const idx2 = Math.floor((2 * latlngs.length) / 3);
      puntosCrudos.push({ ...latlngs[idx1], tipo: "GZInt" });
      puntosCrudos.push({ ...latlngs[idx2], tipo: "GZInt" });
    } else {
      puntosCrudos.push({ ...inicio, tipo: "GX" });
      puntosCrudos.push({ ...fin, tipo: "GY" });
    }
  });

  // Agrupar puntos cercanos (<100m) y fusionarlos
  const puntosAgrupados = agruparCercanos(puntosCrudos, 100);

  // Mostrar en el mapa
  puntosAgrupados.forEach((p, i) => {
    const marker = L.circle([p.lat, p.lng], {
      radius: 50,
      color: "green",
      fillColor: "#00ff00",
      fillOpacity: 0.3,
    })
      .addTo(MiPaginaExistente.mapInstance.current)
      .bindPopup(`Punto de Control #${i + 1}`);
  });

  MiPaginaExistente.mostrarAviso(`Se generaron ${puntosAgrupados.length} puntos de control`, "success");
}

export {calcularPuntosDeControl, distanciaEnMetros, agruparCercanos };