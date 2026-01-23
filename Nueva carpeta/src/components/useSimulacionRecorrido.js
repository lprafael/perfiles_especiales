import { useEffect, useRef, useCallback } from "react";

/**
 * Hook para manejar la simulación de recorrido de buses.
 * Encapsula el avance automático, velocidad, timer y limpieza.
 * @param {object} simulacionEstado Estado de la simulación
 * @param {function} setSimulacionEstado Setter del estado de simulación
 */
export function useSimulacionRecorrido(simulacionEstado, setSimulacionEstado) {
  const simulacionTimer = useRef(null);

  // Avance automático tipo reproductor
  useEffect(() => {
    if (!simulacionEstado?.corriendo) return;
    if (simulacionTimer.current) {
      clearTimeout(simulacionTimer.current);
      simulacionTimer.current = null;
    }
    if (simulacionEstado.horaActual < simulacionEstado.maxTimestamp) {
      simulacionTimer.current = setTimeout(() => {
        setSimulacionEstado(s => {
          if (!s || !s.corriendo) return s;
          let nuevoTs = s.horaActual + 1;
          if (nuevoTs > s.maxTimestamp) {
            simulacionTimer.current = null;
            return { ...s, horaActual: s.maxTimestamp, horaActualStr: new Date(s.maxTimestamp*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}), corriendo: false };
          }
          return { ...s, horaActual: nuevoTs, horaActualStr: new Date(nuevoTs*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) };
        });
      }, simulacionEstado.velocidad);
    }
    return () => {
      if (simulacionTimer.current) {
        clearTimeout(simulacionTimer.current);
        simulacionTimer.current = null;
      }
    };
  }, [simulacionEstado?.corriendo, simulacionEstado?.velocidad, simulacionEstado?.horaActual, simulacionEstado?.maxTimestamp, setSimulacionEstado]);

  // Función para pausar la simulación
  const pausar = useCallback(() => {
    setSimulacionEstado(s => s ? { ...s, corriendo: false } : s);
  }, [setSimulacionEstado]);

  // Función para reanudar la simulación
  const reanudar = useCallback(() => {
    setSimulacionEstado(s => s ? { ...s, corriendo: true } : s);
  }, [setSimulacionEstado]);

  // Función para ir a un tiempo específico
  const irA = useCallback((nuevoTs) => {
    setSimulacionEstado(s => s ? {
      ...s,
      horaActual: nuevoTs,
      horaActualStr: new Date(nuevoTs*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}),
      corriendo: true
    } : s);
  }, [setSimulacionEstado]);

  // Función para cambiar velocidad
  const setVelocidad = useCallback((ms) => {
    setSimulacionEstado(s => s ? { ...s, velocidad: ms } : s);
  }, [setSimulacionEstado]);

  return { pausar, reanudar, irA, setVelocidad };
}
