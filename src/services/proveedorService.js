// src/services/proveedorService.js
// Convención: igual que comprasService/cuotaService.
// Usa apiClient si está disponible; si no, fallback con fetch JSON.

let apiFetch = null;
try {
    ({ apiFetch } = await import('./apiClient.js'));
} catch (_) {
    apiFetch = async (url, options = {}) => {
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

const API_PREFIX = import.meta?.env?.VITE_API_PREFIX ?? ''; // ⚠️ por defecto sin prefijo

// Une segmentos evitando dobles slashes
const joinPath = (...parts) =>
    '/' +
    parts
        .filter(Boolean)
        .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
        .join('/');

const BASE = joinPath(API_PREFIX, 'proveedores');

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