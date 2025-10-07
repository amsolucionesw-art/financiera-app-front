// src/services/InformeService.js

import apiFetch from './apiClient';

const API_PREFIX = import.meta.env.VITE_API_PREFIX || ''; // sin /api por defecto
const BASE = `${API_PREFIX}/informes`;

/** Limpia params: quita null/undefined/'' y deja números/arrays tal cual */
const sanitizeParams = (params = {}) => {
  const clean = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined) return;

    if (typeof v === 'string') {
      const s = v.trim();
      if (s !== '') clean[k] = s;
      return;
    }

    if (Array.isArray(v)) {
      if (v.length) clean[k] = v; // apiClient maneja arrays con append()
      return;
    }

    clean[k] = v; // números, booleanos, objetos simples
  });
  return clean;
};

/**
 * GET /informes con filtros en querystring.
 * Ej:
 *   obtenerInforme({ tipo: 'clientes', desde: '2025-01-01', hasta: '2025-01-31', zonaId: 3 })
 *
 * Por defecto devuelve JSON → { success, data }
 * Si se pasa { format: 'xlsx' } el backend devuelve un archivo Excel (.xlsx).
 * En ese caso apiFetch devolverá el Blob y deberás manejar la descarga manualmente,
 * o bien usar `descargarInformeExcel` que ya lo hace automáticamente.
 */
export const obtenerInforme = (params = {}) =>
  apiFetch(BASE, { params: sanitizeParams(params) });

/**
 * Descarga directa de Excel desde el backend.
 * Arma querystring y abre ventana nueva → fuerza download.
 * Útil si no querés manejar Blobs en el cliente.
 */
export const descargarInformeExcel = (params = {}) => {
  const clean = sanitizeParams({ ...params, format: 'xlsx' });
  const qs = new URLSearchParams();
  Object.entries(clean).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      v.forEach((item) => qs.append(k, item));
    } else {
      qs.set(k, String(v));
    }
  });
  const url = `${BASE}?${qs.toString()}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};