// src/services/cajaService.js
import apiFetch, { getAuthHeaders } from './apiClient';

/* ───────────────── Config & helpers ───────────────── */

/**
 * ✅ IMPORTANTE
 * - apiClient ya aplica VITE_API_PREFIX a todas las rutas relativas.
 * - Acá NO debemos anteponer VITE_API_PREFIX en BASE_CAJA, sino se genera /api/api/...
 *
 * Para descargas "raw" (blob) usamos un buildURL alineado con apiClient:
 * - VITE_API_URL se trata como base (ideal: https://api.syefinanciera-app.cloud)
 * - VITE_API_PREFIX se aplica (default: /api)
 * - Si VITE_API_URL ya incluye el prefijo, no lo duplica
 */

const normalizeBase = (url) => (url || '').trim().replace(/\/+$/, '');
const normalizePrefix = (p) => {
    if (p == null) return '/api';
    const s = String(p).trim();
    if (s === '') return '';
    const withSlash = s.startsWith('/') ? s : `/${s}`;
    return withSlash.replace(/\/+$/, '');
};

const joinBaseAndPrefix = (base, prefix) => {
    const b = normalizeBase(base);
    const p = normalizePrefix(prefix);

    if (!p) return b;
    if (!b) return p;

    const bLower = b.toLowerCase();
    const pLower = p.toLowerCase();
    if (bLower.endsWith(pLower)) return b;

    return `${b}${p}`;
};

// Env (alineado con apiClient)
const RAW_API_URL = (import.meta.env.VITE_API_URL || '').trim();   // base ideal (SIN /api)
const API_BASE = (import.meta.env.VITE_API_BASE || '').trim();     // opcional
const API_PREFIX = normalizePrefix(import.meta.env.VITE_API_PREFIX ?? '/api');

// ✅ Base final absoluta o relativa (/api) para raw fetch
const API_URL =
    (RAW_API_URL
        ? joinBaseAndPrefix(RAW_API_URL, API_PREFIX)
        : (API_BASE
            ? joinBaseAndPrefix(API_BASE, API_PREFIX)
            : API_PREFIX));

// Une segmentos evitando dobles slashes
const joinPath = (...parts) =>
    '/' +
    parts
        .filter(Boolean)
        .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
        .join('/');

// ✅ NO agregamos API_PREFIX acá
const BASE_CAJA = joinPath('caja');

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

// HH:mm:ss a partir de un Date o string parseable; si ya viene, respeta
const toHMS = (v) => {
    if (!v) return v;
    if (typeof v === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(v)) return v;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
};

// Mantengo el helper por si se necesita en otros servicios
const sanitizeNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const s0 = String(value).trim();
    if (s0 === '') return 0;
    const m = s0.match(/[.,](?=[^.,]*$)/);
    if (m) {
        const i = m.index;
        const intRaw = s0.slice(0, i).replace(/[^\d-]/g, '');
        const fracRaw = s0.slice(i + 1).replace(/\D/g, '');
        const normalized = `${intRaw}.${fracRaw}`;
        const n = Number(normalized);
        return Number.isFinite(n) ? n : 0;
    }
    const n = Number(s0.replace(/[^\d-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};

const normalizeFormaPagoId = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    if (String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'none') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

// ✅ Arma URL absoluta (base + path) y agrega query params si los hay
const buildURL = (path, params = null) => {
    // Si viene absoluta, pasamos tal cual y le agregamos params
    if (/^https?:\/\//i.test(String(path))) {
        if (!params) return String(path);
        const urlAbs = new URL(String(path));
        Object.entries(params).forEach(([k, v]) => {
            if (v === undefined || v === null) return;
            if (Array.isArray(v)) v.forEach((item) => urlAbs.searchParams.append(k, item));
            else urlAbs.searchParams.append(k, v);
        });
        return urlAbs.toString();
    }

    const normalizedPath = joinPath(path);

    // API_URL puede ser absoluta (https://...) o relativa (/api)
    const base = normalizeBase(API_URL);
    const full = base ? `${base}${normalizedPath}` : normalizedPath;

    if (!params) return full;

    const url = new URL(full, window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
        else url.searchParams.append(k, v);
    });
    return url.toString();
};

// Descarga un Blob con un nombre de archivo dado
const triggerBrowserDownload = (blob, filename = 'archivo.xlsx') => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};

