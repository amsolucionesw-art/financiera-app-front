// src/services/cuotaService.js

import apiFetch from './apiClient';

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

/* ───────────────── Helpers numéricos ───────────────── */
/**
 * Soporta: "1.234,56" · "1,234.56" · "1234,56" · "1234.56" · "-1.234,56" · "1 234,56"
 * Regla: el ÚLTIMO '.' o ',' es el separador decimal; el resto son miles.
 */
const sanitizeNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    const s0 = String(value).trim();
    if (s0 === '') return 0;

    const m = s0.match(/[.,](?=[^.,]*$)/);
    if (m) {
        const i = m.index;
        const intRaw = s0.slice(0, i).replace(/[^\d-]/g, ''); // preserva posible signo
        const fracRaw = s0.slice(i + 1).replace(/\D/g, '');
        const normalized = `${intRaw}.${fracRaw}`;
        const n = Number(normalized);
        return Number.isFinite(n) ? n : 0;
    }
    const n = Number(s0.replace(/[^\d-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};

/* ───────────────── CRUD Cuotas ───────────────── */

/** Crear una nueva cuota (normalmente no se usa directamente) */
export const crearCuota = (data) =>
    apiFetch(BASE_CUOTAS, {
        method: 'POST',
        body: data,
    });

/** Obtener todas las cuotas (el backend actualiza mora internamente) */
export const obtenerCuotas = () => apiFetch(BASE_CUOTAS);

/** NUEVO: Obtener solo cuotas vencidas (para la notificación/tabla dedicada)
 * Acepta filtros por querystring:
 *   { clienteId?, cobradorId?, zonaId?, desde?, hasta?, minDiasVencida? }
 */
export const obtenerCuotasVencidas = (params = {}) =>
    apiFetch(joinPath(BASE_CUOTAS, 'vencidas'), { params });

/** Obtener una cuota por ID */
export const obtenerCuotaPorId = (id) => apiFetch(joinPath(BASE_CUOTAS, id));

/** Actualizar una cuota */
export const actualizarCuota = (id, data) =>
    apiFetch(joinPath(BASE_CUOTAS, id), {
        method: 'PUT',
        body: data,
    });

/** Eliminar una cuota */
export const eliminarCuota = (id) =>
    apiFetch(joinPath(BASE_CUOTAS, id), { method: 'DELETE' });

/** Obtener cuotas por crédito (el backend recalcula mora antes de devolver y suele incluir pagos) */
export const obtenerCuotasPorCredito = (creditoId) =>
    apiFetch(joinPath(BASE_CUOTAS, 'credito', creditoId));

/** Forzar actualización de cuotas vencidas (backend marca vencidas < hoy) */
export const actualizarVencidas = () =>
    apiFetch(joinPath(BASE_CUOTAS, 'actualizar-vencidas'), { method: 'PUT' });

/** Recalcular mora de una cuota (idempotente) */
export const recalcularMoraCuota = (cuotaId) =>
    apiFetch(joinPath(BASE_CUOTAS, cuotaId, 'recalcular-mora'), { method: 'PUT' });

/**
 * Recalcular mora por lote (idempotente).
 * Acepta:
 *   - { credito_id }
 *   - { cuota_ids: [..] }
 *   - { todas_vencidas: true }
 */
export const recalcularMora = (payload) =>
    apiFetch(joinPath(BASE_CUOTAS, 'recalcular-mora'), {
        method: 'POST',
        body: payload,
    });

/* ───────────────── Pagos ───────────────── */

/** Obtener pagos de una cuota */
export const obtenerPagosPorCuota = (cuotaId) =>
    apiFetch(joinPath(BASE_PAGOS, 'cuota', cuotaId));

/**
 * Registrar un abono parcial (incluye opcional descuento).
 * Backend: POST /pagos
 * - En "libre": primero interés de ciclos (y faltante del actual), luego capital.
 *      - En Mes 1/2, si se envía `modo: "solo_interes"`, el back capará el monto al interés del ciclo.
 *      - En Mes 3, el back **rechaza** el pago parcial (HTTP 400).
 * - En "común/progresivo": primero mora, luego principal.
 * Respuesta: { success, message, cuota, recibo, recibo_ui }
 */
export const registrarPagoParcial = ({
    cuota_id,
    monto_pagado,
    forma_pago_id,
    observacion,
    descuento = 0,
    modo, // opcional: "solo_interes" | "interes_y_capital"
}) =>
    apiFetch(BASE_PAGOS, {
        method: 'POST',
        body: {
            cuota_id,
            monto_pagado: sanitizeNumber(monto_pagado),
            forma_pago_id,
            observacion,
            descuento: sanitizeNumber(descuento),
            ...(modo ? { modo } : {}),
        },
    });

/**
 * Registra un PAGO TOTAL / LIQUIDACIÓN de cuota
 * Backend: POST /pagos/total
 * - LIBRE: liquida interés de ciclo(s) + capital (descuento como % sobre el total).
 * - COMÚN/PROGRESIVO: paga mora + principal (descuento como MONTO sobre principal).
 * Respuesta: { success, message, cuota, recibo, recibo_ui }
 */
export const registrarPagoTotal = ({
    cuota_id,
    forma_pago_id,
    observacion,
    descuento = 0,
}) =>
    apiFetch(joinPath(BASE_PAGOS, 'total'), {
        method: 'POST',
        body: {
            cuota_id,
            forma_pago_id,
            observacion,
            descuento: sanitizeNumber(descuento),
        },
    });

/**
 * Compatibilidad: pagar cuota completa (redirige a /pagos/total)
 * - Usa { cuotaId, forma_pago_id, observacion, descuento }
 */
export const pagarCuota = ({ cuotaId, forma_pago_id, observacion, descuento = 0 }) =>
    registrarPagoTotal({
        cuota_id: cuotaId,
        forma_pago_id,
        observacion,
        descuento,
    });

/** Listar formas de pago */
export const obtenerFormasDePago = () => apiFetch(BASE_FORMAS);

/* ───────────────── Helpers compuestos ───────────────── */
/**
 * Helper para la UI: trae cuotas + historial de pagos sin N+1.
 * Si el back YA incluye `pagos` en /cuotas/credito/:id, se usa directamente.
 * Si faltan, solo consulta los pagos de esas cuotas específicas.
 */
export const obtenerCuotasConPagos = async (creditoId) => {
    const cuotas = await obtenerCuotasPorCredito(creditoId);
    if (!Array.isArray(cuotas) || cuotas.length === 0) return [];

    // ¿Ya vienen con pagos?
    const faltantes = cuotas.filter((c) => !Array.isArray(c.pagos));
    if (faltantes.length === 0) return cuotas;

    // Cargar pagos solo para las que no traen
    const pagosMap = new Map();
    await Promise.all(
        faltantes.map(async (c) => {
            const pagos = await obtenerPagosPorCuota(c.id).catch(() => []);
            pagosMap.set(c.id, pagos);
        })
    );

    return cuotas.map((c) => (Array.isArray(c.pagos) ? c : { ...c, pagos: pagosMap.get(c.id) || [] }));
};

/**
 * Resumen de crédito LIBRE (para mostrar ciclo actual, interés del ciclo y total de liquidación)
 * Backend: GET /creditos/:id/resumen-libre[?fecha=YYYY-MM-DD]
 * Retorna: { saldo_capital, interes_pendiente_hoy, total_liquidacion_hoy, tasa_decimal, hoy, ciclo_actual }
 */
export const obtenerResumenLibre = (creditoId, fecha) =>
    apiFetch(joinPath(BASE_CREDIT, creditoId, 'resumen-libre'), {
        params: fecha ? { fecha } : undefined,
    });

export default {
    crearCuota,
    obtenerCuotas,
    obtenerCuotasVencidas,
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
