import { Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

const getRolId = () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
        const { exp, rol_id } = jwtDecode(token);
        if (exp && Date.now() >= exp * 1000) {
            localStorage.removeItem('token');
            return null;
        }
        return rol_id;
    } catch {
        localStorage.removeItem('token');
        return null;
    }
};

const PrivateRouteConRol = ({ rolesPermitidos = [] }) => {
    const rolId = getRolId();

    // Si no hay token o expiró, redirige al login
    if (rolId === null) return <Navigate to="/login" replace />;

    // Si el rol no está permitido, redirige al inicio
    if (!rolesPermitidos.includes(rolId)) return <Navigate to="/" replace />;

    // Propaga el contexto recibido del padre (Dashboard) a las rutas hijas
    const context = useOutletContext();

    return <Outlet context={context} />;
};

export default PrivateRouteConRol;