// Intenta extraer filename del header Content-Disposition
const getFilenameFromContentDisposition = (cd) => {
    if (!cd) return null;
    // attachment; filename="caja_2025-08-01_a_2025-08-31.xlsx"
    // attachment; filename*=UTF-8''caja_%E2%82%AC.xlsx
    const matchStd = cd.match(/filename="([^"]+)"/i);
    if (matchStd) return matchStd[1];
    const matchUtf = cd.match(/filename\*\=([^']*)''([^;]+)/i);
    if (matchUtf) {
        try {
            return decodeURIComponent(matchUtf[2]);
        } catch {
            return matchUtf[2];
        }
    }
    return null;
};

/* ───────────────── Constantes ───────────────── */

export const TIPOS_CAJA = Object.freeze(['ingreso', 'egreso', 'ajuste', 'apertura', 'cierre']);

/* ───────────────── Normalizaciones de params/payload ───────────────── */

const normalizeListParams = (params = {}) => {
    const p = { ...params };

    // Fechas (UTC)
    if ('desde' in p) p.desde = toYMD(p.desde);
    if ('hasta' in p) p.hasta = toYMD(p.hasta);

    // Tipo(s)
    if ('tipo' in p && p.tipo != null) {
        if (Array.isArray(p.tipo)) {
            p.tipo = p.tipo
                .map((t) => String(t).trim().toLowerCase())
                .filter((t) => TIPOS_CAJA.includes(t))
                .join(',');
        } else {
            p.tipo = String(p.tipo)
                .split(',')
                .map((t) => t.trim().toLowerCase())
                .filter((t) => TIPOS_CAJA.includes(t))
                .join(',');
        }
        if (p.tipo === '') delete p.tipo;
    }

    // Forma de pago
    if ('forma_pago_id' in p && p.forma_pago_id !== 'null' && p.forma_pago_id !== 'none') {
        const n = Number(p.forma_pago_id);
        if (Number.isFinite(n)) p.forma_pago_id = n;
    }

    // Referencias
    if ('referencia_tipo' in p && Array.isArray(p.referencia_tipo)) {
        p.referencia_tipo = p.referencia_tipo.map((s) => String(s).trim().toLowerCase());
    } else if ('referencia_tipo' in p && typeof p.referencia_tipo === 'string') {
        p.referencia_tipo = p.referencia_tipo
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
    }

    if ('referencia_id' in p && Array.isArray(p.referencia_id)) {
        p.referencia_id = p.referencia_id
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n));
    } else if ('referencia_id' in p && p.referencia_id !== undefined) {
        const n = Number(p.referencia_id);
        if (Number.isFinite(n)) p.referencia_id = n;
    }

    // Texto libre
    if ('q' in p && typeof p.q === 'string') p.q = p.q.trim();

    // Paginación
    if ('page' in p) {
        const pg = Number(p.page);
        if (Number.isFinite(pg) && pg > 0) p.page = pg;
    }
    if ('limit' in p) {
        const lim = Number(p.limit);
        if (Number.isFinite(lim) && lim > 0) p.limit = lim;
    }

    return p;
};

