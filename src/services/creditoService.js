// src/services/creditoService.js

import apiFetch from './apiClient.js';

/* ───────────────── Config & helpers de ruta ───────────────── */

// ✅ IMPORTANTE: apiClient ya aplica VITE_API_PREFIX (/api).
// Acá NO sumamos otro prefijo para evitar /api/api.

// Helpers para construir URL absoluta para fetch directo (PDF) sin duplicar /api
const normalizeBase = (url) => (url || '').trim().replace(/\/+$/g, '');
const normalizePrefix = (p) => {
  if (p == null) return '/api';
  const s = String(p).trim();
  if (s === '') return '';
  const withSlash = s.startsWith('/') ? s : `/${s}`;
  return withSlash.replace(/\/+$/g, '');
};

const joinBaseAndPrefix = (base, prefix) => {
  const b = normalizeBase(base);
  const p = normalizePrefix(prefix);

  if (!p) return b;
  if (!b) return p;

  const bLower = b.toLowerCase();
  const pLower = p.toLowerCase();
  if (bLower.endsWith(pLower)) return b; // ya lo tiene

  return `${b}${p}`;
};

const RAW_API_URL = (import.meta.env.VITE_API_URL || '').trim();   // ideal: https://api...cloud (sin /api)
const API_BASE_ENV = (import.meta.env.VITE_API_BASE || '').trim(); // opcional
const API_PREFIX_ENV = normalizePrefix(import.meta.env.VITE_API_PREFIX ?? '/api');

// ✅ Base final para fetch directo (PDF)
const API_URL_BASE =
  RAW_API_URL
    ? joinBaseAndPrefix(RAW_API_URL, API_PREFIX_ENV)
    : (API_BASE_ENV ? joinBaseAndPrefix(API_BASE_ENV, API_PREFIX_ENV) : API_PREFIX_ENV);

/* Une segmentos asegurando que no queden dobles slashes internos */
const joinPath = (...parts) =>
  '/' +
  parts
    .filter(Boolean)
    .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
    .join('/');

const BASE = joinPath('creditos');

/* ───────────────── Helpers numéricos ───────────────── */

/**
 * Convierte a número soportando:
 * - 1.234,56 (AR)
 * - 1234,56
 * - 1234.56
 * - 1234
 *
 * Nota: la versión anterior eliminaba todos los puntos siempre, rompiendo "1234.56".
 */
