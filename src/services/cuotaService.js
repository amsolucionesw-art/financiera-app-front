// src/services/cuotaService.js

import apiFetch from './apiClient.js';

/* ───────────────── Config & helpers de ruta ───────────────── */

const API_PREFIX = import.meta.env.VITE_API_PREFIX ?? ''; // por defecto sin prefijo

// Une segmentos evitando dobles slashes
const joinPath = (...parts) =>
    '/' +
    parts
        .filter(Boolean)
        .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
        .join('/');

const BASE_CUOTAS = joinPath(API_PREFIX, 'cuotas');
const BASE_PAGOS = joinPath(API_PREFIX, 'pagos');
const BASE_FORMAS = joinPath(API_PREFIX, 'formas-pago');
const BASE_CREDIT = joinPath(API_PREFIX, 'creditos');

/* ───────────────── Helpers de respuesta ───────────────── */
/**
 * apiFetch a veces devuelve el payload directo y a veces {success, data}.
 * Esto devuelve data SOLO si detecta claramente ese formato.
 */
const unwrapSoft = (resp) => {
    if (!resp) return resp;
    if (resp?.data !== undefined && (resp?.success === true || resp?.success === false)) return resp.data;
    return resp;
};

/* ───────────────── Normalización de errores (CRÍTICO para UI) ───────────────── */
/**
 * Objetivo:
 * - preservar status + message que vienen del backend
 * - soportar distintas formas (fetch, axios-like, throws "Error" simple)
 * - devolver SIEMPRE un Error con props {status, data} para que el front pueda leerlo
 */
const normalizeApiError = (e, fallbackMessage = 'Error de red o servidor.') => {
    const status =
        e?.status ??
        e?.response?.status ??
        e?.response?.data?.status ??
        e?.data?.status ??
        null;

    const data = e?.response?.data ?? e?.data ?? null;

    const message =
        data?.message ??
        data?.error ??
        e?.message ??
        fallbackMessage;

    const err = new Error(message || fallbackMessage);
    if (status !== null && status !== undefined) err.status = status;
    if (data !== null && data !== undefined) err.data = data;

    // útil para logs si quieren
    if (e?.stack) err.stack = e.stack;

    return err;
};

// Wrapper para calls a apiFetch donde queremos errores “limpios” hacia la UI
const apiFetchSafe = async (url, options, fallbackMessage) => {
    try {
        return await apiFetch(url, options);
    } catch (e) {
        throw normalizeApiError(e, fallbackMessage);
    }
};

/* ───────────────── Helpers numéricos ───────────────── */
/**
 * Parse robusto:
 * - "1.234,56" (AR) -> 1234.56
 * - "1,234.56" (US) -> 1234.56
 * - "1234,56"       -> 1234.56
 * - "1234.56"       -> 1234.56
 * - "1.234" (miles) -> 1234
 * - "1,234" (miles) -> 1234
 * Regla:
 * - Si hay '.' y ',', el último separador es decimal; el otro son miles.
 * - Si hay un solo separador:
 *   - si tiene 1-2 decimales -> decimal
 *   - si tiene exactamente 3 dígitos al final -> miles (caso típico "1.234")
 */
const sanitizeNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    let s = String(value).trim();
    if (s === '') return 0;

    // Limpiar espacios y símbolos (dejamos dígitos, separadores y signo)
    s = s.replace(/\s+/g, '').replace(/[^\d.,-]/g, '');

    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');

    const hasDot = lastDot !== -1;
    const hasComma = lastComma !== -1;

    const toNumber = (txt) => {
        const n = Number(txt);
        return Number.isFinite(n) ? n : 0;
    };

    // Caso con ambos separadores: el último manda como decimal
    if (hasDot && hasComma) {
        const decimalIsDot = lastDot > lastComma;
        if (decimalIsDot) {
            // miles = coma, decimal = punto
            const normalized = s.replace(/,/g, '');
            return toNumber(normalized);
        } else {
            // miles = punto, decimal = coma
            const normalized = s.replace(/\./g, '').replace(',', '.');
            return toNumber(normalized);
        }
    }

    // Solo coma
    if (hasComma && !hasDot) {
        const parts = s.split(',');
        if (parts.length !== 2) return toNumber(s.replace(/,/g, '')); // múltiples comas raras -> las quito
        const [intPart, decPart] = parts;
        // 1-2 decimales => decimal
        if (decPart.length >= 1 && decPart.length <= 2) {
            return toNumber(`${intPart.replace(/,/g, '')}.${decPart}`);
        }
        // 3 decimales exactos suele ser miles ("1,234")
        if (decPart.length === 3 && intPart.replace('-', '').length <= 3) {
            return toNumber(`${intPart}${decPart}`); // quita la coma
        }
        // fallback: tratamos coma como decimal igualmente
        return toNumber(`${intPart}.${decPart}`);
    }

    // Solo punto
    if (hasDot && !hasComma) {
        const parts = s.split('.');
        if (parts.length !== 2) return toNumber(s.replace(/\./g, '')); // múltiples puntos -> los quito
        const [intPart, decPart] = parts;
        if (decPart.length >= 1 && decPart.length <= 2) {
            return toNumber(`${intPart}.${decPart}`);
        }
        if (decPart.length === 3 && intPart.replace('-', '').length <= 3) {
            return toNumber(`${intPart}${decPart}`); // "1.234" => 1234
        }
        return toNumber(`${intPart}.${decPart}`);
    }

    // Sin separadores
    return toNumber(s.replace(/[^\d-]/g, ''));
};

