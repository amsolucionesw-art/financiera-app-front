// src/services/zonaService.js
import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';

/** Obtener todas las zonas (ordenadas por backend) */
export const obtenerZonas = () => apiGet('/zonas');

/** Crear zona (body: { nombre }) */
export const crearZona = (data) => apiPost('/zonas', data);

/** Actualizar zona */
export const actualizarZona = (id, data) => apiPut(`/zonas/${id}`, data);

/** Eliminar zona */
export const eliminarZona = (id) => apiDelete(`/zonas/${id}`);
