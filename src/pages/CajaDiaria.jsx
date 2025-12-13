// src/pages/CajaDiaria.jsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import Swal from 'sweetalert2';
import { TIPOS_CAJA, crearMovimiento, obtenerMovimientos, obtenerResumenDiario } from '../services/cajaService';
import { obtenerFormasDePago } from '../services/cuotaService';
import { exportToCSV } from '../utils/exporters';
import { jwtDecode } from 'jwt-decode';

// Helpers
const todayYMD = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const fmtARS = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const tipoLabel = (t) =>
    t === 'ingreso'
        ? 'Ingreso'
        : t === 'egreso'
            ? 'Egreso'
            : t === 'ajuste'
                ? 'Ajuste'
                : t === 'apertura'
                    ? 'Apertura'
                    : t === 'cierre'
                        ? 'Cierre'
                        : t;

const chipClass = (t) =>
    t === 'ingreso'
        ? 'bg-green-100 text-green-700 ring-green-200'
        : t === 'egreso'
            ? 'bg-red-100 text-red-700 ring-red-200'
            : t === 'ajuste'
                ? 'bg-yellow-100 text-yellow-700 ring-yellow-200'
                : t === 'apertura'
                    ? 'bg-blue-100 text-blue-700 ring-blue-200'
                    : t === 'cierre'
                        ? 'bg-gray-100 text-gray-700 ring-gray-200'
                        : 'bg-slate-100 text-slate-700 ring-slate-200';

/** Signo y formato visual del monto según tipo de movimiento */
const montoConSigno = (tipo, monto) => {
    const valor = Number(monto || 0);
    if (!Number.isFinite(valor)) return fmtARS(0);

    let sign = '';
    if (tipo === 'ingreso' || tipo === 'apertura' || tipo === 'ajuste') sign = '+';
    else if (tipo === 'egreso' || tipo === 'cierre') sign = '-';

    return `${sign ? sign + ' ' : ''}${fmtARS(Math.abs(valor))}`;
};

const montoTextClass = (tipo) => {
    if (tipo === 'ingreso' || tipo === 'apertura' || tipo === 'ajuste') {
        return 'text-emerald-700';
    }
    if (tipo === 'egreso' || tipo === 'cierre') {
        return 'text-rose-700';
    }
    return 'text-slate-800';
};

/** Valores alineados con referencia_tipo del backend:
 *   'venta', 'gasto', 'compra', 'recibo', 'credito', 'manual', null
 */
const CATEGORIAS_FILTRO = [
    { value: 'venta', label: 'Venta (manual)' },
    { value: 'gasto', label: 'Gasto' },
    { value: 'compra', label: 'Compra' },
    { value: 'recibo', label: 'Recibo (auto)' },
    { value: 'credito', label: 'Crédito (auto)' },
    { value: 'manual', label: 'Manual (otra)' },
    { value: 'null', label: 'Sin categoría (NULL)' },
];

const CATEGORIAS_ALTA = [{ value: '', label: '(Seleccionar)' }, ...CATEGORIAS_FILTRO];

/* Etiquetas “lindas” para categoría */
const REF_LABELS = CATEGORIAS_FILTRO.reduce((acc, c) => {
    acc[c.value] = c.label;
    return acc;
}, {});

// Alineado con CajaMensual: contempla venta financiada
const referenciaTipoLabel = (v, esVentaFinanciada = false) => {
    if (v == null) return 'Sin categoría';
    const key = String(v).toLowerCase();
    if (key === 'null') return 'Sin categoría';
    if (key === 'venta') {
        return esVentaFinanciada ? 'Venta financiada' : (REF_LABELS['venta'] || 'Venta');
    }
    return REF_LABELS[key] || v;
};

