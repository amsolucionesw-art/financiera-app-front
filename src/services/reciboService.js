// src/services/reciboService.js
import { apiFetch } from './apiClient';

// ✅ apiClient ya resuelve /api (VITE_API_PREFIX) internamente.
// Acá NO agregamos prefijo para evitar /api/api.
const BASE = `/recibos`;

/**
 * Obtiene un recibo por su número (PK).
 * @param {string|number} id
 * @returns {Promise<object>}
 */
export const obtenerReciboPorId = (id) =>
    apiFetch(`${BASE}/${id}`);

/**
 * Obtiene un recibo a partir del pago asociado.
 * @param {string|number} pagoId
 * @returns {Promise<object>}
 */
export const obtenerReciboPorPagoId = (pagoId) =>
    apiFetch(`${BASE}/pago/${pagoId}`);

/**
 * Lista de recibos de un crédito.
 * @param {string|number} creditoId
 * @param {object} [params] - (opcional) para paginado/filtros (e.g. { page, pageSize })
 * @returns {Promise<Array|object>}
 */
export const obtenerRecibosPorCredito = (creditoId, params) =>
    apiFetch(`${BASE}/credito/${creditoId}`, { params });

/**
 * Lista de recibos de una cuota.
 * @param {string|number} cuotaId
 * @param {object} [params] - (opcional) para paginado/filtros (e.g. { page, pageSize })
 * @returns {Promise<Array|object>}
 */
export const obtenerRecibosPorCuota = (cuotaId, params) =>
    apiFetch(`${BASE}/cuota/${cuotaId}`, { params });

export default {
    obtenerReciboPorId,
    obtenerReciboPorPagoId,
    obtenerRecibosPorCredito,
    obtenerRecibosPorCuota
};
