// src/components/CancelarCreditoModal.jsx
import { useEffect, useState } from 'react';
import { X, ShieldCheck, Percent, CreditCard } from 'lucide-react';
import Swal from 'sweetalert2';
import { useNavigate } from 'react-router-dom';

import { obtenerFormasDePago } from '../services/cuotaService';
import { cancelarCredito } from '../services/creditoService';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (n, min, max) => Math.min(Math.max(Number(n) || 0, min), max);
const fmtAR = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

const CancelarCreditoModal = ({ credito, onClose, onSuccess }) => {
    const navigate = useNavigate();

    const [formas, setFormas] = useState([]);
    const [formaId, setFormaId] = useState('');
    const [descuentoPct, setDescuentoPct] = useState('');
    const [observacion, setObservacion] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const f = await obtenerFormasDePago();
                setFormas(Array.isArray(f) ? f : []);
            } catch (e) {
                console.error(e);
                Swal.fire('Error', 'No se pudieron cargar las formas de pago.', 'error');
            }
        })();
    }, []);

    // Estimaciones locales
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

    const dPct = clamp(descuentoPct, 0, 100);
    const descuentoMontoEst = round2(principalPendiente * (dPct / 100));
    const totalEstimado = round2((principalPendiente - descuentoMontoEst) + moraAcum);

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validaciones rápidas UI
        if (!formaId) {
            Swal.fire('Atención', 'Seleccioná una forma de pago.', 'warning');
            return;
        }
        if (Number.isNaN(Number(descuentoPct)) || dPct < 0 || dPct > 100) {
            Swal.fire('Atención', 'El descuento debe ser un porcentaje entre 0 y 100.', 'warning');
            return;
        }

        setSubmitting(true);
        try {
            const resp = await cancelarCredito(credito.id, {
                forma_pago_id: Number(formaId),
                descuento_porcentaje: Number(dPct),
                observacion
            });

            // Soporta respuestas {recibo} o {data:{recibo}}
            const recibo = resp?.recibo ?? resp?.data?.recibo;
            const numero = recibo?.numero_recibo;

            await Swal.fire('¡Crédito cancelado!', 'Se generó el pago y el recibo resumen.', 'success');

            onClose?.();
            onSuccess?.();

            if (numero) {
                navigate(`/recibo/${numero}`);
            }
        } catch (e) {
            console.error(e);
            Swal.fire('Error', e?.message || 'No se pudo cancelar el crédito', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const inputClass =
        'mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500';

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
                        <dt className="text-gray-600">Total estimado a pagar</dt>
                        <dd className="mt-0.5 font-medium">
                            ${fmtAR(totalEstimado)}{' '}
                            <span className="text-xs text-gray-500">
                                (el descuento aplica solo a principal; la mora del día se recalcula en servidor)
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
                            Descuento (sobre principal)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={descuentoPct}
                            onChange={(e) => setDescuentoPct(e.target.value)}
                            className={inputClass}
                            placeholder="0"
                            inputMode="decimal"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Máx: 100%. Aplicado proporcionalmente al principal de cada cuota.
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
