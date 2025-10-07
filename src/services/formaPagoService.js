// src/services/formaPagoService.js
import apiFetch from './apiClient';

/* ───────────────── Config & helpers ───────────────── */
const API_PREFIX = import.meta.env.VITE_API_PREFIX ?? '';

const joinPath = (...parts) =>
    '/' +
    parts
        .filter(Boolean)
        .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
        .join('/');

const BASE_FORMAS = joinPath(API_PREFIX, 'formas-pago');

/* ───────────────── Endpoints ───────────────── */
export const obtenerFormasDePago = () => apiFetch(BASE_FORMAS);

export default { obtenerFormasDePago };