/* ───────────────── CRUD Cuotas ───────────────── */

export const crearCuota = (data) =>
    apiFetch(BASE_CUOTAS, {
        method: 'POST',
        body: data,
    });

export const obtenerCuotas = async () => unwrapSoft(await apiFetch(BASE_CUOTAS));

/** NUEVO: Obtener solo cuotas vencidas */
export const obtenerCuotasVencidas = async (params = {}) =>
    unwrapSoft(await apiFetch(joinPath(BASE_CUOTAS, 'vencidas'), { params }));

/** NUEVO: Ruta de cobro automática del cobrador logueado */
export const obtenerRutaCobroCobrador = async (params = {}) =>
    unwrapSoft(await apiFetch(joinPath(BASE_CUOTAS, 'ruta-cobro'), { params }));

export const obtenerCuotaPorId = async (id) => unwrapSoft(await apiFetch(joinPath(BASE_CUOTAS, id)));

export const actualizarCuota = (id, data) =>
    apiFetch(joinPath(BASE_CUOTAS, id), {
        method: 'PUT',
        body: data,
    });

export const eliminarCuota = (id) =>
    apiFetch(joinPath(BASE_CUOTAS, id), { method: 'DELETE' });

export const obtenerCuotasPorCredito = async (creditoId) =>
    unwrapSoft(await apiFetch(joinPath(BASE_CUOTAS, 'credito', creditoId)));

export const actualizarVencidas = () =>
    apiFetch(joinPath(BASE_CUOTAS, 'actualizar-vencidas'), { method: 'PUT' });

export const recalcularMoraCuota = (cuotaId) =>
    apiFetch(joinPath(BASE_CUOTAS, cuotaId, 'recalcular-mora'), { method: 'PUT' });

export const recalcularMora = (payload) =>
    apiFetch(joinPath(BASE_CUOTAS, 'recalcular-mora'), {
        method: 'POST',
        body: payload,
    });

/* ───────────────── Pagos ───────────────── */

export const obtenerPagosPorCuota = async (cuotaId) =>
    unwrapSoft(await apiFetch(joinPath(BASE_PAGOS, 'cuota', cuotaId)));

/**
 * Registrar un abono parcial
 *
 * ✅ BACK REAL: POST /pagos
 * (Tu backend expone pagos en /api/pagos y /api/pagos/total)
 */
export const registrarPagoParcial = ({
    cuota_id,
    monto_pagado,
    forma_pago_id,
    observacion,
    descuento = 0,

    // compat / backend nuevo
    descuento_scope = null, // 'mora' | 'total'
    descuento_mora = null,  // puede ser % (LIBRE) o monto (NO-LIBRE)
    modo, // legacy si lo usaban
}) =>
    apiFetchSafe(
        BASE_PAGOS,
        {
            method: 'POST',
            body: {
                cuota_id,
                monto_pagado: sanitizeNumber(monto_pagado),
                forma_pago_id,
                observacion,
                descuento: sanitizeNumber(descuento),

                ...(descuento_scope != null ? { descuento_scope: String(descuento_scope).toLowerCase() } : {}),
                ...(descuento_mora != null ? { descuento_mora: sanitizeNumber(descuento_mora) } : {}),

                ...(modo ? { modo } : {}),
            },
        },
        'No se pudo registrar el abono parcial.'
    );

/**
 * PAGO TOTAL / LIQUIDACIÓN
 *
 * ✅ BACK REAL: POST /pagos/total
 *
 * Campos compat:
 * - descuento_scope / descuento_mora (LIBRE)
 * - ciclo_libre (LIBRE: pagar ciclo viejo explícito)
 * - monto_pagado (LIBRE: permitir pagar un monto específico en "total")
 * - descuento_sobre / descuento_porcentaje (otros flujos legacy, si existieran)
 */
