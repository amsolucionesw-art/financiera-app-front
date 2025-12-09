// src/pages/CajaHistorial.jsx
import { useEffect, useState, useCallback, useMemo } from 'react';
import Swal from 'sweetalert2';
import { obtenerMovimientos, TIPOS_CAJA } from '../services/cajaService';
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
const referenciaTipoLabel = (v) => {
    if (v == null) return 'Sin categoría';
    const key = String(v).toLowerCase();
    if (key === 'null') return 'Sin categoría';
    return CATEGORIAS_MAP[key] || v;
};

/* ============ Helper: detectar superadmin desde token ============ */
const esSuperadminDesdeToken = (decoded) => {
    if (!decoded || typeof decoded !== 'object') return false;

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
    if (rolStr === 'superadmin') return true;

    // IDs numéricos
    const rolIdRaw = decoded.rol_id ?? decoded.usuario?.rol_id;
    const rolId = typeof rolIdRaw === 'number' ? rolIdRaw : Number(rolIdRaw);

    // Ajustar si cambian tus IDs
    if (Number.isFinite(rolId)) {
        if (rolId === 0) return true; // superadmin = 0
        // if (rolId === 1) return true; // deja comentado si solo 0 es superadmin
    }

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

    /* ----- Datos ----- */
    const [formas, setFormas] = useState([]);
    const [movs, setMovs] = useState([]);
    const [loading, setLoading] = useState(false);

    /* ----- Filtros ----- */
    const [filtroTipos, setFiltroTipos] = useState([]);
    const [formaPagoId, setFormaPagoId] = useState('');
    const [categorias, setCategorias] = useState([]);
    const [refId, setRefId] = useState('');
    const [q, setQ] = useState('');

    /* ----- UI: panel de filtros ----- */
    const [filtrosOpen, setFiltrosOpen] = useState(true);

    /* ----- Rol / permisos ----- */
    const [esSuperadmin, setEsSuperadmin] = useState(false);

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
            const params = {};
            if (mostrarMesCompleto) {
                params.desde = firstDay(anio, mes);
                params.hasta = lastDay(anio, mes);
                params.limit = 2000;
            } else {
                const { desde, hasta } = lastNDaysRange(3);
                params.desde = desde;
                params.hasta = hasta;
                params.limit = 500;
            }
            if (filtroTipos?.length) params.tipo = filtroTipos;
            if (formaPagoId !== '') params.forma_pago_id = formaPagoId;
            if (categorias?.length) params.referencia_tipo = categorias;
            if (refId && String(refId).trim() !== '') params.referencia_id = refId;
            if (q && q.trim() !== '') params.q = q.trim();

            const data = await obtenerMovimientos(params);
            setMovs(Array.isArray(data) ? data : []);
            setPage(1); // reset paginación al cargar
        } catch (err) {
            console.error('Error movimientos historial', err);
            Swal.fire('Error', err.message || 'No se pudieron cargar movimientos', 'error');
        } finally {
            setLoading(false);
        }
    }, [mostrarMesCompleto, anio, mes, filtroTipos, formaPagoId, categorias, refId, q]);

    // Decodificar token y determinar rol
    useEffect(() => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setEsSuperadmin(false);
                return;
            }
            const decoded = jwtDecode(token);

            console.log('[CajaHistorial] decoded token:', decoded);

            setEsSuperadmin(esSuperadminDesdeToken(decoded));
        } catch (err) {
            console.error('Error decodificando token JWT', err);
            setEsSuperadmin(false);
        }
    }, []);

    useEffect(() => {
        fetchFormas();
    }, [fetchFormas]);

    useEffect(() => {
        if (!esSuperadmin) return;
        cargarMovimientos();
    }, [cargarMovimientos, esSuperadmin]);

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
            categoria: referenciaTipoLabel(m.referencia_tipo),
            referencia_id: m.referencia_tipo ? (m.referencia_id ?? '') : '',
            monto: Number(m.monto || 0).toFixed(2).replace('.', ','),
        }));
        const label = mostrarMesCompleto
            ? `${anio}-${String(mes).padStart(2, '0')}`
            : (() => {
                  const { desde, hasta } = lastNDaysRange(3);
                  return `${desde}_a_${hasta}`;
              })();
        exportToCSV(`caja-historial-${label}.csv`, rows, [
            'fecha',
            'hora',
            'tipo',
            'concepto',
            'forma_pago',
            'usuario',
            'categoria',
            'referencia_id',
            'monto',
        ]);
    };

    const limpiarFiltros = () => {
        setFiltroTipos([]);
        setFormaPagoId('');
        setCategorias([]);
        setRefId('');
        setQ('');
        setPage(1);
    };

    /* ----- Resumen de filtros activos (chips) ----- */
    const chipsFiltros = useMemo(() => {
        const chips = [];
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
    }, [filtroTipos, formaPagoId, categorias, refId, q, formas]);

    /* ============ UI ============ */

    if (!esSuperadmin) {
        return (
            <div className="p-4 sm:p-6">
                <h1 className="text-xl font-semibold">Caja – Historial</h1>
                <p className="mt-2 text-sm text-slate-600">
                    Solo el usuario <strong>superadmin</strong> puede acceder al historial de
                    movimientos de caja.
                </p>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6">
            {/* Encabezado */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Caja – Historial</h1>
                    <p className="text-sm text-slate-600">
                        Por defecto se muestran los <strong>últimos 3 días</strong>. Activá “Mes completo”
                        para consultar un período mensual.
                    </p>
                </div>

                {/* Período */}
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex items-center gap-2">
                        <input
                            id="toggle-mes"
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={mostrarMesCompleto}
                            onChange={(e) =>
                                setMostrarMesCompleto(e.target.checked)
                            }
                        />
                        <label
                            htmlFor="toggle-mes"
                            className="text-sm"
                        >
                            {mostrarMesCompleto
                                ? 'Mostrando mes completo'
                                : 'Mostrar mes completo'}
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
                                        Number(
                                            e.target.value ||
                                                new Date().getFullYear(),
                                        ),
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
                                onChange={(e) =>
                                    setMes(Number(e.target.value))
                                }
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
                >
                    Refrescar
                </button>
                <button
                    onClick={exportarCSV}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    title="Exportar la tabla visible a CSV"
                >
                    Exportar CSV (
                    {mostrarMesCompleto ? 'mes completo' : 'últimos 3 días'})
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
                                        Array.from(
                                            e.target.selectedOptions,
                                        ).map((o) => o.value),
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
                                onChange={(e) =>
                                    setFormaPagoId(e.target.value)
                                }
                            >
                                <option value="">(Todas)</option>
                                <option value="null">Sin especificar</option>
                                {formas.map((f) => (
                                    <option
                                        key={f.id}
                                        value={String(f.id)}
                                    >
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
                                        Array.from(
                                            e.target.selectedOptions,
                                        ).map((o) => o.value),
                                    )
                                }
                            >
                                {CATEGORIAS.map((c) => (
                                    <option
                                        key={c.value}
                                        value={c.value}
                                    >
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
                                onChange={(e) =>
                                    setRefId(e.target.value)
                                }
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
                                onChange={(e) =>
                                    setQ(e.target.value)
                                }
                            />
                        </div>
                    </div>

                    {/* Acciones de filtros */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                            onClick={cargarMovimientos}
                            className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
                        >
                            Aplicar filtros
                        </button>
                        <button
                            onClick={limpiarFiltros}
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Limpiar
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
                                <th className="px-4 py-2">Categoría</th>
                                <th className="px-4 py-2">Referencia</th>
                                <th className="px-4 py-2 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td
                                        colSpan={9}
                                        className="px-4 py-6 text-center text-slate-500"
                                    >
                                        Cargando movimientos...
                                    </td>
                                </tr>
                            ) : paginatedMovs.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={9}
                                        className="px-4 py-6 text-center text-slate-500"
                                    >
                                        No hay movimientos para el período con los
                                        filtros.
                                    </td>
                                </tr>
                            ) : (
                                paginatedMovs.map((m) => (
                                    <tr
                                        key={m.id}
                                        className="border-t border-slate-100"
                                    >
                                        <td className="px-4 py-2">
                                            {m.fecha}
                                        </td>
                                        <td className="px-4 py-2">
                                            {m.hora}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs ring-1 ${chipClass(
                                                    m.tipo,
                                                )}`}
                                            >
                                                {tipoLabel(m.tipo)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2">
                                            {m.concepto}
                                        </td>
                                        <td className="px-4 py-2">
                                            {m.formaPago?.nombre ||
                                                (m.forma_pago_id == null
                                                    ? 'Sin especificar'
                                                    : `#${m.forma_pago_id}`)}
                                        </td>
                                        <td className="px-4 py-2">
                                            {m.usuario?.nombre_completo ||
                                                m.usuario?.nombre_usuario ||
                                                (m.usuario_id
                                                    ? `#${m.usuario_id}`
                                                    : '—')}
                                        </td>
                                        <td className="px-4 py-2">
                                            {referenciaTipoLabel(
                                                m.referencia_tipo,
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            {m.referencia_tipo
                                                ? `${m.referencia_id ?? ''}`
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-2 text-right font-medium">
                                            {fmtARS(Number(m.monto))}
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
                                    {Math.min(
                                        currentPage * pageSize,
                                        totalItems,
                                    )}
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
                                onClick={() =>
                                    setPage((p) => Math.max(1, p - 1))
                                }
                                disabled={currentPage <= 1}
                            >
                                Anterior
                            </button>
                            <span className="px-2 text-xs text-slate-700">
                                Página {currentPage} de {totalPages}
                            </span>
                            <button
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                                onClick={() =>
                                    setPage((p) =>
                                        Math.min(totalPages, p + 1),
                                    )
                                }
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
        </div>
    );
};

export default Historial;