/** Texto “Ref. ID” */
const referenciaIdLabel = (m) => {
    if (m.referencia_id == null || m.referencia_tipo == null) return '—';
    const tipo = String(m.referencia_tipo).toLowerCase();
    const id = m.referencia_id;
    if (!id && id !== 0) return '—';

    if (tipo === 'credito') return `Crédito #${id}`;
    if (tipo === 'recibo') return `Recibo #${id}`;
    if (tipo === 'venta') return `Venta #${id}`;
    if (tipo === 'gasto') return `Gasto #${id}`;
    if (tipo === 'compra') return `Compra #${id}`;
    if (tipo === 'manual') return `Manual #${id}`;
    return `#${id}`;
};

/** Tooltip extra para la categoría / referencia */
const referenciaTooltip = (m) => {
    if (!m?.referencia_tipo || m.referencia_id == null) return '';
    const tipo = String(m.referencia_tipo).toLowerCase();
    const id = m.referencia_id;

    if (tipo === 'credito') return `Movimiento asociado al crédito #${id}`;
    if (tipo === 'recibo') return `Movimiento asociado al recibo #${id}`;
    if (tipo === 'venta') return `Movimiento asociado a la venta manual #${id}`;
    if (tipo === 'gasto') return `Movimiento asociado al gasto #${id}`;
    if (tipo === 'compra') return `Movimiento asociado a la compra #${id}`;
    if (tipo === 'manual') return `Movimiento manual con referencia #${id}`;
    return `Referencia ${tipo} #${id}`;
};

