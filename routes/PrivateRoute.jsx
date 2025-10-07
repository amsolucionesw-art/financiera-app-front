import { Navigate, Outlet } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

const isAuthenticated = () => {
    const token = localStorage.getItem('token');
    if (!token) return false;
    try {
        const { exp } = jwtDecode(token);
        if (exp && Date.now() >= exp * 1000) {
            localStorage.removeItem('token');
            return false;
        }
        return true;
    } catch {
        localStorage.removeItem('token');
        return false;
    }
};

const PrivateRoute = () => (
    isAuthenticated() ? <Outlet /> : <Navigate to="/login" replace />
);

export default PrivateRoute;