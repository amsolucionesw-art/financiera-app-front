// src/pages/ClienteDetalle.jsx

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    obtenerCreditosPorCliente,
    solicitarAnulacionCredito,
    eliminarCreditoSeguro
} from '../services/creditoService';
import InfoCliente from '../components/InfoCliente';
// ⬇️ usamos CreditItem en lugar de InfoCreditos
import CreditItem from '../components/CreditItem';
import { ChevronLeft } from 'lucide-react';
import Swal from 'sweetalert2';
import { jwtDecode } from 'jwt-decode';

/* ======= Chips de estado (estilo consistente con Gestión) ======= */
const estadoChip = (estadoRaw) => {
    const estado = (estadoRaw || '').toLowerCase();
    const base =
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] sm:text-xs font-medium ring-1 ring-inset';
    switch (estado) {
        case 'pagada':
        case 'pagado':
            return `${base} bg-green-100 text-green-700 ring-green-200`;
        case 'pendiente':
            return `${base} bg-yellow-100 text-yellow-700 ring-yellow-200`;
        case 'vencida':
        case 'vencido':
            return `${base} bg-red-100 text-red-700 ring-red-200`;
        case 'parcial':
            return `${base} bg-blue-100 text-blue-700 ring-blue-200`;
        default:
            return `${base} bg-gray-100 text-gray-700 ring-gray-200`;
    }
};

const formatARS = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

