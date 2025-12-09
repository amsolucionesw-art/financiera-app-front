// src/services/creditoService.js

import apiFetch from './apiClient';

/* ───────────────── Config & helpers de ruta ───────────────── */

const API_PREFIX = import.meta.env.VITE_API_PREFIX ?? ''; // por defecto sin prefijo
const API_URL = import.meta.env.VITE_API_URL || ''; // base absoluta para fetch directo (PDF)

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

/* ───────────────── Helpers de auth/headers (para fetch directo) ───────────────── */

const getAuthHeader = () => {
  try {
    const t =
      localStorage.getItem('token') ||
      sessionStorage.getItem('token') ||
      null;
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
};

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

/**
 * Obtiene los créditos de un cliente con filtros del back:
 * estado, modalidad, tipo, desde (YYYY-MM-DD), hasta (YYYY-MM-DD), conCuotasVencidas (bool/1)
 */
export const obtenerCreditosPorCliente = (clienteId, params = {}) =>
  apiFetch(joinPath(BASE, 'cliente', clienteId), { params });

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
 * El backend ya valida modalidad (común, progresivo, libre) y
 * calcula la base de refinanciación (saldo + mora pendiente).
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
 * - Valida en cliente que la modalidad sea una de las permitidas para refi:
 *   "comun", "progresivo" o "libre".
 * - El cálculo "serio" lo hace SIEMPRE el backend.
 */
export const refinanciarCreditoSeguro = async (
  credito, // objeto crédito completo o al menos { id, modalidad_credito, saldo_actual, tipo_credito, cantidad_cuotas }
  { opcion, tasaManual = 0, tipo_credito, cantidad_cuotas }
) => {
  const id = credito?.id;
  if (!id) throw new Error('Crédito inválido (falta id).');

  const modalidad = String(credito?.modalidad_credito || '').toLowerCase();
  if (!['comun', 'progresivo', 'libre'].includes(modalidad)) {
    const err = new Error(
      'Solo se permite refinanciar créditos de modalidad "comun", "progresivo" o "libre".'
    );
    err.status = 400;
    throw err;
  }

  // (Opcional) podrías calcular un preview para mostrar al usuario:
  // const preview = previewRefinanciacion({ ... });

  return refinanciarCredito(id, {
    opcion,
    tasaManual,
    tipo_credito,
    cantidad_cuotas
  });
};

/** Anula un crédito (superadmin) — OJO: debe existir la ruta back /creditos/:id/anular */
export const anularCredito = (id) =>
  apiFetch(joinPath(BASE, id, 'anular'), { method: 'POST' });

/**
 * Solicita anulación de crédito (admin)
 * Intento 1: POST /tareas/pendientes
 * Si el backend responde 404 → Intento 2: POST /tareas
 */
export const solicitarAnulacionCredito = async ({ creditoId, motivo }) => {
  const body = {
    tipo: 'anular_credito',
    datos: { creditoId, motivo },
  };

  const pathPendientes = joinPath(API_PREFIX, 'tareas', 'pendientes');
  const pathCanonico  = joinPath(API_PREFIX, 'tareas');

  try {
    return await apiFetch(pathPendientes, { method: 'POST', body });
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    const msg = (err?.message || '').toLowerCase();
    if (status === 404 || msg.includes('404')) {
      // Reintento contra la ruta canónica
      return apiFetch(pathCanonico, { method: 'POST', body });
    }
    throw err;
  }
};

/* ───────────────── Cancelación / Liquidación ───────────────── */

/**
 * CANCELAR / LIQUIDAR crédito (pago único con recibo único).
 * Backend: POST /creditos/:id/cancelar
 * 
 * @param {number|string} creditoId
 * @param {object} options
 * @param {number} options.forma_pago_id                            // requerido
 * @param {number|string} [options.descuento_porcentaje=0]         // porcentaje 0..100
 * @param {'mora'|'total'} [options.descuento_sobre='mora']        // modo de descuento:
 *    - 'mora'  → el descuento se aplica solo sobre la mora (regla por defecto)
 *    - 'total' → (si el backend está habilitado) permite descuento sobre el total (principal+mora)
 * @param {string|null} [options.observacion=null]
 *
 * @returns {Promise<object>} Respuesta normalizada con `numero_recibo` si está disponible.
 */
export const cancelarCredito = async (
  creditoId,
  {
    forma_pago_id,
    descuento_porcentaje = 0,
    descuento_sobre = 'mora',
    observacion = null
  }
) => {
  const body = {
    forma_pago_id,
    descuento_porcentaje: sanitizeNumber(descuento_porcentaje),
    // Enviamos siempre el modo para que el back lo decida (compatibilidad hacia atrás: default 'mora')
    descuento_sobre: String(descuento_sobre || 'mora').toLowerCase(),
    observacion
  };

  const resp = await apiFetch(joinPath(BASE, creditoId, 'cancelar'), {
    method: 'POST',
    body
  });

  const data = unwrap(resp) ?? {};

  // Normalización defensiva para facilitar la redirección al recibo en el front:
  // — si viene anidado, lo promuevo.
  const numero =
    data.numero_recibo ??
    data?.recibo?.numero_recibo ??
    data?.data?.numero_recibo ??
    data?.data?.recibo?.numero_recibo;

  if (numero && !('numero_recibo' in data)) {
    data.numero_recibo = numero;
  }

  return data;
};

/* ─────────── NUEVO: Preview de liquidación (para UI en vivo) ─────────── */

/**
 * Calcula un preview de liquidación en el FRONT (sin tocar el back).
 * - Para COMÚN/PROGRESIVO usa las cuotas que tengas en memoria.
 * - Para LIBRE consulta `obtenerResumenLibre` para traer interés vigente del día.
 *
 * @param {object} credito - objeto crédito con al menos { modalidad_credito, cuotas[], saldo_actual, id }
 * @param {object} options - { descuento_porcentaje, descuento_sobre: 'mora'|'total' }
 * @returns {Promise<object>} { principal_base, mora_base, descuento_aplicado_mora, descuento_aplicado_principal, total_a_pagar }
 */
export const previewLiquidacionCredito = async (
  credito,
  { descuento_porcentaje = 0, descuento_sobre = 'mora' } = {}
) => {
  const pct = Math.min(Math.max(sanitizeNumber(descuento_porcentaje), 0), 100);
  const modo = String(descuento_sobre || 'mora').toLowerCase();

  const modalidad = String(credito?.modalidad_credito || '');
  let principalBase = 0;
  let moraBase = 0;

  if (modalidad === 'libre') {
    // Traigo capital + interés (mora) del día desde el back para precisión
    const resumen = unwrap(await obtenerResumenLibre(credito.id));
    const capital = sanitizeNumber(resumen?.saldo_capital ?? credito?.saldo_actual);
    const interesHoy = sanitizeNumber(resumen?.interes_pendiente_hoy);
    principalBase = +capital.toFixed(2);
    moraBase = +interesHoy.toFixed(2);
  } else {
    // común / progresivo: calculo con lo que hay en memoria
    const cuotas = Array.isArray(credito?.cuotas) ? credito.cuotas : [];
    for (const c of cuotas) {
      const estado = String(c.estado || '').toLowerCase();
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

  // Distribución del descuento
  let descMora = 0;
  let descPrincipal = 0;

  if (modo === 'total') {
    const base = +(principalBase + moraBase).toFixed(2);
    let totalDesc = +(base * (pct / 100)).toFixed(2);
    // primero se descuenta de mora, luego de principal
    descMora = Math.min(totalDesc, moraBase);
    totalDesc = +(totalDesc - descMora).toFixed(2);
    descPrincipal = Math.min(totalDesc, principalBase);
  } else {
    // solo sobre mora
    descMora = +(moraBase * (pct / 100)).toFixed(2);
    descPrincipal = 0;
  }

  const moraNeta = +(Math.max(moraBase - descMora, 0)).toFixed(2);
  const principalNeto = +(Math.max(principalBase - descPrincipal, 0)).toFixed(2);
  const totalAPagar = +(moraNeta + principalNeto).toFixed(2);

  return {
    principal_base: principalBase,
    mora_base: moraBase,
    descuento_aplicado_mora: descMora,
    descuento_aplicado_principal: descPrincipal,
    total_a_pagar: totalAPagar,
    // convenientes para UI
    total_base: +(principalBase + moraBase).toFixed(2),
    total_descuento: +(descMora + descPrincipal).toFixed(2),
    resumen: {
      principal_neto: principalNeto,
      mora_neta: moraNeta
    }
  };
};

/* ──────────────────────── Impresión / Descarga de Ficha ──────────────────────── */
/** Formatea moneda ARS para la UI */
const money = (n) =>
  Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Etiqueta para la modalidad como en el back */
const labelModalidad = (modalidad) => {
  const m = String(modalidad || '').toLowerCase();
  if (m === 'comun') return 'PLAN DE CUOTAS FIJAS';
  return m.toUpperCase();
};

/** Total actual (mismo criterio que el back) */
const calcularTotalActualFront = (credito) => {
  if (!credito) return 0;
  if (String(credito.modalidad_credito) === 'libre') {
    // ✅ Alineado al backend: capital + mora vigente (de la cuota abierta)
    const capital = Number(credito.saldo_actual || 0);
    const cuota = Array.isArray(credito.cuotas) ? credito.cuotas[0] : null;
    const mora = Number(cuota?.intereses_vencidos_acumulados || 0);
    return +(capital + mora).toFixed(2);
  }
  let total = 0;
  for (const c of (credito.cuotas || [])) {
    const estado = String(c.estado || '').toLowerCase();
    if (!['pendiente', 'parcial', 'vencida'].includes(estado)) continue;
    const principalPend = Math.max(
      +(Number(c.importe_cuota || 0) - Number(c.descuento_cuota || 0) - Number(c.monto_pagado_acumulado || 0)).toFixed(2),
      0
    );
    const mora = +(Number(c.intereses_vencidos_acumulados || 0).toFixed(2));
    total = +(total + principalPend + mora).toFixed(2);
  }
  return total;
};

const LIBRE_VTO_FICTICIO = '2099-12-31';

const construirHTMLFicha = (credito) => {
  const c = credito || {};
  const cli = c.cliente || {};
  const cuotas = Array.isArray(c.cuotas) ? c.cuotas : [];
  const totalActual = Number(c.total_actual ?? calcularTotalActualFront(c));
  const fechaEmision = new Date().toISOString().slice(0, 10);

  // ▶️ calcular primer y último vencimiento reales (ignorando ficticio de LIBRE)
  const vtosValidos = cuotas
    .map(ct => ct.fecha_vencimiento)
    .filter(f => f && f !== LIBRE_VTO_FICTICIO)
    .sort(); // YYYY-MM-DD ordena bien como string

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

  const rows = cuotas.map(ct => {
    const principalPend = Math.max(
      +(Number(ct.importe_cuota || 0) - Number(ct.descuento_cuota || 0) - Number(ct.monto_pagado_acumulado || 0)).toFixed(2),
      0
    );
    const mora = +(Number(ct.intereses_vencidos_acumulados || 0).toFixed(2));
    const saldoCuota = +(principalPend + mora).toFixed(2); // ✅ igual que el PDF del back
    const vto = ct.fecha_vencimiento === LIBRE_VTO_FICTICIO ? '—' : (ct.fecha_vencimiento || '-');
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
  }).join('');

  const totales = cuotas.reduce((acc, ct) => {
    const principalPend = Math.max(
      +(Number(ct.importe_cuota || 0) - Number(ct.descuento_cuota || 0) - Number(ct.monto_pagado_acumulado || 0)).toFixed(2),
      0
    );
    const mora = +(Number(ct.intereses_vencidos_acumulados || 0).toFixed(2));
    acc.principal += principalPend;
    acc.mora += mora;
    return acc;
  }, { principal: 0, mora: 0 });

  return `
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Ficha de Crédito #${c.id}</title>
      ${styles}
    </head>
    <body>
      <h1>Ficha de Crédito</h1>
      <div class="muted">Emitido: ${fechaEmision}</div>

      <div class="section">
        <div class="title">Cliente</div>
        <div class="grid">
          <div class="row"><label>Nombre</label><div>${[cli.nombre, cli.apellido].filter(Boolean).join(' ') || '-'}</div></div>
          <div class="row"><label>DNI</label><div>${cli.dni || '-'}</div></div>
          <div class="row"><label>Teléfono(s)</label><div>${[cli.telefono_1, cli.telefono_2, cli.telefono].filter(Boolean).join(' / ') || '-'}</div></div>
          <div class="row"><label>Dirección</label><div>${[cli.direccion_1, cli.direccion_2, cli.direccion].filter(Boolean).join(' | ') || '-'}</div></div>
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
          <div class="row"><label>Cobrador</label><div>${c.cobradorCredito?.nombre_completo || '-'}</div></div>
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
    alert('El bloqueador de ventanas emergentes impidió abrir la vista de impresión. Permití popups para continuar.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onload = () => {
    try { w.focus(); } catch (_) {}
    try { w.print(); } catch (_) {}
    setTimeout(() => { try { w.close(); } catch (_) {} }, 500);
  };
};

/**
 * Imprime la ficha del crédito desde el FRONT (HTML):
 * - Obtiene el crédito completo del backend
 * - Genera HTML y abre una ventana para imprimir/guardar a PDF
 * No incluye “interés” ni “monto acreditado”.
 */
export const imprimirFichaDesdeFront = async (creditoId) => {
  const resp = await obtenerCreditoPorId(creditoId);
  const credito = unwrap(resp);
  if (!credito) throw new Error(`No se encontró el crédito #${creditoId}`);
  const html = construirHTMLFicha(credito);
  abrirVentanaImpresion(html);
};

// (opcional) exporto el constructor de HTML por si querés guardarlo como archivo luego
export const construirFichaHTML = construirHTMLFicha;

/* ───────────────── Descarga/Apertura de PDF desde el BACK ───────────────── */

/**
 * Descarga el PDF generado por el backend: GET /creditos/:id/ficha.pdf
 * - Usa import.meta.env (no process)
 * - Adjunta Authorization: Bearer <token> si está disponible (localStorage/sessionStorage)
 * - Guarda como "ficha-credito-<id>.pdf"
 */
export const descargarFichaCreditoPDF = async (creditoId, filename) => {
  const url = joinPath(BASE, creditoId, 'ficha.pdf');
  const absoluteUrl = `${API_URL}${url}`;
  const res = await fetch(absoluteUrl, {
    method: 'GET',
    headers: {
      ...getAuthHeader()
    },
    credentials: 'include' // por si usás cookies de sesión además del token
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`No se pudo descargar la ficha (HTTP ${res.status}). ${txt || ''}`);
  }
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

/**
 * Abre el PDF del backend en una nueva pestaña (sin diálogo de descarga).
 */
export const abrirFichaCreditoPDF = async (creditoId) => {
  const url = joinPath(BASE, creditoId, 'ficha.pdf');
  const absoluteUrl = `${API_URL}${url}`;
  const res = await fetch(absoluteUrl, {
    method: 'GET',
    headers: {
      ...getAuthHeader()
    },
    credentials: 'include'
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`No se pudo abrir la ficha (HTTP ${res.status}). ${txt || ''}`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  // Revocar luego de un tiempo prudente para no invalidar mientras el usuario la mira
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
};