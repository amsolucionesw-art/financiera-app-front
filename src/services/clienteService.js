// src/services/clienteService.js

import apiFetch from './apiClient';
import { getToken } from './authService';

/**
 * Este service estaba calculando BASE_URL / API_BASE por su cuenta.
 * Eso puede romperse cuando VITE_API_URL ya incluye "/api" (terminás con "/api/api").
 *
 * Solución:
 * - Para requests JSON normales: usamos apiFetch (ya resuelve base + /api + headers).
 * - Para uploads (FormData): usamos apiFetch también (soporta FormData y no fuerza Content-Type).
 * - Para descargas/importación (fetch directo): construimos API_URL_BASE con la MISMA lógica que apiClient.
 * - Para URLs públicas (uploads): derivamos ORIGIN (sin /api) de VITE_API_BASE / VITE_API_URL / window.origin.
 */

/* ───────────────── Helpers: API base consistente con apiClient ───────────────── */
const normalizeBase = (url) => (url || '').trim().replace(/\/+$/, '');
const normalizePrefix = (p) => {
    if (p == null) return '/api';
    const s = String(p).trim();
    if (s === '') return ''; // permite sin prefijo
    const withSlash = s.startsWith('/') ? s : `/${s}`;
    return withSlash.replace(/\/+$/, '');
};

const RAW_API_URL = (import.meta.env.VITE_API_URL || '').trim();         // ej: "http://localhost:3000/api" o "/api"
const API_BASE_ENV = (import.meta.env.VITE_API_BASE || '').trim();       // ej: "http://localhost:3000" o "" (same-origin)
const API_PREFIX_ENV = normalizePrefix(import.meta.env.VITE_API_PREFIX || '/api');

const API_URL_BASE =
    normalizeBase(RAW_API_URL) ||
    (API_BASE_ENV ? `${normalizeBase(API_BASE_ENV)}${API_PREFIX_ENV}` : API_PREFIX_ENV);

/** Para construir URLs a endpoints (incluye /api si corresponde) */
const apiUrl = (path) => {
    const p = String(path || '');
    const normPath = p.startsWith('/') ? p : `/${p}`;
    return `${API_URL_BASE}${normPath}`.replace(/\/{2,}/g, '/').replace(':/', '://');
};

/** Origin “público” para assets (SIN /api) */
const resolvePublicOrigin = () => {
    // 1) Si hay VITE_API_BASE, es lo más claro (http://host:port)
    if (API_BASE_ENV) return normalizeBase(API_BASE_ENV);

    // 2) Si VITE_API_URL es absoluto, le sacamos el origin
    if (/^https?:\/\//i.test(RAW_API_URL)) {
        try {
            return new URL(RAW_API_URL).origin;
        } catch {
            // ignore
        }
    }

    // 3) Same-origin (producción típica con reverse proxy)
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;

    // 4) Fallback
    return 'http://localhost:3000';
};

const PUBLIC_ORIGIN = resolvePublicOrigin();

