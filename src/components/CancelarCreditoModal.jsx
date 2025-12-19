// src/components/CancelarCreditoModal.jsx
import { useEffect, useMemo, useState } from 'react';
import { X, ShieldCheck, Percent, CreditCard } from 'lucide-react';
import Swal from 'sweetalert2';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

import { obtenerFormasDePago } from '../services/cuotaService';
import { cancelarCredito } from '../services/creditoService';
import { obtenerRecibosPorCredito } from '../services/reciboService';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (n, min, max) => Math.min(Math.max(Number(n) || 0, min), max);
const fmtAR = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

/* ───────────────── Helpers de navegación/recibo ───────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Intenta extraer numero_recibo de distintas formas del response */
const numeroDesdeResponse = (resp) =>
    resp?.numero_recibo ??
    resp?.data?.numero_recibo ??
    resp?.recibo?.numero_recibo ??
    resp?.data?.recibo?.numero_recibo ??
    null;

/** Ordena lista de recibos por recencia (numero_recibo DESC; si empate, fecha+hora) */
const ordenarRecibos = (lista = []) => {
    return [...lista].sort((a, b) => {
        const na = Number(a?.numero_recibo || 0);
        const nb = Number(b?.numero_recibo || 0);
        if (nb !== na) return nb - na;
        const fa = `${a?.fecha || ''} ${a?.hora || ''}`;
        const fb = `${b?.fecha || ''} ${b?.hora || ''}`;
        return fb.localeCompare(fa);
    });
};

/**
 * Busca el último recibo del crédito con polling corto.
 * @returns numero_recibo | null
 */
const buscarUltimoReciboConPolling = async (creditoId, intentos = 3, delayMs = 600) => {
    for (let i = 0; i < intentos; i++) {
        try {
            const lista = await obtenerRecibosPorCredito(creditoId);
            if (Array.isArray(lista) && lista.length > 0) {
                const ult = ordenarRecibos(lista)[0];
                if (ult?.numero_recibo) return ult.numero_recibo;
            }
        } catch {
            // silencioso
        }
        await sleep(delayMs);
    }
    return null;
};

