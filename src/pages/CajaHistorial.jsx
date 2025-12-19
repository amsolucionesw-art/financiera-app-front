// src/pages/CajaHistorial.jsx
import { useEffect, useState, useCallback, useMemo } from 'react';
import Swal from 'sweetalert2';
import { obtenerMovimientos, TIPOS_CAJA, descargarMovimientosExcel } from '../services/cajaService';
import { obtenerFormasDePago } from '../services/cuotaService';
import { exportToCSV } from '../utils/exporters';
import { jwtDecode } from 'jwt-decode';

/* ============ Helpers numéricos/formatos ============ */
const fmtARS = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

/* ============ Helpers de fecha (UTC-safe) ============ */
const toYMD = (v) => {
    if (!v) return v;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const addDaysUTC = (ymd, days) => {
    const [y, m, d] = String(ymd).split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return toYMD(date);
};

const firstDay = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}-01`;

const lastDay = (anio, mes) => {
    const d = new Date(anio, mes, 0);
    return toYMD(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
};

const lastNDaysRange = (n = 3) => {
    const hoy = new Date();
    const hasta = toYMD(hoy);
    const desde = addDaysUTC(hasta, -(n - 1));
    return { desde, hasta };
};

const ensureRange = (desde, hasta) => {
    if (desde && hasta) {
        const a = new Date(`${desde}T00:00:00Z`);
        const b = new Date(`${hasta}T00:00:00Z`);
        if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) && a > b) {
            return { desde: hasta, hasta: desde };
        }
    }
    return { desde, hasta };
};

/* ============ Etiquetas/estilos ============ */
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

/* Alineadas con referencia_tipo del backend */
const CATEGORIAS = [
    { value: 'venta', label: 'Venta (manual)' },
    { value: 'gasto', label: 'Gasto' },
    { value: 'compra', label: 'Compra' },
    { value: 'recibo', label: 'Recibo (auto)' },
    { value: 'credito', label: 'Crédito (auto)' },
    { value: 'manual', label: 'Manual (otra)' },
    { value: 'null', label: 'Sin categoría (NULL)' },
];

const CATEGORIAS_MAP = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label]));

// Categoría con soporte para venta financiada
const referenciaTipoLabel = (v, esVentaFinanciada = false) => {
    if (v == null) return 'Sin categoría';
    const key = String(v).toLowerCase();
    if (key === 'null') return 'Sin categoría';
    if (key === 'venta') {
        return esVentaFinanciada ? 'Venta financiada' : (CATEGORIAS_MAP['venta'] || 'Venta');
    }
    return CATEGORIAS_MAP[key] || v;
};

// Etiqueta humana para la referencia (igual línea que CajaMensual)
const referenciaIdLabel = (refTipo, refId) => {
    if (refId == null || refId === '') return '—';
    const id = String(refId);
    const t = String(refTipo || '').toLowerCase();

    if (t === 'venta') return `Venta #${id}`;
    if (t === 'recibo') return `Recibo #${id}`;
    if (t === 'credito') return `Crédito #${id}`;
    if (t === 'gasto') return `Gasto #${id}`;
    if (t === 'compra') return `Compra #${id}`;
    if (t === 'manual') return `Ref. #${id}`;

    return `#${id}`;
};

// Monto con signo (solo visual)
const montoConSigno = (monto, tipo) => {
    const n = Number(monto || 0);
    const abs = Math.abs(n);
    const base = abs.toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    const t = String(tipo || '').toLowerCase();
    const esNegativo = t === 'egreso' || t === 'cierre';

    return `${esNegativo ? '-' : '+'} ${base}`;
};

// Colores para el monto según tipo
const montoTextClass = (tipo) => {
    const t = String(tipo || '').toLowerCase();
    if (t === 'egreso' || t === 'cierre') return 'text-red-700';
    if (t === 'ingreso' || t === 'apertura' || t === 'ajuste') return 'text-emerald-700';
    return 'text-slate-800';
};

/* ============ Helper: roles desde token ============ */
const resolveRol = (decoded) => {
    if (!decoded || typeof decoded !== 'object') return { rolId: null, rolStr: '' };

    const rolIdRaw = decoded.rol_id ?? decoded.usuario?.rol_id ?? decoded.role_id ?? decoded.usuario?.role_id ?? null;
    const rolId =
        typeof rolIdRaw === 'number'
            ? rolIdRaw
            : (typeof rolIdRaw === 'string' && /^\d+$/.test(rolIdRaw))
                ? Number(rolIdRaw)
                : null;

    const rawRol =
        decoded.rol ??
        decoded.role ??
        decoded.tipo ??
        decoded.tipo_usuario ??
        decoded.userRole ??
        decoded.usuario?.rol ??
        decoded.usuario?.role ??
        decoded.usuario?.tipo ??
        decoded.usuario?.tipo_usuario ??
        decoded.usuario?.userRole ??
        '';

    const rolStr = String(rawRol || '').toLowerCase();

    return { rolId: Number.isFinite(rolId) ? rolId : null, rolStr };
};

