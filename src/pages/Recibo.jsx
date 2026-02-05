// src/pages/Recibo.jsx

import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { obtenerReciboPorId } from '../services/reciboService';

const Recibo = () => {
    const { id } = useParams();
    const [recibo, setRecibo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /* ===== Helpers de formateo ===== */
    const toNumber = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    // ✅ Parser robusto de montos (número o string con $ / miles / coma)
    const moneyToNumber = (v) => {
        if (v === null || v === undefined) return 0;

        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;

        if (typeof v === 'string') {
            const s0 = v.trim();
            if (!s0) return 0;
            if (s0.toLowerCase() === 'no aplica') return 0;

            let s = s0.replace(/[^\d.,-]/g, '');

            const hasDot = s.includes('.');
            const hasComma = s.includes(',');

            if (hasDot && hasComma) {
                s = s.replace(/\./g, '').replace(',', '.');
            } else if (hasComma && !hasDot) {
                s = s.replace(',', '.');
            }

            const n = Number(s);
            return Number.isFinite(n) ? n : 0;
        }

        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    const fmt = (n) =>
        Number(n || 0).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    const renderMonto = (val) => {
        if (val === null || val === undefined) return '-';

        if (typeof val === 'string') {
            const s = val.trim();

            if (s.toLowerCase() === 'no aplica') return 'No aplica';
            if (s.includes('$')) return s;

            const numeric = moneyToNumber(s);
            if (Number.isFinite(numeric)) return `$${fmt(numeric)}`;

            return s;
        }

        return `$${fmt(val)}`;
    };

    const noAplicaRule = (num) => (toNumber(num) === 0 ? 'No aplica' : `$${fmt(num)}`);

    const modalidadLabel = (mod = '') => {
        const m = String(mod || '').toLowerCase();
        if (m === 'comun') return 'Plan de Cuotas Fijas';
        if (m === 'progresivo') return 'Progresivo';
        if (m === 'libre') return 'Libre';
        return mod || '—';
    };

    const buildFallbackUI = (r) => {
        if (!r) return null;

        const saldoMoraRaw =
            r.saldo_mora !== undefined && r.saldo_mora !== null ? r.saldo_mora : undefined;

        const moraPendAntes =
            toNumber(r.mora_pendiente_antes ?? r.mora_pendiente ?? r.mora_anterior ?? 0);
        const moraCobrada = toNumber(r.mora_cobrada ?? 0);
        const saldoMoraCalc = Math.max(moraPendAntes - moraCobrada, 0);

        const pagoACuentaNum = moneyToNumber(r.pago_a_cuenta ?? r.monto_pagado);
        const montoPagadoNum = moneyToNumber(r.monto_pagado);

        return {
            numero_recibo: r.numero_recibo ?? null,
            fecha: r.fecha ?? '',
            hora: r.hora ?? '',
            cliente: r.cliente_nombre ?? '',
            cobrador: r.nombre_cobrador ?? '',
            medio_pago: r.medio_pago ?? '',
            concepto: r.concepto ?? '',
            modalidad_credito: r.modalidad_credito,

            monto_pagado: `$${fmt(montoPagadoNum)}`,
            pago_a_cuenta: `$${fmt(pagoACuentaNum)}`,

            saldo_anterior: `$${fmt(r.saldo_cuota_anterior ?? r.saldo_anterior)}`,
            saldo_actual: `$${fmt(r.saldo_cuota_actual ?? r.saldo_actual)}`,

            importe_cuota_original: `$${fmt(r.importe_cuota_original ?? 0)}`,
            descuento_aplicado: noAplicaRule(r.descuento_aplicado ?? 0),
            mora_cobrada: noAplicaRule(r.mora_cobrada ?? 0),

            saldo_mora:
                saldoMoraRaw !== undefined
                    ? (typeof saldoMoraRaw === 'string' ? saldoMoraRaw : `$${fmt(saldoMoraRaw)}`)
                    : noAplicaRule(saldoMoraCalc),

            principal_pagado: `$${fmt(r.principal_pagado ?? 0)}`,
            interes_ciclo_cobrado: noAplicaRule(r.interes_ciclo_cobrado ?? 0),

            saldo_credito_anterior:
                r.saldo_credito_anterior !== undefined ? `$${fmt(r.saldo_credito_anterior)}` : undefined,
            saldo_credito_actual:
                r.saldo_credito_actual !== undefined ? `$${fmt(r.saldo_credito_actual)}` : undefined
        };
    };

    useEffect(() => {
        (async () => {
            try {
                const resp = await obtenerReciboPorId(id);
                const payload =
                    resp && typeof resp === 'object' && 'data' in resp ? resp.data : resp;
                setRecibo(payload);
            } catch (err) {
                setError(err?.message || 'Error al cargar recibo');
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    const ui = useMemo(() => {
        if (!recibo) return null;
        const base = recibo.recibo_ui || buildFallbackUI(recibo);

        if (base && base.saldo_mora === undefined) {
            if (recibo.saldo_mora !== undefined && recibo.saldo_mora !== null) {
                base.saldo_mora =
                    typeof recibo.saldo_mora === 'string'
                        ? recibo.saldo_mora
                        : `$${fmt(recibo.saldo_mora)}`;
            } else {
                const moraPendAntes =
                    toNumber(
                        recibo.mora_pendiente_antes ??
                            recibo.mora_pendiente ??
                            recibo.mora_anterior ??
                            0
                    );
                const moraCobrada = toNumber(recibo.mora_cobrada ?? 0);
                const saldoMoraCalc = Math.max(moraPendAntes - moraCobrada, 0);
                base.saldo_mora = noAplicaRule(saldoMoraCalc);
            }
        }

        return base;
    }, [recibo]); // eslint-disable-line react-hooks/exhaustive-deps

    // ✅ Hook SIEMPRE arriba (no después de returns)
    const cantidadDe = useMemo(() => {
        if (!ui && !recibo) return null;

        const uiPago = ui?.pago_a_cuenta;
        const uiMonto = ui?.monto_pagado;
        const rPago = recibo?.pago_a_cuenta;
        const rMonto = recibo?.monto_pagado;

        const nPago = moneyToNumber(uiPago ?? rPago);
        const nMonto = moneyToNumber(uiMonto ?? rMonto);

        if (nPago > 0 && Math.abs(nPago - nMonto) > 0.009) return uiPago ?? rPago;

        if (uiPago !== undefined && uiPago !== null) return uiPago;
        if (rPago !== undefined && rPago !== null) return rPago;

        return uiMonto ?? rMonto;
    }, [ui, recibo]); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) return <p>Cargando recibo...</p>;
    if (error) return <p className="text-red-500">Error: {error}</p>;
    if (!recibo) return <p>No se encontró el recibo.</p>;

    const rutaCredito = recibo?.credito_id
        ? `/creditos/${recibo.credito_id}`
        : `/creditos/cliente/${recibo.cliente_id}`;

    const modalidad = String(ui?.modalidad_credito || recibo?.modalidad_credito || '').toLowerCase();
    const conceptoStr = String(ui?.concepto || recibo?.concepto || '');
    const esLibre = modalidad === 'libre' || /LIBRE/i.test(conceptoStr);

    const modalidadVisible = ui?.modalidad_credito || recibo?.modalidad_credito || null;

    const tieneDesgloseNoLibre =
        ui?.importe_cuota_original !== undefined ||
        ui?.descuento_aplicado !== undefined ||
        ui?.mora_cobrada !== undefined ||
        ui?.saldo_mora !== undefined;

    const tieneDesgloseLibre =
        ui?.descuento_aplicado !== undefined ||
        ui?.mora_cobrada !== undefined ||
        ui?.interes_ciclo_cobrado !== undefined ||
        ui?.principal_pagado !== undefined ||
        ui?.importe_cuota_original !== undefined ||
        ui?.saldo_mora !== undefined;

    const tieneDesglose = esLibre ? tieneDesgloseLibre : tieneDesgloseNoLibre;

    const tieneSaldosCredito =
        esLibre &&
        (ui?.saldo_credito_anterior !== undefined || ui?.saldo_credito_actual !== undefined);

    const handleLogoError = (e) => {
        if (e?.currentTarget) e.currentTarget.style.display = 'none';
    };

    return (
        <section className="mx-auto max-w-2xl p-6 bg-white rounded shadow recibo-print print:shadow-none print:rounded-none">
            <style>{`
                @media print {
                    .print\\:hidden { display: none !important; }
                    .recibo-print { box-shadow: none !important; border: 0 !important; }
                    .no-break { break-inside: avoid; page-break-inside: avoid; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>

            <div className="flex justify-center mb-4">
                <img
                    src="/logosye.png"
                    alt="Logo de la empresa"
                    className="h-20 object-contain print:mt-4"
                    style={{ margin: '0 auto', display: 'block', maxWidth: 240 }}
                    onError={handleLogoError}
                />
            </div>

            <h1 className="text-2xl font-bold mb-1 text-center">
                Recibo #{ui?.numero_recibo ?? recibo?.numero_recibo}
            </h1>

            {modalidadVisible && (
                <p className="text-center text-sm text-gray-600 mb-3">
                    Modalidad:{' '}
                    <span className="font-medium">{modalidadLabel(modalidadVisible)}</span>
                </p>
            )}

            <div className="space-y-2 text-sm no-break">
                <p>
                    <strong>Fecha:</strong> {ui?.fecha || recibo?.fecha || '-'}
                </p>
                <p>
                    <strong>Hora:</strong> {ui?.hora || recibo?.hora || '-'}
                </p>
                <p>
                    <strong>Recibimos de:</strong> {ui?.cliente || recibo?.cliente_nombre || '-'}
                </p>
                <p>
                    <strong>Cantidad de:</strong>{' '}
                    {renderMonto(cantidadDe)}
                </p>
                <p>
                    <strong>En concepto de:</strong> {ui?.concepto || recibo?.concepto || '-'}
                </p>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm no-break">
                <div className="rounded border p-3 bg-gray-50">
                    <p className="text-gray-600 font-medium">
                        {esLibre ? 'Total del ciclo (antes)' : 'Saldo anterior'}
                    </p>
                    <p className="mt-1 font-semibold">
                        {renderMonto(
                            ui?.saldo_anterior ??
                                (recibo?.saldo_cuota_anterior ?? recibo?.saldo_anterior)
                        )}
                    </p>
                </div>
                <div className="rounded border p-3 bg-gray-50">
                    <p className="text-gray-600 font-medium">Pago</p>
                    <p className="mt-1 font-semibold">
                        {renderMonto(ui?.pago_a_cuenta ?? recibo?.pago_a_cuenta ?? cantidadDe)}
                    </p>
                </div>
                <div className="rounded border p-3 bg-gray-50">
                    <p className="text-gray-600 font-medium">
                        {esLibre ? 'Total del ciclo (después)' : 'Saldo total'}
                    </p>
                    <p className="mt-1 font-semibold">
                        {renderMonto(
                            ui?.saldo_actual ??
                                (recibo?.saldo_cuota_actual ?? recibo?.saldo_actual)
                        )}
                    </p>
                </div>
            </div>

            {tieneDesglose && (
                <div className="mt-6 no-break">
                    <h2 className="text-base font-semibold mb-2">Desglose del pago</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {ui?.importe_cuota_original !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Importe cuota original</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.importe_cuota_original)}
                                </p>
                            </div>
                        )}

                        {ui?.descuento_aplicado !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Descuento aplicado</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.descuento_aplicado)}
                                </p>
                            </div>
                        )}

                        {ui?.mora_cobrada !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Mora cobrada</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.mora_cobrada)}
                                </p>
                            </div>
                        )}

                        {ui?.saldo_mora !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Saldo de mora</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.saldo_mora)}
                                </p>
                            </div>
                        )}

                        {esLibre && ui?.principal_pagado !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Capital pagado</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.principal_pagado)}
                                </p>
                            </div>
                        )}

                        {esLibre && ui?.interes_ciclo_cobrado !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">
                                    Interés de ciclo cobrado (LIBRE)
                                </p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.interes_ciclo_cobrado)}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {tieneSaldosCredito && (
                <div className="mt-6 no-break">
                    <h2 className="text-base font-semibold mb-2">Capital del crédito</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {ui?.saldo_credito_anterior !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Capital anterior</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.saldo_credito_anterior)}
                                </p>
                            </div>
                        )}
                        {ui?.saldo_credito_actual !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Capital actual</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.saldo_credito_actual)}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm no-break">
                <div className="rounded border p-3 bg-gray-50">
                    <p className="text-gray-600">Cobrador</p>
                    <p className="mt-1 font-semibold">
                        {ui?.cobrador || recibo?.nombre_cobrador || '-'}
                    </p>
                </div>
                <div className="rounded border p-3 bg-gray-50">
                    <p className="text-gray-600">Medio de pago</p>
                    <p className="mt-1 font-semibold">
                        {ui?.medio_pago || recibo?.medio_pago || '-'}
                    </p>
                </div>
            </div>

            <button
                onClick={() => window.print()}
                className="mt-6 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 print:hidden"
            >
                Imprimir / Descargar PDF
            </button>

            <div className="mt-4 print:hidden">
                <Link to={rutaCredito} className="text-sm text-blue-500 hover:underline">
                    ← Volver a créditos
                </Link>
            </div>
        </section>
    );
};

export default Recibo;