/* ───────────────── Auth/Roles ───────────────── */
const getRolIdFromToken = () => {
    try {
        const raw = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
        if (!raw) return null;
        const token = raw.replace(/^Bearer\s+/i, '');
        const decoded = jwtDecode(token);
        const rid = decoded?.rol_id ?? decoded?.rol ?? decoded?.role ?? null;
        const n = Number(rid);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
};

/* Normaliza: apiFetch a veces devuelve directo y a veces {success,data} */
const normalizeData = (resp) => {
    if (!resp) return resp;
    if (resp?.data !== undefined && (resp?.success === true || resp?.success === false)) return resp.data;
    return resp;
};

const CancelarCreditoModal = ({ credito, onClose, onSuccess }) => {
    const navigate = useNavigate();

    const [formas, setFormas] = useState([]);
    const [formaId, setFormaId] = useState('');
    const [descuentoPct, setDescuentoPct] = useState('');
    const [ambito, setAmbito] = useState('mora'); // 'mora' | 'total' (solo superadmin)
    const [observacion, setObservacion] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const rolId = useMemo(() => getRolIdFromToken(), []);
    const isSuperadmin = rolId === 0;
    const isAdmin = rolId === 1;

    const isLibre = useMemo(() => {
        const mod = String(credito?.modalidad_credito ?? '').toLowerCase();
        return mod === 'libre';
    }, [credito?.modalidad_credito]);

    // Enforce UI: admin solo puede bonificar mora; en LIBRE admin no bonifica (evita rechazos del back)
    useEffect(() => {
        if (!isSuperadmin && ambito !== 'mora') setAmbito('mora');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSuperadmin]);

    useEffect(() => {
        if (isLibre && !isSuperadmin && String(descuentoPct || '') !== '' && Number(descuentoPct) !== 0) {
            setDescuentoPct('0');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLibre, isSuperadmin]);

    useEffect(() => {
        (async () => {
            try {
                const fRaw = await obtenerFormasDePago();
                const f = normalizeData(fRaw);
                setFormas(Array.isArray(f) ? f : []);
            } catch (e) {
                console.error(e);
                Swal.fire('Error', 'No se pudieron cargar las formas de pago.', 'error');
            }
        })();
    }, []);

    /* ========= Estimaciones locales (informativas) ========= */
    const principalPendiente = round2(
        (credito?.cuotas || []).reduce((acc, q) => {
            const imp = Number(q.importe_cuota || 0);
            const desc = Number(q.descuento_cuota || 0);
            const pag = Number(q.monto_pagado_acumulado || 0);
            return acc + Math.max(imp - desc - pag, 0);
        }, 0)
    );

    const moraAcum = round2(
        (credito?.cuotas || []).reduce(
            (acc, q) => acc + Number(q.intereses_vencidos_acumulados || 0),
            0
        )
    );

    const baseTotal = round2(principalPendiente + moraAcum);

    // Porcentaje input
    const dPctRaw = clamp(descuentoPct, 0, 100);

    // Reglas por rol/modalidad:
    // - Admin: ambito fijo mora
    // - Admin + LIBRE: descuento forzado a 0
    const ambitoEfectivo = isSuperadmin ? ambito : 'mora';
    const dPct = (!isSuperadmin && isLibre) ? 0 : dPctRaw;

    const descuentoEstimado =
        ambitoEfectivo === 'total'
            ? round2(baseTotal * (dPct / 100))
            : round2(moraAcum * (dPct / 100));

    const totalEstimado =
        ambitoEfectivo === 'total'
            ? round2(Math.max(baseTotal - descuentoEstimado, 0))
            : round2(principalPendiente + Math.max(moraAcum - descuentoEstimado, 0));

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formaId) {
            Swal.fire('Atención', 'Seleccioná una forma de pago.', 'warning');
            return;
        }

        // Permisos: solo superadmin/admin
        if (!isSuperadmin && !isAdmin) {
            Swal.fire('Sin permiso', 'Tu usuario no tiene permisos para cancelar créditos.', 'warning');
            return;
        }

        if (Number.isNaN(Number(descuentoPct)) || dPctRaw < 0 || dPctRaw > 100) {
            Swal.fire('Atención', 'El descuento debe ser un porcentaje entre 0 y 100.', 'warning');
            return;
        }

        // Regla: LIBRE + admin => descuento 0 (evita rechazos del back)
        const pctEnviar = (!isSuperadmin && isLibre) ? 0 : Number(dPct);
        const ambitoEnviar = isSuperadmin ? ambito : 'mora';

        setSubmitting(true);
        try {
            const resp = await cancelarCredito(credito.id, {
                forma_pago_id: Number(formaId),

                // Legacy/actual del endpoint de cancelar (si existe así)
                descuento_porcentaje: pctEnviar,
                descuento_sobre: ambitoEnviar,

                // Nuevo/compat (alineado a pagos/cuotas): descuento SOLO sobre mora
                descuento_scope: 'mora',
                descuento_mora: pctEnviar,
                descuento: pctEnviar,

                observacion
            });

            await Swal.fire('¡Crédito cancelado!', 'Se generó el pago y el recibo resumen.', 'success');

            // 1) Intento directo
            let numero = numeroDesdeResponse(resp);

            // 2) Fallback con polling corto si no lo obtuvimos
            if (!numero) {
                numero = await buscarUltimoReciboConPolling(credito.id, 3, 600);
            }

            if (numero) {
                try {
                    navigate(`/recibo/${encodeURIComponent(numero)}`);
                } catch {
                    window.location.assign(`/recibo/${encodeURIComponent(numero)}`);
                }
                onClose?.();
                onSuccess?.();
            } else {
                await Swal.fire({
                    icon: 'warning',
                    title: 'Recibo emitido, pero no pude detectarlo',
                    text: 'No pude obtener el número del recibo automáticamente. Podés abrirlo desde "Ver recibos".'
                });
                onClose?.();
                onSuccess?.();
            }
        } catch (e2) {
            console.error(e2);
            const msg =
                e2?.response?.data?.message ||
                e2?.response?.data?.error ||
                e2?.message ||
                'No se pudo cancelar el crédito';
            Swal.fire('Error', msg, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const inputClass =
        'mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500';

    const radioClass =
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm cursor-pointer select-none';

    const helperSegunAmbito =
        ambitoEfectivo === 'total'
            ? 'El descuento se aplica sobre (principal + mora).'
            : 'El descuento se aplica SOLO sobre la mora.';

    return (
        <section className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4">
            <div className="relative w-full max-w-lg rounded-xl bg-white shadow p-6">
                {/* Header */}
                <header className="mb-4 flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="text-rose-600" size={22} />
                        <h3 className="text-base font-semibold">Cancelar crédito #{credito?.id}</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X size={20} />
                    </button>
                </header>

                {/* Nota reglas */}
                <div className="mb-4 text-xs text-gray-600">
                    <span className="font-medium">Regla:</span> el descuento no toca el capital por defecto.
                    {isLibre && !isSuperadmin && (
                        <span> En <span className="font-medium">LIBRE</span>, admin no puede bonificar (evita rechazos del servidor).</span>
                    )}
                    {!isSuperadmin && (
                        <span> (Admin: descuento solo sobre mora.)</span>
                    )}
                </div>

                {/* Resumen estimado */}
                <dl className="mb-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <dt className="text-gray-600">Principal pendiente</dt>
                        <dd className="mt-0.5 font-medium">${fmtAR(principalPendiente)}</dd>
                    </div>
                    <div>
                        <dt className="text-gray-600">Mora acumulada (estimado)</dt>
                        <dd className="mt-0.5 font-medium">${fmtAR(moraAcum)}</dd>
                    </div>

                    <div className="col-span-2">
                        <dt className="text-gray-600">Ámbito del descuento</dt>
                        <dd className="mt-1 flex items-center gap-2">
                            {/* Admin: solo mora. Superadmin: puede elegir */}
                            <label
                                className={`${radioClass} ${ambitoEfectivo === 'mora' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300'} ${!isSuperadmin ? 'opacity-80 cursor-not-allowed' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="ambito"
                                    value="mora"
                                    checked={ambitoEfectivo === 'mora'}
                                    onChange={() => isSuperadmin && setAmbito('mora')}
                                    className="hidden"
                                    disabled={!isSuperadmin}
                                />
                                <span>Solo sobre mora</span>
                            </label>

                            {isSuperadmin && (
                                <label
                                    className={`${radioClass} ${ambitoEfectivo === 'total' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300'}`}
                                >
                                    <input
                                        type="radio"
                                        name="ambito"
                                        value="total"
                                        checked={ambitoEfectivo === 'total'}
                                        onChange={() => setAmbito('total')}
                                        className="hidden"
                                    />
                                    <span>Sobre total</span>
                                </label>
                            )}
                        </dd>
                        <p className="mt-1 text-xs text-gray-500">{helperSegunAmbito}</p>
                    </div>

                    <div className="col-span-2">
                        <dt className="text-gray-600">Descuento estimado</dt>
                        <dd className="mt-0.5 font-medium">-${fmtAR(descuentoEstimado)}</dd>
                    </div>

                    <div className="col-span-2">
                        <dt className="text-gray-600">Total estimado a pagar</dt>
                        <dd className="mt-0.5 font-medium">
                            ${fmtAR(totalEstimado)}{' '}
                            <span className="text-xs text-gray-500">
                                (la mora se recalcula en servidor antes de emitir el recibo)
                            </span>
                        </dd>
                    </div>
                </dl>

                {/* Formulario */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Forma de pago */}
                    <div>
                        <label className="block text-sm font-medium">Forma de pago</label>
                        <select
                            value={formaId}
                            onChange={(e) => setFormaId(e.target.value)}
                            className={inputClass}
                            required
                        >
                            <option value="">Seleccionar...</option>
                            {formas.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Descuento % */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium">
                            <Percent size={16} className="text-emerald-600" />
                            Descuento (%)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={String(dPct)}
                            onChange={(e) => setDescuentoPct(e.target.value)}
                            className={inputClass}
                            placeholder="0"
                            inputMode="decimal"
                            disabled={(isLibre && !isSuperadmin)}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            {isLibre && !isSuperadmin
                                ? 'En créditos LIBRE, admin no puede aplicar descuento.'
                                : (ambitoEfectivo === 'total'
                                    ? 'Se aplica sobre (principal + mora).'
                                    : 'Se aplica proporcionalmente sobre la mora (no sobre el capital).')}
                        </p>
                    </div>

                    {/* Observación */}
                    <div>
                        <label className="block text-sm font-medium">Observación (opcional)</label>
                        <textarea
                            rows={2}
                            value={observacion}
                            onChange={(e) => setObservacion(e.target.value)}
                            className={inputClass}
                            placeholder="Ej: beneficio por pago anticipado"
                        />
                    </div>

                    {/* Botones */}
                    <div className="flex justify-end gap-3 pt-2 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200"
                            disabled={submitting}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !formaId}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                            title={!formaId ? 'Elegí una forma de pago' : 'Cancelar crédito'}
                        >
                            <CreditCard size={16} /> {submitting ? 'Procesando...' : 'Confirmar cancelación'}
                        </button>
                    </div>
                </form>
            </div>
        </section>
    );
};

export default CancelarCreditoModal;