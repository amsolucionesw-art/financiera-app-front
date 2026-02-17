// src/components/creditos/modals/PagoLibreModal.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import Swal from "sweetalert2";

import { obtenerRecibosPorCredito } from "../../../services/reciboService";
import { registrarPagoParcial, pagarCuota, obtenerFormasDePago } from "../../../services/cuotaService";

import { obtenerResumenLibreNormalizado, invalidarResumenLibreCache } from "../../../services/creditoService";

import { money, cicloActualDesde, safeLower } from "../../../utils/creditos/creditosHelpers.js";

/* ───────────────── Modal de Pago para Créditos LIBRE ───────────────── */
const PagoLibreModal = ({ open, onClose, credito, cuotaLibreId, modoInicial = "parcial", onSuccess, resumenLibre }) => {
    const navigate = useNavigate();

    // Permisos (desde token)
    const token = localStorage.getItem("token");
    const decoded = token ? jwtDecode(token) : {};
    const rol_id = decoded?.rol_id ?? null;

    const esSuperAdmin = rol_id === 0;
    const esAdmin = rol_id === 1;
    const puedeImpactarPagos = esSuperAdmin || esAdmin; // solo superadmin/admin

    // ✅ Descuentos (alineado al BACK):
    // - Admin: SÍ (solo mora)
    // - Superadmin: SÍ (mora e interés)
    const puedeDescontarMora = esSuperAdmin || esAdmin;
    const puedeDescontarInteres = esSuperAdmin;

    const [modo, setModo] = useState(modoInicial); // 'parcial' | 'total'
    const [formas, setFormas] = useState([]);
    const [loadingFormas, setLoadingFormas] = useState(false);

    const [formaPagoId, setFormaPagoId] = useState("");
    const [monto, setMonto] = useState(""); // solo en parcial

    // ✅ descuentos % (aplican en PARCIAL y TOTAL)
    const [descuentoMoraPct, setDescuentoMoraPct] = useState(""); // % sobre mora
    const [descuentoInteresPct, setDescuentoInteresPct] = useState(""); // % sobre interés

    const [observacion, setObservacion] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // ✅ Resumen local: arranca con el prop, pero lo refrescamos forzado al abrir
    const [resumenLocal, setResumenLocal] = useState(resumenLibre ?? null);
    const [loadingResumen, setLoadingResumen] = useState(false);

    const toNumber = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    const toPct = (raw) => {
        const n = Number(String(raw ?? "").replace(",", "."));
        if (!Number.isFinite(n)) return 0;
        return Math.min(100, Math.max(0, n));
    };

    const buildScope = (pctM, pctI) => {
        const m = Number(pctM) > 0;
        const i = Number(pctI) > 0;
        if (m && i) return "total";
        if (i) return "interes";
        if (m) return "mora";
        return "mora";
    };

    // ✅ Normaliza payload para onSuccess (InfoCreditos soporta varios formatos)
    const buildOnSuccessPayload = ({ resp, creditoId }) => {
        const raw = resp?.data ?? resp ?? null;
        const credito_ui = raw?.credito_ui ?? raw?.credito ?? null;
        const resumen_libre = raw?.resumen_libre ?? raw?.resumenLibre ?? null;

        if (credito_ui || resumen_libre) {
            return {
                creditoId: creditoId ?? credito_ui?.id ?? null,
                credito_ui,
                resumen_libre,
                recibo: raw?.recibo ?? null,
                numero_recibo:
                    raw?.numero_recibo ??
                    raw?.recibo?.numero_recibo ??
                    null
            };
        }

        return creditoId ?? null;
    };

    // ✅ Estado y bloqueos por estado (alineado al back)
    const estadoLower = safeLower(credito?.estado);
    const bloqueadoPorEstado = ["anulado", "refinanciado", "pagado"].includes(estadoLower);

    const motivoBloqueo = (() => {
        if (estadoLower === "anulado") return "Crédito anulado: no se permiten pagos.";
        if (estadoLower === "refinanciado") return "Crédito refinanciado: los pagos deben hacerse sobre el crédito nuevo.";
        if (estadoLower === "pagado") return "Crédito pagado: no se permiten pagos.";
        return null;
    })();

    // ✅ Misma ancla que la card: fecha_compromiso_pago (si existe) si no acreditación
    const anchorLibre = credito?.fecha_compromiso_pago || credito?.fecha_acreditacion;

    // ───────────────────────────────
    // Resumen vigente a usar en UI/cálculo
    // ───────────────────────────────
    const resumenVigente = resumenLocal ?? resumenLibre ?? null;

    // ✅ Ciclo: fuente de verdad = resumenVigente. Fallback: helper nuevo con objeto crédito
    const ciclo = (() => {
        const raw = resumenVigente?.ciclo_actual ?? resumenVigente?.ciclo ?? null;

        const fallback = () => {
            if (credito && typeof credito === "object") return cicloActualDesde(credito);
            return cicloActualDesde(anchorLibre, credito?.tipo_credito);
        };

        if (raw === null || raw === undefined) return fallback();

        if (typeof raw === "string") {
            const s = raw.trim();
            const first = s.includes("/") ? s.split("/")[0] : s;
            const n = Number(first);
            return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback();
        }

        const n = toNumber(raw);
        return n > 0 ? Math.trunc(n) : fallback();
    })();

    const parcialBloqueado = ciclo >= 3; // 3er ciclo => sin abonos parciales

    // ✅ Datos base desde resumen NORMALIZADO (y compat con viejos nombres)
    const capitalHoy = toNumber(resumenVigente?.saldo_capital ?? credito?.saldo_actual ?? 0);

    // HOY (ciclo actual) — informativo
    const interesHoy = toNumber(
        resumenVigente?.interes_ciclo_hoy ??
            resumenVigente?.interes_pendiente_hoy ??
            resumenVigente?.interes_hoy ??
            0
    );

    const moraHoy = toNumber(
        resumenVigente?.mora_ciclo_hoy ??
            resumenVigente?.mora_pendiente_hoy ??
            resumenVigente?.mora_hoy ??
            0
    );

    // ✅ TOTALES pendientes acumulados (1..ciclo_actual) — fuente correcta para liquidación
    const interesTotalPendiente = toNumber(
        resumenVigente?.interes_pendiente_total ??
            resumenVigente?.interes_total ??
            resumenVigente?.interes_pendiente ??
            interesHoy ??
            0
    );

    const moraTotalPendiente = toNumber(
        resumenVigente?.mora_pendiente_total ??
            resumenVigente?.mora_total ??
            resumenVigente?.mora_pendiente ??
            moraHoy ??
            0
    );

    // ✅ Total de liquidación: TOTAL ACTUAL (capital + interes_total + mora_total)
    const totalLiquidacionHoy = toNumber(
        resumenVigente?.total_actual ??
            resumenVigente?.total_liquidacion_hoy ??
            (capitalHoy + interesTotalPendiente + moraTotalPendiente)
    );

    // === Preview dinámico de descuentos (TOTAL y también PARCIAL para que el user vea qué está seteando) ===
    const pctMora = puedeDescontarMora ? toPct(descuentoMoraPct) : 0;
    const pctInteres = puedeDescontarInteres ? toPct(descuentoInteresPct) : 0;

    // ✅ Descuento sobre MORA e INTERÉS TOTALES pendientes (preview)
    const descuentoMoraPesos = (moraTotalPendiente * pctMora) / 100;
    const descuentoInteresPesos = (interesTotalPendiente * pctInteres) / 100;

    const totalConDescuento = Math.max(0, totalLiquidacionHoy - descuentoMoraPesos - descuentoInteresPesos);

    // ── Helpers de navegación/recibo (locales al modal)
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const numeroDesdeResponse = (resp) =>
        resp?.numero_recibo ??
        resp?.data?.numero_recibo ??
        resp?.recibo?.numero_recibo ??
        resp?.data?.recibo?.numero_recibo ??
        null;

    const ordenarRecibos = (lista = []) =>
        [...lista].sort((a, b) => {
            const na = Number(a?.numero_recibo || 0);
            const nb = Number(b?.numero_recibo || 0);
            if (nb !== na) return nb - na;
            const fa = `${a?.fecha || ""} ${a?.hora || ""}`;
            const fb = `${b?.fecha || ""} ${b?.hora || ""}`;
            return fb.localeCompare(fa);
        });

    const buscarUltimoReciboConPolling = async (creditoId, intentos = 5, delayMs = 800) => {
        for (let i = 0; i < intentos; i++) {
            try {
                const lista = await obtenerRecibosPorCredito(creditoId);
                if (Array.isArray(lista) && lista.length > 0) {
                    const ult = ordenarRecibos(lista)[0];
                    if (ult?.numero_recibo) return ult.numero_recibo;
                }
            } catch {
                /* noop */
            }
            await sleep(delayMs);
        }
        return null;
    };

    const goReciboRobusto = async (numero) => {
        if (!numero) return false;
        try {
            sessionStorage.setItem("last_recibo", String(numero));
        } catch {
            /* noop */
        }

        let ok = false;
        try {
            navigate(`/recibo/${encodeURIComponent(numero)}`, { replace: true });
            ok = true;
        } catch {
            ok = false;
        }

        await sleep(0);

        if (ok) {
            setTimeout(() => {
                if (!/\/recibo\/.+$/.test(window.location.pathname)) {
                    window.location.assign(`/recibo/${encodeURIComponent(numero)}`);
                }
            }, 80);
            return true;
        }

        window.location.assign(`/recibo/${encodeURIComponent(numero)}`);
        return true;
    };

    // ✅ Normalizador de errores de API (axios/fetch) + mensajes de negocio
    const normalizarErrorPago = (e) => {
        const status = e?.status ?? e?.response?.status ?? e?.response?.data?.status ?? e?.data?.status ?? null;

        const msg =
            e?.response?.data?.message ??
            e?.response?.data?.error ??
            e?.data?.message ??
            e?.message ??
            "No se pudo registrar el pago.";

        if (status === 409) {
            return msg || "Operación no permitida por estado del crédito.";
        }
        if (status === 403) {
            return "No tenés permisos para realizar esta acción.";
        }

        const m = String(msg || "").toLowerCase();
        if (m.includes("anulad")) return "Crédito anulado: no se permiten pagos.";
        if (m.includes("refinanci")) return "Crédito refinanciado: los pagos deben hacerse sobre el crédito nuevo.";
        if (m.includes("pagado")) return "Crédito pagado: no se permiten pagos.";

        return msg || "No se pudo registrar el pago.";
    };

    const swalError = async (e, fallback = "No se pudo registrar el pago.") => {
        const msg = normalizarErrorPago(e) || fallback;
        await Swal.fire({
            title: "Error",
            text: msg,
            icon: "error",
            confirmButtonText: "Cerrar"
        });
    };

    const swalWarn = async (title, text) => {
        await Swal.fire({
            title,
            text,
            icon: "warning",
            confirmButtonText: "Entendido"
        });
    };

    // ✅ Refresco forzado del resumen LIBRE (anti “estado viejo” en 2do pago)
    const refreshResumenForce = async () => {
        const creditoId = credito?.id;
        if (!creditoId) return null;

        setLoadingResumen(true);
        try {
            const data = await obtenerResumenLibreNormalizado(creditoId, undefined, { force: true });
            setResumenLocal(data);
            return data;
        } catch (e) {
            console.error("[PagoLibreModal] No se pudo refrescar resumen libre", e);
            return null;
        } finally {
            setLoadingResumen(false);
        }
    };

    useEffect(() => {
        if (!open) return;

        setResumenLocal(resumenLibre ?? null);
        refreshResumenForce().catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, credito?.id]);

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
            setModo(parcialBloqueado ? "total" : modoInicial);
            setFormaPagoId("");
            setMonto("");
            setDescuentoMoraPct("");
            setDescuentoInteresPct("");
            setObservacion("");
            setError(null);
            setSaving(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, credito?.id, cuotaLibreId, modoInicial, parcialBloqueado]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (saving) return;

        if (bloqueadoPorEstado) {
            const msg = motivoBloqueo || "Operación no permitida por estado del crédito.";
            setError(msg);
            await swalWarn("Acción no disponible", msg);
            return;
        }

        if (!cuotaLibreId) {
            const msg = "No se pudo determinar la cuota LIBRE para registrar el pago. Refresque e intente nuevamente.";
            setError(msg);
            await Swal.fire({ title: "No se encontró la cuota", text: msg, icon: "error" });
            return;
        }

        if (!formaPagoId) {
            const msg = "Seleccioná una forma de pago.";
            setError(msg);
            await swalWarn("Falta información", msg);
            return;
        }

        try {
            setSaving(true);
            setError(null);

            // ✅ CRÍTICO: resumen fresco
            const resumenFresh = (await refreshResumenForce()) || resumenVigente;

            const cap = toNumber(resumenFresh?.saldo_capital ?? credito?.saldo_actual ?? 0);

            const intHoy = toNumber(
                resumenFresh?.interes_ciclo_hoy ?? resumenFresh?.interes_pendiente_hoy ?? resumenFresh?.interes_hoy ?? 0
            );

            const morHoy = toNumber(
                resumenFresh?.mora_ciclo_hoy ?? resumenFresh?.mora_pendiente_hoy ?? resumenFresh?.mora_hoy ?? 0
            );

            const intTotal = toNumber(
                resumenFresh?.interes_pendiente_total ??
                    resumenFresh?.interes_total ??
                    resumenFresh?.interes_pendiente ??
                    intHoy ??
                    0
            );

            const morTotal = toNumber(
                resumenFresh?.mora_pendiente_total ??
                    resumenFresh?.mora_total ??
                    resumenFresh?.mora_pendiente ??
                    morHoy ??
                    0
            );

            const totalLiq = toNumber(
                resumenFresh?.total_actual ?? resumenFresh?.total_liquidacion_hoy ?? (cap + intTotal + morTotal)
            );

            let resp = null;

            if (modo === "parcial") {
                if (parcialBloqueado) {
                    const msg = "En el 3er mes del crédito LIBRE no se permite abono parcial. Debe realizar pago total.";
                    setError(msg);
                    await swalWarn("Abono parcial no disponible", msg);
                    return;
                }

                const montoNum = Number(String(monto).replace(",", ".")) || 0;
                if (montoNum <= 0) {
                    const msg = "Ingresá un monto válido.";
                    setError(msg);
                    await swalWarn("Monto inválido", msg);
                    return;
                }

                // ✅ Descuentos en PARCIAL (MORA siempre; INTERÉS solo superadmin)
                const pctM = puedeDescontarMora ? toPct(descuentoMoraPct) : 0;
                const pctI = puedeDescontarInteres ? toPct(descuentoInteresPct) : 0;

                if (pctM < 0 || pctM > 100 || pctI < 0 || pctI > 100) {
                    const msg = "Los descuentos deben ser porcentajes entre 0 y 100.";
                    setError(msg);
                    await swalWarn("Descuento inválido", msg);
                    return;
                }

                const scope = buildScope(pctM, pctI);

                const formaNombre = (formas.find((f) => String(f.id) === String(formaPagoId)) || {}).nombre || "";

                const descTxt =
                    pctM > 0 || pctI > 0
                        ? `<p style="margin-top:6px;font-size:12px;color:#555;">
                              Descuento: mora <b>${pctM}%</b>${puedeDescontarInteres ? ` / interés <b>${pctI}%</b>` : ""}
                           </p>`
                        : "";

                const result = await Swal.fire({
                    title: "Confirmar pago",
                    html: `<p style="margin-bottom:6px;">Abono parcial de <b>$${money(montoNum)}</b> sobre el crédito LIBRE <b>#${
                        credito?.id
                    }</b>.</p>
                          <p style="font-size:12px;color:#555;">Forma de pago: ${formaNombre}</p>
                          ${descTxt}`,
                    icon: "question",
                    showCancelButton: true,
                    confirmButtonText: "Sí, confirmar",
                    cancelButtonText: "Cancelar",
                    reverseButtons: true
                });

                if (!result.isConfirmed) return;

                resp = await registrarPagoParcial({
                    cuota_id: cuotaLibreId,
                    monto_pagado: montoNum,
                    monto: montoNum,
                    forma_pago_id: Number(formaPagoId),
                    observacion: observacion || null,

                    // ✅ NUEVO: alineado al backend (descuentos)
                    descuento_scope: scope,
                    descuento_mora: pctM,
                    descuento_interes: pctI,

                    // compat: back viejo usa "descuento"
                    descuento: pctM
                });
            } else {
                // ───────────────────────────────────────────────
                // Modo TOTAL: liquidación (siempre)
                // ───────────────────────────────────────────────

                const pctM = puedeDescontarMora ? toPct(descuentoMoraPct) : 0;
                const pctI = puedeDescontarInteres ? toPct(descuentoInteresPct) : 0;

                if (pctM < 0 || pctM > 100 || pctI < 0 || pctI > 100) {
                    const msg = "Los descuentos deben ser porcentajes entre 0 y 100.";
                    setError(msg);
                    await swalWarn("Descuento inválido", msg);
                    return;
                }

                if (puedeDescontarMora && morTotal <= 0 && pctM > 0) {
                    const msg = "No hay mora generada para aplicar descuento.";
                    setError(msg);
                    await swalWarn("Descuento no aplicable", msg);
                    return;
                }

                if (puedeDescontarInteres && intTotal <= 0 && pctI > 0) {
                    const msg = "No hay interés pendiente para aplicar descuento.";
                    setError(msg);
                    await swalWarn("Descuento no aplicable", msg);
                    return;
                }

                const descMora$ = (morTotal * pctM) / 100;
                const descInteres$ = (intTotal * pctI) / 100;
                const totalConDesc = Math.max(0, totalLiq - descMora$ - descInteres$);

                if (!(totalConDesc > 0)) {
                    const msg = "El total a pagar es inválido.";
                    setError(msg);
                    await swalWarn("Total inválido", msg);
                    return;
                }

                const formaNombre = (formas.find((f) => String(f.id) === String(formaPagoId)) || {}).nombre || "";

                const scope = buildScope(pctM, pctI);

                const result = await Swal.fire({
                    title: "Confirmar liquidación",
                    html: `<div style="font-size:13px;text-align:left;line-height:1.35;">
                            <div>Crédito LIBRE <b>#${credito?.id}</b></div>
                            <div style="margin-top:6px;">Total liquidación (hoy): <b>$${money(totalLiq)}</b></div>
                            <div>Descuento mora total: <b>${pctM}%</b> ($${money(descMora$)})</div>
                            <div>Descuento interés total: <b>${pctI}%</b> ($${money(descInteres$)})</div>
                            <div style="margin-top:6px;">Total a pagar: <b>$${money(totalConDesc)}</b></div>
                            <div style="margin-top:10px;font-size:12px;color:#555;">Forma de pago: ${formaNombre}</div>
                           </div>`,
                    icon: "question",
                    showCancelButton: true,
                    confirmButtonText: "Sí, confirmar",
                    cancelButtonText: "Cancelar",
                    reverseButtons: true
                });

                if (!result.isConfirmed) return;

                // ✅ Enviamos campos NUEVOS alineados al backend
                resp = await pagarCuota({
                    cuotaId: cuotaLibreId,
                    forma_pago_id: Number(formaPagoId),
                    observacion: observacion || null,

                    monto_pagado: totalConDesc,
                    monto: totalConDesc,

                    descuento_scope: scope,
                    descuento_mora: pctM,
                    descuento_interes: pctI,

                    // compat: algunos back viejos usan "descuento" a secas
                    descuento: pctM
                });
            }

            const creditoId = credito?.id ?? null;

            if (creditoId) invalidarResumenLibreCache(creditoId);

            let numero = numeroDesdeResponse(resp);

            if (!numero && creditoId) {
                await sleep(250);
                numero = await buscarUltimoReciboConPolling(creditoId, 5, 800);
            }

            const tituloOk = modo === "parcial" ? "Pago registrado" : "Liquidación registrada";
            const textoOk = numero
                ? `Operación confirmada. Recibo #${numero}.`
                : "Operación confirmada. No se pudo detectar el número de recibo automáticamente.";

            await Swal.fire({
                title: tituloOk,
                text: textoOk,
                icon: "success",
                confirmButtonText: numero ? "Ver recibo" : "Continuar"
            });

            // ✅ Enviar payload completo al padre para actualizar UI sin esperar refetch
            if (onSuccess) {
                await Promise.resolve(onSuccess(buildOnSuccessPayload({ resp, creditoId })));
            }

            if (numero) {
                await goReciboRobusto(numero);
                return;
            }

            onClose?.();
        } catch (e) {
            const msg = normalizarErrorPago(e);
            setError(msg);

            const status = e?.status ?? e?.response?.status ?? null;

            if (status === 409 || status === 403) {
                await Swal.fire({
                    title: "No se pudo registrar",
                    text: msg,
                    icon: "warning",
                    confirmButtonText: "Entendido"
                });
            } else {
                await swalError(e);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleClose = async () => {
        if (saving) {
            await swalWarn("Operación en curso", "Hay una operación en curso. Espere a que finalice.");
            return;
        }
        onClose?.();
    };

    if (!puedeImpactarPagos) return null;
    if (!open) return null;

    const disabledAll = saving || bloqueadoPorEstado;

    return (
        <section className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
            <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
                <header className="flex items-center justify-between border-b px-5 py-4">
                    <h4 className="text-base sm:text-lg font-semibold">
                        Crédito LIBRE #{credito?.id} — {modo === "parcial" ? "Abono parcial" : "Liquidación total"} (ciclo{" "}
                        {ciclo}/3)
                        {loadingResumen ? " — actualizando..." : ""}
                    </h4>
                    <button
                        onClick={handleClose}
                        className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                        disabled={saving}
                        title={saving ? "Hay una operación en curso" : "Cerrar"}
                    >
                        Cerrar
                    </button>
                </header>

                <div className="flex-1 min-h-0 px-5 py-4 space-y-4 overflow-y-auto">
                    {bloqueadoPorEstado && (
                        <div className="rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-800">
                            <b>Acción bloqueada:</b> {motivoBloqueo || "Operación no permitida por estado del crédito."}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2 text-sm text-gray-700">
                        <div className="space-y-1">
                            <div>
                                <span className="font-medium">Capital (hoy):</span> ${money(capitalHoy)}
                            </div>

                            <div>
                                <span className="font-medium">Interés de ciclo (hoy):</span> ${money(interesHoy)}
                            </div>
                            <div>
                                <span className="font-medium">Mora (hoy):</span> ${money(moraHoy)}
                            </div>

                            <div className="pt-1">
                                <span className="font-medium">Interés total pendiente:</span> ${money(interesTotalPendiente)}
                            </div>
                            <div>
                                <span className="font-medium">Mora total pendiente:</span> ${money(moraTotalPendiente)}
                            </div>

                            <div>
                                <span className="font-medium">Total liquidación (hoy):</span>{" "}
                                <span className="font-semibold">${money(totalLiquidacionHoy)}</span>
                            </div>

                            {/* ✅ Mostrar preview de descuento también en parcial si hay valores cargados */}
                            {(modo === "total" || (modo === "parcial" && (pctMora > 0 || pctInteres > 0))) && (
                                <>
                                    <div>
                                        <span className="font-medium">Desc. mora:</span>{" "}
                                        {pctMora > 0 ? (
                                            <>
                                                {pctMora}% → ${money(descuentoMoraPesos)}
                                            </>
                                        ) : (
                                            "Sin descuento"
                                        )}
                                    </div>
                                    <div>
                                        <span className="font-medium">Desc. interés:</span>{" "}
                                        {pctInteres > 0 ? (
                                            <>
                                                {pctInteres}% → ${money(descuentoInteresPesos)}
                                            </>
                                        ) : (
                                            "Sin descuento"
                                        )}
                                    </div>
                                    <div>
                                        <span className="font-medium">Total a pagar con descuentos:</span>{" "}
                                        <span className="font-semibold">${money(totalConDescuento)}</span>
                                    </div>
                                </>
                            )}

                            <div>
                                <span className="font-medium">Periodicidad:</span> {credito?.tipo_credito}
                            </div>
                            <div>
                                <span className="font-medium">Tasa por ciclo:</span> {credito?.interes}%
                            </div>
                        </div>

                        <div className="flex rounded-md bg-gray-100 p-1">
                            <button
                                className={`px-3 py-1 rounded-md text-sm ${
                                    modo === "parcial" ? "bg-white shadow" : "opacity-70 hover:opacity-100"
                                }`}
                                onClick={() => !parcialBloqueado && setModo("parcial")}
                                disabled={parcialBloqueado || bloqueadoPorEstado}
                                title={
                                    bloqueadoPorEstado
                                        ? motivoBloqueo || "Acción no disponible"
                                        : parcialBloqueado
                                        ? "En el 3er mes no se permite abono parcial"
                                        : "Abono parcial"
                                }
                            >
                                Parcial
                            </button>
                            <button
                                className={`px-3 py-1 rounded-md text-sm ${
                                    modo === "total" ? "bg-white shadow" : "opacity-70 hover:opacity-100"
                                }`}
                                onClick={() => setModo("total")}
                                disabled={bloqueadoPorEstado}
                                title={bloqueadoPorEstado ? motivoBloqueo || "Acción no disponible" : "Pago total"}
                            >
                                Total
                            </button>
                        </div>
                    </div>

                    <div className="rounded-lg border p-3 bg-gray-50 text-xs text-gray-700">
                        <b>LIBRE:</b> sin vencimientos fijos. El interés es por ciclo sobre el capital y la <b>mora</b> se calcula al{" "}
                        <b>2,5% diario del interés del ciclo</b>. Máximo 3 meses; en el 3er mes no se permiten abonos parciales.
                    </div>

                    {parcialBloqueado && (
                        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Estás en el <b>3er mes</b> del crédito LIBRE. Solo se permite <b>pago total</b>.
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {modo === "parcial" ? (
                                <>
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
                                            disabled={disabledAll || parcialBloqueado}
                                        />
                                    </label>

                                    {/* ✅ Descuentos en PARCIAL */}
                                    {puedeDescontarMora || puedeDescontarInteres ? (
                                        <>
                                            <label className="text-sm">
                                                <span className="block text-gray-600 mb-1">Desc. mora (%)</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    max="100"
                                                    className="w-full rounded-md border px-3 py-2"
                                                    value={descuentoMoraPct}
                                                    onChange={(e) => setDescuentoMoraPct(e.target.value)}
                                                    placeholder="0"
                                                    disabled={disabledAll || !puedeDescontarMora}
                                                />
                                            </label>

                                            {puedeDescontarInteres ? (
                                                <label className="text-sm">
                                                    <span className="block text-gray-600 mb-1">Desc. interés (%)</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        max="100"
                                                        className="w-full rounded-md border px-3 py-2"
                                                        value={descuentoInteresPct}
                                                        onChange={(e) => setDescuentoInteresPct(e.target.value)}
                                                        placeholder="0"
                                                        disabled={disabledAll}
                                                    />
                                                </label>
                                            ) : (
                                                <div className="text-xs text-gray-600 self-end">
                                                    <span className="block font-medium mb-1">Desc. interés</span>
                                                    <span>0% (solo superadmin)</span>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-xs text-gray-600 self-end sm:col-span-2">
                                            <span className="block font-medium mb-1">Descuentos</span>
                                            <span>0% (no tenés permisos para aplicar descuentos).</span>
                                        </div>
                                    )}
                                </>
                            ) : puedeDescontarMora || puedeDescontarInteres ? (
                                <>
                                    <label className="text-sm">
                                        <span className="block text-gray-600 mb-1">Desc. mora (%)</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="100"
                                            className="w-full rounded-md border px-3 py-2"
                                            value={descuentoMoraPct}
                                            onChange={(e) => setDescuentoMoraPct(e.target.value)}
                                            placeholder="0"
                                            disabled={disabledAll || !puedeDescontarMora}
                                        />
                                    </label>

                                    {puedeDescontarInteres ? (
                                        <label className="text-sm">
                                            <span className="block text-gray-600 mb-1">Desc. interés (%)</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max="100"
                                                className="w-full rounded-md border px-3 py-2"
                                                value={descuentoInteresPct}
                                                onChange={(e) => setDescuentoInteresPct(e.target.value)}
                                                placeholder="0"
                                                disabled={disabledAll}
                                            />
                                        </label>
                                    ) : (
                                        <div className="text-xs text-gray-600 self-end">
                                            <span className="block font-medium mb-1">Desc. interés</span>
                                            <span>0% (solo superadmin)</span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-xs text-gray-600 self-end sm:col-span-2">
                                    <span className="block font-medium mb-1">Descuentos</span>
                                    <span>0% (no tenés permisos para aplicar descuentos).</span>
                                </div>
                            )}

                            <label className={`text-sm ${(modo === "total" && (puedeDescontarMora || puedeDescontarInteres)) ? "sm:col-span-2" : ""}`}>
                                <span className="block text-gray-600 mb-1">Forma de pago</span>
                                <select
                                    className="w-full rounded-md border px-3 py-2 bg-white"
                                    value={formaPagoId}
                                    onChange={(e) => setFormaPagoId(e.target.value)}
                                    required
                                    disabled={loadingFormas || disabledAll}
                                >
                                    <option value="">{loadingFormas ? "Cargando..." : "Seleccioná una forma de pago"}</option>
                                    {formas.map((f) => (
                                        <option key={f.id} value={f.id}>
                                            {f.nombre}
                                        </option>
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
                                placeholder={modo === "parcial" ? "Abono parcial" : "Liquidación del crédito"}
                                disabled={disabledAll}
                            />
                        </label>

                        {error && <div className="text-sm text-red-600">{error}</div>}

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={handleClose}
                                disabled={saving}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                                disabled={disabledAll || (modo === "parcial" && parcialBloqueado)}
                                title={
                                    bloqueadoPorEstado
                                        ? motivoBloqueo || "Acción no disponible"
                                        : modo === "parcial" && parcialBloqueado
                                        ? "En el 3er mes no se permite abono parcial"
                                        : ""
                                }
                            >
                                {saving ? "Procesando…" : modo === "parcial" ? "Registrar abono" : "Liquidar crédito"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    );
};

export default PagoLibreModal;