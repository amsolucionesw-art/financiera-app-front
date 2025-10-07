// src/pages/VentaForm.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { crearVenta, obtenerVenta, actualizarVenta } from '../services/ventasService';
import { obtenerFormasDePago } from '../services/cuotaService';
import { obtenerClientesBasico } from '../services/clienteService';
import { ArrowLeft, Save } from 'lucide-react';

/* ───────── Helpers ───────── */
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

// Normaliza strings de dinero a número (1.234,56 -> 1234.56)
const toNumber = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

// 🎨 Clases base para inputs (alineado con VentaFinanciadaForm)
const INPUT_CLS =
    'mt-1 w-full rounded-md border border-gray-400 px-3 py-2 bg-white placeholder-gray-400 ' +
    'focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';
const MONEY_INPUT = INPUT_CLS + ' text-right';

export default function VentaForm() {
    const { id } = useParams();
    const editMode = Boolean(id);
    const navigate = useNavigate();

    const [formasPago, setFormasPago] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    // Clientes (autocomplete)
    const [clientes, setClientes] = useState([]);
    const [qCli, setQCli] = useState('');
    const [showList, setShowList] = useState(false);
    const listRef = useRef(null);

    // Estado
    const [form, setForm] = useState({
        // Comprobante
        fecha_imputacion: today,
        numero_comprobante: '',

        // Cliente
        cliente_id: '',
        cliente_nombre: '',
        doc_cliente: '',

        // Desglose
        neto: '',
        iva: '',
        ret_gan: '',
        ret_iva: '',
        ret_iibb_tuc: '',

        // Pago
        total: '',
        forma_pago_id: '',

        // Extras
        bonificacion: false,
        vendedor: '',
        observacion: '',
    });

    /* ───────── Carga de formas de pago ───────── */
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

    /* ───────── Carga rápida de clientes (básico) ───────── */
    useEffect(() => {
        (async () => {
            try {
                const rows = await obtenerClientesBasico(); // id, nombre, apellido, cobrador, zona (según tu back)
                setClientes(Array.isArray(rows) ? rows : []);
            } catch {
                setClientes([]);
            }
        })();
    }, []);

    /* ───────── Carga/Inicialización de venta ───────── */
    useEffect(() => {
        (async () => {
            setErr('');
            if (editMode) {
                setLoading(true);
                try {
                    const data = await obtenerVenta(id);
                    setForm({
                        fecha_imputacion: data?.fecha_imputacion || today,
                        numero_comprobante: data?.numero_comprobante || '',
                        cliente_id: data?.cliente_id ?? '',
                        cliente_nombre: data?.cliente_nombre || '',
                        doc_cliente: data?.doc_cliente || '',
                        neto: data?.neto ?? '',
                        iva: data?.iva ?? '',
                        ret_gan: data?.ret_gan ?? '',
                        ret_iva: data?.ret_iva ?? '',
                        ret_iibb_tuc: data?.ret_iibb_tuc ?? '',
                        total: data?.total ?? '',
                        forma_pago_id: data?.forma_pago_id ?? '',
                        bonificacion: !!data?.bonificacion,
                        vendedor: data?.vendedor || '',
                        observacion: data?.observacion || '',
                    });
                } catch (e) {
                    setErr(e?.message || 'No se pudo cargar la venta');
                } finally {
                    setLoading(false);
                }
            } else {
                // Alta: el back genera el número
                setForm((s) => ({ ...s, numero_comprobante: '' }));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editMode, id]);

    /* ───────── Autocomplete: filtrado en cliente ───────── */
    const filteredClientes = useMemo(() => {
        const q = String(qCli || '').trim().toLowerCase();
        if (!q) return clientes.slice(0, 8);
        return clientes
            .filter((c) => {
                const nombre = [c?.nombre, c?.apellido].filter(Boolean).join(' ').toLowerCase();
                const idStr = String(c?.id ?? '').toLowerCase();
                return nombre.includes(q) || idStr.includes(q);
            })
            .slice(0, 8);
    }, [qCli, clientes]);

    // Cerrar la lista al hacer click fuera
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (listRef.current && !listRef.current.contains(e.target)) {
                setShowList(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    /* ───────── Handlers ───────── */
    const onChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((s) => ({ ...s, [name]: type === 'checkbox' ? checked : value }));
    };

    const selectCliente = (c) => {
        const nombreCompleto = [c?.nombre, c?.apellido].filter(Boolean).join(' ').trim();
        setForm((s) => ({
            ...s,
            cliente_id: c?.id ?? '',
            cliente_nombre: nombreCompleto || s.cliente_nombre,
        }));
        setQCli(nombreCompleto || String(c?.id ?? ''));
        setShowList(false);
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErr('');

        try {
            const basePayload = {
                fecha_imputacion: form.fecha_imputacion,
                cliente_id: form.cliente_id ? Number(form.cliente_id) : null, // obligatorio para el back
                cliente_nombre: form.cliente_nombre.trim(),
                doc_cliente: form.doc_cliente.trim(),
                neto: toNumber(form.neto),
                iva: toNumber(form.iva),
                ret_gan: toNumber(form.ret_gan),
                ret_iva: toNumber(form.ret_iva),
                ret_iibb_tuc: toNumber(form.ret_iibb_tuc),
                total: toNumber(form.total),
                forma_pago_id:
                    form.forma_pago_id === '' || form.forma_pago_id === 'null'
                        ? null
                        : Number(form.forma_pago_id),
                bonificacion: !!form.bonificacion,
                vendedor: form.vendedor.trim(),
                observacion: form.observacion.trim(),
            };

            const payload = editMode
                ? { ...basePayload, numero_comprobante: (form.numero_comprobante || '').trim() }
                : { ...basePayload }; // en alta no enviamos numero_comprobante

            // Validaciones mínimas
            if (!payload.fecha_imputacion || !form.cliente_nombre || !payload.total) {
                throw new Error('Completá los campos obligatorios (fecha, cliente, total).');
            }
            if (!(payload.cliente_id > 0)) {
                throw new Error('Seleccioná un cliente válido.');
            }

            if (editMode) {
                await actualizarVenta(id, payload);
            } else {
                await crearVenta(payload);
            }

            await Swal.fire({
                icon: 'success',
                title: 'Guardado',
                text: 'La venta fue guardada correctamente e impactó en Caja.',
                confirmButtonColor: '#16a34a',
            });

            navigate('/ventas');
        } catch (e2) {
            setErr(e2?.message || 'Error al guardar');
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: e2?.message || 'No se pudo guardar la venta',
                confirmButtonColor: '#dc2626',
            });
        } finally {
            setLoading(false);
        }
    };

    /* ───────── UI ───────── */
    return (
        <div className="max-w-5xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-2xl font-semibold">
                    {editMode ? 'Editar venta' : 'Nueva venta'}
                </h1>
                <Link
                    to="/ventas"
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                </Link>
            </div>

            {err && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {err}
                </div>
            )}

            <form onSubmit={onSubmit} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                {/* Sección: Comprobante */}
                <div className="border-b border-gray-200 p-4 bg-gray-50/60">
                    <h2 className="text-sm font-semibold text-gray-800">Datos del comprobante</h2>
                    <p className="text-xs text-gray-500">
                        El número se genera automáticamente al guardar (formato FA-0001-00001234).
                    </p>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Fecha imputación *</label>
                        <input
                            type="date"
                            required
                            name="fecha_imputacion"
                            value={form.fecha_imputacion}
                            onChange={onChange}
                            className={INPUT_CLS}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700">N° comprobante</label>
                        <input
                            name="numero_comprobante"
                            value={form.numero_comprobante}
                            onChange={onChange}
                            readOnly={editMode}
                            disabled={!editMode}
                            placeholder="Se genera automáticamente al guardar"
                            className={
                                INPUT_CLS + ' ' + (!editMode ? 'bg-gray-50 cursor-not-allowed' : 'bg-white')
                            }
                        />
                        {!editMode && (
                            <p className="mt-1 text-[11px] text-gray-500">
                                Será asignado por el sistema al confirmar la venta.
                            </p>
                        )}
                    </div>
                </div>

                {/* Sección: Cliente */}
                <div className="border-y border-gray-200 p-4 bg-gray-50/60">
                    <h2 className="text-sm font-semibold text-gray-800">Datos del cliente</h2>
                    <p className="text-xs text-gray-500">Seleccioná el cliente desde el buscador. El ID es obligatorio.</p>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Autocomplete */}
                    <div className="md:col-span-2 relative" ref={listRef}>
                        <label className="block text-xs font-medium text-gray-700">Buscar cliente (nombre o ID)</label>
                        <input
                            value={qCli}
                            onChange={(e) => {
                                setQCli(e.target.value);
                                setShowList(true);
                            }}
                            onFocus={() => setShowList(true)}
                            placeholder="Ej: Juan Pérez o 123"
                            className={INPUT_CLS}
                        />
                        {showList && filteredClientes.length > 0 && (
                            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                                {filteredClientes.map((c) => {
                                    const nombre = [c?.nombre, c?.apellido].filter(Boolean).join(' ').trim();
                                    return (
                                        <li
                                            key={c.id}
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => selectCliente(c)}
                                            className="cursor-pointer px-3 py-2 text-sm hover:bg-blue-50"
                                        >
                                            <div className="font-medium text-gray-800">
                                                {nombre || '(Sin nombre)'}
                                            </div>
                                            <div className="text-xs text-gray-500">ID: {c.id}</div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* Cliente ID (readonly visual para confirmar selección) */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Cliente (ID) *</label>
                        <input
                            name="cliente_id"
                            value={form.cliente_id}
                            readOnly
                            placeholder="Seleccioná desde el buscador"
                            className={INPUT_CLS + ' bg-gray-50'}
                            required
                        />
                    </div>

                    {/* Cliente nombre editable por si necesitás ajustar rótulo */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Cliente (Nombre y apellido) *</label>
                        <input
                            name="cliente_nombre"
                            value={form.cliente_nombre}
                            onChange={onChange}
                            required
                            placeholder="Ej: Juan Pérez"
                            className={INPUT_CLS}
                        />
                    </div>

                    <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-gray-700">CUIT/CUIL / DNI</label>
                        <input
                            name="doc_cliente"
                            value={form.doc_cliente}
                            onChange={onChange}
                            placeholder="Opcional"
                            className={INPUT_CLS}
                        />
                    </div>
                </div>

                {/* Sección: Desglose impositivo */}
                <div className="border-y border-gray-200 p-4 bg-gray-50/60">
                    <h2 className="text-sm font-semibold text-gray-800">Desglose impositivo (opcional)</h2>
                    <p className="text-xs text-gray-500">Podés detallar neto, IVA y retenciones. Si no aplica, dejá en blanco.</p>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Neto</label>
                        <input
                            name="neto"
                            value={form.neto}
                            onChange={onChange}
                            inputMode="decimal"
                            placeholder="0,00"
                            className={MONEY_INPUT}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">IVA</label>
                        <input
                            name="iva"
                            value={form.iva}
                            onChange={onChange}
                            inputMode="decimal"
                            placeholder="0,00"
                            className={MONEY_INPUT}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Ret. Ganancias</label>
                        <input
                            name="ret_gan"
                            value={form.ret_gan}
                            onChange={onChange}
                            inputMode="decimal"
                            placeholder="0,00"
                            className={MONEY_INPUT}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Ret. IVA</label>
                        <input
                            name="ret_iva"
                            value={form.ret_iva}
                            onChange={onChange}
                            inputMode="decimal"
                            placeholder="0,00"
                            className={MONEY_INPUT}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Ret. IIBB Tuc</label>
                        <input
                            name="ret_iibb_tuc"
                            value={form.ret_iibb_tuc}
                            onChange={onChange}
                            inputMode="decimal"
                            placeholder="0,00"
                            className={MONEY_INPUT}
                        />
                    </div>
                </div>

                {/* Sección: Pago */}
                <div className="border-y border-gray-200 p-4 bg-gray-50/60">
                    <h2 className="text-sm font-semibold text-gray-800">Pago</h2>
                    <p className="text-xs text-gray-500">
                        Importe total y forma de pago. Este formulario es solo para ventas normales (no financiadas).
                    </p>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Total *</label>
                        <input
                            name="total"
                            value={form.total}
                            onChange={onChange}
                            inputMode="decimal"
                            placeholder="0,00"
                            required
                            className={MONEY_INPUT}
                        />
                        <p className="mt-1 text-[11px] text-gray-500">Ingresá el importe final a cobrar.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Forma de pago</label>
                        <select
                            name="forma_pago_id"
                            value={form.forma_pago_id}
                            onChange={onChange}
                            className={INPUT_CLS}
                        >
                            <option value="">Sin especificar</option>
                            {formasPago.map((fp) => (
                                <option key={fp.id} value={fp.id}>
                                    {fp.nombre}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 pt-6 md:pt-0">
                        <input
                            id="bonificacion"
                            type="checkbox"
                            name="bonificacion"
                            checked={form.bonificacion}
                            onChange={onChange}
                            className="h-4 w-4 rounded border border-gray-400 text-blue-600 focus:ring-1 focus:ring-blue-500"
                        />
                        <label htmlFor="bonificacion" className="text-sm text-gray-700">Bonificación</label>
                    </div>
                </div>

                {/* Sección: Extras */}
                <div className="border-y border-gray-200 p-4 bg-gray-50/60">
                    <h2 className="text-sm font-semibold text-gray-800">Observaciones</h2>
                    <p className="text-xs text-gray-500">Datos complementarios de la venta (opcional).</p>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-gray-700">Vendedor</label>
                        <input
                            name="vendedor"
                            value={form.vendedor}
                            onChange={onChange}
                            placeholder="Opcional"
                            className={INPUT_CLS}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700">Observación</label>
                        <textarea
                            name="observacion"
                            value={form.observacion}
                            onChange={onChange}
                            rows={2}
                            placeholder="Detalles, notas internas, etc."
                            className={INPUT_CLS}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 border-t border-gray-200 p-3 bg-gray-50 rounded-b-lg">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-white"
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
            </form>
        </div>
    );
}