const sanitizeNumber = (value) => {
  if (value === null || value === undefined) return 0;

  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  if (typeof value === 'string') {
    let s = value.trim();
    if (s === '') return 0;

    // Mantener solo dígitos, separadores y signo
    s = s.replace(/[^\d.,-]/g, '');

    const hasDot = s.includes('.');
    const hasComma = s.includes(',');

    if (hasDot && hasComma) {
      // Asumimos formato AR: puntos miles, coma decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (hasComma && !hasDot) {
      // Coma decimal
      s = s.replace(',', '.');
    } // else: solo punto o ninguno → Number() lo entiende

    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const sanitizeInt = (value, min = 1) => {
  const n = Math.trunc(sanitizeNumber(value));
  if (!Number.isFinite(n) || Number.isNaN(n)) return min;
  return Math.max(min, n);
};

// Compat: apiFetch a veces devuelve directo y a veces {success,data}
const unwrap = (resp) => {
  if (!resp) return resp;
  if (resp?.data !== undefined) return resp.data;
  return resp;
};

const lower = (v) => String(v ?? '').toLowerCase();

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

  if (e?.stack) err.stack = e.stack;

  return err;
};

const apiFetchSafe = async (url, options, fallbackMessage) => {
  try {
    return await apiFetch(url, options);
  } catch (e) {
    throw normalizeApiError(e, fallbackMessage);
  }
};

/* ───────────────── Helpers de auth/headers (para fetch directo) ───────────────── */

const getAuthHeader = () => {
  try {
    const raw =
      localStorage.getItem('token') ||
      localStorage.getItem('authToken') ||
      sessionStorage.getItem('token') ||
      sessionStorage.getItem('authToken') ||
      null;

    if (!raw) return {};
    const token = String(raw).replace(/^Bearer\s+/i, '').trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

/* ───────────────── PDF fetch credentials (CORS) ─────────────────
   Default: NO cookies. Usamos Bearer token → credentials debe ser 'omit'
   Si algún día usan cookie/sesión, setear VITE_PDF_CREDENTIALS=true
*/
const parseBoolEnv = (v, def = false) => {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return def;
};

const PDF_CREDENTIALS_INCLUDE = parseBoolEnv(import.meta.env.VITE_PDF_CREDENTIALS, false);
const PDF_FETCH_CREDENTIALS = PDF_CREDENTIALS_INCLUDE ? 'include' : 'omit';

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
 *
 * ⚠️ Importante: el `saldo` que le pases puede ser solo capital o capital + mora,
 * según lo que quieras mostrar en la UI. El back siempre recalcula con su propia base.
 */
export const previewRefinanciacion = ({
  saldo,
  opcion, // 'P1' | 'P2' | 'manual'
  tasaManual = 0, // si 'manual'
  tipo_credito, // 'mensual' | 'quincenal' | 'semanal'
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
    tasa_por_periodo: +tasaPorPeriodo.toFixed(4),
    cantidad_cuotas: n,
    interes_total_pct: +interesTotalPct.toFixed(4),
    interes_total_monto: interesTotalMonto,
    total_a_devolver: total,
    cuota_estimada: cuota
  };
};

/* ───────────────── Refinanciación: normalización de datos ───────────────── */

const normalizeRefiFieldsCredito = (credito) => {
  if (!credito || typeof credito !== 'object') return credito;

  const origenRaw =
    credito.id_credito_origen ??
    credito.credito_origen_id ??
    credito.creditoOrigenId ??
    credito.idCreditoOrigen ??
    null;

  const origenId = Number(origenRaw);
  const tieneOrigen = Number.isFinite(origenId) && origenId > 0;

  // Alias consistente
  if (credito.credito_origen_id === undefined) {
    credito.credito_origen_id = tieneOrigen ? origenId : null;
  }
  if (credito.id_credito_origen === undefined) {
    credito.id_credito_origen = tieneOrigen ? origenId : null;
  }

  // Flags consistentes para UI
  const estado = lower(credito.estado);
  credito.es_credito_refinanciado = estado === 'refinanciado';
  credito.es_credito_de_refinanciacion = tieneOrigen;

  return credito;
};

const normalizeRefiFieldsDeep = (payload) => {
  if (Array.isArray(payload)) {
    return payload.map((c) => normalizeRefiFieldsCredito(c));
  }

  if (payload && typeof payload === 'object' && Array.isArray(payload.creditos)) {
    payload.creditos = payload.creditos.map((c) => normalizeRefiFieldsCredito(c));
    return payload;
  }

  if (payload && typeof payload === 'object' && payload.data !== undefined) {
    payload.data = normalizeRefiFieldsDeep(payload.data);
    return payload;
  }

  if (payload && typeof payload === 'object' && payload.cliente && typeof payload.cliente === 'object') {
    payload.cliente = normalizeRefiFieldsDeep(payload.cliente);
    return payload;
  }

  if (payload && typeof payload === 'object' && (payload.id || payload.estado || payload.modalidad_credito)) {
    return normalizeRefiFieldsCredito(payload);
  }

  return payload;
};

/* ───────────────── LIBRE: helpers de resumen (anti-parpadeo) ───────────────── */

const __resumenLibreCache = new Map(); // key -> { ts, data }
const __RESUMEN_TTL_MS = 3500;

const cacheKeyResumenLibre = (id, fecha) => `${Number(id)}|${fecha || 'hoy'}`;

const getResumenLibreCached = (id, fecha) => {
  const key = cacheKeyResumenLibre(id, fecha);
  const hit = __resumenLibreCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > __RESUMEN_TTL_MS) {
    __resumenLibreCache.delete(key);
    return null;
  }
  return hit.data;
};

const setResumenLibreCached = (id, fecha, data) => {
  const key = cacheKeyResumenLibre(id, fecha);
  __resumenLibreCache.set(key, { ts: Date.now(), data });
};

export const invalidarResumenLibreCache = (id, fecha) => {
  const numId = Number(id);
  if (!Number.isFinite(numId) || numId <= 0) return;

  if (fecha) {
    __resumenLibreCache.delete(cacheKeyResumenLibre(numId, fecha));
    return;
  }

  const prefix = `${numId}|`;
  for (const key of __resumenLibreCache.keys()) {
    if (String(key).startsWith(prefix)) __resumenLibreCache.delete(key);
  }
};

/* ───────────────── LIBRE: normalización robusta ───────────────── */

const normalizeResumenLibre = (raw) => {
  const r = raw && typeof raw === 'object' ? raw : {};

  const saldo_capital = sanitizeNumber(
    r.saldo_capital ??
    r.saldo_capital_pendiente ??
    r.capital_pendiente ??
    r.capital ??
    0
  );

  // HOY (ciclo actual) raw
  const interesHoyRaw =
    r.interes_ciclo_hoy ?? r.interes_pendiente_hoy ?? r.interes_hoy ?? null;
  const moraHoyRaw =
    r.mora_ciclo_hoy ?? r.mora_pendiente_hoy ?? r.mora_hoy ?? null;

  const interes_ciclo_hoy = sanitizeNumber(interesHoyRaw);
  const mora_ciclo_hoy = sanitizeNumber(moraHoyRaw);

  // TOTAL (acumulado) raw
  const interesTotalRaw =
    r.interes_pendiente_total ??
    r.interes_total ??
    r.interes_pendiente ??
    r.interes ??
    null;

  const moraTotalRaw =
    r.mora_pendiente_total ??
    r.mora_total ??
    r.mora_pendiente ??
    r.mora ??
    null;

  const interes_pendiente_total = Math.max(
    sanitizeNumber(interesTotalRaw),
    interes_ciclo_hoy
  );

  const mora_pendiente_total = Math.max(
    sanitizeNumber(moraTotalRaw),
    mora_ciclo_hoy
  );

  const extractCiclo = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') {
      const s = v.trim();
      const first = s.includes('/') ? s.split('/')[0] : s;
      const n = Number(first);
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }
    const n = sanitizeInt(v, 1);
    return n > 0 ? n : null;
  };

  const ciclo_actual = extractCiclo(r.ciclo_actual ?? r.ciclo ?? null);
  const inicio_ciclo = r.inicio_ciclo ?? null;
  const fin_ciclo = r.fin_ciclo ?? null;

  const total_no_capital = +(
    interes_pendiente_total + mora_pendiente_total
  ).toFixed(2);

  const total_actual_calc = +(saldo_capital + total_no_capital).toFixed(2);

  const totalActualIn = sanitizeNumber(
    r.total_actual ??
    r.total_liquidacion_hoy ??
    r.total_a_cancelar_hoy ??
    r.total_pagar_hoy ??
    r.total ??
    0
  );

  const total_actual =
    totalActualIn > 0 && totalActualIn >= total_actual_calc - 0.01
      ? +totalActualIn.toFixed(2)
      : total_actual_calc;

  const total_ciclo_hoy = +(interes_ciclo_hoy + mora_ciclo_hoy).toFixed(2);

  return {
    ...r,

    saldo_capital: +saldo_capital.toFixed(2),

    interes_pendiente_total: +interes_pendiente_total.toFixed(2),
    mora_pendiente_total: +mora_pendiente_total.toFixed(2),

    interes_ciclo_hoy: +interes_ciclo_hoy.toFixed(2),
    mora_ciclo_hoy: +mora_ciclo_hoy.toFixed(2),

    interes_pendiente: +interes_pendiente_total.toFixed(2),
    mora_pendiente: +mora_pendiente_total.toFixed(2),

    total_no_capital,
    total_actual,
    total_ciclo_hoy,

    ciclo_actual,
    inicio_ciclo,
    fin_ciclo
  };
};

