// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import PrivateRoute from '../routes/privateRoute';
import PrivateRouteConRol from '../routes/PrivateRouteConRol';
import Dashboard from './pages/Dashboard';
import Welcome from './pages/Welcome';

// Páginas
import Login from './pages/Login';
import Clientes from './pages/Clientes';
import ClienteDetalle from './pages/ClienteDetalle';
import ClienteForm from './pages/ClienteForm';
import Creditos from './pages/Creditos';
import CrearCredito from './pages/CrearCredito';
import GestionCredito from './pages/GestionCredito';
import Usuarios from './pages/Usuarios';
import UsuarioForm from './pages/UsuarioForm';
import Informes from './pages/Informes';
import TareasPendientes from './pages/TareasPendientes';
import Cotizador from './pages/Cotizador';
import ClientesCobrador from './pages/ClientesCobrador';
import Presupuestos from './pages/Presupuestos';
import Recibo from './pages/Recibo';

// ✅ Nuevas páginas
import CuotasVencidas from './pages/CuotasVencidas';
import CuotaDetalle from './pages/CuotaDetalle';

// ✅ NUEVO: Ruta de cobro cobrador
import RutaCobro from './pages/RutaCobro';

// ✅ Caja
import CajaDiaria from './pages/CajaDiaria';
import CajaMensual from './pages/CajaMensual';
import CajaHistorial from './pages/CajaHistorial';

// ✅ Gastos
import Gastos from './pages/Gastos';
import GastoForm from './pages/GastoForm';

// ✅ Compras (agregado)
import Compras from './pages/Compras';
import CompraForm from './pages/CompraForm';

// ✅ Ventas (agregado)
import Ventas from './pages/Ventas';
import VentaForm from './pages/VentaForm';

// ✅ Formulario de “Venta Financiada”
import VentaFinanciadaForm from './components/VentaFinanciadaForm';

// ✅ Proveedores (NUEVO)
import Proveedores from './pages/Proveedores';

// Wrapper de página para el formulario financiado (maneja navegación post-acción)
const VentaFinanciadaNuevaPage = () => {
  const navigate = useNavigate();
  return (
    <VentaFinanciadaForm
      onCreated={() => navigate('/ventas')}
      onCancel={() => navigate('/ventas')}
    />
  );
};

const App = () => (
  <BrowserRouter>
    <Routes>
      {/* Pública */}
      <Route path="/login" element={<Login />} />

      {/* Protegida (requiere sesión activa) */}
      <Route element={<PrivateRoute />}>
        <Route path="/" element={<Dashboard />}>
          {/* Accesible para cualquier usuario autenticado */}
          <Route index element={<Welcome />} />
          <Route path="cotizador" element={<Cotizador />} />

          {/* Ruta para ver un Recibo tras el pago */}
          <Route path="recibo/:id" element={<Recibo />} />

          {/* Solo para superadmin (rol 0) */}
          <Route element={<PrivateRouteConRol rolesPermitidos={[0]} />}>
            <Route path="tareas-pendientes" element={<TareasPendientes />} />
          </Route>

          {/* Solo para admin y superadmin (roles 0, 1) */}
          <Route element={<PrivateRouteConRol rolesPermitidos={[0, 1]} />}>
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/nuevo" element={<ClienteForm />} />
            <Route path="clientes/editar/:id" element={<ClienteForm />} />

            <Route path="creditos" element={<Creditos />} />
            <Route path="creditos/cliente/:id" element={<ClienteDetalle />} />

            {/* ✅ Ruta sin parámetro para que el botón "Crear crédito" funcione */}
            <Route path="creditos/nuevo" element={<CrearCredito />} />
            {/* Ruta existente con cliente seleccionado */}
            <Route path="creditos/nuevo/:clienteId" element={<CrearCredito />} />

            {/* ✅ Detalle del crédito por ID */}
            <Route path="creditos/:id" element={<GestionCredito />} />
            <Route path="gestion-creditos" element={<GestionCredito />} />

            <Route path="usuarios" element={<Usuarios />} />
            <Route path="usuarios/nuevo" element={<UsuarioForm />} />
            <Route path="usuarios/:id/editar" element={<UsuarioForm />} />
            <Route path="informes" element={<Informes />} />

            {/* Presupuestos */}
            <Route path="presupuestos" element={<Presupuestos />} />

            {/* ✅ NUEVA: Tabla dedicada de cuotas vencidas */}
            <Route path="cuotas/vencidas" element={<CuotasVencidas />} />

            {/* ✅ NUEVA: Página de detalle de cuota */}
            <Route path="cuotas/:id" element={<CuotaDetalle />} />

            {/* ✅ Caja */}
            <Route path="caja/diaria" element={<CajaDiaria />} />
            <Route path="caja/mensual" element={<CajaMensual />} />
            <Route path="caja/historial" element={<CajaHistorial />} />

            {/* ✅ Gastos */}
            <Route path="gastos" element={<Gastos />} />
            <Route path="gastos/nuevo" element={<GastoForm />} />
            <Route path="gastos/:id/editar" element={<GastoForm />} />

            {/* ✅ Compras (AGREGADO) */}
            <Route path="compras" element={<Compras />} />
            <Route path="compras/nuevo" element={<CompraForm />} />
            <Route path="compras/:id/editar" element={<CompraForm />} />

            {/* ✅ Ventas (AGREGADO) */}
            <Route path="ventas" element={<Ventas />} />
            <Route path="ventas/nuevo" element={<VentaForm />} />
            {/* ✅ NUEVA: Venta financiada (genera Crédito automáticamente) */}
            <Route path="ventas/financiada" element={<VentaFinanciadaNuevaPage />} />

            {/* ✅ Proveedores (NUEVO, solo admin/superadmin) */}
            <Route path="proveedores" element={<Proveedores />} />
          </Route>

          {/* Solo para cobrador (rol 2) */}
          <Route element={<PrivateRouteConRol rolesPermitidos={[2]} />}>
            {/* Ruta original */}
            <Route path="clientes-cobrador" element={<ClientesCobrador />} />

            {/* Alias para que el botón viejo siga funcionando */}
            <Route path="clientes/por-cobrador" element={<ClientesCobrador />} />

            {/* ✅ NUEVO: Ruta de cobro (consume /cuotas/ruta-cobro) */}
            <Route path="cuotas/ruta-cobro" element={<RutaCobro />} />
          </Route>
        </Route>
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;

