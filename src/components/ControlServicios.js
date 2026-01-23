import L from "leaflet";

/**
 * Sistema de Control de Servicios de Transporte
 * Implementa la lógica para detectar y analizar servicios de buses
 * en itinerarios lineales y circulares
 */

// ===== ESTRUCTURAS DE DATOS =====

export class Empresa {
  constructor(id, nombre) {
    this.id = id;
    this.nombre = nombre;
    this.buses = new Map(); // Map<string, Bus>
    this.itinerarios = new Map(); // Map<string, Itinerario>
  }
}

export class Bus {
  constructor(id, numero, empresaId) {
    this.id = id;
    this.numero = numero;
    this.empresaId = empresaId;
    this.servicios = []; // Array<Servicio>
    this.ubicacionActual = null;
    this.estadoActual = "INACTIVO"; // INACTIVO, EN_SERVICIO, EN_TERMINAL
  }
}

export class Itinerario {
  constructor(id, nombre, empresaId, tipo = "LINEAL") {
    this.id = id;
    this.nombre = nombre;
    this.empresaId = empresaId;
    this.tipo = tipo; // "LINEAL" | "CIRCULAR"
    this.puntos = []; // Array<Punto>
    this.terminalOrigen = null;
    this.terminalDestino = null;
    this.distanciaTotal = 0;
    this.tiempoEstimado = 0;
    this.shapeLines = []; // Geometría del recorrido
  }
}

export class Servicio {
  constructor(id, busId, itinerarioId) {
    this.id = id;
    this.busId = busId;
    this.itinerarioId = itinerarioId;
    this.horaInicio = null;
    this.horaFin = null;
    this.tipoServicio = null; // "IDA" | "VUELTA" | "CIRCULAR_COMPLETO"
    this.puntosRecorridos = []; // Array<PuntoRecorrido>
    this.kilometrajeInicial = 0;
    this.kilometrajeFinal = 0;
    this.estado = "EN_CURSO"; // "COMPLETADO" | "EN_CURSO" | "CANCELADO"
    this.observaciones = "";
  }

  // Calcular duración del servicio
  getDuracion() {
    if (!this.horaInicio || !this.horaFin) return 0;
    return (this.horaFin.getTime() - this.horaInicio.getTime()) / (1000 * 60); // minutos
  }

  // Calcular velocidad promedio
  getVelocidadPromedio() {
    const duracion = this.getDuracion();
    if (duracion === 0) return 0;
    const distancia = this.kilometrajeFinal - this.kilometrajeInicial;
    return (distancia / duracion) * 60; // km/h
  }
}

export class PuntoRecorrido {
  constructor(puntoId, horaPaso, ordenSecuencia) {
    this.puntoId = puntoId;
    this.horaPaso = horaPaso;
    this.ordenSecuencia = ordenSecuencia;
    this.tipoPaso = "INTERMEDIO"; // "INICIO" | "INTERMEDIO" | "FIN" | "TERMINAL_SALIDA" | "TERMINAL_LLEGADA"
    this.coordenadas = null;
  }
}

// ===== CONFIGURACIÓN Y CONSTANTES =====

export const CONFIG_SERVICIOS = {
  // Tolerancias de proximidad
  RADIO_PROXIMIDAD_PUNTO: 100, // metros
  RADIO_PROXIMIDAD_TERMINAL: 150, // metros
  
  // Filtros de tiempo
  TIEMPO_MINIMO_PERMANENCIA: 30, // segundos
  TIEMPO_MAXIMO_ENTRE_PUNTOS: 3600, // segundos (1 hora)
  
  // Filtros de velocidad
  VELOCIDAD_MAXIMA: 80, // km/h
  VELOCIDAD_MINIMA: 1, // km/h
  
  // Validaciones de servicio
  PORCENTAJE_MINIMO_COMPLETITUD: 70, // % de puntos del itinerario visitados
  DISTANCIA_MINIMA_SERVICIO: 500, // metros
  
  // Procesamiento
  INTERVALO_PROCESAMIENTO: 30000, // ms (30 segundos)
  BATCH_SIZE: 100 // registros por lote
};

