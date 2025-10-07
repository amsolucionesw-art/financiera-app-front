// src/services/creditoService.js

import apiFetch from './apiClient';

/* ───────────────── Config & helpers de ruta ───────────────── */

const API_PREFIX = import.meta.env.VITE_API_PREFIX ?? ''; // por defecto sin prefijo

// Une segmentos asegurando que no queden dobles slashes internos
const joinPath = (...parts) =>
    '/' +
    parts
        .filter(Boolean)
        .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
        .join('/');

const BASE = joinPath(API_PREFIX, 'creditos');

/* ───────────────── Helpers numéricos ───────────────── */

const sanitizeNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return 0;
        // admite "1.234,56" o "1234,56" o "1234.56"
        return Number(trimmed.replace(/\./g, '').replace(',', '.')) || 0;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const sanitizeInt = (value, min = 1) => {
    const n = parseInt(sanitizeNumber(value), 10);
    if (!Number.isFinite(n) || isNaN(n)) return min;
    return Math.max(min, n);
};

// Compat: apiFetch ya devuelve payload.data o el objeto directo;
// dejo unwrap por si recibes algo anidado desde otros puntos.
const unwrap = (resp) => (resp && resp.data !== undefined ? resp.data : resp);

/* ───────────────── Helpers de refinanciación (front-only, puros) ───────────────── */

/** Tasa mensual según opción seleccionada. */
export const tasaMensualFromOpcion = (opcion, tasaManual = 0) => {
    if (opcion === 'P1') return 25;
    if (opcion === 'P2') return 15;
    if (opcion === 'manual') return Math.max(0, sanitizeNumber(tasaManual));
    throw new Error('Opción de refinanciación inválida');
};

/** Cantidad de periodos por mes según tipo de crédito. */
export const periodLengthFromTipo = (tipo) => {
    if (tipo === 'semanal') return 4;
    if (tipo === 'quincenal') return 2;
    return 1; // mensual (default)
};

/**
 * Previsualiza cálculo de refinanciación con la nueva regla:
 * - Interés por período (no sobre el total): tasaMensual / periodLength
 * - Interés total = saldo * (tasaPeriodo/100) * cantidad_cuotas
 * - Total a devolver = saldo + interés total
 * - Cuota estimada = total / cantidad_cuotas
 */
export const previewRefinanciacion = ({
    saldo,
    opcion,         // 'P1' | 'P2' | 'manual'
    tasaManual = 0, // si 'manual'
    tipo_credito,   // 'mensual' | 'quincenal' | 'semanal'
    cantidad_cuotas
}) => {
    const s = sanitizeNumber(saldo);
    const n = sanitizeInt(cantidad_cuotas, 1);
    const pl = periodLengthFromTipo(tipo_credito);
    const tasaMensual = tasaMensualFromOpcion(opcion, tasaManual);
    const tasaPorPeriodo = tasaMensual / pl; // p.ej., semanal P2 -> 15/4 = 3.75%
    const interesTotalPct = tasaPorPeriodo * n; // en %
    const interesTotalMonto = +(s * (interesTotalPct / 100)).toFixed(2);
    const total = +(s + interesTotalMonto).toFixed(2);
    const cuota = +(total / n).toFixed(2);

    return {
        saldo: s,
        tasa_mensual: tasaMensual,
        tasa_por_periodo: +(tasaPorPeriodo.toFixed(4)),
        cantidad_cuotas: n,
        interes_total_pct: +(interesTotalPct.toFixed(4)),
        interes_total_monto: interesTotalMonto,
        total_a_devolver: total,
        cuota_estimada: cuota
    };
};

/* ───────────────── Créditos: CRUD & queries ───────────────── */

/**
 * Obtiene todos los créditos (con filtros opcionales).
 * @param {object} params - { estado, cliente_id, ... }
 */
export const obtenerCreditos = (params = {}) =>
    apiFetch(BASE, { params });

/** Obtiene los créditos de un cliente */
export const obtenerCreditosPorCliente = (clienteId) =>
    apiFetch(joinPath(BASE, 'cliente', clienteId));

/** Obtiene un crédito por su ID */
export const obtenerCreditoPorId = (id) =>
    apiFetch(joinPath(BASE, id));

/**
 * Resumen de crédito LIBRE (capital, interés del día y total de liquidación).
 * Backend: GET /creditos/:id/resumen-libre?fecha=YYYY-MM-DD
 * @param {number|string} id
 * @param {string} [fecha] - YYYY-MM-DD (opcional)
 */
export const obtenerResumenLibre = (id, fecha) =>
    apiFetch(joinPath(BASE, id, 'resumen-libre'), {
        params: fecha ? { fecha } : undefined,
    });

/**
 * Crea un nuevo crédito.
 * - común/progresivo: el backend calcula interés proporcional (mín. 60%) y genera cuotas.
 * - libre: usa tasa por ciclo (porcentaje) y crea cuota abierta.
 */
export const crearCredito = (data) => {
    const { interes, monto_acreditar, ...rest } = data || {};
    const payload = {
        ...rest,
        monto_acreditar: sanitizeNumber(monto_acreditar),
    };
    if (interes !== undefined && interes !== null && `${interes}` !== '') {
        payload.interes = sanitizeNumber(interes); // guardamos en porcentaje (p.ej. 60)
    }
    return apiFetch(BASE, {
        method: 'POST',
        body: payload,
    });
};

