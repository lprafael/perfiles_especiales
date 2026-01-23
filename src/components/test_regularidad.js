// Script de test para comparar el cálculo de regularidad con los datos de ejemplo
import fs from 'fs';
const datos = JSON.parse(fs.readFileSync('./src/components/debug_regularidad.json', 'utf8'));

function calcularRegularidad(data) {
  // --- Copia del cálculo frontend ---
  var horasSet = new Set();
  if (data.servicios_dia) data.servicios_dia.forEach(function(d) { horasSet.add(d.hora); });
  if (data.promedio_horas) data.promedio_horas.forEach(function(d) { horasSet.add(d.hora); });
  var horas = Array.from(horasSet).sort(function(a, b) { return a - b; });
  var serviciosPorHora = horas.map(function(h) {
    var found = (data.servicios_dia || []).find(function(d) { return d.hora === h; });
    return found ? found.servicios : 0;
  });
  var promedioPorHora = horas.map(function(h) {
    var found = (data.promedio_horas || []).find(function(d) { return d.hora === h; });
    return found ? found.promedio : 0;
  });
  // Solo considerar horas donde el promedio histórico es mayor a 0
  var horasValidas = horas.filter(function(h, i) { return promedioPorHora[i] > 0; });
  var serviciosValidos = horasValidas.map(function(h) {
    var found = (data.servicios_dia || []).find(function(d) { return d.hora === h; });
    return found ? found.servicios : 0;
  });
  var promediosValidos = horasValidas.map(function(h) {
    var found = (data.promedio_horas || []).find(function(d) { return d.hora === h; });
    return found ? found.promedio : 0;
  });
  var menos = 0, mas = 0, iguales = 0;
  var regularidades = [];
  for (var i = 0; i < horasValidas.length; i++) {
    if (serviciosValidos[i] < promediosValidos[i]) menos++;
    else if (serviciosValidos[i] > promediosValidos[i]) mas++;
    else iguales++;
    var base = promediosValidos[i];
    var actual = serviciosValidos[i];
    var reg = base > 0 ? (actual / base) * 100 : (actual === 0 ? 100 : 0);
    regularidades.push(reg);
  }
  var total = horasValidas.length || 1;
  var pctMenos = Math.round((menos/total)*100);
  var pctMas = Math.round((mas/total)*100);
  var promedioRegularidad = regularidades.length > 0 ? (regularidades.reduce((a,b)=>a+b,0)/regularidades.length) : 100;
  return { pctMenos, pctMas, promedioRegularidad: Number(promedioRegularidad.toFixed(1)) };
}

console.log('Ejemplo 1:', calcularRegularidad(datos.ejemplo1));
console.log('Ejemplo 2:', calcularRegularidad(datos.ejemplo2));
