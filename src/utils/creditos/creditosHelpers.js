// src/utils/creditos/creditosHelpers.js
/* Helpers puros para InfoCreditos (sin React / sin estado) */

/* ───────── Formato ───────── */

// Convierte números o strings (AR/US) a número seguro
const toNumberSafe = (v) => {
    if (v === null || v === undefined) return 0;

    // number directo
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;

    // boolean raro, pero mejor que explote
    if (typeof v === "boolean") return v ? 1 : 0;

    // string
    const s = String(v).trim();
    if (!s) return 0;

    // Si tiene coma, asumimos formato es-AR: miles '.' y decimal ','
    // Ej: "30.250,50" => "30250.50"
    if (s.includes(",")) {
        const normalized = s.replace(/\./g, "").replace(",", ".");
        const n = Number(normalized);
        return Number.isFinite(n) ? n : 0;
    }

    // Si no tiene coma:
    // - Puede ser "220.000" (miles AR sin decimales) o "1234.56" (US decimal)
    // Regla:
    //   si tiene puntos y el último grupo tiene exactamente 3 dígitos => miles -> quitamos puntos
    //   si no => lo dejamos como decimal normal
    if (s.includes(".")) {
        const parts = s.split(".");
        const last = parts[parts.length - 1] || "";
        const onlyDigits = /^\d+$/.test(last);

        // "220.000" => miles
        if (onlyDigits && last.length === 3 && parts.length > 1) {
            const normalized = s.replace(/\./g, "");
            const n = Number(normalized);
            return Number.isFinite(n) ? n : 0;
        }

        // "1234.56" => decimal
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    }

    // Sin separadores
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
};

export const money = (n) =>
    toNumberSafe(n).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

export const safeLower = (v) => String(v ?? "").trim().toLowerCase();

/* ───────── Fechas ───────── */
export const getPeriodDays = (tipo) => (tipo === "semanal" ? 7 : tipo === "quincenal" ? 15 : 30);

export const diffDays = (a, b) => {
    const ms = new Date(a).setHours(0, 0, 0, 0) - new Date(b).setHours(0, 0, 0, 0);
    return Math.floor(ms / 86400000);
};

/** Suma días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD */
export const addDaysStr = (dateStr, days) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + Number(days || 0));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

export const parseYMD = (s) => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
};

export const between = (dateStr, desde, hasta) => {
    if (!desde && !hasta) return true;
    const d = parseYMD(dateStr);
    if (!d) return false;
    if (desde && d < parseYMD(desde)) return false;
    if (hasta && d > parseYMD(hasta)) return false;
    return true;
};

/* ───────── LIBRE: ancla y ciclo mensual ───────── */

/**
 * Ancla de ciclos para LIBRE:
 * - Regla: fecha_compromiso_pago define el vencimiento del ciclo 1 / cronología de ciclos.
 * - Fallback defensivo: fecha_acreditacion.
 */
export const baseCiclosLibre = (credito) => {
    return credito?.fecha_compromiso_pago || credito?.fecha_acreditacion || null;
};

const ymdToDate = (s) => {
    try {
        const [y, m, d] = String(s).split("-").map((x) => parseInt(x, 10));
        if (!y || !m || !d) return null;
        return new Date(y, m - 1, d);
    } catch {
        return null;
    }
};

