// src/components/CreditForm.jsx
import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { jwtDecode } from 'jwt-decode';
import { X, CheckCircle2 } from 'lucide-react';

/* Helpers */
const periodLen = (tipo) => {
    switch (tipo) {
        case 'semanal': return 4;
        case 'quincenal': return 2;
        case 'mensual': return 1;
        default: return null; // evita asumir tipo si no está definido
    }
};

/** Interés proporcional con mínimo 60%
 * Plan de Cuotas Fijas (antes "común") / progresivo:
 * semanal:   60% * (semanas / 4)
 * quincenal: 60% * (quincenas / 2)
 * mensual:   60% * (meses / 1)
 * Si falta tipo/cuotas → 0.
 */
const interesProporcionalMin60 = (tipo, n) => {
    const cuotas = Number(n) || 0;
    const pl = periodLen(tipo || '');
    if (!pl || cuotas <= 0) return 0;
    const pct = 60 * (cuotas / pl);
    return Math.max(60, pct);
};

const sanitizeMonto = (val) => {
    if (val === null || val === undefined) return 0;
    // quita separadores de miles y convierte coma por punto
    const num = String(val).replace(/\./g, '').replace(',', '.');
    const n = Number(num);
    return Number.isFinite(n) ? n : 0;
};

const clamp = (n, min, max) => Math.min(Math.max(Number(n) || 0, min), max);

const fmtMoneyAR = (n) =>
    (Number(n) || 0).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

