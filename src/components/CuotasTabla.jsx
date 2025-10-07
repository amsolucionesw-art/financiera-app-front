// src/components/CuotasTabla.jsx
import { useMemo, useState } from 'react';
import { parseISO, format, isAfter } from 'date-fns';
import { CreditCard, CheckCircle2 } from 'lucide-react';
import CuotaModal from './CuotaModal';
import CuotaDetalleModal from './CuotaDetalleModal';
import { estadoColors } from '../utils/colors';

const VTO_FICTICIO_LIBRE = '2099-12-31';

const CuotasTabla = ({
    cuotas = [],
    interesCredito,
    refetch = () => {}
}) => {
    const [seleccionada, setSeleccionada] = useState(null);
    const [cuotaDetalle, setCuotaDetalle] = useState(null);

    if (!cuotas.length) {
        return (
            <p className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-700 ring-1 ring-yellow-200">
                Este crédito no tiene cuotas generadas.
            </p>
        );
    }

    // Detecta modalidad "libre" por vencimiento ficticio
    const esLibre = useMemo(
        () => cuotas.some(q => String(q.fecha_vencimiento) === VTO_FICTICIO_LIBRE),
        [cuotas]
    );

    const hoy = new Date();

    const filas = cuotas.map((c) => {
        const importeCuota = Number(c.importe_cuota || 0);                // importe programado
        const interesesMora = Number(c.intereses_vencidos_acumulados || 0);
        const descuentoCuota = Number(c.descuento_cuota || 0);
        const netoPrincipal = Math.max(importeCuota - descuentoCuota, 0);
        const pagado = Number(c.monto_pagado_acumulado || 0);

        // % pagado (solo tiene sentido en no-libre)
        const base = netoPrincipal;
        const pctRaw = base > 0 ? (pagado / base) * 100 : 0;
        const pctWidth = c.estado === 'pagada' ? 100 : Math.min(Math.max(pctRaw, 0), 100);
        const pctText = c.estado === 'pagada' ? 100 : Math.round(pctWidth);

        // Nunca se considera vencida si es "libre"
        const vencidaNoLibre =
            c.estado === 'vencida' ||
            (c.estado !== 'pagada' && isAfter(hoy, parseISO(c.fecha_vencimiento)));
        const vencida = esLibre ? false : vencidaNoLibre;

        const esVtoLibre = String(c.fecha_vencimiento) === VTO_FICTICIO_LIBRE;

        return (
            <tr
                key={c.id}
                className={`whitespace-nowrap text-center transition hover:bg-green-50 ${
                    vencida ? 'bg-red-50' : 'odd:bg-white even:bg-gray-50'
                }`}
            >
                {/* Nº */}
                <td
                    className="px-4 py-2 cursor-pointer font-mono text-blue-600 hover:underline"
                    onClick={() => setCuotaDetalle(c)}
                    title="Ver detalle de la cuota"
                >
                    #{c.numero_cuota}
                </td>

                {/* Columna 2: importe */}
                <td className="px-4 py-2">
                    $
                    {importeCuota.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}
                </td>

                {/* Solo NO libre: Intereses mora */}
                {!esLibre && (
                    <td className="px-4 py-2">
                        $
                        {interesesMora.toLocaleString('es-AR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}
                    </td>
                )}

                {/* Solo NO libre: Descuento aplicado a la cuota */}
                {!esLibre && (
                    <td className="px-4 py-2">
                        $
                        {descuentoCuota.toLocaleString('es-AR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}
                    </td>
                )}

                {/* Solo NO libre: Principal neto */}
                {!esLibre && (
                    <td className="px-4 py-2">
                        $
                        {netoPrincipal.toLocaleString('es-AR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}
                    </td>
                )}

                {/* Vencimiento */}
                <td className="px-4 py-2">
                    {esVtoLibre ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                            Cuota abierta (sin vencimiento)
                        </span>
                    ) : (
                        format(parseISO(c.fecha_vencimiento), 'dd/MM/yyyy')
                    )}
                </td>

                {/* Estado */}
                <td className="px-4 py-2">
                    <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            estadoColors[c.estado] || 'bg-gray-200 text-gray-700'
                        }`}
                    >
                        {c.estado}
                    </span>
                </td>

                {/* % pagado (solo no-libre) */}
                {!esLibre && (
                    <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-1">
                            <div className="h-2 w-24 overflow-hidden rounded bg-gray-200">
                                <div
                                    className="h-full rounded bg-green-500"
                                    style={{ width: `${pctWidth}%` }}
                                />
                            </div>
                            <span className="text-xs tabular-nums">{pctText}%</span>
                        </div>
                    </td>
                )}

                {/* Acción */}
                <td className="px-4 py-2">
                    {c.estado !== 'pagada' ? (
                        esLibre ? (
                            <span
                                className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200"
                                title="Usá 'Abono parcial' o 'Liquidar crédito' en la tarjeta del crédito (arriba)."
                            >
                                Acciones en la tarjeta
                            </span>
                        ) : (
                            <button
                                onClick={() => setSeleccionada(c)}
                                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
                            >
                                <CreditCard size={14} /> Registrar pago
                            </button>
                        )
                    ) : (
                        <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircle2 size={14} /> Pagada
                        </span>
                    )}
                </td>
            </tr>
        );
    });

    const columnas = esLibre
        ? [
            'N°',
            'Importe del ciclo (capital + interés)',
            'Vencimiento',
            'Estado',
            'Acción'
          ]
        : [
            'N°',
            'Cuota original',
            'Intereses mora',
            'Descuento',
            'Principal neto',
            'Vencimiento',
            'Estado',
            '% pagado',
            'Acción'
          ];

    return (
        <>
            <div className="overflow-x-auto rounded-xl shadow ring-1 ring-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 uppercase tracking-wider text-gray-600">
                        <tr>
                            {columnas.map((th) => (
                                <th key={th} className="px-4 py-3 text-center font-semibold">
                                    {th}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>{filas}</tbody>
                </table>
            </div>

            {seleccionada && (
                <CuotaModal
                    cuota={seleccionada}
                    interesCredito={interesCredito}
                    onClose={() => setSeleccionada(null)}
                    onSuccess={() => {
                        setSeleccionada(null);
                        refetch();
                    }}
                />
            )}

            {cuotaDetalle && (
                <CuotaDetalleModal
                    cuota={cuotaDetalle}
                    onClose={() => setCuotaDetalle(null)}
                />
            )}
        </>
    );
};

export default CuotasTabla;
