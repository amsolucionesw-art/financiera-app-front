// src/components/creditos/CreditoCard.jsx
import React from "react";
import Swal from "sweetalert2";
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
    Info,
    Printer
} from "lucide-react";

import CuotasTabla from "../CuotasTabla";

import {
    money,
    safeLower,
    MODALIDADES_REFINANCIABLES,
    badgeByModalidad,
    leftBorderByModalidad,
    LIBRE_VTO_FICTICIO,
    calcularTotalActualFront
} from "../../utils/creditos/creditosHelpers.js";

// ✅ FIX PDF: bajar PDF como blob (NO apiFetch/json)
import { descargarFichaCreditoPDF } from "../../services/creditoService.js";

const toNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const defaultEstadoClasses = (estado) => {
    switch ((estado || "").toLowerCase()) {
        case "pagado":
            return "bg-green-100 text-green-700";
        case "pendiente":
            return "bg-yellow-100 text-yellow-700";
        case "vencido":
            return "bg-red-100 text-red-700";
        case "refinanciado":
            return "bg-rose-100 text-rose-700";
        case "anulado":
            return "bg-gray-200 text-gray-700";
        default:
            return "bg-gray-100 text-gray-600";
    }
};

/* ─────────────────────────────────────────────────────────────
   LIBRE: helpers locales para NO depender de cálculos viejos
   - Anchor: fecha_compromiso_pago (fallback acreditación)
   - vto1/vto2/vto3 = anchor +0/+1/+2 meses (clamp fin de mes)
   - ciclo: 1..3 según HOY vs vencimientos (TZ AR)
───────────────────────────────────────────────────────────── */
const pad2 = (n) => String(n).padStart(2, "0");

const asYMDLocal = (v) => {
    if (!v) return null;
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const todayYMD_AR = () => {
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Argentina/Tucuman",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        })
            .formatToParts(new Date())
            .reduce((acc, p) => {
                acc[p.type] = p.value;
                return acc;
            }, {});
        return `${parts.year}-${parts.month}-${parts.day}`;
    } catch {
        // fallback (puede correrse 1 día en extremos, pero no rompe UI)
        return new Date().toISOString().slice(0, 10);
    }
};

const parseYMD = (s) => {
    const ymdStr = asYMDLocal(s);
    if (!ymdStr) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymdStr);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]); // 1..12
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    return { y, mo, d };
};

const daysInMonthUTC = (year, month1to12) => {
    return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
};

const addMonthsYMD = (baseYMD, months) => {
    const p = parseYMD(baseYMD);
    if (!p) return null;

    const add = Number(months || 0);
    const total = p.y * 12 + (p.mo - 1) + add;

    const y = Math.floor(total / 12);
    const mo0 = total % 12; // puede ser negativo
    const mo0Fixed = mo0 < 0 ? mo0 + 12 : mo0;
    const yFixed = mo0 < 0 ? y - 1 : y;

    const mo = mo0Fixed + 1; // 1..12
    const dim = daysInMonthUTC(yFixed, mo);
    const d = Math.min(p.d, dim);

    return `${yFixed}-${pad2(mo)}-${pad2(d)}`;
};

const cicloLibreLocal = (anchorYMD) => {
    const vto1 = asYMDLocal(anchorYMD);
    if (!vto1) return 1;

    const hoy = todayYMD_AR();
    const vto2 = addMonthsYMD(vto1, 1);
    const vto3 = addMonthsYMD(vto1, 2);

    if (hoy <= vto1) return 1;
    if (vto2 && hoy <= vto2) return 2;
    if (vto3 && hoy <= vto3) return 3;
    return 3;
};

