// src/services/formaPagoService.js
import apiFetch from './apiClient';

/* ───────────────── Config & helpers ───────────────── */

// ✅ IMPORTANTE: apiClient ya aplica VITE_API_PREFIX (/api).
// Acá NO sumamos otro prefijo para evitar /api/api.

const joinPath = (...parts) =>
    '/' +
    parts
        .filter(Boolean)
        .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
        .join('/');

const BASE_FORMAS = joinPath('formas-pago');

/* ───────────────── Endpoints ───────────────── */

/** Listar formas de pago (para selects, etc.) */
export const obtenerFormasDePago = () => apiFetch(BASE_FORMAS);

/** Obtener una forma de pago por ID */
export const obtenerFormaDePagoPorId = (id) =>
    apiFetch(joinPath(BASE_FORMAS, id));

/** Crear nueva forma de pago */
export const crearFormaDePago = (data) =>
    apiFetch(BASE_FORMAS, {
        method: 'POST',
        body: data,
    });

/** Actualizar forma de pago existente */
export const actualizarFormaDePago = (id, data) =>
    apiFetch(joinPath(BASE_FORMAS, id), {
        method: 'PUT',
        body: data,
    });

/** Eliminar forma de pago */
export const eliminarFormaDePago = (id) =>
    apiFetch(joinPath(BASE_FORMAS, id), {
        method: 'DELETE',
    });

export default {
    obtenerFormasDePago,
    obtenerFormaDePagoPorId,
    crearFormaDePago,
    actualizarFormaDePago,
    eliminarFormaDePago,
};