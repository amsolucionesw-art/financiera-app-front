// src/components/creditos/modals/RefinanciarCreditoModal.jsx
import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";

import { previewRefinanciacion, refinanciarCreditoSeguro } from "../../../services/creditoService";

import { money, safeLower } from "../../../utils/creditos/creditosHelpers.js";

const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const RefinanciarCreditoModal = ({ open, onClose, credito, onSuccess, esSuperAdmin, resumenLibre }) => {
    const [opcion, setOpcion] = useState("P1"); // 'P1' | 'P2' | 'manual'
    const [tasaManual, setTasaManual] = useState("");
    const [tipo, setTipo] = useState(credito?.tipo_credito || "mensual");
    const [cuotas, setCuotas] = useState(credito?.cantidad_cuotas || 1);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const puedeUsarManual = !!esSuperAdmin;

    // ¿Es un crédito LIBRE?
    const esLibreRefi = safeLower(credito?.modalidad_credito) === "libre";

    // Mantener defaults coherentes si cambia el crédito o se reabre el modal
    useEffect(() => {
        if (!open) return;
        setTipo(credito?.tipo_credito || "mensual");
        setCuotas(credito?.cantidad_cuotas || 1);
        setError(null);
        setSaving(false);
        // Nota: opción y tasaManual las dejamos como el usuario las eligió (no forzamos reset)
    }, [open, credito?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Mora acumulada a partir de cuotas (informativa / fallback)
    const moraAcumuladaCuotas = (() => {
        if (!Array.isArray(credito?.cuotas)) return 0;
        return +credito.cuotas
            .reduce((acc, q) => acc + toNum(q.intereses_vencidos_acumulados || 0), 0)
            .toFixed(2);
    })();

    // ─────────────────────────────────────────────────────────────
    // Saldo base de refinanciación (alineado al BACK)
    //
    // NO-LIBRE (BACK): calcula desde cuotas activas:
    //   (importe - descuento - pagado) + intereses_vencidos_acumulados
    // fallback: saldo_actual si cuotas no vienen o no hay activas
    //
    // LIBRE (BACK): total HOY del ciclo = capital + interes_hoy + mora_hoy
    // ─────────────────────────────────────────────────────────────

    // ✅ NO-LIBRE: base calculada desde cuotas (igual que back)
    const saldoPendienteNoLibre = (() => {
        const qs = Array.isArray(credito?.cuotas) ? credito.cuotas : [];
        let total = 0;

        for (const q of qs) {
            const estado = safeLower(q?.estado);
            if (!["pendiente", "parcial", "vencida"].includes(estado)) continue;

            const importe = +toNum(q?.importe_cuota || 0).toFixed(2);
            const desc = +toNum(q?.descuento_cuota || 0).toFixed(2);
            const pagado = +toNum(q?.monto_pagado_acumulado || 0).toFixed(2);

            const principalPend = +Math.max(importe - desc - pagado, 0).toFixed(2);
            const mora = +toNum(q?.intereses_vencidos_acumulados || 0).toFixed(2);

            total = +(total + principalPend + mora).toFixed(2);
        }

        // fallback: saldo_actual si por alguna razón no hay cuotas activas
        if (total > 0) return total;

        return +toNum(credito?.saldo_actual || 0).toFixed(2);
    })();

    // LIBRE: capital / interés hoy / mora hoy (para UI)
    const capitalLibre = toNum(resumenLibre?.saldo_capital ?? credito?.saldo_actual ?? 0);

    const interesLibreHoy = toNum(
        resumenLibre?.interes_ciclo_hoy ??
            resumenLibre?.interes_pendiente_hoy ??
            resumenLibre?.interes_hoy ??
            0
    );

    const moraLibreHoy = toNum(
        resumenLibre?.mora_ciclo_hoy ??
            resumenLibre?.mora_pendiente_hoy ??
            resumenLibre?.mora_hoy ??
            0
    );

    // Total HOY LIBRE (alias robusto)
    const totalLibreHoy = toNum(
        resumenLibre?.total_actual ??
            resumenLibre?.total_liquidacion_hoy ??
            resumenLibre?.total_a_cancelar_hoy ??
            resumenLibre?.total_pagar_hoy ??
            (capitalLibre + interesLibreHoy + moraLibreHoy)
    );

    // Saldo base final usado en preview + submit (debe coincidir con back)
    const saldoBaseRefi = esLibreRefi ? +totalLibreHoy.toFixed(2) : +saldoPendienteNoLibre.toFixed(2);

    if (!open) return null;

    const preview = (() => {
        try {
            return previewRefinanciacion({
                saldo: saldoBaseRefi,
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

            if (opcion === "manual" && !puedeUsarManual) {
                setError("No tenés permisos para utilizar la opción de tasa manual (P3).");
                setSaving(false);
                return;
            }

            if (opcion === "manual") {
                const t = Number(String(tasaManual).replace(",", ".")) || 0;
                if (t < 0) {
                    setError("La tasa manual debe ser ≥ 0");
                    setSaving(false);
                    return;
                }
            }

            // ⬇️ Ejecutamos la refinanciación contra el backend
            await refinanciarCreditoSeguro(credito, {
                opcion,
                tasaManual: opcion === "manual" ? Number(String(tasaManual).replace(",", ".")) : undefined,
                tipo_credito: tipo,
                cantidad_cuotas: Number(cuotas)
            });

            await Swal.fire({
                title: "Crédito refinanciado",
                html: `<p style="margin-bottom:4px;">El crédito #${credito?.id} fue refinanciado correctamente.</p>
                        <p style="font-size:12px;color:#555;">Se creó un nuevo crédito en <b>PLAN DE CUOTAS FIJAS</b> con las condiciones seleccionadas.</p>`,
                icon: "success",
                confirmButtonText: "Aceptar"
            });

            onSuccess?.();
            onClose?.();
        } catch (e2) {
            setError(e2?.message || "No se pudo refinanciar el crédito.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4">
            <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl">
                <header className="flex items-center justify-between border-b px-5 py-4">
                    <h4 className="text-base sm:text-lg font-semibold">Refinanciar crédito #{credito?.id}</h4>
                    <button
                        onClick={onClose}
                        className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                    >
                        Cerrar
                    </button>
                </header>

                <form onSubmit={submitRefi} className="px-5 py-4 space-y-4">
                    {/* Preview */}
                    <div className="text-sm text-gray-700">
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-2">
                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">
                                    {esLibreRefi ? "Capital (LIBRE hoy)" : "Saldo pendiente (base)"}
                                </div>
                                <div className="font-semibold">
                                    ${money(esLibreRefi ? capitalLibre : saldoPendienteNoLibre)}
                                </div>
                            </div>

                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">
                                    {esLibreRefi ? "Mora (hoy)" : "Mora acumulada (info)"}
                                </div>
                                <div className="font-semibold">
                                    ${money(esLibreRefi ? moraLibreHoy : moraAcumuladaCuotas)}
                                </div>
                            </div>

                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">Saldo base refi</div>
                                <div className="font-semibold">${money(saldoBaseRefi)}</div>
                            </div>

                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">Tasa mensual</div>
                                <div className="font-semibold">{preview ? `${preview.tasa_mensual}%` : "—"}</div>
                            </div>

                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">Monto nuevo</div>
                                <div className="font-semibold">${money(preview?.total_a_devolver || 0)}</div>
                            </div>
                        </div>

                        {esLibreRefi && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2 text-xs">
                                <div className="rounded bg-white border p-2">
                                    <div className="text-gray-600">Interés (hoy)</div>
                                    <div className="font-semibold">${money(interesLibreHoy)}</div>
                                </div>
                                <div className="rounded bg-white border p-2">
                                    <div className="text-gray-600">Mora (hoy)</div>
                                    <div className="font-semibold">${money(moraLibreHoy)}</div>
                                </div>
                                <div className="rounded bg-white border p-2">
                                    <div className="text-gray-600">Total HOY</div>
                                    <div className="font-semibold">${money(totalLibreHoy)}</div>
                                </div>
                            </div>
                        )}

                        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                            Se creará un <b>nuevo crédito (PLAN DE CUOTAS FIJAS)</b> con estas condiciones y el crédito #{credito?.id} quedará marcado como{" "}
                            <b>refinanciado</b>.
                        </div>
                    </div>

                    <fieldset className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label
                            className={`flex items-center gap-2 rounded-md border p-3 ${
                                opcion === "P1" ? "border-emerald-500 bg-emerald-50" : "border-gray-200"
                            }`}
                        >
                            <input
                                type="radio"
                                name="opcion"
                                className="accent-emerald-600"
                                checked={opcion === "P1"}
                                onChange={() => setOpcion("P1")}
                            />
                            <span className="text-sm font-medium">P1 (25% mensual)</span>
                        </label>

                        <label
                            className={`flex items-center gap-2 rounded-md border p-3 ${
                                opcion === "P2" ? "border-emerald-500 bg-emerald-50" : "border-gray-200"
                            }`}
                        >
                            <input
                                type="radio"
                                name="opcion"
                                className="accent-emerald-600"
                                checked={opcion === "P2"}
                                onChange={() => setOpcion("P2")}
                            />
                            <span className="text-sm font-medium">P2 (15% mensual)</span>
                        </label>

                        {puedeUsarManual && (
                            <label
                                className={`flex items-center gap-2 rounded-md border p-3 ${
                                    opcion === "manual" ? "border-emerald-500 bg-emerald-50" : "border-gray-200"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="opcion"
                                    className="accent-emerald-600"
                                    checked={opcion === "manual"}
                                    onChange={() => setOpcion("manual")}
                                />
                                <span className="text-sm font-medium">P3 Manual (% mensual)</span>
                            </label>
                        )}
                    </fieldset>

                    {opcion === "manual" && puedeUsarManual && (
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
                            <div className="mt-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                                <div className="rounded bg-gray-50 border p-2">
                                    <div className="text-gray-600">Tasa por período</div>
                                    <div className="font-semibold">{preview.tasa_por_periodo}%</div>
                                </div>
                                <div className="rounded bg-gray-50 border p-2">
                                    <div className="text-gray-600">Cuotas</div>
                                    <div className="font-semibold">{preview.cantidad_cuotas}</div>
                                </div>
                                <div className="rounded bg-gray-50 border p-2">
                                    <div className="text-gray-600">Interés total</div>
                                    <div className="font-semibold">
                                        {(toNum(preview.tasa_por_periodo) * toNum(preview.cantidad_cuotas)).toFixed(2)}%
                                    </div>
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
                            {saving ? "Procesando…" : "Refinanciar crédito"}
                        </button>
                    </div>
                </form>
            </div>
        </section>
    );
};

export default RefinanciarCreditoModal;