/* ───────────────── Créditos: CRUD & queries ───────────────── */

export const obtenerCreditos = async (params = {}) => {
  const resp = await apiFetchSafe(BASE, { params }, 'No se pudieron obtener los créditos.');
  return normalizeRefiFieldsDeep(resp);
};

export const obtenerCreditosPorCliente = async (clienteId, params = {}) => {
  const resp = await apiFetchSafe(
    joinPath(BASE, 'cliente', clienteId),
    { params },
    'No se pudieron obtener los créditos del cliente.'
  );
  return normalizeRefiFieldsDeep(resp);
};

export const obtenerCreditoPorId = async (id) => {
  const resp = await apiFetchSafe(joinPath(BASE, id), undefined, 'No se pudo obtener el crédito.');
  return normalizeRefiFieldsDeep(resp);
};

/**
 * Resumen de crédito LIBRE (capital, interés y mora).
 * Backend: GET /creditos/:id/resumen-libre?fecha=YYYY-MM-DD
 */
export const obtenerResumenLibre = (id, fecha) =>
  apiFetchSafe(
    joinPath(BASE, id, 'resumen-libre'),
    {
      params: fecha ? { fecha } : undefined
    },
    'No se pudo obtener el resumen del crédito LIBRE.'
  );

export const obtenerResumenLibreNormalizado = async (id, fecha, opts = {}) => {
  const force = Boolean(opts?.force);

  if (force) {
    invalidarResumenLibreCache(id, fecha);
  } else {
    const cached = getResumenLibreCached(id, fecha);
    if (cached) return cached;
  }

  const resp = await obtenerResumenLibre(id, fecha);
  const data = normalizeResumenLibre(unwrap(resp));
  setResumenLibreCached(id, fecha, data);
  return data;
};

