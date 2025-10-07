// src/pages/GestionCredito.jsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { Plus, ArrowLeft, CreditCard, BadgeDollarSign } from 'lucide-react';
import { jwtDecode } from 'jwt-decode';

import CreditForm from '../components/CreditForm';
// ⬇️ ahora usamos InfoCreditos en lugar del listado manual con CreditItem
import InfoCreditos from '../components/InfoCreditos';

import {
  obtenerCreditosPorCliente,
  obtenerCreditoPorId,
  crearCredito,
  actualizarCredito,
  verificarEliminableCredito,
  eliminarCreditoSeguro
} from '../services/creditoService';

import { obtenerClientePorId } from '../services/clienteService';
import { obtenerCobradoresConZonas } from '../services/usuarioService';
import { solicitarAnulacionCredito } from '../services/tareasService';

/* ======= Utilidades UI ======= */
const formatARS = (n) =>
  Number(n || 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const GestionCredito = () => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const params = useParams();

  // Puede venir por state (cliente seleccionado) o por :id de crédito
  const clienteState = state?.cliente || null;
  const [cliente, setCliente] = useState(clienteState);

  const [creditos, setCreditos] = useState([]);
  const [cobradores, setCobradores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const token = localStorage.getItem('token');
  const decoded = token ? jwtDecode(token) : {};
  const rol_id = Number(decoded?.rol_id ?? decoded?.rolId ?? decoded?.roleId ?? NaN);

  const cargarPorCliente = useCallback(
    async (clienteId) => {
      setLoading(true);
      setError('');
      try {
        const [credResp, cobrResp, cliResp] = await Promise.all([
          obtenerCreditosPorCliente(clienteId),
          obtenerCobradoresConZonas(),
          cliente ? Promise.resolve(cliente) : obtenerClientePorId(clienteId)
        ]);

        const listaCreditos = Array.isArray(credResp)
          ? credResp
          : Array.isArray(credResp?.creditos)
          ? credResp.creditos
          : [];

        setCreditos(listaCreditos);
        setCobradores(cobrResp || []);
        if (!cliente) setCliente(cliResp || null);
      } catch (err) {
        setError(err?.message || 'Error al cargar datos');
      } finally {
        setLoading(false);
      }
    },
    [cliente]
  );

  const cargarPorCredito = useCallback(
    async (creditoId) => {
      setLoading(true);
      setError('');
      try {
        const credito = await obtenerCreditoPorId(creditoId);
        const clienteId = credito?.cliente_id ?? credito?.cliente?.id ?? null;

        if (!clienteId) {
          throw new Error('No se pudo determinar el cliente del crédito.');
        }

        await cargarPorCliente(clienteId);
      } catch (err) {
        setError(err?.message || 'Error al cargar el crédito');
      } finally {
        setLoading(false);
      }
    },
    [cargarPorCliente]
  );

  // Efecto inicial: decide el modo de carga
  useEffect(() => {
    const creditoIdParam = params?.id ? Number(params.id) : null;

    if (creditoIdParam) {
      cargarPorCredito(creditoIdParam);
      return;
    }

    if (clienteState?.id) {
      cargarPorCliente(clienteState.id);
      return;
    }

    // Sin cliente y sin :id → volvemos a clientes
    navigate('/clientes');
  }, [params?.id, clienteState?.id, cargarPorCliente, cargarPorCredito, navigate]);

  const reload = useCallback(async () => {
    if (cliente?.id) {
      await cargarPorCliente(cliente.id);
    }
  }, [cliente?.id, cargarPorCliente]);

  const iniciarNuevo = () => {
    setEdit(null);
    setShowForm(true);
  };

  const iniciarEdicion = (credito) => {
    // Si es libre, dejar valores consistentes desde el inicio del form
    const patch = { ...credito };
    if (patch.modalidad_credito === 'libre') {
      patch.tipo_credito = 'mensual';
      patch.cantidad_cuotas = 1;
      // interes ya viene en % por ciclo desde el back
    }
    setEdit(patch);
    setShowForm(true);
  };

  const handleSubmit = async (payloadFromForm) => {
    setIsSubmitting(true);
    try {
      if (!cliente?.id) throw new Error('Cliente no definido.');
      if (edit) {
        await actualizarCredito(edit.id, payloadFromForm);
        await Swal.fire('Actualizado', 'Crédito modificado.', 'success');
      } else {
        await crearCredito({ ...payloadFromForm, cliente_id: cliente.id });
        await Swal.fire('Creado', 'Crédito asignado.', 'success');
      }
      setShowForm(false);
      setEdit(null);
      await reload();
    } catch (err) {
      await Swal.fire('Error', err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (rol_id === 0) {
      try {
        const { eliminable, cantidadPagos } = await verificarEliminableCredito(id);
        if (!eliminable) {
          await Swal.fire({
            icon: 'info',
            title: 'No es posible eliminar',
            text: `Este crédito tiene ${cantidadPagos} pago(s) registrado(s). No se puede eliminar.`,
            confirmButtonText: 'Entendido'
          });
          return;
        }

        const res = await Swal.fire({
          title: '¿Eliminar crédito?',
          text: 'Esta acción eliminará definitivamente el crédito y sus cuotas.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, eliminar',
          cancelButtonText: 'Cancelar'
        });
        if (!res.isConfirmed) return;

        await eliminarCreditoSeguro(id);
        await Swal.fire('Eliminado', 'Crédito eliminado correctamente.', 'success');
        await reload();
      } catch (err) {
        await Swal.fire('Error', err?.message || 'No se pudo eliminar el crédito', 'error');
      }
    } else {
      const { value: motivo } = await Swal.fire({
        title: 'Solicitar anulación del crédito',
        input: 'text',
        inputLabel: 'Motivo de la solicitud',
        inputPlaceholder: 'Ingrese un motivo...',
        showCancelButton: true,
        confirmButtonText: 'Solicitar',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
          if (!value) return 'El motivo es obligatorio';
        }
      });
      if (!motivo) return;

      try {
        await solicitarAnulacionCredito({ creditoId: id, motivo, userId: decoded?.id });
        await Swal.fire('Solicitud enviada', 'Esperando aprobación del superadmin.', 'success');
        await reload();
      } catch (err) {
        await Swal.fire('Error', err.message, 'error');
      }
    }
  };

  if (loading) return <p className="text-sm text-gray-600">Cargando créditos…</p>;
  if (error) return <p className="text-sm text-red-500">{error}</p>;

  return (
    <section className="max-w-5xl mx-auto space-y-6 rounded-xl bg-white p-4 sm:p-6 shadow ring-1 ring-gray-200">
      <header className="flex items-center gap-2">
        <CreditCard size={20} className="text-green-600" />
        <h2 className="text-base sm:text-lg font-semibold tracking-tight">Gestión de Créditos</h2>
        <button
          onClick={() => navigate('/clientes')}
          className="ml-auto text-gray-500 transition hover:text-gray-700"
          title="Volver"
          aria-label="Volver"
        >
          <ArrowLeft size={20} />
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
        <BadgeDollarSign size={16} className="text-gray-500" />
        <span>
          Cliente: {cliente?.nombre} {cliente?.apellido}
        </span>
      </div>

      {!showForm && (
        <button
          onClick={iniciarNuevo}
          className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-white transition hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
        >
          <Plus size={16} /> Asignar nuevo crédito
        </button>
      )}

      {showForm && (
        <CreditForm
          defaultValues={
            edit
              ? {
                  ...edit,
                  // fechas a Y-M-D
                  fecha_acreditacion: edit.fecha_acreditacion?.split('T')[0] || edit.fecha_acreditacion || '',
                  fecha_compromiso_pago:
                    edit.fecha_compromiso_pago?.split('T')[0] || edit.fecha_compromiso_pago || '',
                  fecha_solicitud: edit.fecha_solicitud?.split('T')[0] || edit.fecha_solicitud || ''
                }
              : {
                  cobrador_id: '',
                  monto_acreditar: '',
                  interes: '',
                  cantidad_cuotas: '',
                  tipo_credito: '',
                  fecha_acreditacion: new Date().toISOString().split('T')[0]
                }
          }
          cobradores={cobradores}
          submitting={isSubmitting}
          onCancel={() => {
            setShowForm(false);
            setEdit(null);
          }}
          onSubmit={handleSubmit}
        />
      )}

      {/* ⬇️ Listado de créditos con InfoCreditos */}
      <div className="space-y-4">
        {creditos.length === 0 ? (
          <p className="text-gray-500 text-sm">Este cliente no tiene créditos.</p>
        ) : (
          <InfoCreditos
            creditos={creditos}
            refetchCreditos={reload}
            /* Si necesitás exponer acciones de edición/eliminación desde InfoCreditos,
               se pueden pasar callbacks por props adicionales si ese componente las soporta. */
          />
        )}
      </div>
    </section>
  );
};

export default GestionCredito;
