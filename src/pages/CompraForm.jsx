// src/pages/CompraForm.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { crearCompra, obtenerCompra, actualizarCompra } from '../services/comprasService';
import {
    ArrowLeft,
    Save,
    Building2,
    RefreshCw,
    Info,
    Search,
    Plus,
    X,
    FileText,
    ListChecks
} from 'lucide-react';
import { obtenerFormasDePago } from '../services/cuotaService';
import { listarProveedores } from '../services/proveedorService';
import ProveedorForm from './ProveedorForm';

/* ─────────────── Helpers de fecha/num ─────────────── */
const toYMD = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};
const today = toYMD(new Date());

const toNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return 0;
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
        maximumFractionDigits: 2
    });

const toCommaFixed = (n) => Number(n || 0).toFixed(2).replace('.', ',');

/* ─────────────── Helpers alert/resp ─────────────── */
const extractMessage = (resp, fallback) => {
    // soporta: {success, message, data}, {message}, o respuesta directa
    const msg =
        resp?.message ||
        resp?.data?.message ||
        resp?.data?.msg ||
        resp?.msg;

    return (typeof msg === 'string' && msg.trim()) ? msg.trim() : fallback;
};

/* ─────────────── Opciones fijas ─────────────── */
const TIPO_COMPROBANTE_OPTS = ['FC A', 'ND A', 'NC A', 'FC B', 'ND B', 'NC B', 'FC C', 'ND C', 'NC C', 'REC'];
const CLASIFICACION_OPTS = ['Bienes de cambio', 'Bienes de uso', 'Locación de servicio', 'Prestación de servicio', 'Otros conceptos'];

/* ─────────────── Subcomponentes de UI ─────────────── */
const Label = ({ children, required }) => (
    <label className="block text-xs font-medium text-gray-700">
        {children} {required && <span className="text-rose-600">*</span>}
    </label>
);

const Input = (props) => (
    <input
        {...props}
        className={[
            'mt-1 w-full rounded-md border px-3 py-2',
            'border-gray-300 placeholder:text-gray-400',
            'focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-100',
            props.className || ''
        ].join(' ')}
    />
);

const Select = ({ children, className = '', ...rest }) => (
    <select
        {...rest}
        className={[
            'mt-1 w-full rounded-md border px-3 py-2',
            'border-gray-300 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-100',
            className
        ].join(' ')}
    >
        {children}
    </select>
);

const TextArea = ({ className = '', ...rest }) => (
    <textarea
        {...rest}
        className={[
            'mt-1 w-full rounded-md border px-3 py-2',
            'border-gray-300 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-100',
            className
        ].join(' ')}
    />
);