export const obtenerCreditoPorIdConResumenLibre = async (id, fecha, opts = {}) => {
  const resp = await obtenerCreditoPorId(id);
  const credito = unwrap(resp);

  if (!credito || typeof credito !== 'object') return resp;

  if (lower(credito.modalidad_credito) === 'libre') {
    const resumen = await obtenerResumenLibreNormalizado(credito.id, fecha, {
      force: Boolean(opts?.forceResumen)
    });

    credito.resumen_libre = resumen;
    credito.total_actual = sanitizeNumber(resumen.total_actual);
  }

  if (resp && typeof resp === 'object' && resp.data !== undefined) {
    return { ...resp, data: credito };
  }
  return credito;
};

export const crearCredito = (data) => {
  const { interes, monto_acreditar, ...rest } = data || {};
  const payload = {
    ...rest,
    monto_acreditar: sanitizeNumber(monto_acreditar)
  };
  if (interes !== undefined && interes !== null && `${interes}` !== '') {
    payload.interes = sanitizeNumber(interes);
  }
  return apiFetchSafe(
    BASE,
    {
      method: 'POST',
      body: payload
    },
    'No se pudo crear el crédito.'
  );
};

export const actualizarCredito = (id, data) => {
  const { interes, monto_acreditar, ...rest } = data || {};
  const payload = {
    ...rest,
    monto_acreditar: sanitizeNumber(monto_acreditar)
  };
  if (interes !== undefined && interes !== null && `${interes}` !== '') {
    payload.interes = sanitizeNumber(interes);
  }
  return apiFetchSafe(
    joinPath(BASE, id),
    {
      method: 'PUT',
      body: payload
    },
    'No se pudo actualizar el crédito.'
  );
};

export const verificarEliminableCredito = async (id) => {
  const resp = await apiFetchSafe(joinPath(BASE, id, 'eliminable'), undefined, 'No se pudo verificar si el crédito es eliminable.');
  return unwrap(resp);
};

export const eliminarCredito = (id) =>
  apiFetchSafe(joinPath(BASE, id), { method: 'DELETE' }, 'No se pudo eliminar el crédito.');

export const eliminarCreditoSeguro = async (id) => {
  const { eliminable, cantidadPagos } = await verificarEliminableCredito(id);
  if (!eliminable) {
    const err = new Error(`No se puede eliminar el crédito porque tiene pagos registrados (${cantidadPagos}).`);
    err.status = 409;
    err.data = { eliminable, cantidadPagos };
    throw err;
  }
  return eliminarCredito(id);
};

/* ───────────────── Refinanciación ───────────────── */

export const refinanciarCredito = async (creditoId, { opcion, tasaManual = 0, tipo_credito, cantidad_cuotas }) => {
  const body = { opcion };
  if (opcion === 'manual') body.tasaManual = sanitizeNumber(tasaManual);
  if (tipo_credito) body.tipo_credito = String(tipo_credito);
  if (cantidad_cuotas !== undefined && cantidad_cuotas !== null) {
    body.cantidad_cuotas = sanitizeInt(cantidad_cuotas, 1);
  }

  const resp = await apiFetchSafe(
    joinPath(BASE, creditoId, 'refinanciar'),
    {
      method: 'POST',
      body
    },
    'No se pudo refinanciar el crédito.'
  );

  return normalizeRefiFieldsDeep(resp);
};

export const refinanciarCreditoSeguro = async (
  credito,
  { opcion, tasaManual = 0, tipo_credito, cantidad_cuotas }
) => {
  const id = credito?.id;
  if (!id) throw new Error('Crédito inválido (falta id).');

  const modalidad = lower(credito?.modalidad_credito);
  if (!['comun', 'progresivo', 'libre'].includes(modalidad)) {
    const err = new Error('Solo se permite refinanciar créditos de modalidad "comun", "progresivo" o "libre".');
    err.status = 400;
    throw err;
  }

  return refinanciarCredito(id, { opcion, tasaManual, tipo_credito, cantidad_cuotas });
};

export const anularCredito = (id) =>
  apiFetchSafe(joinPath(BASE, id, 'anular'), { method: 'POST' }, 'No se pudo anular el crédito.');

