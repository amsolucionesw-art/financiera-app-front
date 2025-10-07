// src/components/InfoCreditos.jsx
import React, { useState, useEffect } from "react";
import {
    BadgeDollarSign,
    CheckCircle2,
    Clock,
    XCircle,
    TrendingUp,
    ListOrdered,
    User,
    Percent,
    ChevronDown,
    CalendarDays,
    RefreshCw,
    DollarSign,
    CornerUpLeft,
    FileText,
    Filter,
    Info
} from "lucide-react";
import { Link } from "react-router-dom";
import CuotasTabla from "./CuotasTabla";
import { obtenerRecibosPorCredito } from "../services/reciboService";
import { registrarPagoParcial, pagarCuota, obtenerFormasDePago } from "../services/cuotaService";
import {
    obtenerResumenLibre,
    refinanciarCreditoSeguro,
    previewRefinanciacion
} from "../services/creditoService";
import CancelarCreditoModal from "./CancelarCreditoModal";
import { jwtDecode } from "jwt-decode";

/* ───────── Helpers comunes ───────── */
const money = (n) =>
    Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getPeriodDays = (tipo) => (tipo === 'semanal' ? 7 : tipo === 'quincenal' ? 15 : 30);
const diffDays = (a, b) => {
    const ms = new Date(a).setHours(0,0,0,0) - new Date(b).setHours(0,0,0,0);
    return Math.floor(ms / 86400000);
};
/** Ciclo actual 1..3 (capped) desde fecha_acreditacion hasta hoy */
const cicloActualDesde = (fecha_acreditacion, tipo_credito) => {
    if (!fecha_acreditacion) return 1;
    const days = Math.max(diffDays(new Date(), fecha_acreditacion), 0);
    const period = getPeriodDays(tipo_credito);
    return Math.min(3, Math.floor(days / period) + 1);
};

const safeLower = (v) => String(v ?? '').trim().toLowerCase();
const parseYMD = (s) => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
};
const between = (dateStr, desde, hasta) => {
    if (!desde && !hasta) return true;
    const d = parseYMD(dateStr);
    if (!d) return false;
    if (desde && d < parseYMD(desde)) return false;
    if (hasta && d > parseYMD(hasta)) return false;
    return true;
};
const tieneCuotasVencidas = (c) =>
    Array.isArray(c?.cuotas) && c.cuotas.some(q => safeLower(q?.estado) === 'vencida');

/* === Listas de filtros (en minúscula para match visual) === */
const ESTADOS = ['pendiente','parcial','vencido','pagado','refinanciado','anulado'];
const MODALIDADES = ['comun','progresivo','libre'];
const TIPOS = ['semanal','quincenal','mensual'];

/* === Estilos por modalidad === */
const badgeByModalidad = (m) => {
    const mm = safeLower(m);
    if (mm === 'libre') return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    if (mm === 'progresivo') return 'bg-violet-100 text-violet-700 border border-violet-200';
    return 'bg-sky-100 text-sky-700 border border-sky-200'; // comun
};
const leftBorderByModalidad = (m) => {
    const mm = safeLower(m);
    if (mm === 'libre') return 'border-l-4 border-emerald-500';
    if (mm === 'progresivo') return 'border-l-4 border-violet-500';
    return 'border-l-4 border-sky-500'; // comun
};

