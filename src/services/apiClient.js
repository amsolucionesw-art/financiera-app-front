// src/services/apiClient.js
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/** Normaliza y une base + path en forma segura */
const normalizeBase = (url) => (url || '').replace(/\/+$/, '');
const normalizePath = (p) => `/${String(p || '').replace(/^\/+/, '')}`;

/**
 * Construye la URL final. Si `path` es absoluto (http/https), se usa tal cual.
 * Si viene relativo, se antepone API_URL y se agregan params (si hay).
 */
const buildURL = (path, params = null) => {
    // Passthrough si es URL absoluta
    if (/^https?:\/\//i.test(String(path))) {
        if (!params) return String(path);
        const urlAbs = new URL(String(path));
        Object.entries(params).forEach(([k, v]) => {
            if (v === undefined || v === null) return;
            if (Array.isArray(v)) v.forEach(item => urlAbs.searchParams.append(k, item));
            else urlAbs.searchParams.append(k, v);
        });
        return urlAbs.toString();
    }

    const base = normalizeBase(API_URL);
    const full = `${base}${normalizePath(path)}`;
    if (!params) return full;

    const url = new URL(full);
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (Array.isArray(v)) v.forEach(item => url.searchParams.append(k, item));
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
        'Accept': 'application/json',
        'Content-Type': 'application/json'
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
        if (Array.isArray(v)) v.forEach(item => qs.append(k, item));
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
 * NOTA: **NO** envía cookies/sesión; sólo usa Bearer tokens.
 */
export async function apiFetch(path, options = {}) {
    const { headers: customHeaders, body, params, ...rest } = options;

    // Detectar si el body es "especial" (no JSON)
    const isSpecialBody =
        typeof FormData !== 'undefined' && body instanceof FormData ||
        typeof Blob !== 'undefined' && body instanceof Blob ||
        typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams ||
        body instanceof ArrayBuffer;

    // Merge headers
    const headers = { ...getAuthHeaders(), ...customHeaders };
    // Para FormData/Blob/URLSearchParams quitamos Content-Type (el navegador setea boundary correcto)
    if (isSpecialBody && headers['Content-Type']) {
        delete headers['Content-Type'];
    }

    // Normaliza body: acepta string ya serializado u objeto plano
    let finalBody = body;
    if (!isSpecialBody && finalBody !== undefined && finalBody !== null && typeof finalBody !== 'string') {
        finalBody = JSON.stringify(finalBody);
    }

    const url = buildURL(path, params);

    const res = await fetch(url, {
        headers,
        // credentials: 'include',   <-- no se usa para evitar problemas CORS
        body: finalBody,
        ...rest
    });

    // 204 No Content
    if (res.status === 204) return null;

    // Intenta parsear JSON si corresponde
    let payload = null;
    const ct = res.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
        try {
            payload = await res.json();
        } catch {
            payload = null;
        }
    } else {
        // Si no es JSON, devolvemos el texto por compat
        try {
            payload = await res.text();
        } catch {
            payload = null;
        }
    }

    if (!res.ok) {
        const message =
            (payload && (payload.message || payload.error)) ||
            res.statusText ||
            'Error en API';

        const err = new Error(message);
        // Metadata útil para manejo en UI si querés
        err.status = res.status;
        err.payload = payload;
        if (payload && Array.isArray(payload.errors)) {
            err.errors = payload.errors;
        }
        throw err;
    }

    // Muchas APIs devuelven { success, data }, otras devuelven el objeto directo
    return payload && Object.prototype.hasOwnProperty.call(payload, 'data')
        ? payload.data
        : payload;
}

/* ───────────── Atajos cómodos ───────────── */
export const apiGet = (path, opts = {}) =>
    apiFetch(path, { method: 'GET', ...opts });

export const apiPost = (path, body, opts = {}) =>
    apiFetch(path, { method: 'POST', body, ...opts });

export const apiPut = (path, body, opts = {}) =>
    apiFetch(path, { method: 'PUT', body, ...opts });

export const apiPatch = (path, body, opts = {}) =>
    apiFetch(path, { method: 'PATCH', body, ...opts });

export const apiDelete = (path, opts = {}) =>
    apiFetch(path, { method: 'DELETE', ...opts });

export default apiFetch;
