// src/services/ventasService.js
// Ventas manuales (no provenientes de Recibo)

import apiFetch from './apiClient';

/* ───────────────── Config & helpers ───────────────── */

// OJO: API_URL (en apiClient) ya incluye /api por defecto.
// Acá no sumamos otro prefijo para evitar /api/api.
const API_PREFIX = import.meta.env.VITE_API_PREFIX ?? ''; // por defecto sin prefijo

const joinPath = (...parts) =>
    '/' +
    parts
        .filter(Boolean)
        .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
        .join('/');

// Backend: endpoints en `${API_PREFIX}/ventas/manuales`
const BASE_VENTAS = joinPath(API_PREFIX, 'ventas', 'manuales');

/* ───────────────── Helpers ───────────────── */

// YYYY-MM-DD seguro (UTC) para evitar drift por huso horario
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

const toInt = (v, def = 0) => {
    const n = Number(v);
    return Number.isInteger(n) ? n : def;
};

const toBool = (v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (['true', 'verdadero', '1', 'si', 'sí'].includes(s)) return true;
        if (['false', 'falso', '0', 'no'].includes(s)) return false;
    }
    return !!v;
};

const normalizeFormaPagoId = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    if (String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'none') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

// ✅ Tipo de crédito permitido (para que el back genere el crédito correcto)
const normalizeTipoCredito = (v) => {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return undefined; // dejamos que el back aplique su default ('mensual')

    // Hacemos el parser más tolerante a variantes de texto
    if (s === 'semanal' || s === 'semanales' || s.startsWith('sem')) return 'semanal';
    if (s === 'quincenal' || s === 'quincenales' || s.startsWith('quin')) return 'quincenal';
    if (s === 'mensual' || s === 'mensuales' || s.startsWith('men')) return 'mensual';

    // Si viene algo raro, caemos a mensual como comportamiento por defecto
    return 'mensual';
};

// Normaliza payload de create/update
const normalizePayload = (data = {}) => {
    const out = { ...data };

    // Fechas → YYYY-MM-DD (si vienen)
    if ('fecha_imputacion' in out) out.fecha_imputacion = toYMD(out.fecha_imputacion);
    if ('fecha_fin' in out) out.fecha_fin = out.fecha_fin ? toYMD(out.fecha_fin) : null;

    // Numéricos
    ['neto', 'iva', 'ret_gan', 'ret_iva', 'ret_iibb_tuc', 'capital', 'interes', 'total'].forEach((k) => {
        if (k in out) out[k] = sanitizeNumber(out[k]);
    });

    // Enteros
    if ('cuotas' in out) out.cuotas = Math.max(1, toInt(out.cuotas, 1));

    // Booleanos
    if ('bonificacion' in out) out.bonificacion = toBool(out.bonificacion);

    // Forma de pago → número o null
    if ('forma_pago_id' in out) out.forma_pago_id = normalizeFormaPagoId(out.forma_pago_id);

    // Tipo de crédito (para ventas financiadas → creación de crédito)
    if ('tipo_credito' in out) {
        const normalizado = normalizeTipoCredito(out.tipo_credito);
        if (normalizado !== undefined) {
            out.tipo_credito = normalizado;
        } else {
            // si no vino nada, dejamos que el backend aplique su default
            delete out.tipo_credito;
        }
    }

    // Trims comunes
    ['numero_comprobante', 'cliente_nombre', 'doc_cliente', 'vendedor', 'observacion'].forEach((k) => {
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

    // Forma de pago: respetamos 'null'/'none' si lo mandan; si es numérico, casteamos
    if ('forma_pago_id' in p && p.forma_pago_id !== 'null' && p.forma_pago_id !== 'none') {
        const n = Number(p.forma_pago_id);
        if (Number.isFinite(n)) p.forma_pago_id = n;
    }

    // Trims de strings de filtro
    ['q', 'doc_cliente', 'vendedor', 'numero_comprobante'].forEach((k) => {
        if (k in p && typeof p[k] === 'string') p[k] = p[k].trim();
    });

    return p;
};

/* ───────────────── Endpoints ───────────────── */

/** Listar ventas manuales (filtros: { desde, hasta, mes, anio, q, forma_pago_id, doc_cliente, vendedor, numero_comprobante }) */
export const listarVentas = (params = {}) =>
    apiFetch(BASE_VENTAS, { params: normalizeListParams(params) });

/** Obtener venta manual por ID */
export const obtenerVenta = (id) => apiFetch(joinPath(BASE_VENTAS, id));

/** Crear venta manual */
export const crearVenta = (data) =>
    apiFetch(BASE_VENTAS, {
        method: 'POST',
        body: normalizePayload(data),
    });

/** Actualizar venta manual */
export const actualizarVenta = (id, data) =>
    apiFetch(joinPath(BASE_VENTAS, id), {
        method: 'PUT',
        body: normalizePayload(data),
    });

/** Eliminar venta manual */
export const eliminarVenta = (id) =>
    apiFetch(joinPath(BASE_VENTAS, id), { method: 'DELETE' });

export default {
    listarVentas,
    obtenerVenta,
    crearVenta,
    actualizarVenta,
    eliminarVenta,
};
