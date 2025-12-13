// src/components/VentaFinanciadaForm.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { obtenerClientesBasico, obtenerClientePorId } from '../services/clienteService';
import ventasService from '../services/ventasService';

// YYYY-MM-DD en horario local (alineado con backend y sin UTC)
const asYMD = (v) => {
    if (!v) return '';
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const toNumber = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const s = String(v).trim();
    if (!s) return 0;
    const m = s.match(/[.,](?=[^.,]*$)/);
    if (m) {
        const i = m.index;
        const intRaw = s.slice(0, i).replace(/[^\d-]/g, '');
        const fracRaw = s.slice(i + 1).replace(/\D/g, '');
        const n = Number(`${intRaw}.${fracRaw}`);
        return Number.isFinite(n) ? n : 0;
    }
    const n = Number(s.replace(/[^\d-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};

const fix2 = (n) => Math.round(toNumber(n) * 100) / 100;

const TIPOS = [
    { value: 'mensual', label: 'Mensual' },
    { value: 'quincenal', label: 'Quincenal' },
    { value: 'semanal', label: 'Semanal' },
];

// 🎨 Estilo consistente para todos los campos
const INPUT_CLS =
    'mt-1 w-full rounded-md border border-gray-400 px-3 py-2 bg-white placeholder-gray-400 ' +
    'focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

// Calcula TOTAL desde los impuestos (neto + IVA + retenciones)
const calcularTotalDesdeImpuestos = (values) => {
    const neto = toNumber(values.neto);
    const iva = toNumber(values.iva);
    const ret_gan = toNumber(values.ret_gan);
    const ret_iva = toNumber(values.ret_iva);
    const ret_iibb_tuc = toNumber(values.ret_iibb_tuc);

    const totalNum = neto + iva + ret_gan + ret_iva + ret_iibb_tuc;
    if (!totalNum) return '';
    return totalNum.toFixed(2).replace('.', ',');
};

export default function VentaFinanciadaForm({
    onCreated,
    onCancel,
    defaultFecha,
}) {
    const [clientes, setClientes] = useState([]);
    const [loadingClientes, setLoadingClientes] = useState(false);
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [openDropdown, setOpenDropdown] = useState(false);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [creditoInfo, setCreditoInfo] = useState(null);

    const dropdownRef = useRef(null);
    const searchInputRef = useRef(null);

    const [form, setForm] = useState({
        fecha_imputacion: asYMD(defaultFecha || new Date()),
        cliente_id: '',
        cliente_nombre: '',
        doc_cliente: '',
        capital: '',
        interes: '',
        cuotas: 2,
        tipo_credito: 'mensual',
        detalle_producto: '',
        neto: '',
        iva: '',
        ret_gan: '',
        ret_iva: '',
        ret_iibb_tuc: '',
        total: '',
        vendedor: '',
        observacion: '',
    });

    // Debounce búsqueda
    useEffect(() => {
        const t = setTimeout(() => setDebounced(search.trim()), 250);
        return () => clearTimeout(t);
    }, [search]);

    // Click fuera → cerrar dropdown
    useEffect(() => {
        const handler = (e) => {
            if (!dropdownRef.current) return;
            if (!dropdownRef.current.contains(e.target)) setOpenDropdown(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Carga de clientes (fetch dinámico)
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                setLoadingClientes(true);

                const filtros = {};
                if (debounced) {
                    filtros.q = debounced;
                    if (/^\d+$/.test(debounced)) filtros.dni = debounced;
                    else filtros.apellido = debounced;
                }

                const data = await obtenerClientesBasico(filtros);
                if (!mounted) return;

                const list = (Array.isArray(data) ? data : []).map((c) => ({
                    id: c.id,
                    nombre: c.nombre,
                    apellido: c.apellido,
                    dni: c.dni ?? '',
                }));
                setClientes(list);

                if (searchInputRef.current) {
                    const el = searchInputRef.current;
                    const pos = el.selectionStart ?? el.value.length;
                    el.focus();
                    try { el.setSelectionRange(pos, pos); } catch { }
                }
            } catch (e) {
                if (!mounted) return;
                setError(e?.message || 'Error cargando clientes');
            } finally {
                if (mounted) setLoadingClientes(false);
            }
        })();
        return () => { mounted = false; };
    }, [debounced]);

    const onChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((s) => {
            const next = {
                ...s,
                [name]: type === 'checkbox' ? !!checked : value,
            };

            // Si se modifica algún impuesto → recalcular total automático
            if (['neto', 'iva', 'ret_gan', 'ret_iva', 'ret_iibb_tuc'].includes(name)) {
                next.total = calcularTotalDesdeImpuestos(next);
            }

            return next;
        });
    };

    const selectedCliente = useMemo(
        () => clientes.find((c) => String(c.id) === String(form.cliente_id)) || null,
        [clientes, form.cliente_id]
    );

    // Autocompletar cliente (nombre + DNI) al cambiar cliente_id
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!form.cliente_id) {
                setForm((s) => ({ ...s, cliente_nombre: '', doc_cliente: '' }));
                return;
            }
            try {
                const c = await obtenerClientePorId(form.cliente_id);
                if (cancelled) return;
                const nombreComp = [c?.nombre, c?.apellido].filter(Boolean).join(' ');
                setForm((s) => ({
                    ...s,
                    cliente_nombre: nombreComp,
                    doc_cliente: c?.dni || '',
                }));
            } catch {
                if (cancelled) return;
                const b = selectedCliente;
                const nombreComp = b ? [b.nombre, b.apellido].filter(Boolean).join(' ') : '';
                setForm((s) => ({
                    ...s,
                    cliente_nombre: nombreComp,
                    doc_cliente: b?.dni || '',
                }));
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.cliente_id]);

    const filteredClientes = useMemo(() => {
        const q = debounced.toLowerCase();
        if (!q) return clientes;
        return clientes.filter((c) => {
            const full = `${c.apellido || ''} ${c.nombre || ''}`.toLowerCase();
            return full.includes(q) || String(c.dni || '').includes(q);
        });
    }, [clientes, debounced]);

    const validate = () => {
        if (!form.fecha_imputacion) return 'La fecha de imputación es obligatoria';
        if (!form.cliente_id) return 'Debe seleccionar un cliente';
        const capital = toNumber(form.capital);
        const cuotas = Number(form.cuotas);
        if (!(capital > 0)) return 'El capital debe ser mayor a 0';
        if (!(cuotas > 1)) return 'Las cuotas deben ser mayores a 1 (venta financiada)';
        const interes = toNumber(form.interes);
        if (!(interes > 0)) return 'El interés (%) es obligatorio y debe ser mayor a 0';
        const total = toNumber(form.total);
        if (!(total > 0)) return 'El total debe ser mayor a 0 (se calcula desde el desglose impositivo)';
        return null;
    };

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        setError(null);
        setCreditoInfo(null);

        const msg = validate();
        if (msg) return setError(msg);

        const payload = {
            fecha_imputacion: form.fecha_imputacion,
            cliente_id: Number(form.cliente_id),
            cliente_nombre: form.cliente_nombre?.trim(),
            doc_cliente: form.doc_cliente?.trim() || null,
            capital: fix2(form.capital),
            interes: fix2(form.interes),
            cuotas: Number(form.cuotas),
            tipo_credito: form.tipo_credito,
            detalle_producto: form.detalle_producto?.trim() || null,
            neto: fix2(form.neto || 0),
            iva: fix2(form.iva || 0),
            ret_gan: fix2(form.ret_gan || 0),
            ret_iva: fix2(form.ret_iva || 0),
            ret_iibb_tuc: fix2(form.ret_iibb_tuc || 0),
            total: fix2(form.total),
            vendedor: form.vendedor?.trim() || null,
            observacion: form.observacion?.trim() || null,
        };

        setSaving(true);
        try {
            const resp = await ventasService.crearVenta(payload);
            const venta = resp?.data || resp;
            if (venta?.credito_id) setCreditoInfo({ credito_id: venta.credito_id });
            onCreated?.(venta);
        } catch (e) {
            setError(e?.message || 'Error al crear la venta financiada');
        } finally {
            setSaving(false);
        }
    };

    // Selección de cliente desde el dropdown
    const pickCliente = (c) => {
        const nombreCompleto = `${c.apellido || ''} ${c.nombre || ''}`.trim();
        setForm((s) => ({
            ...s,
            cliente_id: c.id,
            cliente_nombre: nombreCompleto || s.cliente_nombre,
            doc_cliente: c.dni || '',
        }));
        setSearch(nombreCompleto || c.dni || '');
        setOpenDropdown(false);
        requestAnimationFrame(() => searchInputRef.current?.focus());
    };

    const limpiarCliente = () => {
        setForm((s) => ({ ...s, cliente_id: '', cliente_nombre: '', doc_cliente: '' }));
        setSearch('');
        setOpenDropdown(false);
        requestAnimationFrame(() => searchInputRef.current?.focus());
    };

    return (
        <div className="max-w-5xl mx-auto">
            <h2 className="text-lg font-semibold mb-4">Venta Financiada</h2>

            {error && (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            {creditoInfo && (
                <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    Crédito generado correctamente. ID: <b>{creditoInfo.credito_id}</b>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Cliente */}
                <fieldset className="rounded-lg border border-gray-200 p-4">
                    <legend className="px-1 text-sm font-medium text-gray-700">Cliente</legend>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="col-span-1" ref={dropdownRef}>
                            <label className="block text-xs font-medium text-gray-700">
                                Buscar (Apellido o DNI) <span className="text-red-500">*</span>
                            </label>
                            <div className="relative mt-1">
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setOpenDropdown(true); }}
                                    onFocus={() => setOpenDropdown(!!search.trim())}
                                    placeholder="Ej: Pérez o 30123456"
                                    className={INPUT_CLS}
                                />
                                {form.cliente_id && (
                                    <button
                                        type="button"
                                        onClick={limpiarCliente}
                                        className="absolute inset-y-0 right-0 px-2 text-gray-500 hover:text-gray-700"
                                        aria-label="Limpiar selección"
                                    >
                                        ×
                                    </button>
                                )}

                                {openDropdown && (
                                    <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                                        {loadingClientes ? (
                                            <div className="p-2 text-xs text-gray-500">Buscando…</div>
                                        ) : filteredClientes.length === 0 ? (
                                            <div className="p-2 text-xs text-gray-500">Sin resultados</div>
                                        ) : (
                                            <ul className="divide-y divide-gray-100">
                                                {filteredClientes.map((c) => (
                                                    <li key={c.id}>
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => { e.preventDefault(); pickCliente(c); }}
                                                            className="w-full text-left px-3 py-2 hover:bg-blue-50"
                                                        >
                                                            <div className="text-sm font-medium">
                                                                {`${c.apellido || ''} ${c.nombre || ''}`.trim() || 'Sin nombre'}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {c.dni ? `DNI ${c.dni}` : 'Sin DNI'}
                                                            </div>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Datos cliente */}
                        <div className="col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-700">
                                    Nombre del cliente <span className="text-red-500">*</span>
                                </label>
                                <input
                                    name="cliente_nombre"
                                    value={form.cliente_nombre}
                                    onChange={onChange}
                                    className={INPUT_CLS}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700">DNI / Doc.</label>
                                <input
                                    name="doc_cliente"
                                    value={form.doc_cliente}
                                    onChange={onChange}
                                    className={INPUT_CLS}
                                />
                            </div>
                        </div>
                    </div>
                </fieldset>

                {/* Fecha */}
                <fieldset className="rounded-lg border border-gray-200 p-4">
                    <legend className="px-1 text-sm font-medium text-gray-700">Fecha</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700">
                                Fecha imputación <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                name="fecha_imputacion"
                                value={form.fecha_imputacion}
                                onChange={onChange}
                                required
                                className={INPUT_CLS}
                            />
                        </div>
                    </div>
                </fieldset>

                {/* Financiación */}
                <fieldset className="rounded-lg border border-gray-200 p-4">
                    <legend className="px-1 text-sm font-medium text-gray-700">Financiación (Crédito)</legend>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700">
                                Cuotas <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                min={2}
                                step={1}
                                name="cuotas"
                                value={form.cuotas}
                                onChange={onChange}
                                required
                                className={INPUT_CLS}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700">
                                Tipo de crédito <span className="text-red-500">*</span>
                            </label>
                            <select
                                name="tipo_credito"
                                value={form.tipo_credito}
                                onChange={onChange}
                                required
                                className={INPUT_CLS}
                            >
                                {TIPOS.map((t) => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700">
                                Capital <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="capital"
                                value={form.capital}
                                onChange={onChange}
                                placeholder="Ej: 120000"
                                required
                                className={INPUT_CLS}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700">
                                Interés (%) <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="interes"
                                value={form.interes}
                                onChange={onChange}
                                placeholder="Ej: 60"
                                required
                                className={INPUT_CLS}
                            />
                            <p className="mt-1 text-[11px] text-gray-500">
                                El interés se ingresa de forma manual para esta venta financiada.
                            </p>
                        </div>
                        <div className="md:col-span-5">
                            <label className="block text-xs font-medium text-gray-700">
                                Detalle del producto vendido
                            </label>
                            <input
                                name="detalle_producto"
                                value={form.detalle_producto}
                                onChange={onChange}
                                placeholder="Ej: Celular Motorola G86"
                                className={INPUT_CLS}
                            />
                            <p className="mt-1 text-[11px] text-gray-500">
                                Este detalle se usará luego para mostrar el producto en la ficha del crédito asociado.
                            </p>
                        </div>
                    </div>
                </fieldset>

                {/* Importes */}
                <fieldset className="rounded-lg border border-gray-200 p-4">
                    <legend className="px-1 text-sm font-medium text-gray-700">Importes</legend>
                    <p className="mb-2 text-[11px] text-gray-500">
                        El total se calcula automáticamente como la suma de Neto + IVA + retenciones.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700">Neto</label>
                            <input
                                name="neto"
                                value={form.neto}
                                onChange={onChange}
                                className={INPUT_CLS}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700">IVA</label>
                            <input
                                name="iva"
                                value={form.iva}
                                onChange={onChange}
                                className={INPUT_CLS}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700">Ret. Gan.</label>
                            <input
                                name="ret_gan"
                                value={form.ret_gan}
                                onChange={onChange}
                                className={INPUT_CLS}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700">Ret. IVA</label>
                            <input
                                name="ret_iva"
                                value={form.ret_iva}
                                onChange={onChange}
                                className={INPUT_CLS}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700">Ret. IIBB Tuc.</label>
                            <input
                                name="ret_iibb_tuc"
                                value={form.ret_iibb_tuc}
                                onChange={onChange}
                                className={INPUT_CLS}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700">
                                Total <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="total"
                                value={form.total}
                                readOnly
                                className={INPUT_CLS + ' bg-gray-50 cursor-not-allowed text-right'}
                            />
                        </div>
                    </div>
                </fieldset>

                {/* Otros */}
                <fieldset className="rounded-lg border border-gray-200 p-4">
                    <legend className="px-1 text-sm font-medium text-gray-700">Otros</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700">Vendedor</label>
                            <input
                                name="vendedor"
                                value={form.vendedor}
                                onChange={onChange}
                                className={INPUT_CLS}
                            />
                        </div>
                    </div>
                    <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-700">Observación</label>
                        <textarea
                            name="observacion"
                            value={form.observacion}
                            onChange={onChange}
                            rows={3}
                            className={INPUT_CLS}
                        />
                    </div>
                </fieldset>

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                        {saving ? 'Guardando…' : 'Crear venta financiada'}
                    </button>
                </div>
            </form>
        </div>
    );
}