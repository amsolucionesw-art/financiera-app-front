// src/services/comprasService.js
import apiFetch from './apiClient';

/* ───────────────── Config & helpers de ruta ───────────────── */

// OJO: API_URL (en apiClient) ya incluye /api por defecto.
// Acá no sumamos otro prefijo para evitar /api/api.
const API_PREFIX = import.meta.env.VITE_API_PREFIX ?? ''; // por defecto sin prefijo

// Une segmentos evitando dobles slashes
const joinPath = (...parts) =>
    '/' +
    parts
        .filter(Boolean)
        .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
        .join('/');

const BASE_COMPRAS = joinPath(API_PREFIX, 'compras');

/* ───────────────── Helpers ───────────────── */

// YYYY-MM-DD seguro **en UTC** (sin drift por huso horario)
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

    // último separador decimal (si existe)
    const m = s0.match(/[.,](?=[^.,]*$)/);
    if (m) {
        const i = m.index;
        const intRaw = s0.slice(0, i).replace(/[^\d-]/g, ''); // preserva signo
        const fracRaw = s0.slice(i + 1).replace(/\D/g, '');
        const normalized = `${intRaw}.${fracRaw}`;
        const n = Number(normalized);
        return Number.isFinite(n) ? n : 0;
    }
    // sin separador decimal
    const n = Number(s0.replace(/[^\d-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};

const normalizeFormaPagoId = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const normalizeProveedorId = (v) => {
    if (v === undefined || v === null || v === '') return undefined; // omitimos del payload
    if (v === 'null' || v === 'none') return null;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    return undefined;
};

const normalizePayload = (data = {}) => {
    const out = { ...data };

    // fechas a YYYY-MM-DD (si vienen)
    ['fecha_imputacion', 'fecha_compra'].forEach((k) => {
        if (k in out) out[k] = toYMD(out[k]);
    });

    // numéricos
    ['neto', 'iva', 'per_iva', 'per_iibb_tuc', 'per_tem', 'total'].forEach((k) => {
        if (k in out) out[k] = sanitizeNumber(out[k]);
    });

    // forma de pago → número o null
    if ('forma_pago_id' in out) out.forma_pago_id = normalizeFormaPagoId(out.forma_pago_id);

    // proveedor → número, null o se omite si vacío/invalid
    if ('proveedor_id' in out) {
        const pid = normalizeProveedorId(out.proveedor_id);
        if (pid === undefined) delete out.proveedor_id;
        else out.proveedor_id = pid;
    }

    // strings “limpios”
    [
        'tipo_comprobante',
        'numero_comprobante',
        'proveedor_nombre',
        'proveedor_cuit',
        'deposito_destino',
        'referencia_compra',
        'clasificacion',
        'facturado_a',
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

    // Forma de pago: respetamos 'null'/'none' si el caller lo manda; si es numérico lo casteamos
    if ('forma_pago_id' in p && p.forma_pago_id !== 'null' && p.forma_pago_id !== 'none') {
        const n = Number(p.forma_pago_id);
        if (Number.isFinite(n)) p.forma_pago_id = n;
    }

    // Proveedor: si viene numérico lo casteamos; si viene vacío lo quitamos
    if ('proveedor_id' in p) {
        const pid = normalizeProveedorId(p.proveedor_id);
        if (pid === undefined) delete p.proveedor_id;
        else p.proveedor_id = pid;
    }

    // Trims de strings de filtro
    [
        'q',
        'tipo_comprobante',
        'proveedor_cuit',
        'clasificacion',
        'referencia_compra',
        'numero_comprobante',
    ].forEach((k) => {
        if (k in p && typeof p[k] === 'string') p[k] = p[k].trim();
    });

    return p;
};

/* Formato AR simple para CSV/XLSX (texto), usando coma como separador decimal */
const formatMontoAR = (v) => Number(sanitizeNumber(v)).toFixed(2).replace('.', ',');

/* Columnas pedidas para hoja “Compras” (alineadas con backend /caja/export-excel) */
export const COMPRAS_EXPORT_COLUMNS = [
    'FECHA IMPUTACIÓN',
    'FECHA DE COMPR',
    'TIPO DE COMPROBANTE',
    'N° DE COMP',
    'NOMBRE Y APELLIDO- RS',
    'CUIT-CUIL',
    'NETO',
    'IVA',
    'PER IVA',
    'PER IIBB TUC',
    'PER TEM',
    'TOTAL',
    'DEPOSITO DESTINO',
    'REFERENCIA DE COMP',
    'CLASIFICACION',
    'MES',
    'AÑO',
    'FACTURADO A',
    'GASTO REALIZADO POR',
    'FORMA DE PAGO',  // extra para paridad con export del backend
    'CajaMovID',      // extra para paridad con export del backend
];

/**
 * Mapea registros de compra a filas con las columnas exactas para exportar.
 * Recibe el array que devuelve la API de /compras.
 */
export const buildComprasExportRows = (compras = []) =>
    (Array.isArray(compras) ? compras : []).map((c) => ({
        'FECHA IMPUTACIÓN': c.fecha_imputacion ?? '',
        'FECHA DE COMPR': c.fecha_compra ?? '',
        'TIPO DE COMPROBANTE': c.tipo_comprobante ?? '',
        'N° DE COMP': c.numero_comprobante ?? '',
        'NOMBRE Y APELLIDO- RS': c.proveedor_nombre ?? '',
        'CUIT-CUIL': c.proveedor_cuit ?? '',
        NETO: formatMontoAR(c.neto),
        IVA: formatMontoAR(c.iva),
        'PER IVA': formatMontoAR(c.per_iva),
        'PER IIBB TUC': formatMontoAR(c.per_iibb_tuc),
        'PER TEM': formatMontoAR(c.per_tem),
        TOTAL: formatMontoAR(c.total),
        'DEPOSITO DESTINO': c.deposito_destino ?? '',
        'REFERENCIA DE COMP': c.referencia_compra ?? '',
        CLASIFICACION: c.clasificacion ?? '',
        MES: c.mes ?? '',
        AÑO: c.anio ?? '',
        'FACTURADO A': c.facturado_a ?? '',
        'GASTO REALIZADO POR': c.gasto_realizado_por ?? '',
        // si en tu UI tenés el nombre, usalo; sino cae al id
        'FORMA DE PAGO': c.forma_pago_nombre ?? c.formaPago?.nombre ?? c.forma_pago_id ?? '',
        'CajaMovID': c.caja_movimiento_id ?? '',
    }));

/* ───────────────── Endpoints ───────────────── */

/** Listar compras (filtros: { desde, hasta, mes, anio, q, proveedor_id, ... }) */
export const listarCompras = (params = {}) =>
    apiFetch(BASE_COMPRAS, { params: normalizeListParams(params) });

/** Obtener una compra por ID */
export const obtenerCompra = (id) => apiFetch(joinPath(BASE_COMPRAS, id));

/** Crear compra */
export const crearCompra = (data) =>
    apiFetch(BASE_COMPRAS, {
        method: 'POST',
        body: normalizePayload(data),
    });

/** Actualizar compra */
export const actualizarCompra = (id, data) =>
    apiFetch(joinPath(BASE_COMPRAS, id), {
        method: 'PUT',
        body: normalizePayload(data),
    });

/** Eliminar compra */
export const eliminarCompra = (id) =>
    apiFetch(joinPath(BASE_COMPRAS, id), { method: 'DELETE' });

export default {
    listarCompras,
    obtenerCompra,
    crearCompra,
    actualizarCompra,
    eliminarCompra,
    // export helpers
    COMPRAS_EXPORT_COLUMNS,
    buildComprasExportRows,
};