const CreditForm = ({
    defaultValues = {},
    cobradores = [],
    onCancel,
    onSubmit,
    submitting,
    mostrarCobrador = true // ⟵ permite ocultar el campo de cobrador si ya se eligió afuera
}) => {
    const token = localStorage.getItem('token');
    const decoded = token ? jwtDecode(token) : {};
    const rol_id = decoded?.rol_id ?? null;
    const esSuperAdmin = rol_id === 0;

    const {
        register,
        handleSubmit,
        control,
        setValue,
        watch,
        getValues,
        formState: { errors }
    } = useForm({
        defaultValues: {
            cobrador_id: '',
            monto_acreditar: '',
            tipo_credito: '',
            modalidad_credito: defaultValues.modalidad_credito || 'comun', // value 'comun' se mantiene para el backend
            cantidad_cuotas: defaultValues.cantidad_cuotas || '',
            interes: defaultValues.interes || 0, // SIEMPRE solo lectura
            fecha_acreditacion: '',
            fecha_compromiso_pago: '',
            fecha_solicitud: '',
            descuento: '',
            ...defaultValues
        }
    });

    const modalidad_credito = watch('modalidad_credito');
    const tipo_credito = watch('tipo_credito');
    const cantidad_cuotas = watch('cantidad_cuotas');
    const monto_acreditar = watch('monto_acreditar');
    const descuento = watch('descuento');

    const isLibre = modalidad_credito === 'libre';

    // Forzar LIBRE → tipo mensual, 1 cuota, interés 60
    useEffect(() => {
        if (isLibre) {
            if (tipo_credito !== 'mensual') setValue('tipo_credito', 'mensual');
            if (Number(cantidad_cuotas) !== 1) setValue('cantidad_cuotas', 1);
            // interés fijo 60%
            setValue('interes', '60.00');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLibre]);

    // En Plan de Cuotas Fijas / Progresivo recalcular interés automáticamente (proporcional min 60)
    useEffect(() => {
        if (isLibre) return;
        const pct = interesProporcionalMin60(tipo_credito, cantidad_cuotas);
        setValue('interes', pct > 0 ? pct.toFixed(2) : '0.00');
    }, [isLibre, tipo_credito, cantidad_cuotas, setValue]);

    // Autocompletar fechas base si no vienen
    useEffect(() => {
        const hoy = new Date().toISOString().split('T')[0];
        if (!defaultValues.fecha_solicitud) setValue('fecha_solicitud', hoy);
        if (!defaultValues.fecha_compromiso_pago) setValue('fecha_compromiso_pago', hoy);
    }, [defaultValues, setValue]);

    // Derivados para preview
    const derived = useMemo(() => {
        const capital = sanitizeMonto(monto_acreditar);

        if (isLibre) {
            const interesPct = 60; // fijo
            const totalCiclo = capital * (1 + interesPct / 100);
            return {
                interesPct,
                capital,
                totalSinDesc: totalCiclo,
                descPct: 0,
                totalConDesc: totalCiclo,
                valorCuotaProm: 0
            };
        }

        // Plan de Cuotas Fijas / Progresivo
        const interesPct = interesProporcionalMin60(tipo_credito, cantidad_cuotas);
        const totalSinDesc = capital * (1 + interesPct / 100);
        const descPct = esSuperAdmin ? clamp(descuento, 0, 100) : 0;
        const totalConDesc = totalSinDesc * (1 - descPct / 100);
        const cuotasN = Number(cantidad_cuotas) || 0;
        const valorCuotaProm = cuotasN > 0 ? totalConDesc / cuotasN : 0;

        return {
            interesPct,
            capital,
            totalSinDesc,
            descPct,
            totalConDesc,
            valorCuotaProm
        };
    }, [isLibre, tipo_credito, cantidad_cuotas, monto_acreditar, descuento, esSuperAdmin]);

    const inputClass =
        'w-full rounded-md border-gray-300 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-blue-200';

    const formatThousands = (val) =>
        String(val).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    return (
        <form
            onSubmit={handleSubmit(() => {
                // Interés del payload SIEMPRE calculado por el formulario (no editable)
                const vals = getValues();
                const interesOut = isLibre
                    ? 60
                    : interesProporcionalMin60(vals.tipo_credito, vals.cantidad_cuotas);

                const payload = {
                    ...vals,
                    rol_id,
                    monto_acreditar: sanitizeMonto(vals.monto_acreditar),
                    cantidad_cuotas: isLibre ? 1 : (Number(vals.cantidad_cuotas) || 0),
                    tipo_credito: isLibre ? 'mensual' : vals.tipo_credito,
                    interes: interesOut,
                    descuento: !isLibre && esSuperAdmin ? clamp(vals.descuento, 0, 100) : 0
                };
                onSubmit(payload);
            })}
            className="grid grid-cols-1 gap-4 rounded-lg bg-gray-50 p-5 ring-1 ring-gray-100 md:grid-cols-2"
        >
            {/* Cobrador (opcional en UI, pero el valor sigue estando en el form) */}
            {mostrarCobrador && (
                <div>
                    <label className="mb-1 block text-sm">Cobrador</label>
                    <Controller
                        control={control}
                        name="cobrador_id"
                        rules={{ required: 'Requerido' }}
                        render={({ field }) => (
                            <select {...field} className={inputClass}>
                                <option value="">Seleccione cobrador</option>
                                {cobradores.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nombre_completo}
                                    </option>
                                ))}
                            </select>
                        )}
                    />
                    {errors.cobrador_id && (
                        <p className="mt-0.5 text-xs text-red-500">{errors.cobrador_id.message}</p>
                    )}
                </div>
            )}

            {/* Monto a acreditar */}
            <div>
                <label className="mb-1 block text-sm">Monto a acreditar</label>
                <Controller
                    control={control}
                    name="monto_acreditar"
                    rules={{
                        required: 'Requerido',
                        validate: (v) => (sanitizeMonto(v) > 0 ? true : 'Debe ser > 0')
                    }}
                    render={({ field }) => (
                        <input
                            type="text"
                            inputMode="numeric"
                            {...field}
                            onChange={(e) => field.onChange(formatThousands(e.target.value))}
                            className={inputClass}
                            placeholder="0"
                        />
                    )}
                />
                {errors.monto_acreditar && (
                    <p className="mt-0.5 text-xs text-red-500">{errors.monto_acreditar.message}</p>
                )}
            </div>

            {/* Tipo de crédito */}
            <div>
                <label className="mb-1 block text-sm">Tipo de crédito</label>
                <select
                    {...register('tipo_credito', {
                        ...(isLibre ? {} : { required: 'Requerido' }) // no requerido si es LIBRE
                    })}
                    className={inputClass}
                    disabled={isLibre}
                >
                    <option value="">{isLibre ? 'Mensual (forzado en Libre)' : 'Seleccione tipo'}</option>
                    <option value="semanal">Semanal</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                </select>
                {errors.tipo_credito && (
                    <p className="mt-0.5 text-xs text-red-500">{errors.tipo_credito.message}</p>
                )}
            </div>

            {/* Modalidad de crédito (label actualizado) */}
            <div>
                <label className="mb-1 block text-sm">Modalidad de crédito</label>
                <select
                    {...register('modalidad_credito', { required: 'Requerido' })}
                    className={inputClass}
                >
                    {/* value 'comun' se mantiene; el texto visible cambia a Plan de Cuotas Fijas */}
                    <option value="comun">Plan de Cuotas Fijas</option>
                    <option value="progresivo">Progresivo</option>
                    <option value="libre">Libre</option>
                </select>
                {errors.modalidad_credito && (
                    <p className="mt-0.5 text-xs text-red-500">{errors.modalidad_credito.message}</p>
                )}
            </div>

            {/* Cantidad de cuotas (oculta en "libre") */}
            {!isLibre && (
                <div>
                    <label className="mb-1 block text-sm">Cuotas</label>
                    <input
                        type="number"
                        {...register('cantidad_cuotas', {
                            required: 'Requerido',
                            min: { value: 1, message: '>= 1' },
                            max: { value: 120, message: '<= 120' }
                        })}
                        className={inputClass}
                    />
                    {errors.cantidad_cuotas && (
                        <p className="mt-0.5 text-xs text-red-500">{errors.cantidad_cuotas.message}</p>
                    )}
                </div>
            )}

            {/* Interés (SIEMPRE solo lectura) */}
            <div>
                <label className="mb-1 block text-sm">
                    {isLibre
                        ? 'Interés por ciclo (%) (automático)'
                        : 'Interés total (%) (automático)'}
                </label>
                <input
                    type="text"
                    readOnly
                    {...register('interes')}
                    className={`${inputClass} bg-gray-100 cursor-not-allowed`}
                />
                {errors.interes && (
                    <p className="mt-0.5 text-xs text-red-500">{errors.interes.message}</p>
                )}
            </div>

            {/* Descuento (%) – solo superadmin y NO en "libre" */}
            {esSuperAdmin && !isLibre && (
                <div>
                    <label className="mb-1 block text-sm">Descuento (%)</label>
                    <div className="relative">
                        <input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            {...register('descuento', {
                                min: { value: 0, message: '>= 0' },
                                max: { value: 100, message: '<= 100' }
                            })}
                            className={`${inputClass} pr-8`}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                            %
                        </span>
                    </div>
                    {errors.descuento && (
                        <p className="mt-0.5 text-xs text-red-500">{errors.descuento.message}</p>
                    )}
                </div>
            )}

            {/* Fecha de acreditación */}
            <div>
                <label className="mb-1 block text-sm">Fecha de acreditación</label>
                <input
                    type="date"
                    {...register('fecha_acreditacion', { required: 'Requerido' })}
                    className={inputClass}
                />
                {errors.fecha_acreditacion && (
                    <p className="mt-0.5 text-xs text-red-500">{errors.fecha_acreditacion.message}</p>
                )}
            </div>

            {/* Fecha compromiso de pago */}
            <div>
                <label className="mb-1 block text-sm">Fecha compromiso de pago</label>
                <input
                    type="date"
                    {...register('fecha_compromiso_pago', { required: 'Requerido' })}
                    className={inputClass}
                />
                {errors.fecha_compromiso_pago && (
                    <p className="mt-0.5 text-xs text-red-500">{errors.fecha_compromiso_pago.message}</p>
                )}
            </div>

            {/* Fecha de solicitud */}
            <div>
                <label className="mb-1 block text-sm">Fecha de solicitud</label>
                <input
                    type="date"
                    {...register('fecha_solicitud')}
                    className={`${inputClass} ${rol_id !== 0 && rol_id !== 1 ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    readOnly={rol_id !== 0 && rol_id !== 1}
                />
            </div>

            {/* Resumen calculado (preview) */}
            <div className="md:col-span-2 mt-2 rounded-md border border-gray-200 bg-white p-3 text-sm">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div>
                        <span className="text-gray-500">
                            {isLibre ? 'Interés por ciclo aplicado:' : 'Interés total aplicado:'}
                        </span>
                        <div className="font-medium">{fmtMoneyAR(derived.interesPct)}%</div>
                    </div>

                    <div>
                        <span className="text-gray-500">
                            {isLibre
                                ? 'Total del ciclo (capital + interés):'
                                : 'Total a devolver (sin desc.):'}
                        </span>
                        <div className="font-medium">${fmtMoneyAR(derived.totalSinDesc)}</div>
                    </div>

                    <div>
                        <span className="text-gray-500">
                            {isLibre
                                ? 'Total inicial del crédito (Libre):'
                                : derived.descPct
                                    ? `Total a devolver (con desc. ${derived.descPct}%):`
                                    : 'Total a devolver (final):'}
                        </span>
                        <div className="font-semibold">${fmtMoneyAR(derived.totalConDesc)}</div>
                    </div>

                    {!isLibre && (
                        <div className="sm:col-span-3">
                            <span className="text-gray-500">Valor de cuota promedio:</span>{' '}
                            <span className="font-medium">${fmtMoneyAR(derived.valorCuotaProm)}</span>
                            <span className="text-gray-500"> (en modalidad progresiva las cuotas varían)</span>
                        </div>
                    )}
                </div>
                {isLibre && (
                    <p className="mt-2 text-xs text-gray-500">
                        En modalidad <strong>Libre</strong>, se crea una (1) cuota abierta y el interés se evalúa
                        por ciclo sobre el capital pendiente. El descuento al crear <strong>no aplica</strong>;
                        se puede usar al cancelar/pagar si corresponde.
                    </p>
                )}
            </div>

            {/* Botones */}
            <div className="md:col-span-2 flex justify-end gap-3 pt-4">
                <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-4 py-2 text-sm hover:bg-gray-300"
                >
                    <X size={16} /> Cancelar
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-70"
                >
                    <CheckCircle2 size={16} /> {defaultValues.id ? 'Actualizar' : 'Crear'}
                </button>
            </div>
        </form>
    );
};

export default CreditForm;

