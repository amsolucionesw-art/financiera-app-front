// src/pages/CuotaDetalle.jsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { obtenerCuotaPorId, obtenerPagosPorCuota } from '../services/cuotaService';
import { ArrowLeft, FileText } from 'lucide-react';

const fmtARS = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

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
                    if (alive) setPagos(Array.isArray(p) ? p : p?.data ?? []);
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

    return (
        <section className="p-6 space-y-4">
            <header className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-slate-800">
                    Detalle de Cuota #{cuota?.numero_cuota} (ID {cuota?.id})
                </h1>
                <div className="flex items-center gap-2">
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
                        <dd className="font-medium">{cuota?.fecha_vencimiento ?? '—'}</dd>
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
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {pagos.map((p) => (
                                    <tr key={p.id}>
                                        <td className="px-3 py-2">{p?.fecha_pago ?? '—'}</td>
                                        <td className="px-3 py-2">{fmtARS(p?.monto_pagado ?? 0)}</td>
                                    </tr>
                                ))}
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