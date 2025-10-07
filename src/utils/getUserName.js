// src/hooks/useUserName.js
import { useEffect, useState } from 'react';
import { obtenerMiPerfil } from '../services/usuarioService';

/**
 * Hook que devuelve el nombre del usuario logueado.
 * - Lee rápido desde localStorage para no “parpadear”.
 * - Luego consulta /usuarios/me (o fallback del service) y,
 *   si obtiene un nombre más descriptivo, actualiza estado y storage.
 */
export function useUserName() {
    const [userName, setUserName] = useState(
        () => localStorage.getItem('userName') || ''
    );

    useEffect(() => {
        let activo = true;

        (async () => {
            try {
                const perfil = await obtenerMiPerfil();
                if (!perfil || !activo) return;

                const nombreNuevo =
                    perfil.nombre_completo ||
                    perfil.nombre ||
                    perfil.username ||
                    '';

                if (nombreNuevo && nombreNuevo !== userName) {
                    // guardamos y actualizamos; si ya coincide, no dispara re-render extra
                    localStorage.setItem('userName', nombreNuevo);
                    if (activo) setUserName(nombreNuevo);
                }
            } catch {
                // Silenciamos: si falla, nos quedamos con el nombre de localStorage
            }
        })();

        return () => { activo = false; };
        // Ejecutar solo al montar: no necesitamos reconsultar por cada cambio de userName
    }, []);

    return userName;
}
