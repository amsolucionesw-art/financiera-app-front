// src/components/CuotaDetalleModal.jsx

import { useEffect, useState, useMemo } from 'react';
import { X, ListOrdered } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { obtenerPagosPorCuota } from '../services/cuotaService';

const VTO_FICTICIO_LIBRE = '2099-12-31';

const n2 = (v) => Number(v || 0);
const money = (v) =>
    n2(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CuotaDetalleModal = ({ cuota, onClose }) => {
    const [pagos, setPagos] = useState([]);
    const [cargando, setCargando] = useState(true);

    const esLibre = useMemo(
        () => String(cuota?.fecha_vencimiento) === VTO_FICTICIO_LIBRE,
        [cuota?.fecha_vencimiento]
    );

    // Derivados (no-libre)
    const derived = useMemo(() => {
        const importe = n2(cuota?.importe_cuota);
        const desc = n2(cuota?.descuento_cuota);
        const pagado = n2(cuota?.monto_pagado_acumulado);
        const mora = n2(cuota?.intereses_vencidos_acumulados);
        const principalNeto = Math.max(importe - desc, 0);
        const principalPendiente = Math.max(principalNeto - pagado, 0);
        return { importe, desc, pagado, mora, principalNeto, principalPendiente };
    }, [cuota]);

    useEffect(() => {
        if (!cuota?.id) return;
        setCargando(true);
        obtenerPagosPorCuota(cuota.id)
            .then((data) => setPagos(Array.isArray(data) ? data : []))
            .catch(console.error)
            .finally(() => setCargando(false));
    }, [cuota?.id]);

    if (!cuota) return null;

    const {
        numero_cuota,
        estado,
        importe_cuota,
        fecha_vencimiento
    } = cuota;

    const safeFecha =
        fecha_vencimiento && fecha_vencimiento !== VTO_FICTICIO_LIBRE
            ? format(parseISO(fecha_vencimiento), 'dd/MM/yyyy')
            : null;

    return (
        <section className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-auto bg-black bg-opacity-50 p-4">
            <div className="relative w-full max-w-xl bg-white rounded-xl shadow ring-1 ring-gray-200 p-6 animate-fade-in">
                {/* Header */}
                <header className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2">
                        <ListOrdered className="text-blue-600" size={24} />
                        <h2 className="text-xl font-semibold text-gray-900">
                            Detalle — Cuota #{numero_cuota}{' '}
                            {esLibre && <span className="ml-2 text-xs text-emerald-700">(Crédito libre)</span>}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700"
                        aria-label="Cerrar detalle"
                    >
                        <X size={20} />
                    </button>
                </header>

                {/* Resumen de la cuota */}
                <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-800">
                        <li>
                            <span className="font-medium text-gray-600">Estado:</span>{' '}
                            <span className="capitalize">{estado}</span>
                        </li>

                        <li>
                            <span className="font-medium text-gray-600">
                                {esLibre ? 'Importe del ciclo (capital + interés):' : 'Cuota original:'}
                            </span>{' '}
                            ${money(importe_cuota)}
                        </li>

                        <li className="sm:col-span-2">
                            <span className="font-medium text-gray-600">Vencimiento:</span>{' '}
                            {esLibre ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                                    Cuota abierta (sin vencimiento)
                                </span>
                            ) : (
                                safeFecha || '—'
                            )}
                        </li>

                        {/* Desglose sólo para NO libre */}
                        {!esLibre && (
                            <>
                                <li>
                                    <span className="font-medium text-gray-600">Descuento aplicado:</span>{' '}
                                    ${money(derived.desc)}
                                </li>
                                <li>
                                    <span className="font-medium text-gray-600">Principal neto:</span>{' '}
                                    ${money(derived.principalNeto)}
                                </li>
                                <li>
                                    <span className="font-medium text-gray-600">Mora acumulada:</span>{' '}
                                    ${money(derived.mora)}
                                </li>
                                <li>
                                    <span className="font-medium text-gray-600">Pagado a principal:</span>{' '}
                                    ${money(derived.pagado)}
                                </li>
                                <li className="sm:col-span-2">
                                    <span className="font-medium text-gray-600">Principal pendiente:</span>{' '}
                                    ${money(derived.principalPendiente)}
                                </li>
                            </>
                        )}

                        {/* Nota para LIBRE */}
                        {esLibre && (
                            <li className="sm:col-span-2 text-xs text-gray-600">
                                En <b>crédito libre</b> no hay mora ni vencimientos. Los abonos parciales se imputan primero
                                al interés del/los ciclo(s) transcurridos y luego a capital; la cuota se cierra al liquidar el crédito.
                            </li>
                        )}
                    </ul>
                </div>

                {/* Tabla de pagos */}
                <div>
                    <h3 className="text-md font-semibold text-gray-900 mb-2">Pagos registrados</h3>

                    {cargando ? (
                        <p className="text-sm text-gray-500">Cargando pagos...</p>
                    ) : pagos.length === 0 ? (
                        <p className="text-sm text-gray-500">No hay pagos registrados.</p>
                    ) : (
                        <div className="overflow-auto max-h-[50vh] border rounded-lg">
                            <table className="min-w-full text-sm divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium text-gray-700">Fecha</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-700">Monto</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-700">Forma de pago</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-700">Observación</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {pagos.map((pago) => (
                                        <tr key={pago.id} className="odd:bg-white even:bg-gray-50">
                                            <td className="px-4 py-2 text-gray-800">
                                                {pago.fecha_pago ? format(parseISO(pago.fecha_pago), 'dd/MM/yyyy') : '—'}
                                            </td>
                                            <td className="px-4 py-2 text-gray-800">
                                                ${money(pago.monto_pagado)}
                                            </td>
                                            <td className="px-4 py-2 text-gray-800">
                                                {pago.formaPago?.nombre ?? '—'}
                                            </td>
                                            <td className="px-4 py-2 text-gray-800">{pago.observacion || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default CuotaDetalleModal;