/* ======= Panel inline de detalle de crédito (reusado de Gestión) ======= */
const CreditoDetalleInline = ({ credito }) => {
    const cuotas = Array.isArray(credito?.cuotas) ? [...credito.cuotas] : [];
    cuotas.sort((a, b) => (a.numero_cuota || 0) - (b.numero_cuota || 0));

    return (
        <div className="mt-2 w-full max-w-full rounded-lg border border-gray-200 bg-gray-50 p-3">
            {/* Resumen */}
            <div className="grid grid-cols-1 gap-2 text-xs sm:text-sm md:grid-cols-4">
                <div>
                    <span className="text-gray-600">Total a devolver:</span>{' '}
                    <span className="font-medium text-gray-800">
                        {formatARS(credito.monto_total_devolver ?? 0)}
                    </span>
                </div>
                <div>
                    <span className="text-gray-600">Saldo actual:</span>{' '}
                    <span className="font-medium text-gray-800">
                        {formatARS(credito.saldo_actual ?? 0)}
                    </span>
                </div>
                <div>
                    <span className="text-gray-600">Interés total:</span>{' '}
                    <span className="font-medium text-gray-800">{Number(credito.interes ?? 0)}%</span>
                </div>
                <div>
                    <span className="text-gray-600">Cuotas:</span>{' '}
                    <span className="font-medium text-gray-800">{credito.cantidad_cuotas ?? '-'}</span>
                </div>
            </div>

            {/* MOBILE */}
            <div className="mt-3 space-y-2 md:hidden">
                {cuotas.length === 0 ? (
                    <div className="rounded-md bg-white p-3 text-center text-gray-500 ring-1 ring-gray-200">
                        No hay cuotas cargadas.
                    </div>
                ) : (
                    cuotas.map((q) => (
                        <div key={q.id} className="rounded-md bg-white p-3 ring-1 ring-gray-200">
                            <div className="mb-2 flex items-center justify-between text-xs">
                                <div className="font-medium text-gray-700">Cuota #{q.numero_cuota}</div>
                                <span className={estadoChip(q.estado)}>{q.estado}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="text-gray-600">Importe</div>
                                <div className="text-right font-medium text-gray-800">
                                    {formatARS(q.importe_cuota)}
                                </div>

                                <div className="text-gray-600">Vencimiento</div>
                                <div className="text-right font-medium text-gray-800">
                                    {q.fecha_vencimiento
                                        ? new Date(q.fecha_vencimiento).toLocaleDateString('es-AR')
                                        : '-'}
                                </div>

                                <div className="text-gray-600">Pagado acum.</div>
                                <div className="text-right font-medium text-gray-800">
                                    {formatARS(q.monto_pagado_acumulado ?? 0)}
                                </div>

                                <div className="text-gray-600">Desc. acum.</div>
                                <div className="text-right font-medium text-gray-800">
                                    {formatARS(q.descuento_cuota ?? 0)}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* DESKTOP/TABLET */}
            <div className="mt-3 hidden overflow-x-auto rounded-md ring-1 ring-gray-200 md:block">
                <table className="min-w-[720px] w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-white">
                        <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Importe</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Vencimiento</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Estado</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Pagado acum.</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Desc. acum.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                        {cuotas.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-3 py-3 text-center text-gray-500">
                                    No hay cuotas cargadas.
                                </td>
                            </tr>
                        ) : (
                            cuotas.map((q) => (
                                <tr key={q.id}>
                                    <td className="px-3 py-2">{q.numero_cuota}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{formatARS(q.importe_cuota)}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        {q.fecha_vencimiento
                                            ? new Date(q.fecha_vencimiento).toLocaleDateString('es-AR')
                                            : '-'}
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className={estadoChip(q.estado)}>{q.estado}</span>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        {formatARS(q.monto_pagado_acumulado ?? 0)}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        {formatARS(q.descuento_cuota ?? 0)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ClienteDetalle = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [cliente, setCliente] = useState(null);
    const [error, setError] = useState('');
    const [abiertoId, setAbiertoId] = useState(null);

    // === Rol actual para habilitar acciones ===
    const token = typeof window !== 'undefined'
        ? (localStorage.getItem('token') || sessionStorage.getItem('token'))
        : null;

    let rol_id = null;
    try {
        if (token) {
            const decoded = jwtDecode(token);
            rol_id = typeof decoded?.rol_id === 'number' ? decoded.rol_id : Number(decoded?.rol_id ?? null);
        }
    } catch {
        rol_id = null;
    }

    // Para evitar duplicar solicitudes del mismo crédito en la sesión (solo ADMIN)
    const [solicitudesPendientesLocal, setSolicitudesPendientesLocal] = useState(() => new Set());

    /*  🔄  Trae o vuelve a traer todos los datos  */
    const fetchCreditos = useCallback(async () => {
        try {
            const data = await obtenerCreditosPorCliente(id);
            setCliente(data); // data: { …, creditos: [...] }
            setError('');
        } catch (err) {
            setError(err?.message || 'Error al cargar el cliente');
        }
    }, [id]);

    /*  Carga inicial  */
    useEffect(() => {
        fetchCreditos();
    }, [fetchCreditos]);

    if (error) return <p className="text-red-600">{error}</p>;
    if (!cliente) return <p>Cargando cliente…</p>;

    const onView = (credito) =>
        setAbiertoId((prev) => (prev === credito.id ? null : credito.id));

    const onEdit = () =>
        window.alert('La edición se realiza desde Gestión de Créditos.');

    // 🧰 Acciones de borrar/anular según rol
    const onDelete = async (credito) => {
        const creditoId = credito?.id;
        if (!creditoId) {
            window.alert('Crédito inválido.');
            return;
        }

        const estado = String(credito?.estado || '').toLowerCase();

        // 🚫 Bloqueamos anulación / eliminación para créditos pagados desde la ficha del cliente
        if (estado === 'pagado' || estado === 'pagada') {
            await Swal.fire({
                title: 'Acción no disponible',
                text: 'No se puede anular o eliminar un crédito pagado desde la ficha del cliente.',
                icon: 'info',
                confirmButtonText: 'OK'
            });
            return;
        }

        const refinanciadoOriginal = estado === 'refinanciado';
        const anulado = estado === 'anulado';
        if (refinanciadoOriginal || anulado) {
            window.alert('Acción no disponible para este crédito.');
            return;
        }

        if (rol_id === 0) {
            // SUPERADMIN → eliminar directo
            const ok = await Swal.fire({
                title: `¿Eliminar crédito #${creditoId}?`,
                text: 'Esta acción es permanente. Si el crédito tiene pagos registrados, no podrá eliminarse.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc2626',
                cancelButtonColor: '#6b7280',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar'
            }).then(r => r.isConfirmed);

            if (!ok) return;

            try {
                await eliminarCreditoSeguro(creditoId);
                await fetchCreditos();
                await Swal.fire('Eliminado', 'El crédito fue eliminado correctamente.', 'success');
            } catch (e) {
                const msg = e?.message || 'No se pudo eliminar el crédito.';
                await Swal.fire('Error', msg, 'error');
            }
            return;
        }

        if (rol_id === 1) {
            // ADMIN → solicitar anulación
            if (solicitudesPendientesLocal.has(creditoId)) {
                window.alert('Ya enviaste una solicitud de anulación para este crédito y aún está pendiente.');
                return;
            }

            const { isConfirmed, value: motivo } = await Swal.fire({
                title: `Solicitar anulación del crédito #${creditoId}`,
                input: 'textarea',
                inputLabel: 'Motivo (obligatorio)',
                inputPlaceholder: 'Ingresá el motivo de la solicitud…',
                inputAttributes: { 'aria-label': 'Motivo' },
                inputValidator: (v) => (!v || !v.trim() ? 'El motivo es obligatorio' : undefined),
                showCancelButton: true,
                confirmButtonText: 'Enviar solicitud',
                cancelButtonText: 'Cancelar',
                icon: 'warning',
                focusConfirm: true,
            });

            if (!isConfirmed) return;

            try {
                setSolicitudesPendientesLocal((prev) => new Set(prev).add(creditoId));
                await solicitarAnulacionCredito({ creditoId, motivo: motivo.trim() });
                await fetchCreditos();
                await Swal.fire({
                    title: 'Solicitud enviada',
                    text: 'El superadmin revisará y aprobará o rechazará tu solicitud.',
                    icon: 'success',
                    confirmButtonText: 'OK'
                });
            } catch (e) {
                setSolicitudesPendientesLocal((prev) => {
                    const next = new Set(prev);
                    next.delete(creditoId);
                    return next;
                });
                await Swal.fire({
                    title: 'No se pudo enviar la solicitud',
                    text: e?.message || 'Error inesperado',
                    icon: 'error',
                    confirmButtonText: 'OK'
                });
            }
            return;
        }

        // Otros roles (cobrador u otros)
        window.alert('La eliminación se gestiona desde Gestión de Créditos.');
    };

    return (
        <div>
            {/* Botón para volver atrás */}
            <button
                onClick={() => navigate(-1)}
                className="mb-4 flex items-center gap-1 text-sky-600 hover:underline"
            >
                <ChevronLeft size={18} />
                Volver
            </button>

            <h2 className="mb-4 text-2xl font-bold">Ficha del Cliente</h2>

            {/* Datos generales */}
            <InfoCliente cliente={cliente} creditos={cliente.creditos} />

            {/* Créditos (con CreditItem) */}
            <div className="mt-6 space-y-4">
                {Array.isArray(cliente.creditos) && cliente.creditos.length > 0 ? (
                    cliente.creditos.map((c) => (
                        <div key={c.id} className="space-y-2">
                            <CreditItem
                                c={c}
                                onEdit={onEdit}
                                onDelete={onDelete}   // handler centralizado con control por estado
                                onView={onView}
                            />
                            {abiertoId === c.id && <CreditoDetalleInline credito={c} />}
                        </div>
                    ))
                ) : (
                    <p className="text-sm text-gray-500">Este cliente no tiene créditos.</p>
                )}
            </div>
        </div>
    );
};

export default ClienteDetalle;

