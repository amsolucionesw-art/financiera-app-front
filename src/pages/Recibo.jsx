// src/pages/Recibo.jsx

import { useState, useEffect } from 'react';
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

    // Renderiza monto o texto (si ya viene formateado o es "No aplica")
    const renderMonto = (val) => {
        if (val === null || val === undefined) return '-';
        if (typeof val === 'string') return val; // ya viene "$X" o "No aplica"
        return `$${fmt(val)}`;
    };

    // Aplica "No aplica" a rubros seleccionados cuando el valor numérico es 0
    const noAplicaRule = (num) => (toNumber(num) === 0 ? 'No aplica' : `$${fmt(num)}`);

    // Construye un objeto UI a partir del recibo crudo si el back no envió recibo_ui
    const buildFallbackUI = (r) => {
        if (!r) return null;
        return {
            // Cabecera
            numero_recibo: r.numero_recibo ?? null,
            fecha: r.fecha ?? '',
            hora: r.hora ?? '',
            cliente: r.cliente_nombre ?? '',
            cobrador: r.nombre_cobrador ?? '',
            medio_pago: r.medio_pago ?? '',
            concepto: r.concepto ?? '',

            // Montos principales
            monto_pagado: `$${fmt(r.monto_pagado)}`,
            pago_a_cuenta: `$${fmt(r.pago_a_cuenta ?? r.monto_pagado)}`,

            // Saldos de cuota (regla: saldo_actual 0 se muestra $0,00)
            saldo_anterior: `$${fmt(r.saldo_cuota_anterior ?? r.saldo_anterior)}`,
            saldo_actual: `$${fmt(r.saldo_cuota_actual ?? r.saldo_actual)}`,

            // Desglose (con "No aplica" cuando 0)
            importe_cuota_original: `$${fmt(r.importe_cuota_original ?? 0)}`,
            descuento_aplicado:
                noAplicaRule(r.descuento_aplicado ?? 0),
            mora_cobrada:
                noAplicaRule(r.mora_cobrada ?? 0),
            principal_pagado: `$${fmt(r.principal_pagado ?? 0)}`,
            interes_ciclo_cobrado:
                noAplicaRule(r.interes_ciclo_cobrado ?? 0),

            // Saldos del crédito
            saldo_credito_anterior:
                r.saldo_credito_anterior !== undefined ? `$${fmt(r.saldo_credito_anterior)}` : undefined,
            saldo_credito_actual:
                r.saldo_credito_actual !== undefined ? `$${fmt(r.saldo_credito_actual)}` : undefined
        };
    };

    useEffect(() => {
        (async () => {
            try {
                const data = await obtenerReciboPorId(id);
                setRecibo(data);
            } catch (err) {
                setError(err?.message || 'Error al cargar recibo');
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    if (loading) return <p>Cargando recibo...</p>;
    if (error) return <p className="text-red-500">Error: {error}</p>;
    if (!recibo) return <p>No se encontró el recibo.</p>;

    // Preferimos el objeto de presentación del back si existe; si no, construimos uno equivalente
    const ui = recibo.recibo_ui || buildFallbackUI(recibo);

    const rutaCreditosCliente = `/creditos/cliente/${recibo.cliente_id}`;

    // Detección suave de "libre"
    const esLibre =
        Object.prototype.hasOwnProperty.call(recibo, 'interes_ciclo_cobrado') ||
        /LIBRE/i.test(recibo?.concepto || '');

    // Flags para bloques condicionales
    const tieneDesglose =
        ui.importe_cuota_original !== undefined ||
        ui.descuento_aplicado !== undefined ||
        ui.mora_cobrada !== undefined ||
        ui.principal_pagado !== undefined ||
        ui.interes_ciclo_cobrado !== undefined;

    const tieneSaldosCredito =
        ui.saldo_credito_anterior !== undefined ||
        ui.saldo_credito_actual !== undefined;

    return (
        <section className="mx-auto max-w-2xl p-6 bg-white rounded shadow recibo-print print:shadow-none print:rounded-none">
            {/* LOGO CENTRADO */}
            <div className="flex justify-center mb-4">
                <img
                    src="/logosye.png"
                    alt="Logo de la empresa"
                    className="h-20 object-contain print:mt-4"
                    style={{ margin: '0 auto', display: 'block' }}
                />
            </div>

            <h1 className="text-2xl font-bold mb-1 text-center">
                Recibo #{ui.numero_recibo ?? recibo.numero_recibo}
            </h1>

            {/* Datos principales */}
            <div className="space-y-2 text-sm">
                <p>
                    <strong>Fecha:</strong> {ui.fecha || recibo.fecha}
                </p>
                <p>
                    <strong>Hora:</strong> {ui.hora || recibo.hora}
                </p>
                <p>
                    <strong>Recibimos de:</strong> {ui.cliente || recibo.cliente_nombre}
                </p>
                <p>
                    <strong>Cantidad de:</strong>{' '}
                    {renderMonto(ui.monto_pagado ?? recibo.monto_pagado)}
                </p>
                <p>
                    <strong>En concepto de:</strong> {ui.concepto || recibo.concepto}
                </p>
            </div>

            {/* Saldos de la cuota */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded border p-3 bg-gray-50">
                    <p className="text-gray-600 font-medium">
                        {esLibre ? 'Total del ciclo (antes)' : 'Saldo anterior (cuota)'}
                    </p>
                    <p className="mt-1 font-semibold">
                        {renderMonto(ui.saldo_anterior ?? (recibo.saldo_cuota_anterior ?? recibo.saldo_anterior))}
                    </p>
                </div>
                <div className="rounded border p-3 bg-gray-50">
                    <p className="text-gray-600 font-medium">Pago a cuenta</p>
                    <p className="mt-1 font-semibold">
                        {renderMonto(ui.pago_a_cuenta ?? recibo.pago_a_cuenta)}
                    </p>
                </div>
                <div className="rounded border p-3 bg-gray-50">
                    <p className="text-gray-600 font-medium">
                        {esLibre ? 'Total del ciclo (después)' : 'Saldo actual (cuota)'}
                    </p>
                    <p className="mt-1 font-semibold">
                        {renderMonto(ui.saldo_actual ?? (recibo.saldo_cuota_actual ?? recibo.saldo_actual))}
                    </p>
                </div>
            </div>

            {/* Desglose del pago */}
            {tieneDesglose && (
                <div className="mt-6">
                    <h2 className="text-base font-semibold mb-2">Desglose del pago</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {ui.importe_cuota_original !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Importe cuota original</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.importe_cuota_original)}
                                </p>
                            </div>
                        )}
                        {ui.descuento_aplicado !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Descuento aplicado</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.descuento_aplicado)}
                                </p>
                            </div>
                        )}
                        {ui.mora_cobrada !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Mora cobrada</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.mora_cobrada)}
                                </p>
                            </div>
                        )}
                        {ui.principal_pagado !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Capital pagado</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.principal_pagado)}
                                </p>
                            </div>
                        )}
                        {ui.interes_ciclo_cobrado !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">
                                    Interés de ciclo cobrado {esLibre ? '(LIBRE)' : ''}
                                </p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.interes_ciclo_cobrado)}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Capital del crédito (opcional) */}
            {tieneSaldosCredito && (
                <div className="mt-6">
                    <h2 className="text-base font-semibold mb-2">Capital del crédito</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {ui.saldo_credito_anterior !== undefined && (
                            <div className="rounded border p-3 bg-white">
                                <p className="text-gray-600">Capital anterior</p>
                                <p className="mt-1 font-semibold">
                                    {renderMonto(ui.saldo_credito_anterior)}
                                </p>
                            </div>
                        )}
                        {ui.saldo_credito_actual !== undefined && (
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
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded border p-3 bg-gray-50">
                    <p className="text-gray-600">Cobrador</p>
                    <p className="mt-1 font-semibold">
                        {ui.cobrador || recibo.nombre_cobrador}
                    </p>
                </div>
                <div className="rounded border p-3 bg-gray-50">
                    <p className="text-gray-600">Medio de pago</p>
                    <p className="mt-1 font-semibold">
                        {ui.medio_pago || recibo.medio_pago}
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
                <Link to={rutaCreditosCliente} className="text-sm text-blue-500 hover:underline">
                    ← Volver a créditos
                </Link>
            </div>
        </section>
    );
};

export default Recibo;