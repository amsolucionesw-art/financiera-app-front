// src/pages/RutaCobro.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    Search,
    RefreshCw,
    CalendarDays,
    AlertTriangle,
    Phone,
    MapPin,
    BadgeDollarSign,
    Copy,
    Download,
    CheckCircle2
} from 'lucide-react';
import { obtenerRutaCobroCobrador } from '../services/cuotaService';

const fmtARS = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const safeStr = (v) => (v === null || v === undefined ? '' : String(v));

const normalizeResponse = (resp) => {
    // apiFetch a veces devuelve directo y a veces {success,data}
    if (!resp) return null;
    if (resp?.data && (resp?.success === true || resp?.success === false)) return resp.data;
    return resp;
};

const nombreModalidad = (modalidadRaw) => {
    const mod = String(modalidadRaw || '').toLowerCase();
    if (mod === 'libre') return 'LIBRE';
    if (mod === 'comun') return 'PLAN DE CUOTAS FIJAS';
    if (mod === 'progresivo') return 'PROGRESIVO';
    return 'CRÉDITO';
};

const csvEscape = (value) => {
    const s = safeStr(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
};

const downloadCSV = (rows, filename = 'ruta-cobro.csv') => {
    const content = rows.map((r) => r.join(',')).join('\r\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const RutaCobro = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [data, setData] = useState({ items: [], meta: null });
    const [tab, setTab] = useState('vencida'); // 'vencida' | 'hoy'
    const [q, setQ] = useState('');

    // ✅ Toast simple (copiado)
    const [toast, setToast] = useState({ show: false, msg: '' });
    const showToast = (msg) => {
        setToast({ show: true, msg });
        window.clearTimeout(showToast._t);
        showToast._t = window.setTimeout(() => setToast({ show: false, msg: '' }), 1600);
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            setError('');

            const resp = await obtenerRutaCobroCobrador({
                includeVencidas: 1,
                includePendientesHoy: 1,
                modo: 'plano',
            });

            const payload = normalizeResponse(resp);

            let items = [];
            let meta = null;

            if (payload?.items && Array.isArray(payload.items)) {
                items = payload.items;
                meta = payload.meta ?? null;
            } else if ((payload?.vencidas || payload?.hoy) && payload?.meta) {
                items = [...(payload.vencidas || []), ...(payload.hoy || [])];
                meta = payload.meta ?? null;
            } else if (Array.isArray(payload)) {
                items = payload;
            }

            setData({ items, meta });
        } catch (e) {
            setError(e?.message || 'No se pudo cargar la ruta de cobro');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        return () => {
            window.clearTimeout(showToast._t);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const counts = useMemo(() => {
        const items = data?.items || [];
        let vencidas = 0;
        let hoy = 0;
        for (const it of items) {
            const total = Number(it?.total_a_pagar_hoy || 0);
            if (!(total > 0)) continue;

            if (it?.categoria === 'vencida') vencidas++;
            if (it?.categoria === 'hoy') hoy++;
        }
        return { vencidas, hoy, total: vencidas + hoy };
    }, [data]);

    const filtered = useMemo(() => {
        const items = data?.items || [];
        const needle = q.trim().toLowerCase();

        return items
            .filter((it) => Number(it?.total_a_pagar_hoy || 0) > 0)
            .filter((it) => (tab === 'vencida' ? it?.categoria === 'vencida' : it?.categoria === 'hoy'))
            .filter((it) => {
                if (!needle) return true;
                const haystack = [
                    it?.cliente_apellido,
                    it?.cliente_nombre,
                    it?.cliente_dni,
                    it?.zona_nombre,
                    it?.cliente_direccion,
                    it?.fecha_vencimiento,
                    nombreModalidad(it?.modalidad_credito),
                    it?.tipo_credito,
                ]
                    .map((x) => safeStr(x).toLowerCase())
                    .join(' ');
                return haystack.includes(needle);
            });
    }, [data, tab, q]);

    const copyToClipboard = async (text, okMsg = 'Copiado') => {
        const t = safeStr(text).trim();
        if (!t) return;

        try {
            await navigator.clipboard.writeText(t);
            showToast(okMsg);
        } catch {
            try {
                const ta = document.createElement('textarea');
                ta.value = t;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showToast(okMsg);
            } catch {
                showToast('No se pudo copiar');
            }
        }
    };

    const exportCurrentToCSV = () => {
        const hoy = data?.meta?.hoy ? String(data.meta.hoy) : '';
        const tabName = tab === 'vencida' ? 'vencidas' : 'hoy';
        const filename = `ruta-cobro_${hoy || 'sin-fecha'}_${tabName}.csv`;

        const header = [
            'Categoria',
            'Modalidad',
            'Tipo credito',
            'Cliente',
            'DNI',
            'Telefono',
            'Telefono secundario',
            'Zona',
            'Direccion',
            'Vencimiento',
            'Dias vencida',
            'Total hoy',
            'Capital (LIBRE)',
            'Interes (LIBRE)',
            'Mora (LIBRE)',
            'Principal (NO-LIBRE)',
            'Mora pendiente (NO-LIBRE)',
        ].map(csvEscape);

        const rows = filtered.map((it) => {
            const isLibre = String(it?.modalidad_credito || '').toLowerCase() === 'libre';
            const cliente = `${safeStr(it?.cliente_apellido)} ${safeStr(it?.cliente_nombre)}`.trim();

            return [
                csvEscape(it?.categoria),
                csvEscape(nombreModalidad(it?.modalidad_credito)),
                csvEscape(it?.tipo_credito),
                csvEscape(cliente),
                csvEscape(it?.cliente_dni),
                csvEscape(it?.cliente_telefono),
                csvEscape(it?.cliente_telefono_secundario),
                csvEscape(it?.zona_nombre || it?.zona_id),
                csvEscape(it?.cliente_direccion),
                csvEscape(it?.fecha_vencimiento),
                csvEscape(Number(it?.dias_vencida || 0)),
                csvEscape(Number(it?.total_a_pagar_hoy || 0)),

                csvEscape(isLibre ? Number(it?.saldo_capital || 0) : ''),
                csvEscape(isLibre ? Number(it?.interes_pendiente_hoy || 0) : ''),
                csvEscape(isLibre ? Number(it?.mora_pendiente_hoy || 0) : ''),

                csvEscape(!isLibre ? Number(it?.saldo_principal_pendiente || 0) : ''),
                csvEscape(!isLibre ? Number(it?.mora_pendiente || 0) : ''),
            ];
        });

        downloadCSV([header, ...rows], filename);
        showToast('CSV descargado');
    };

    const title = tab === 'vencida' ? 'Vencidas' : 'Hoy';

    return (
        <section className="h-full overflow-y-auto p-6">
            {/* ✅ Toast flotante */}
            {toast.show ? (
                <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
                    <div className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
                        <CheckCircle2 size={16} className="text-emerald-300" />
                        {toast.msg}
                    </div>
                </div>
            ) : null}

            <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                        <CalendarDays size={18} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Ruta de cobro</h1>
                        <p className="text-sm text-slate-500">
                            {data?.meta?.hoy ? `Fecha: ${data.meta.hoy}` : 'Listado armado por vencimiento/compromiso'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={exportCurrentToCSV}
                        className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                        aria-label="Exportar CSV"
                        title="Exporta lo que estás viendo (tab + búsqueda)"
                        disabled={loading || filtered.length === 0}
                    >
                        <Download size={16} />
                        Exportar CSV
                    </button>

                    <button
                        type="button"
                        onClick={fetchData}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        aria-label="Actualizar"
                    >
                        <RefreshCw size={16} />
                        Actualizar
                    </button>
                </div>
            </header>

            {/* Tabs + Search */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setTab('vencida')}
                        className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ring-1 transition ${tab === 'vencida'
                                ? 'bg-red-50 text-red-800 ring-red-200'
                                : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                            }`}
                    >
                        <AlertTriangle size={16} />
                        Vencidas ({counts.vencidas})
                    </button>

                    <button
                        type="button"
                        onClick={() => setTab('hoy')}
                        className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ring-1 transition ${tab === 'hoy'
                                ? 'bg-sky-50 text-sky-800 ring-sky-200'
                                : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                            }`}
                    >
                        <CalendarDays size={16} />
                        Hoy ({counts.hoy})
                    </button>
                </div>

                <div className="relative w-full sm:w-96">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={`Buscar en ${title} (nombre, DNI, zona, dirección...)`}
                        className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-10 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    {q ? (
                        <button
                            type="button"
                            onClick={() => setQ('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                            aria-label="Limpiar búsqueda"
                            title="Limpiar"
                        >
                            ✕
                        </button>
                    ) : null}
                </div>
            </div>

            {error ? (
                <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-800" role="alert">
                    {error}
                </div>
            ) : null}

            {/* Tabla */}
            <div className="rounded-md border border-slate-200 bg-white">
                <div className="max-h-[65vh] overflow-auto">
                    <table className="min-w-[1050px] w-full border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-50">
                            <tr className="text-left text-xs font-semibold text-slate-600">
                                <th className="px-3 py-3 border-b">Cliente</th>
                                <th className="px-3 py-3 border-b">Modalidad</th>
                                <th className="px-3 py-3 border-b">Zona</th>
                                <th className="px-3 py-3 border-b">Dirección</th>
                                <th className="px-3 py-3 border-b">Contacto</th>
                                <th className="px-3 py-3 border-b">Vencimiento</th>
                                <th className="px-3 py-3 border-b">Días</th>
                                <th className="px-3 py-3 border-b">Total hoy</th>
                            </tr>
                        </thead>

                        <tbody className="text-sm">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                                        Cargando ruta...
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                                        No hay registros para mostrar.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((it) => {
                                    const key = `${it?.modalidad_credito}-${it?.credito_id}-${it?.cuota_id ?? 'x'}`;
                                    const isLibre = String(it?.modalidad_credito || '').toLowerCase() === 'libre';
                                    const total = Number(it?.total_a_pagar_hoy || 0);

                                    const cliente = `${safeStr(it?.cliente_apellido)} ${safeStr(it?.cliente_nombre)}`.trim();
                                    const dni = safeStr(it?.cliente_dni);
                                    const zona = safeStr(it?.zona_nombre || it?.zona_id);
                                    const dir = safeStr(it?.cliente_direccion);
                                    const tel1 = safeStr(it?.cliente_telefono);
                                    const tel2 = safeStr(it?.cliente_telefono_secundario);

                                    return (
                                        <tr key={key} className="border-b last:border-b-0 hover:bg-slate-50">
                                            <td className="px-3 py-3">
                                                <div className="font-medium text-slate-800">{cliente || 'Cliente'}</div>
                                                <div className="text-xs text-slate-500">
                                                    {dni ? `DNI: ${dni}` : 'DNI: -'} · {safeStr(it?.tipo_credito || '-')}
                                                </div>
                                            </td>

                                            <td className="px-3 py-3">
                                                <div className="font-medium text-slate-800">{nombreModalidad(it?.modalidad_credito)}</div>
                                            </td>

                                            <td className="px-3 py-3">
                                                <div className="text-slate-800">{zona || '-'}</div>
                                            </td>

                                            <td className="px-3 py-3">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-start gap-2">
                                                        <MapPin size={16} className="mt-0.5 text-slate-400" />
                                                        <span className="text-slate-700">{dir || '-'}</span>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(dir, 'Dirección copiada')}
                                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                                        title={dir ? 'Copiar dirección' : ''}
                                                        aria-label="Copiar dirección"
                                                        disabled={!dir}
                                                    >
                                                        <Copy size={14} className="text-slate-500" />
                                                        Copiar
                                                    </button>
                                                </div>
                                            </td>

                                            <td className="px-3 py-3">
                                                <div className="flex flex-col gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(tel1, 'Teléfono copiado')}
                                                        className="inline-flex items-center gap-2 text-left text-slate-700 hover:text-slate-900"
                                                        title={tel1 ? 'Click para copiar' : ''}
                                                        disabled={!tel1}
                                                    >
                                                        <Phone size={16} className="text-slate-400" />
                                                        {tel1 || '-'}
                                                    </button>

                                                    {tel2 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard(tel2, 'Teléfono copiado')}
                                                            className="inline-flex items-center gap-2 text-left text-slate-700 hover:text-slate-900"
                                                            title="Click para copiar"
                                                        >
                                                            <Phone size={16} className="text-slate-400" />
                                                            {tel2}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </td>

                                            <td className="px-3 py-3 text-slate-700">{safeStr(it?.fecha_vencimiento || '-')}</td>

                                            <td className="px-3 py-3 text-slate-700">{Number(it?.dias_vencida || 0)}</td>

                                            <td className="px-3 py-3">
                                                <div className="inline-flex items-center gap-2 font-semibold text-slate-900">
                                                    <BadgeDollarSign size={16} className="text-slate-400" />
                                                    {fmtARS(total)}
                                                </div>
                                                <div className="mt-1 text-xs text-slate-500">
                                                    {isLibre ? (
                                                        <>
                                                            Capital: {fmtARS(it?.saldo_capital)} · Interés: {fmtARS(it?.interes_pendiente_hoy)} · Mora:{' '}
                                                            {fmtARS(it?.mora_pendiente_hoy)}
                                                        </>
                                                    ) : (
                                                        <>
                                                            Principal: {fmtARS(it?.saldo_principal_pendiente)} · Mora: {fmtARS(it?.mora_pendiente)}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-col gap-1 border-t border-slate-200 px-3 py-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        Mostrando <span className="font-semibold">{filtered.length}</span> de{' '}
                        <span className="font-semibold">{tab === 'vencida' ? counts.vencidas : counts.hoy}</span> ({title})
                    </div>
                    <div>Total general: <span className="font-semibold">{counts.total}</span></div>
                </div>
            </div>
        </section>
    );
};

export default RutaCobro;