const dateToYMD = (dt) => {
    if (!dt || Number.isNaN(dt.getTime())) return null;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

/**
 * Suma meses a YYYY-MM-DD manteniendo "día del mes" en lo posible.
 * Nota: Date.setMonth puede "derramar" al mes siguiente si el día no existe,
 * pero para nuestro uso (vencimientos = base + N meses - 1 día) se comporta estable.
 */
const addMonthsYMD = (s, months) => {
    const dt = ymdToDate(s);
    if (!dt) return null;
    dt.setMonth(dt.getMonth() + Number(months || 0));
    return dateToYMD(dt);
};

/**
 * Ciclo mensual por calendario para LIBRE (1..3):
 * - base: fecha_compromiso_pago (fallback acreditación)
 * - ciclo 1: [base, base+1mes)
 * - ciclo 2: [base+1mes, base+2mes)
 * - ciclo 3: [base+2mes, base+3mes)
 * - cap 3
 */
export const cicloLibrePorCalendario = (credito, hoyYMD = null) => {
    const base = baseCiclosLibre(credito);
    if (!base) return 1;

    const hoy = hoyYMD || dateToYMD(new Date());
    if (!hoy) return 1;

    // límites (inicio de cada ciclo)
    const i1 = base;
    const i2 = addMonthsYMD(base, 1);
    const i3 = addMonthsYMD(base, 2);
    const i4 = addMonthsYMD(base, 3);

    // si algo falló, fallback a ciclo 1
    if (!i2 || !i3 || !i4) return 1;

    // Comparación lexicográfica funciona en YYYY-MM-DD
    if (hoy < i2) return 1;
    if (hoy < i3) return 2;
    // desde i3 en adelante es ciclo 3 (capped), incluso si hoy > i4
    return 3;
};

/**
 * Compat:
 * - Si se llama como antes: cicloActualDesde(fecha_acreditacion, tipo_credito)
 *   => mantiene cálculo por días (7/15/30) capped 3
 *
 * - Nuevo (recomendado):
 *   - cicloActualDesde(credito) => si es LIBRE usa calendario (anclado en compromiso)
 *
 * - Extensión defensiva:
 *   - cicloActualDesde(baseYMD, tipo_credito, 'libre')
 *     => usa calendario con base = baseYMD (típicamente fecha_compromiso_pago)
 */
export const cicloActualDesde = (arg1, arg2, arg3) => {
    // Nueva firma: cicloActualDesde(credito)
    if (arg1 && typeof arg1 === "object" && !Array.isArray(arg1)) {
        const credito = arg1;
        const mod = safeLower(credito.modalidad_credito);
        if (mod === "libre") {
            return cicloLibrePorCalendario(credito);
        }

        // No-libre: fallback al comportamiento viejo usando acreditación + tipo
        const fa = credito.fecha_acreditacion || null;
        const tipo = credito.tipo_credito || "mensual";
        if (!fa) return 1;

        const days = Math.max(diffDays(new Date(), fa), 0);
        const period = getPeriodDays(tipo);
        return Math.min(3, Math.floor(days / period) + 1);
    }

    // Extensión: cicloActualDesde(baseYMD, tipo, 'libre') => calendario
    if (safeLower(arg3) === "libre") {
        const baseYMD = arg1;
        if (!baseYMD) return 1;
        return cicloLibrePorCalendario({ modalidad_credito: "libre", fecha_compromiso_pago: baseYMD });
    }

    // Firma vieja: cicloActualDesde(fecha_acreditacion, tipo_credito)
    const fecha_acreditacion = arg1;
    const tipo_credito = arg2;

    if (!fecha_acreditacion) return 1;
    const days = Math.max(diffDays(new Date(), fecha_acreditacion), 0);
    const period = getPeriodDays(tipo_credito);
    return Math.min(3, Math.floor(days / period) + 1);
};

/**
 * Calcula las fechas de los 3 ciclos de un crédito LIBRE.
 * Fuente principal: backend (credito.fechas_ciclos_libre).
 * Fallback: desde baseCiclosLibre (mensual), vencimiento = (base + N meses) - 1 día.
 */
export const fechasCiclosLibre = (credito) => {
    const fc = credito?.fechas_ciclos_libre || credito?.fechasCiclosLibre || null;
    if (fc && (fc.vencimiento_ciclo_1 || fc.vencimiento_ciclo_2 || fc.vencimiento_ciclo_3)) {
        return [fc.vencimiento_ciclo_1 || null, fc.vencimiento_ciclo_2 || null, fc.vencimiento_ciclo_3 || null];
    }

    const base = baseCiclosLibre(credito);
    if (!base) return [null, null, null];

    const v1 = addDaysStr(addMonthsYMD(base, 1), -1);
    const v2 = addDaysStr(addMonthsYMD(base, 2), -1);
    const v3 = addDaysStr(addMonthsYMD(base, 3), -1);
    return [v1, v2, v3];
};

export const tieneCuotasVencidas = (c) =>
    Array.isArray(c?.cuotas) && c.cuotas.some((q) => safeLower(q?.estado) === "vencida");

/* ───────── Filtros ───────── */
export const ESTADOS = ["pendiente", "parcial", "vencido", "pagado", "refinanciado", "anulado"];
export const MODALIDADES = ["comun", "progresivo", "libre"];
export const TIPOS = ["semanal", "quincenal", "mensual"];

// Modalidades que pueden refinanciarse (ajustable por negocio)
export const MODALIDADES_REFINANCIABLES = ["comun", "progresivo", "libre"];

/* ───────── Estilos por modalidad ───────── */
export const badgeByModalidad = (m) => {
    const mm = safeLower(m);
    if (mm === "libre") return "bg-emerald-100 text-emerald-700 border border-emerald-200";
    if (mm === "progresivo") return "bg-violet-100 text-violet-700 border-violet-200";
    return "bg-sky-100 text-sky-700 border-sky-200"; // comun
};

export const leftBorderByModalidad = (m) => {
    const mm = safeLower(m);
    if (mm === "libre") return "border-l-4 border-emerald-500";
    if (mm === "progresivo") return "border-l-4 border-violet-500";
    return "border-l-4 border-sky-500"; // comun
};

/* ───────── Cálculos ───────── */
export const LIBRE_VTO_FICTICIO = "2099-12-31";

/**
 * TOTAL ACTUAL (Front) UNIFICADO
 * Para cada cuota NO pagada, suma: (importe + mora_neta) - pagado
 * mora_neta = max(mora_bruta - descuento_mora, 0)
 * En LIBRE: desc_mora = 0 (por regla actual del front).
 */
export const calcularTotalActualFront = (credito) => {
    if (!credito) return 0;
    let total = 0;

    for (const c of credito.cuotas || []) {
        const estado = String(c.estado || "").toLowerCase();
        if (!["pendiente", "parcial", "vencida"].includes(estado)) continue;

        const importe = Number(c.importe_cuota || 0);
        const pagado = Number(c.monto_pagado_acumulado || 0);
        const moraBruta = Number(c.intereses_vencidos_acumulados || 0);

        const esLibre = String(c.fecha_vencimiento) === LIBRE_VTO_FICTICIO;
        const descMora = esLibre ? 0 : Number(c.descuento_cuota || 0);
        const moraNeta = Math.max(moraBruta - descMora, 0);

        const saldo = Math.max(+((importe + moraNeta) - pagado).toFixed(2), 0);
        total = +(total + saldo).toFixed(2);
    }

    return total;
};