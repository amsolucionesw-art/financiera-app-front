// src/pages/Compras.jsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
    listarCompras,
    eliminarCompra,
    COMPRAS_EXPORT_COLUMNS,
    buildComprasExportRows,
} from '../services/comprasService';
import { listarProveedores } from '../services/proveedorService';
import { obtenerFormasDePago } from '../services/cuotaService';
import { exportToCSV, exportContableXLSX } from '../utils/exporters';
import {
    RefreshCw,
    Plus,
    Pencil,
    Trash2,
    Download,
    FileSpreadsheet,
    Building2,
    Loader2,
    Search,
} from 'lucide-react';

/* ─────────── Helpers fecha/número ─────────── */
const toYMD = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate() + 0).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};
const today = toYMD(new Date());
const fmtNum = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

/* ─────────── Debounce hook (igual que en Proveedores) ─────────── */
function useDebouncedValue(value, delay = 300) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

export default function Compras() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // ✅ Filtros simplificados: { desde, hasta, q, proveedor_id }
    const [desde, setDesde] = useState(searchParams.get('desde') || today);
    const [hasta, setHasta] = useState(searchParams.get('hasta') || today);
    const [q, setQ] = useState(searchParams.get('q') || '');
    const [proveedorId, setProveedorId] = useState(searchParams.get('proveedor_id') || '');

    // Debounce para texto libre
    const debouncedQ = useDebouncedValue(q, 300);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [rows, setRows] = useState([]);

    // Proveedores para filtro (se cargan una vez, sin “buscar proveedor”)
    const [proveedores, setProveedores] = useState([]);
    const [provLoading, setProvLoading] = useState(false);
    const [provError, setProvError] = useState('');

    // Formas de pago (catálogo para mostrar nombre en tabla)
    const [formasPago, setFormasPago] = useState([]);

    const formaPagoMap = useMemo(() => {
        const map = {};
        (formasPago || []).forEach((fp) => {
            if (fp && fp.id != null) {
                map[fp.id] = fp.nombre;
            }
        });
        return map;
    }, [formasPago]);

    const persistFiltersToUrl = (params) => {
        const sp = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') sp.set(k, v);
        });
        setSearchParams(sp);
    };

    /* ─────────── Proveedores ─────────── */
    const fetchProveedores = useCallback(async () => {
        setProvLoading(true);
        setProvError('');
        try {
            const res = await listarProveedores({
                limit: 300,
                orderBy: 'nombre_razon_social',
                orderDir: 'ASC',
            });
            const arr = Array.isArray(res) ? res : res?.data ?? res?.rows ?? [];
            setProveedores(Array.isArray(arr) ? arr : []);
        } catch (e) {
            setProvError(e?.message || 'No se pudieron cargar proveedores');
            setProveedores([]);
        } finally {
            setProvLoading(false);
        }
    }, []);

    /* ─────────── Formas de pago ─────────── */
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

    useEffect(() => {
        // Carga inicial de proveedores (sin input de búsqueda)
        fetchProveedores();
        // Persistimos filtros base
        persistFiltersToUrl({
            desde,
            hasta,
            q,
            proveedor_id: proveedorId || undefined,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchProveedores]);

    /* ─────────── Datos de compras ─────────── */
    const fetchData = useCallback(async () => {
        // Normalizar rango invertido
        if (desde && hasta && desde > hasta) {
            const [d, h] = [hasta, desde];
            setDesde(d);
            setHasta(h);
            persistFiltersToUrl({
                desde: d,
                hasta: h,
                q,
                proveedor_id: proveedorId || undefined,
            });
        }
        setLoading(true);
        setError('');
        try {
            const params = {
                desde: desde || undefined,
                hasta: hasta || undefined,
                q: debouncedQ || undefined, // 🔎 libre: proveedor/telefono/cuit/nro/tipo/clasif
                proveedor_id: proveedorId || undefined,
            };
            const data = await listarCompras(params);
            setRows(Array.isArray(data) ? data : []);
            // Persistimos filtros usados
            persistFiltersToUrl(params);
        } catch (e) {
            setError(e?.message || 'Error al cargar compras');
        } finally {
            setLoading(false);
        }
    }, [desde, hasta, debouncedQ, proveedorId, q]);

    // Filtro en vivo
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const total = useMemo(
        () => rows.reduce((acc, r) => acc + Number(r.total || 0), 0),
        [rows]
    );

    /* ─────────── Acciones ─────────── */
    const handleEliminar = async (id) => {
        const conf = await Swal.fire({
            title: 'Eliminar compra',
            text: '¿Seguro querés eliminar esta compra? Esta acción no se puede deshacer.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc2626',
        });
        if (!conf.isConfirmed) return;

        try {
            await eliminarCompra(id);
            setRows((prev) => prev.filter((x) => x.id !== id));
            Swal.fire('Eliminada', 'La compra fue eliminada.', 'success');
        } catch (e) {
            Swal.fire('Error', e?.message || 'No se pudo eliminar la compra', 'error');
        }
    };

    const resetFiltros = () => {
        const next = {
            desde: today,
            hasta: today,
            q: '',
            proveedor_id: '',
        };
        setDesde(next.desde);
        setHasta(next.hasta);
        setQ(next.q);
        setProveedorId(next.proveedor_id);
        persistFiltersToUrl(next);
        // El efecto de fetchData recarga solo
    };

    // Export CSV reutilizando helpers del service
    const exportarCSV = () => {
        const file = `compras-${desde || ''}_a_${hasta || ''}.csv`;
        const rowsCSV = buildComprasExportRows(rows || []);
        exportToCSV(file, rowsCSV, COMPRAS_EXPORT_COLUMNS);
    };

    // Export Excel (XLSX) con mismas columnas
    const exportarXLSX = async () => {
        const data = (rows || []).map((r) => ({
            'FECHA IMPUTACIÓN': r.fecha_imputacion || '',
            'FECHA DE COMPR': r.fecha_compra || '',
            'TIPO DE COMPROBANTE': r.tipo_comprobante || '',
            'N° DE COMP': r.numero_comprobante || '',
            'NOMBRE Y APELLIDO- RS': r.proveedor_nombre || '',
            'CUIT-CUIL': r.proveedor_cuit || '',
            NETO: Number(r.neto || 0),
            IVA: Number(r.iva || 0),
            'PER IVA': Number(r.per_iva || 0),
            'PER IIBB TUC': Number(r.per_iibb_tuc || 0),
            'PER TEM': Number(r.per_tem || 0),
            TOTAL: Number(r.total || 0),
            'DEPOSITO DESTINO': r.deposito_destino || '',
            'REFERENCIA DE COMP': r.referencia_compra || '',
            CLASIFICACION: r.clasificacion || '',
            MES: r.mes ?? '',
            AÑO: r.anio ?? '',
            'FACTURADO A': r.facturado_a || '',
            'GASTO REALIZADO POR': r.gasto_realizado_por || '',
            'FORMA DE PAGO':
                r.formaPago?.nombre ??
                r.forma_pago_nombre ??
                (r.forma_pago_id != null ? (formaPagoMap[r.forma_pago_id] || '') : ''),
            'CajaMovID': r.caja_movimiento_id ?? '',
        }));

        await exportContableXLSX({ compras: data }, `compras-${desde || ''}_a_${hasta || ''}.xlsx`);
    };

    return (
        <div className="mx-auto max-w-7xl px-2 py-4 sm:px-4">
            {/* Header (alineado a Proveedores) */}
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-6 w-6" />
                    <h1 className="text-xl font-semibold">Compras</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                        title="Actualizar"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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

                    <button
                        onClick={() => navigate('/compras/nuevo')}
                        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        <Plus className="h-4 w-4" />
                        Nuevo
                    </button>
                </div>
            </div>

            {/* Filtros simplificados y alineados (sin “buscar proveedor”) */}
            <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    {/* 1) Rango de fechas */}
                    <div className="sm:col-span-3">
                        <label className="mb-1 block text-sm font-medium">Desde</label>
                        <input
                            type="date"
                            value={desde}
                            onChange={(e) => setDesde(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring focus:ring-gray-200"
                        />
                    </div>
                    <div className="sm:col-span-3">
                        <label className="mb-1 block text-sm font-medium">Hasta</label>
                        <input
                            type="date"
                            value={hasta}
                            onChange={(e) => setHasta(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring focus:ring-gray-200"
                        />
                    </div>

                    {/* 2) Buscador unificado */}
                    <div className="sm:col-span-6">
                        <label className="mb-1 block text-sm font-medium">
                            Buscar (nombre proveedor / teléfono / CUIT / nro / tipo / clasif)
                        </label>
                        <div className="relative">
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Ej: Proveedor SA, 381-555..., 20-12345678-3, FC A 0001-..."
                                className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 outline-none focus:ring focus:ring-gray-200"
                            />
                            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        </div>
                    </div>

                    {/* 3) Proveedor (solo select) */}
                    <div className="sm:col-span-6">
                        <label className="mb-1 block text-sm font-medium">
                            <span className="inline-flex items-center gap-1">
                                <Building2 className="h-4 w-4 text-gray-500" />
                                Proveedor
                            </span>
                        </label>
                        <select
                            value={proveedorId}
                            onChange={(e) => setProveedorId(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring focus:ring-gray-200"
                        >
                            <option value="">— Todos —</option>
                            {proveedores.map((p) => (
                                <option key={p.id} value={String(p.id)}>
                                    {p.nombre_razon_social}{p.cuil_cuit ? ` (${p.cuil_cuit})` : ''}
                                </option>
                            ))}
                        </select>
                        {provError && <div className="mt-1 text-xs text-rose-600">{provError}</div>}
                        {provLoading && <div className="mt-1 text-xs text-gray-500">Cargando proveedores…</div>}
                    </div>

                    {/* 4) Acciones */}
                    <div className="sm:col-span-12 flex items-center justify-end">
                        <button
                            type="button"
                            onClick={resetFiltros}
                            className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        >
                            Limpiar
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Tabla con scroll horizontal y header sticky */}
            <div className="rounded-lg border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="min-w-[1150px] text-sm">
                        <thead className="sticky top-0 z-10 bg-gray-50 text-gray-700">
                            <tr>
                                <Th>Fecha imputación</Th>
                                <Th>Comprobante</Th>
                                <Th>Proveedor</Th>
                                <Th className="text-right">Neto</Th>
                                <Th className="text-right">IVA</Th>
                                <Th className="text-right">Total</Th>
                                <Th>Forma de pago</Th>
                                <Th>Clasif.</Th>
                                <Th className="w-40 text-right">Acciones</Th>
                            </tr>
                        </thead>

                        <tbody>
                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <span>Sin resultados para los filtros aplicados.</span>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={resetFiltros}
                                                    className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                                                >
                                                    Restablecer filtros
                                                </button>
                                                <button
                                                    onClick={() => navigate('/compras/nuevo')}
                                                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                    Crear primera compra
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {loading && (
                                <tr>
                                    <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                                        <div className="inline-flex items-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Cargando…
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {!loading && rows.map((r) => (
                                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                                    <Td>{r.fecha_imputacion}</Td>
                                    <Td>
                                        <div className="text-gray-900">{r.tipo_comprobante}</div>
                                        <div className="text-xs text-gray-500">{r.numero_comprobante}</div>
                                    </Td>
                                    <Td>
                                        <div className="text-gray-900">{r.proveedor_nombre}</div>
                                        <div className="text-xs text-gray-500">{r.proveedor_cuit || '-'}</div>
                                    </Td>
                                    <Td className="text-right">{fmtNum(r.neto)}</Td>
                                    <Td className="text-right">{fmtNum(r.iva)}</Td>
                                    <Td className="text-right font-medium">{fmtNum(r.total)}</Td>
                                    <Td>
                                        {
                                            r.formaPago?.nombre ||
                                            r.forma_pago_nombre ||
                                            (r.forma_pago_id != null
                                                ? (formaPagoMap[r.forma_pago_id] || 'Sin especificar')
                                                : 'Sin especificar')
                                        }
                                    </Td>
                                    <Td>{r.clasificacion || '-'}</Td>
                                    <Td>
                                        <div className="flex justify-end gap-2">
                                            <Link
                                                to={`/compras/${r.id}/editar`}
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
                                    </Td>
                                </tr>
                            ))}
                        </tbody>

                        {!loading && rows.length > 0 && (
                            <tfoot className="border-t border-gray-100 bg-gray-50">
                                <tr>
                                    <td className="px-3 py-2 text-right font-medium" colSpan={5}>
                                        Total
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold">{fmtNum(total)}</td>
                                    <td colSpan={3}></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ─────────── Subcomponentes de tabla para coherencia visual ─────────── */
function Th({ children, className = '' }) {
    return (
        <th className={'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 ' + className}>
            {children}
        </th>
    );
}

function Td({ children, className = '' }) {
    return <td className={'whitespace-nowrap px-4 py-3 text-sm ' + className}>{children}</td>;
}