export const solicitarAnulacionCredito = async ({ creditoId, motivo }) => {
  const body = {
    tipo: 'anular_credito',
    datos: { creditoId, motivo }
  };

  // ✅ No anteponer prefijo acá: apiClient lo hará
  const pathPendientes = joinPath('tareas', 'pendientes');
  const pathCanonico = joinPath('tareas');

  try {
    return await apiFetchSafe(pathPendientes, { method: 'POST', body }, 'No se pudo solicitar la anulación del crédito.');
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    const msg = (err?.message || '').toLowerCase();
    if (status === 404 || msg.includes('404')) {
      return apiFetchSafe(pathCanonico, { method: 'POST', body }, 'No se pudo solicitar la anulación del crédito.');
    }
    throw err;
  }
};

/* ───────────────── Cancelación / Liquidación ───────────────── */

export const cancelarCredito = async (
  creditoId,
  {
    forma_pago_id,
    descuento_porcentaje = 0,
    descuento_sobre = 'mora',
    observacion = null,
    descuento_scope = null,
    descuento_mora = null,
    descuento = null
  }
) => {
  const pct = sanitizeNumber(descuento_porcentaje);
  const modo = String(descuento_sobre || 'mora').toLowerCase();

  const body = {
    forma_pago_id,
    descuento_porcentaje: pct,
    descuento_sobre: modo,
    observacion
  };

  if (descuento_scope != null) body.descuento_scope = String(descuento_scope).toLowerCase();
  if (descuento_mora != null) body.descuento_mora = sanitizeNumber(descuento_mora);
  if (descuento != null) body.descuento = sanitizeNumber(descuento);

  const resp = await apiFetchSafe(
    joinPath(BASE, creditoId, 'cancelar'),
    {
      method: 'POST',
      body
    },
    'No se pudo cancelar/liquidar el crédito.'
  );

  const data0 = unwrap(resp);
  const data = data0 && typeof data0 === 'object' ? { ...data0 } : { data: data0 };

  const numero =
    data.numero_recibo ??
    data?.recibo?.numero_recibo ??
    data?.data?.numero_recibo ??
    data?.data?.recibo?.numero_recibo ??
    null;

  if (numero != null) data.numero_recibo = numero;

  if (resp && typeof resp === 'object') {
    if (data.success === undefined && resp.success !== undefined) data.success = resp.success;
    if (data.message === undefined && resp.message !== undefined) data.message = resp.message;
  }

  return data;
};

/* ─────────── NUEVO: Preview de liquidación (para UI en vivo) ─────────── */

export const previewLiquidacionCredito = async (
  credito,
  { descuento_porcentaje = 0, descuento_sobre = 'mora' } = {}
) => {
  const pct = Math.min(Math.max(sanitizeNumber(descuento_porcentaje), 0), 100);
  const modo = String(descuento_sobre || 'mora').toLowerCase();

  const modalidad = lower(credito?.modalidad_credito);

  let principalBase = 0;
  let moraBase = 0; // “no capital” total: interés + mora (en LIBRE)
  let interesBase = 0; // para UI (en LIBRE = interés total acumulado por defecto)

  if (modalidad === 'libre') {
    const resumen = await obtenerResumenLibreNormalizado(credito.id);

    const capital = sanitizeNumber(resumen?.saldo_capital ?? credito?.saldo_actual);
    const interesPendTotal = sanitizeNumber(resumen?.interes_pendiente_total ?? resumen?.interes_pendiente ?? 0);
    const moraPendTotal = sanitizeNumber(resumen?.mora_pendiente_total ?? resumen?.mora_pendiente ?? 0);

    principalBase = +capital.toFixed(2);
    interesBase = +interesPendTotal.toFixed(2);
    moraBase = +(interesPendTotal + moraPendTotal).toFixed(2);
  } else {
    const cuotas = Array.isArray(credito?.cuotas) ? credito.cuotas : [];
    for (const c of cuotas) {
      const estado = lower(c.estado);
      if (!['pendiente', 'parcial', 'vencida'].includes(estado)) continue;

      const importe = sanitizeNumber(c.importe_cuota);
      const desc = sanitizeNumber(c.descuento_cuota);
      const pagado = sanitizeNumber(c.monto_pagado_acumulado);

      const principalPend = Math.max(+(importe - desc - pagado).toFixed(2), 0);
      const mora = +sanitizeNumber(c.intereses_vencidos_acumulados).toFixed(2);

      principalBase = +(principalBase + principalPend).toFixed(2);
      moraBase = +(moraBase + mora).toFixed(2);
    }
  }

  let descMora = 0;
  let descPrincipal = 0;

  if (modo === 'total') {
    const base = +(principalBase + moraBase).toFixed(2);
    let totalDesc = +(base * (pct / 100)).toFixed(2);

    descMora = Math.min(totalDesc, moraBase);
    totalDesc = +(totalDesc - descMora).toFixed(2);
    descPrincipal = Math.min(totalDesc, principalBase);
  } else {
    descMora = +(moraBase * (pct / 100)).toFixed(2);
    descPrincipal = 0;
  }

  const moraNeta = +(Math.max(moraBase - descMora, 0)).toFixed(2);
  const principalNeto = +(Math.max(principalBase - descPrincipal, 0)).toFixed(2);
  const totalAPagar = +(moraNeta + principalNeto).toFixed(2);

  return {
    principal_base: principalBase,
    mora_base: moraBase,
    interes_base: interesBase,
    descuento_aplicado_mora: descMora,
    descuento_aplicado_principal: descPrincipal,
    total_a_pagar: totalAPagar,
    total_base: +(principalBase + moraBase).toFixed(2),
    total_descuento: +(descMora + descPrincipal).toFixed(2),
    resumen: {
      principal_neto: principalNeto,
      mora_neta: moraNeta
    }
  };
};

