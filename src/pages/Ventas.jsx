// src/pages/Ventas.jsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { listarVentas, eliminarVenta } from '../services/ventasService';
import {
    RefreshCw,
    Plus,
    Filter,
    Pencil,
    Trash2,
    Download,
    FileSpreadsheet,
    ExternalLink,
    CreditCard
} from 'lucide-react';
import { exportToCSV, exportContableXLSX } from '../utils/exporters';
import { obtenerFormasDePago } from '../services/cuotaService';

// YYYY-MM-DD en UTC para evitar derivas
const toYMD = (d) => {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};
const today = toYMD(new Date());
const fmtNum = (n) =>
    Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const niceTipo = (s) => {
    const t = String(s || '').toLowerCase();
    if (t === 'semanal') return 'Semanal';
    if (t === 'quincenal') return 'Quincenal';
    return 'Mensual';
};

export default function Ventas() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // Filtros (compatibles con backend: { desde, hasta, mes, anio, q })
    const [desde, setDesde] = useState(searchParams.get('desde') || today);
    const [hasta, setHasta] = useState(searchParams.get('hasta') || today);
    const [mes, setMes] = useState(searchParams.get('mes') || '');
    const [anio, setAnio] = useState(searchParams.get('anio') || '');
    const [q, setQ] = useState(searchParams.get('q') || '');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [rows, setRows] = useState([]);

    const [formasPago, setFormasPago] = useState([]);
    useEffect(() => {
        (async () => {
            try {
                const fps = await obtenerFormasDePago();
                setFormasPago(Array.isArray(fps) ? fps : []);
            } catch {
                setFormasPago([]);
            }
        })();
    }, []);

    // Map rápido id->nombre (evita .find() por fila)
    const fpMap = useMemo(() => {
        const m = new Map();
        for (const f of formasPago) m.set(String(f.id), f.nombre);
        return m;
    }, [formasPago]);

    const fpNombre = (id) => {
        if (id == null) return 'Sin especificar';
        return fpMap.get(String(id)) || `FP #${id}`;
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = {
                desde: desde || undefined,
                hasta: hasta || undefined,
                mes: mes || undefined,
                anio: anio || undefined,
                q: q || undefined,
            };
            const data = await listarVentas(params);
            setRows(Array.isArray(data) ? data : []);

            // Persisto filtros en URL
            const sp = new URLSearchParams();
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') sp.set(k, v);
            });
            setSearchParams(sp);
        } catch (e) {
            setError(e?.message || 'Error al cargar ventas');
        } finally {
            setLoading(false);
        }
    }, [desde, hasta, mes, anio, q, setSearchParams]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const totals = useMemo(() => {
        return rows.reduce(
            (acc, r) => {
                acc.capital += Number(r.capital || 0);
                acc.interes += Number(r.interes || 0);
                acc.total += Number(r.total || 0);
                return acc;
            },
            { capital: 0, interes: 0, total: 0 }
        );
    }, [rows]);

    const handleEliminar = async (id) => {
        const conf = await Swal.fire({
            title: 'Eliminar venta',
            text: '¿Seguro querés eliminar esta venta? Esta acción no se puede deshacer.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc2626',
        });
        if (!conf.isConfirmed) return;

        try {
            await eliminarVenta(id);
            setRows((prev) => prev.filter((x) => x.id !== id));
            Swal.fire('Eliminada', 'La venta fue eliminada.', 'success');
        } catch (e) {
            Swal.fire('Error', e?.message || 'No se pudo eliminar la venta', 'error');
        }
    };

    const onSubmitFiltros = (e) => {
        e.preventDefault();
        fetchData();
    };

    const resetFiltros = () => {
        setDesde(today);
        setHasta(today);
        setMes('');
        setAnio('');
        setQ('');
    };

    // Exportación CSV
    const exportarCSV = () => {
        const archivo = `ventas-${desde || ''}_a_${hasta || ''}.csv`;
        const rowsCSV = (rows || []).map((r) => ({
            'FECHA IMPUTACION': r.fecha_imputacion || '',
            'N° DE COMP': r.numero_comprobante || '',
            'NOMBRE Y APELLIDO': r.cliente_nombre || '',
            'CUIT-CUIL/ DNI': r.doc_cliente || '',
            'NETO': Number(r.neto || 0).toFixed(2).replace('.', ','),
            'IVA': Number(r.iva || 0).toFixed(2).replace('.', ','),
            'RET GAN': Number(r.ret_gan || 0).toFixed(2).replace('.', ','),
            'RETIVA': Number(r.ret_iva || 0).toFixed(2).replace('.', ','),
            'RET IIBB TUC': Number(r.ret_iibb_tuc || 0).toFixed(2).replace('.', ','),
            'capital': Number(r.capital || 0).toFixed(2).replace('.', ','),
            'interes': Number(r.interes || 0).toFixed(2).replace('.', ','),
            'cuotas': Number(r.cuotas || 0),
            'tipo_credito': r.tipo_credito || '',
            'credito_id': r.credito_id ?? '',
            'TOTAL': Number(r.total || 0).toFixed(2).replace('.', ','),
            'FORMA DE PAGO': fpNombre(r.forma_pago_id),
            'FECHA FIN DE FINANCIACION': r.fecha_fin || '',
            'BONIFICACION (FALSO / VERD)': r.bonificacion ? 'VERDADERO' : 'FALSO',
            'VENDEDOR': r.vendedor || '',
            'MES': r.mes ?? '',
            'AÑO': r.anio ?? '',
        }));

        exportToCSV(archivo, rowsCSV, [
            'FECHA IMPUTACION',
            'N° DE COMP',
            'NOMBRE Y APELLIDO',
            'CUIT-CUIL/ DNI',
            'NETO',
            'IVA',
            'RET GAN',
            'RETIVA',
            'RET IIBB TUC',
            'capital',
            'interes',
            'cuotas',
            'tipo_credito',
            'credito_id',
            'TOTAL',
            'FORMA DE PAGO',
            'FECHA FIN DE FINANCIACION',
            'BONIFICACION (FALSO / VERD)',
            'VENDEDOR',
            'MES',
            'AÑO',
        ]);
    };

    // Exportación Excel (XLSX)
    const exportarXLSX = async () => {
        const data = (rows || []).map((r) => ({
            'FECHA IMPUTACION': r.fecha_imputacion || '',
            'N° DE COMP': r.numero_comprobante || '',
            'NOMBRE Y APELLIDO': r.cliente_nombre || '',
            'CUIT-CUIL/ DNI': r.doc_cliente || '',
            'NETO': Number(r.neto || 0),
            'IVA': Number(r.iva || 0),
            'RET GAN': Number(r.ret_gan || 0),
            'RETIVA': Number(r.ret_iva || 0),
            'RET IIBB TUC': Number(r.ret_iibb_tuc || 0),
            'capital': Number(r.capital || 0),
            'interes': Number(r.interes || 0),
            'cuotas': Number(r.cuotas || 0),
            'tipo_credito': r.tipo_credito || '',
            'credito_id': r.credito_id ?? '',
            'TOTAL': Number(r.total || 0),
            'FORMA DE PAGO': fpNombre(r.forma_pago_id),
            'FECHA FIN DE FINANCIACION': r.fecha_fin || '',
            'BONIFICACION (FALSO / VERD)': r.bonificacion ? 'VERDADERO' : 'FALSO',
            'VENDEDOR': r.vendedor || '',
            'MES': r.mes ?? '',
            'AÑO': r.anio ?? '',
        }));

        await exportContableXLSX({ ventas: data }, `ventas-${desde || ''}_a_${hasta || ''}.xlsx`);
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h1 className="text-2xl font-semibold">Ventas (manuales)</h1>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                        <RefreshCw className="h-4 w-4" />
                        {loading ? 'Actualizando…' : 'Actualizar'}
                    </button>

                    <button
                        onClick={exportarCSV}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        title="Exportar CSV"
                    >
                        <Download className="h-4 w-4" />
                        CSV
                    </button>

                    <button
                        onClick={exportarXLSX}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        title="Exportar Excel"
                    >
                        <FileSpreadsheet className="h-4 w-4" />
                        Excel
                    </button>

                    {/* Nuevo botón: Venta Financiada */}
                    <button
                        onClick={() => navigate('/ventas/financiada')}
                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                        title="Crear venta financiada (genera Crédito)"
                    >
                        <CreditCard className="h-4 w-4" />
                        Financiada
                    </button>

                    <button
                        onClick={() => navigate('/ventas/nuevo')}
                        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        <Plus className="h-4 w-4" />
                        Nueva
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 mb-4">
                <form className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end" onSubmit={onSubmitFiltros}>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Desde</label>
                        <input
                            type="date"
                            value={desde}
                            onChange={(e) => setDesde(e.target.value)}
                            className="mt-1 w-full rounded-md border border-gray-300 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Hasta</label>
                        <input
                            type="date"
                            value={hasta}
                            onChange={(e) => setHasta(e.target.value)}
                            className="mt-1 w-full rounded-md border border-gray-300 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Mes</label>
                        <input
                            type="number"
                            min={1}
                            max={12}
                            value={mes}
                            onChange={(e) => setMes(e.target.value)}
                            placeholder="1..12"
                            className="mt-1 w-full rounded-md border border-gray-300 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Año</label>
                        <input
                            type="number"
                            min={2000}
                            max={2100}
                            value={anio}
                            onChange={(e) => setAnio(e.target.value)}
                            placeholder="2025"
                            className="mt-1 w-full rounded-md border border-gray-300 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div className="md:col-span-3">
                        <label className="block text-xs font-medium text-gray-700">Buscar (cliente / nro / vendedor)</label>
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Texto libre…"
                            className="mt-1 w-full rounded-md border border-gray-300 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div className="md:col-span-7 flex flex-wrap gap-2">
                        <button
                            type="submit"
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        >
                            <Filter className="h-4 w-4" />
                            Filtrar
                        </button>
                        <button
                            type="button"
                            onClick={resetFiltros}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        >
                            Limpiar
                        </button>
                    </div>
                </form>
            </div>

            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* ===== MOBILE: Cards ===== */}
            <div className="sm:hidden space-y-3">
                {loading && (
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="animate-spin h-5 w-5 rounded-full border-2 border-gray-300 border-t-blue-600 mx-auto" />
                    </div>
                )}

                {!loading && rows.length === 0 && (
                    <div className="rounded-lg border border-gray-200 bg-white p-4 text-center text-gray-500">
                        Sin resultados
                    </div>
                )}

                {rows.map((r, idx) => {
                    const tieneFinanciacion = Number(r.capital || 0) > 0 && Number(r.cuotas || 0) > 1;
                    return (
                        <div
                            key={r.id}
                            className="rounded-lg border border-gray-200 bg-white p-3"
                        >
                            <div className="flex items-start justify-between">
                                <div className="space-y-0.5">
                                    <div className="text-xs text-gray-500">Fecha imputación</div>
                                    <div className="font-medium">{r.fecha_imputacion}</div>
                                </div>
                                {tieneFinanciacion && (
                                    <span className="text-[11px] rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">
                                        Financiada
                                    </span>
                                )}
                            </div>

                            <div className="mt-2">
                                <div className="text-xs text-gray-500">N° Comprobante</div>
                                <div className="font-mono text-sm">
                                    {r.numero_comprobante || <span className="text-gray-400">—</span>}
                                </div>
                            </div>

                            <div className="mt-2">
                                <div className="text-xs text-gray-500">Cliente</div>
                                <div className="font-medium">{r.cliente_nombre}</div>
                                <div className="text-xs text-gray-500">{r.doc_cliente || '-'}</div>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2">
                                <div>
                                    <div className="text-[11px] text-gray-500">Capital</div>
                                    <div className="text-sm font-semibold text-right">{fmtNum(r.capital)}</div>
                                </div>
                                <div>
                                    <div className="text-[11px] text-gray-500">Interés</div>
                                    <div className="text-sm font-semibold text-right">{fmtNum(r.interes)}</div>
                                </div>
                                <div>
                                    <div className="text-[11px] text-gray-500">Total</div>
                                    <div className="text-sm font-semibold text-right">{fmtNum(r.total)}</div>
                                </div>
                            </div>

                            {tieneFinanciacion ? (
                                <div className="mt-2 text-xs text-gray-700">
                                    {niceTipo(r.tipo_credito)} · {r.cuotas} cuota{Number(r.cuotas) === 1 ? '' : 's'}
                                </div>
                            ) : (
                                <div className="mt-2 text-xs text-gray-400">Sin financiación</div>
                            )}

                            <div className="mt-2 text-xs text-gray-500">
                                FP: <span className="text-gray-800">{fpNombre(r.forma_pago_id)}</span>
                            </div>
                            <div className="text-xs text-gray-500">
                                Vendedor: <span className="text-gray-800">{r.vendedor || '-'}</span>
                            </div>

                            <div className="mt-2 text-xs text-gray-500">
                                Crédito:{' '}
                                {r.credito_id ? (
                                    <Link
                                        to={`/creditos/${r.credito_id}`}
                                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                        title="Ver crédito"
                                    >
                                        #{r.credito_id} <ExternalLink className="h-3.5 w-3.5" />
                                    </Link>
                                ) : (
                                    <span className="text-gray-400">—</span>
                                )}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                <Link
                                    to={`/ventas/${r.id}/editar`}
                                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
                                >
                                    <Pencil className="h-4 w-4" /> Editar
                                </Link>
                                <button
                                    onClick={() => handleEliminar(r.id)}
                                    className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                                >
                                    <Trash2 className="h-4 w-4" /> Borrar
                                </button>
                            </div>
                        </div>
                    );
                })}

                {rows.length > 0 && (
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="text-sm font-medium text-gray-700">Totales</div>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            <div>
                                <div className="text-[11px] text-gray-500">Capital</div>
                                <div className="text-sm font-semibold text-right">{fmtNum(totals.capital)}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-gray-500">Interés</div>
                                <div className="text-sm font-semibold text-right">{fmtNum(totals.interes)}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-gray-500">Total</div>
                                <div className="text-sm font-semibold text-right">{fmtNum(totals.total)}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== DESKTOP/TABLET: Tabla ===== */}
            <div className="relative overflow-x-auto rounded-lg border border-gray-200 bg-white hidden sm:block">
                {loading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                        <div className="animate-spin h-6 w-6 rounded-full border-2 border-gray-300 border-t-blue-600" />
                    </div>
                )}

                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                        <tr>
                            <th className="px-3 py-2 text-left font-medium">Fecha imputación</th>
                            <th className="px-3 py-2 text-left font-medium">N° Comp.</th>
                            <th className="px-3 py-2 text-left font-medium">Cliente</th>
                            <th className="px-3 py-2 text-right font-medium">Capital</th>
                            <th className="px-3 py-2 text-right font-medium">Interés</th>
                            <th className="px-3 py-2 text-left font-medium">Financiación</th>
                            <th className="px-3 py-2 text-right font-medium">Total</th>
                            <th className="px-3 py-2 text-left font-medium">FP</th>
                            <th className="px-3 py-2 text-left font-medium">Vendedor</th>
                            <th className="px-3 py-2 text-left font-medium">Crédito</th>
                            <th className="px-3 py-2 text-right font-medium w-48">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.length === 0 && !loading && (
                            <tr>
                                <td colSpan={11} className="px-3 py-6 text-center text-gray-500">
                                    Sin resultados
                                </td>
                            </tr>
                        )}
                        {rows.map((r, idx) => {
                            const tieneFinanciacion = Number(r.capital || 0) > 0 && Number(r.cuotas || 0) > 1;
                            return (
                                <tr
                                    key={r.id}
                                    className={idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}
                                >
                                    <td className="px-3 py-2">{r.fecha_imputacion}</td>
                                    <td className="px-3 py-2">
                                        {r.numero_comprobante ? (
                                            <span className="inline-flex items-center rounded border border-gray-300 bg-white px-2 py-0.5 font-mono text-[12px] text-gray-800">
                                                {r.numero_comprobante}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="text-gray-900 flex items-center gap-2">
                                            {r.cliente_nombre}
                                            {tieneFinanciacion && (
                                            <span className="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">
                                                Financiada
                                            </span>
                                            )}
                                        </div>
                                        <div className="text-gray-500 text-xs">{r.doc_cliente || '-'}</div>
                                    </td>
                                    <td className="px-3 py-2 text-right">{fmtNum(r.capital)}</td>
                                    <td className="px-3 py-2 text-right">{fmtNum(r.interes)}</td>
                                    <td className="px-3 py-2">
                                        {tieneFinanciacion
                                            ? `${niceTipo(r.tipo_credito)} · ${r.cuotas} cuota${Number(r.cuotas) === 1 ? '' : 's'}`
                                            : '-'}
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium">{fmtNum(r.total)}</td>
                                    <td className="px-3 py-2">{fpNombre(r.forma_pago_id)}</td>
                                    <td className="px-3 py-2">{r.vendedor || '-'}</td>
                                    <td className="px-3 py-2">
                                        {r.credito_id ? (
                                            <Link
                                                to={`/creditos/${r.credito_id}`}
                                                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                                title="Ver crédito"
                                            >
                                                #{r.credito_id} <ExternalLink className="h-3.5 w-3.5" />
                                            </Link>
                                        ) : (
                                            <span className="text-gray-400">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex justify-end gap-2">
                                            <Link
                                                to={`/ventas/${r.id}/editar`}
                                                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                                            >
                                                <Pencil className="h-4 w-4" /> Editar
                                            </Link>
                                            <button
                                                onClick={() => handleEliminar(r.id)}
                                                className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                            >
                                                <Trash2 className="h-4 w-4" /> Borrar
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>

                    {rows.length > 0 && (
                        <tfoot className="bg-gray-50 border-t border-gray-100">
                            <tr>
                                <td className="px-3 py-2 text-right font-medium" colSpan={3}>
                                    Totales
                                </td>
                                <td className="px-3 py-2 text-right font-semibold">{fmtNum(totals.capital)}</td>
                                <td className="px-3 py-2 text-right font-semibold">{fmtNum(totals.interes)}</td>
                                <td className="px-3 py-2"></td>
                                <td className="px-3 py-2 text-right font-semibold">{fmtNum(totals.total)}</td>
                                <td colSpan={4}></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );
}
