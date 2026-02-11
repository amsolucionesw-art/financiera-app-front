// src/services/authService.js
import apiFetch from './apiClient';
import { jwtDecode } from 'jwt-decode';

/**
 * Inicia sesión y guarda el token en localStorage.
 * - Usa apiFetch.
 * - Acepta que el backend devuelva { token } o { access_token } (o dentro de { data }).
 * - Guarda el token en 'token' y 'authToken' por compatibilidad.
 */
export const login = async (nombre_usuario, password) => {
  // ✅ IMPORTANTE: path relativo (sin /api). apiClient aplica VITE_API_PREFIX.
  // Evitamos slash inicial para no depender de cómo se normalice en el builder.
  const resp = await apiFetch('auth/login', {
    method: 'POST',
    body: { nombre_usuario, password },
  });

  // apiFetch puede devolver el payload directo o { data }
  const data = resp && resp.data !== undefined ? resp.data : resp;
  const token = data?.token || data?.access_token;

  if (!token) {
    throw new Error('No se recibió el token de autenticación.');
  }

  // Compatibilidad: algunas partes del front buscan token/authToken
  localStorage.setItem('token', token);
  localStorage.setItem('authToken', token);

  return token;
};

/** Devuelve el token almacenado (o null si no hay) */
export const getToken = () =>
  localStorage.getItem('token') ||
  localStorage.getItem('authToken') ||
  null;

/** Elimina el token y “desloguea” al usuario en el front */
export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('authToken');
};

/** Retorna true si hay token en storage */
export const isAuthenticated = () => Boolean(getToken());

/**
 * Retorna el payload decodificado del JWT (o null si no hay token o no se puede decodificar).
 * Nota: decodificar != validar. La validación real siempre es backend.
 */
export const getDecodedToken = () => {
  const token = getToken();
  if (!token) return null;

  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
};

/**
 * Retorna rol_id como Number (0/1/2) o null.
 * Soporta distintas formas de payload (por compatibilidad con tokens viejos/nuevos).
 */
export const getRolId = () => {
  const decoded = getDecodedToken();
  if (!decoded) return null;

  const rid =
    decoded?.rol_id ??
    decoded?.rolId ??
    decoded?.role_id ??
    decoded?.roleId ??
    decoded?.rol ??
    decoded?.role ??
    decoded?.usuario?.rol_id ??
    null;

  return rid != null ? Number(rid) : null;
};

/**
 * Retorna el id del usuario del token (si existe) o null.
 * Útil para reglas tipo "solo mi cartera".
 */
export const getUserId = () => {
  const decoded = getDecodedToken();
  if (!decoded) return null;

  const uid =
    decoded?.id ??
    decoded?.userId ??
    decoded?.usuario?.id ??
    decoded?.uid ??
    null;

  return uid != null ? Number(uid) : null;
};