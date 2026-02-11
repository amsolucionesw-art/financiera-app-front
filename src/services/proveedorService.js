// src/services/proveedorService.js
// Convención: igual que comprasService/cuotaService.
// Usa apiClient si está disponible; si no, fallback con fetch JSON.

/* ───────────────── Helpers: API base consistente con apiClient ───────────────── */

const normalizeBase = (url) => (url || '').trim().replace(/\/+$/, '');
const normalizePrefix = (p) => {
    if (p == null) return '/api';
    const s = String(p).trim();
    if (s === '') return ''; // permite sin prefijo
    const withSlash = s.startsWith('/') ? s : `/${s}`;
    return withSlash.replace(/\/+$/, '');
};

const getApiBaseUrl = () => {
    const RAW_API_URL = (import.meta?.env?.VITE_API_URL || '').trim();
    const API_BASE_ENV = (import.meta?.env?.VITE_API_BASE || '').trim();
    const API_PREFIX_ENV = normalizePrefix(import.meta?.env?.VITE_API_PREFIX || '/api');

    const base =
        normalizeBase(RAW_API_URL) ||
        (API_BASE_ENV ? `${normalizeBase(API_BASE_ENV)}${API_PREFIX_ENV}` : API_PREFIX_ENV);

    return normalizeBase(base);
};

/** Une segmentos evitando dobles slashes */
const joinPath = (...parts) =>
    '/' +
    parts
        .filter(Boolean)
        .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
        .join('/');

/** Construye URL final con la base del API (puede ser "/api" o "https://.../api") */
const buildApiUrl = (path) => {
    const p = String(path || '');
    const norm = p.startsWith('/') ? p : `/${p}`;
    const base = getApiBaseUrl(); // "/api" o "https://host/api"
    return `${base}${norm}`.replace(/\/{2,}/g, '/').replace(':/', '://');
};

let apiFetch = null;
let __useApiClient = false;

try {
    // Si apiClient existe, lo usamos y respetamos su buildURL interno.
    // (No agregamos prefijos aquí).
    ({ apiFetch } = await import('./apiClient.js'));
    __useApiClient = true;
} catch (_) {
    // Fallback: fetch directo contra la base del API consistente con apiClient
    apiFetch = async (pathOrUrl, options = {}) => {
        const url = /^https?:\/\//i.test(String(pathOrUrl))
            ? String(pathOrUrl)
            : buildApiUrl(String(pathOrUrl));

        const opts = {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
            ...options,
        };

        if (opts.body && typeof opts.body !== 'string') {
            opts.body = JSON.stringify(opts.body);
        }

        const res = await fetch(url, opts);
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            try {
                const json = JSON.parse(text);
                throw new Error(json?.message || text || `HTTP ${res.status}`);
            } catch {
                throw new Error(text || `HTTP ${res.status}`);
            }
        }

        const ct = res.headers.get('Content-Type') || '';
        return ct.includes('application/json') ? res.json() : res.text();
    };
}

// ✅ IMPORTANTE: apiClient ya aplica VITE_API_PREFIX (/api).
// Por eso acá la base de recursos es SIN prefijo.
const BASE = joinPath('proveedores');

// Helpers
const qParams = (obj = {}) =>
    Object.entries(obj)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

// ========================= CRUD =========================

/**
 * Listado con filtros y paginación opcional
 * @param {Object} params { search, rubro, ciudad, provincia, cuil_cuit, limit, offset, orderBy, orderDir, activo, incluirTodos }
 * @returns {Promise<Object>} JSON completo del backend: { success, data, count, ... }
 */
export async function listarProveedores(params = {}) {
    const def = {
        orderBy: params.orderBy || 'nombre_razon_social',
        orderDir: params.orderDir || 'ASC',
        ...params,
    };

    // NOTA:
    // - Si querés “TODOS” desde el front, acordate de enviar incluirTodos=true cuando NO envíes 'activo'.
    // - Si enviás activo=true/false, el back respeta eso.
    const qs = qParams(def);

    // Si usamos apiClient, pasamos path relativo (apiClient lo resuelve).
    // Si estamos en fallback, apiFetch ya convierte a URL con base + /api.
    const url = qs ? `${BASE}?${qs}` : BASE;

    const res = await apiFetch(url, { method: 'GET' });

    // Devolvemos el JSON completo para no perder 'count' que usa la paginación del grid
    return res;
}

/** Obtener un proveedor por id */
export async function obtenerProveedor(id) {
    if (!id) throw new Error('Falta id');
    const res = await apiFetch(joinPath(BASE, id), { method: 'GET' });
    return res?.data ?? res;
}

/** Crear proveedor */
export async function crearProveedor(payload) {
    const res = await apiFetch(BASE, {
        method: 'POST',
        body: payload,
    });
    return res?.data ?? res;
}

/** Actualizar proveedor */
export async function actualizarProveedor(id, payload) {
    if (!id) throw new Error('Falta id');
    const res = await apiFetch(joinPath(BASE, id), {
        method: 'PUT',
        body: payload,
    });
    return res?.data ?? res;
}

/** Eliminar proveedor */
export async function eliminarProveedor(id) {
    if (!id) throw new Error('Falta id');
    const res = await apiFetch(joinPath(BASE, id), { method: 'DELETE' });
    return res?.data ?? res;
}

/**
 * Azúcar para búsqueda rápida en selects
 * - Por defecto trae SOLO ACTIVOS para no mostrar archivados en selects.
 * - Podés overridear con extras (p.ej. { incluirTodos: true } o { activo: false }).
 */
export async function buscarProveedores(search = '', extras = {}) {
    const res = await listarProveedores({
        search,
        limit: 200,
        activo: true, // por defecto solo activos para selects
        ...extras,
    });
    return res?.data ?? res;
}

export default {
    listarProveedores,
    obtenerProveedor,
    crearProveedor,
    actualizarProveedor,
    eliminarProveedor,
    buscarProveedores,
};