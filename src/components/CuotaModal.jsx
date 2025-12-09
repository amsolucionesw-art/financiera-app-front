// src/components/CuotaModal.jsx

import { useState, useEffect, useMemo, useRef } from 'react';
import { X, CreditCard as IconCreditCard, Info as IconInfo } from 'lucide-react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import Swal from 'sweetalert2';
import { format, parseISO } from 'date-fns';
import {
    obtenerFormasDePago,
    obtenerPagosPorCuota,
    obtenerCuotaPorId,
    registrarPagoParcial,
    pagarCuota,
} from '../services/cuotaService';
import { obtenerResumenLibre as obtenerResumenLibreCredito } from '../services/creditoService';
import { useNavigate } from 'react-router-dom';

/* Constantes / Utils */
const VTO_FICTICIO_LIBRE = '2099-12-31';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (n, min, max) => Math.min(Math.max(Number(n) || 0, min), max);
const fmtAR = (n) =>
    Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CuotaModal = ({ cuota, onClose, onSuccess }) => {
    const navigate = useNavigate();

    /* State */
    const [formas, setFormas] = useState([]);
    const [pagos, setPagos] = useState([]);
    const [cuotaSrv, setCuotaSrv] = useState(cuota);
    const [resumenLibre, setResumenLibre] = useState(null); // { saldo_capital, interes_pendiente_hoy, mora_pendiente_hoy, total_liquidacion_hoy, ciclo_actual, ... }
    const isMounted = useRef(true);

    /* RHF */
    const {
        control,
        handleSubmit,
        reset,
        setValue,
        formState: { errors, isSubmitting }
    } = useForm({
        defaultValues: {
            tipoPago: 'total',     // 'total' | 'parcial'
            descuento: 0,          // % en LIBRE total, MONTO en NO-LIBRE (sobre mora)
            montoAbono: '',
            formaId: '',
            observacion: '',
            modoLibre: 'interes_y_capital' // 'solo_interes' | 'interes_y_capital' (solo LIBRE + parcial)
        }
    });

    const tipoPago = useWatch({ control, name: 'tipoPago' });
    const descuentoWatch = useWatch({ control, name: 'descuento' });
    const modoLibre = useWatch({ control, name: 'modoLibre' });

    /* Flags */
    const isLibre = useMemo(
        () => (cuotaSrv?.fecha_vencimiento === VTO_FICTICIO_LIBRE),
        [cuotaSrv?.fecha_vencimiento]
    );
    const cicloActual = resumenLibre?.ciclo_actual || null;
    const bloquearParcialLibre = isLibre && cicloActual >= 3;

    /* Carga: cuota (recalcula mora), formas, pagos – en paralelo; luego, si es LIBRE, traigo resumen */
    useEffect(() => {
        isMounted.current = true;
        (async () => {
            try {
                const [f, p, c] = await Promise.all([
                    obtenerFormasDePago(),
                    obtenerPagosPorCuota(cuota.id),
                    obtenerCuotaPorId(cuota.id)
                ]);
                if (!isMounted.current) return;
                setFormas(f || []);
                setPagos(Array.isArray(p) ? p : []);
                setCuotaSrv(c);

                reset({
                    tipoPago: 'total',
                    descuento: 0,
                    montoAbono: '',
                    formaId: '',
                    observacion: '',
                    modoLibre: 'interes_y_capital'
                });

                // Si es LIBRE, cargo resumen
                const libre = c?.fecha_vencimiento === VTO_FICTICIO_LIBRE;
                if (libre && c?.credito_id) {
                    try {
                        const resumen = await obtenerResumenLibreCredito(c.credito_id);
                        if (!isMounted.current) return;
                        setResumenLibre(resumen || null);
                    } catch (e) {
                        console.warn('No se pudo obtener resumen libre:', e);
                        setResumenLibre(null);
                    }
                } else {
                    setResumenLibre(null);
                }
            } catch (e) {
                if (!isMounted.current) return;
                console.error(e);
                Swal.fire('Error', 'No se pudieron cargar datos', 'error');
            }
        })();
        return () => { isMounted.current = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cuota.id]);

    /* Derivados memoizados (NO-LIBRE) — descuento SOLO sobre MORA */
    const derivedNoLibre = useMemo(() => {
        const importeCuota = round2(cuotaSrv?.importe_cuota);
        const descAcum = round2(cuotaSrv?.descuento_cuota);
        const pagadoAcum = round2(cuotaSrv?.monto_pagado_acumulado);
        const moraAcum = round2(cuotaSrv?.intereses_vencidos_acumulados);

        const principalPendiente = Math.max(importeCuota - descAcum - pagadoAcum, 0);

        // ⬇️ Ahora el descuento válido se limita a la MORA (no al principal)
        const descValido = clamp(descuentoWatch, 0, moraAcum);

        // Neto total: (Mora - Descuento) + PrincipalPendiente
        const netoTotalConDesc = round2(Math.max(moraAcum - descValido, 0) + principalPendiente);

        return {
            importeCuota,
            descAcum,
            pagadoAcum,
            moraAcum,
            principalPendiente,
            descValido,
            netoTotalConDesc
        };
    }, [cuotaSrv, descuentoWatch]);

    /* Derivados memoizados (LIBRE) — descuento % SOLO sobre mora del ciclo */
    const derivedLibre = useMemo(() => {
        const totalHoy = round2(resumenLibre?.total_liquidacion_hoy);
        const interesHoy = round2(resumenLibre?.interes_pendiente_hoy);
        const moraHoy = round2(resumenLibre?.mora_pendiente_hoy);   // puede ser 0 si aún no venció compromiso
        const saldoCapital = round2(resumenLibre?.saldo_capital);

        const descPct = clamp(descuentoWatch, 0, 100);

        // Neto = TotalHoy - (MoraHoy * %/100)
        const descuentoEnPesos = round2(moraHoy * (descPct / 100));
        const netoTotalConDesc = round2(Math.max(totalHoy - descuentoEnPesos, 0));

        return {
            totalHoy,
            interesHoy,
            moraHoy,
            saldoCapital,
            descPct,
            descuentoEnPesos,
            netoTotalConDesc
        };
    }, [resumenLibre, descuentoWatch]);

    /* Handlers adicionales LIBRE */
    useEffect(() => {
        if (!isLibre) return;
        if (tipoPago === 'parcial' && modoLibre === 'solo_interes') {
            // Autollenar el monto con el interés pendiente del ciclo actual
            const interes = round2(resumenLibre?.interes_pendiente_hoy || 0);
            setValue('montoAbono', interes > 0 ? String(interes) : '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLibre, tipoPago, modoLibre, resumenLibre?.interes_pendiente_hoy]);

    /* Submit */
    const onSubmit = async ({ tipoPago, descuento, montoAbono, formaId, observacion, modoLibre }) => {
        try {
            if (!formaId) {
                Swal.fire('Atención', 'Seleccioná una forma de pago.', 'warning');
                return;
            }

            // —— PAGO TOTAL —— //
            if (tipoPago === 'total') {
                // LIBRE: descuento es % (aplica SOLO sobre mora del ciclo)
                // NO-LIBRE: descuento es MONTO (aplica SOLO sobre mora)
                const descEnviar = isLibre
                    ? clamp(Number(descuento || 0), 0, 100)
                    : derivedNoLibre.descValido;

                const resp = await pagarCuota({
                    cuotaId: cuotaSrv.id,
                    forma_pago_id: Number(formaId),
                    observacion,
                    descuento: descEnviar
                });

                const recibo = resp?.recibo || resp?.data?.recibo;
                if (recibo?.numero_recibo) {
                    Swal.fire('¡Pago total registrado!', '', 'success');
                    navigate(`/recibo/${recibo.numero_recibo}`);
                } else {
                    Swal.fire('¡Pago total registrado!', '', 'success');
                }

                onClose?.();
                onSuccess?.();
                return;
            }

            // —— ABONO PARCIAL —— //
            // LIBRE Mes 3: bloqueo desde UI por seguridad; el back igual lo rechaza.
            if (isLibre && bloquearParcialLibre) {
                Swal.fire('Atención', 'En el 3er mes del crédito LIBRE no se permite abono parcial. Debe realizar pago total.', 'warning');
                return;
            }

            const abono = round2(montoAbono);
            if (!abono || abono <= 0) {
                Swal.fire('Atención', 'Ingresá un monto de abono mayor a 0.', 'warning');
                return;
            }

            // Reglas de recomendación
            if (!isLibre) {
                const maxRecomendado = derivedNoLibre.netoTotalConDesc;
                if (abono > maxRecomendado) {
                    const confirmar = await Swal.fire({
                        icon: 'warning',
                        title: 'Monto supera el total recomendado',
                        text: `Ingresaste $${fmtAR(abono)} y el recomendado es $${fmtAR(maxRecomendado)}. ¿Continuar?`,
                        showCancelButton: true,
                        confirmButtonText: 'Sí, continuar',
                        cancelButtonText: 'Cancelar'
                    });
                    if (!confirmar.isConfirmed) return;
                }
            } else {
                // En LIBRE sugerimos el interés del ciclo como mínimo si modo = solo_interes
                if (modoLibre === 'solo_interes') {
                    const interes = round2(resumenLibre?.interes_pendiente_hoy || 0);
                    if (Math.abs(abono - interes) > 0.01) {
                        const confirmar = await Swal.fire({
                            icon: 'question',
                            title: '¿Registrar solo interés?',
                            text: `El interés del ciclo es $${fmtAR(interes)}. ¿Usar exactamente ese monto?`,
                            showCancelButton: true,
                            confirmButtonText: 'Sí, usar interés',
                            cancelButtonText: 'Mantener monto'
                        });
                        if (confirmar.isConfirmed) {
                            await registrarPagoParcial({
                                cuota_id: cuotaSrv.id,
                                monto_pagado: interes,
                                forma_pago_id: Number(formaId),
                                observacion,
                                descuento: 0,
                                modo: 'solo_interes'
                            });
                            Swal.fire('¡Abono registrado!', '', 'success');
                            onClose?.();
                            onSuccess?.();
                            return;
                        }
                    }
                }
            }

            // Enviamos el pago parcial
            const resp = await registrarPagoParcial({
                cuota_id: cuotaSrv.id,
                monto_pagado: abono,
                forma_pago_id: Number(formaId),
                observacion,
                descuento: isLibre ? 0 : derivedNoLibre.descValido, // en LIBRE, el descuento no aplica en parcial
                ...(isLibre ? { modo: modoLibre } : {})
            });

            const recibo = resp?.recibo || resp?.data?.recibo;
            if (recibo?.numero_recibo) {
                Swal.fire('¡Abono registrado!', '', 'success');
                navigate(`/recibo/${recibo.numero_recibo}`);
            } else {
                Swal.fire('¡Abono registrado!', '', 'success');
            }

            onClose?.();
            onSuccess?.();
        } catch (e) {
            console.error(e);
            Swal.fire('Error', e?.message || 'No se pudo registrar el pago', 'error');
        }
    };

    const inputClass =
        'mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500';

    return (
        <section className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-auto bg-black bg-opacity-50 p-4">
            <div className="relative w-full max-w-lg bg-white rounded-xl shadow p-6">
                {/* Header */}
                <header className="flex items-center justify-between mb-4 border-b pb-2">
                    <div className="flex items-center gap-2">
                        <IconCreditCard className="text-blue-600" size={24} />
                        <h2 className="text-lg font-semibold">Cuota #{cuotaSrv?.numero_cuota}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X size={20} />
                    </button>
                </header>

                {/* Resumen */}
                {!isLibre ? (
                    <dl className="mb-4 grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <dt className="font-medium text-gray-600">Principal pendiente:</dt>
                            <dd className="mt-1">${fmtAR(derivedNoLibre.principalPendiente)}</dd>
                        </div>
                        <div>
                            <dt className="font-medium text-gray-600">Mora acumulada:</dt>
                            <dd className="mt-1">${fmtAR(derivedNoLibre.moraAcum)}</dd>
                        </div>
                        <div>
                            <dt className="font-medium text-gray-600">Total sin descuento:</dt>
                            <dd className="mt-1">
                                ${fmtAR(derivedNoLibre.moraAcum + derivedNoLibre.principalPendiente)}
                            </dd>
                        </div>
                        <div>
                            <dt className="font-medium text-gray-600">Vencimiento actual:</dt>
                            <dd className="mt-1">
                                {cuotaSrv?.fecha_vencimiento
                                    ? format(parseISO(cuotaSrv.fecha_vencimiento), 'dd/MM/yyyy')
                                    : '—'}
                            </dd>
                        </div>
                    </dl>
                ) : (
                    <div className="mb-4 space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-blue-700">
                            <IconInfo size={16} />
                            <span className="font-semibold">Crédito LIBRE (máx. 3 meses)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-gray-600">Ciclo actual</div>
                                <div className="font-medium">{cicloActual ? `${cicloActual} / 3` : '—'}</div>
                            </div>
                            <div>
                                <div className="text-gray-600">Saldo de capital</div>
                                <div className="font-medium">${fmtAR(derivedLibre.saldoCapital)}</div>
                            </div>
                            <div>
                                <div className="text-gray-600">Interés del ciclo (hoy)</div>
                                <div className="font-medium">${fmtAR(derivedLibre.interesHoy)}</div>
                            </div>
                            <div>
                                <div className="text-gray-600">Mora del ciclo (hoy)</div>
                                <div className="font-medium">
                                    {derivedLibre?.moraHoy > 0 ? `$${fmtAR(derivedLibre.moraHoy)}` : 'No aplica'}
                                </div>
                            </div>
                            <div className="col-span-2">
                                <div className="text-gray-600">Total liquidación (hoy)</div>
                                <div className="font-medium">${fmtAR(derivedLibre.totalHoy)}</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Historial parciales */}
                {pagos.length > 0 && (
                    <div className="mb-4">
                        <h3 className="font-semibold mb-2">Pagos parciales</h3>
                        <div className="overflow-auto max-h-32 border rounded">
                            <table className="min-w-full text-sm divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {['Fecha', 'Monto', 'Forma', 'Obs'].map((h) => (
                                            <th key={h} className="px-3 py-1 text-left font-medium">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {pagos.map((p) => (
                                        <tr key={p.id} className="odd:bg-white even:bg-gray-50">
                                            <td className="px-3 py-1">
                                                {p.fecha_pago
                                                    ? format(parseISO(p.fecha_pago), 'dd/MM/yyyy')
                                                    : '—'}
                                            </td>
                                            <td className="px-3 py-1">${fmtAR(p.monto_pagado)}</td>
                                            <td className="px-3 py-1">{p.formaPago?.nombre || '—'}</td>
                                            <td className="px-3 py-1">{p.observacion || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Formulario */}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {/* Tipo de pago */}
                    <div>
                        <label className="block text-sm font-medium">Tipo de pago</label>
                        <Controller
                            name="tipoPago"
                            control={control}
                            render={({ field }) => (
                                <div className="mt-1 flex gap-4">
                                    <label className={`inline-flex items-center gap-2 ${bloquearParcialLibre ? 'opacity-100' : ''}`}>
                                        <input
                                            type="radio"
                                            value="total"
                                            checked={field.value === 'total'}
                                            onChange={() => setValue('tipoPago', 'total')}
                                        />
                                        <span>Pago total</span>
                                    </label>
                                    <label className={`inline-flex items-center gap-2 ${bloquearParcialLibre ? 'opacity-50' : ''}`}>
                                        <input
                                            type="radio"
                                            value="parcial"
                                            checked={field.value === 'parcial'}
                                            onChange={() => setValue('tipoPago', 'parcial')}
                                            disabled={bloquearParcialLibre}
                                        />
                                        <span>Abono parcial {bloquearParcialLibre && '(no disponible en 3er mes)'}</span>
                                    </label>
                                </div>
                            )}
                        />
                    </div>

                    {/* Selector de modo (solo LIBRE + parcial en ciclos 1/2) */}
                    {isLibre && tipoPago === 'parcial' && !bloquearParcialLibre && (
                        <div>
                            <label className="block text-sm font-medium">Modo de abono (LIBRE)</label>
                            <Controller
                                name="modoLibre"
                                control={control}
                                render={({ field }) => (
                                    <div className="mt-1 flex gap-4">
                                        <label className="inline-flex items-center gap-2">
                                            <input
                                                type="radio"
                                                value="solo_interes"
                                                checked={field.value === 'solo_interes'}
                                                onChange={() => setValue('modoLibre', 'solo_interes')}
                                            />
                                            <span>Solo interés del ciclo (${fmtAR(derivedLibre.interesHoy)})</span>
                                        </label>
                                        <label className="inline-flex items-center gap-2">
                                            <input
                                                type="radio"
                                                value="interes_y_capital"
                                                checked={field.value === 'interes_y_capital'}
                                                onChange={() => setValue('modoLibre', 'interes_y_capital')}
                                            />
                                            <span>Interés + capital (si excede)</span>
                                        </label>
                                    </div>
                                )}
                            />
                        </div>
                    )}

                    {/* Descuento */}
                    {!isLibre ? (
                        // NO-LIBRE: descuento MONTO sobre MORA (no sobre principal)
                        <div>
                            <label className="block text-sm font-medium">
                                Descuento (sobre mora)
                                <span className="text-gray-500"> — máx: ${fmtAR(derivedNoLibre.moraAcum)}</span>
                            </label>
                            <Controller
                                name="descuento"
                                control={control}
                                rules={{
                                    min: { value: 0, message: '>= 0' },
                                    validate: (v) =>
                                        (Number(v || 0) <= derivedNoLibre.moraAcum) ||
                                        `No debe superar $${fmtAR(derivedNoLibre.moraAcum)}`
                                }}
                                render={({ field }) => (
                                    <input
                                        type="number"
                                        step="0.01"
                                        {...field}
                                        onChange={(e) => field.onChange(e.target.value)}
                                        className={`${inputClass} w-full`}
                                        placeholder="0.00"
                                    />
                                )}
                            />
                            {errors.descuento && <p className="text-red-600 text-sm">{errors.descuento.message}</p>}
                        </div>
                    ) : (
                        // LIBRE: descuento % sobre MORA del ciclo (solo en PAGO TOTAL)
                        tipoPago === 'total' && (
                            <div>
                                <label className="block text-sm font-medium">
                                    Descuento % sobre mora del ciclo
                                    <span className="text-gray-500"> — 0 a 100%</span>
                                </label>
                                <Controller
                                    name="descuento"
                                    control={control}
                                    rules={{
                                        min: { value: 0, message: '>= 0' },
                                        max: { value: 100, message: '<= 100' }
                                    }}
                                    render={({ field }) => (
                                        <input
                                            type="number"
                                            step="0.01"
                                            {...field}
                                            onChange={(e) => field.onChange(e.target.value)}
                                            className={`${inputClass} w-full`}
                                            placeholder="0.00"
                                        />
                                    )}
                                />
                                {errors.descuento && <p className="text-red-600 text-sm">{errors.descuento.message}</p>}
                                <p className="text-xs text-gray-500 mt-1">
                                    Mora del ciclo (hoy): {derivedLibre.moraHoy > 0 ? `$${fmtAR(derivedLibre.moraHoy)}` : 'No aplica'}
                                    {derivedLibre.moraHoy > 0 && ` — Bonificación estimada: $${fmtAR(derivedLibre.descuentoEnPesos)}`}
                                </p>
                            </div>
                        )
                    )}

                    {/* Neto sugerido para pago total */}
                    {tipoPago === 'total' && (
                        <div>
                            <label className="block text-sm font-medium">Neto a pagar (total)</label>
                            <input
                                type="text"
                                readOnly
                                value={
                                    !isLibre
                                        ? `$${fmtAR(derivedNoLibre.netoTotalConDesc)}`
                                        : `$${fmtAR(derivedLibre.netoTotalConDesc)}`
                                }
                                className={`${inputClass} bg-gray-100 cursor-not-allowed`}
                            />
                            {!isLibre ? (
                                <p className="text-xs text-gray-500 mt-1">
                                    Neto = (Mora ${fmtAR(derivedNoLibre.moraAcum)} − Descuento ${fmtAR(derivedNoLibre.descValido)}) + Principal ${fmtAR(derivedNoLibre.principalPendiente)}
                                </p>
                            ) : (
                                <p className="text-xs text-gray-500 mt-1">
                                    Neto = Total liquidación (${fmtAR(derivedLibre.totalHoy)}) − (Mora del ciclo × % Descuento) = −${fmtAR(derivedLibre.descuentoEnPesos)}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Monto de abono (solo si parcial) */}
                    {tipoPago === 'parcial' && (
                        <div>
                            <label className="block text-sm font-medium">
                                Monto a abonar
                                {!isLibre ? (
                                    <span className="text-gray-500"> — sugerido máx: ${fmtAR(derivedNoLibre.netoTotalConDesc)}</span>
                                ) : (
                                    <span className="text-gray-500"> — interés del ciclo: ${fmtAR(derivedLibre.interesHoy)}</span>
                                )}
                            </label>
                            <Controller
                                name="montoAbono"
                                control={control}
                                rules={{
                                    required: 'Ingresá el monto a abonar',
                                    min: { value: 0.01, message: '> 0' }
                                }}
                                render={({ field }) => (
                                    <input
                                        type="number"
                                        step="0.01"
                                        {...field}
                                        onChange={(e) => field.onChange(e.target.value)}
                                        className={`${inputClass} w-full`}
                                        placeholder="0.00"
                                    />
                                )}
                            />
                            {errors.montoAbono && <p className="text-red-600 text-sm">{errors.montoAbono.message}</p>}
                            {!isLibre ? (
                                <p className="text-xs text-gray-500 mt-1">
                                    Primero se cobra la mora del día (${fmtAR(derivedNoLibre.moraAcum)}); el resto va a principal.
                                </p>
                            ) : (
                                <p className="text-xs text-gray-500 mt-1">
                                    En LIBRE no hay mora “por cuota”. Primero se cobra el interés del ciclo y el excedente amortiza capital.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Forma de pago */}
                    <div>
                        <label className="block text-sm font-medium">Forma de pago</label>
                        <Controller
                            name="formaId"
                            control={control}
                            rules={{ required: 'Requerido' }}
                            render={({ field }) => (
                                <select {...field} className={`${inputClass} w-full`}>
                                    <option value="">Seleccionar...</option>
                                    {formas.map((f) => (
                                        <option key={f.id} value={f.id}>{f.nombre}</option>
                                    ))}
                                </select>
                            )}
                        />
                        {errors.formaId && <p className="text-red-600 text-sm">{errors.formaId.message}</p>}
                    </div>

                    {/* Observación */}
                    <div>
                        <label className="block text-sm font-medium">Observación</label>
                        <Controller
                            name="observacion"
                            control={control}
                            render={({ field }) => (
                                <textarea {...field} rows={2} className={`${inputClass} w-full`} placeholder="Opcional" />
                            )}
                        />
                    </div>

                    {/* Botones */}
                    <div className="flex justify-end gap-3 pt-2 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Registrando...' : (tipoPago === 'total' ? 'Registrar Pago Total' : 'Registrar Abono')}
                        </button>
                    </div>
                </form>
            </div>
        </section>
    );
};

export default CuotaModal;

