// src/services/clienteService.js

import apiFetch, { getAuthHeaders } from './apiClient';

/* Base para absolutizar URLs de imágenes (DNI) */
const BASE_URL = (import.meta?.env?.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

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
    // Normalizo imágenes, si hay
    return Array.isArray(resp)
        ? resp.map((c) => (c?.dni_foto ? { ...c, dni_foto: toAbsoluteUrl(c.dni_foto) } : c))
        : resp;
};

/** Obtener clientes básico (id, nombre, apellido, cobrador, zona). Acepta filtros, ej: { cobrador: 2, zona: 5 } */
export const obtenerClientesBasico = async (filtros = {}) => {
    const qs = toQueryString(filtros);
    const resp = await apiFetch(`/clientes/basico${qs}`);
    // (En este endpoint no suelen venir imágenes, pero dejamos el normalizador por consistencia)
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
    // Devuelvo el recurso actualizado (si tu back lo retorna)
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
 * Nota: evitamos apiFetch para no serializar el FormData y dejar que el navegador setee el boundary.
 */
export const subirDniFoto = async (clienteId, file) => {
    const formData = new FormData();
    formData.append('imagen', file);

    const res = await fetch(`${BASE_URL}/clientes/${clienteId}/dni-foto`, {
        method: 'POST',
        headers: {
            // Sólo auth; NO enviar Content-Type aquí
            ...getAuthHeaders(false),
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
    // Compat: si el backend devuelve { data }, tomo data; si devuelve el objeto directo, lo dejo igual
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