/* ───────────────── Modal de Pago para Créditos LIBRE ───────────────── */
const PagoLibreModal = ({ open, onClose, credito, cuotaLibreId, modoInicial = 'parcial', onSuccess }) => {
    const [modo, setModo] = useState(modoInicial); // 'parcial' | 'total'
    const [formas, setFormas] = useState([]);
    const [loadingFormas, setLoadingFormas] = useState(false);

    const [formaPagoId, setFormaPagoId] = useState("");
    const [monto, setMonto] = useState(""); // solo en parcial
    const [descuento, setDescuento] = useState(""); // % solo en total
    const [observacion, setObservacion] = useState("");
    const [saving, setSaving] = useState(false); // ✅ fix del typo
    const [error, setError] = useState(null);

    const ciclo = cicloActualDesde(credito?.fecha_acreditacion, credito?.tipo_credito);
    const parcialBloqueado = ciclo >= 3; // 3er mes => sin abonos parciales

    useEffect(() => {
        if (!open) return;
        setLoadingFormas(true);
        setError(null);
        obtenerFormasDePago()
            .then((data) => setFormas(Array.isArray(data) ? data : []))
            .catch((e) => setError(e?.message || "Error al cargar formas de pago"))
            .finally(() => setLoadingFormas(false));
    }, [open]);

    useEffect(() => {
        if (open) {
            // Si está bloqueado el parcial, forzamos 'total'
            setModo(parcialBloqueado ? 'total' : modoInicial);
            setFormaPagoId("");
            setMonto("");
            setDescuento("");
            setObservacion("");
            setError(null);
            setSaving(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, credito?.id, cuotaLibreId, modoInicial, parcialBloqueado]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!cuotaLibreId || !formaPagoId) {
            setError("Seleccioná una forma de pago.");
            return;
        }

        try {
            setSaving(true);
            setError(null);

            if (modo === 'parcial') {
                if (parcialBloqueado) {
                    setError("En el 3er mes del crédito LIBRE no se permite abono parcial. Debe realizar pago total.");
                    setSaving(false);
                    return;
                }
                const montoNum = Number(String(monto).replace(',', '.')) || 0;
                if (montoNum <= 0) {
                    setError("Ingresá un monto válido.");
                    setSaving(false);
                    return;
                }
                await registrarPagoParcial({
                    cuota_id: cuotaLibreId,
                    monto_pagado: montoNum,
                    forma_pago_id: Number(formaPagoId),
                    observacion: observacion || null
                });
            } else {
                const desc = descuento === "" ? 0 : Number(String(descuento).replace(',', '.')) || 0;
                if (desc < 0 || desc > 100) {
                    setError("El descuento debe ser un porcentaje entre 0 y 100.");
                    setSaving(false);
                    return;
                }
                await pagarCuota({
                    cuotaId: cuotaLibreId,
                    forma_pago_id: Number(formaPagoId),
                    observacion: observacion || null,
                    descuento: desc
                });
            }

            onSuccess?.();
            onClose?.();
        } catch (e) {
            setError(e?.message || "No se pudo registrar el pago.");
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <section className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4">
            <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl">
                <header className="flex items-center justify-between border-b px-5 py-4">
                    <h4 className="text-base sm:text-lg font-semibold">
                        Crédito LIBRE #{credito?.id} — {modo === 'parcial' ? 'Abono parcial' : 'Liquidación total'} (ciclo {ciclo}/3)
                    </h4>
                    <button
                        onClick={onClose}
                        className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                    >
                        Cerrar
                    </button>
                </header>

                <div className="px-5 py-4 space-y-4">
                    <div className="flex items-center justify-between gap-2 text-sm text-gray-700">
                        <div>
                            <div><span className="font-medium">Capital:</span> ${money(credito?.saldo_actual)}</div>
                            <div><span className="font-medium">Periodicidad:</span> {credito?.tipo_credito}</div>
                            <div><span className="font-medium">Tasa por ciclo:</span> {credito?.interes}%</div>
                        </div>
                        <div className="flex rounded-md bg-gray-100 p-1">
                            <button
                                className={`px-3 py-1 rounded-md text-sm ${modo === 'parcial' ? 'bg-white shadow' : 'opacity-70 hover:opacity-100'}`}
                                onClick={() => !parcialBloqueado && setModo('parcial')}
                                disabled={parcialBloqueado}
                                title={parcialBloqueado ? 'En el 3er mes no se permite abono parcial' : 'Abono parcial'}
                            >
                                Parcial
                            </button>
                            <button
                                className={`px-3 py-1 rounded-md text-sm ${modo === 'total' ? 'bg-white shadow' : 'opacity-70 hover:opacity-100'}`}
                                onClick={() => setModo('total')}
                            >
                                Total
                            </button>
                        </div>
                    </div>

                    {modo === 'parcial' ? (
                        <div className="rounded-lg border p-3 bg-gray-50 text-xs text-gray-700">
                            <b>Libre (máx. 3 meses):</b> no hay mora ni vencimientos. Se cobra primero el <b>interés</b> del/los ciclo(s) y el resto amortiza <b>capital</b>.
                        </div>
                    ) : (
                        <div className="rounded-lg border p-3 bg-gray-50 text-xs text-gray-700">
                            En la <b>liquidación</b> podés aplicar un <b>descuento (%)</b> sobre el total (<b>interés + capital</b>). El interés exacto lo calcula el backend al momento.
                        </div>
                    )}

                    {parcialBloqueado && (
                        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Estás en el <b>3er mes</b> del crédito LIBRE. Solo se permite <b>pago total</b>.
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {modo === 'parcial' ? (
                                <label className="text-sm">
                                    <span className="block text-gray-600 mb-1">Monto a abonar</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="w-full rounded-md border px-3 py-2"
                                        value={monto}
                                        onChange={(e) => setMonto(e.target.value)}
                                        placeholder="0,00"
                                        required
                                        disabled={parcialBloqueado}
                                    />
                                </label>
                            ) : (
                                <label className="text-sm">
                                    <span className="block text-gray-600 mb-1">Descuento (%)</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        className="w-full rounded-md border px-3 py-2"
                                        value={descuento}
                                        onChange={(e) => setDescuento(e.target.value)}
                                        placeholder="0"
                                    />
                                </label>
                            )}

                            <label className="text-sm">
                                <span className="block text-gray-600 mb-1">Forma de pago</span>
                                <select
                                    className="w-full rounded-md border px-3 py-2 bg-white"
                                    value={formaPagoId}
                                    onChange={(e) => setFormaPagoId(e.target.value)}
                                    required
                                    disabled={loadingFormas}
                                >
                                    <option value="" disabled>{loadingFormas ? "Cargando..." : "Seleccionar"}</option>
                                    {formas.map(f => (
                                        <option key={f.id} value={f.id}>{f.nombre}</option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <label className="text-sm block">
                            <span className="block text-gray-600 mb-1">Observación (opcional)</span>
                            <textarea
                                className="w-full rounded-md border px-3 py-2"
                                rows={2}
                                value={observacion}
                                onChange={(e) => setObservacion(e.target.value)}
                                placeholder={modo === 'parcial' ? "Abono parcial" : "Liquidación del crédito"}
                            />
                        </label>

                        {error && <div className="text-sm text-red-600">{error}</div>}

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={onClose}
                                disabled={saving}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                                disabled={saving}
                            >
                                {saving ? 'Procesando…' : (modo === 'parcial' ? 'Registrar abono' : 'Liquidar crédito')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    );
};
/* ───────────────────────────────────────────────────────────────────── */

/* ───────────────── Modal de Refinanciación ───────────────── */
const RefinanciarCreditoModal = ({ open, onClose, credito, onSuccess }) => {
    const [opcion, setOpcion] = useState('P1'); // 'P1' | 'P2' | 'manual'
    const [tasaManual, setTasaManual] = useState('');
    const [tipo, setTipo] = useState(credito?.tipo_credito || 'mensual');
    const [cuotas, setCuotas] = useState(credito?.cantidad_cuotas || 1);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (open) {
            setOpcion('P1');
            setTasaManual('');
            setTipo(credito?.tipo_credito || 'mensual');
            setCuotas(credito?.cantidad_cuotas || 1);
            setSaving(false);
            setError(null);
        }
    }, [open, credito]);

    if (!open) return null;

    const saldo = Number(credito?.saldo_actual || 0);

    // Preview por período
    const preview = (() => {
        try {
            return previewRefinanciacion({
                saldo,
                opcion,
                tasaManual,
                tipo_credito: tipo,
                cantidad_cuotas: cuotas
            });
        } catch {
            return null;
        }
    })();

    const submitRefi = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setError(null);

            if (opcion === 'manual') {
                const t = Number(String(tasaManual).replace(',', '.')) || 0;
                if (t < 0) {
                    setError('La tasa manual debe ser ≥ 0');
                    setSaving(false);
                    return;
                }
            }

            await refinanciarCreditoSeguro(credito, {
                opcion,
                tasaManual: opcion === 'manual' ? Number(String(tasaManual).replace(',', '.')) : undefined,
                tipo_credito: tipo,
                cantidad_cuotas: Number(cuotas)
            });

            onSuccess?.();
            onClose?.();
        } catch (e) {
            setError(e?.message || 'No se pudo refinanciar el crédito.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4">
            <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl">
                <header className="flex items-center justify-between border-b px-5 py-4">
                    <h4 className="text-base sm:text-lg font-semibold">
                        Refinanciar crédito #{credito?.id}
                    </h4>
                    <button
                        onClick={onClose}
                        className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                    >
                        Cerrar
                    </button>
                </header>

                <form onSubmit={submitRefi} className="px-5 py-4 space-y-4">
                    {/* Preview de cálculo por período */}
                    <div className="text-sm text-gray-700">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-2">
                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">Saldo actual</div>
                                <div className="font-semibold">${money(saldo)}</div>
                            </div>
                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">Tasa mensual</div>
                                <div className="font-semibold">
                                    {preview ? `${preview.tasa_mensual}%` : '—'}
                                </div>
                            </div>
                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">Interés total</div>
                                <div className="font-semibold">
                                    ${money(preview?.interes_total_monto || 0)}
                                </div>
                            </div>
                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">Monto nuevo</div>
                                <div className="font-semibold">
                                    ${money(preview?.total_a_devolver || 0)}
                                </div>
                            </div>
                        </div>
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                            Se creará un <b>nuevo crédito común</b> con estas condiciones y el crédito #{credito?.id} quedará marcado como <b>refinanciado</b>.
                        </div>
                    </div>

                    <fieldset className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className={`flex items-center gap-2 rounded-md border p-3 ${opcion==='P1' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
                            <input
                                type="radio"
                                name="opcion"
                                className="accent-emerald-600"
                                checked={opcion==='P1'}
                                onChange={() => setOpcion('P1')}
                            />
                            <span className="text-sm font-medium">P1 (25% mensual)</span>
                        </label>
                        <label className={`flex items-center gap-2 rounded-md border p-3 ${opcion==='P2' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
                            <input
                                type="radio"
                                name="opcion"
                                className="accent-emerald-600"
                                checked={opcion==='P2'}
                                onChange={() => setOpcion('P2')}
                            />
                            <span className="text-sm font-medium">P2 (15% mensual)</span>
                        </label>
                        <label className={`flex items-center gap-2 rounded-md border p-3 ${opcion==='manual' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
                            <input
                                type="radio"
                                name="opcion"
                                className="accent-emerald-600"
                                checked={opcion==='manual'}
                                onChange={() => setOpcion('manual')}
                            />
                            <span className="text-sm font-medium">P3 Manual (% mensual)</span>
                        </label>
                    </fieldset>

                    {opcion === 'manual' && (
                        <label className="block text-sm">
                            <span className="block text-gray-600 mb-1">Tasa manual (% mensual)</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-full rounded-md border px-3 py-2"
                                value={tasaManual}
                                onChange={(e) => setTasaManual(e.target.value)}
                                placeholder="Ej: 10"
                                required
                            />
                        </label>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block text-sm">
                            <span className="block text-gray-600 mb-1">Periodicidad del nuevo crédito</span>
                            <select
                                className="w-full rounded-md border px-3 py-2 bg-white"
                                value={tipo}
                                onChange={(e) => setTipo(e.target.value)}
                                required
                            >
                                <option value="mensual">mensual</option>
                                <option value="semanal">semanal</option>
                                <option value="quincenal">quincenal</option>
                            </select>
                        </label>

                        <label className="block text-sm">
                            <span className="block text-gray-600 mb-1">Cantidad de cuotas</span>
                            <input
                                type="number"
                                min="1"
                                className="w-full rounded-md border px-3 py-2"
                                value={cuotas}
                                onChange={(e) => setCuotas(e.target.value)}
                                required
                            />
                        </label>
                    </div>

                    {/* Cuota estimada */}
                    <div className="text-xs text-gray-700">
                        {preview && (
                            <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="rounded bg-gray-50 border p-2">
                                    <div className="text-gray-600">Tasa por período</div>
                                    <div className="font-semibold">{preview.tasa_por_periodo}%</div>
                                </div>
                                <div className="rounded bg-gray-50 border p-2">
                                    <div className="text-gray-600">Cuotas</div>
                                    <div className="font-semibold">{preview.cantidad_cuotas}</div>
                                </div>
                                <div className="rounded bg-gray-50 border p-2">
                                    <div className="text-gray-600">Cuota estimada</div>
                                    <div className="font-semibold">${money(preview.cuota_estimada)}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {error && <div className="text-sm text-red-600">{error}</div>}

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                            onClick={onClose}
                            disabled={saving}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                            disabled={saving}
                        >
                            {saving ? 'Procesando…' : 'Refinanciar crédito'}
                        </button>
                    </div>
                </form>
            </div>
        </section>
    );
};
/* ─────────────────────────────────────────────────────────── */

const InfoCreditos = ({ creditos = [], refetchCreditos }) => {
    const [abierto, setAbierto] = useState(null);

    // Rol (para habilitar botón cancelar crédito)
    const token = localStorage.getItem("token");
    const decoded = token ? jwtDecode(token) : {};
    const rol_id = decoded?.rol_id ?? null;
    const puedeCancelar = rol_id === 0 || rol_id === 1; // superadmin / admin

    // ===== Filtros de historial =====
    const initialFiltros = { estado: "", modalidad: "", tipo: "", desde: "", hasta: "", soloVencidas: false };
    const [filtros, setFiltros] = useState(initialFiltros);
    const [filtrosAplicados, setFiltrosAplicados] = useState(null); // snapshot de filtros aplicados
    const [aplicando, setAplicando] = useState(false);

    // Lista visible
    const [lista, setLista] = useState(Array.isArray(creditos) ? creditos : []);

    // Filtrado local (puede reutilizar snapshot)
    const filtrarLocal = (base, fx = filtros) => {
        const est = safeLower(fx.estado);
        const mod = safeLower(fx.modalidad);
        const tip = safeLower(fx.tipo);
        const d = fx.desde || null;
        const h = fx.hasta || null;
        const soloV = Boolean(fx.soloVencidas);

        return (base || []).filter((c) => {
            if (est && safeLower(c?.estado) !== est) return false;
            if (mod && safeLower(c?.modalidad_credito) !== mod) return false;
            if (tip && safeLower(c?.tipo_credito) !== tip) return false;

            const fechaBase = c?.fecha_solicitud || c?.fecha_acreditacion;
            if (!between(fechaBase, d, h)) return false;

            if (soloV && !tieneCuotasVencidas(c)) return false;

            return true;
        });
    };

    // Sincroniza lista con props respetando filtros aplicados
    useEffect(() => {
        const base = Array.isArray(creditos) ? creditos : [];
        if (filtrosAplicados) {
            setLista(filtrarLocal(base, filtrosAplicados));
        } else {
            setLista(base);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [creditos, filtrosAplicados]);

    const aplicarFiltros = () => {
        setAplicando(true);
        setAbierto(null);
        try {
            setFiltrosAplicados({ ...filtros });
            const base = Array.isArray(creditos) ? creditos : [];
            setLista(filtrarLocal(base, filtros));
        } finally {
            setAplicando(false);
        }
    };

    const limpiarFiltros = async () => {
        setFiltros(initialFiltros);
        setFiltrosAplicados(null);
        setAplicando(true);
        setAbierto(null);
        try {
            if (typeof refetchCreditos === 'function') {
                try { await refetchCreditos(); } catch { /* noop */ }
            }
            // useEffect repondrá la lista a "creditos" al no haber filtros aplicados
        } finally {
            setAplicando(false);
        }
    };

    // Modal de recibos
    const [recibosModal, setRecibosModal] = useState({
        open: false,
        credito: null,
        items: [],
        loading: false,
        error: null
    });

    // Modal cancelar crédito
    const [cancelarModal, setCancelarModal] = useState({
        open: false,
        credito: null
    });

    // Modal pago libre
    const [pagoLibre, setPagoLibre] = useState({
        open: false,
        credito: null,
        cuotaLibreId: null,
        modo: 'parcial'
    });

    // Modal refinanciación
    const [refi, setRefi] = useState({
        open: false,
        credito: null
    });

    // Resumen LIBRE por crédito: { [id]: { loading, error, data } }
    const [resumenLibreMap, setResumenLibreMap] = useState({});

    const abrirRecibos = async (credito) => {
        setRecibosModal({ open: true, credito, items: [], loading: true, error: null });
        try {
            const data = await obtenerRecibosPorCredito(credito.id);
            setRecibosModal((prev) => ({
                ...prev,
                items: Array.isArray(data) ? data : [],
                loading: false
            }));
        } catch (e) {
            setRecibosModal((prev) => ({
                ...prev,
                error: e?.message || "Error al cargar recibos",
                loading: false
            }));
        }
    };

    const cerrarRecibos = () => {
        setRecibosModal({ open: false, credito: null, items: [], loading: false, error: null });
    };

    const estadoClasses = (estado) => {
        switch ((estado || "").toLowerCase()) {
            case "pagado":
                return "bg-green-100 text-green-700";
            case "pendiente":
                return "bg-yellow-100 text-yellow-700";
            case "vencido":
                return "bg-red-100 text-red-700";
            case "refinanciado":
                return "bg-rose-100 text-rose-700";
            default:
                return "bg-gray-100 text-gray-600";
        }
    };

    // Refresca (o carga) el resumen LIBRE de un crédito específico
    const refreshResumenLibre = async (id) => {
        setResumenLibreMap((prev) => ({ ...prev, [id]: { loading: true, error: null, data: null } }));
        try {
            const data = await obtenerResumenLibre(id);
            setResumenLibreMap((prev) => ({ ...prev, [id]: { loading: false, error: null, data } }));
        } catch (e) {
            setResumenLibreMap((prev) => ({ ...prev, [id]: { loading: false, error: e?.message || 'Error al obtener resumen', data: null } }));
        }
    };

    const toggleAcordeon = async (id) => {
        setAbierto((prev) => (prev === id ? null : id));
        const credito = lista.find(x => x.id === id);
        if (credito && credito.modalidad_credito === 'libre') {
            if (!resumenLibreMap[id]) {
                await refreshResumenLibre(id);
            }
        }
    };

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold tracking-tight">Créditos</h3>
            </div>

            {/* ===== Bloque de filtros ===== */}
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3 text-gray-700">
                    <Filter size={16} />
                    <span className="font-semibold">Filtros de historial</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                    <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Estado</span>
                        <select
                            className="w-full rounded-md border px-3 py-2 bg-white"
                            value={filtros.estado}
                            onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}
                        >
                            <option value="">(Todos)</option>
                            {ESTADOS.map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                    </label>
                    <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Modalidad</span>
                        <select
                            className="w-full rounded-md border px-3 py-2 bg-white"
                            value={filtros.modalidad}
                            onChange={(e) => setFiltros((f) => ({ ...f, modalidad: e.target.value }))}
                        >
                            <option value="">(Todas)</option>
                            {MODALIDADES.map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                    </label>
                    <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Tipo</span>
                        <select
                            className="w-full rounded-md border px-3 py-2 bg-white"
                            value={filtros.tipo}
                            onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}
                        >
                            <option value="">(Todos)</option>
                            {TIPOS.map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                    </label>
                    <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Desde</span>
                        <input
                            type="date"
                            className="w-full rounded-md border px-3 py-2"
                            value={filtros.desde}
                            onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))}
                        />
                    </label>
                    <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Hasta</span>
                        <input
                            type="date"
                            className="w-full rounded-md border px-3 py-2"
                            value={filtros.hasta}
                            onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
                        />
                    </label>
                    <label className="text-sm flex items-end">
                        <div className="flex items-center gap-2">
                            <input
                                id="soloVencidas"
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300"
                                checked={filtros.soloVencidas}
                                onChange={(e) => setFiltros((f) => ({ ...f, soloVencidas: e.target.checked }))}
                            />
                            <span className="text-gray-700">Solo con cuotas vencidas</span>
                        </div>
                    </label>
                </div>

                <div className="mt-3 flex items-center gap-2">
                    <button
                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                        onClick={aplicarFiltros}
                        disabled={aplicando}
                        title="Aplicar filtros"
                    >
                        {aplicando ? 'Aplicando…' : 'Aplicar'}
                    </button>
                    <button
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                        onClick={limpiarFiltros}
                        disabled={aplicando}
                        title="Limpiar filtros"
                    >
                        <RefreshCw size={14} /> Limpiar
                    </button>
                </div>
            </section>

            {/* ===== Resultados / estado vacío ===== */}
            {(!Array.isArray(lista) || lista.length === 0) ? (
                <section className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600 shadow-sm">
                    {filtrosAplicados ? (
                        <div className="space-y-3">
                            <p>No se encontraron créditos que coincidan con los filtros aplicados.</p>
                            <button
                                onClick={limpiarFiltros}
                                className="inline-flex items-center gap-2 rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
                            >
                                <RefreshCw size={14} /> Limpiar filtros
                            </button>
                        </div>
                    ) : (
                        <p>Este cliente no tiene créditos registrados.</p>
                    )}
                </section>
            ) : (
                lista.map((c) => {
                    const esLibre = c.modalidad_credito === 'libre';
                    const tieneDescuento = !esLibre && Number(c.descuento) > 0;
                    const totalSinDescuento = tieneDescuento
                        ? Number(((Number(c.monto_total_devolver) || 0) / (1 - Number(c.descuento) / 100)).toFixed(2))
                        : Number(c.monto_total_devolver);

                    // Estimación rápida para NO libre
                    let principalPendiente = 0;
                    let moraAcum = 0;
                    if (!esLibre && Array.isArray(c.cuotas)) {
                        for (const q of c.cuotas) {
                            const imp = Number(q.importe_cuota || 0);
                            const desc = Number(q.descuento_cuota || 0);
                            const pag = Number(q.monto_pagado_acumulado || 0);
                            principalPendiente += Math.max(imp - desc - pag, 0);
                            moraAcum += Number(q.intereses_vencidos_acumulados || 0);
                        }
                    }

                    // Localiza la "cuota abierta" para LIBRE
                    const cuotaLibre = esLibre
                        ? (c.cuotas || []).find(q => q.numero_cuota === 1) || (c.cuotas || [])[0]
                        : null;

                    // Resumen libre cacheado
                    const resumen = resumenLibreMap[c.id];

                    // Ciclo actual (1..3) para manejar habilitación de parcial
                    const ciclo = esLibre ? cicloActualDesde(c.fecha_acreditacion, c.tipo_credito) : null;
                    const parcialBloqueado = esLibre && ciclo >= 3;

                    // Mostrar "R" roja si es un crédito refinanciado (nuevo con origen) o uno marcado como refinanciado (original)
                    const mostrarR = Boolean(c.id_credito_origen) || String(c.estado).toLowerCase() === 'refinanciado';

                    // Botón refinanciar: solo créditos vencidos, con saldo, de modalidad COMUN, no pagados ni ya refinanciados
                    const puedeRefinanciar =
                        String(c.estado).toLowerCase() === 'vencido' &&
                        !esLibre &&
                        safeLower(c.modalidad_credito) === 'comun' &&
                        Number(c.saldo_actual) > 0;

                    // Tooltip explicativo de interés por modalidad
                    const interesInfoTitle = esLibre
                        ? 'LIBRE: la tasa es por ciclo sobre el capital. Máximo 3 meses, sin mora ni vencimientos.'
                        : 'COMÚN/PROGRESIVO: interés proporcional mínimo 60% según cantidad de cuotas y periodicidad (semanal/quincenal/mensual).';

                    return (
                        <article
                            key={c.id}
                            className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md ${leftBorderByModalidad(c.modalidad_credito)}`}
                        >
                            <header
                                className="flex flex-wrap items-center justify-between gap-2 p-4 sm:p-6"
                                onClick={() => toggleAcordeon(c.id)}
                            >
                                <div className="flex items-center gap-2 text-lg font-semibold">
                                    <BadgeDollarSign size={18} /> Crédito #{c.id}
                                    {/* Badge modalidad visible */}
                                    <span className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${badgeByModalidad(c.modalidad_credito)}`}>
                                        {safeLower(c.modalidad_credito) === 'comun' ? 'COMÚN' : c.modalidad_credito?.toUpperCase()}
                                    </span>
                                    {mostrarR && (
                                        <span
                                            title="Refinanciado"
                                            className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[11px] font-extrabold leading-none text-white"
                                            style={{ transform: 'translateY(-2px)' }}
                                        >
                                            R
                                        </span>
                                    )}
                                    {esLibre && <span className="text-xs text-emerald-700 ml-2">(ciclo {ciclo}/3)</span>}
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    {/* Acciones para LIBRE */}
                                    {esLibre && c.estado !== "pagado" && (
                                        <>
                                            <button
                                                className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium ${
                                                    parcialBloqueado
                                                        ? "border-gray-300 text-gray-400 bg-white cursor-not-allowed"
                                                        : "border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50"
                                                }`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!cuotaLibre?.id || parcialBloqueado) return;
                                                    setPagoLibre({
                                                        open: true,
                                                        credito: c,
                                                        cuotaLibreId: cuotaLibre.id,
                                                        modo: 'parcial'
                                                    });
                                                }}
                                                title={parcialBloqueado ? "En el 3er mes no se permite abono parcial" : "Registrar abono parcial (Crédito libre)"}
                                                disabled={parcialBloqueado}
                                            >
                                                Abono parcial
                                            </button>

                                            <button
                                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!cuotaLibre?.id) return;
                                                    setPagoLibre({
                                                        open: true,
                                                        credito: c,
                                                        cuotaLibreId: cuotaLibre.id,
                                                        modo: 'total'
                                                    });
                                                }}
                                                title="Liquidar crédito (Crédito libre)"
                                            >
                                                Liquidar crédito
                                            </button>
                                        </>
                                    )}

                                    {/* Botón Refinanciar crédito (solo "comun", vencido y con saldo) */}
                                    {puedeRefinanciar && (
                                        <button
                                            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setRefi({ open: true, credito: c });
                                            }}
                                            title="Refinanciar crédito vencido (solo modalidad común)"
                                        >
                                            Refinanciar crédito
                                        </button>
                                    )}

                                    {/* Botón Ver recibos */}
                                    <button
                                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            abrirRecibos(c);
                                        }}
                                        title="Ver recibos del crédito"
                                    >
                                        <FileText size={14} /> Ver recibos
                                    </button>

                                    {/* Botón Cancelar crédito (no-libre) */}
                                    {puedeCancelar && c.estado !== "pagado" && !esLibre && String(c.estado).toLowerCase() !== 'refinanciado' && (
                                        <button
                                            className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setCancelarModal({ open: true, credito: c });
                                            }}
                                            title="Cancelar crédito (pago anticipado)"
                                        >
                                            Cancelar crédito
                                        </button>
                                    )}

                                    <span
                                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ${estadoClasses(
                                            c.estado
                                        )}`}
                                    >
                                        {c.estado}
                                    </span>
                                    <ChevronDown
                                        size={18}
                                        className={`transition-transform duration-300 ${abierto === c.id ? "rotate-180" : ""
                                            }`}
                                    />
                                </div>
                            </header>

                            {/* Leyenda según modalidad + Resumen Libre */}
                            {abierto === c.id && c.estado !== "pagado" && (
                                esLibre ? (
                                    <div className="mx-4 mb-2 rounded border bg-emerald-50 border-emerald-100 p-3 text-xs text-gray-800">
                                        <div className="mb-1">
                                            <b>Crédito libre (máx. 3 meses):</b> sin vencimientos ni mora. En el 3er mes no se permiten abonos parciales.
                                            Para liquidar, se calcula el <b>interés por ciclo ({c.tipo_credito})</b> sobre el <b>capital</b>
                                            y puede aplicarse un <b>descuento (%)</b> sobre el total.
                                        </div>
                                        {/* Resumen rápido */}
                                        {resumen?.loading ? (
                                            <div className="mt-1 italic text-emerald-700">
                                                Calculando resumen del ciclo…
                                            </div>
                                        ) : resumen?.error ? (
                                            <div className="mt-1 text-red-600">
                                                {resumen.error}
                                            </div>
                                        ) : resumen?.data ? (
                                            <div className="mt-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                                                <div className="rounded bg-white border p-2">
                                                    <div className="text-gray-600">Ciclo</div>
                                                    <div className="font-semibold">{ciclo}/3</div>
                                                </div>
                                                <div className="rounded bg-white border p-2">
                                                    <div className="text-gray-600">Capital (hoy)</div>
                                                    <div className="font-semibold">${money(resumen.data.saldo_capital)}</div>
                                                </div>
                                                <div className="rounded bg-white border p-2">
                                                    <div className="text-gray-600">Interés de ciclo (hoy)</div>
                                                    <div className="font-semibold">${money(resumen.data.interes_pendiente_hoy)}</div>
                                                </div>
                                                <div className="rounded bg-white border p-2">
                                                    <div className="text-gray-600">Total liquidación (hoy)</div>
                                                    <div className="font-semibold">${money(resumen.data.total_liquidacion_hoy)}</div>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div className="mx-4 mb-2 text-xs text-gray-600">
                                        <div className="inline-flex items-center gap-1">
                                            <Info size={14} className="text-sky-600" />
                                            <span>
                                                Interés <b>proporcional (mín. 60%)</b> según períodos ({c.tipo_credito}). Estimación (hoy): Capital pendiente ${money(principalPendiente)} + Mora ${money(moraAcum)}.
                                            </span>
                                        </div>
                                    </div>
                                )
                            )}

                            <div
                                className={`grid transition-all duration-500 ease-in-out ${abierto === c.id
                                        ? "grid-rows-[1fr] opacity-100 border-t border-gray-200"
                                        : "grid-rows-[0fr] opacity-0"
                                    } overflow-hidden`}
                            >
                                <div className="overflow-hidden">
                                    <div className="space-y-4 p-4 sm:p-6 pt-0">
                                        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                                            <div className="flex flex-wrap items-center gap-2" title={interesInfoTitle}>
                                                <TrendingUp size={16} className="text-gray-500" />
                                                <dt className="font-medium text-gray-600">
                                                    {esLibre ? 'Tasa por ciclo:' : 'Interés:'}
                                                </dt>
                                                <dd className="font-mono text-gray-800">{c.interes}%</dd>
                                            </div>

                                            {!esLibre && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Clock size={16} className="text-gray-500" />
                                                    <dt className="font-medium text-gray-600">Cuotas:</dt>
                                                    <dd className="font-mono text-gray-800">{c.cantidad_cuotas}</dd>
                                                </div>
                                            )}

                                            <div className="flex flex-wrap items-center gap-2">
                                                <ListOrdered size={16} className="text-gray-500" />
                                                <dt className="font-medium text-gray-600">Tipo:</dt>
                                                <dd className="text-gray-800">{c.tipo_credito}</dd>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <RefreshCw size={16} className="text-gray-500" />
                                                <dt className="font-medium text-gray-600">Modalidad:</dt>
                                                <dd className="text-gray-800">{c.modalidad_credito}</dd>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <DollarSign size={16} className="text-gray-500" />
                                                <dt className="font-medium text-gray-600">Capital:</dt>
                                                <dd className="font-mono text-gray-800">${money(c.saldo_actual)}</dd>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <CheckCircle2 size={16} className="text-gray-500" />
                                                <dt className="font-medium text-gray-600">Monto acreditado:</dt>
                                                <dd className="font-mono text-gray-800">${money(c.monto_acreditar)}</dd>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <XCircle size={16} className="text-gray-500" />
                                                <dt className="font-medium text-gray-600">
                                                    {esLibre ? 'Total del ciclo (capital + interés):' : 'Total a devolver:'}
                                                </dt>
                                                <dd className="font-mono text-gray-800">
                                                    {tieneDescuento ? (
                                                        <>
                                                            <span className="mr-2 text-sm text-gray-500 line-through">
                                                                ${money(totalSinDescuento)}
                                                            </span>
                                                            <span className="font-semibold text-green-700">
                                                                ${money(c.monto_total_devolver)}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <>${money(c.monto_total_devolver)}</>
                                                    )}
                                                </dd>
                                            </div>

                                            {Number(c.interes_acumulado) > 0 && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <TrendingUp size={16} className="text-gray-500" />
                                                    <dt className="font-medium text-gray-600">Intereses acumulados:</dt>
                                                    <dd className="font-mono text-gray-800">
                                                        ${money(c.interes_acumulado)}
                                                    </dd>
                                                </div>
                                            )}

                                            {c.id_credito_origen && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <CornerUpLeft size={16} className="text-gray-500" />
                                                    <dt className="font-medium text-gray-600">Refinanciado de:</dt>
                                                    <dd className="text-gray-800">#{c.id_credito_origen}</dd>
                                                </div>
                                            )}

                                            <div className="flex flex-wrap items-center gap-2">
                                                <User size={16} className="text-gray-500" />
                                                <dt className="font-medium text-gray-600">Cobrador:</dt>
                                                <dd className="text-gray-800">
                                                    {c.cobradorCredito?.nombre_completo ?? "—"}
                                                </dd>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <CalendarDays size={16} className="text-gray-500" />
                                                <dt className="font-medium text-gray-600">Fecha de solicitud:</dt>
                                                <dd className="text-gray-800">{c.fecha_solicitud}</dd>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <CalendarDays size={16} className="text-gray-500" />
                                                <dt className="font-medium text-gray-600">Fecha de acreditación:</dt>
                                                <dd className="text-gray-800">{c.fecha_acreditacion}</dd>
                                            </div>

                                            {!esLibre && tieneDescuento && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Percent size={16} className="text-green-600" />
                                                    <dt className="font-medium text-gray-600">Descuento:</dt>
                                                    <dd className="font-semibold text-green-700">{c.descuento}%</dd>
                                                </div>
                                            )}
                                        </dl>

                                        <section>
                                            <h5 className="mb-2 font-semibold text-gray-700">Detalle de cuotas</h5>

                                            {esLibre ? (
                                                <div className="rounded-lg border p-4 bg-white text-sm">
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                        <div>
                                                            <span className="text-gray-500">Cuota:</span>{' '}
                                                            <span className="font-medium">#1 (abierta)</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">Importe del ciclo:</span>{' '}
                                                            <span className="font-medium">
                                                                ${money(cuotaLibre?.importe_cuota ?? 0)}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">Vencimiento:</span>{' '}
                                                            <span className="font-medium">Sin vencimiento</span>
                                                        </div>
                                                    </div>
                                                    {c.estado !== 'pagado' && (
                                                        <div className="mt-3 flex gap-2">
                                                            <button
                                                                className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium ${
                                                                    parcialBloqueado
                                                                        ? "border-gray-300 text-gray-400 bg-white cursor-not-allowed"
                                                                        : "border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50"
                                                                }`}
                                                                onClick={() => {
                                                                    if (!cuotaLibre?.id || parcialBloqueado) return;
                                                                    setPagoLibre({
                                                                        open: true,
                                                                        credito: c,
                                                                        cuotaLibreId: cuotaLibre.id,
                                                                        modo: 'parcial'
                                                                    });
                                                                }}
                                                                disabled={parcialBloqueado}
                                                            >
                                                                Abono parcial
                                                            </button>
                                                            <button
                                                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                                                onClick={() => {
                                                                    if (!cuotaLibre?.id) return;
                                                                    setPagoLibre({
                                                                        open: true,
                                                                        credito: c,
                                                                        cuotaLibreId: cuotaLibre.id,
                                                                        modo: 'total'
                                                                    });
                                                                }}
                                                            >
                                                                Liquidar crédito
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <CuotasTabla
                                                    cuotas={c.cuotas}
                                                    interesCredito={c.interes}
                                                    refetch={refetchCreditos}
                                                />
                                            )}
                                        </section>
                                    </div>
                                </div>
                            </div>
                        </article>
                    );
                })
            )}

            {/* Modal de Recibos */}
            {recibosModal.open && (
                <section className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="relative w-full max-w-3xl rounded-xl bg-white shadow p-6">
                        <header className="mb-4 flex items-center justify-between border-b pb-2">
                            <h4 className="text-lg font-semibold">
                                Recibos del crédito #{recibosModal.credito?.id}
                            </h4>
                            <button
                                onClick={cerrarRecibos}
                                className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                            >
                                Cerrar
                            </button>
                        </header>

                        {recibosModal.loading ? (
                            <p className="text-sm text-gray-600">Cargando...</p>
                        ) : recibosModal.error ? (
                            <p className="text-sm text-red-600">{recibosModal.error}</p>
                        ) : recibosModal.items.length === 0 ? (
                            <p className="text-sm text-gray-600">No hay recibos para este crédito.</p>
                        ) : (
                            <div className="overflow-auto max-h-[60vh] rounded border">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium"># Recibo</th>
                                            <th className="px-3 py-2 text-left font-medium">Fecha</th>
                                            <th className="px-3 py-2 text-left font-medium">Hora</th>
                                            <th className="px-3 py-2 text-left font-medium">Cuota</th>
                                            <th className="px-3 py-2 text-left font-medium">Importe</th>
                                            <th className="px-3 py-2 text-left font-medium">Concepto</th>
                                            <th className="px-3 py-2 text-left font-medium">Medio</th>
                                            <th className="px-3 py-2 text-left font-medium">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {recibosModal.items.map((r) => (
                                            <tr key={r.numero_recibo} className="odd:bg-white even:bg-gray-50">
                                                <td className="px-3 py-2 font-mono">{r.numero_recibo}</td>
                                                <td className="px-3 py-2">{r.fecha}</td>
                                                <td className="px-3 py-2">{r.hora}</td>
                                                <td className="px-3 py-2">#{r.cuota?.numero_cuota ?? "—"}</td>
                                                <td className="px-3 py-2">${money(r.monto_pagado)}</td>
                                                <td className="px-3 py-2 truncate max-w-[260px]" title={r.concepto}>
                                                    {r.concepto}
                                                </td>
                                                <td className="px-3 py-2">{r.medio_pago}</td>
                                                <td className="px-3 py-2">
                                                    <Link
                                                        to={`/recibo/${r.numero_recibo}`}
                                                        className="text-blue-600 hover:underline"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Ver
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Modal de Cancelación (no-libre) */}
            {cancelarModal.open && (
                <CancelarCreditoModal
                    credito={cancelarModal.credito}
                    onClose={() => setCancelarModal({ open: false, credito: null })}
                    onSuccess={() => {
                        setCancelarModal({ open: false, credito: null });
                        refetchCreditos?.();
                    }}
                />
            )}

            {/* Modal de Pago Libre */}
            {pagoLibre.open && (
                <PagoLibreModal
                    open={pagoLibre.open}
                    credito={pagoLibre.credito}
                    cuotaLibreId={pagoLibre.cuotaLibreId}
                    modoInicial={pagoLibre.modo}
                    onClose={() => setPagoLibre({ open: false, credito: null, cuotaLibreId: null, modo: 'parcial' })}
                    onSuccess={async () => {
                        // Refrescamos créditos y resumen para evitar datos viejos tras el pago
                        await refetchCreditos?.();
                        if (pagoLibre.credito?.id) {
                            await refreshResumenLibre(pagoLibre.credito.id);
                        }
                    }}
                />
            )}

            {/* Modal de Refinanciación */}
            {refi.open && (
                <RefinanciarCreditoModal
                    open={refi.open}
                    credito={refi.credito}
                    onClose={() => setRefi({ open: false, credito: null })}
                    onSuccess={async () => {
                        await refetchCreditos?.();
                    }}
                />
            )}
        </section>
    );
};

export default InfoCreditos;