export default function CompraForm() {
    const { id } = useParams();
    const editMode = Boolean(id);
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    const [formasPago, setFormasPago] = useState([]);

    // Proveedores (fuente y filtro)
    const [proveedores, setProveedores] = useState([]); // fuente
    const [provLoading, setProvLoading] = useState(false);
    const [provError, setProvError] = useState('');
    const [provSearch, setProvSearch] = useState('');
    const provDebounceId = useRef(null);

    // Modal Proveedor
    const [proveedorModalOpen, setProveedorModalOpen] = useState(false);

    const [form, setForm] = useState({
        fecha_imputacion: today,
        fecha_compra: today,
        tipo_comprobante: '',
        numero_comprobante: '',
        proveedor_id: '',
        proveedor_nombre: '',
        proveedor_cuit: '',
        neto: '',
        iva: '',
        per_iva: '',
        per_iibb_tuc: '',
        per_tem: '',
        total: '',
        forma_pago_id: '',
        deposito_destino: '',
        referencia_compra: '',
        clasificacion: '',
        facturado_a: '',
        gasto_realizado_por: '',
        observacion: ''
    });

    /* ─────────────── Cargar formas de pago ─────────────── */
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

    /* ─────────────── Proveedores: fetch ─────────────── */
    const fetchProveedores = useCallback(
        async (q = '') => {
            setProvLoading(true);
            setProvError('');
            try {
                // Llamada al backend con search si viene
                const params =
                    q && q.trim()
                        ? { search: q.trim(), limit: 500, orderBy: 'nombre_razon_social', orderDir: 'ASC' }
                        : { limit: 500, orderBy: 'nombre_razon_social', orderDir: 'ASC' };

                const res = await listarProveedores(params);
                // Normalizamos distintas posibles formas de respuesta
                const arr = Array.isArray(res) ? res : res?.data ?? res?.rows ?? [];
                setProveedores(Array.isArray(arr) ? arr : []);
            } catch (e) {
                setProvError(e?.message || 'No se pudieron cargar proveedores');
                setProveedores([]);
            } finally {
                setProvLoading(false);
            }
        },
        []
    );

    // Carga inicial
    useEffect(() => {
        fetchProveedores('');
    }, [fetchProveedores]);

    // Debounce al tipear búsqueda
    useEffect(() => {
        if (provDebounceId.current) clearTimeout(provDebounceId.current);
        provDebounceId.current = setTimeout(() => {
            fetchProveedores(provSearch);
        }, 400);
        return () => provDebounceId.current && clearTimeout(provDebounceId.current);
    }, [provSearch, fetchProveedores]);

    // Filtro cliente adicional
    const proveedoresFiltrados = useMemo(() => {
        const q = (provSearch || '').toLowerCase().trim();
        if (!q) return proveedores;
        return proveedores.filter((p) => {
            const nombre = (p?.nombre_razon_social || '').toLowerCase();
            const cuit = (p?.cuil_cuit || '').toLowerCase();
            const email = (p?.email || '').toLowerCase();
            const tel = (p?.telefono || '').toLowerCase();
            return nombre.includes(q) || cuit.includes(q) || email.includes(q) || tel.includes(q);
        });
    }, [proveedores, provSearch]);

    const limpiarBusquedaProv = () => {
        setProvSearch('');
        fetchProveedores('');
    };

    /* ─────────────── Cargar compra si es edición ─────────────── */
    useEffect(() => {
        if (!editMode) return;
        (async () => {
            setLoading(true);
            setErr('');
            try {
                const data = await obtenerCompra(id);
                const pid =
                    (data?.proveedor && data.proveedor.id != null ? String(data.proveedor.id) : '') ||
                    (data?.proveedor_id != null ? String(data.proveedor_id) : '');

                setForm({
                    fecha_imputacion: data?.fecha_imputacion || today,
                    fecha_compra: data?.fecha_compra || '',
                    tipo_comprobante: data?.tipo_comprobante || '',
                    numero_comprobante: data?.numero_comprobante || '',
                    proveedor_id: pid,
                    proveedor_nombre: data?.proveedor_nombre || '',
                    proveedor_cuit: data?.proveedor_cuit || '',
                    neto: data?.neto ?? '',
                    iva: data?.iva ?? '',
                    per_iva: data?.per_iva ?? '',
                    per_iibb_tuc: data?.per_iibb_tuc ?? '',
                    per_tem: data?.per_tem ?? '',
                    total: data?.total ?? '',
                    deposito_destino: data?.deposito_destino || '',
                    referencia_compra: data?.referencia_compra || '',
                    clasificacion: data?.clasificacion || '',
                    facturado_a: data?.facturado_a || '',
                    gasto_realizado_por: data?.gasto_realizado_por || '',
                    observacion: data?.observacion || '',
                    forma_pago_id: data?.forma_pago_id == null ? '' : String(data.forma_pago_id)
                });
            } catch (e) {
                setErr(e?.message || 'No se pudo cargar la compra');
            } finally {
                setLoading(false);
            }
        })();
    }, [editMode, id]);

    /* ─────────────── Handlers ─────────────── */
    const onChange = (e) => {
        const { name, value } = e.target;
        setForm((s) => ({ ...s, [name]: value }));
    };

    const totalSugerido = useMemo(() => {
        const sum =
            toNumber(form.neto) +
            toNumber(form.iva) +
            toNumber(form.per_iva) +
            toNumber(form.per_iibb_tuc) +
            toNumber(form.per_tem);
        return Number.isFinite(sum) ? sum : 0;
    }, [form.neto, form.iva, form.per_iva, form.per_iibb_tuc, form.per_tem]);

    const diffTotal = useMemo(() => toNumber(form.total) - totalSugerido, [form.total, totalSugerido]);

    const proveedorSeleccionado = useMemo(() => {
        if (!form.proveedor_id) return null;
        return proveedores.find((p) => String(p.id) === String(form.proveedor_id)) || null;
    }, [form.proveedor_id, proveedores]);

    const autocompletarDesdeProveedor = () => {
        if (!proveedorSeleccionado) return;
        setForm((s) => ({
            ...s,
            proveedor_nombre: proveedorSeleccionado.nombre_razon_social || s.proveedor_nombre,
            proveedor_cuit: proveedorSeleccionado.cuil_cuit || s.proveedor_cuit
        }));
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        setErr('');

        // Validación: el total tiene que coincidir con el sugerido
        const totalIngresado = toNumber(form.total);
        const diferencia = totalIngresado - totalSugerido;

        if (totalSugerido > 0 && Math.abs(diferencia) >= 0.01) {
            await Swal.fire({
                title: 'El total no coincide',
                text: `La suma sugerida de los importes es ${fmtARS(totalSugerido)} y el total ingresado es ${fmtARS(
                    totalIngresado
                )}. Ajustá los importes o el total para que no haya diferencia.`,
                icon: 'warning',
                confirmButtonText: 'Entendido',
                confirmButtonColor: '#2563eb'
            });
            return;
        }

        // ✅ Alert de confirmación SOLO al crear (Nueva compra)
        if (!editMode) {
            const confirm = await Swal.fire({
                title: 'Confirmar creación de compra',
                html: `
                    <div style="text-align:left;font-size:14px;line-height:1.4">
                        <div><b>Proveedor:</b> ${String(form.proveedor_nombre || '').trim() || '—'}</div>
                        <div><b>Comprobante:</b> ${String(form.tipo_comprobante || '').trim() || '—'} ${String(form.numero_comprobante || '').trim() || ''}</div>
                        <div><b>Fecha imputación:</b> ${String(form.fecha_imputacion || '').trim() || '—'}</div>
                        <div><b>Total:</b> ${fmtARS(totalIngresado || totalSugerido || 0)}</div>
                    </div>
                `,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sí, crear',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#2563eb',
                cancelButtonColor: '#6b7280'
            });

            if (!confirm.isConfirmed) return;
        }

        setLoading(true);
        try {
            let payload = { ...form };

            // Si por algún motivo quedó el total vacío pero hay sugerido, lo completamos
            if (!String(payload.total).trim() && totalSugerido > 0) {
                payload.total = toCommaFixed(totalSugerido);
            }

            if (payload.proveedor_id === '') delete payload.proveedor_id;

            let resp;
            if (editMode) {
                resp = await actualizarCompra(id, payload);
            } else {
                resp = await crearCompra(payload);
            }

            // ✅ Alert de éxito (usa message del backend si viene)
            const okMsg = extractMessage(
                resp,
                editMode ? 'Compra actualizada correctamente' : 'Compra creada correctamente'
            );

            await Swal.fire({
                title: 'Listo',
                text: okMsg,
                icon: 'success',
                confirmButtonText: 'Aceptar',
                confirmButtonColor: '#2563eb'
            });

            navigate('/compras');
        } catch (e2) {
            const msg = e2?.message || 'Error al guardar';
            setErr(msg);

            // ✅ Alert de error (además del banner rojo)
            await Swal.fire({
                title: 'No se pudo guardar',
                text: msg,
                icon: 'error',
                confirmButtonText: 'Entendido',
                confirmButtonColor: '#2563eb'
            });
        } finally {
            setLoading(false);
        }
    };

    /* ─────────────── Callback post-crear proveedor (modal) ─────────────── */
    const handleProveedorCreado = async (nuevo) => {
        try {
            const nombre = nuevo?.nombre_razon_social || '';
            await fetchProveedores(nombre);
            setForm((s) => ({
                ...s,
                proveedor_id: nuevo?.id != null ? String(nuevo.id) : s.proveedor_id,
                proveedor_nombre: nuevo?.nombre_razon_social || s.proveedor_nombre,
                proveedor_cuit: nuevo?.cuil_cuit || s.proveedor_cuit
            }));
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="mx-auto max-w-6xl px-4 py-6">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-2xl font-semibold">{editMode ? 'Editar compra' : 'Nueva compra'}</h1>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => fetchProveedores(provSearch)}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        title="Actualizar proveedores"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Proveedores
                    </button>
                    <Link
                        to="/compras"
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver
                    </Link>
                </div>
            </div>

            {err && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {err}
                </div>
            )}

            <form onSubmit={onSubmit} className="rounded-lg border border-gray-200 bg-white">
                <fieldset disabled={loading}>
                    {/* Comprobante y fechas */}
                    <div className="border-b border-gray-200 p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <FileText className="h-4 w-4 text-gray-600" />
                            <h2 className="text-sm font-semibold text-gray-800">Comprobante y fechas</h2>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                            <div>
                                <Label required>Fecha imputación</Label>
                                <Input
                                    type="date"
                                    required
                                    name="fecha_imputacion"
                                    value={form.fecha_imputacion}
                                    onChange={onChange}
                                />
                            </div>
                            <div>
                                <Label>Fecha de compra</Label>
                                <Input type="date" name="fecha_compra" value={form.fecha_compra} onChange={onChange} />
                            </div>
                            <div>
                                <Label required>Tipo de comprobante</Label>
                                <Select name="tipo_comprobante" value={form.tipo_comprobante} onChange={onChange} required>
                                    <option value="">Seleccionar…</option>
                                    {TIPO_COMPROBANTE_OPTS.map((opt) => (
                                        <option key={opt} value={opt}>
                                            {opt}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                            <div>
                                <Label required>N° de comprobante</Label>
                                <Input
                                    name="numero_comprobante"
                                    value={form.numero_comprobante}
                                    onChange={onChange}
                                    required
                                    placeholder="0001-00000000"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Proveedor */}
                    <div className="border-b border-gray-200 p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-gray-600" />
                            <h2 className="text-sm font-semibold text-gray-800">Proveedor</h2>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div className="md:col-span-2">
                                <Label>Seleccionar proveedor</Label>
                                <div className="mt-1 flex gap-2">
                                    <Select name="proveedor_id" value={form.proveedor_id} onChange={onChange}>
                                        <option value="">— Sin proveedor —</option>
                                        {proveedoresFiltrados.length === 0 && (
                                            <option value="" disabled>
                                                (Sin resultados)
                                            </option>
                                        )}
                                        {proveedoresFiltrados.map((p) => (
                                            <option key={p.id} value={String(p.id)}>
                                                {p.nombre_razon_social} {p.cuil_cuit ? `(${p.cuil_cuit})` : ''}
                                            </option>
                                        ))}
                                    </Select>

                                    {/* Alta rápida: nuevo proveedor */}
                                    <button
                                        type="button"
                                        onClick={() => setProveedorModalOpen(true)}
                                        className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                                        title="Crear proveedor"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Nuevo
                                    </button>
                                </div>
                                <div className="mt-1 flex items-start gap-1 text-[12px] text-gray-600">
                                    <Info className="mt-0.5 h-4 w-4" />
                                    <span>
                                        Podés seleccionar y luego{' '}
                                        <button
                                            type="button"
                                            onClick={autocompletarDesdeProveedor}
                                            className="underline hover:no-underline"
                                        >
                                            autocompletar
                                        </button>{' '}
                                        nombre y CUIT. Se pueden editar solo para esta compra.
                                    </span>
                                </div>
                            </div>

                            {/* Buscador de proveedores */}
                            <div>
                                <Label>Buscar proveedor</Label>
                                <div className="mt-1 flex gap-2">
                                    <div className="relative w-full">
                                        <Input
                                            value={provSearch}
                                            onChange={(e) => setProvSearch(e.target.value)}
                                            placeholder="Nombre, CUIT, email o teléfono…"
                                            aria-label="Buscar proveedor"
                                            className="pr-9"
                                        />
                                        {provSearch ? (
                                            <button
                                                type="button"
                                                onClick={limpiarBusquedaProv}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100"
                                                title="Limpiar"
                                                aria-label="Limpiar búsqueda"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        ) : (
                                            <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => fetchProveedores(provSearch)}
                                        className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                                        title="Buscar en servidor"
                                    >
                                        Buscar
                                    </button>
                                </div>
                                {provLoading && <div className="mt-1 text-xs text-gray-500">Cargando proveedores…</div>}
                                {provError && <div className="mt-1 text-xs text-rose-600">{provError}</div>}
                            </div>

                            <div className="md:col-span-2">
                                <Label required>Proveedor (Nombre / Razón Social)</Label>
                                <Input
                                    name="proveedor_nombre"
                                    value={form.proveedor_nombre}
                                    onChange={onChange}
                                    required
                                    placeholder="Ej: Proveedor S.A."
                                />
                            </div>

                            <div>
                                <Label>CUIT/CUIL</Label>
                                <Input name="proveedor_cuit" value={form.proveedor_cuit} onChange={onChange} placeholder="20-12345678-3" />
                            </div>
                        </div>
                    </div>

                    {/* Desglose e importes */}
                    <div className="border-b border-gray-200 p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <ListChecks className="h-4 w-4 text-gray-600" />
                            <h2 className="text-sm font-semibold text-gray-800">Desglose e importes</h2>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                            <div>
                                <Label>Neto</Label>
                                <Input name="neto" value={form.neto} onChange={onChange} inputMode="decimal" placeholder="0,00" className="text-right" />
                            </div>
                            <div>
                                <Label>IVA</Label>
                                <Input name="iva" value={form.iva} onChange={onChange} inputMode="decimal" placeholder="0,00" className="text-right" />
                            </div>
                            <div>
                                <Label>Per. IVA</Label>
                                <Input name="per_iva" value={form.per_iva} onChange={onChange} inputMode="decimal" placeholder="0,00" className="text-right" />
                            </div>
                            <div>
                                <Label>Per. IIBB Tuc</Label>
                                <Input
                                    name="per_iibb_tuc"
                                    value={form.per_iibb_tuc}
                                    onChange={onChange}
                                    inputMode="decimal"
                                    placeholder="0,00"
                                    className="text-right"
                                />
                            </div>
                            <div>
                                <Label>Per. TEM</Label>
                                <Input name="per_tem" value={form.per_tem} onChange={onChange} inputMode="decimal" placeholder="0,00" className="text-right" />
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div>
                                <Label required>Total</Label>
                                <Input
                                    name="total"
                                    value={form.total}
                                    onChange={onChange}
                                    inputMode="decimal"
                                    placeholder="0,00"
                                    required
                                    className="text-right"
                                />
                                <div className="mt-1 text-[12px] text-gray-600">
                                    Sugerido: <span className="font-medium">{fmtARS(totalSugerido)}</span>
                                    {Math.abs(diffTotal) >= 0.01 && (
                                        <span className="ml-2 text-rose-600">
                                            (dif: {fmtARS(diffTotal)} — ajustá los importes o el total para que la diferencia sea $0,00)
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <Label>Forma de pago</Label>
                                <Select name="forma_pago_id" value={form.forma_pago_id} onChange={onChange}>
                                    <option value="">Sin especificar</option>
                                    <option value="null">Sin forma (NULL)</option>
                                    {formasPago.map((fp) => (
                                        <option key={fp.id} value={String(fp.id)}>
                                            {fp.nombre}
                                        </option>
                                    ))}
                                </Select>
                                <p className="mt-1 text-[12px] text-gray-500">Se usará para el movimiento de Caja (egreso) asociado.</p>
                            </div>
                        </div>
                    </div>

                    {/* Otros datos */}
                    <div className="p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <ListChecks className="h-4 w-4 text-gray-600" />
                            <h2 className="text-sm font-semibold text-gray-800">Otros datos</h2>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div>
                                <Label>Depósito destino</Label>
                                <Input name="deposito_destino" value={form.deposito_destino} onChange={onChange} placeholder="Depósito / Sucursal" />
                            </div>
                            <div className="md:col-span-2">
                                <Label>Referencia de compra</Label>
                                <Input name="referencia_compra" value={form.referencia_compra} onChange={onChange} placeholder="Ej: OC-2025-0001" />
                            </div>

                            <div>
                                <Label>Clasificación</Label>
                                <Select name="clasificacion" value={form.clasificacion} onChange={onChange}>
                                    <option value="">Seleccionar…</option>
                                    {CLASIFICACION_OPTS.map((opt) => (
                                        <option key={opt} value={opt}>
                                            {opt}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                            <div>
                                <Label>Facturado a</Label>
                                <Input name="facturado_a" value={form.facturado_a} onChange={onChange} placeholder="Razón social / Persona" />
                            </div>
                            <div>
                                <Label>Gasto realizado por</Label>
                                <Input
                                    name="gasto_realizado_por"
                                    value={form.gasto_realizado_por}
                                    onChange={onChange}
                                    placeholder="Usuario / Sector"
                                />
                            </div>

                            <div className="md:col-span-3">
                                <Label>Observación</Label>
                                <TextArea
                                    name="observacion"
                                    value={form.observacion}
                                    onChange={onChange}
                                    rows={2}
                                    placeholder="Notas internas…"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-2 border-t border-gray-200 p-3">
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            <Save className="h-4 w-4" />
                            {loading ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                </fieldset>
            </form>

            {/* Modal: Proveedor (alta rápida) */}
            <ProveedorForm
                isOpen={proveedorModalOpen}
                onClose={() => setProveedorModalOpen(false)}
                onSaved={(nuevo) => {
                    handleProveedorCreado(nuevo);
                    setProveedorModalOpen(false);
                }}
                title="Nuevo proveedor"
            />
        </div>
    );
}
