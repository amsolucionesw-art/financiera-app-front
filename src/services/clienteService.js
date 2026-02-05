// src/services/clienteService.js

import apiFetch from './apiClient';
import { getToken } from './authService';

/**
 * Este service estaba calculando BASE_URL / API_BASE por su cuenta.
 * Eso puede romperse cuando VITE_API_URL ya incluye "/api" (terminás con "/api/api").
 *
 * Solución:
 * - Para requests JSON normales: usamos apiFetch (ya resuelve base + /api + headers).
 * - Para descargas/importación (fetch directo): construimos API_URL_BASE con la MISMA lógica que apiClient.
 *
 * Nota:
 * - Se removió la lógica de DNI (subida/visualización) por decisión de producto:
 *   no se muestra ni se utiliza por ahora, pero queda listo para reactivar en el futuro.
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

/* Header SOLO con Authorization (sin Content-Type) */
const getAuthHeaderOnly = () => {
    const raw = getToken() || '';
    const token = raw?.replace(/^Bearer\s+/i, '') || raw;
    return token ? { Authorization: `Bearer ${token}` } : {};
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
    return await apiFetch('/clientes');
};

/** Obtener clientes básico (id, nombre, apellido, cobrador, zona). Acepta filtros, ej: { cobrador: 2, zona: 5 } */
export const obtenerClientesBasico = async (filtros = {}) => {
    const qs = toQueryString(filtros);
    return await apiFetch(`/clientes/basico${qs}`);
};

/** Obtener cliente por ID */
export const obtenerClientePorId = async (id) => {
    return await apiFetch(`/clientes/${id}`);
};

/** Crear cliente */
export const crearCliente = async (cliente) => {
    return await apiFetch('/clientes', {
        method: 'POST',
        body: cliente,
    });
};

/** Actualizar cliente */
export const actualizarCliente = async (id, cliente) => {
    return await apiFetch(`/clientes/${id}`, {
        method: 'PUT',
        body: cliente,
    });
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

/** Obtener clientes por cobrador (incluye créditos/cuotas según tu back) */
export const obtenerClientesPorCobrador = async (cobradorId) => {
    return await apiFetch(`/clientes/por-cobrador/${cobradorId}`);
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