/* Header SOLO con Authorization (sin Content-Type) */
const getAuthHeaderOnly = () => {
    const raw = getToken() || '';
    const token = raw?.replace(/^Bearer\s+/i, '') || raw;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

/* Si viene una ruta relativa (p. ej. "/uploads/dni/123.jpg"), la paso a absoluta */
const toAbsoluteUrl = (maybePath) => {
    if (!maybePath || typeof maybePath !== 'string') return maybePath;
    if (/^(https?:)?\/\//i.test(maybePath)) return maybePath; // ya es absoluta
    if (/^(data:|blob:)/i.test(maybePath)) return maybePath;  // data/blob
    return `${PUBLIC_ORIGIN}${maybePath.startsWith('/') ? '' : '/'}${maybePath}`;
};

/* Helper: objeto -> querystring */
const toQueryString = (params = {}) => {
    const entries = Object.entries(params).filter(
        ([, v]) => v !== undefined && v !== null && String(v).trim() !== ''
    );
    if (!entries.length) return '';
    const qs = entries
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    return `?${qs}`;
};

/* ─────────── Clientes: CRUD & queries ─────────── */

/** Obtener todos los clientes (listado completo) */
export const obtenerClientes = async () => {
    const resp = await apiFetch('/clientes');
    return Array.isArray(resp)
        ? resp.map((c) => (c?.dni_foto ? { ...c, dni_foto: toAbsoluteUrl(c.dni_foto) } : c))
        : resp;
};

/** Obtener clientes básico (id, nombre, apellido, cobrador, zona). Acepta filtros, ej: { cobrador: 2, zona: 5 } */
export const obtenerClientesBasico = async (filtros = {}) => {
    const qs = toQueryString(filtros);
    const resp = await apiFetch(`/clientes/basico${qs}`);
    return Array.isArray(resp)
        ? resp.map((c) => (c?.dni_foto ? { ...c, dni_foto: toAbsoluteUrl(c.dni_foto) } : c))
        : resp;
};

/** Obtener cliente por ID */
export const obtenerClientePorId = async (id) => {
    const data = await apiFetch(`/clientes/${id}`);
    if (data && data.dni_foto) data.dni_foto = toAbsoluteUrl(data.dni_foto);
    return data;
};

/** Crear cliente */
export const crearCliente = async (cliente) => {
    const created = await apiFetch('/clientes', {
        method: 'POST',
        body: cliente,
    });
    if (created && created.dni_foto) created.dni_foto = toAbsoluteUrl(created.dni_foto);
    return created;
};

/** Actualizar cliente */
export const actualizarCliente = async (id, cliente) => {
    const updated = await apiFetch(`/clientes/${id}`, {
        method: 'PUT',
        body: cliente,
    });
    if (updated && updated.dni_foto) updated.dni_foto = toAbsoluteUrl(updated.dni_foto);
    return updated;
};

/**
 * Eliminar cliente
 * - Con backend actualizado: solo superadmin (rol 0).
 * - Este wrapper traduce 403 a un mensaje claro para UI.
 */
export const eliminarCliente = async (id) => {
    try {
        return await apiFetch(`/clientes/${id}`, { method: 'DELETE' });
    } catch (err) {
        const msg = String(err?.message || '').toLowerCase();
        if (
            msg.includes('403') ||
            msg.includes('forbidden') ||
            msg.includes('no autorizado') ||
            msg.includes('unauthorized')
        ) {
            throw new Error('Sin permisos: solo el Super Administrador puede eliminar clientes.');
        }
        throw err;
    }
};

/**
 * Subir imagen del DNI (FormData).
 * ✅ Ahora usa apiFetch para no duplicar lógica de base URL / headers.
 * IMPORTANTE: no mandar Content-Type manualmente (apiFetch lo gestiona).
 */
export const subirDniFoto = async (clienteId, file) => {
    const formData = new FormData();
    formData.append('imagen', file);

    const payload = await apiFetch(`/clientes/${clienteId}/dni-foto`, {
        method: 'POST',
        body: formData, // apiFetch detecta FormData y no fuerza Content-Type
        fullResponse: true, // por si el backend responde { success, message, url }
    });

    // Normalizamos respuesta: puede venir { url } o { data: { url } }
    const data = payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;

    if (data?.dni_foto) data.dni_foto = toAbsoluteUrl(data.dni_foto);
    if (data?.url) data.url = toAbsoluteUrl(data.url);

    return data;
};

/** Obtener clientes por cobrador (incluye créditos/cuotas según tu back) */
export const obtenerClientesPorCobrador = async (cobradorId) => {
    const resp = await apiFetch(`/clientes/por-cobrador/${cobradorId}`);
    return Array.isArray(resp)
        ? resp.map((c) => (c?.dni_foto ? { ...c, dni_foto: toAbsoluteUrl(c.dni_foto) } : c))
        : resp;
};

/* ─────────── Importación por planilla (CSV/XLSX) ─────────── */

/**
 * Descarga la plantilla base de importación.
 * (Se usa fetch directo porque necesitamos Blob.)
 */
export const descargarPlantillaImport = async ({ format = 'xlsx', filename, download = true } = {}) => {
    const qs = toQueryString({ format });
    const url = `${apiUrl('/clientes/import/template')}${qs}`;

    const res = await fetch(url, {
        method: 'GET',
        headers: {
            ...getAuthHeaderOnly(), // solo Authorization
        },
    });

    if (!res.ok) {
        let msg = 'Error al descargar plantilla';
        try {
            const err = await res.json();
            msg = err?.message || msg;
        } catch { /* ignore */ }
        throw new Error(msg);
    }

    const blob = await res.blob();

    const cd = res.headers.get('Content-Disposition') || '';
    const match = /filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i.exec(cd);
    const suggestedNameFromHeader = match ? decodeURIComponent(match[1]) : null;

    const suggestedName = suggestedNameFromHeader || `${filename || 'plantilla_import_clientes'}.${format}`;

    if (!download) {
        const mime = res.headers.get('Content-Type') || (format === 'csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return { blob, mime, suggestedName };
    }

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
};

/**
 * Obtiene la definición de columnas/alias/tipos para validar client-side.
 */
export const obtenerColumnasImport = async () => {
    const data = await apiFetch('/clientes/import/columns');
    return data;
};

/**
 * Importa clientes desde un archivo CSV/XLSX.
 * - Usa dryRun=true por defecto (previsualización). Para confirmar, dryRun=false.
 * - Campo de archivo: "file"
 */
export const importarClientes = async (file, { dryRun = true } = {}) => {
    if (!(file instanceof Blob)) {
        throw new Error('Debes proporcionar un archivo CSV/XLSX válido');
    }

    const formData = new FormData();
    formData.append('file', file);

    const url = `${apiUrl('/clientes/import')}${toQueryString({ dryRun })}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            ...getAuthHeaderOnly(), // solo Authorization (SIN Content-Type)
        },
        body: formData,
    });

    if (!res.ok) {
        let msg = 'Error al importar clientes';
        try {
            const err = await res.json();
            msg = err?.message || msg;
        } catch { /* ignore */ }
        throw new Error(msg);
    }

    const payload = await res.json();
    return {
        summary: payload.summary,
        rows: payload.rows,
    };
};