export const registrarPagoTotal = async ({
    cuota_id,
    forma_pago_id,
    observacion,
    descuento = 0,

    // LIBRE (backend nuevo)
    descuento_scope = null, // 'mora' | 'total'
    descuento_mora = null,  // % sobre mora (LIBRE)
    ciclo_libre = null,
    monto_pagado = null,

    // compat legacy / otros flujos
    descuento_sobre, // 'mora' | 'total' | etc.
    descuento_porcentaje,
}) => {
    const body = {
        cuota_id,
        forma_pago_id,
        observacion,

        // mantenemos por compat (backend lo resuelve por modalidad)
        descuento: sanitizeNumber(descuento),

        ...(descuento_scope != null ? { descuento_scope: String(descuento_scope).toLowerCase() } : {}),
        ...(descuento_mora != null ? { descuento_mora: sanitizeNumber(descuento_mora) } : {}),

        ...(ciclo_libre != null ? { ciclo_libre: sanitizeNumber(ciclo_libre) } : {}),
        ...(monto_pagado != null ? { monto_pagado: sanitizeNumber(monto_pagado) } : {}),

        ...(descuento_sobre ? { descuento_sobre: String(descuento_sobre).toLowerCase() } : {}),
        ...(descuento_porcentaje !== undefined && descuento_porcentaje !== null
            ? { descuento_porcentaje: sanitizeNumber(descuento_porcentaje) }
            : {}),
    };

    return await apiFetchSafe(
        joinPath(BASE_PAGOS, 'total'),
        {
            method: 'POST',
            body,
        },
        'No se pudo registrar el pago total.'
    );
};

/**
 * Compatibilidad: pagar cuota completa
 * Acepta:
 * - cuotaId o cuota_id
 * - forma_pago_id o formaId
 *
 * + Props extra para LIBRE:
 * - descuento_scope / descuento_mora / ciclo_libre / monto_pagado
 */
export const pagarCuota = ({
    cuotaId,
    cuota_id,
    forma_pago_id,
    formaId,
    observacion,
    descuento = 0,

    // LIBRE (nuevo)
    descuento_scope = null,
    descuento_mora = null,
    ciclo_libre = null,
    monto_pagado = null,

    // legacy
    descuento_sobre,
    descuento_porcentaje,

    // ✅ NUEVO: alias compat para modal (manda "monto" además de monto_pagado)
    monto = null,
}) =>
    registrarPagoTotal({
        cuota_id: cuota_id ?? cuotaId,
        forma_pago_id: forma_pago_id ?? formaId,
        observacion,
        descuento,

        descuento_scope,
        descuento_mora,
        ciclo_libre,

        // ✅ Si mandan "monto" desde UI, lo convertimos a monto_pagado
        monto_pagado: monto_pagado ?? monto,

        descuento_sobre,
        descuento_porcentaje,
    });

/** Listar formas de pago */
export const obtenerFormasDePago = async () => unwrapSoft(await apiFetch(BASE_FORMAS));

/* ───────────────── Helpers compuestos ───────────────── */

export const obtenerCuotasConPagos = async (creditoId) => {
    const cuotas = await obtenerCuotasPorCredito(creditoId);
    if (!Array.isArray(cuotas) || cuotas.length === 0) return [];

    // ¿Ya vienen con pagos?
    const faltantes = cuotas.filter((c) => !Array.isArray(c.pagos));
    if (faltantes.length === 0) return cuotas;

    const pagosMap = new Map();
    await Promise.all(
        faltantes.map(async (c) => {
            const pagos = await obtenerPagosPorCuota(c.id).catch(() => []);
            pagosMap.set(c.id, Array.isArray(pagos) ? pagos : []);
        })
    );

    return cuotas.map((c) => (Array.isArray(c.pagos) ? c : { ...c, pagos: pagosMap.get(c.id) || [] }));
};

/**
 * Resumen de crédito LIBRE
 * Backend: GET /creditos/:id/resumen-libre[?fecha=YYYY-MM-DD]
 */
export const obtenerResumenLibre = async (creditoId, fecha) =>
    unwrapSoft(
        await apiFetch(joinPath(BASE_CREDIT, creditoId, 'resumen-libre'), {
            params: fecha ? { fecha } : undefined,
        })
    );

export default {
    crearCuota,
    obtenerCuotas,
    obtenerCuotasVencidas,
    obtenerRutaCobroCobrador,
    obtenerCuotaPorId,
    actualizarCuota,
    eliminarCuota,
    obtenerCuotasPorCredito,
    actualizarVencidas,
    recalcularMoraCuota,
    recalcularMora,
    obtenerPagosPorCuota,
    registrarPagoParcial,
    registrarPagoTotal,
    pagarCuota,
    obtenerFormasDePago,
    obtenerCuotasConPagos,
    obtenerResumenLibre,
};

