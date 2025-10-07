// src/pages/Gastos.jsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { listarGastos, eliminarGasto } from '../services/gastosService';
import { obtenerFormasDePago } from '../services/cuotaService'; // unificado con el resto
import { exportToCSV } from '../utils/exporters';
import { Download, RefreshCw, Plus, Trash2, PencilLine } from 'lucide-react';

// YYYY-MM-DD en UTC (evita drift por huso horario)
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
const fmtARS = (n) =>
    Number(n || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });

export default function Gastos() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // Filtros (persisten en URL) — ahora todos van al backend
    const [desde, setDesde] = useState(searchParams.get('desde') || today);
    const [hasta, setHasta] = useState(searchParams.get('hasta') || today);
    const [mes, setMes] = useState(searchParams.get('mes') || '');
    const [anio, setAnio] = useState(searchParams.get('anio') || '');
    const [q, setQ] = useState(searchParams.get('q') || '');
    const [formaPagoId, setFormaPagoId] = useState(searchParams.get('forma_pago_id') || '');
    const [tipoComp, setTipoComp] = useState(searchParams.get('tipo_comprobante') || '');
    const [clasif, setClasif] = useState(searchParams.get('clasificacion') || '');

    // Datos
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    const [gastos, setGastos] = useState([]);
    const [formasPago, setFormasPago] = useState([]);

    // Cargar formas de pago
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

    // Traer datos (todos los filtros al backend)
    const fetchData = useCallback(async () => {
        setCargando(true);
        setError('');
        try {
            const params = {
                desde: desde || undefined,
                hasta: hasta || undefined,
                mes: mes || undefined,
                anio: anio || undefined,
                q: q || undefined,
                forma_pago_id: formaPagoId || undefined,       // 'null' -> IS NULL (backend ya lo contempla)
                tipo_comprobante: tipoComp || undefined,
                clasificacion: clasif || undefined,
            };
            const data = await listarGastos(params);
            setGastos(Array.isArray(data) ? data : []);

            // Persistir filtros en la URL
            const sp = new URLSearchParams();
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') sp.set(k, v);
            });
            setSearchParams(sp);
        } catch (e) {
            setError(e?.message || 'Error al cargar gastos');
        } finally {
            setCargando(false);
        }
    }, [desde, hasta, mes, anio, q, formaPagoId, tipoComp, clasif, setSearchParams]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Total (sobre los ya filtrados por el backend)
    const total = useMemo(() => gastos.reduce((acc, g) => acc + Number(g.total || 0), 0), [gastos]);

    const fpNombre = (id) => {
        if (id == null) return 'Sin especificar';
        const fp = formasPago.find((f) => String(f.id) === String(id));
        return fp ? fp.nombre : `FP #${id}`;
    };

    const handleEliminar = async (id) => {
        const conf = await Swal.fire({
            title: 'Eliminar gasto',
            text: '¿Seguro querés eliminar este gasto? Esta acción no se puede deshacer.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc2626',
        });
        if (!conf.isConfirmed) return;

        try {
            await eliminarGasto(id);
            setGastos((prev) => prev.filter((x) => x.id !== id));
            Swal.fire('Eliminado', 'El gasto fue eliminado.', 'success');
        } catch (e) {
            Swal.fire('Error', e?.message || 'No se pudo eliminar el gasto', 'error');
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
        setFormaPagoId('');
        setTipoComp('');
        setClasif('');
    };

    // Export CSV (sobre datos ya filtrados por backend)
    const exportarCSV = () => {
        const rows = (gastos || []).map((g) => ({
            fecha_imputacion: g.fecha_imputacion || '',
            fecha_gasto: g.fecha_gasto || '',
            tipo_comprobante: g.tipo_comprobante || '',
            numero_comprobante: g.numero_comprobante || '',
            proveedor_nombre: g.proveedor_nombre || '',
            proveedor_cuit: g.proveedor_cuit || '',
            concepto: g.concepto || '',
            total: Number(g.total || 0).toFixed(2).replace('.', ','),
            forma_pago: fpNombre(g.forma_pago_id),
            clasificacion: g.clasificacion || '',
            mes: g.mes ?? '',
            anio: g.anio ?? '',
            gasto_realizado_por: g.gasto_realizado_por || '',
            observacion: g.observacion || '',
        }));
        exportToCSV(`gastos-${desde || ''}_a_${hasta || ''}.csv`, rows, [
            'fecha_imputacion',
            'fecha_gasto',
            'tipo_comprobante',
            'numero_comprobante',
            'proveedor_nombre',
            'proveedor_cuit',
            'concepto',
            'total',
            'forma_pago',
            'clasificacion',
            'mes',
            'anio',
            'gasto_realizado_por',
            'observacion',
        ]);
    };

    return (
        <div className="p-4 sm:p-6">
            {/* Título + Acciones */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Gastos</h1>
                    <p className="text-sm text-slate-600">Egresos simples (sin desglose fiscal). Impactan caja automáticamente.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={fetchData}
                        disabled={cargando}
                        className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                    >
                        <RefreshCw className="h-4 w-4" />
                        {cargando ? 'Actualizando…' : 'Actualizar'}
                    </button>

                    <button
                        onClick={exportarCSV}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        <Download className="h-4 w-4" />
                        CSV
                    </button>

                    <button
                        onClick={() => navigate('/gastos/nuevo')}
                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                        <Plus className="h-4 w-4" />
                        Nuevo gasto
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
                <form onSubmit={onSubmitFiltros} className="grid grid-cols-1 gap-3 sm:grid-cols-8">
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Desde</label>
                        <input
                            type="date"
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={desde}
                            onChange={(e) => setDesde(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Hasta</label>
                        <input
                            type="date"
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={hasta}
                            onChange={(e) => setHasta(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Mes</label>
                        <input
                            type="number"
                            min={1}
                            max={12}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={mes}
                            onChange={(e) => setMes(e.target.value)}
                            placeholder="1..12"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Año</label>
                        <input
                            type="number"
                            min={2000}
                            max={2100}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={anio}
                            onChange={(e) => setAnio(e.target.value)}
                            placeholder="2025"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Forma de pago</label>
                        <select
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={formaPagoId}
                            onChange={(e) => setFormaPagoId(e.target.value)}
                        >
                            <option value="">Todas</option>
                            <option value="null">Sin especificar</option>
                            {formasPago.map((fp) => (
                                <option key={fp.id} value={String(fp.id)}>
                                    {fp.nombre}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Tipo comprobante</label>
                        <input
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={tipoComp}
                            onChange={(e) => setTipoComp(e.target.value)}
                            placeholder="Ticket, Recibo, etc."
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Clasificación</label>
                        <input
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={clasif}
                            onChange={(e) => setClasif(e.target.value)}
                            placeholder="Ej: combustible, viáticos"
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Buscar</label>
                        <input
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Concepto / Nro comp / Proveedor / Clasif"
                        />
                    </div>

                    <div className="sm:col-span-2 flex items-end gap-2">
                        <button
                            className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
                            type="submit"
                        >
                            Filtrar
                        </button>
                        <button
                            type="button"
                            onClick={resetFiltros}
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Limpiar
                        </button>
                    </div>
                </form>
            </div>

            {error && (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Tabla */}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                            <tr>
                                <th className="px-4 py-2">Fecha</th>
                                <th className="px-4 py-2">Comprobante</th>
                                <th className="px-4 py-2">Proveedor</th>
                                <th className="px-4 py-2">Concepto</th>
                                <th className="px-4 py-2">Forma de pago</th>
                                <th className="px-4 py-2 text-right">Total</th>
                                <th className="px-4 py-2 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                                        Cargando…
                                    </td>
                                </tr>
                            ) : gastos.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                                        Sin resultados
                                    </td>
                                </tr>
                            ) : (
                                gastos.map((g) => (
                                    <tr key={g.id} className="border-t border-slate-100">
                                        <td className="px-4 py-2">{g.fecha_imputacion}</td>
                                        <td className="px-4 py-2">
                                            <div className="text-xs">
                                                <div className="font-medium">{g.tipo_comprobante || '-'}</div>
                                                <div className="text-slate-500">{g.numero_comprobante || '-'}</div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2">
                                            <div className="text-xs">
                                                <div className="font-medium">{g.proveedor_nombre || '-'}</div>
                                                <div className="text-slate-500">{g.proveedor_cuit || '-'}</div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2">
                                            <div className="text-xs">
                                                <div className="font-medium">{g.concepto}</div>
                                                <div className="text-slate-500">{g.clasificacion || '-'}</div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2">{fpNombre(g.forma_pago_id)}</td>
                                        <td className="px-4 py-2 text-right font-medium">{fmtARS(g.total)}</td>
                                        <td className="px-4 py-2">
                                            <div className="flex justify-end gap-2">
                                                <Link
                                                    to={`/gastos/${g.id}/editar`}
                                                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                >
                                                    <PencilLine className="h-4 w-4" />
                                                    Editar
                                                </Link>
                                                <button
                                                    onClick={() => handleEliminar(g.id)}
                                                    className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    Borrar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>

                        {gastos.length > 0 && (
                            <tfoot>
                                <tr className="border-t border-slate-200 bg-slate-50">
                                    <th colSpan={5} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-slate-600">
                                        Total
                                    </th>
                                    <th className="px-4 py-2 text-right">{fmtARS(total)}</th>
                                    <th></th>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