/* ───────────────── Modal de detalle ───────────────── */
const DetalleIndicadorModal = ({
    isOpen,
    onClose,
    title,
    subtitle,
    rows = [],
    totalGeneral = 0,
    exportFileName = 'detalle.csv',
}) => {
    if (!isOpen) return null;

    // Ordenamos por total desc y calculamos %
    const data = [...rows]
        .map((r) => ({
            nombre: r?.nombre ?? 'Sin especificar',
            total: Number(r?.total || 0),
            cantidad: r?.cantidad,
        }))
        .sort((a, b) => b.total - a.total);

    const exportar = () => {
        const csvRows = data.map((r) => ({
            forma_pago: r.nombre,
            total: r.total.toFixed(2).replace('.', ','),
            porcentaje: totalGeneral ? ((r.total / totalGeneral) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%',
            cantidad: r.cantidad ?? '',
        }));
        exportToCSV(exportFileName, csvRows, ['forma_pago', 'total', 'porcentaje', 'cantidad']);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            {/* Modal */}
            <div className="relative z-10 w-full sm:max-w-2xl sm:rounded-lg bg-white shadow-xl sm:mx-4">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
                    <div>
                        <h3 className="text-base font-semibold">{title}</h3>
                        {subtitle ? <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={exportar}
                            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Exportar CSV
                        </button>
                        <button
                            onClick={onClose}
                            className="rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>

                <div className="max-h-[70vh] overflow-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                            <tr>
                                <th className="px-4 py-2">Forma de pago</th>
                                <th className="px-4 py-2 text-right">Total</th>
                                <th className="px-4 py-2 text-right">% del total</th>
                                <th className="px-4 py-2 text-right">Cant. movs</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                                        Sin datos.
                                    </td>
                                </tr>
                            ) : (
                                data.map((r, idx) => (
                                    <tr key={`${r.nombre}-${idx}`} className="border-t border-slate-100">
                                        <td className="px-4 py-2">{r.nombre}</td>
                                        <td className="px-4 py-2 text-right font-medium">{fmtARS(r.total)}</td>
                                        <td className="px-4 py-2 text-right">
                                            {totalGeneral ? `${((r.total / totalGeneral) * 100).toFixed(2)}%` : '0.00%'}
                                        </td>
                                        <td className="px-4 py-2 text-right">{r.cantidad ?? '—'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {data.length > 0 ? (
                            <tfoot>
                                <tr className="border-t border-slate-200 bg-slate-50/60">
                                    <td className="px-4 py-2 font-semibold">Total</td>
                                    <td className="px-4 py-2 text-right font-semibold">{fmtARS(totalGeneral)}</td>
                                    <td className="px-4 py-2 text-right font-semibold">100%</td>
                                    <td className="px-4 py-2 text-right">—</td>
                                </tr>
                            </tfoot>
                        ) : null}
                    </table>
                </div>
            </div>
        </div>
    );
};

const Diaria = () => {
    /* Filtros */
    const [fecha, setFecha] = useState(todayYMD());
    const [filtroTipos, setFiltroTipos] = useState([]);
    const [formaPagoId, setFormaPagoId] = useState('');
    const [categorias, setCategorias] = useState([]);
    const [refId, setRefId] = useState('');
    const [q, setQ] = useState('');

    /* Datos */
    const [formas, setFormas] = useState([]);
    const [resumen, setResumen] = useState(null);
    const [movs, setMovs] = useState([]);
    const [loading, setLoading] = useState(false);

    /* Paginación para movimientos */
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    /* Alta rápida */
    const [nuevo, setNuevo] = useState({
        tipo: 'ingreso',
        monto: '',
        forma_pago_id: '',
        concepto: '',
        referencia_tipo: '',
        referencia_id: '',
    });
    const resetNuevo = () =>
        setNuevo({
            tipo: 'ingreso',
            monto: '',
            forma_pago_id: '',
            concepto: '',
            referencia_tipo: '',
            referencia_id: '',
        });

    /* Estado del modal de detalle */
    const [modalOpen, setModalOpen] = useState(false);
    const [modalData, setModalData] = useState({
        title: '',
        subtitle: '',
        rows: [],
        totalGeneral: 0,
        exportFileName: 'detalle.csv',
    });

    /* Rol del usuario */
    const [esSuperadmin, setEsSuperadmin] = useState(false);

    /* ───────── Carga de formas de pago ───────── */
    const fetchFormas = useCallback(async () => {
        try {
            const data = await obtenerFormasDePago();
            setFormas(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error formas de pago', err);
        }
    }, []);

    /* ───────── Cargar resumen ───────── */
    const cargarResumen = useCallback(async () => {
        try {
            const data = await obtenerResumenDiario({ fecha });
            setResumen(data);
        } catch (err) {
            console.error('Error resumen diario', err);
            setResumen(null);
        }
    }, [fecha]);

    /* ───────── Cargar movimientos ───────── */
    const cargarMovimientos = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                desde: fecha,
                hasta: fecha,
                limit: 500,
            };

            if (filtroTipos && filtroTipos.length) params.tipo = filtroTipos;
            if (formaPagoId !== '') params.forma_pago_id = formaPagoId;
            if (categorias && categorias.length) params.referencia_tipo = categorias;
            if (refId && String(refId).trim() !== '') params.referencia_id = refId;
            if (q && q.trim() !== '') params.q = q.trim();

            const data = await obtenerMovimientos(params);
            setMovs(Array.isArray(data) ? data : []);
            setCurrentPage(1); // reset paginación al recargar
        } catch (err) {
            console.error('Error listando movimientos', err);
            Swal.fire('Error', err.message || 'No se pudieron cargar movimientos', 'error');
        } finally {
            setLoading(false);
        }
    }, [fecha, filtroTipos, formaPagoId, categorias, refId, q]);

    /* ───────── Cargar rol desde el token ───────── */
    useEffect(() => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            const decoded = jwtDecode(token);

            const rolIdRaw =
                decoded.rol_id ??
                decoded.role_id ??
                decoded.id_rol ??
                decoded.rolId ??
                decoded.rol;

            const rolIdNum = Number.isNaN(Number(rolIdRaw)) ? null : Number(rolIdRaw);

            // 0 = superadmin, 1 = admin
            const isSuperOrAdmin = rolIdNum === 0 || rolIdNum === 1;

            setEsSuperadmin(isSuperOrAdmin);
        } catch (err) {
            console.error('Error decodificando token JWT', err);
            setEsSuperadmin(false);
        }
    }, []);

    /* Hooks de carga inicial y recarga */
    useEffect(() => {
        fetchFormas();
    }, [fetchFormas]);

    useEffect(() => {
        cargarResumen();
        cargarMovimientos();
    }, [cargarResumen, cargarMovimientos]);

    // Reset página cuando cambian filtros manualmente
    useEffect(() => {
        setCurrentPage(1);
    }, [fecha, filtroTipos, formaPagoId, categorias, refId, q]);

    const totales = useMemo(() => resumen?.totales || null, [resumen]);

    const formaPagoValido = (v) => v !== '' && v !== 'null' && !Number.isNaN(Number(v));

    /* ------- Detalles por card ------- */

    // 1) Detalle directo por tipo, si backend lo provee (ideal)
    const detallesPorTipo = useMemo(() => {
        const base = resumen?.porTipo || null;
        if (base) return base;
        // Fallback: reconstruir desde porFormaPago si hiciera falta
        const out = { ingreso: [], egreso: [], ajuste: [], apertura: [], cierre: [] };
        const pf = resumen?.porFormaPago || {};
        Object.entries(pf).forEach(([nombre, mapTipos]) => {
            Object.entries(mapTipos).forEach(([t, total]) => {
                if (!out[t]) out[t] = [];
                out[t].push({ id: null, nombre, total: Number(total || 0) });
            });
        });
        return out;
    }, [resumen]);

    // 2) Detalle para "Saldo del día" por forma de pago
    const detalleSaldoPorForma = useMemo(() => {
        const pf = resumen?.porFormaPago || {};
        const build = [];
        Object.entries(pf).forEach(([nombre, byT]) => {
            const apertura = Number(byT.apertura || 0);
            const ingreso = Number(byT.ingreso || 0);
            const egreso = Number(byT.egreso || 0);
            const ajuste = Number(byT.ajuste || 0);
            const cierre = Number(byT.cierre || 0);
            const saldo = apertura + ingreso - egreso + ajuste - cierre;
            if (saldo !== 0) build.push({ nombre, total: saldo });
        });
        if (build.length === 0) {
            Object.keys(pf).forEach((nombre) => build.push({ nombre, total: 0 }));
        }
        build.sort((a, b) => Number(b.total) - Number(a.total));
        return build;
    }, [resumen]);

    /* Paginación de movimientos */
    const totalPages = useMemo(() => {
        if (!movs || movs.length === 0) return 1;
        return Math.ceil(movs.length / rowsPerPage);
    }, [movs]);

    const paginatedMovs = useMemo(() => {
        if (!movs || movs.length === 0) return [];
        const start = (currentPage - 1) * rowsPerPage;
        return movs.slice(start, start + rowsPerPage);
    }, [movs, currentPage]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [totalPages, currentPage]);

    const startIndex = movs && movs.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0;
    const endIndex = movs && movs.length > 0 ? Math.min(currentPage * rowsPerPage, movs.length) : 0;

    /* Acciones */
    const onCrearMovimiento = async (e) => {
        e.preventDefault();

        if (!esSuperadmin) {
            Swal.fire(
                'Permiso denegado',
                'Solo usuarios con rol administrador pueden registrar movimientos manuales en Caja.',
                'warning'
            );
            return;
        }

        try {
            const payload = {
                tipo: String(nuevo.tipo || '').toLowerCase(),
                monto: String(nuevo.monto || '').trim(),
                concepto: (nuevo.concepto || '').trim(),
                fecha,
            };
            if (formaPagoValido(nuevo.forma_pago_id)) payload.forma_pago_id = Number(nuevo.forma_pago_id);
            else if (nuevo.forma_pago_id === 'null') payload.forma_pago_id = null;

            const refTipo = (nuevo.referencia_tipo || '').trim().toLowerCase();
            if (refTipo) payload.referencia_tipo = refTipo === 'null' ? null : refTipo;

            const refIdVal = Number(nuevo.referencia_id);
            if (Number.isFinite(refIdVal)) payload.referencia_id = refIdVal;

            await crearMovimiento(payload);
            resetNuevo();
            await Promise.all([cargarResumen(), cargarMovimientos()]);
            Swal.fire('OK', 'Movimiento creado', 'success');
        } catch (err) {
            console.error('Error creando movimiento', err);
            Swal.fire('Error', err.message || 'No se pudo crear el movimiento', 'error');
        }
    };

    const exportarCSV = () => {
        const rows = (movs || []).map((m) => ({
            fecha: m.fecha,
            hora: m.hora,
            tipo: m.tipo,
            concepto: m.concepto,
            forma_pago:
                m.formaPago?.nombre || (m.forma_pago_id == null ? 'Sin especificar' : `#${m.forma_pago_id}`),
            usuario:
                m.usuario?.nombre_completo ||
                m.usuario?.nombre_usuario ||
                (m.usuario_id ? `#${m.usuario_id}` : ''),
            categoria: referenciaTipoLabel(m.referencia_tipo, m.es_venta_financiada),
            ref_tipo: m.referencia_tipo ?? '',
            ref_id: m.referencia_id ?? '',
            monto: Number(m.monto || 0).toFixed(2).replace('.', ','),
        }));
        exportToCSV(`caja-diaria-${fecha}.csv`, rows, [
            'fecha',
            'hora',
            'tipo',
            'concepto',
            'forma_pago',
            'usuario',
            'categoria',
            'ref_tipo',
            'ref_id',
            'monto',
        ]);
    };

    /* ------- Handlers para abrir modal ------- */
    const abrirModalTipo = (tipo) => {
        const totalGeneral = Number(totales?.[tipo] ?? 0);
        const rows = (detallesPorTipo?.[tipo] || []).map((d) => ({
            nombre: d?.nombre ?? 'Sin especificar',
            total: Number(d?.total || 0),
            cantidad: d?.cantidad,
        }));
        setModalData({
            title: `${tipoLabel(tipo)} del día`,
            subtitle: `Fecha: ${fecha}`,
            rows,
            totalGeneral,
            exportFileName: `detalle-${tipo}-${fecha}.csv`,
        });
        setModalOpen(true);
    };

    const abrirModalSaldo = () => {
        const totalGeneral = Number(totales?.saldoDia ?? 0);
        const rows = detalleSaldoPorForma.map((d) => ({
            nombre: d?.nombre ?? 'Sin especificar',
            total: Number(d?.total || 0),
        }));
        setModalData({
            title: 'Saldo del día por forma de pago',
            subtitle: `Fecha: ${fecha}`,
            rows,
            totalGeneral,
            exportFileName: `detalle-saldo-${fecha}.csv`,
        });
        setModalOpen(true);
    };

    /* ------- UI ------- */

    const CardTotal = ({ tipo, total, onClick }) => (
        <button
            type="button"
            className={`text-left rounded-lg ring-1 w-full ${chipClass(tipo)} hover:shadow transition-shadow`}
            onClick={onClick}
            title={`Ver detalle por forma de pago de ${tipoLabel(tipo)}`}
        >
            <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] uppercase tracking-wide opacity-70">{tipoLabel(tipo)}</div>
                    <div className="text-xs opacity-60">Ver detalle</div>
                </div>
                <div className="text-base font-semibold">{fmtARS(total ?? 0)}</div>
            </div>
        </button>
    );

    const CardSaldo = ({ total, onClick }) => (
        <button
            type="button"
            className="text-left rounded-lg bg-emerald-50 p-0 ring-1 ring-emerald-200 hover:shadow transition-shadow w-full"
            onClick={onClick}
            title="Ver saldo por forma de pago"
        >
            <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] uppercase tracking-wide text-emerald-700/70">Saldo del día</div>
                    <div className="text-xs text-emerald-800 opacity-60">Ver detalle</div>
                </div>
            </div>
            <div className="px-3 pb-3">
                <div className="text-base font-semibold text-emerald-800">{fmtARS(total ?? 0)}</div>
            </div>
        </button>
    );

    return (
        <div className="p-4 sm:p-6">
            {/* Título + Fecha */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Caja diaria</h1>
                    <p className="text-sm text-slate-600">
                        Movimientos y resumen del día seleccionado. Filtrá por tipo, forma de pago, categoría y texto.
                    </p>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs uppercase text-slate-500">Fecha</label>
                    <input
                        type="date"
                        className="block rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                    />
                </div>
            </div>

            {/* Filtros */}
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-6">
                {/* Tipos */}
                <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Tipos</label>
                    <select
                        multiple
                        className="h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={filtroTipos}
                        onChange={(e) => setFiltroTipos(Array.from(e.target.selectedOptions).map((o) => o.value))}
                    >
                        {TIPOS_CAJA.map((t) => (
                            <option key={t} value={t}>
                                {tipoLabel(t)}
                            </option>
                        ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">Ctrl/cmd para múltiples.</p>
                </div>

                {/* Forma de pago */}
                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Forma de pago</label>
                    <select
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={formaPagoId}
                        onChange={(e) => setFormaPagoId(e.target.value)}
                    >
                        <option value="">(Todas)</option>
                        <option value="null">Sin especificar</option>
                        {formas.map((f) => (
                            <option key={f.id} value={String(f.id)}>
                                {f.nombre}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Categorías */}
                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Categorías</label>
                    <select
                        multiple
                        className="h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={categorias}
                        onChange={(e) => setCategorias(Array.from(e.target.selectedOptions).map((o) => o.value))}
                    >
                        {CATEGORIAS_FILTRO.map((c) => (
                            <option key={c.value} value={c.value}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">Podés incluir “Sin categoría”.</p>
                </div>

                {/* Ref ID y texto */}
                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Ref. ID</label>
                    <input
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="p.ej. ID de crédito/recibo"
                        value={refId}
                        onChange={(e) => setRefId(e.target.value)}
                    />
                </div>
                <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Buscar por concepto</label>
                    <input
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Ej: Acreditación crédito, compra insumos, etc."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                </div>
            </div>

            {/* Totales del día */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
                {['ingreso', 'egreso', 'ajuste', 'apertura', 'cierre'].map((t) => (
                    <CardTotal key={t} tipo={t} total={totales?.[t] ?? 0} onClick={() => abrirModalTipo(t)} />
                ))}
                <CardSaldo total={totales?.saldoDia ?? 0} onClick={abrirModalSaldo} />
            </div>

            {/* Acciones exportar */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                    onClick={exportarCSV}
                    className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
                >
                    Exportar CSV
                </button>
            </div>

            {/* Tabla */}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-2">Fecha</th>
                                <th className="px-4 py-2">Hora</th>
                                <th className="px-4 py-2">Tipo</th>
                                <th className="px-4 py-2">Concepto</th>
                                <th className="px-4 py-2">Forma de pago</th>
                                <th className="px-4 py-2">Usuario</th>
                                <th className="px-4 py-2">Ref. ID</th>
                                <th className="px-4 py-2">Categoría</th>
                                <th className="px-4 py-2 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                                        Cargando movimientos...
                                    </td>
                                </tr>
                            ) : (movs || []).length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                                        No hay movimientos para la fecha seleccionada con los filtros aplicados.
                                    </td>
                                </tr>
                            ) : (
                                paginatedMovs.map((m) => {
                                    const categoriaLabel = referenciaTipoLabel(m.referencia_tipo, m.es_venta_financiada);
                                    const categoriaTitle = referenciaTooltip(m);
                                    return (
                                        <tr key={m.id} className="border-t border-slate-100">
                                            <td className="px-4 py-2">{m.fecha}</td>
                                            <td className="px-4 py-2">{m.hora}</td>
                                            <td className="px-4 py-2">
                                                <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${chipClass(m.tipo)}`}>
                                                    {tipoLabel(m.tipo)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2">{m.concepto}</td>
                                            <td className="px-4 py-2">
                                                {m.formaPago?.nombre ||
                                                    (m.forma_pago_id == null ? 'Sin especificar' : `#${m.forma_pago_id}`)}
                                            </td>
                                            <td className="px-4 py-2">
                                                {m.usuario?.nombre_completo ||
                                                    m.usuario?.nombre_usuario ||
                                                    (m.usuario_id ? `#${m.usuario_id}` : '—')}
                                            </td>
                                            <td className="px-4 py-2">
                                                {referenciaIdLabel(m)}
                                            </td>
                                            <td className="px-4 py-2">
                                                <span title={categoriaTitle || undefined}>
                                                    {categoriaLabel}
                                                </span>
                                            </td>
                                            <td className={`px-4 py-2 text-right font-semibold ${montoTextClass(m.tipo)}`}>
                                                {montoConSigno(m.tipo, m.monto)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Controles de paginación */}
                {!loading && movs && movs.length > 0 && (
                    <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            Mostrando {startIndex}–{endIndex} de {movs.length} movimientos
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                            >
                                Anterior
                            </button>
                            <span className="text-xs">
                                Página {currentPage} de {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages || movs.length === 0}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Alta rápida: SOLO ADMIN / SUPERADMIN */}
            {esSuperadmin && (
                <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
                    <h2 className="mb-3 text-base font-semibold">Registrar movimiento</h2>
                    <form onSubmit={onCrearMovimiento} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">Tipo</label>
                            <select
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                value={nuevo.tipo}
                                onChange={(e) => setNuevo((s) => ({ ...s, tipo: e.target.value }))}
                                required
                            >
                                {TIPOS_CAJA.map((t) => (
                                    <option key={t} value={t}>
                                        {tipoLabel(t)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">Monto</label>
                            <input
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                placeholder="0,00"
                                value={nuevo.monto}
                                onChange={(e) => setNuevo((s) => ({ ...s, monto: e.target.value }))}
                                required
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">Forma de pago</label>
                            <select
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                value={nuevo.forma_pago_id}
                                onChange={(e) => setNuevo((s) => ({ ...s, forma_pago_id: e.target.value }))}
                            >
                                <option value="">(Seleccionar)</option>
                                <option value="null">Sin especificar</option>
                                {formas.map((f) => (
                                    <option key={f.id} value={String(f.id)}>
                                        {f.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">Categoría</label>
                            <select
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                value={nuevo.referencia_tipo}
                                onChange={(e) => setNuevo((s) => ({ ...s, referencia_tipo: e.target.value }))}
                            >
                                {CATEGORIAS_ALTA.map((c) => (
                                    <option key={c.value} value={c.value}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                                Ref. ID (opcional)
                            </label>
                            <input
                                type="number"
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                placeholder="Numérico (p.ej. ID de crédito/recibo)"
                                value={nuevo.referencia_id}
                                onChange={(e) => setNuevo((s) => ({ ...s, referencia_id: e.target.value }))}
                            />
                        </div>

                        <div className="sm:col-span-6">
                            <label className="mb-1 block text-xs font-semibold text-slate-600">Concepto</label>
                            <input
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                placeholder="Ej: Venta mostrador, Compra insumos, Ajuste, Apertura..."
                                value={nuevo.concepto}
                                onChange={(e) => setNuevo((s) => ({ ...s, concepto: e.target.value }))}
                                required
                            />
                        </div>

                        <div className="sm:col-span-6">
                            <button
                                type="submit"
                                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                            >
                                Guardar movimiento
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Modal de detalle */}
            <DetalleIndicadorModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={modalData.title}
                subtitle={modalData.subtitle}
                rows={modalData.rows}
                totalGeneral={modalData.totalGeneral}
                exportFileName={modalData.exportFileName}
            />
        </div>
    );
};

export default Diaria;
