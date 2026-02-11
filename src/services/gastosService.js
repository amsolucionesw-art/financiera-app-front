// src/services/gastosService.js

import apiFetch from './apiClient';

/* ───────────────── Config & helpers ───────────────── */

// ✅ IMPORTANTE: apiClient ya aplica VITE_API_PREFIX (/api).
// Acá NO sumamos otro prefijo para evitar /api/api.

// Une segmentos evitando dobles slashes
const joinPath = (...parts) =>
    '/' +
    parts
        .filter(Boolean)
        .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
        .join('/');

const BASE_GASTOS = joinPath('gastos');

/* ───────────────── Helpers ───────────────── */

// YYYY-MM-DD seguro en UTC (evita drift por huso horario)
const toYMD = (v) => {
    if (!v) return v;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

/**
 * Soporta: "1.234,56" · "1,234.56" · "1234,56" · "1234.56" · "-1.234,56" · "1 234,56"
 * Regla: el ÚLTIMO '.' o ',' es el separador decimal; el resto son miles.
 *
 * ⚠️ Ya NO lo usamos para enviar el total al backend, para evitar doble normalización.
 * Lo dejamos por si más adelante se necesita en algún cálculo de front.
 */
const sanitizeNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    const s0 = String(value).trim();
    if (s0 === '') return 0;

    const m = s0.match(/[.,](?=[^.,]*$)/);
    if (m) {
        const i = m.index;
        const intRaw = s0.slice(0, i).replace(/[^\d-]/g, ''); // preserva signo
        const fracRaw = s0.slice(i + 1).replace(/\D/g, '');
        const normalized = `${intRaw}.${fracRaw}`;
        const n = Number(normalized);
        return Number.isFinite(n) ? n : 0;
    }
    const n = Number(s0.replace(/[^\d-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};

const normalizeFormaPagoId = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

// Normaliza payload de create/update
const normalizePayload = (data = {}) => {
    const out = { ...data };

    // Fechas a YYYY-MM-DD (si vienen)
    ['fecha_imputacion', 'fecha_gasto'].forEach((k) => {
        if (k in out) out[k] = toYMD(out[k]);
    });

    // ⛔️ IMPORTANTE:
    // Ya NO sanitizamos el total en el front.
    // Dejamos que el backend (gastos.service.js) haga TODA la normalización numérica
    // con su propia lógica unificada (toNumber + fix2).
    if ('total' in out) {
        const val = out.total;
        if (typeof val === 'number') {
            // Si ya viene como número, lo dejamos tal cual.
            out.total = val;
        } else {
            // Si viene como string u otro tipo, lo mandamos como string trimmeado.
            out.total = String(val ?? '').trim();
        }
    }

    // forma de pago → número o null
    if ('forma_pago_id' in out) out.forma_pago_id = normalizeFormaPagoId(out.forma_pago_id);

    // Trims comunes
    [
        'tipo_comprobante',
        'numero_comprobante',
        'proveedor_nombre',
        'proveedor_cuit',
        'concepto',
        'clasificacion',
        'gasto_realizado_por',
        'observacion',
    ].forEach((k) => {
        if (k in out && typeof out[k] === 'string') out[k] = out[k].trim();
    });

    return out;
};

// Normaliza params de listado (filtros)
const normalizeListParams = (params = {}) => {
    const p = { ...params };

    // Fechas
    if ('desde' in p) p.desde = toYMD(p.desde);
    if ('hasta' in p) p.hasta = toYMD(p.hasta);

    // Mes/Año
    if ('mes' in p) {
        const m = Number(p.mes);
        if (Number.isFinite(m)) p.mes = m;
    }
    if ('anio' in p) {
        const y = Number(p.anio);
        if (Number.isFinite(y)) p.anio = y;
    }

    // Forma de pago: respetamos 'null'/'none' si el caller lo manda
    if ('forma_pago_id' in p && p.forma_pago_id !== 'null' && p.forma_pago_id !== 'none') {
        const n = Number(p.forma_pago_id);
        if (Number.isFinite(n)) p.forma_pago_id = n;
    }

    // Trims de strings de filtro
    [
        'q',
        'proveedor_cuit',
        'tipo_comprobante',
        'clasificacion',
        'numero_comprobante',
    ].forEach((k) => {
        if (k in p && typeof p[k] === 'string') p[k] = p[k].trim();
    });

    return p;
};

/* ───────────────── Endpoints ───────────────── */

/** Listar gastos (filtros: { desde, hasta, mes, anio, q, forma_pago_id, proveedor_cuit, tipo_comprobante, clasificacion }) */
export const listarGastos = (params = {}) =>
    apiFetch(BASE_GASTOS, { params: normalizeListParams(params) });

/** Obtener gasto por ID */
export const obtenerGasto = (id) => apiFetch(joinPath(BASE_GASTOS, id));

/** Crear gasto */
export const crearGasto = (data) =>
    apiFetch(BASE_GASTOS, {
        method: 'POST',
        body: normalizePayload(data),
    });

/** Actualizar gasto */
export const actualizarGasto = (id, data) =>
    apiFetch(joinPath(BASE_GASTOS, id), {
        method: 'PUT',
        body: normalizePayload(data),
    });

/** Eliminar gasto */
export const eliminarGasto = (id) =>
    apiFetch(joinPath(BASE_GASTOS, id), { method: 'DELETE' });

export default {
    listarGastos,
    obtenerGasto,
    crearGasto,
    actualizarGasto,
    eliminarGasto,
};