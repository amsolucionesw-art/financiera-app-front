// src/services/InformeService.js

import apiFetch, { withQuery } from './apiClient';

const BASE = '/informes';

/** Limpia params: quita null/undefined/'' y normaliza booleanos */
const sanitizeParams = (params = {}) => {
  const clean = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined) return;

    // strings
    if (typeof v === 'string') {
      const s = v.trim();
      if (s !== '') clean[k] = s;
      return;
    }

    // arrays
    if (Array.isArray(v)) {
      if (v.length) clean[k] = v; // apiClient maneja arrays con append()
      return;
    }

    // booleanos: uniformamos a "true"/"false" para querystring
    if (typeof v === 'boolean') {
      clean[k] = v ? 'true' : 'false';
      return;
    }

    clean[k] = v; // números, objetos simples
  });
  return clean;
};

/**
 * GET /informes con filtros en querystring.
 * Ej:
 *   obtenerInforme({ tipo: 'clientes', desde: '2025-01-01', hasta: '2025-01-31', zonaId: 3 })
 */
export const obtenerInforme = (params = {}) =>
  apiFetch(BASE, { params: sanitizeParams(params) });

/**
 * Descarga directa de Excel desde el backend.
 * Arma querystring y abre ventana nueva → fuerza download.
 *
 * Importante:
 * - Usamos url absoluta construida por apiFetch internamente (porque BASE es relativa).
 * - Para download simple, construimos el path con query y se lo pasamos a apiFetch
 *   como URL absoluta utilizando VITE_API_URL desde apiClient (sin duplicar /api).
 */
export const descargarInformeExcel = (params = {}) => {
  const clean = sanitizeParams({ ...params, format: 'xlsx' });

  // withQuery devuelve un path relativo "/informes?...".
  const pathWithQs = withQuery(BASE, clean);

  // Abrimos contra la misma base que usa apiClient (VITE_API_URL).
  // Como apiClient.buildURL solo es interno, hacemos un truco seguro:
  // apiFetch acepta path absoluto, así que convertimos a absoluto manualmente.
  const RAW_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '');
  const url = `${RAW_BASE}${pathWithQs.startsWith('/') ? '' : '/'}${pathWithQs}`;

  window.open(url, '_blank', 'noopener,noreferrer');
};