/* ──────────────────────── Impresión / Descarga de Ficha ──────────────────────── */

// ✅ FIX: money robusto usando sanitizeNumber (evita "220.000" -> 220)
const money = (n) =>
  sanitizeNumber(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const labelModalidad = (modalidad) => {
  const m = lower(modalidad);
  if (m === 'comun') return 'PLAN DE CUOTAS FIJAS';
  return m.toUpperCase();
};

/** Total actual (mismo criterio que el back) */
const calcularTotalActualFront = (credito) => {
  if (!credito) return 0;

  if (lower(credito.modalidad_credito) === 'libre') {
    const capital = sanitizeNumber(credito.saldo_actual || 0);
    const cuota = Array.isArray(credito.cuotas) ? credito.cuotas[0] : null;
    const mora = sanitizeNumber(cuota?.intereses_vencidos_acumulados || 0);
    return +(capital + mora).toFixed(2);
  }

  let total = 0;
  for (const c of credito.cuotas || []) {
    const estado = lower(c.estado);
    if (!['pendiente', 'parcial', 'vencida'].includes(estado)) continue;

    const principalPend = Math.max(
      +(
        sanitizeNumber(c.importe_cuota || 0) -
        sanitizeNumber(c.descuento_cuota || 0) -
        sanitizeNumber(c.monto_pagado_acumulado || 0)
      ).toFixed(2),
      0
    );
    const mora = +sanitizeNumber(c.intereses_vencidos_acumulados || 0).toFixed(2);
    total = +(total + principalPend + mora).toFixed(2);
  }
  return total;
};

const LIBRE_VTO_FICTICIO = '2099-12-31';

const construirHTMLFicha = (credito) => {
  const c = credito || {};
  const cli = c.cliente || {};
  const cuotas = Array.isArray(c.cuotas) ? c.cuotas : [];
  const totalActual = Number(c.total_actual ?? c.total_actual_hoy ?? calcularTotalActualFront(c));
  const fechaEmision = new Date().toISOString().slice(0, 10);

  const vtosValidos = cuotas
    .map((ct) => ct.fecha_vencimiento)
    .filter((f) => f && f !== LIBRE_VTO_FICTICIO)
    .sort();

  const primerVto = vtosValidos[0] || (c.fecha_compromiso_pago || '-');
  const ultimoVto = vtosValidos.length ? vtosValidos[vtosValidos.length - 1] : '-';

  const styles = `
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji","Segoe UI Emoji", sans-serif; margin: 24px; color: #111827; }
    h1 { font-size: 20px; margin: 0; text-align: center; }
    .muted { color: #6B7280; font-size: 12px; text-align: center; margin-top: 4px; }
    .section { margin-top: 18px; }
    .title { font-weight: 600; font-size: 14px; margin-bottom: 6px; textDecoration: underline; }
    .grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px 16px; }
    .row label { color:#4B5563; font-size: 12px; display:block; }
    .row div { font-size: 13px; font-weight: 600; }
    .kpi { display: inline-block; padding: 8px 10px; border:1px solid #E5E7EB; border-radius: 8px; background:#F9FAFB; margin-right: 12px; margin-top: 6px;}
    .kpi span { color:#6B7280; font-size:12px; display:block; }
    .kpi b { font-size:14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    thead th { text-align: right; background:#F3F4F6; color:#374151; padding: 6px; border-bottom: 1px solid #E5E7EB; }
    thead th:first-child, thead th:nth-child(2) { text-align: left; }
    tbody td { padding: 6px; border-bottom: 1px solid #F3F4F6; text-align: right; }
    tbody td:first-child, tbody td:nth-child(2) { text-align: left; }
    tfoot td { padding: 6px; text-align: right; font-weight: 700; }
    .note { margin-top: 14px; color:#6B7280; font-size: 12px; }
    @media print {
      body { margin: 8mm; }
      .no-print { display: none; }
    }
  </style>`;

  const rows = cuotas
    .map((ct) => {
      const principalPend = Math.max(
        +(
          sanitizeNumber(ct.importe_cuota || 0) -
          sanitizeNumber(ct.descuento_cuota || 0) -
          sanitizeNumber(ct.monto_pagado_acumulado || 0)
        ).toFixed(2),
        0
      );
      const mora = +sanitizeNumber(ct.intereses_vencidos_acumulados || 0).toFixed(2);
      const saldoCuota = +(principalPend + mora).toFixed(2);
      const vto = ct.fecha_vencimiento === LIBRE_VTO_FICTICIO ? '—' : ct.fecha_vencimiento || '-';
      return `
      <tr>
        <td>#${ct.numero_cuota}</td>
        <td>${vto}</td>
        <td>$${money(ct.importe_cuota)}</td>
        <td>$${money(ct.monto_pagado_acumulado)}</td>
        <td>$${money(ct.descuento_cuota)}</td>
        <td>$${money(mora)}</td>
        <td>$${money(saldoCuota)}</td>
        <td>${String(ct.estado || '').toUpperCase()}</td>
      </tr>
    `;
    })
    .join('');

  const totales = cuotas.reduce(
    (acc, ct) => {
      const principalPend = Math.max(
        +(
          sanitizeNumber(ct.importe_cuota || 0) -
          sanitizeNumber(ct.descuento_cuota || 0) -
          sanitizeNumber(ct.monto_pagado_acumulado || 0)
        ).toFixed(2),
        0
      );
      const mora = +sanitizeNumber(ct.intereses_vencidos_acumulados || 0).toFixed(2);
      acc.principal += principalPend;
      acc.mora += mora;
      return acc;
    },
    { principal: 0, mora: 0 }
  );

  const tel =
    [cli.telefono, cli.telefono_secundario, cli.telefono_1, cli.telefono_2].filter(Boolean).join(' / ') || '-';
  const dir =
    [cli.direccion, cli.direccion_secundaria, cli.direccion_1, cli.direccion_2].filter(Boolean).join(' | ') || '-';

  const cobradorNombre =
    c?.cobradorCredito?.nombre_completo ||
    c?.cobrador?.nombre_completo ||
    c?.cobrador_nombre ||
    '-';

  return `
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Ficha de Crédito #${c.id}</title>
      ${styles}
    </head>
    <body>
      <h1>Ficha de Crédito</h1>
      <div class="muted">Emitido: ${new Date().toISOString().slice(0, 10)}</div>

      <div class="section">
        <div class="title">Cliente</div>
        <div class="grid">
          <div class="row"><label>Nombre</label><div>${[cli.nombre, cli.apellido].filter(Boolean).join(' ') || '-'}</div></div>
          <div class="row"><label>DNI</label><div>${cli.dni || '-'}</div></div>
          <div class="row"><label>Teléfono(s)</label><div>${tel}</div></div>
          <div class="row"><label>Dirección</label><div>${dir}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="title">Crédito</div>
        <div class="grid">
          <div class="row"><label>ID</label><div>${c.id}</div></div>
          <div class="row"><label>Modalidad</label><div>${labelModalidad(c.modalidad_credito)}</div></div>
          <div class="row"><label>Tipo</label><div>${String(c.tipo_credito || '').toUpperCase()}</div></div>
          <div class="row"><label>Cuotas</label><div>${c.cantidad_cuotas ?? '-'}</div></div>
          <div class="row"><label>Estado</label><div>${String(c.estado || '').toUpperCase()}</div></div>
          <div class="row"><label>Fecha solicitud</label><div>${c.fecha_solicitud || '-'}</div></div>
          <div class="row"><label>Fecha acreditación</label><div>${c.fecha_acreditacion || '-'}</div></div>
          <div class="row"><label>Fecha 1er vencimiento</label><div>${primerVto}</div></div>
          <div class="row"><label>Fecha fin de crédito</label><div>${ultimoVto}</div></div>
          <div class="row"><label>Cobrador</label><div>${cobradorNombre}</div></div>
        </div>

        <div class="kpi">
          <span>Saldo actual declarado</span>
          <b>$${money(c.saldo_actual)}</b>
        </div>
        <div class="kpi">
          <span>TOTAL ACTUAL</span>
          <b>$${money(totalActual)}</b>
        </div>
      </div>

      <div class="section">
        <div class="title">Detalle de cuotas</div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Vencimiento</th>
              <th>Importe</th>
              <th>Pagado</th>
              <th>Desc.</th>
              <th>Mora</th>
              <th>Saldo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5"></td>
              <td>Tot. Mora: $${money(totales.mora)}</td>
              <td>Tot. Principal pend.: $${money(totales.principal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <div class="note">Nota: Esta ficha es informativa. Los importes pueden variar según pagos registrados y recálculos de mora.</div>
      </div>
    </body>
  </html>`;
};

const abrirVentanaImpresion = (html) => {
  if (typeof window === 'undefined') return;
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    alert('El bloqueador de popups impidió abrir la impresión. Permití popups para continuar.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onload = () => {
    try { w.focus(); } catch (_) { }
    try { w.print(); } catch (_) { }
    setTimeout(() => {
      try { w.close(); } catch (_) { }
    }, 500);
  };
};

export const imprimirFichaDesdeFront = async (creditoId) => {
  const resp = await obtenerCreditoPorIdConResumenLibre(creditoId);
  const credito = unwrap(resp);
  if (!credito) throw new Error(`No se encontró el crédito #${creditoId}`);

  const html = construirHTMLFicha(credito);
  abrirVentanaImpresion(html);
};

export const construirFichaHTML = construirHTMLFicha;

/* ───────────────── Descarga/Apertura de PDF desde el BACK ───────────────── */

/**
 * ✅ FIX CRÍTICO:
 * - Por defecto NO manda cookies (credentials: 'omit') porque usamos Bearer token.
 * - Si algún día el backend valida cookie/sesión, setear VITE_PDF_CREDENTIALS=true.
 * - Si el backend devuelve 401/403/HTML, lo capturamos con mejor diagnóstico
 * - Evita “descargar” HTML/JSON como si fuera PDF
 */
const assertPdfResponse = async (res) => {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/pdf')) return;

  // si no es pdf, intento leer texto para debug
  const txt = await res.text().catch(() => '');
  const err = new Error(`Respuesta no es PDF (Content-Type: ${ct || 'desconocido'}).`);
  err.status = res.status;
  err.data = { body: txt || null, contentType: ct || null };
  throw err;
};

export const descargarFichaCreditoPDF = async (creditoId, filename) => {
  const url = joinPath(BASE, creditoId, 'ficha.pdf');

  // ✅ Construcción robusta: API_URL_BASE ya trae prefijo, url empieza con '/'
  const absoluteUrl = `${API_URL_BASE}${url}`;

  const res = await fetch(absoluteUrl, {
    method: 'GET',
    headers: {
      ...getAuthHeader()
    },
    // ✅ DEFAULT: omit (evita bloqueo CORS con Access-Control-Allow-Origin: *)
    credentials: PDF_FETCH_CREDENTIALS
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`No se pudo descargar la ficha (HTTP ${res.status}). ${txt || ''}`);
    err.status = res.status;
    err.data = { body: txt || null, url: absoluteUrl };
    throw err;
  }

  // ✅ Si el backend devolvió HTML/JSON por error, esto lo frena acá
  await assertPdfResponse(res);

  const blob = await res.blob();
  const name = filename || `ficha-credito-${creditoId}.pdf`;
  const a = document.createElement('a');
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
};

export const abrirFichaCreditoPDF = async (creditoId) => {
  const url = joinPath(BASE, creditoId, 'ficha.pdf');
  const absoluteUrl = `${API_URL_BASE}${url}`;

  const res = await fetch(absoluteUrl, {
    method: 'GET',
    headers: {
      ...getAuthHeader()
    },
    // ✅ DEFAULT: omit (evita bloqueo CORS con Access-Control-Allow-Origin: *)
    credentials: PDF_FETCH_CREDENTIALS
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`No se pudo abrir la ficha (HTTP ${res.status}). ${txt || ''}`);
    err.status = res.status;
    err.data = { body: txt || null, url: absoluteUrl };
    throw err;
  }

  await assertPdfResponse(res);

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
};