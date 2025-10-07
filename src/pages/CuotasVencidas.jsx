// src/pages/CuotasVencidas.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { obtenerCuotasVencidas } from '../services/cuotaService';
import { AlertTriangle, Eye } from 'lucide-react';

const fmtARS = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const CuotasVencidas = () => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                setErr('');
                const data = await obtenerCuotasVencidas();
                const arr = Array.isArray(data) ? data : data?.data || [];
                if (alive) setRows(arr);
            } catch (e) {
                if (alive) setErr(e?.message || 'No se pudo obtener la lista de cuotas vencidas');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const totalMonto = useMemo(
        () =>
            rows.reduce(
                (acc, r) => acc + Number(r?.total_a_pagar_hoy ?? r?.importe_cuota ?? 0),
                0
            ),
        [rows]
    );

    return (
        <section className="p-6">
            <header className="mb-4 flex items-center justify-between">
                <h1 className="text-xl font-semibold text-slate-800">Cuotas vencidas</h1>
                {rows?.length > 0 && (
                    <div className="text-sm text-slate-600">
                        Total: <span className="font-medium">{fmtARS(totalMonto)}</span>
                    </div>
                )}
            </header>

            {loading ? (
                <div className="space-y-2">
                    <div className="h-10 w-full animate-pulse rounded bg-gray-100" />
                    <div className="h-10 w-full animate-pulse rounded bg-gray-100" />
                    <div className="h-10 w-full animate-pulse rounded bg-gray-100" />
                </div>
            ) : err ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                    <div>
                        <p className="font-medium">Error</p>
                        <p className="text-sm">{err}</p>
                    </div>
                </div>
            ) : rows.length === 0 ? (
                <div className="rounded-md border border-green-200 bg-green-50 p-4 text-green-700">
                    No hay cuotas vencidas 👍
                </div>
            ) : (
                <>
                    {/* Versión desktop: tabla */}
                    <div className="hidden sm:block overflow-auto rounded-lg border border-slate-200">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium">Cliente</th>
                                    <th className="px-3 py-2 text-left font-medium">Monto</th>
                                    <th className="px-3 py-2 text-left font-medium">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {rows.map((r) => {
                                    const nombre = `${r?.cliente?.nombre ?? ''} ${r?.cliente?.apellido ?? ''}`.trim();
                                    const monto = Number(r?.total_a_pagar_hoy ?? r?.importe_cuota ?? 0);
                                    return (
                                        <tr key={r.cuota_id} className="hover:bg-slate-50">
                                            <td className="px-3 py-2">
                                                <div className="font-medium text-slate-800">{nombre || 'Sin nombre'}</div>
                                                <div className="text-xs text-slate-500">
                                                    Cuota #{r?.numero_cuota} — Vence {r?.fecha_vencimiento} ({r?.dias_vencida} días)
                                                </div>
                                            </td>
                                            <td className="px-3 py-2">{fmtARS(monto)}</td>
                                            <td className="px-3 py-2">
                                                <Link
                                                    to={`/cuotas/${r.cuota_id}`}
                                                    className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                                                    aria-label={`Ver detalle de cuota #${r?.numero_cuota}`}
                                                >
                                                    <Eye size={16} /> Ver detalle
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Versión mobile: tarjetas */}
                    <div className="sm:hidden space-y-3">
                        {rows.map((r) => {
                            const nombre = `${r?.cliente?.nombre ?? ''} ${r?.cliente?.apellido ?? ''}`.trim();
                            const monto = Number(r?.total_a_pagar_hoy ?? r?.importe_cuota ?? 0);
                            return (
                                <div key={r.cuota_id} className="rounded-lg border border-slate-200 p-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-slate-800">{nombre || 'Sin nombre'}</p>
                                            <p className="text-xs text-slate-500">
                                                Cuota #{r?.numero_cuota} — Vence {r?.fecha_vencimiento} ({r?.dias_vencida} días)
                                            </p>
                                        </div>
                                        <div className="text-right font-semibold">{fmtARS(monto)}</div>
                                    </div>
                                    <div className="mt-3">
                                        <Link
                                            to={`/cuotas/${r.cuota_id}`}
                                            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                                        >
                                            <Eye size={16} /> Ver detalle
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
};

export default CuotasVencidas;
