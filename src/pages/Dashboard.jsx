// src/pages/Dashboard.jsx
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useUserName } from '../utils/getUserName';
import {
  Menu,
  X,
  UserCircle,
  Users,
  NotebookText,
  LogOut,
  Calculator,
  UserSquare,
  Wallet,
  Calendar,
  History,
  Receipt,
  ShoppingCart,
  FileText,
  Building2,
  ChevronRight
} from 'lucide-react';
import { obtenerTareasPendientes } from '../services/tareasService';
import { jwtDecode } from 'jwt-decode';
import Swal from 'sweetalert2';

/* ───────────────── Subcomponentes ───────────────── */

const NavItem = ({ to, children, end }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      [
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
        isActive
          ? 'bg-sky-200 text-sky-900 font-semibold'
          : 'text-sky-100 hover:bg-sky-500/60 hover:text-white'
      ].join(' ')
    }
  >
    {children}
  </NavLink>
);

const GroupHeader = ({ title, open, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="group mb-1 flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[13px] font-semibold tracking-wide text-sky-100 hover:bg-sky-600/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
    aria-expanded={open}
  >
    <span className="opacity-90">{title}</span>
    <ChevronRight
      className={[
        'h-4 w-4 transform transition-transform text-sky-100 opacity-70',
        open ? 'rotate-90' : ''
      ].join(' ')}
      aria-hidden
    />
  </button>
);

/* ───────────────── Principal ───────────────── */

const Dashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userName = useUserName();
  const [hayTareasPendientes, setHayTareasPendientes] = useState(false);
  const location = useLocation();

  // rolId robusto (evita crashear por token inválido)
  const rolId = useMemo(() => {
    const t = localStorage.getItem('token');
    if (!t || t === 'undefined') return null;
    try {
      const decoded = jwtDecode(t);
      return decoded?.rol_id ?? null;
    } catch (err) {
      console.error('Error al decodificar el token:', err);
      return null;
    }
  }, []);

  const isAdmin = rolId === 0 || rolId === 1;
  const isSuperadmin = rolId === 0;
  const isCobrador = rolId === 2;

  // estado de grupos (persistente)
  const [groupsOpen, setGroupsOpen] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('navGroupsOpen') || '{}');
      return {
        operaciones: saved.operaciones ?? true,
        caja: saved.caja ?? true,
        reportes: saved.reportes ?? false
      };
    } catch {
      return { operaciones: true, caja: true, reportes: false };
    }
  });

  // Autoexpande el grupo correspondiente a la ruta actual
  useEffect(() => {
    const path = location.pathname || '';
    setGroupsOpen((prev) => {
      const next = { ...prev };
      if (path.startsWith('/ventas') || path.startsWith('/compras') || path.startsWith('/gastos') || path.startsWith('/proveedores')) {
        next.operaciones = true;
      }
      if (path.startsWith('/caja/')) {
        next.caja = true;
      }
      if (path.startsWith('/usuarios') || path.startsWith('/clientes') || path.startsWith('/informes') || path.startsWith('/presupuestos') || path.startsWith('/tareas-pendientes')) {
        next.reportes = true;
      }
      return next;
    });
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem('navGroupsOpen', JSON.stringify(groupsOpen));
  }, [groupsOpen]);

  const toggleGroup = useCallback(
    (key) => setGroupsOpen((s) => ({ ...s, [key]: !s[key] })),
    []
  );

  // chequeo de tareas pendientes (solo superadmin)
  const checkTareasPendientes = useCallback(async () => {
    try {
      if (!isSuperadmin) return;
      const tareas = await obtenerTareasPendientes();
      setHayTareasPendientes(Array.isArray(tareas) && tareas.length > 0);
    } catch (error) {
      console.error('Error al verificar tareas pendientes:', error?.message);
      setHayTareasPendientes(false);
    }
  }, [isSuperadmin]);

  useEffect(() => {
    checkTareasPendientes();
    const id = setInterval(checkTareasPendientes, 30000);
    return () => clearInterval(id);
  }, [checkTareasPendientes]);

  // Cierra sidebar al navegar en mobile
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  const handleLogout = async () => {
    const confirm = await Swal.fire({
      title: '¿Cerrar sesión?',
      text: '¿Estás seguro de que querés salir?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#0ea5e9',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, salir',
      cancelButtonText: 'Cancelar'
    });
    if (confirm.isConfirmed) {
      localStorage.removeItem('token');
      await Swal.fire({
        title: 'Sesión cerrada',
        text: '¡Hasta pronto!',
        icon: 'success',
        timer: 1100,
        showConfirmButton: false
      });
      window.location.href = '/login';
    }
  };

  return (
    <div className="flex min-h-screen bg-sky-50 text-slate-800">
      {/* Sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 w-72 transform bg-sky-700/95 backdrop-blur',
          'border-r border-white/10',
          'transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        ].join(' ')}
      >
        <div className="flex h-full flex-col p-4">
          {/* Logo + close */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img
                src="/logosye.png"
                alt="Logo"
                className="h-10 rounded bg-white object-contain shadow-sm ring-1 ring-black/5"
              />
              <div className="text-sky-50">
                <div className="text-sm leading-tight opacity-90">Panel</div>
                <div className="text-[11px] opacity-70">Financiera</div>
              </div>
            </div>
            <button
              className="text-sky-100 hover:text-white lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Cerrar menú"
            >
              <X size={24} />
            </button>
          </div>

          {/* Usuario */}
          <div className="mb-4 flex items-center gap-3 rounded-md bg-sky-800/40 p-3 text-sky-100 ring-1 ring-white/10">
            <UserCircle size={40} />
            <div className="min-w-0">
              <p className="text-xs leading-none opacity-80">Bienvenido,</p>
              <p className="truncate text-sm font-semibold">{userName}</p>
            </div>
          </div>

          {/* Navegación (scrollable) */}
          <nav className="flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col gap-3">
              <NavItem to="/" end>
                <NotebookText size={18} />
                Inicio
              </NavItem>

              {/* Admin/Admin+ */}
              {isAdmin && (
                <>
                  {/* Operaciones */}
                  <div>
                    <GroupHeader
                      title="Operaciones"
                      open={groupsOpen.operaciones}
                      onToggle={() => toggleGroup('operaciones')}
                    />
                    {groupsOpen.operaciones && (
                      <div className="ml-2 flex flex-col gap-1">
                        <NavItem to="/ventas">
                          <FileText size={18} />
                          Ventas (manuales)
                        </NavItem>
                        <NavItem to="/compras">
                          <ShoppingCart size={18} />
                          Compras
                        </NavItem>
                        <NavItem to="/gastos">
                          <Receipt size={18} />
                          Gastos
                        </NavItem>
                        {/* Proveedores (relacionado a Compras) */}
                        <NavItem to="/proveedores">
                          <Building2 size={18} />
                          Proveedores
                        </NavItem>
                      </div>
                    )}
                  </div>

                  {/* Caja */}
                  <div>
                    <GroupHeader
                      title="Caja"
                      open={groupsOpen.caja}
                      onToggle={() => toggleGroup('caja')}
                    />
                    {groupsOpen.caja && (
                      <div className="ml-2 flex flex-col gap-1">
                        <NavItem to="/caja/diaria">
                          <Wallet size={18} />
                          Diaria
                        </NavItem>
                        <NavItem to="/caja/mensual">
                          <Calendar size={18} />
                          Mensual
                        </NavItem>
                        <NavItem to="/caja/historial">
                          <History size={18} />
                          Historial
                        </NavItem>
                      </div>
                    )}
                  </div>

                  {/* Gestión y reportes */}
                  <div>
                    <GroupHeader
                      title="Gestión y reportes"
                      open={groupsOpen.reportes}
                      onToggle={() => toggleGroup('reportes')}
                    />
                    {groupsOpen.reportes && (
                      <div className="ml-2 flex flex-col gap-1">
                        <NavItem to="/usuarios">
                          <Users size={18} />
                          Usuarios
                        </NavItem>
                        <NavItem to="/clientes">
                          <UserCircle size={18} />
                          Clientes
                        </NavItem>
                        <NavItem to="/informes">
                          <NotebookText size={18} />
                          Informes
                        </NavItem>
                        <NavItem to="/presupuestos">
                          <NotebookText size={18} />
                          Presupuestos
                        </NavItem>
                        <NavItem to="/tareas-pendientes">
                          <div className="relative flex items-center gap-2">
                            <NotebookText size={18} />
                            Tareas pendientes
                            {hayTareasPendientes && (
                              <span
                                className="ml-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 ring-2 ring-sky-700"
                                aria-label="Tareas pendientes"
                                title="Tareas pendientes"
                              />
                            )}
                          </div>
                        </NavItem>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Cobrador */}
              {isCobrador && (
                <NavItem to="/clientes-cobrador">
                  <UserSquare size={18} />
                  Mis clientes
                </NavItem>
              )}

              {/* Común */}
              <NavItem to="/cotizador">
                <Calculator size={18} />
                Cotizador
              </NavItem>
            </div>
          </nav>

          {/* Logout */}
          <button
            className="mt-4 inline-flex items-center gap-2 rounded-md px-2 py-1 text-red-100 transition hover:bg-red-500/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            onClick={handleLogout}
          >
            <LogOut size={18} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar (mobile) */}
        <header className="sticky top-0 z-30 flex items-center justify-between bg-white/80 px-4 py-3 shadow backdrop-blur lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg border border-gray-300 p-2 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            aria-label="Abrir menú"
          >
            <Menu size={22} className="text-gray-700" />
          </button>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet context={{ checkTareasPendientes }} />
        </main>
      </div>
    </div>
  );
};

export default Dashboard;