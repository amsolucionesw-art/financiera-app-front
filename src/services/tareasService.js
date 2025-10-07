// src/services/tareasService.js
import { apiFetch } from './apiClient';

const API_PREFIX = import.meta.env.VITE_API_PREFIX || ''; // p.ej. "/api"
const BASE = `${API_PREFIX}/tareas`;

/** Lista solo las tareas en estado "pendiente" */
export const obtenerTareasPendientes = () =>
    apiFetch(`${BASE}`, { params: { estado: 'pendiente' } });

/** Aprueba una tarea pendiente */
export const aprobarTarea = (id) =>
    apiFetch(`${BASE}/${id}/aprobar`, { method: 'PATCH' });

/** Rechaza una tarea pendiente */
export const rechazarTarea = (id) =>
    apiFetch(`${BASE}/${id}/rechazar`, { method: 'PATCH' });

/**
 * Crea una tarea de "anular_credito".
 * Nota: el backend expone POST /tareas/pendientes para altas.
 */
export const solicitarAnulacionCredito = ({ creditoId, motivo, userId }) =>
    apiFetch(`${BASE}/pendientes`, {
        method: 'POST',
        body: {
            tipo: 'anular_credito',
            datos: { creditoId, motivo },
            creadoPor: userId
        }
    });