/**
 * Actualiza un crédito existente.
 * - común/progresivo: recalcula interés proporcional y regenera cuotas.
 * - libre: recalcula referencia del ciclo; NO toca saldo_actual (lo maneja el back).
 */
export const actualizarCredito = (id, data) => {
    const { interes, monto_acreditar, ...rest } = data || {};
    const payload = {
        ...rest,
        monto_acreditar: sanitizeNumber(monto_acreditar),
    };
    if (interes !== undefined && interes !== null && `${interes}` !== '') {
        payload.interes = sanitizeNumber(interes);
    }
    return apiFetch(joinPath(BASE, id), {
        method: 'PUT',
        body: payload,
    });
};

/** Verifica si un crédito es eliminable: { eliminable: boolean, cantidadPagos: number } */
export const verificarEliminableCredito = async (id) => {
    const resp = await apiFetch(joinPath(BASE, id, 'eliminable'));
    return unwrap(resp);
};

/** Elimina un crédito (DELETE directo) */
export const eliminarCredito = (id) =>
    apiFetch(joinPath(BASE, id), { method: 'DELETE' });

/**
 * Elimina un crédito con pre-chequeo:
 * - Si tiene pagos, lanza Error 409 con mensaje claro.
 * - Si no, ejecuta el DELETE.
 */
export const eliminarCreditoSeguro = async (id) => {
    const { eliminable, cantidadPagos } = await verificarEliminableCredito(id);
    if (!eliminable) {
        const err = new Error(
            `No se puede eliminar el crédito porque tiene pagos registrados (${cantidadPagos}).`
        );
        err.status = 409;
        err.data = { eliminable, cantidadPagos };
        throw err;
    }
    return eliminarCredito(id);
};

/* ───────────────── Refinanciación ───────────────── */

/**
 * Refinancia un crédito (P1 / P2 / manual).
 * Backend: POST /creditos/:id/refinanciar
 * Body:
 *  - opcion: 'P1' | 'P2' | 'manual'
 *  - tasaManual?: number (si opcion === 'manual')  -> tasa mensual
 *  - tipo_credito?: 'mensual' | 'semanal' | 'quincenal'
 *  - cantidad_cuotas?: number (>=1)
 *
 * NOTA: El backend ya valida que solo se refinancia modalidad "comun" y
 * calcula interés por período. Esta función es el llamado directo.
 */
export const refinanciarCredito = (
    creditoId,
    { opcion, tasaManual = 0, tipo_credito, cantidad_cuotas }
) => {
    const body = { opcion };
    if (opcion === 'manual') body.tasaManual = sanitizeNumber(tasaManual);
    if (tipo_credito) body.tipo_credito = String(tipo_credito);
    if (cantidad_cuotas !== undefined && cantidad_cuotas !== null) {
        body.cantidad_cuotas = sanitizeInt(cantidad_cuotas, 1);
    }
    return apiFetch(joinPath(BASE, creditoId, 'refinanciar'), {
        method: 'POST',
        body,
    });
};

/**
 * Wrapper seguro para UI:
 * - Valida en cliente que el crédito sea modalidad "comun".
 * - Permite previsualizar con `previewRefinanciacion` y, si el UI lo desea,
 *   mostrar total/ cuota estimada antes de confirmar.
 */
export const refinanciarCreditoSeguro = async (
    credito, // objeto crédito completo o al menos { id, modalidad_credito, saldo_actual, tipo_credito, cantidad_cuotas }
    { opcion, tasaManual = 0, tipo_credito, cantidad_cuotas }
) => {
    const id = credito?.id;
    if (!id) throw new Error('Crédito inválido (falta id).');

    const modalidad = String(credito?.modalidad_credito || '');
    if (modalidad !== 'comun') {
        const err = new Error('Solo se permite refinanciar créditos de modalidad "comun".');
        err.status = 400;
        throw err;
    }

    // (Opcional) podrías calcular un preview para mostrar al usuario:
    // const preview = previewRefinanciacion({
    //   saldo: credito.saldo_actual,
    //   opcion,
    //   tasaManual,
    //   tipo_credito: tipo_credito || credito.tipo_credito,
    //   cantidad_cuotas: cantidad_cuotas || credito.cantidad_cuotas
    // });

    return refinanciarCredito(id, {
        opcion,
        tasaManual,
        tipo_credito,
        cantidad_cuotas
    });
};

/** Anula un crédito (superadmin) */
export const anularCredito = (id) =>
    apiFetch(joinPath(BASE, id, 'anular'), { method: 'POST' });

/** Solicita anulación de crédito (admin) */
export const solicitarAnulacionCredito = ({ creditoId, motivo }) =>
    apiFetch(joinPath(API_PREFIX, 'tareas', 'pendientes'), {
        method: 'POST',
        body: {
            tipo: 'anular_credito',
            datos: { creditoId, motivo },
        },
    });

/**
 * CANCELAR crédito (pago único con recibo único).
 * - LIBRE: interés ciclo(s) + capital, con descuento % opcional sobre el total.
 * - NO LIBRE: coherente con mora + principal (lo calcula el back).
 */
export const cancelarCredito = (
    creditoId,
    { forma_pago_id, descuento_porcentaje = 0, observacion = null }
) =>
    apiFetch(joinPath(BASE, creditoId, 'cancelar'), {
        method: 'POST',
        body: {
            forma_pago_id,
            descuento_porcentaje: sanitizeNumber(descuento_porcentaje),
            observacion,
        },
    });
