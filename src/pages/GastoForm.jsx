// src/pages/GastoForm.jsx
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
    PlusCircle,
    Save,
    ArrowLeft,
    Building2,
    Search,
    UserPlus,
    Loader2
} from 'lucide-react';

import {
    obtenerGasto,
    crearGasto as apiCrearGasto,
    actualizarGasto as apiActualizarGasto,
} from '../services/gastosService';

// Usamos el mismo origen de formas de pago que en otras pantallas
import { obtenerFormasDePago } from '../services/cuotaService';

// Service de proveedores
import {
    buscarProveedores,
    crearProveedor as apiCrearProveedor,
} from '../services/proveedorService';

/**
 * YYYY-MM-DD seguro:
 */
const toYMD = (v) => {
    if (!v) return '';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // no tocar
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const today = toYMD(new Date());

/* Helpers numéricos */
const toNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return 0;
        const normalized = trimmed.replace(/\./g, '').replace(',', '.');
        const n = Number(normalized);
        return Number.isFinite(n) ? n : 0;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const fmtARS = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

export default function GastoForm() {
    const navigate = useNavigate();
    const { id } = useParams(); // si existe => edición
    const isEdit = Boolean(id);

    const [formas, setFormas] = useState([]);
    const [loading, setLoading] = useState(false);

    // ====== Estado de proveedores ======
    const [proveedores, setProveedores] = useState([]);
    const [provSearch, setProvSearch] = useState('');
    const [provLoading, setProvLoading] = useState(false);

    // Alta rápida de proveedor (modal simple)
    const [showProvModal, setShowProvModal] = useState(false);
    const [provForm, setProvForm] = useState({
        nombre_razon_social: '',
        cuil_cuit: '',
        telefono: '',
        domicilio: '',
        ciudad: '',
        provincia: '',
        codigo_postal: '',
        rubro: '',
    });

    const [form, setForm] = useState({
        fecha_imputacion: today,
        fecha_gasto: '',
        tipo_comprobante: '',
        numero_comprobante: '',
        // Maestro + campos legacy (para mantener compatibilidad y filtros)
        proveedor_id: '',
        proveedor_nombre: '',
        proveedor_cuit: '',
        concepto: '',
        total: '',
        forma_pago_id: '',
        clasificacion: '',
        gasto_realizado_por: '',
        observacion: '',
    });

    const totalNumber = useMemo(() => toNumber(form.total), [form.total]);

    // ====== Fetchers ======
    const fetchFormas = useCallback(async () => {
        try {
            const fps = await obtenerFormasDePago();
            setFormas(Array.isArray(fps) ? fps : []);
        } catch {
            setFormas([]);
        }
    }, []);

    const fetchProveedores = useCallback(async () => {
        setProvLoading(true);
        try {
            // Usamos buscarProveedores que ya devuelve el array (res.data)
            const list = await buscarProveedores(provSearch || '', {
                limit: 200,
                orderBy: 'nombre_razon_social',
                orderDir: 'ASC',
            });
            setProveedores(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error(e);
            setProveedores([]);
        } finally {
            setProvLoading(false);
        }
    }, [provSearch]);

    const fetchGasto = useCallback(async () => {
        if (!isEdit) return;
        setLoading(true);
        try {
            const g = await obtenerGasto(id);
            setForm({
                fecha_imputacion: g.fecha_imputacion || today,
                fecha_gasto: g.fecha_gasto || '',
                tipo_comprobante: g.tipo_comprobante || '',
                numero_comprobante: g.numero_comprobante || '',
                proveedor_id: g.proveedor_id == null ? '' : String(g.proveedor_id),
                proveedor_nombre: g.proveedor_nombre || '',
                proveedor_cuit: g.proveedor_cuit || '',
                concepto: g.concepto || '',
                total: g.total != null ? String(g.total).replace('.', ',') : '',
                forma_pago_id: g.forma_pago_id == null ? '' : String(g.forma_pago_id),
                clasificacion: g.clasificacion || '',
                gasto_realizado_por: g.gasto_realizado_por || '',
                observacion: g.observacion || '',
            });
        } catch (e) {
            Swal.fire('Error', e?.message || 'No se pudo cargar el gasto', 'error');
        } finally {
            setLoading(false);
        }
    }, [id, isEdit]);

    useEffect(() => {
        fetchFormas();
    }, [fetchFormas]);

    useEffect(() => {
        fetchProveedores();
    }, [fetchProveedores]);

    useEffect(() => {
        fetchGasto();
    }, [fetchGasto]);

    // ====== Handlers ======
    const onChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));

    const onProveedorSelect = (val) => {
        // val puede ser '' | 'null' | id
        if (!val || val === 'null') {
            setForm((s) => ({
                ...s,
                proveedor_id: '',
            }));
            return;
        }
        const found = proveedores.find((p) => String(p.id) === String(val));
        setForm((s) => ({
            ...s,
            proveedor_id: String(val),
            // opcional: sincronizamos campos legacy para reportes/filtros
            proveedor_nombre: found?.nombre_razon_social || s.proveedor_nombre,
            proveedor_cuit: found?.cuil_cuit || s.proveedor_cuit,
        }));
    };

    const validar = () => {
        if (!form.fecha_imputacion) return 'La fecha de imputación es obligatoria';
        if (!form.concepto?.trim()) return 'El concepto es obligatorio';
        if (!Number.isFinite(totalNumber) || totalNumber <= 0)
            return 'El total debe ser un número mayor a 0';
        return null;
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        const err = validar();
        if (err) return Swal.fire('Atención', err, 'warning');

        const payload = {
            fecha_imputacion: form.fecha_imputacion,
            fecha_gasto: form.fecha_gasto || undefined,

            tipo_comprobante: form.tipo_comprobante || undefined,
            numero_comprobante: form.numero_comprobante || undefined,

            // Enviamos proveedor_id si se seleccionó del maestro
            proveedor_id: form.proveedor_id === '' ? undefined : Number(form.proveedor_id),

            // Campos legacy quedan por compatibilidad (opcional)
            proveedor_nombre: form.proveedor_nombre || undefined,
            proveedor_cuit: form.proveedor_cuit || undefined,

            concepto: form.concepto?.trim(),
            total: form.total,

            forma_pago_id:
                form.forma_pago_id === '' ? undefined
                    : form.forma_pago_id === 'null' ? null
                        : Number(form.forma_pago_id),

            clasificacion: form.clasificacion || undefined,
            gasto_realizado_por: form.gasto_realizado_por || undefined,
            observacion: form.observacion || undefined,
        };

        try {
            setLoading(true);
            if (isEdit) {
                await apiActualizarGasto(id, payload);
                await Swal.fire('OK', 'Gasto actualizado', 'success');
            } else {
                await apiCrearGasto(payload);
                await Swal.fire('OK', 'Gasto creado', 'success');
            }
            navigate('/gastos');
        } catch (e2) {
            Swal.fire('Error', e2?.message || 'No se pudo guardar', 'error');
        } finally {
            setLoading(false);
        }
    };

    const abrirModalProveedor = () => {
        setProvForm({
            nombre_razon_social: '',
            cuil_cuit: '',
            telefono: '',
            domicilio: '',
            ciudad: '',
            provincia: '',
            codigo_postal: '',
            rubro: '',
        });
        setShowProvModal(true);
    };

    const crearProveedor = async () => {
        // Validaciones simples UX
        if (!provForm.nombre_razon_social?.trim() || !provForm.cuil_cuit?.trim()) {
            return Swal.fire('Atención', 'Nombre/Razón social y CUIT/CUIL son obligatorios', 'warning');
        }
        try {
            setProvLoading(true);
            const nuevo = await apiCrearProveedor({ ...provForm });
            await fetchProveedores();
            setShowProvModal(false);
            // Seleccionamos al recién creado
            onProveedorSelect(String(nuevo?.id ?? ''));
            Swal.fire('OK', 'Proveedor creado', 'success');
        } catch (e) {
            Swal.fire('Error', e?.message || 'No se pudo crear el proveedor', 'error');
        } finally {
            setProvLoading(false);
        }
    };

    // ====== UI ======
    return (
        <div className="px-4 py-6 sm:px-6">
            {/* Header */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">
                        {isEdit ? 'Editar gasto' : 'Nuevo gasto'}
                    </h1>
                    <p className="text-sm text-slate-600">
                        Los gastos impactan automáticamente en caja como egresos.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        to="/gastos"
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver
                    </Link>
                </div>
            </div>

            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
                <fieldset disabled={loading} className="contents">

                    {/* Card: Datos principales */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                            {/* Fechas */}
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Fecha imputación *</label>
                                <input
                                    type="date"
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={form.fecha_imputacion}
                                    onChange={(e) => onChange('fecha_imputacion', e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Fecha del gasto</label>
                                <input
                                    type="date"
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={form.fecha_gasto}
                                    onChange={(e) => onChange('fecha_gasto', e.target.value)}
                                />
                            </div>

                            {/* Comprobante */}
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Tipo comprobante</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    placeholder="Ticket, Recibo, etc."
                                    value={form.tipo_comprobante}
                                    onChange={(e) => onChange('tipo_comprobante', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">N° de comprobante</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={form.numero_comprobante}
                                    onChange={(e) => onChange('numero_comprobante', e.target.value)}
                                />
                            </div>

                            {/* Total */}
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Total *</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-right"
                                    placeholder="0,00"
                                    value={form.total}
                                    onChange={(e) => onChange('total', e.target.value)}
                                    required
                                    inputMode="decimal"
                                />
                                <div className="mt-1 text-[12px] text-slate-600">
                                    Se registrará como: <span className="font-medium">{fmtARS(totalNumber)}</span>
                                </div>
                            </div>

                            {/* Forma de pago */}
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Forma de pago</label>
                                <select
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={form.forma_pago_id}
                                    onChange={(e) => onChange('forma_pago_id', e.target.value)}
                                >
                                    <option value="">(Seleccionar)</option>
                                    <option value="null">Sin especificar</option>
                                    {formas.map((f) => (
                                        <option key={f.id} value={String(f.id)}>{f.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Concepto */}
                            <div className="sm:col-span-3">
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Concepto *</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={form.concepto}
                                    onChange={(e) => onChange('concepto', e.target.value)}
                                    required
                                />
                            </div>

                            {/* Clasificación */}
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Clasificación</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    placeholder="Ej: combustible, viáticos"
                                    value={form.clasificacion}
                                    onChange={(e) => onChange('clasificacion', e.target.value)}
                                />
                            </div>

                            {/* Auditoría */}
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Gasto realizado por</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={form.gasto_realizado_por}
                                    onChange={(e) => onChange('gasto_realizado_por', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Card: Proveedor */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <Building2 className="h-4 w-4" />
                                Proveedor
                            </h2>

                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                                    <input
                                        className="w-56 rounded-md border border-slate-300 pl-8 pr-3 py-2 text-sm"
                                        placeholder="Buscar proveedor…"
                                        value={provSearch}
                                        onChange={(e) => setProvSearch(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={abrirModalProveedor}
                                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                                >
                                    <UserPlus className="h-4 w-4" />
                                    Nuevo
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                            {/* Select maestro */}
                            <div className="sm:col-span-3">
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Seleccionar proveedor</label>
                                <div className="relative">
                                    {provLoading && (
                                        <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-slate-400" />
                                    )}
                                    <select
                                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                        value={form.proveedor_id}
                                        onChange={(e) => onProveedorSelect(e.target.value)}
                                    >
                                        <option value="">(Sin proveedor)</option>
                                        {proveedores.map((p) => (
                                            <option key={p.id} value={String(p.id)}>
                                                {p.nombre_razon_social} — {p.cuil_cuit}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <p className="mt-1 text-[12px] text-slate-500">
                                    Podés dejar el gasto sin proveedor o asociarlo a uno del maestro.
                                </p>
                            </div>

                            {/* Campos legacy (lectura/edición rápida) */}
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Nombre / Razón social (texto)</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    placeholder="Opcional"
                                    value={form.proveedor_nombre}
                                    onChange={(e) => onChange('proveedor_nombre', e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">CUIT/CUIL (texto)</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    placeholder="Opcional"
                                    value={form.proveedor_cuit}
                                    onChange={(e) => onChange('proveedor_cuit', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Card: Observación */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Observación</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={form.observacion}
                                    onChange={(e) => onChange('observacion', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer actions */}
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {isEdit ? <Save className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                            {isEdit ? 'Guardar cambios' : 'Crear gasto'}
                        </button>
                        <Link
                            to="/gastos"
                            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Cancelar
                        </Link>
                    </div>
                </fieldset>
            </form>

            {/* Modal alta rápida de proveedor */}
            {showProvModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-2xl rounded-lg bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-base font-semibold">Nuevo proveedor</h3>
                            <button
                                onClick={() => setShowProvModal(false)}
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
                            >
                                Cerrar
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Nombre / Razón social *</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={provForm.nombre_razon_social}
                                    onChange={(e) => setProvForm((s) => ({ ...s, nombre_razon_social: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">CUIT/CUIL *</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={provForm.cuil_cuit}
                                    onChange={(e) => setProvForm((s) => ({ ...s, cuil_cuit: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Teléfono</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={provForm.telefono}
                                    onChange={(e) => setProvForm((s) => ({ ...s, telefono: e.target.value }))}
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Domicilio</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={provForm.domicilio}
                                    onChange={(e) => setProvForm((s) => ({ ...s, domicilio: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Ciudad</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={provForm.ciudad}
                                    onChange={(e) => setProvForm((s) => ({ ...s, ciudad: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Provincia</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={provForm.provincia}
                                    onChange={(e) => setProvForm((s) => ({ ...s, provincia: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Código Postal</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={provForm.codigo_postal}
                                    onChange={(e) => setProvForm((s) => ({ ...s, codigo_postal: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">Rubro</label>
                                <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    value={provForm.rubro}
                                    onChange={(e) => setProvForm((s) => ({ ...s, rubro: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setShowProvModal(false)}
                                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={crearProveedor}
                                disabled={provLoading}
                                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {provLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                Crear proveedor
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