const CreditoCard = ({
    credito,
    abiertoId,
    onToggle,
    resumen: resumenProp,
    puedeImpactarPagos,
    puedeCancelar,
    onAbrirRecibos,
    onAbrirPagoLibre,
    onAbrirRefi,
    onAbrirCancelar,
    onImprimirFicha,
    refetchCreditos,
    estadoClasses: estadoClassesProp
}) => {
    const c = credito;

    const estadoClasses =
        typeof estadoClassesProp === "function" ? estadoClassesProp : defaultEstadoClasses;

    const esLibre = safeLower(c.modalidad_credito) === "libre";
    const tieneDescuento = !esLibre && Number(c.descuento) > 0;

    // 🔹 Marca si viene de una venta financiada + detalle del producto
    const esVentaFinanciada = Boolean(
        c.origen_venta_manual_financiada ||
            c.venta_manual_id ||
            (c.ventaOrigen && (c.ventaOrigen.id || c.ventaOrigen.venta_manual_id))
    );

    const detalleProducto =
        c.detalle_producto ||
        (c.ventaOrigen &&
            (c.ventaOrigen.detalle_producto ||
                c.ventaOrigen.descripcion ||
                c.ventaOrigen.producto)) ||
        "";

    // Tasa base visible:
    const tasaVisible =
        c.tasa_refinanciacion !== null &&
        c.tasa_refinanciacion !== undefined &&
        c.tasa_refinanciacion !== ""
            ? Number(c.tasa_refinanciacion)
            : Number(c.interes);

    // Interés TOTAL (no-LIBRE)
    const interesTotalPct = (() => {
        if (esLibre) return Number(tasaVisible || 0);

        const cuotasNum = Number(c.cantidad_cuotas || 0);

        // ✅ 1) Fuente más confiable: relación total vs capital
        const capital = Number(c.monto_acreditar || 0);
        const total = Number(c.monto_total_devolver || 0);
        if (capital > 0 && total > 0 && total >= capital) {
            const pct = ((total - capital) / capital) * 100;
            return +pct.toFixed(2);
        }

        // ✅ 2) Si es refinanciación: tasa_refinanciacion ES por período → total = tasaPeriodo * cuotas
        if (c.id_credito_origen && cuotasNum > 0) {
            const tasaPeriodo = Number(c.tasa_refinanciacion ?? 0);
            if (tasaPeriodo > 0) {
                const pct = tasaPeriodo * cuotasNum;
                return +pct.toFixed(2);
            }
        }

        // ✅ 3) Fallback final: usar interes como lo venían usando
        const tasaBase = Number(tasaVisible || 0);
        return +Math.max(tasaBase, 0).toFixed(2);
    })();

    // Tasa visible para LIBRE (por ciclo)
    const tasaLibreFicha = Number(c.interes || 0);

    // Estimación rápida para NO libre (visual)
    let principalPendiente = 0;
    let moraAcumNeta = 0;

    if (!esLibre && Array.isArray(c.cuotas)) {
        for (const q of c.cuotas) {
            const imp = Number(q.importe_cuota || 0);
            const pag = Number(q.monto_pagado_acumulado || 0);
            const moraBr = Number(q.intereses_vencidos_acumulados || 0);
            const descM = Number(q.descuento_cuota || 0);
            const moraNet = Math.max(moraBr - descM, 0);

            principalPendiente += Math.max(imp - pag, 0);
            moraAcumNeta += moraNet;
        }
    }

    // Cuota abierta LIBRE
    // ✅ Importante: el "importe visible" NO debe depender de cuotaLibre.importe_cuota (puede quedar viejo).
    // La fuente correcta para el capital pendiente es saldo_actual / resumenLibre.saldo_capital.
    const cuotaLibre = esLibre
        ? (c.cuotas || []).find((q) => String(q.fecha_vencimiento) === String(LIBRE_VTO_FICTICIO)) ||
          (c.cuotas || []).find((q) => Number(q.numero_cuota) === 1) ||
          (c.cuotas || [])[0]
        : null;

    // ─────────────────────────────────────────────────────────────
    // ✅ Resumen libre: prioridad
    // 1) resumenProp (fetch dedicado)
    // 2) c.resumen_libre (back adjunta)
    // 3) "aplanado" del back (saldo_capital, interes_pendiente_total, etc.)
    // ─────────────────────────────────────────────────────────────
    const resumen = (() => {
        if (resumenProp) return resumenProp;

        if (esLibre && c.resumen_libre) {
            return { loading: false, error: null, data: c.resumen_libre };
        }

        if (esLibre) {
            const tieneAlgoAplanado =
                typeof c.saldo_capital !== "undefined" ||
                typeof c.interes_pendiente_total !== "undefined" ||
                typeof c.mora_pendiente_total !== "undefined" ||
                typeof c.total_liquidacion_hoy !== "undefined" ||
                typeof c.total_ciclo_hoy !== "undefined" ||
                typeof c.ciclo_actual !== "undefined";

            if (tieneAlgoAplanado) {
                return {
                    loading: false,
                    error: null,
                    data: {
                        saldo_capital: c.saldo_capital ?? c.saldo_actual ?? 0,
                        interes_pendiente_total: c.interes_pendiente_total ?? 0,
                        mora_pendiente_total: c.mora_pendiente_total ?? 0,
                        interes_pendiente_hoy: c.interes_pendiente_hoy ?? 0,
                        mora_pendiente_hoy: c.mora_pendiente_hoy ?? 0,
                        total_liquidacion_hoy:
                            c.total_liquidacion_hoy ?? c.total_actual ?? 0,
                        total_ciclo_hoy:
                            c.total_ciclo_hoy ?? c.saldo_total_actual ?? 0,
                        ciclo_actual: c.ciclo_actual ?? 1
                    }
                };
            }
        }

        return null;
    })();

    // ✅ Anchor LIBRE: prioridad fecha_compromiso_pago (mensual), fallback acreditación (legacy)
    const anchorLibre = c.fecha_compromiso_pago || c.fecha_acreditacion;

    // ✅ Ciclo actual: fuente de verdad = back (resumen). Si no hay resumen, cálculo local mensual (TZ AR).
    const ciclo = esLibre ? toNumber(resumen?.data?.ciclo_actual) || cicloLibreLocal(anchorLibre) : null;

    const parcialBloqueado = esLibre && ciclo >= 3;

    // ─────────────────────────────────────────────────────────────
    // ✅ NUEVO: bloqueo UI por estado (anulado / refinanciado / pagado)
    // ─────────────────────────────────────────────────────────────
    const estadoLower = safeLower(c.estado);
    const bloqueadoPorEstado = ["pagado", "refinanciado", "anulado"].includes(estadoLower);

    // Mensajes de bloqueo (tooltips)
    const motivoBloqueoPagos = (() => {
        if (estadoLower === "anulado") return "Crédito anulado: no se permiten pagos.";
        if (estadoLower === "refinanciado") return "Crédito refinanciado: los pagos deben hacerse sobre el nuevo crédito.";
        if (estadoLower === "pagado") return "Crédito pagado: no se permiten pagos.";
        return null;
    })();

    const motivoBloqueoRefi = (() => {
        if (estadoLower === "anulado") return "Crédito anulado: no se puede refinanciar.";
        if (estadoLower === "refinanciado") return "Crédito ya refinanciado.";
        if (estadoLower === "pagado") return "Crédito pagado: no se puede refinanciar.";
        return null;
    })();

    // ✅ Vencimientos por calendario (coherente con back)
    const anchorYMD = asYMDLocal(anchorLibre);
    const fechasCiclosCard = esLibre
        ? [
              anchorYMD || "—",
              (anchorYMD ? addMonthsYMD(anchorYMD, 1) : null) || "—",
              (anchorYMD ? addMonthsYMD(anchorYMD, 2) : null) || "—"
          ]
        : [];

    // R (nuevo refi / origen refi)
    const esOrigenRefi = safeLower(c.estado) === "refinanciado";
    const esNuevoRefi = !esOrigenRefi && Boolean(c.id_credito_origen);

    // Botón refinanciar
    const modalidadLower = safeLower(c.modalidad_credito);

    const puedeRefinanciar =
        MODALIDADES_REFINANCIABLES.includes(modalidadLower) &&
        Number(c.saldo_actual) > 0 &&
        !["pagado", "anulado", "refinanciado"].includes(estadoLower);

    // ───────────────────────────────
    // LIBRE: contrato robusto para UI (normalizado + compat)
    // ───────────────────────────────
    const libreCapital = esLibre ? toNumber(resumen?.data?.saldo_capital ?? c.saldo_actual ?? 0) : 0;

    const interesCicloActual = esLibre
        ? toNumber(
              resumen?.data?.interes_ciclo_hoy ??
                  resumen?.data?.interes_pendiente_hoy ??
                  resumen?.data?.interes_hoy ??
                  c.interes_pendiente_hoy ??
                  0
          )
        : 0;

    const moraCicloActual = esLibre
        ? toNumber(
              resumen?.data?.mora_ciclo_hoy ??
                  resumen?.data?.mora_pendiente_hoy ??
                  resumen?.data?.mora_hoy ??
                  c.mora_pendiente_hoy ??
                  0
          )
        : 0;

    let interesTotalPendiente = esLibre
        ? toNumber(
              resumen?.data?.interes_pendiente_total ??
                  resumen?.data?.interes_total ??
                  resumen?.data?.interes_pendiente ??
                  c.interes_pendiente_total ??
                  0
          )
        : 0;

    let moraTotalPendiente = esLibre
        ? toNumber(
              resumen?.data?.mora_pendiente_total ??
                  resumen?.data?.mora_total ??
                  resumen?.data?.mora_pendiente ??
                  c.mora_pendiente_total ??
                  0
          )
        : 0;

    // ✅ Guardarraíl: si el back mandó “HOY” pero no mandó totales, no mostramos 0 incoherente.
    if (esLibre) {
        if (interesTotalPendiente <= 0 && interesCicloActual > 0) interesTotalPendiente = interesCicloActual;
        if (moraTotalPendiente <= 0 && moraCicloActual > 0) moraTotalPendiente = moraCicloActual;
    }

    // ✅ Total a cancelar hoy: prioriza total_actual normalizado y cubre aliases típicos
    const totalPendienteHoy = esLibre
        ? toNumber(
              resumen?.data?.total_actual ??
                  resumen?.data?.total_liquidacion_hoy ??
                  resumen?.data?.total_a_cancelar_hoy ??
                  resumen?.data?.total_pagar_hoy ??
                  resumen?.data?.total ??
                  c.total_liquidacion_hoy ??
                  c.total_actual ??
                  libreCapital + interesTotalPendiente + moraTotalPendiente
          )
        : 0;

    const totalActualCard = esLibre
        ? totalPendienteHoy
        : Number(c.saldo_total_actual ?? c.total_actual ?? calcularTotalActualFront(c));

    // Para tachado si hubo % global (no-libre)
    const totalSinDescuento = tieneDescuento
        ? Number((((Number(c.monto_total_devolver) || 0) / (1 - Number(c.descuento) / 100))).toFixed(2))
        : Number(c.monto_total_devolver);

    // Primer y último vencimiento reales (ignorando vencimiento ficticio de LIBRE)
    const vtosValidosCard = Array.isArray(c.cuotas)
        ? c.cuotas
              .map((q) => q.fecha_vencimiento)
              .filter((f) => f && f !== LIBRE_VTO_FICTICIO)
              .sort()
        : [];

    const primerVtoCard = vtosValidosCard[0] || c.fecha_compromiso_pago || "—";
    const ultimoVtoCard = vtosValidosCard.length > 0 ? vtosValidosCard[vtosValidosCard.length - 1] : "—";

    const isOpen = abiertoId === c.id;

    /* ─────────────────────────────────────────────────────────────
       SweetAlert2 helpers (evita duplicación y agrega confirmaciones)
       ✅ FIX: no pasar confirmText/cancelText como params desconocidos
    ───────────────────────────────────────────────────────────── */
    const swalBlocked = (title, text) =>
        Swal.fire({
            icon: "info",
            title,
            text,
            confirmButtonText: "Entendido"
        });

    const swalError = (err, fallback = "No se pudo completar la acción.") => {
        const msg =
            (typeof err === "string" && err) ||
            err?.response?.data?.message ||
            err?.message ||
            fallback;

        return Swal.fire({
            icon: "error",
            title: "Error",
            text: msg,
            confirmButtonText: "Cerrar"
        });
    };

    const swalConfirm = (opts = {}) => {
        const { confirmText, cancelText, ...rest } = opts || {};
        return Swal.fire({
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: confirmText || "Confirmar",
            cancelButtonText: cancelText || "Cancelar",
            confirmButtonColor: "#4f46e5",
            cancelButtonColor: "#6b7280",
            ...rest
        });
    };

    return (
        <article
            key={c.id}
            className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md ${leftBorderByModalidad(
                c.modalidad_credito
            )}`}
        >
            <header
                className="flex flex-wrap items-center justify-between gap-2 p-4 sm:p-6"
                onClick={() => onToggle(c.id)}
            >
                <div className="flex items-center gap-2 text-lg font-semibold">
                    <BadgeDollarSign size={18} /> Crédito #{c.id}
                    <span
                        className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${badgeByModalidad(
                            c.modalidad_credito
                        )}`}
                    >
                        {safeLower(c.modalidad_credito) === "comun" ? "PLAN DE CUOTAS FIJAS" : c.modalidad_credito?.toUpperCase()}
                    </span>

                    {esNuevoRefi && (
                        <span
                            title="Nuevo crédito generado por refinanciación"
                            className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-[11px] font-extrabold leading-none text-white"
                            style={{ transform: "translateY(-2px)" }}
                        >
                            R
                        </span>
                    )}

                    {esOrigenRefi && (
                        <span
                            title="Crédito original (marcado como refinanciado)"
                            className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[11px] font-extrabold leading-none text-white"
                            style={{ transform: "translateY(-2px)" }}
                        >
                            R
                        </span>
                    )}

                    {esLibre && <span className="text-xs text-emerald-700 ml-2">(ciclo {ciclo}/3)</span>}

                    {esVentaFinanciada && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            <BadgeDollarSign size={12} />
                            Venta financiada
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Acciones para LIBRE */}
                    {esLibre && !bloqueadoPorEstado && puedeImpactarPagos && (
                        <>
                            <button
                                className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium ${
                                    parcialBloqueado
                                        ? "border-gray-300 text-gray-400 bg-white cursor-not-allowed"
                                        : "border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50"
                                }`}
                                onClick={async (e) => {
                                    e.stopPropagation();

                                    if (bloqueadoPorEstado) {
                                        await swalBlocked("Acción bloqueada", motivoBloqueoPagos || "Acción no disponible.");
                                        return;
                                    }

                                    if (parcialBloqueado) {
                                        await swalBlocked("Abono parcial no disponible", "En el 3er ciclo no se permite abono parcial.");
                                        return;
                                    }

                                    if (!cuotaLibre?.id) {
                                        await Swal.fire({
                                            icon: "error",
                                            title: "No se encontró la cuota abierta",
                                            text: "No se pudo determinar la cuota LIBRE para registrar el pago. Refresque e intente nuevamente.",
                                            confirmButtonText: "Cerrar"
                                        });
                                        return;
                                    }

                                    try {
                                        const res = await swalConfirm({
                                            title: "Registrar abono parcial",
                                            html: `Se abrirá el pago parcial para el <b>Crédito #${c.id}</b>.`,
                                            confirmText: "Continuar"
                                        });

                                        if (!res.isConfirmed) return;

                                        await onAbrirPagoLibre?.({ credito: c, cuotaLibreId: cuotaLibre.id, modo: "parcial" });
                                    } catch (err) {
                                        await swalError(err);
                                    }
                                }}
                                title={
                                    motivoBloqueoPagos ||
                                    (parcialBloqueado ? "En el 3er mes no se permite abono parcial" : "Registrar abono parcial (Crédito libre)")
                                }
                                disabled={parcialBloqueado}
                            >
                                Abono parcial
                            </button>

                            <button
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                onClick={async (e) => {
                                    e.stopPropagation();

                                    if (bloqueadoPorEstado) {
                                        await swalBlocked("Acción bloqueada", motivoBloqueoPagos || "Acción no disponible.");
                                        return;
                                    }

                                    if (!cuotaLibre?.id) {
                                        await Swal.fire({
                                            icon: "error",
                                            title: "No se encontró la cuota abierta",
                                            text: "No se pudo determinar la cuota LIBRE para registrar el pago. Refresque e intente nuevamente.",
                                            confirmButtonText: "Cerrar"
                                        });
                                        return;
                                    }

                                    try {
                                        const res = await swalConfirm({
                                            title: "Liquidar crédito",
                                            html: `Se abrirá la liquidación total del <b>Crédito #${c.id}</b>.<br/>Total estimado hoy: <b>$${money(totalPendienteHoy)}</b>`,
                                            confirmText: "Continuar"
                                        });

                                        if (!res.isConfirmed) return;

                                        await onAbrirPagoLibre?.({ credito: c, cuotaLibreId: cuotaLibre.id, modo: "total" });
                                    } catch (err) {
                                        await swalError(err);
                                    }
                                }}
                                title={motivoBloqueoPagos || "Liquidar crédito (Crédito libre)"}
                            >
                                Liquidar crédito
                            </button>
                        </>
                    )}

                    {/* Si está bloqueado por estado, mostramos botones deshabilitados (misma UI, cero click) */}
                    {esLibre && bloqueadoPorEstado && puedeImpactarPagos && (
                        <>
                            <button
                                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-400 bg-white cursor-not-allowed"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    swalBlocked("Acción bloqueada", motivoBloqueoPagos || "Acción no disponible.");
                                }}
                                title={motivoBloqueoPagos || "Acción no disponible"}
                                disabled
                            >
                                Abono parcial
                            </button>

                            <button
                                className="inline-flex items-center gap-1 rounded-md bg-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 cursor-not-allowed"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    swalBlocked("Acción bloqueada", motivoBloqueoPagos || "Acción no disponible.");
                                }}
                                title={motivoBloqueoPagos || "Acción no disponible"}
                                disabled
                            >
                                Liquidar crédito
                            </button>
                        </>
                    )}

                    {/* Botón Refinanciar */}
                    {MODALIDADES_REFINANCIABLES.includes(modalidadLower) && Number(c.saldo_actual) > 0 && (
                        <button
                            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white ${
                                puedeRefinanciar ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-300 text-gray-600 cursor-not-allowed"
                            }`}
                            onClick={async (e) => {
                                e.stopPropagation();

                                if (!puedeRefinanciar) {
                                    await swalBlocked("No se puede refinanciar", motivoBloqueoRefi || "Acción no disponible.");
                                    return;
                                }

                                try {
                                    const res = await swalConfirm({
                                        title: "Refinanciar crédito",
                                        html: `Se abrirá la refinanciación del <b>Crédito #${c.id}</b>.`,
                                        confirmText: "Continuar"
                                    });

                                    if (!res.isConfirmed) return;

                                    onAbrirRefi?.({ credito: c });
                                } catch (err) {
                                    await swalError(err);
                                }
                            }}
                            title={puedeRefinanciar ? "Refinanciar crédito" : (motivoBloqueoRefi || "No se puede refinanciar")}
                            disabled={!puedeRefinanciar}
                        >
                            Refinanciar crédito
                        </button>
                    )}

                    {/* Ver recibos */}
                    <button
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                        onClick={async (e) => {
                            e.stopPropagation();
                            try {
                                onAbrirRecibos?.(c);
                            } catch (err) {
                                await swalError(err);
                            }
                        }}
                        title="Ver recibos del crédito"
                    >
                        <FileText size={14} /> Ver recibos
                    </button>

                    {/* Descargar ficha */}
                    <button
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                        onClick={async (e) => {
                            e.stopPropagation();
                            try {
                                const res = await swalConfirm({
                                    icon: "question",
                                    title: "Descargar ficha",
                                    html: `Se descargará la ficha (PDF) del <b>Crédito #${c.id}</b>.`,
                                    confirmText: "Descargar"
                                });
                                if (!res.isConfirmed) return;

                                // ✅ FIX: forzar descarga PDF como blob (evita apiFetch/json => "Unexpected token '<'")
                                await descargarFichaCreditoPDF(c.id, `ficha-credito-${c.id}.pdf`);

                                // (Opcional) compat: si por algún motivo quieren mantener callback externo
                                // await onImprimirFicha?.(c.id);
                            } catch (err) {
                                await swalError(err, "No se pudo descargar la ficha.");
                            }
                        }}
                        title="Descargar ficha (PDF)"
                    >
                        <Printer size={14} /> Descargar ficha
                    </button>

                    {/* Cancelar crédito (no-libre) */}
                    {puedeCancelar && c.estado !== "pagado" && !esLibre && String(c.estado).toLowerCase() !== "refinanciado" && (
                        <button
                            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white ${
                                estadoLower === "anulado" ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-rose-600 hover:bg-rose-700"
                            }`}
                            onClick={async (e) => {
                                e.stopPropagation();

                                if (estadoLower === "anulado") {
                                    await swalBlocked("Acción bloqueada", "Crédito anulado: no se puede cancelar.");
                                    return;
                                }

                                try {
                                    const res = await swalConfirm({
                                        title: "Cancelar crédito",
                                        html: `Se abrirá la cancelación anticipada del <b>Crédito #${c.id}</b>.`,
                                        confirmText: "Continuar"
                                    });
                                    if (!res.isConfirmed) return;

                                    onAbrirCancelar?.({ credito: c });
                                } catch (err) {
                                    await swalError(err);
                                }
                            }}
                            title={estadoLower === "anulado" ? "Crédito anulado: no se puede cancelar." : "Cancelar crédito (pago anticipado)"}
                            disabled={estadoLower === "anulado"}
                        >
                            Cancelar crédito
                        </button>
                    )}

                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ${estadoClasses(c.estado)}`}>
                        {c.estado}
                    </span>

                    <ChevronDown size={18} className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </div>
            </header>

            {/* Aviso claro si está anulado/refinanciado y está abierto */}
            {isOpen && (estadoLower === "anulado" || estadoLower === "refinanciado") && (
                <div className="mx-4 mb-2 rounded border bg-gray-50 border-gray-200 p-3 text-xs text-gray-800">
                    <b>Acciones bloqueadas:</b> {estadoLower === "anulado" ? "crédito anulado, no se permiten pagos ni refinanciación." : "crédito refinanciado, los pagos deben hacerse sobre el crédito nuevo."}
                </div>
            )}

            {/* Leyenda + Resumen */}
            {isOpen && c.estado !== "pagado" &&
                (esLibre ? (
                    <div className="mx-4 mb-2 rounded border bg-emerald-50 border-emerald-100 p-3 text-xs text-gray-800">
                        <div className="mb-1">
                            <b>Crédito libre:</b> ciclos por calendario. El interés del ciclo se calcula sobre el <b>capital</b>. La <b>mora</b> corre al{" "}
                            <b>2,5% diario del interés</b> no pagado. Máximo 3 ciclos; en el 3er ciclo no se permiten abonos parciales.
                        </div>

                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                                <span className="font-medium">Vencimiento ciclo 1:</span> <span>{fechasCiclosCard[0] || "—"}</span>
                            </div>
                            <div>
                                <span className="font-medium">Vencimiento ciclo 2:</span> <span>{fechasCiclosCard[1] || "—"}</span>
                            </div>
                            <div>
                                <span className="font-medium">Vencimiento ciclo 3:</span> <span>{fechasCiclosCard[2] || "—"}</span>
                            </div>
                        </div>

                        {resumen?.loading ? (
                            <div className="mt-1 italic text-emerald-700">Calculando resumen…</div>
                        ) : resumen?.error ? (
                            <div className="mt-1 text-red-600">{resumen.error}</div>
                        ) : resumen?.data ? (
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-6 gap-2">
                                <div className="rounded bg-white border p-2">
                                    <div className="text-gray-600">Ciclo actual</div>
                                    <div className="font-semibold">{ciclo}/3</div>
                                </div>

                                <div className="rounded bg-white border p-2">
                                    <div className="text-gray-600">Capital pendiente</div>
                                    <div className="font-semibold">${money(libreCapital)}</div>
                                </div>

                                <div className="rounded bg-white border p-2">
                                    <div className="text-gray-600">Interés ciclo actual</div>
                                    <div className="font-semibold">${money(interesCicloActual)}</div>
                                </div>

                                <div className="rounded bg-white border p-2">
                                    <div className="text-gray-600">Mora ciclo actual</div>
                                    <div className="font-semibold">${money(moraCicloActual)}</div>
                                </div>

                                <div className="rounded bg-white border p-2">
                                    <div className="text-gray-600">Interés total pendiente</div>
                                    <div className="font-semibold">${money(interesTotalPendiente)}</div>
                                    <div className="mt-0.5 text-[11px] text-gray-500">Incluye ciclos anteriores + actual</div>
                                </div>

                                <div className="rounded bg-white border p-2">
                                    <div className="text-gray-600">Total a cancelar hoy</div>
                                    <div className="font-semibold">${money(totalPendienteHoy)}</div>
                                    <div className="mt-0.5 text-[11px] text-gray-500">Capital + Interés total + Mora total</div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className="mx-4 mb-2 text-xs text-gray-600">
                        <div className="inline-flex items-center gap-1">
                            <Info size={14} className="text-sky-600" />
                            <span>
                                Interés <b>proporcional (mín. 60%)</b> según períodos ({c.tipo_credito}). Estimación (hoy): Capital pendiente ${money(
                                    principalPendiente
                                )} + Mora (neta) ${money(moraAcumNeta)}.
                            </span>
                        </div>
                    </div>
                ))}

            <div
                className={`grid transition-all duration-500 ease-in-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100 border-t border-gray-200" : "grid-rows-[0fr] opacity-0"
                } overflow-hidden`}
            >
                <div className="overflow-hidden">
                    <div className="space-y-4 p-4 sm:p-6 pt-0">
                        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                            <div
                                className="flex flex-wrap items-center gap-2"
                                title={
                                    esLibre
                                        ? "LIBRE: interés por ciclo sobre capital; mora diaria sobre interés no pagado."
                                        : "Interés total aplicado sobre el capital del crédito."
                                }
                            >
                                <TrendingUp size={16} className="text-gray-500" />
                                <dt className="font-medium text-gray-600">{esLibre ? "Tasa por ciclo:" : "Interés total:"}</dt>
                                <dd className="font-mono text-gray-800">{esLibre ? `${tasaLibreFicha}%` : `${interesTotalPct}%`}</dd>
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
                                <dd className="text-gray-800">
                                    {safeLower(c.modalidad_credito) === "comun" ? "PLAN DE CUOTAS FIJAS" : c.modalidad_credito}
                                </dd>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <DollarSign size={16} className="text-gray-500" />
                                <dt className="font-medium text-gray-600">{esLibre ? "Capital pendiente:" : "Capital:"}</dt>
                                {/* ✅ FIX: en no-LIBRE capital = monto_acreditar (no saldo_actual) */}
                                <dd className="font-mono text-gray-800">${money(esLibre ? libreCapital : c.monto_acreditar)}</dd>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <BadgeDollarSign size={16} className="text-gray-500" />
                                <dt className="font-medium text-gray-600">{esLibre ? "Total a cancelar (hoy):" : "Saldo total actual:"}</dt>
                                <dd className="font-mono text-gray-900 font-semibold">${money(totalActualCard)}</dd>
                            </div>

                            {esLibre && (
                                <>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <TrendingUp size={16} className="text-gray-500" />
                                        <dt className="font-medium text-gray-600">Interés ciclo actual:</dt>
                                        <dd className="font-mono text-gray-800">${money(interesCicloActual)}</dd>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <XCircle size={16} className="text-gray-500" />
                                        <dt className="font-medium text-gray-600">Mora ciclo actual:</dt>
                                        <dd className="font-mono text-gray-800">${money(moraCicloActual)}</dd>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <TrendingUp size={16} className="text-gray-500" />
                                        <dt className="font-medium text-gray-600">Interés total pendiente:</dt>
                                        <dd className="font-mono text-gray-800">${money(interesTotalPendiente)}</dd>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <XCircle size={16} className="text-gray-500" />
                                        <dt className="font-medium text-gray-600">Mora total pendiente:</dt>
                                        <dd className="font-mono text-gray-800">${money(moraTotalPendiente)}</dd>
                                    </div>
                                </>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                                <CheckCircle2 size={16} className="text-gray-500" />
                                <dt className="font-medium text-gray-600">
                                    {esLibre ? "Monto acreditado (original):" : "Monto acreditado:"}
                                </dt>
                                <dd className="font-mono text-gray-800">${money(c.monto_acreditar)}</dd>
                            </div>

                            {esVentaFinanciada && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <FileText size={16} className="text-gray-500" />
                                    <dt className="font-medium text-gray-600">Detalle del producto:</dt>
                                    <dd className="text-gray-800">{detalleProducto || "Venta financiada"}</dd>
                                </div>
                            )}

                            {!esLibre && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <XCircle size={16} className="text-gray-500" />
                                    <dt className="font-medium text-gray-600">Total a devolver:</dt>
                                    <dd className="font-mono text-gray-800">
                                        {tieneDescuento ? (
                                            <>
                                                <span className="mr-2 text-sm text-gray-500 line-through">${money(totalSinDescuento)}</span>
                                                <span className="font-semibold text-green-700">${money(c.monto_total_devolver)}</span>
                                            </>
                                        ) : (
                                            <>${money(c.monto_total_devolver)}</>
                                        )}
                                    </dd>
                                </div>
                            )}

                            {Number(c.interes_acumulado) > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <TrendingUp size={16} className="text-gray-500" />
                                    <dt className="font-medium text-gray-600">
                                        {esLibre ? "Interés acumulado" : "Pagos de intereses acumulados:"}
                                    </dt>
                                    <dd className="font-mono text-gray-800">${money(c.interes_acumulado)}</dd>
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
                                <dd className="text-gray-800">{c.cobradorCredito?.nombre_completo ?? "—"}</dd>
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

                            {c.modalidad_credito !== "libre" && (
                                <>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <CalendarDays size={16} className="text-gray-500" />
                                        <dt className="font-medium text-gray-600">Primer vencimiento:</dt>
                                        <dd className="text-gray-800">{primerVtoCard}</dd>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <CalendarDays size={16} className="text-gray-500" />
                                        <dt className="font-medium text-gray-600">Fin de crédito:</dt>
                                        <dd className="text-gray-800">{ultimoVtoCard}</dd>
                                    </div>
                                </>
                            )}

                            {c.modalidad_credito !== "libre" && tieneDescuento && (
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
                                            <span className="text-gray-500">Cuota:</span> <span className="font-medium">#1 (abierta)</span>
                                        </div>

                                        {/* ✅ FIX: mostrar siempre el capital pendiente (resumen/saldo), NO cuotaLibre.importe_cuota */}
                                        <div>
                                            <span className="text-gray-500">Importe (capital):</span>{" "}
                                            <span className="font-medium">${money(libreCapital)}</span>
                                        </div>

                                        <div>
                                            <span className="text-gray-500">Vencimiento:</span>{" "}
                                            <span className="font-medium">Sin vencimiento</span>
                                        </div>
                                    </div>

                                    {!bloqueadoPorEstado && puedeImpactarPagos && (
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium ${
                                                    parcialBloqueado
                                                        ? "border-gray-300 text-gray-400 bg-white cursor-not-allowed"
                                                        : "border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50"
                                                }`}
                                                onClick={async () => {
                                                    if (parcialBloqueado) {
                                                        await swalBlocked("Abono parcial no disponible", "En el 3er ciclo no se permite abono parcial.");
                                                        return;
                                                    }
                                                    if (!cuotaLibre?.id) {
                                                        await Swal.fire({
                                                            icon: "error",
                                                            title: "No se encontró la cuota abierta",
                                                            text: "No se pudo determinar la cuota LIBRE para registrar el pago. Refresque e intente nuevamente.",
                                                            confirmButtonText: "Cerrar"
                                                        });
                                                        return;
                                                    }

                                                    try {
                                                        const res = await swalConfirm({
                                                            title: "Registrar abono parcial",
                                                            html: `Se abrirá el pago parcial para el <b>Crédito #${c.id}</b>.`,
                                                            confirmText: "Continuar"
                                                        });

                                                        if (!res.isConfirmed) return;

                                                        await onAbrirPagoLibre?.({ credito: c, cuotaLibreId: cuotaLibre.id, modo: "parcial" });
                                                    } catch (err) {
                                                        await swalError(err);
                                                    }
                                                }}
                                                disabled={parcialBloqueado}
                                                title={
                                                    motivoBloqueoPagos ||
                                                    (parcialBloqueado ? "En el 3er mes no se permite abono parcial" : "Registrar abono parcial (Crédito libre)")
                                                }
                                            >
                                                Abono parcial
                                            </button>

                                            <button
                                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                                onClick={async () => {
                                                    if (!cuotaLibre?.id) {
                                                        await Swal.fire({
                                                            icon: "error",
                                                            title: "No se encontró la cuota abierta",
                                                            text: "No se pudo determinar la cuota LIBRE para registrar el pago. Refresque e intente nuevamente.",
                                                            confirmButtonText: "Cerrar"
                                                        });
                                                        return;
                                                    }

                                                    try {
                                                        const res = await swalConfirm({
                                                            title: "Liquidar crédito",
                                                            html: `Se abrirá la liquidación total del <b>Crédito #${c.id}</b>.<br/>Total estimado hoy: <b>$${money(totalPendienteHoy)}</b>`,
                                                            confirmText: "Continuar"
                                                        });

                                                        if (!res.isConfirmed) return;

                                                        await onAbrirPagoLibre?.({ credito: c, cuotaLibreId: cuotaLibre.id, modo: "total" });
                                                    } catch (err) {
                                                        await swalError(err);
                                                    }
                                                }}
                                                title={motivoBloqueoPagos || "Liquidar crédito (Crédito libre)"}
                                            >
                                                Liquidar crédito
                                            </button>
                                        </div>
                                    )}

                                    {bloqueadoPorEstado && puedeImpactarPagos && (
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-400 bg-white cursor-not-allowed"
                                                disabled
                                                title={motivoBloqueoPagos || "Acción no disponible"}
                                                onClick={async () => {
                                                    await swalBlocked("Acción bloqueada", motivoBloqueoPagos || "Acción no disponible.");
                                                }}
                                            >
                                                Abono parcial
                                            </button>
                                            <button
                                                className="inline-flex items-center gap-1 rounded-md bg-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 cursor-not-allowed"
                                                disabled
                                                title={motivoBloqueoPagos || "Acción no disponible"}
                                                onClick={async () => {
                                                    await swalBlocked("Acción bloqueada", motivoBloqueoPagos || "Acción no disponible.");
                                                }}
                                            >
                                                Liquidar crédito
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <CuotasTabla cuotas={c.cuotas} interesCredito={c.interes} refetch={refetchCreditos} creditoEstado={c.estado} />
                            )}
                        </section>
                    </div>
                </div>
            </div>
        </article>
    );
};

export default CreditoCard;