// ===== DETECTOR DE SERVICIOS =====

export class DetectorServicios {
  constructor() {
    this.empresas = new Map();
    this.serviciosActivos = new Map(); // Map<busId, Servicio>
    this.ultimosPuntos = new Map(); // Map<busId, Array<PuntoGPS>>
    this.alertas = [];
  }

  // Registrar empresa
  registrarEmpresa(empresa) {
    this.empresas.set(empresa.id, empresa);
  }

  // Procesar evento GPS de un bus
  procesarEventoGPS(busId, lat, lng, timestamp, velocidad = 0) {
    try {
      const bus = this.encontrarBus(busId);
      if (!bus) {
        console.warn(`Bus ${busId} no encontrado`);
        return;
      }

      // Validar datos GPS
      if (!this.validarEventoGPS(lat, lng, timestamp, velocidad)) {
        return;
      }

      // Actualizar historial de puntos del bus
      this.actualizarHistorialPuntos(busId, { lat, lng, timestamp, velocidad });

      // Buscar punto cercano en itinerarios
      const puntoDetectado = this.detectarPuntoCercano(bus.empresaId, lat, lng);
      
      if (puntoDetectado) {
        this.procesarPuntoDetectado(bus, puntoDetectado, timestamp);
      }

      // Actualizar ubicación actual del bus
      bus.ubicacionActual = { lat, lng, timestamp };

    } catch (error) {
      console.error(`Error procesando evento GPS para bus ${busId}:`, error);
    }
  }

  // Validar evento GPS
  validarEventoGPS(lat, lng, timestamp, velocidad) {
    // Validar coordenadas
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return false;
    }

    // Validar timestamp
    const now = new Date();
    const eventTime = new Date(timestamp);
    if (eventTime > now || eventTime < new Date(now.getTime() - 24 * 60 * 60 * 1000)) {
      return false;
    }

    // Validar velocidad
    if (velocidad > CONFIG_SERVICIOS.VELOCIDAD_MAXIMA) {
      return false;
    }

