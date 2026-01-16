// src/services/apiClient.js

/**
 * ─────────────────────────────────────────────────────────────
 * Config de API
 * 1) Si existe VITE_API_URL -> se usa tal cual (ej: "http://localhost:3000/api")
 * 2) Si no existe, se arma con:
 *    - VITE_API_BASE   (ej: "http://localhost:3000" | "" para same-origin)
 *    - VITE_API_PREFIX (ej: "/api")
 * 3) Fallback final: "/api" (same-origin, ideal para producción con reverse proxy)
 * ─────────────────────────────────────────────────────────────
 */

const normalizeBase = (url) => (url || '').trim().replace(/\/+$/, '');
const normalizePrefix = (p) => {
    if (p == null) return '/api';
    const s = String(p).trim();
    if (s === '') return ''; // permite sin prefijo si lo desean
    const withSlash = s.startsWith('/') ? s : `/${s}`;
    return withSlash.replace(/\/+$/, '');
};

const RAW_API_URL = (import.meta.env.VITE_API_URL || '').trim();
const API_BASE = (import.meta.env.VITE_API_BASE || '').trim(); // opcional
const API_PREFIX = normalizePrefix(import.meta.env.VITE_API_PREFIX || '/api');

const API_URL =
    RAW_API_URL ||
    (API_BASE ? `${normalizeBase(API_BASE)}${API_PREFIX}` : API_PREFIX);

/** Normaliza y une base + path en forma segura */
const normalizePath = (p) => `/${String(p || '').replace(/^\/+/, '')}`;

/** Crea un URL object aun si la URL es relativa (usa origin del browser) */
const toURL = (maybeRelativeOrAbsolute) => {
    const s = String(maybeRelativeOrAbsolute);
    // Absoluta
    if (/^https?:\/\//i.test(s)) return new URL(s);
    // Relativa: necesita base
    return new URL(s, window.location.origin);
};

/**
 * Construye la URL final.
 * - Si `path` es absoluto (http/https), se usa tal cual.
 * - Si viene relativo, se antepone API_URL y se agregan params (si hay).
 */
const buildURL = (path, params = null) => {
    const raw = String(path || '');

    // Passthrough si es URL absoluta
    if (/^https?:\/\//i.test(raw)) {
        if (!params) return raw;
        const urlAbs = new URL(raw);
        Object.entries(params).forEach(([k, v]) => {
            if (v === undefined || v === null) return;
            if (Array.isArray(v)) v.forEach((item) => urlAbs.searchParams.append(k, item));
            else urlAbs.searchParams.append(k, v);
        });
        return urlAbs.toString();
    }

    const base = normalizeBase(API_URL);
    const full = `${base}${normalizePath(raw)}`;

    if (!params) return full;

    const url = toURL(full);
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
        else url.searchParams.append(k, v);
    });

    return url.toString();
};

/**
 * Devuelve los headers base para todas las peticiones.
 * - Content-Type JSON (si el body no es FormData/Blob/URLSearchParams)
 * - Authorization: Bearer <token> (si existe)
 */
export const getAuthHeaders = () => {
    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };

    const token = localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;

    return headers;
};

/**
 * Arma un path con query params: withQuery('/creditos', { estado: 'pendiente', page: 2 })
 * -> '/creditos?estado=pendiente&page=2'
 * (Se mantiene por compat; internamente podés usar también apiFetch({ params }))
 */
export const withQuery = (path, params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (Array.isArray(v)) v.forEach((item) => qs.append(k, item));
        else qs.append(k, v);
    });
    const q = qs.toString();
    return q ? `${path}?${q}` : path;
};

/**
 * apiFetch: wrapper de fetch con manejo de errores y headers unificados.
 * Extra:
 *  - Soporta options.params para armar query string automáticamente.
 *  - Adjunta error.payload y error.errors (si vienen de la API) para la UI.
 *  - Cuerpos tipo FormData/Blob/URLSearchParams no se serializan ni se fuerza Content-Type.
 *  - ✅ Soporta options.fullResponse=true para NO "desarmar" { success, message, data }.
 * NOTA: **NO** envía cookies/sesión; sólo usa Bearer tokens.
 */
export async function apiFetch(path, options = {}) {
    const {
        headers: customHeaders,
        body,
        params,
        fullResponse = false,
        ...rest
    } = options;

    const isSpecialBody =
        (typeof FormData !== 'undefined' && body instanceof FormData) ||
        (typeof Blob !== 'undefined' && body instanceof Blob) ||
        (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
        body instanceof ArrayBuffer;

    // Merge headers
    const headers = { ...getAuthHeaders(), ...customHeaders };
    if (isSpecialBody && headers['Content-Type']) {
        delete headers['Content-Type'];
    }

    // Normaliza body
    let finalBody = body;
    if (!isSpecialBody && finalBody !== undefined && finalBody !== null && typeof finalBody !== 'string') {
        finalBody = JSON.stringify(finalBody);
    }

    const url = buildURL(path, params);

    const res = await fetch(url, {
        headers,
        body: finalBody,
        ...rest,
    });

    if (res.status === 204) return null;

    let payload = null;
    const ct = res.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
        try {
            payload = await res.json();
        } catch {
            payload = null;
        }
    } else {
        try {
            payload = await res.text();
        } catch {
            payload = null;
        }
    }

    if (!res.ok) {
        const message = (payload && (payload.message || payload.error)) || res.statusText || 'Error en API';
        const err = new Error(message);
        err.status = res.status;
        err.payload = payload;
        if (payload && Array.isArray(payload.errors)) {
            err.errors = payload.errors;
        }
        throw err;
    }

    if (fullResponse) return payload;

    return payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
}

/* ───────────── Atajos cómodos ───────────── */
export const apiGet = (path, opts = {}) => apiFetch(path, { method: 'GET', ...opts });
export const apiPost = (path, body, opts = {}) => apiFetch(path, { method: 'POST', body, ...opts });
export const apiPut = (path, body, opts = {}) => apiFetch(path, { method: 'PUT', body, ...opts });
export const apiPatch = (path, body, opts = {}) => apiFetch(path, { method: 'PATCH', body, ...opts });
export const apiDelete = (path, opts = {}) => apiFetch(path, { method: 'DELETE', ...opts });

export default apiFetch;
