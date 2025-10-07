// src/pages/CajaHistorial.jsx
import { useEffect, useState, useCallback } from 'react';
import Swal from 'sweetalert2';
import { obtenerMovimientos, TIPOS_CAJA } from '../services/cajaService';
import { obtenerFormasDePago } from '../services/cuotaService';
import { exportToCSV } from '../utils/exporters';

const fmtARS = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const firstDay = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}-01`;
const lastDay = (anio, mes) => {
    // último día del mes indicado (mes 1..12)
    const d = new Date(anio, mes, 0);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

// Etiquetas legibles para tipos
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

// Alineadas con referencia_tipo del backend
const CATEGORIAS = [
    { value: 'venta', label: 'Venta (manual)' },
    { value: 'gasto', label: 'Gasto' },
    { value: 'compra', label: 'Compra' },
    { value: 'recibo', label: 'Recibo (auto)' },
    { value: 'credito', label: 'Crédito (auto)' },
    { value: 'manual', label: 'Manual (otra)' },
    { value: 'null', label: 'Sin categoría (NULL)' },
];

const Historial = () => {
    // Mes anterior por defecto
    const today = new Date();
    const yInit = today.getFullYear();
    const mInit = today.getMonth() + 1;

    const [anio, setAnio] = useState(yInit);
    const [mes, setMes] = useState(mInit);

    const [formas, setFormas] = useState([]);
    const [movs, setMovs] = useState([]);
    const [loading, setLoading] = useState(false);

    // filtros
    const [filtroTipos, setFiltroTipos] = useState([]);
    const [formaPagoId, setFormaPagoId] = useState('');
    const [categorias, setCategorias] = useState([]);
    const [refId, setRefId] = useState('');
    const [q, setQ] = useState('');

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
            const params = {
                desde: firstDay(anio, mes),
                hasta: lastDay(anio, mes),
                limit: 2000,
            };
            if (filtroTipos && filtroTipos.length) params.tipo = filtroTipos;
            if (formaPagoId !== '') params.forma_pago_id = formaPagoId;
            if (categorias && categorias.length) params.referencia_tipo = categorias;
            if (refId && String(refId).trim() !== '') params.referencia_id = refId;
            if (q && q.trim() !== '') params.q = q.trim();

            const data = await obtenerMovimientos(params);
            setMovs(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error movimientos historial', err);
            Swal.fire('Error', err.message || 'No se pudieron cargar movimientos', 'error');
        } finally {
            setLoading(false);
        }
    }, [anio, mes, filtroTipos, formaPagoId, categorias, refId, q]);

    useEffect(() => {
        fetchFormas();
    }, [fetchFormas]);

    useEffect(() => {
        cargarMovimientos();
    }, [cargarMovimientos]);

    const exportarCSV = () => {
        const rows = (movs || []).map((m) => ({
            fecha: m.fecha,
            hora: m.hora,
            tipo: m.tipo,
            concepto: m.concepto,
            forma_pago:
                m.formaPago?.nombre || (m.forma_pago_id == null ? 'Sin especificar' : `#${m.forma_pago_id}`),
            referencia_tipo: m.referencia_tipo || '',
            referencia_id: m.referencia_id ?? '',
            // aseguramos separación decimal coma en CSV
            monto: Number(m.monto || 0).toFixed(2).replace('.', ','),
        }));
        const label = `${anio}-${String(mes).padStart(2, '0')}`;
        exportToCSV(`caja-historial-${label}.csv`, rows, [
            'fecha',
            'hora',
            'tipo',
            'concepto',
            'forma_pago',
            'referencia_tipo',
            'referencia_id',
            'monto',
        ]);
    };

    return (
        <div className="p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Caja – Historial</h1>
                    <p className="text-sm text-slate-600">Consultá meses anteriores como historial.</p>
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
                            onChange={(e) => setAnio(Number(e.target.value || new Date().getFullYear()))}
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

            {/* Acciones */}
            <div className="mb-3 flex items-center gap-2">
                <button
                    onClick={cargarMovimientos}
                    className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
                >
                    Refrescar
                </button>
                <button
                    onClick={exportarCSV}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                    Exportar CSV (historial)
                </button>
            </div>

            {/* Filtros */}
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
                        {CATEGORIAS.map((c) => (
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

            {/* Tabla */}
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
                                        No hay movimientos para el período con los filtros.
                                    </td>
                                </tr>
                            ) : (
                                movs.map((m) => (
                                    <tr key={m.id} className="border-t border-slate-100">
                                        <td className="px-4 py-2">{m.fecha}</td>
                                        <td className="px-4 py-2">{m.hora}</td>
                                        <td className="px-4 py-2">{tipoLabel(m.tipo)}</td>
                                        <td className="px-4 py-2">{m.concepto}</td>
                                        <td className="px-4 py-2">
                                            {m.formaPago?.nombre ||
                                                (m.forma_pago_id == null ? 'Sin especificar' : `#${m.forma_pago_id}`)}
                                        </td>
                                        <td className="px-4 py-2">{m.referencia_tipo || '—'}</td>
                                        <td className="px-4 py-2">{m.referencia_tipo ? `${m.referencia_id ?? ''}` : '—'}</td>
                                        <td className="px-4 py-2 text-right font-medium">{fmtARS(Number(m.monto))}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Historial;