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

    const fmt = (n) =>
        Number(n || 0).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    // 🔵 Renderiza monto o texto, robusto para strings numéricas o ya formateadas
    const renderMonto = (val) => {
        if (val === null || val === undefined) return '-';

        // Si es string, contemplar casos: "No aplica", ya formateado con "$", o string numérico
        if (typeof val === 'string') {
            const s = val.trim();

            // "No aplica" tal cual
            if (s.toLowerCase() === 'no aplica') return 'No aplica';

            // Si ya viene con símbolo de moneda, respetamos (viene del back formateado)
            if (s.includes('$')) return s;

            // Si es string numérica, la formateamos
            const numeric = Number(s.replace(/[^\d.-]/g, ''));
            if (Number.isFinite(numeric)) return `$${fmt(numeric)}`;

            // Otro texto, lo mostramos tal cual
            return s;
        }

        // Si es número, formateamos normalmente
        return `$${fmt(val)}`;
    };

    // Aplica "No aplica" a rubros seleccionados cuando el valor numérico es 0
    const noAplicaRule = (num) => (toNumber(num) === 0 ? 'No aplica' : `$${fmt(num)}`);

    // Etiqueta visible de modalidad (solo display)
    const modalidadLabel = (mod = '') => {
        const m = String(mod || '').toLowerCase();
        if (m === 'comun') return 'Plan de Cuotas Fijas';
        if (m === 'progresivo') return 'Progresivo';
        if (m === 'libre') return 'Libre';
        return mod || '—';
    };

    // Construye un objeto UI a partir del recibo crudo si el back no envió recibo_ui
    const buildFallbackUI = (r) => {
        if (!r) return null;

        // Primero, si el back trae saldo_mora crudo, úsalo:
        const saldoMoraRaw =
            r.saldo_mora !== undefined && r.saldo_mora !== null ? r.saldo_mora : undefined;

        // Si no hay crudo, calculamos con lo disponible:
        const moraPendAntes =
            toNumber(r.mora_pendiente_antes ?? r.mora_pendiente ?? r.mora_anterior ?? 0);
        const moraCobrada = toNumber(r.mora_cobrada ?? 0);
        const saldoMoraCalc = Math.max(moraPendAntes - moraCobrada, 0);

        return {
            // Cabecera
            numero_recibo: r.numero_recibo ?? null,
            fecha: r.fecha ?? '',
            hora: r.hora ?? '',
            cliente: r.cliente_nombre ?? '',
            cobrador: r.nombre_cobrador ?? '',
            medio_pago: r.medio_pago ?? '',
            concepto: r.concepto ?? '',
            modalidad_credito: r.modalidad_credito, // si viene, lo mostramos

            // Montos principales
            monto_pagado: `$${fmt(r.monto_pagado)}`,
            pago_a_cuenta: `$${fmt(r.pago_a_cuenta ?? r.monto_pagado)}`,

            // Saldos de cuota
            saldo_anterior: `$${fmt(r.saldo_cuota_anterior ?? r.saldo_anterior)}`,
            saldo_actual: `$${fmt(r.saldo_cuota_actual ?? r.saldo_actual)}`,

            // Desglose
            importe_cuota_original: `$${fmt(r.importe_cuota_original ?? 0)}`,
            descuento_aplicado: noAplicaRule(r.descuento_aplicado ?? 0),
            mora_cobrada: noAplicaRule(r.mora_cobrada ?? 0),

            // Saldo de mora: usa crudo si viene; si no, fallback calculado
            saldo_mora:
                saldoMoraRaw !== undefined
                    ? (typeof saldoMoraRaw === 'string' ? saldoMoraRaw : `$${fmt(saldoMoraRaw)}`)
                    : noAplicaRule(saldoMoraCalc),

            // Solo útiles en LIBRE (si existieran)
            principal_pagado: `$${fmt(r.principal_pagado ?? 0)}`,
            interes_ciclo_cobrado: noAplicaRule(r.interes_ciclo_cobrado ?? 0),

            // Saldos del crédito (solo útiles en LIBRE)
            saldo_credito_anterior:
                r.saldo_credito_anterior !== undefined ? `$${fmt(r.saldo_credito_anterior)}` : undefined,
            saldo_credito_actual:
                r.saldo_credito_actual !== undefined ? `$${fmt(r.saldo_credito_actual)}` : undefined
        };
    };

    useEffect(() => {
        (async () => {
            try {
                // Soportar apiFetch que devuelva {success, data} o data "plano"
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

    // Preferimos el objeto de presentación del back si existe; si no, construimos uno equivalente.
    // Además, si el back no incluyó saldo_mora, lo calculamos igual acá y lo agregamos.
    const ui = useMemo(() => {
        if (!recibo) return null;
        const base = recibo.recibo_ui || buildFallbackUI(recibo);

        // Si el UI del back no trae saldo_mora:
        if (base && base.saldo_mora === undefined) {
            // 1) Si viene crudo en el recibo (num o string), usamos eso
            if (recibo.saldo_mora !== undefined && recibo.saldo_mora !== null) {
                base.saldo_mora =
                    typeof recibo.saldo_mora === 'string'
                        ? recibo.saldo_mora
                        : `$${fmt(recibo.saldo_mora)}`;
            } else {
                // 2) Si no viene crudo, lo calculamos con los crudos disponibles
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

    if (loading) return <p>Cargando recibo...</p>;
    if (error) return <p className="text-red-500">Error: {error}</p>;
    if (!recibo) return <p>No se encontró el recibo.</p>;

    // ✅ Nueva ruta: prioriza InfoCredito (si tenemos credito_id) y si no, vuelve a ClienteDetalle
    const rutaCredito = recibo?.credito_id
        ? `/creditos/${recibo.credito_id}`
        : `/creditos/cliente/${recibo.cliente_id}`;

    // ✅ Detección robusta de "libre":
    const modalidad = String(ui?.modalidad_credito || recibo?.modalidad_credito || '').toLowerCase();
    const conceptoStr = String(ui?.concepto || recibo?.concepto || '');
    const esLibre = modalidad === 'libre' || /LIBRE/i.test(conceptoStr);

    const modalidadVisible = ui?.modalidad_credito || recibo?.modalidad_credito || null;

    // Para no-libre: importe cuota original, descuento, mora, saldo de mora
    const tieneDesgloseNoLibre =
        ui?.importe_cuota_original !== undefined ||
        ui?.descuento_aplicado !== undefined ||
        ui?.mora_cobrada !== undefined ||
        ui?.saldo_mora !== undefined;

    // Para libre: además capital pagado e interés de ciclo
    const tieneDesgloseLibre =
        ui?.descuento_aplicado !== undefined ||
        ui?.mora_cobrada !== undefined ||
        ui?.interes_ciclo_cobrado !== undefined ||
        ui?.principal_pagado !== undefined ||
        ui?.importe_cuota_original !== undefined ||
        ui?.saldo_mora !== undefined;

    const tieneDesglose = esLibre ? tieneDesgloseLibre : tieneDesgloseNoLibre;

    // Saldos de capital del crédito (solo en LIBRE)
    const tieneSaldosCredito =
        esLibre &&
        (ui?.saldo_credito_anterior !== undefined || ui?.saldo_credito_actual !== undefined);

    // Controla el logo si no carga
    const handleLogoError = (e) => {
        if (e?.currentTarget) e.currentTarget.style.display = 'none';
    };

    return (
        <section className="mx-auto max-w-2xl p-6 bg-white rounded shadow recibo-print print:shadow-none print:rounded-none">
            {/* Estilos de impresión puntuales */}
            <style>{`
                @media print {
                    .print\\:hidden { display: none !important; }
                    .recibo-print { box-shadow: none !important; border: 0 !important; }
                    .no-break { break-inside: avoid; page-break-inside: avoid; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>

            {/* LOGO CENTRADO */}
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

            {/* Modalidad (si existe) */}
            {modalidadVisible && (
                <p className="text-center text-sm text-gray-600 mb-3">
                    Modalidad:{' '}
                    <span className="font-medium">{modalidadLabel(modalidadVisible)}</span>
                </p>
            )}

            {/* Datos principales */}
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
                    {renderMonto(ui?.monto_pagado ?? recibo?.monto_pagado)}
                </p>
                <p>
                    <strong>En concepto de:</strong> {ui?.concepto || recibo?.concepto || '-'}
                </p>
            </div>

            {/* Saldos de la cuota — orden: Saldo anterior, Pago, Saldo total */}
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
                        {renderMonto(ui?.pago_a_cuenta ?? recibo?.pago_a_cuenta)}
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

            {/* Desglose del pago */}
            {tieneDesglose && (
                <div className="mt-6 no-break">
                    <h2 className="text-base font-semibold mb-2">Desglose del pago</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {/* Importe cuota original (si vino del back) */}
                        {ui?.importe_cuota_original !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Importe cuota original</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.importe_cuota_original)}
                                </p>
                            </div>
                        )}

                        {/* Descuento */}
                        {ui?.descuento_aplicado !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Descuento aplicado</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.descuento_aplicado)}
                                </p>
                            </div>
                        )}

                        {/* Mora cobrada */}
                        {ui?.mora_cobrada !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Mora cobrada</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.mora_cobrada)}
                                </p>
                            </div>
                        )}

                        {/* Saldo de mora (restante) */}
                        {ui?.saldo_mora !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Saldo de mora</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.saldo_mora)}
                                </p>
                            </div>
                        )}

                        {/* LIBRE: Capital pagado */}
                        {esLibre && ui?.principal_pagado !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Capital pagado</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.principal_pagado)}
                                </p>
                            </div>
                        )}

                        {/* LIBRE: Interés de ciclo */}
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

            {/* Capital del crédito — SOLO LIBRE */}
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

            {/* Cobrador / Medio de pago */}
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

            {/* Acciones */}
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