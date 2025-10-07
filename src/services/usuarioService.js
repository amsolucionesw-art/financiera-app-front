// src/services/usuarioService.js
import { apiFetch } from './apiClient';
import { jwtDecode } from 'jwt-decode';

const API_PREFIX = import.meta.env.VITE_API_PREFIX || '';  // p. ej. "/api" o ""
const BASE = `${API_PREFIX}/usuarios`;
const ZONAS_BASE = `${API_PREFIX}/zonas`;

/** Extrae el user id del JWT (acepta sub | userId | id) */
const getUserIdFromToken = () => {
    try {
        const token = localStorage.getItem('token');
        if (!token) return null;
        const { sub, userId, id } = jwtDecode(token);
        return sub ?? userId ?? id ?? null;
    } catch {
        return null;
    }
};

/**
 * Perfil del usuario logueado.
 * 1) Intenta GET /usuarios/me
 * 2) Fallback: decodifica el JWT y hace GET /usuarios/:id
 * Devuelve null si no hay token o si ambos pasos fallan.
 */
export const obtenerMiPerfil = async () => {
    // 1) Endpoint directo
    try {
        const me = await apiFetch(`${BASE}/me`);
        if (me) return me;
    } catch (_) {
        // seguimos con fallback
    }

    // 2) Fallback por ID del token
    const uid = getUserIdFromToken();
    if (!uid) return null;

    try {
        return await apiFetch(`${BASE}/${uid}`);
    } catch {
        return null;
    }
};

/** Usuarios (listado, con params opcionales en query) */
export const obtenerUsuarios = (params = {}) =>
    apiFetch(`${BASE}`, { params });

/** Un usuario por ID */
export const obtenerUsuarioPorId = (id) =>
    apiFetch(`${BASE}/${id}`);

/** Crear usuario */
export const crearUsuario = (usuario) =>
    apiFetch(`${BASE}`, {
        method: 'POST',
        body: usuario
    });

/** Actualizar usuario */
export const actualizarUsuario = (id, usuario) =>
    apiFetch(`${BASE}/${id}`, {
        method: 'PUT',
        body: usuario
    });

/** Eliminar usuario */
export const eliminarUsuario = (id) =>
    apiFetch(`${BASE}/${id}`, { method: 'DELETE' });

/** Cobradores (básico: id + nombre_completo) → ideal para <select> */
export const obtenerCobradoresBasico = () =>
    apiFetch(`${BASE}/cobradores`);

/** Cobradores con sus zonas asignadas (para vistas que necesiten cobertura por zonas) */
export const obtenerCobradoresConZonas = () =>
    apiFetch(`${BASE}/cobradores/zonas`);

/** Zonas (por si necesitas cargar/combos, con params opcionales) */
export const obtenerZonas = (params = {}) =>
    apiFetch(`${ZONAS_BASE}`, { params });
