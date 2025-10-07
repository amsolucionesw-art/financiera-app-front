// src/utils/exporters.js

/**
 * Exporta a CSV (UTF-8 con BOM) un arreglo de objetos.
 * - keys: cabeceras ordenadas; si no se pasan, se infieren de la primera fila.
 * - filename: por ejemplo "caja-diaria-2025-09-02.csv"
 */
export function exportToCSV(filename, rows, keys) {
    if (!Array.isArray(rows) || rows.length === 0) {
        const headers = keys?.length ? keys : [];
        const csv = [headers.join(',')].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        triggerDownload(filename || 'export.csv', blob);
        return;
    }

    const headerKeys = Array.isArray(keys) && keys.length ? keys : Object.keys(rows[0]);

    const escape = (val) => {
        if (val === null || val === undefined) return '';
        const s = String(val);
        if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    };

    const lines = [];
    lines.push(headerKeys.join(','));
    for (const row of rows) {
        lines.push(headerKeys.map((k) => escape(row[k])).join(','));
    }

    const csv = lines.join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(filename || 'export.csv', blob);
}

function triggerDownload(filename, blob) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────────────────────
 *                          XLSX (Excel)
 *  - Export genérico multi-hoja
 *  - Export contable con columnas definidas (Compras, Ventas, Gastos, Créditos*)
 *  Usa import dinámico de 'xlsx' para no cargarlo si no se usa.
 * ───────────────────────────────────────────────────────────── */

