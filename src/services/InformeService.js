// src/services/InformeService.js

import apiFetch, { withQuery } from './apiClient';

const BASE = '/informes';

/* ───────────────── Helpers: API base consistente con apiClient ───────────────── */

const normalizeBase = (url) => (url || '').trim().replace(/\/+$/, '');
const normalizePrefix = (p) => {
  if (p == null) return '/api';
  const s = String(p).trim();
  if (s === '') return ''; // permite sin prefijo si lo desean
  const withSlash = s.startsWith('/') ? s : `/${s}`;
  return withSlash.replace(/\/+$/, '');
};

/**
 * Replica la lógica de apiClient:
 * 1) VITE_API_URL (absoluta o relativa) manda
 * 2) si no, VITE_API_BASE + VITE_API_PREFIX
 * 3) fallback final: "/api" (same-origin)
 */
const getApiBaseUrl = () => {
  const RAW_API_URL = (import.meta.env.VITE_API_URL || '').trim();
  const API_BASE_ENV = (import.meta.env.VITE_API_BASE || '').trim();
  const API_PREFIX_ENV = normalizePrefix(import.meta.env.VITE_API_PREFIX || '/api');

  const base =
    normalizeBase(RAW_API_URL) ||
    (API_BASE_ENV ? `${normalizeBase(API_BASE_ENV)}${API_PREFIX_ENV}` : API_PREFIX_ENV);

  return normalizeBase(base);
};

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
 * - Usa la misma base que apiClient (sin duplicar /api).
 */
export const descargarInformeExcel = (params = {}) => {
  const clean = sanitizeParams({ ...params, format: 'xlsx' });

  // withQuery devuelve un path relativo "/informes?...".
  const pathWithQs = withQuery(BASE, clean);

  const apiBase = getApiBaseUrl(); // puede ser "/api" o "https://api....../api"
  const url = `${apiBase}${pathWithQs.startsWith('/') ? '' : '/'}${pathWithQs}`;

  window.open(url, '_blank', 'noopener,noreferrer');
};

export default {
  obtenerInforme,
  descargarInformeExcel,
};
