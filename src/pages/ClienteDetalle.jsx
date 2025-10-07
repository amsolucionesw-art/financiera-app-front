// src/pages/ClienteDetalle.jsx

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { obtenerCreditosPorCliente } from '../services/creditoService';
import InfoCliente from '../components/InfoCliente';
// ⬇️ usamos CreditItem en lugar de InfoCreditos
import CreditItem from '../components/CreditItem';
import { ChevronLeft } from 'lucide-react';

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

    const onDelete = () =>
        window.alert('La eliminación se gestiona desde Gestión de Créditos.');

    return (
        <div>
            {/* Botón para volver atrás */}
            <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1 text-sky-600 hover:underline mb-4"
            >
                <ChevronLeft size={18} />
                Volver
            </button>

            <h2 className="text-2xl font-bold mb-4">Ficha del Cliente</h2>

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
                                onDelete={onDelete}
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
