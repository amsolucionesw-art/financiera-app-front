// src/pages/Welcome.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { AlertTriangle, CreditCard, FileText, CalendarDays } from 'lucide-react';
import { useUserName } from '../utils/getUserName';
import { obtenerCuotasVencidas } from '../services/cuotaService';

/* ─────────────────────────────
   Rutas centralizadas (ajustá si tu router usa otras)
   ───────────────────────────── */
const PATHS = {
    crearCredito: '/creditos/nuevo',
    // ANTES: '/informes?tipo=cuotas&estadoCuota=vencida'
    verVencidas: '/cuotas/vencidas',
    rutaCobrador: '/clientes/por-cobrador',
    cuotasACobrar: '/creditos'
};

const getRolIdFromToken = () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
        const decoded = jwtDecode(token);
        const raw = decoded?.rol_id ?? decoded?.rolId ?? decoded?.roleId ?? decoded?.role ?? null;
        const asNum = typeof raw === 'string' ? Number(raw) : raw;
        return Number.isFinite(asNum) ? asNum : null;
    } catch {
        return null;
    }
};

const timeGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return '¡Buenos días';
    if (h < 19) return '¡Buenas tardes';
    return '¡Buenas noches';
};

const Avatar = ({ name }) => {
    const initial = (name?.trim?.()[0] ?? 'U').toUpperCase();
    return (
        <div
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700 font-semibold"
        >
            {initial}
        </div>
    );
};

const Welcome = () => {
    const navigate = useNavigate();
    const userName = useUserName();
    const rolId = useMemo(getRolIdFromToken, []);
    const isAdmin = rolId === 0 || rolId === 1;
    const isCobrador = rolId === 2;

    const [loading, setLoading] = useState(false);
    const [overdueCount, setOverdueCount] = useState(0);
    const [error, setError] = useState('');

    // Accesibilidad: texto vivo para lectores de pantalla
    const ariaStatus =
        overdueCount > 0
            ? `Hay ${overdueCount} ${overdueCount === 1 ? 'cuota vencida' : 'cuotas vencidas'}`
            : 'Sin cuotas vencidas';

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!isAdmin) return; // Solo Admin/Superadmin ven el banner global
            try {
                setLoading(true);
                setError('');
                // ✅ Ahora usamos el endpoint dedicado de cuotas vencidas
                const data = await obtenerCuotasVencidas();
                const arr = Array.isArray(data) ? data : (data?.data ?? []);
                if (alive) setOverdueCount(arr.length || 0);
            } catch (e) {
                if (alive) setError(e?.message || 'No se pudo cargar la lista de vencidas');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [isAdmin]);

    const greeting = useMemo(timeGreeting, []);

    // Guarda el destino deseado por si el token expiró y el router manda al login
    const rememberRedirect = (to) => {
        try {
            localStorage.setItem('redir_after_login', to);
        } catch {
            /* noop */
        }
    };

    return (
        <section className="h-full overflow-y-auto p-6">
            {/* SR-only live region */}
            <div role="status" aria-live="polite" className="sr-only">
                {ariaStatus}
            </div>

            {/* Header con saludo y quick actions */}
            <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Avatar name={userName} />
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">
                            {greeting}
                            {userName ? `, ${userName}` : ''}!
                        </h1>
                        <p className="text-sm text-slate-500">¿Qué querés hacer hoy?</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {/* Acciones por rol */}
                    {isAdmin && (
                        <>
                            <Link
                                to={PATHS.crearCredito}
                                onClick={() => rememberRedirect(PATHS.crearCredito)}
                                className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                                aria-label="Crear un nuevo crédito"
                            >
                                <CreditCard size={16} /> Crear crédito
                            </Link>
                        </>
                    )}

                    {isCobrador && (
                        <>
                            <Link
                                to={PATHS.rutaCobrador}
                                onClick={() => rememberRedirect(PATHS.rutaCobrador)}
                                className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                                aria-label="Ver mi ruta de hoy"
                            >
                                <CalendarDays size={16} /> Mi ruta de hoy
                            </Link>

                            <Link
                                to={PATHS.cuotasACobrar}
                                onClick={() => rememberRedirect(PATHS.cuotasACobrar)}
                                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                                aria-label="Ver mis créditos/cuotas a cobrar"
                            >
                                <FileText size={16} /> Cuotas a cobrar
                            </Link>
                        </>
                    )}
                </div>
            </header>

            {/* Banner de vencidas (accionable) */}
            {isAdmin && (
                <>
                    {loading ? (
                        <div className="mb-4 h-12 w-full animate-pulse rounded-md bg-gray-100" />
                    ) : error ? (
                        <div
                            className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-800"
                            role="alert"
                        >
                            {error}
                        </div>
                    ) : overdueCount > 0 ? (
                        <button
                            onClick={() => {
                                // ahora redirige a la tabla dedicada
                                rememberRedirect(PATHS.verVencidas);
                                navigate(PATHS.verVencidas);
                            }}
                            className="mb-4 w-full rounded-md bg-red-50 p-4 text-left ring-1 ring-red-200 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            aria-label={`Ver ${overdueCount} ${
                                overdueCount === 1 ? 'cuota vencida' : 'cuotas vencidas'
                            }`}
                        >
                            <p className="flex items-center gap-2 text-sm font-medium text-red-800">
                                <AlertTriangle size={18} className="shrink-0" />
                                ¡Atención! Hay {overdueCount}{' '}
                                {overdueCount === 1 ? 'cuota vencida' : 'cuotas vencidas'} — Click para ver
                            </p>
                        </button>
                    ) : null}
                </>
            )}

            {/* Estado vacío amigable */}
            <div className="mt-8 flex flex-col items-center justify-center text-center">
                <h2 className="text-xl font-semibold text-slate-800 mb-1">Bienvenido al panel</h2>
                <p className="text-slate-600 max-w-md">
                    Usá las acciones rápidas de arriba o el menú lateral para comenzar.
                </p>
            </div>
        </section>
    );
};

export default Welcome;