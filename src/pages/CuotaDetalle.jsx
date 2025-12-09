// src/pages/CuotaDetalle.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { obtenerCuotaPorId, obtenerPagosPorCuota } from '../services/cuotaService';
import { ArrowLeft, FileText } from 'lucide-react';
import { parseISO, isValid, format as dfFormat } from 'date-fns';

const VTO_FICTICIO_LIBRE = '2099-12-31';

const fmtARS = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const safeFmtDate = (s, fallback = '—') => {
    if (!s) return fallback;
    try {
        const d = typeof s === 'string' ? parseISO(s) : new Date(s);
        if (!isValid(d)) return fallback;
        return dfFormat(d, 'dd/MM/yyyy');
    } catch {
        return fallback;
    }
};

// colores simples locales para estado (sin depender de utils)
const estadoBadge = (estadoRaw = '') => {
    const e = String(estadoRaw).toLowerCase();
    if (e === 'pagada') return 'bg-green-100 text-green-700 ring-green-200';
    if (e === 'vencida') return 'bg-red-100 text-red-700 ring-red-200';
    if (e === 'pendiente') return 'bg-yellow-100 text-yellow-700 ring-yellow-200';
    if (e === 'parcial') return 'bg-blue-100 text-blue-700 ring-blue-200';
    return 'bg-gray-100 text-gray-700 ring-gray-200';
};

const CuotaDetalle = () => {
    const { id } = useParams();
    const [cuota, setCuota] = useState(null);
    const [pagos, setPagos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                setErr('');
                const c = await obtenerCuotaPorId(id);
                if (alive) setCuota(c?.data ?? c ?? null);

                // Historial de pagos (si existe endpoint)
                try {
                    const p = await obtenerPagosPorCuota(id);
                    const arr = Array.isArray(p) ? p : (p?.data ?? []);
                    if (alive) setPagos(Array.isArray(arr) ? arr : []);
                } catch {
                    /* opcional, si no existe o falla */
                }
            } catch (e) {
                if (alive) setErr(e?.message || 'No se pudo cargar la cuota');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [id]);

    if (loading) {
        return (
            <section className="p-6 space-y-2">
                <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
                <div className="h-24 w-full animate-pulse rounded bg-gray-100" />
            </section>
        );
    }

    if (err) {
        return (
            <section className="p-6">
                <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-800">
                    {err}
                </div>
            </section>
        );
    }

    if (!cuota) {
        return (
            <section className="p-6">
                <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-800">
                    No se encontró la cuota.
                </div>
            </section>
        );
    }

    const importe = Number(cuota?.importe_cuota ?? 0);
    const descuento = Number(cuota?.descuento_cuota ?? 0);
    const pagado = Number(cuota?.monto_pagado_acumulado ?? 0);
    const mora = Number(cuota?.intereses_vencidos_acumulados ?? 0);
    const pendiente = Math.max(importe - descuento - pagado, 0);

    // LIBRE si el vencimiento es el ficticio
    const esLibre = String(cuota?.fecha_vencimiento) === VTO_FICTICIO_LIBRE;

    return (
        <section className="p-6 space-y-4">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-xl font-semibold text-slate-800">
                    Detalle de Cuota #{cuota?.numero_cuota} <span className="text-slate-400">(ID {cuota?.id})</span>
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                    {cuota?.estado && (
                        <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${estadoBadge(
                                cuota.estado
                            )}`}
                        >
                            Estado: {cuota.estado}
                        </span>
                    )}
                    {cuota?.credito_id && (
                        <Link
                            to={`/creditos/${cuota.credito_id}`}
                            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                            title="Ir a la ficha del crédito"
                        >
                            <FileText size={16} /> Ver crédito #{cuota.credito_id}
                        </Link>
                    )}
                </div>
            </header>

            <div className="rounded-lg border border-slate-200 p-4">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <dt className="text-xs uppercase text-slate-500">Importe de cuota</dt>
                        <dd className="font-medium">{fmtARS(importe)}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase text-slate-500">Descuento aplicado</dt>
                        <dd className="font-medium">{fmtARS(descuento)}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase text-slate-500">Pagado acumulado</dt>
                        <dd className="font-medium">{fmtARS(pagado)}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase text-slate-500">Mora acumulada</dt>
                        <dd className="font-medium">{fmtARS(mora)}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase text-slate-500">Pendiente (principal)</dt>
                        <dd className="font-medium">{fmtARS(pendiente)}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase text-slate-500">Vencimiento</dt>
                        <dd className="font-medium">
                            {esLibre ? 'Sin vencimiento (LIBRE)' : safeFmtDate(cuota?.fecha_vencimiento)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase text-slate-500">Estado</dt>
                        <dd className="font-medium">{cuota?.estado ?? '—'}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase text-slate-500">Forma de pago</dt>
                        <dd className="font-medium">{cuota?.formaPago?.nombre ?? '—'}</dd>
                    </div>
                </dl>
            </div>

            <div className="flex items-center gap-2">
                <Link
                    to="/cuotas/vencidas"
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                >
                    <ArrowLeft size={16} /> Volver a vencidas
                </Link>
            </div>

            <section>
                <h2 className="mb-2 text-base font-semibold text-slate-800">Pagos</h2>
                {pagos?.length ? (
                    <div className="overflow-auto rounded-lg border border-slate-200">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium">Fecha</th>
                                    <th className="px-3 py-2 text-left font-medium">Monto</th>
                                    <th className="px-3 py-2 text-left font-medium">Medio</th>
                                    <th className="px-3 py-2 text-left font-medium">Recibo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {pagos.map((p) => {
                                    const fecha = safeFmtDate(p?.fecha_pago, p?.fecha || '—');
                                    const monto = fmtARS(p?.monto_pagado ?? p?.monto ?? 0);
                                    const medio = p?.medio_pago ?? p?.forma_pago ?? '—';
                                    const numeroRecibo = p?.numero_recibo ?? p?.recibo_id ?? null;

                                    return (
                                        <tr key={p.id ?? `${fecha}-${monto}`}>
                                            <td className="px-3 py-2">{fecha}</td>
                                            <td className="px-3 py-2">{monto}</td>
                                            <td className="px-3 py-2">{medio}</td>
                                            <td className="px-3 py-2">
                                                {numeroRecibo ? (
                                                    <Link
                                                        to={`/recibo/${numeroRecibo}`}
                                                        className="text-blue-600 hover:underline"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        #{numeroRecibo}
                                                    </Link>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-slate-600">Sin pagos registrados.</p>
                )}
            </section>
        </section>
    );
};

export default CuotaDetalle;