const canVerHistorialDesdeToken = (decoded) => {
    const { rolId, rolStr } = resolveRol(decoded);
    // superadmin=0, admin=1
    if (rolId === 0 || rolStr === 'superadmin') return true;
    if (rolId === 1 || rolStr === 'admin') return true;
    return false;
};

/* ============ Componente ============ */
const Historial = () => {
    /* ----- Estado base de período ----- */
    const today = new Date();
    const yInit = today.getFullYear();
    const mInit = today.getMonth() + 1;

    const [mostrarMesCompleto, setMostrarMesCompleto] = useState(false);
    const [anio, setAnio] = useState(yInit);
    const [mes, setMes] = useState(mInit);

    /* ✅ Rango personalizado */
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');

    /* ----- Datos ----- */
    const [formas, setFormas] = useState([]);
    const [movs, setMovs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [exportingXlsx, setExportingXlsx] = useState(false);

    /* ----- Filtros ----- */
    const [filtroTipos, setFiltroTipos] = useState([]);
    const [formaPagoId, setFormaPagoId] = useState('');
    const [categorias, setCategorias] = useState([]);
    const [refId, setRefId] = useState('');
    const [q, setQ] = useState('');

    /* ----- UI: panel de filtros ----- */
    const [filtrosOpen, setFiltrosOpen] = useState(true);

    /* ----- Rol / permisos ----- */
    const [canVerHistorial, setCanVerHistorial] = useState(false);

    /* ----- Paginación (front) ----- */
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    const totalItems = movs.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);

    const paginatedMovs = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        return movs.slice(start, end);
    }, [movs, currentPage, pageSize]);

    const getRangoActual = useCallback(() => {
        // 1) Rango personalizado (si se setea cualquiera de los dos)
        if (fechaDesde || fechaHasta) {
            const d = fechaDesde || fechaHasta;
            const h = fechaHasta || fechaDesde;
            const fixed = ensureRange(d, h);
            return { desde: fixed.desde, hasta: fixed.hasta, modo: 'rango' };
        }

        // 2) Mes completo
        if (mostrarMesCompleto) {
            return { desde: firstDay(anio, mes), hasta: lastDay(anio, mes), modo: 'mes' };
        }

        // 3) Default últimos 3 días
        const { desde, hasta } = lastNDaysRange(3);
        return { desde, hasta, modo: 'ultimos3' };
    }, [fechaDesde, fechaHasta, mostrarMesCompleto, anio, mes]);

    const buildParams = useCallback(() => {
        const params = {};

        const rango = getRangoActual();
        if (rango?.desde) params.desde = rango.desde;
        if (rango?.hasta) params.hasta = rango.hasta;

        // límites: el backend capea, pero mantenemos intención
        if (rango.modo === 'mes' || rango.modo === 'rango') params.limit = 2000;
        else params.limit = 500;

        if (filtroTipos?.length) params.tipo = filtroTipos;
        if (formaPagoId !== '') params.forma_pago_id = formaPagoId;
        if (categorias?.length) params.referencia_tipo = categorias;
        if (refId && String(refId).trim() !== '') params.referencia_id = refId;
        if (q && q.trim() !== '') params.q = q.trim();

        return params;
    }, [getRangoActual, filtroTipos, formaPagoId, categorias, refId, q]);

    /* ----- Efectos ----- */
    const fetchFormas = useCallback(async () => {
        try {
            const data = await obtenerFormasDePago();
            setFormas(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error formas de pago', err);
        }
    }, []);

    const cargarMovimientos = useCallback(async () => {
        setLoading(true);
        try {
            const params = buildParams();

            const data = await obtenerMovimientos(params);
            setMovs(Array.isArray(data) ? data : []);
            setPage(1);
        } catch (err) {
            console.error('Error movimientos historial', err);
            Swal.fire('Error', err.message || 'No se pudieron cargar movimientos', 'error');
        } finally {
            setLoading(false);
        }
    }, [buildParams]);

    // Decodificar token y determinar rol
    useEffect(() => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setCanVerHistorial(false);
                return;
            }
            const decoded = jwtDecode(token);
            console.log('[CajaHistorial] decoded token:', decoded);
            setCanVerHistorial(canVerHistorialDesdeToken(decoded));
        } catch (err) {
            console.error('Error decodificando token JWT', err);
            setCanVerHistorial(false);
        }
    }, []);

    useEffect(() => {
        fetchFormas();
    }, [fetchFormas]);

    useEffect(() => {
        if (!canVerHistorial) return;
        cargarMovimientos();
    }, [cargarMovimientos, canVerHistorial]);

    /* ----- Acciones ----- */
    const exportarCSV = () => {
        const rows = (movs || []).map((m) => ({
            fecha: m.fecha,
            hora: m.hora,
            tipo: m.tipo,
            concepto: m.concepto,
            forma_pago:
                m.formaPago?.nombre ||
                (m.forma_pago_id == null ? 'Sin especificar' : `#${m.forma_pago_id}`),
            usuario:
                m.usuario?.nombre_completo ||
                m.usuario?.nombre_usuario ||
                (m.usuario_id ? `#${m.usuario_id}` : ''),
            categoria: referenciaTipoLabel(m.referencia_tipo, m.es_venta_financiada),
            ref_tipo: m.referencia_tipo ?? '',
            ref_id: m.referencia_id ?? '',
            monto: Number(m.monto || 0).toFixed(2).replace('.', ','),
        }));

        const rango = getRangoActual();
        const label = `${rango.desde}_a_${rango.hasta}`;

        exportToCSV(`caja-historial-${label}.csv`, rows, [
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

    const exportarExcel = async () => {
        try {
            setExportingXlsx(true);

            const params = buildParams();
            // el export no necesita limit/page
            delete params.limit;
            delete params.page;

            const rango = getRangoActual();
            const fname = `historial_caja_${rango.desde}_a_${rango.hasta}.xlsx`;

            // ✅ Descarga robusta (evita bajar HTML/JSON como .xlsx)
            await descargarMovimientosExcel(params, { nombreArchivo: fname });
        } catch (err) {
            console.error('Error export Excel historial', err);
            Swal.fire('Error', err?.message || 'No se pudo exportar el Excel', 'error');
        } finally {
            setExportingXlsx(false);
        }
    };

    const limpiarFiltros = () => {
        setFiltroTipos([]);
        setFormaPagoId('');
        setCategorias([]);
        setRefId('');
        setQ('');
        setFechaDesde('');
        setFechaHasta('');
        setPage(1);
    };

    /* ----- Resumen de filtros activos (chips) ----- */
    const chipsFiltros = useMemo(() => {
        const chips = [];

        const rango = getRangoActual();
        if (rango?.desde && rango?.hasta) {
            chips.push({
                key: `rango:${rango.desde}:${rango.hasta}`,
                label: `Fechas: ${rango.desde} → ${rango.hasta}`,
                onClear: () => {
                    setFechaDesde('');
                    setFechaHasta('');
                },
            });
        }

        if (filtroTipos.length) {
            chips.push(
                ...filtroTipos.map((t) => ({
                    key: `tipo:${t}`,
                    label: `Tipo: ${tipoLabel(t)}`,
                    onClear: () =>
                        setFiltroTipos((prev) => prev.filter((x) => x !== t)),
                })),
            );
        }
        if (formaPagoId !== '') {
            const label =
                formaPagoId === 'null'
                    ? 'Sin especificar'
                    : formas.find((f) => String(f.id) === String(formaPagoId))?.nombre || `#${formaPagoId}`;
            chips.push({
                key: `fp:${formaPagoId}`,
                label: `FP: ${label}`,
                onClear: () => setFormaPagoId(''),
            });
        }
        if (categorias.length) {
            chips.push(
                ...categorias.map((c) => ({
                    key: `cat:${c}`,
                    label: `Cat: ${CATEGORIAS_MAP[c] || c}`,
                    onClear: () =>
                        setCategorias((prev) => prev.filter((x) => x !== c)),
                })),
            );
        }
        if (refId) {
            chips.push({
                key: `ref:${refId}`,
                label: `Ref.ID: ${refId}`,
                onClear: () => setRefId(''),
            });
        }
        if (q) {
            chips.push({
                key: `q:${q}`,
                label: `Buscar: "${q}"`,
                onClear: () => setQ(''),
            });
        }
        return chips;
    }, [getRangoActual, filtroTipos, formaPagoId, categorias, refId, q, formas]);

    /* ============ UI ============ */

    if (!canVerHistorial) {
        return (
            <div className="p-4 sm:p-6">
                <h1 className="text-xl font-semibold">Caja – Historial</h1>
                <p className="mt-2 text-sm text-slate-600">
                    Solo usuarios con rol <strong>admin</strong> o <strong>superadmin</strong> pueden acceder al historial de
                    movimientos de caja.
                </p>
            </div>
        );
    }

    const rangoUI = getRangoActual();

    return (
        <div className="p-4 sm:p-6">
            {/* Encabezado */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Caja – Historial</h1>
                    <p className="text-sm text-slate-600">
                        Período actual: <strong>{rangoUI.desde}</strong> a <strong>{rangoUI.hasta}</strong>.
                        {' '}Usá “Desde/Hasta” para un rango personalizado.
                    </p>
                </div>

                {/* Período rápido */}
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex items-center gap-2">
                        <input
                            id="toggle-mes"
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={mostrarMesCompleto}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                setMostrarMesCompleto(checked);

                                // ✅ UX: si activa mes completo, limpio rango personalizado (para que no lo "pise")
                                if (checked) {
                                    setFechaDesde('');
                                    setFechaHasta('');
                                }
                            }}
                        />
                        <label htmlFor="toggle-mes" className="text-sm">
                            {mostrarMesCompleto ? 'Mostrando mes completo' : 'Mostrar mes completo'}
                        </label>
                    </div>

                    <div className="flex items-end gap-2">
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                                Año
                            </label>
                            <input
                                type="number"
                                min="2000"
                                max="2100"
                                disabled={!mostrarMesCompleto}
                                className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                                value={anio}
                                onChange={(e) =>
                                    setAnio(
                                        Number(e.target.value || new Date().getFullYear()),
                                    )
                                }
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                                Mes
                            </label>
                            <select
                                disabled={!mostrarMesCompleto}
                                className="w-36 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                                value={mes}
                                onChange={(e) => setMes(Number(e.target.value))}
                            >
                                {Array.from({ length: 12 }).map((_, i) => {
                                    const m = i + 1;
                                    return (
                                        <option key={m} value={m}>
                                            {String(m).padStart(2, '0')}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Acciones */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                    onClick={cargarMovimientos}
                    className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
                    title="Actualizar resultados con los filtros actuales"
                    disabled={loading}
                >
                    {loading ? 'Cargando…' : 'Refrescar'}
                </button>

                <button
                    onClick={exportarExcel}
                    className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
                    title="Exportar a Excel aplicando los filtros y fechas actuales"
                    disabled={exportingXlsx || loading}
                >
                    {exportingXlsx ? 'Exportando Excel…' : 'Exportar Excel'}
                </button>

                <button
                    onClick={exportarCSV}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    title="Exportar la tabla cargada (lo que está en memoria) a CSV"
                    disabled={loading}
                >
                    Exportar CSV
                </button>

                <button
                    onClick={() => setFiltrosOpen((v) => !v)}
                    className="ml-auto rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    aria-expanded={filtrosOpen}
                >
                    {filtrosOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
                </button>
            </div>

            {/* Panel de Filtros */}
            {filtrosOpen && (
                <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                        {/* Desde/Hasta */}
                        <div className="sm:col-span-3">
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                                Desde
                            </label>
                            <input
                                type="date"
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                value={fechaDesde}
                                onChange={(e) => {
                                    setFechaDesde(e.target.value);
                                    // ✅ UX: si usa rango, desactiva mes completo para evitar “doble verdad”
                                    if (e.target.value) setMostrarMesCompleto(false);
                                }}
                            />
                        </div>
                        <div className="sm:col-span-3">
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                                Hasta
                            </label>
                            <input
                                type="date"
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                value={fechaHasta}
                                onChange={(e) => {
                                    setFechaHasta(e.target.value);
                                    if (e.target.value) setMostrarMesCompleto(false);
                                }}
                            />
                        </div>

                        {/* Tipos */}
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                                Tipos
                            </label>
                            <select
                                multiple
                                className="h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                value={filtroTipos}
                                onChange={(e) =>
                                    setFiltroTipos(
                                        Array.from(e.target.selectedOptions).map((o) => o.value),
                                    )
                                }
                            >
                                {TIPOS_CAJA.map((t) => (
                                    <option key={t} value={t}>
                                        {tipoLabel(t)}
                                    </option>
                                ))}
                            </select>
                            <p className="mt-1 text-[11px] text-slate-500">
                                Podés seleccionar varios (Ctrl/Cmd o táctil).
                            </p>
                        </div>

                        {/* Forma de pago */}
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                                Forma de pago
                            </label>
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
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                                Categorías
                            </label>
                            <select
                                multiple
                                className="h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                value={categorias}
                                onChange={(e) =>
                                    setCategorias(
                                        Array.from(e.target.selectedOptions).map((o) => o.value),
                                    )
                                }
                            >
                                {CATEGORIAS.map((c) => (
                                    <option key={c.value} value={c.value}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Ref ID */}
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                                Ref. ID
                            </label>
                            <input
                                type="number"
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                placeholder="Numérico"
                                value={refId}
                                onChange={(e) => setRefId(e.target.value)}
                            />
                        </div>

                        {/* Buscar */}
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                                Buscar por concepto
                            </label>
                            <input
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                placeholder="Ej: acreditación crédito, insumos, etc."
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Acciones de filtros */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                            onClick={cargarMovimientos}
                            className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
                            disabled={loading}
                        >
                            Aplicar filtros
                        </button>
                        <button
                            onClick={limpiarFiltros}
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            disabled={loading}
                        >
                            Limpiar
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                const r = lastNDaysRange(3);
                                setMostrarMesCompleto(false);
                                setFechaDesde(r.desde);
                                setFechaHasta(r.hasta);
                            }}
                            className="ml-auto rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            title="Setea el rango a últimos 3 días"
                            disabled={loading}
                        >
                            Últimos 3 días
                        </button>
                    </div>
                </div>
            )}

            {/* Chips de filtros activos */}
            {chipsFiltros.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                    {chipsFiltros.map((c) => (
                        <span
                            key={c.key}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs ring-1 ring-slate-200"
                        >
                            {c.label}
                            <button
                                onClick={c.onClear}
                                className="rounded-full bg-white px-1.5 py-0.5 text-[10px] ring-1 ring-slate-300 hover:bg-slate-50"
                                title="Quitar filtro"
                            >
                                ✕
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* Tabla */}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
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
                            ) : paginatedMovs.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                                        No hay movimientos para el período con los filtros.
                                    </td>
                                </tr>
                            ) : (
                                paginatedMovs.map((m) => (
                                    <tr key={m.id} className="border-t border-slate-100">
                                        <td className="px-4 py-2">{m.fecha}</td>
                                        <td className="px-4 py-2">{m.hora}</td>
                                        <td className="px-4 py-2">
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs ring-1 ${chipClass(
                                                    m.tipo,
                                                )}`}
                                            >
                                                {tipoLabel(m.tipo)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2">{m.concepto}</td>
                                        <td className="px-4 py-2">
                                            {m.formaPago?.nombre ||
                                                (m.forma_pago_id == null
                                                    ? 'Sin especificar'
                                                    : `#${m.forma_pago_id}`)}
                                        </td>
                                        <td className="px-4 py-2">
                                            {m.usuario?.nombre_completo ||
                                                m.usuario?.nombre_usuario ||
                                                (m.usuario_id ? `#${m.usuario_id}` : '—')}
                                        </td>
                                        <td className="px-4 py-2">
                                            {referenciaIdLabel(m.referencia_tipo, m.referencia_id)}
                                        </td>
                                        <td className="px-4 py-2">
                                            {referenciaTipoLabel(m.referencia_tipo, m.es_venta_financiada)}
                                        </td>
                                        <td
                                            className={`px-4 py-2 text-right font-medium ${montoTextClass(
                                                m.tipo,
                                            )}`}
                                        >
                                            {montoConSigno(m.monto, m.tipo)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Paginación */}
                <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-slate-600">
                        {totalItems === 0 ? (
                            'Sin movimientos'
                        ) : (
                            <>
                                Mostrando{' '}
                                <strong>
                                    {(currentPage - 1) * pageSize + 1}–
                                    {Math.min(currentPage * pageSize, totalItems)}
                                </strong>{' '}
                                de <strong>{totalItems}</strong> movimientos
                            </>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1 text-xs">
                            <span>Por página:</span>
                            <select
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                                value={pageSize}
                                onChange={(e) => {
                                    const val = Number(e.target.value) || 25;
                                    setPageSize(val);
                                    setPage(1);
                                }}
                            >
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                                onClick={() => setPage(1)}
                                disabled={currentPage <= 1}
                            >
                                «
                            </button>
                            <button
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage <= 1}
                            >
                                Anterior
                            </button>
                            <span className="px-2 text-xs text-slate-700">
                                Página {currentPage} de {totalPages}
                            </span>
                            <button
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                            >
                                Siguiente
                            </button>
                            <button
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                                onClick={() => setPage(totalPages)}
                                disabled={currentPage >= totalPages}
                            >
                                »
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* (Opcional) Mini resumen de rango, por si querés usar fmtARS más adelante */}
            {/* <div className="mt-3 text-xs text-slate-500">Rango activo: {rangoUI.desde} → {rangoUI.hasta}</div> */}
        </div>
    );
};

export default Historial;