const normalizeMovimientoPayload = (payload = {}) => {
    const out = { ...payload };

    if ('fecha' in out) out.fecha = toYMD(out.fecha);
    if ('hora' in out) out.hora = toHMS(out.hora);

    // ⛔️ No sanitizamos monto en el front: lo enviamos TAL CUAL string
    // para que el backend haga la normalización única y consistente.
    if ('monto' in out) out.monto = String(out.monto ?? '').trim();

    if ('tipo' in out && typeof out.tipo === 'string') {
        const t = out.tipo.trim().toLowerCase();
        out.tipo = TIPOS_CAJA.includes(t) ? t : out.tipo;
    }

    if ('forma_pago_id' in out) out.forma_pago_id = normalizeFormaPagoId(out.forma_pago_id);

    ['concepto', 'referencia_tipo'].forEach((k) => {
        if (k in out && typeof out[k] === 'string') out[k] = out[k].trim();
    });

    if ('referencia_id' in out) {
        const n = Number(out.referencia_id);
        out.referencia_id = Number.isFinite(n) ? n : null;
    }

    if ('usuario_id' in out) {
        const n = Number(out.usuario_id);
        out.usuario_id = Number.isFinite(n) ? n : null;
    }

    return out;
};

/* ───────────────── Endpoints ───────────────── */

/**
 * Listar movimientos con filtros.
 * Por default devuelve SOLO los datos (sin paginación), igual que antes.
 * Si necesitás la paginación del backend, usá la opción { raw: true }.
 */
export const obtenerMovimientos = async (params = {}, { raw = false } = {}) => {
    const normalized = normalizeListParams(params);

    if (!raw) {
        // devolvemos tal cual lo que da el backend (en pesos reales)
        return apiFetch(joinPath(BASE_CAJA, 'movimientos'), {
            params: normalized,
            retries: 1,
            timeoutMs: 20000,
        });
    }

    // Versión RAW (preserva { success, data, pagination })
    const url = buildURL(joinPath(BASE_CAJA, 'movimientos'), normalized);
    const headers = getAuthHeaders();
    const res = await fetch(url, { method: 'GET', headers });
    const ct = res.headers.get('Content-Type') || '';
    let payload = null;
    if (ct.includes('application/json')) {
        payload = await res.json();
    } else {
        const txt = await res.text();
        payload = { success: false, message: txt || res.statusText };
    }
    if (!res.ok) {
        const err = new Error(payload?.message || 'Error al listar movimientos');
        err.status = res.status;
        err.payload = payload;
        throw err;
    }
    return payload; // { success, data, pagination }
};

/** Facilidad: movimientos de un día exacto (desde = hasta = fecha) */
export const obtenerMovimientosDelDia = (fecha, opts) =>
    obtenerMovimientos({ desde: toYMD(fecha), hasta: toYMD(fecha) }, opts);

/** Crear movimiento manual */
export const crearMovimiento = (payload) =>
    apiFetch(joinPath(BASE_CAJA, 'movimientos'), {
        method: 'POST',
        body: normalizeMovimientoPayload(payload),
        timeoutMs: 20000,
    });

/** Resumen diario: totales por tipo y por forma de pago */
export const obtenerResumenDiario = async ({ fecha } = {}) => {
    return apiFetch(joinPath(BASE_CAJA, 'resumen-diario'), {
        params: fecha ? { fecha: toYMD(fecha) } : undefined,
        retries: 1,
        timeoutMs: 15000,
    });
};

/** Resumen semanal: totales, por día y por forma de pago (desde + 6 días) */
export const obtenerResumenSemanal = async ({ desde } = {}) => {
    return apiFetch(joinPath(BASE_CAJA, 'resumen-semanal'), {
        params: desde ? { desde: toYMD(desde) } : undefined,
        retries: 1,
        timeoutMs: 15000,
    });
};

/** Resumen mensual: totales por tipo + serie por día + por forma de pago */
export const obtenerResumenMensual = async ({ anio, mes } = {}) => {
    const params = {};
    if (anio !== undefined) {
        const y = Number(anio);
        if (Number.isFinite(y)) params.anio = y;
    }
    if (mes !== undefined) {
        const m = Number(mes);
        if (Number.isFinite(m)) params.mes = m;
    }
    return apiFetch(joinPath(BASE_CAJA, 'resumen-mensual'), {
        params,
        retries: 1,
        timeoutMs: 15000,
    });
};

