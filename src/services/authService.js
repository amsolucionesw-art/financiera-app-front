// src/services/authService.js
import { apiFetch } from './apiClient';

/**
 * Inicia sesión y guarda el token en localStorage.
 * - Usa el wrapper apiFetch (base: VITE_API_URL o http://localhost:3000/api).
 * - Acepta que el backend devuelva { token } o { access_token }.
 * - Lanza error con mensaje claro si la API lo envía.
 */
export const login = async (nombre_usuario, password) => {
  const resp = await apiFetch('/auth/login', {
    method: 'POST',
    body: { nombre_usuario, password },
  });

  // apiFetch ya desenvuelve { data } si viene así, pero por si acaso:
  const data = resp && resp.data !== undefined ? resp.data : resp;
  const token = data?.token || data?.access_token;

  if (!token) {
    throw new Error('No se recibió el token de autenticación.');
  }

  // Persistimos para que apiClient lo incluya en Authorization en siguientes requests
  localStorage.setItem('token', token);
  return token;
};

/** Devuelve el token almacenado (o null si no hay) */
export const getToken = () => localStorage.getItem('token') || null;

/** Elimina el token y “desloguea” al usuario en el front */
export const logout = () => localStorage.removeItem('token');

/** Retorna true si hay token en storage */
export const isAuthenticated = () => Boolean(getToken());
