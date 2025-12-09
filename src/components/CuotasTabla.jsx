// src/components/CuotasTabla.jsx
import { useMemo, useState } from 'react';
import { parseISO, format } from 'date-fns';
import { CreditCard, CheckCircle2 } from 'lucide-react';
import CuotaModal from './CuotaModal';
import CuotaDetalleModal from './CuotaDetalleModal';
import { estadoColors } from '../utils/colors';
import { jwtDecode } from 'jwt-decode';

const VTO_FICTICIO_LIBRE = '2099-12-31';

const CuotasTabla = ({
    cuotas = [],
    interesCredito,
    refetch = () => {}
}) => {
    const [seleccionada, setSeleccionada] = useState(null);
    const [cuotaDetalle, setCuotaDetalle] = useState(null);

    // 🔐 Permisos por rol (solo super admin y admin pueden impactar pagos)
    const token = localStorage.getItem('token');
    let rol_id = null;
    try {
        rol_id = token ? (jwtDecode(token)?.rol_id ?? null) : null;
    } catch (e) {
        rol_id = null;
    }
    const esSuperAdmin = rol_id === 0;
    const esAdmin = rol_id === 1;
    const puedeImpactarPagos = esSuperAdmin || esAdmin;

    if (!cuotas.length) {
        return (
            <p className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-700 ring-1 ring-yellow-200">
                Este crédito no tiene cuotas generadas.
            </p>
        );
    }

    // Detecta modalidad "libre" por vencimiento ficticio (existe al menos una)
    const esLibre = useMemo(
        () => cuotas.some(q => String(q.fecha_vencimiento) === VTO_FICTICIO_LIBRE),
        [cuotas]
    );

    const filas = cuotas.map((c) => {
        const esVtoLibre = String(c.fecha_vencimiento) === VTO_FICTICIO_LIBRE;

        // Principal programado (en LIBRE es el capital, en NO-LIBRE: importe de la cuota)
        const principal = Number(c.importe_cuota || 0);

        // Mora bruta calculada por backend (en LIBRE es la mora del ciclo; si no aplica, será 0)
        const interesesMoraBruta = Number(c.intereses_vencidos_acumulados || 0);

        // En NO-LIBRE: el descuento corresponde a MORA; en LIBRE: no aplica (se liquida a nivel recibo)
        const descuentoMora = esVtoLibre ? 0 : Number(c.descuento_cuota || 0);

        // Mora neta luego del descuento (en LIBRE = bruta)
        const moraNeta = Math.max(interesesMoraBruta - descuentoMora, 0);

        // Pagado acumulado (suma de principal aplicado + mora cobrada según regla del back)
        const pagado = Number(c.monto_pagado_acumulado || 0);

        // % pagado (solo tiene sentido en NO-LIBRE): base = principal + mora neta
        const base = principal + moraNeta;
        const pctWidth =
            c.estado === 'pagada'
                ? 100
                : Math.min(
                      Math.max(base > 0 ? (pagado / base) * 100 : 0, 0),
                      100
                  );
        const pctText = c.estado === 'pagada' ? 100 : Math.round(pctWidth);

        const fechaVto =
            c?.fecha_vencimiento && !esVtoLibre
                ? parseISO(c.fecha_vencimiento)
                : null;

        // Confiamos en el estado que manda backend
        const vencida = String(c.estado).toLowerCase() === 'vencida';

        // 👉 Días de retraso: solo cuotas vencidas y con vencimiento real (no LIBRE)
        let diasRetraso = 0;
        if (!esVtoLibre && vencida && fechaVto instanceof Date && !isNaN(fechaVto)) {
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const vtoCopia = new Date(fechaVto);
            vtoCopia.setHours(0, 0, 0, 0);
            const diffMs = hoy.getTime() - vtoCopia.getTime();
            diasRetraso = Math.max(Math.floor(diffMs / 86400000), 0);
        }

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

                {/* Principal */}
                <td className="px-4 py-2">
                    $
                    {principal.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}
                </td>

                {/* Días de retraso (reemplaza Mora bruta) */}
                <td className="px-4 py-2">
                    {diasRetraso}
                </td>

                {/* Descuento sobre mora (en LIBRE no aplica, se muestra —) */}
                <td className="px-4 py-2">
                    {esVtoLibre ? (
                        <span
                            className="text-gray-400"
                            title="En crédito LIBRE el descuento no se persiste por cuota; solo puede bonificarse la mora del ciclo al liquidar."
                        >
                            — 
                        </span>
                    ) : (
                        <>
                            $
                            {descuentoMora.toLocaleString('es-AR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })}
                        </>
                    )}
                </td>

                {/* Mora neta */}
                <td className="px-4 py-2">
                    $
                    {moraNeta.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}
                </td>

                {/* Vencimiento */}
                <td className="px-4 py-2">
                    {esVtoLibre ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                            Cuota abierta (sin vencimiento)
                        </span>
                    ) : fechaVto ? (
                        format(fechaVto, 'dd/MM/yyyy')
                    ) : (
                        '—'
                    )}
                </td>

                {/* Estado */}
                <td className="px-4 py-2">
                    <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            estadoColors[c.estado] || 'bg-gray-200 text-gray-700'
                        }`}
                        title={
                            esVtoLibre
                                ? 'LIBRE: el descuento por cuota no aplica; la bonificación de mora es solo al cancelar.'
                                : 'NO-LIBRE: el descuento se aplica únicamente sobre la mora.'
                        }
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
                            <span className="text-xs tabular-nums">
                                {pctText}%
                            </span>
                        </div>
                    </td>
                )}

                {/* Acción */}
                <td className="px-4 py-2">
                    {c.estado !== 'pagada' ? (
                        esVtoLibre ? (
                            <span
                                className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200"
                                title="Usá 'Abono parcial' o 'Liquidar crédito' en la tarjeta del crédito (arriba)."
                            >
                                Acciones en la tarjeta
                            </span>
                        ) : puedeImpactarPagos ? (
                            <button
                                onClick={() => setSeleccionada(c)}
                                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
                            >
                                <CreditCard size={14} /> Registrar pago
                            </button>
                        ) : (
                            <span
                                className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200"
                                title="Solo pueden registrar pagos los usuarios con rol administrador o superadministrador."
                            >
                                Sin permisos
                            </span>
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

    const columnas = [
        'N°',
        'Principal',
        'Días de retraso', // reemplaza "Mora bruta"
        'Desc. mora',
        'Mora neta',
        'Vencimiento',
        'Estado',
        !esLibre ? '% pagado' : null,
        'Acción'
    ].filter(Boolean);

    return (
        <>
            <div className="overflow-x-auto rounded-xl shadow ring-1 ring-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 uppercase tracking-wider text-gray-600">
                        <tr>
                            {columnas.map((th) => (
                                <th
                                    key={th}
                                    className="px-4 py-3 text-center font-semibold"
                                >
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