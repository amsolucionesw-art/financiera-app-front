// src/pages/CajaMensual.jsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import Swal from 'sweetalert2';
import { obtenerResumenMensual, obtenerMovimientos, TIPOS_CAJA } from '../services/cajaService';
import { obtenerFormasDePago } from '../services/cuotaService';
import { exportToCSV } from '../utils/exporters';

const yNow = new Date().getFullYear();
const mNow = new Date().getMonth() + 1;

const fmtARS = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const firstDay = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}-01`;
const lastDay = (anio, mes) => {
    // día 0 del MES+1 => último día del mes indicado (sin drift)
    const d = new Date(anio, mes, 0);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

// Etiquetas y estilos (coherentes con CajaDiaria)
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

// Categorías alineadas al backend (referencia_tipo)
const CATEGORIAS_FILTRO = [
    { value: 'venta', label: 'Venta (manual)' },
    { value: 'gasto', label: 'Gasto' },
    { value: 'compra', label: 'Compra' },
    { value: 'recibo', label: 'Recibo (auto)' },
    { value: 'credito', label: 'Crédito (auto)' },
    { value: 'manual', label: 'Manual (otra)' },
    { value: 'null', label: 'Sin categoría (NULL)' },
];

const REF_LABELS = CATEGORIAS_FILTRO.reduce((acc, c) => {
    acc[c.value] = c.label;
    return acc;
}, {});
const referenciaTipoLabel = (v) => {
    if (v == null) return 'Sin categoría';
    const key = String(v).toLowerCase();
    if (key === 'null') return 'Sin categoría';
    return REF_LABELS[key] || v;
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

    const data = [...rows]
        .map((r) => ({ nombre: r?.nombre ?? 'Sin especificar', total: Number(r?.total || 0), cantidad: r?.cantidad }))
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
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
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

const Mensual = () => {
    const [anio, setAnio] = useState(yNow);
    const [mes, setMes] = useState(mNow);

    const [formas, setFormas] = useState([]);
    const [resumen, setResumen] = useState(null);
    const [movs, setMovs] = useState([]);
    const [loading, setLoading] = useState(false);

    // filtros opcionales para la tabla del mes
    const [filtroTipos, setFiltroTipos] = useState([]);
    const [formaPagoId, setFormaPagoId] = useState('');
    const [categorias, setCategorias] = useState([]);
    const [refId, setRefId] = useState('');
    const [q, setQ] = useState('');

    // Modal de detalle
    const [modalOpen, setModalOpen] = useState(false);
    const [modalData, setModalData] = useState({
        title: '',
        subtitle: '',
        rows: [],
        totalGeneral: 0,
        exportFileName: 'detalle.csv',
    });

    const fetchFormas = useCallback(async () => {
        try {
            const data = await obtenerFormasDePago();
            setFormas(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error formas de pago', err);
        }
    }, []);

    const cargarResumen = useCallback(async () => {
        try {
            const data = await obtenerResumenMensual({ anio, mes });
            setResumen(data);
        } catch (err) {
            console.error('Error resumen mensual', err);
            setResumen(null);
        }
    }, [anio, mes]);

    const cargarMovimientos = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                desde: firstDay(anio, mes),
                hasta: lastDay(anio, mes),
                limit: 1000,
            };
            if (filtroTipos && filtroTipos.length) params.tipo = filtroTipos;
            if (formaPagoId !== '') params.forma_pago_id = formaPagoId;
            if (categorias && categorias.length) params.referencia_tipo = categorias;
            if (refId && String(refId).trim() !== '') params.referencia_id = refId;
            if (q && q.trim() !== '') params.q = q.trim();

            const data = await obtenerMovimientos(params);
            setMovs(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error movimientos mes', err);
            Swal.fire('Error', err.message || 'No se pudieron cargar movimientos', 'error');
        } finally {
            setLoading(false);
        }
    }, [anio, mes, filtroTipos, formaPagoId, categorias, refId, q]);

    useEffect(() => {
        fetchFormas();
    }, [fetchFormas]);

    useEffect(() => {
        cargarResumen();
        cargarMovimientos();
    }, [cargarResumen, cargarMovimientos]);

    const totales = useMemo(() => resumen?.totales || null, [resumen]);

    // 🔧 FIX: calcular siempre el saldo del mes en el front
    const saldoMes = useMemo(() => {
        const t = totales || {};
        const apertura = Number(t.apertura || 0);
        const ingreso = Number(t.ingreso || 0);
        const egreso = Number(t.egreso || 0);
        const ajuste = Number(t.ajuste || 0);
        const cierre = Number(t.cierre || 0);
        return apertura + ingreso - egreso + ajuste - cierre;
    }, [totales]);

    // Detalle por tipo (si no viene del backend, se arma desde porFormaPago)
    const detallesPorTipo = useMemo(() => {
        const base = resumen?.porTipo || null; // esperado: { ingreso:[{nombre,total}], egreso:[...], ... }
        if (base) return base;
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

    // Saldo del mes por forma de pago (coincide con la fórmula general)
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

    const porDiaArray = useMemo(() => {
        const src = resumen?.porDia || {};
        const dias = Object.keys(src).sort();
        return dias.map((d) => ({
            fecha: d,
            ingreso: Number(src[d]?.ingreso || 0),
            egreso: Number(src[d]?.egreso || 0),
            ajuste: Number(src[d]?.ajuste || 0),
            apertura: Number(src[d]?.apertura || 0),
            cierre: Number(src[d]?.cierre || 0),
        }));
    }, [resumen]);

    const porFormaArray = useMemo(() => {
        const src = resumen?.porFormaPago || {};
        const keys = Object.keys(src);
        return keys.map((k) => ({
            forma_pago: k,
            ingreso: Number(src[k]?.ingreso || 0),
            egreso: Number(src[k]?.egreso || 0),
            ajuste: Number(src[k]?.ajuste || 0),
            apertura: Number(src[k]?.apertura || 0),
            cierre: Number(src[k]?.cierre || 0),
        }));
    }, [resumen]);

    const exportarCSV = () => {
        const rows = (movs || []).map((m) => ({
            fecha: m.fecha,
            hora: m.hora,
            tipo: m.tipo,
            concepto: m.concepto,
            forma_pago:
                m.formaPago?.nombre || (m.forma_pago_id == null ? 'Sin especificar' : `#${m.forma_pago_id}`),
            categoria: referenciaTipoLabel(m.referencia_tipo),
            referencia_id: m.referencia_tipo ? (m.referencia_id ?? '') : '',
            monto: Number(m.monto || 0).toFixed(2).replace('.', ','),
        }));
        const label = `${anio}-${String(mes).padStart(2, '0')}`;
        exportToCSV(`caja-mensual-${label}.csv`, rows, [
            'fecha',
            'hora',
            'tipo',
            'concepto',
            'forma_pago',
            'categoria',
            'referencia_id',
            'monto',
        ]);
    };

    /* ------- Handlers para abrir modal ------- */
    const periodoLabel = `${anio}-${String(mes).padStart(2, '0')}`;

    const abrirModalTipo = (tipo) => {
        const totalGeneral = Number(totales?.[tipo] ?? 0);
        const rows = (detallesPorTipo?.[tipo] || []).map((d) => ({
            nombre: d?.nombre ?? 'Sin especificar',
            total: Number(d?.total || 0),
            cantidad: d?.cantidad,
        }));
        setModalData({
            title: `${tipoLabel(tipo)} del mes`,
            subtitle: `Período: ${periodoLabel}`,
            rows,
            totalGeneral,
            exportFileName: `detalle-${tipo}-${periodoLabel}.csv`,
        });
        setModalOpen(true);
    };

    const abrirModalSaldo = () => {
        const totalGeneral = Number(saldoMes); // 🔧 usar el calculado
        const rows = detalleSaldoPorForma.map((d) => ({
            nombre: d?.nombre ?? 'Sin especificar',
            total: Number(d?.total || 0),
        }));
        setModalData({
            title: 'Saldo del mes por forma de pago',
            subtitle: `Período: ${periodoLabel}`,
            rows,
            totalGeneral,
            exportFileName: `detalle-saldo-${periodoLabel}.csv`,
        });
        setModalOpen(true);
    };

    /* ------- UI ------- */

    // Card “clickable” (abre modal)
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
                    <div className="text-[11px] uppercase tracking-wide text-emerald-700/70">Saldo del mes</div>
                    <div className="text-xs text-emerald-800 opacity-60">Ver detalle</div>
                </div>
                <div className="text-base font-semibold text-emerald-800">{fmtARS(total ?? 0)}</div>
            </div>
        </button>
    );

    return (
        <div className="p-4 sm:p-6">
            {/* Encabezado */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Caja mensual</h1>
                    <p className="text-sm text-slate-600">
                        Resumen por mes: totales, desagregados por día y por forma de pago.
                    </p>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Año</label>
                        <input
                            type="number"
                            min="2000"
                            max="2100"
                            className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={anio}
                            onChange={(e) => setAnio(Number(e.target.value || yNow))}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Mes</label>
                        <select
                            className="w-36 rounded-md border border-slate-300 px-3 py-2 text-sm"
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

            {/* Totales del mes (ahora abren modal) */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
                {['ingreso', 'egreso', 'ajuste', 'apertura', 'cierre'].map((t) => (
                    <CardTotal key={t} tipo={t} total={totales?.[t] ?? 0} onClick={() => abrirModalTipo(t)} />
                ))}
                <CardSaldo total={saldoMes} onClick={abrirModalSaldo} />
            </div>

            {/* Por día */}
            <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-100 p-3 text-sm font-semibold">Por día</div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                            <tr>
                                <th className="px-4 py-2">Fecha</th>
                                <th className="px-4 py-2">Ingresos</th>
                                <th className="px-4 py-2">Egresos</th>
                                <th className="px-4 py-2">Ajustes</th>
                                <th className="px-4 py-2">Aperturas</th>
                                <th className="px-4 py-2">Cierres</th>
                            </tr>
                        </thead>
                        <tbody>
                            {porDiaArray.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                                        No hay datos.
                                    </td>
                                </tr>
                            ) : (
                                porDiaArray.map((d) => (
                                    <tr key={d.fecha} className="border-t border-slate-100">
                                        <td className="px-4 py-2">{d.fecha}</td>
                                        <td className="px-4 py-2">{fmtARS(Number(d.ingreso || 0))}</td>
                                        <td className="px-4 py-2">{fmtARS(Number(d.egreso || 0))}</td>
                                        <td className="px-4 py-2">{fmtARS(Number(d.ajuste || 0))}</td>
                                        <td className="px-4 py-2">{fmtARS(Number(d.apertura || 0))}</td>
                                        <td className="px-4 py-2">{fmtARS(Number(d.cierre || 0))}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Por forma de pago */}
            <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-100 p-3 text-sm font-semibold">Por forma de pago</div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                            <tr>
                                <th className="px-4 py-2">Forma de pago</th>
                                <th className="px-4 py-2">Ingresos</th>
                                <th className="px-4 py-2">Egresos</th>
                                <th className="px-4 py-2">Ajustes</th>
                                <th className="px-4 py-2">Aperturas</th>
                                <th className="px-4 py-2">Cierres</th>
                            </tr>
                        </thead>
                        <tbody>
                            {porFormaArray.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                                        No hay datos.
                                    </td>
                                </tr>
                            ) : (
                                porFormaArray.map((r) => (
                                    <tr key={r.forma_pago} className="border-t border-slate-100">
                                        <td className="px-4 py-2">{r.forma_pago}</td>
                                        <td className="px-4 py-2">{fmtARS(Number(r.ingreso || 0))}</td>
                                        <td className="px-4 py-2">{fmtARS(Number(r.egreso || 0))}</td>
                                        <td className="px-4 py-2">{fmtARS(Number(r.ajuste || 0))}</td>
                                        <td className="px-4 py-2">{fmtARS(Number(r.apertura || 0))}</td>
                                        <td className="px-4 py-2">{fmtARS(Number(r.cierre || 0))}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Filtros + Tabla movimientos del mes */}
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
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
                </div>

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
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Ref. ID</label>
                    <input
                        type="number"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Numérico"
                        value={refId}
                        onChange={(e) => setRefId(e.target.value)}
                    />
                </div>

                <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Buscar por concepto</label>
                    <input
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Ej: acreditación crédito, insumos, etc."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                </div>
            </div>

            <div className="mb-3 flex items-center gap-2">
                <button
                    onClick={cargarMovimientos}
                    className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
                >
                    Refrescar tabla
                </button>
                <button
                    onClick={exportarCSV}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                    Exportar CSV (mes)
                </button>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                            <tr>
                                <th className="px-4 py-2">Fecha</th>
                                <th className="px-4 py-2">Hora</th>
                                <th className="px-4 py-2">Tipo</th>
                                <th className="px-4 py-2">Concepto</th>
                                <th className="px-4 py-2">Forma de pago</th>
                                <th className="px-4 py-2">Categoría</th>
                                <th className="px-4 py-2">Referencia</th>
                                <th className="px-4 py-2 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                                        Cargando movimientos...
                                    </td>
                                </tr>
                            ) : (movs || []).length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                                        No hay movimientos para el mes seleccionado con los filtros aplicados.
                                    </td>
                                </tr>
                            ) : (
                                movs.map((m) => (
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
                                        <td className="px-4 py-2">{referenciaTipoLabel(m.referencia_tipo)}</td>
                                        <td className="px-4 py-2">{m.referencia_tipo ? `${m.referencia_id ?? ''}` : '—'}</td>
                                        <td className="px-4 py-2 text-right font-medium">{fmtARS(Number(m.monto))}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

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

export default Mensual;