const normalizeDecimal = (v) => {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
        const s = v.trim();
        if (!s) return '';
        // admite 1.234,56 o 1234,56 o 1234.56
        const n = Number(s.replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(n) ? n : s;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
};

/**
 * Crea una hoja a partir de:
 *  - rows: objetos
 *  - keys: orden de columnas (obligatorio para consistencia)
 *  - labels: cabeceras visibles (mismo length que keys). Si se omite, usa keys.
 *  - numericKeys: columnas a tratar como número (convierte "1.234,56" => 1234.56)
 */
function buildSheetFromRows(XLSX, { rows, keys, labels, numericKeys = [] }) {
    const hdr = Array.isArray(labels) && labels.length === keys.length ? labels : keys;

    // Construimos AoA para controlar header/anchos/tipos
    const aoa = [];
    aoa.push(hdr);

    for (const row of rows || []) {
        const r = keys.map((k) => {
            const raw = row?.[k];
            if (numericKeys.includes(k)) return normalizeDecimal(raw);
            return raw ?? '';
        });
        aoa.push(r);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Auto-width
    const colWidths = hdr.map((h, idx) => {
        const maxLen = aoa.reduce((acc, r, i) => {
            const val = r[idx];
            const s = (val === null || val === undefined) ? '' : String(val);
            const base = i === 0 ? String(h) : s;
            return Math.max(acc, base.length);
        }, 10);
        return { wch: Math.min(50, maxLen + 2) };
    });
    ws['!cols'] = colWidths;

    return ws;
}

/**
 * Exporta un XLSX multi-hoja.
 * sheets = [
 *   { name: 'Compras', rows: [...], keys: [...], labels: [...], numericKeys?: [...] },
 *   ...
 * ]
 */
export async function exportToXLSX(filename, sheets) {
    if (!Array.isArray(sheets) || sheets.length === 0) {
        console.warn('[exportToXLSX] No hay hojas para exportar.');
        return;
    }
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    for (const def of sheets) {
        const { name, rows = [], keys = [], labels = [], numericKeys = [] } = def || {};
        if (!name || !Array.isArray(keys) || keys.length === 0) continue;
        const ws = buildSheetFromRows(XLSX, { rows, keys, labels, numericKeys });
        XLSX.utils.book_append_sheet(wb, ws, String(name).slice(0, 31) || 'Sheet');
    }

    const fname = filename || 'export.xlsx';
    XLSX.writeFile(wb, fname);
}

/* ─────────────────────────────────────────────────────────────
 *             Exportador contable (4 hojas estándar)
 *  - Columnas EXACTAS que pediste:
 *    Compras:
 *      FECHA IMPUTACIÓN, FECHA DE COMPRA, TIPO DE COMPROBANTE, N° DE COMP,
 *      NOMBRE Y APELLIDO- RS, CUIT-CUIL, NETO, IVA, PER IVA, PER IIBB TUC,
 *      PER TEM, TOTAL, DEPOSITO DESTINO, REFERENCIA DE COMP, CLASIFICACION,
 *      MES, AÑO, FACTURADO A, GASTO REALIZADO POR
 *
 *    Ventas:
 *      FECHA IMPUTACION, N° DE COMP, NOMBRE Y APELLIDO, CUIT-CUIL/ DNI,
 *      NETO, IVA, RET GAN, RETIVA, RET IIBB TUC, capital, interes, cuotas,
 *      TOTAL, FORMA DE PAGO, FECHA FIN DE FINANCIACION,
 *      BONIFICACION (FALSO / VERD), VENDEDOR, MES, AÑO
 *
 *    Gastos (definición razonable basada en tu modelo Gasto):
 *      FECHA IMPUTACIÓN, FECHA DEL GASTO, TIPO DE COMPROBANTE, N° DE COMP,
 *      NOMBRE Y APELLIDO- RS, CUIT-CUIL, CONCEPTO, TOTAL, FORMA DE PAGO,
 *      CLASIFICACION, MES, AÑO, GASTO REALIZADO POR, OBSERVACION
 *
 *    Créditos (*opcional*: si proveés datos ya normalizados):
 *      Definís keys/labels al invocar (si no pasás, no se agrega hoja).
 * ───────────────────────────────────────────────────────────── */

const COMPRA_KEYS = [
    'fecha_imputacion',
    'fecha_compra',
    'tipo_comprobante',
    'numero_comprobante',
    'proveedor_nombre',
    'proveedor_cuit',
    'neto',
    'iva',
    'per_iva',
    'per_iibb_tuc',
    'per_tem',
    'total',
    'deposito_destino',
    'referencia_compra',
    'clasificacion',
    'mes',
    'anio',
    'facturado_a',
    'gasto_realizado_por',
];

const COMPRA_LABELS = [
    'FECHA IMPUTACIÓN',
    'FECHA DE COMPRA',
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
];

const COMPRA_NUMERIC = ['neto', 'iva', 'per_iva', 'per_iibb_tuc', 'per_tem', 'total'];

const VENTA_KEYS = [
    'fecha_imputacion',
    'numero_comprobante',
    'cliente_nombre',
    'doc_cliente',
    'neto',
    'iva',
    'ret_gan',
    'ret_iva',
    'ret_iibb_tuc',
    'capital',
    'interes',
    'cuotas',
    'total',
    'forma_pago', // <- string resuelto (nombre FP o #id)
    'fecha_fin',
    'bonificacion',
    'vendedor',
    'mes',
    'anio',
];

const VENTA_LABELS = [
    'FECHA IMPUTACION',
    'N° DE COMP',
    'NOMBRE Y APELLIDO',
    'CUIT-CUIL/ DNI',
    'NETO',
    'IVA',
    'RET GAN',
    'RETIVA',
    'RET IIBB TUC',
    'capital',
    'interes',
    'cuotas',
    'TOTAL',
    'FORMA DE PAGO',
    'FECHA FIN DE FINANCIACION',
    'BONIFICACION (FALSO / VERD)',
    'VENDEDOR',
    'MES',
    'AÑO',
];

const VENTA_NUMERIC = ['neto', 'iva', 'ret_gan', 'ret_iva', 'ret_iibb_tuc', 'capital', 'interes', 'cuotas', 'total'];

const GASTO_KEYS = [
    'fecha_imputacion',
    'fecha_gasto',
    'tipo_comprobante',
    'numero_comprobante',
    'proveedor_nombre',
    'proveedor_cuit',
    'concepto',
    'total',
    'forma_pago', // <- string resuelto (nombre FP o #id)
    'clasificacion',
    'mes',
    'anio',
    'gasto_realizado_por',
    'observacion',
];

const GASTO_LABELS = [
    'FECHA IMPUTACIÓN',
    'FECHA DEL GASTO',
    'TIPO DE COMPROBANTE',
    'N° DE COMP',
    'NOMBRE Y APELLIDO- RS',
    'CUIT-CUIL',
    'CONCEPTO',
    'TOTAL',
    'FORMA DE PAGO',
    'CLASIFICACION',
    'MES',
    'AÑO',
    'GASTO REALIZADO POR',
    'OBSERVACION',
];

const GASTO_NUMERIC = ['total'];

/**
 * Arma "forma_pago" amigable para Ventas/Gastos a partir de:
 *  - row.formaPago?.nombre
 *  - o row.forma_pago_id
 */
function resolveFormaPagoName(row) {
    if (row?.formaPago?.nombre) return row.formaPago.nombre;
    if (row?.forma_pago) return row.forma_pago; // ya traído
    if (row?.forma_pago_id == null) return 'Sin especificar';
    return `#${row.forma_pago_id}`;
}

/**
 * Exporta Excel multahoja con las 4 hojas (las no provistas se omiten):
 *   - compras: array de objetos según tu modelo Compra
 *   - ventas: array de objetos según tu modelo VentaManual
 *   - gastos: array de objetos según tu modelo Gasto
 *   - creditos: { rows, keys, labels, numericKeys }  (*opcional y flexible*)
 *
 * filename por defecto: "contable.xlsx"
 */
export async function exportContableXLSX({ compras, ventas, gastos, creditos }, filename = 'contable.xlsx') {
    const sheets = [];

    if (Array.isArray(compras)) {
        sheets.push({
            name: 'Compras',
            rows: compras,
            keys: COMPRA_KEYS,
            labels: COMPRA_LABELS,
            numericKeys: COMPRA_NUMERIC,
        });
    }

    if (Array.isArray(ventas)) {
        const normalized = ventas.map((v) => ({
            ...v,
            forma_pago: resolveFormaPagoName(v),
        }));
        sheets.push({
            name: 'Ventas',
            rows: normalized,
            keys: VENTA_KEYS,
            labels: VENTA_LABELS,
            numericKeys: VENTA_NUMERIC,
        });
    }

    if (Array.isArray(gastos)) {
        const normalized = gastos.map((g) => ({
            ...g,
            forma_pago: resolveFormaPagoName(g),
        }));
        sheets.push({
            name: 'Gastos',
            rows: normalized,
            keys: GASTO_KEYS,
            labels: GASTO_LABELS,
            numericKeys: GASTO_NUMERIC,
        });
    }

    // Créditos: totalmente flexible (si lo pasás, lo agregamos tal cual)
    if (creditos && Array.isArray(creditos.rows) && Array.isArray(creditos.keys) && creditos.keys.length) {
        sheets.push({
            name: creditos.name || 'Créditos',
            rows: creditos.rows || [],
            keys: creditos.keys,
            labels: creditos.labels || creditos.keys,
            numericKeys: Array.isArray(creditos.numericKeys) ? creditos.numericKeys : [],
        });
    }

    if (!sheets.length) {
        console.warn('[exportContableXLSX] No se recibieron datasets para exportar.');
        return;
    }

    await exportToXLSX(filename, sheets);
}
