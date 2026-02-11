// src/services/tareasService.js
import { apiFetch } from './apiClient';

// Une segmentos asegurando que no queden dobles slashes internos
const joinPath = (...parts) =>
    '/' +
    parts
        .filter(Boolean)
        .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
        .join('/');

// ✅ IMPORTANTE: NO anteponer VITE_API_PREFIX acá.
// apiClient ya arma la base usando VITE_API_PREFIX.
// Si acá agregamos /api, terminamos en /api/api/...
const BASE = joinPath('tareas');

/** Lista solo las tareas en estado "pendiente" */
export const obtenerTareasPendientes = () =>
    apiFetch(BASE, { params: { estado: 'pendiente' } });

/** (Opcional) Lista tareas por estado: 'pendiente' | 'aprobada' | 'rechazada' */
export const obtenerTareas = (estado) =>
    apiFetch(BASE, { params: estado ? { estado } : undefined });

/** Aprueba una tarea pendiente (solo superadmin) */
export const aprobarTarea = (id) =>
    apiFetch(joinPath(BASE, id, 'aprobar'), { method: 'PATCH' });

/** Rechaza una tarea pendiente (solo superadmin) */
export const rechazarTarea = (id) =>
    apiFetch(joinPath(BASE, id, 'rechazar'), { method: 'PATCH' });

/**
 * Crea una tarea de "anular_credito" (admin).
 * Intento 1: POST /tareas/pendientes (alias)
 * Si el backend responde 404 → Intento 2: POST /tareas (canónica)
 *
 * El backend toma el userId desde req.user.id (token), por eso
 * no enviamos userId en el body.
 */
export const solicitarAnulacionCredito = async ({ creditoId, motivo }) => {
    const body = {
        tipo: 'anular_credito',
        datos: { creditoId, motivo }
    };

    const pathPendientes = joinPath(BASE, 'pendientes'); // /tareas/pendientes
    const pathCanonico = BASE;                            // /tareas

    try {
        return await apiFetch(pathPendientes, { method: 'POST', body });
    } catch (err) {
        const status = err?.status ?? err?.response?.status;
        const msg = (err?.message || '').toLowerCase();
        if (status === 404 || msg.includes('404')) {
            return apiFetch(pathCanonico, { method: 'POST', body });
        }
        throw err;
    }
};