    return true;
  }

  // Actualizar historial de puntos del bus
  actualizarHistorialPuntos(busId, punto) {
    if (!this.ultimosPuntos.has(busId)) {
      this.ultimosPuntos.set(busId, []);
    }

    const historial = this.ultimosPuntos.get(busId);
    historial.push(punto);

    // Mantener solo los últimos 50 puntos
    if (historial.length > 50) {
      historial.shift();
    }

    // Filtrar puntos muy cercanos en tiempo
    this.filtrarPuntosRedundantes(busId);
  }

  // Filtrar puntos redundantes por proximidad temporal
  filtrarPuntosRedundantes(busId) {
    const historial = this.ultimosPuntos.get(busId);
    if (historial.length < 2) return;

    const filtrado = [historial[0]];
    
    for (let i = 1; i < historial.length; i++) {
      const anterior = filtrado[filtrado.length - 1];
      const actual = historial[i];
      
      const tiempoDiff = (actual.timestamp - anterior.timestamp) / 1000; // segundos
      
      if (tiempoDiff >= CONFIG_SERVICIOS.TIEMPO_MINIMO_PERMANENCIA) {
        filtrado.push(actual);
      }
    }

    this.ultimosPuntos.set(busId, filtrado);
  }

  // Detectar punto cercano en itinerarios
  detectarPuntoCercano(empresaId, lat, lng) {
    const empresa = this.empresas.get(empresaId);
    if (!empresa) return null;

    let puntoMasCercano = null;
    let distanciaMinima = CONFIG_SERVICIOS.RADIO_PROXIMIDAD_PUNTO;

    for (const itinerario of empresa.itinerarios.values()) {
      for (let i = 0; i < itinerario.puntos.length; i++) {
        const punto = itinerario.puntos[i];
        const distancia = this.calcularDistancia(lat, lng, punto.lat, punto.lng);
        
        if (distancia < distanciaMinima) {
          distanciaMinima = distancia;
          puntoMasCercano = {
            itinerarioId: itinerario.id,
            puntoIndex: i,
            punto: punto,
            distancia: distancia,
            esInicio: i === 0,
            esFin: i === itinerario.puntos.length - 1,
            esTerminal: punto.esTerminal || false
          };
        }
      }
    }

    return puntoMasCercano;
  }

  // Procesar punto detectado
  procesarPuntoDetectado(bus, puntoDetectado, timestamp) {
    const servicioActivo = this.serviciosActivos.get(bus.id);
    const itinerario = this.empresas.get(bus.empresaId).itinerarios.get(puntoDetectado.itinerarioId);

    if (!servicioActivo) {
      // No hay servicio activo, verificar si debe iniciar uno nuevo
      if (this.debeIniciarServicio(puntoDetectado, itinerario)) {
        this.iniciarNuevoServicio(bus, puntoDetectado, timestamp);
      }
    } else {
      // Hay servicio activo, agregar punto al recorrido
      this.agregarPuntoAServicio(servicioActivo, puntoDetectado, timestamp);
      
      // Verificar si debe finalizar el servicio
      if (this.debeFinalizarServicio(servicioActivo, puntoDetectado, itinerario)) {
        this.finalizarServicio(servicioActivo, timestamp);
      }
    }
  }

  // Determinar si debe iniciar un nuevo servicio
  debeIniciarServicio(puntoDetectado, itinerario) {
    // Para itinerarios lineales: iniciar en punto de inicio o terminal origen
    if (itinerario.tipo === "LINEAL") {
      return puntoDetectado.esInicio || puntoDetectado.esTerminal;
    }
    
    // Para itinerarios circulares: puede iniciar en cualquier punto principal
    if (itinerario.tipo === "CIRCULAR") {
      return true; // En circulares, cualquier punto puede ser inicio
    }

    return false;
  }

  // Iniciar nuevo servicio
  iniciarNuevoServicio(bus, puntoDetectado, timestamp) {
    const servicioId = `${bus.id}_${Date.now()}`;
    const servicio = new Servicio(servicioId, bus.id, puntoDetectado.itinerarioId);
    
    servicio.horaInicio = new Date(timestamp);
    servicio.tipoServicio = this.determinarTipoServicio(puntoDetectado);
    
    // Agregar primer punto
    const primerPunto = new PuntoRecorrido(
      puntoDetectado.punto.id || `punto_${puntoDetectado.puntoIndex}`,
      new Date(timestamp),
      0
    );
    primerPunto.tipoPaso = "INICIO";
    primerPunto.coordenadas = puntoDetectado.punto;
    
    servicio.puntosRecorridos.push(primerPunto);
    
    // Registrar servicio activo
    this.serviciosActivos.set(bus.id, servicio);
    bus.estadoActual = "EN_SERVICIO";
    
    console.log(`Servicio iniciado: Bus ${bus.numero}, Itinerario ${puntoDetectado.itinerarioId}`);
  }

  // Determinar tipo de servicio
  determinarTipoServicio(puntoDetectado) {
    const itinerario = this.empresas.get(puntoDetectado.itinerarioId.split('_')[0]).itinerarios.get(puntoDetectado.itinerarioId);
    
    if (itinerario.tipo === "CIRCULAR") {
      return "CIRCULAR_COMPLETO";
    }
    
    // Para lineales, determinar si es IDA o VUELTA basado en el punto de inicio
    if (puntoDetectado.esInicio) {
      return "IDA";
    } else {
      return "VUELTA";
    }
  }

  // Agregar punto a servicio activo
  agregarPuntoAServicio(servicio, puntoDetectado, timestamp) {
    const ultimoPunto = servicio.puntosRecorridos[servicio.puntosRecorridos.length - 1];
    
    // Evitar puntos duplicados muy cercanos en tiempo
    if (ultimoPunto && (timestamp - ultimoPunto.horaPaso.getTime()) < CONFIG_SERVICIOS.TIEMPO_MINIMO_PERMANENCIA * 1000) {
      return;
    }

    const nuevoPunto = new PuntoRecorrido(
      puntoDetectado.punto.id || `punto_${puntoDetectado.puntoIndex}`,
      new Date(timestamp),
      servicio.puntosRecorridos.length
    );
    nuevoPunto.coordenadas = puntoDetectado.punto;
    
    // Determinar tipo de paso
    if (puntoDetectado.esFin || puntoDetectado.esTerminal) {
      nuevoPunto.tipoPaso = "FIN";
    } else if (puntoDetectado.esTerminal) {
      nuevoPunto.tipoPaso = "TERMINAL_LLEGADA";
    }
    
    servicio.puntosRecorridos.push(nuevoPunto);
  }

  // Determinar si debe finalizar servicio
  debeFinalizarServicio(servicio, puntoDetectado, itinerario) {
    // Para itinerarios lineales: finalizar en punto final o terminal destino
    if (itinerario.tipo === "LINEAL") {
      return puntoDetectado.esFin || (puntoDetectado.esTerminal && servicio.puntosRecorridos.length > 3);
    }
    
    // Para itinerarios circulares: finalizar cuando vuelve al punto de inicio
    if (itinerario.tipo === "CIRCULAR") {
      const primerPunto = servicio.puntosRecorridos[0];
      const distanciaAlInicio = this.calcularDistancia(
        puntoDetectado.punto.lat, puntoDetectado.punto.lng,
        primerPunto.coordenadas.lat, primerPunto.coordenadas.lng
      );
      
      return distanciaAlInicio < CONFIG_SERVICIOS.RADIO_PROXIMIDAD_PUNTO && 
             servicio.puntosRecorridos.length > 5; // Mínimo 5 puntos para considerar circular completo
    }

    return false;
  }

  // Finalizar servicio
  finalizarServicio(servicio, timestamp) {
    servicio.horaFin = new Date(timestamp);
    servicio.estado = "COMPLETADO";
    
    // Calcular métricas del servicio
    this.calcularMetricasServicio(servicio);
    
    // Agregar servicio al historial del bus
    const bus = this.encontrarBus(servicio.busId);
    if (bus) {
      bus.servicios.push(servicio);
      bus.estadoActual = "INACTIVO";
    }
    
    // Remover de servicios activos
    this.serviciosActivos.delete(servicio.busId);
    
    console.log(`Servicio finalizado: ${servicio.id}, Duración: ${servicio.getDuracion()} min`);
  }

  // Calcular métricas del servicio
  calcularMetricasServicio(servicio) {
    if (servicio.puntosRecorridos.length < 2) return;

    let distanciaTotal = 0;
    
    for (let i = 1; i < servicio.puntosRecorridos.length; i++) {
      const anterior = servicio.puntosRecorridos[i - 1];
      const actual = servicio.puntosRecorridos[i];
      
      const distancia = this.calcularDistancia(
        anterior.coordenadas.lat, anterior.coordenadas.lng,
        actual.coordenadas.lat, actual.coordenadas.lng
      );
      
      distanciaTotal += distancia;
    }
    
    servicio.kilometrajeFinal = servicio.kilometrajeInicial + (distanciaTotal / 1000);
  }

  // Encontrar bus por ID
  encontrarBus(busId) {
    for (const empresa of this.empresas.values()) {
      if (empresa.buses.has(busId)) {
        return empresa.buses.get(busId);
      }
    }
    return null;
  }

  // Calcular distancia entre dos puntos (Haversine)
  calcularDistancia(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Radio de la Tierra en metros
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + 
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ===== MÉTODOS DE ANÁLISIS Y REPORTES =====

  // Obtener servicios por empresa y fecha
  obtenerServiciosPorEmpresa(empresaId, fecha) {
    const empresa = this.empresas.get(empresaId);
    if (!empresa) return [];

    const servicios = [];
    const fechaInicio = new Date(fecha);
    const fechaFin = new Date(fecha);
    fechaFin.setDate(fechaFin.getDate() + 1);

    for (const bus of empresa.buses.values()) {
      for (const servicio of bus.servicios) {
        if (servicio.horaInicio >= fechaInicio && servicio.horaInicio < fechaFin) {
          servicios.push({
            ...servicio,
            busNumero: bus.numero,
            itinerarioNombre: empresa.itinerarios.get(servicio.itinerarioId)?.nombre || 'Desconocido'
          });
        }
      }
    }

    return servicios.sort((a, b) => a.horaInicio - b.horaInicio);
  }

  // Calcular métricas por itinerario
  calcularMetricasPorItinerario(empresaId, fecha) {
    const servicios = this.obtenerServiciosPorEmpresa(empresaId, fecha);
    const metricas = new Map();

    servicios.forEach(servicio => {
      if (!metricas.has(servicio.itinerarioId)) {
        metricas.set(servicio.itinerarioId, {
          itinerarioId: servicio.itinerarioId,
          nombre: servicio.itinerarioNombre,
          totalServicios: 0,
          serviciosCompletados: 0,
          tiempoPromedio: 0,
          velocidadPromedio: 0,
          puntualidad: 0
        });
      }

      const metrica = metricas.get(servicio.itinerarioId);
      metrica.totalServicios++;
      
      if (servicio.estado === "COMPLETADO") {
        metrica.serviciosCompletados++;
        metrica.tiempoPromedio += servicio.getDuracion();
        metrica.velocidadPromedio += servicio.getVelocidadPromedio();
      }
    });

    // Calcular promedios
    for (const metrica of metricas.values()) {
      if (metrica.serviciosCompletados > 0) {
        metrica.tiempoPromedio /= metrica.serviciosCompletados;
        metrica.velocidadPromedio /= metrica.serviciosCompletados;
        metrica.puntualidad = (metrica.serviciosCompletados / metrica.totalServicios) * 100;
      }
    }

    return Array.from(metricas.values());
  }

  // Generar reporte diario
  generarReporteDiario(empresaId, fecha) {
    const empresa = this.empresas.get(empresaId);
    if (!empresa) return null;

    const servicios = this.obtenerServiciosPorEmpresa(empresaId, fecha);
    const metricasPorItinerario = this.calcularMetricasPorItinerario(empresaId, fecha);
    
    const busesActivos = new Set(servicios.map(s => s.busId)).size;
    const totalBuses = empresa.buses.size;
    const serviciosCompletados = servicios.filter(s => s.estado === "COMPLETADO").length;
    const puntualidadGeneral = servicios.length > 0 ? (serviciosCompletados / servicios.length) * 100 : 0;

    return {
      empresa: empresa.nombre,
      fecha: fecha,
      totalServicios: servicios.length,
      serviciosCompletados,
      busesActivos,
      totalBuses,
      puntualidadGeneral: Math.round(puntualidadGeneral * 100) / 100,
      metricasPorItinerario,
      serviciosDetalle: servicios
    };
  }
}

// ===== UTILIDADES =====

export function crearDetectorDesdeBackend(empresasData, itinerariosData, busesData) {
  const detector = new DetectorServicios();
  
  // Procesar empresas
  empresasData.forEach(empData => {
    const empresa = new Empresa(empData.id, empData.nombre);
    
    // Agregar itinerarios
    const itinerariosEmpresa = itinerariosData.filter(it => it.empresa_id === empData.id);
    itinerariosEmpresa.forEach(itData => {
      const itinerario = new Itinerario(itData.id, itData.nombre, empData.id, itData.tipo || "LINEAL");
      itinerario.shapeLines = itData.shape_lines || [];
      itinerario.puntos = itData.puntos || [];
      empresa.itinerarios.set(itinerario.id, itinerario);
    });
    
    // Agregar buses
    const busesEmpresa = busesData.filter(bus => bus.empresa_id === empData.id);
    busesEmpresa.forEach(busData => {
      const bus = new Bus(busData.id, busData.numero, empData.id);
      empresa.buses.set(bus.id, bus);
    });
    
    detector.registrarEmpresa(empresa);
  });
  
  return detector;
}

export default DetectorServicios;
