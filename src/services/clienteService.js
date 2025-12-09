// src/services/clienteService.js

import apiFetch from './apiClient';

/* Base de API */
const BASE_URL = (import.meta?.env?.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const API_PREFIX = (import.meta?.env?.VITE_API_PREFIX || '/api').replace(/\/+$/, '');
const API_BASE = `${BASE_URL}${API_PREFIX}`;

/* Header SOLO con Authorization (sin Content-Type) */
const getAuthHeaderOnly = () => {
    try {
        const raw = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
        const token = raw?.replace(/^Bearer\s+/i, '') || raw;
        return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
        return {};
    }
};

/* Si viene una ruta relativa (p. ej. "/uploads/dni/123.jpg"), la paso a absoluta */
const toAbsoluteUrl = (maybePath) => {
    if (!maybePath || typeof maybePath !== 'string') return maybePath;
    if (/^(https?:)?\/\//i.test(maybePath)) return maybePath;   // ya es absoluta
    if (/^(data:|blob:)/i.test(maybePath)) return maybePath;    // data/blob
    return `${BASE_URL}${maybePath.startsWith('/') ? '' : '/'}${maybePath}`;
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
    const resp = await apiFetch('/clientes'); // apiFetch ya tira si hay error
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

/** Eliminar cliente */
export const eliminarCliente = (id) =>
    apiFetch(`/clientes/${id}`, { method: 'DELETE' });

/**
 * Subir imagen del DNI (FormData).
 * IMPORTANTE: no mandar Content-Type manualmente.
 */
export const subirDniFoto = async (clienteId, file) => {
    const formData = new FormData();
    formData.append('imagen', file);

    const res = await fetch(`${BASE_URL}/clientes/${clienteId}/dni-foto`, {
        method: 'POST',
        headers: {
            ...getAuthHeaderOnly(), // solo Authorization
        },
        body: formData,
    });

    if (!res.ok) {
        let msg = 'Error al subir imagen';
        try {
            const err = await res.json();
            msg = err?.message || msg;
        } catch { /* ignore */ }
        throw new Error(msg);
    }

    const payload = await res.json();
    const data = payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
    if (data && data.dni_foto) data.dni_foto = toAbsoluteUrl(data.dni_foto);
    return data;
};

/** Obtener clientes por cobrador (incluye créditos/cuotas según tu back) */
export const obtenerClientesPorCobrador = async (cobradorId) => {
    const resp = await apiFetch(`/clientes/por-cobrador/${cobradorId}`);
    return Array.isArray(resp)
        ? resp.map((c) => (c?.dni_foto ? { ...c, dni_foto: toAbsoluteUrl(c.dni_foto) } : c))
        : resp;
};

/* ─────────── NUEVO: Importación por planilla (CSV/XLSX) ─────────── */

/**
 * Descarga la plantilla base de importación.
 */
export const descargarPlantillaImport = async ({ format = 'xlsx', filename, download = true } = {}) => {
    const qs = toQueryString({ format });
    const url = `${API_BASE}/clientes/import/template${qs}`;

    const res = await fetch(url, {
        method: 'GET',
        headers: {
            ...getAuthHeaderOnly(), // solo Authorization
        }
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
    const mime = res.headers.get('Content-Type') || (format === 'csv'
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const cd = res.headers.get('Content-Disposition') || '';
    const match = /filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i.exec(cd);
    const suggestedNameFromHeader = match ? decodeURIComponent(match[1]) : null;

    const suggestedName = suggestedNameFromHeader || `${filename || 'plantilla_import_clientes'}.${format}`;

    if (!download) {
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

    const url = `${API_BASE}/clientes/import${toQueryString({ dryRun })}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            ...getAuthHeaderOnly(), // solo Authorization (SIN Content-Type)
        },
        body: formData
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
        rows: payload.rows
    };
};