/**
 * Exportar Excel (4 hojas: GASTOS / COMPRAS / VENTAS / CREDITO)
 * Retorna: { blob, filename }
 */
export const exportarExcel = async ({ desde, hasta, periodo } = {}) => {
    const url = buildURL(joinPath(BASE_CAJA, 'export-excel'), {
        desde: toYMD(desde),
        hasta: toYMD(hasta),
        periodo: periodo || undefined, // 'diario' | 'semanal' | 'mensual' (opcional)
    });
    const headers = getAuthHeaders();
    headers['Accept'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const res = await fetch(url, { method: 'GET', headers });

    if (!res.ok) {
        let msg = res.statusText || 'Error al exportar Excel';
        try {
            const ct = res.headers.get('Content-Type') || '';
            if (ct.includes('application/json')) {
                const j = await res.json();
                msg = j?.message || j?.error || msg;
            } else {
                const t = await res.text();
                if (t) msg = t;
            }
        } catch { }
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }

    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const filename = getFilenameFromContentDisposition(cd) || 'caja.xlsx';
    return { blob, filename };
};

/** Descargar directamente en el navegador */
export const descargarExcel = async ({ desde, hasta, periodo, nombreArchivo } = {}) => {
    const { blob, filename } = await exportarExcel({ desde, hasta, periodo });
    triggerBrowserDownload(blob, nombreArchivo || filename || 'caja.xlsx');
    return true;
};

/**
 * ✅ NUEVO: Exportar EXCEL del HISTORIAL DE MOVIMIENTOS
 * Endpoint: GET /caja/movimientos/export-excel  (en realidad queda bajo /api si aplica)
 * Acepta los mismos filtros que obtenerMovimientos: desde, hasta, tipo, forma_pago_id,
 * referencia_tipo, referencia_id, q
 *
 * Retorna: { blob, filename }
 */
export const exportarMovimientosExcel = async (params = {}) => {
    const normalized = normalizeListParams({ ...params });

    // Estos no aplican para export
    delete normalized.page;
    delete normalized.limit;

    const url = buildURL(joinPath(BASE_CAJA, 'movimientos', 'export-excel'), normalized);

    const headers = getAuthHeaders();
    headers['Accept'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const res = await fetch(url, { method: 'GET', headers });

    if (!res.ok) {
        let msg = res.statusText || 'Error al exportar Excel (historial)';
        try {
            const ct = res.headers.get('Content-Type') || '';
            if (ct.includes('application/json')) {
                const j = await res.json();
                msg = j?.message || j?.error || msg;
            } else {
                const t = await res.text();
                if (t) msg = t;
            }
        } catch { }
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }

    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const fallback = (() => {
        const d = normalized.desde || 'sin_desde';
        const h = normalized.hasta || 'sin_hasta';
        return `historial_caja_${d}_a_${h}.xlsx`;
    })();
    const filename = getFilenameFromContentDisposition(cd) || fallback;
    return { blob, filename };
};

/** ✅ NUEVO: Descargar Excel de historial directamente en el navegador */
export const descargarMovimientosExcel = async (params = {}, { nombreArchivo } = {}) => {
    const { blob, filename } = await exportarMovimientosExcel(params);
    triggerBrowserDownload(blob, nombreArchivo || filename || 'historial_caja.xlsx');
    return true;
};

export default {
    TIPOS_CAJA,
    obtenerMovimientos,
    obtenerMovimientosDelDia,
    crearMovimiento,
    obtenerResumenDiario,
    obtenerResumenSemanal,
    obtenerResumenMensual,
    exportarExcel,
    descargarExcel,
    exportarMovimientosExcel,
    descargarMovimientosExcel,
};