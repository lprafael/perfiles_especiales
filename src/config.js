/**
 * URL base del backend.
 * - Local: por defecto http://127.0.0.1:8010
 * - Producción HTTPS (ej. sistemas.mopc.gov.py): OBLIGATORIO usar HTTPS para evitar Mixed Content.
 *   Ejemplo: REACT_APP_API_URL=https://sistemas.mopc.gov.py/api npm run build
 *   (El API debe estar expuesto por HTTPS en el mismo dominio o uno con certificado válido.)
 */
export const API_BASE = process.env.REACT_APP_API_URL || "http://127.0.0.1:8010";
