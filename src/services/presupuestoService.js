// src/services/presupuestoService.js
import apiFetch from './apiClient';

// ✅ IMPORTANTE: apiClient ya aplica VITE_API_PREFIX (/api).
// Acá NO sumamos otro prefijo para evitar /api/api.
const BASE = `/presupuestos`;

/* Helpers */
const toNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const s = value.trim();
        if (s === '') return 0;
        // admite "1.234,56" -> 1234.56
        return Number(s.replace(/\./g, '').replace(',', '.')) || 0;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const sanitizeParams = (params = {}) => {
    const clean = {};
    Object.entries(params).forEach(([k, v]) => {
        if (v === null || v === undefined) return;
        if (typeof v === 'string') {
            const s = v.trim();
            if (s !== '') clean[k] = s;
            return;
        }
        if (Array.isArray(v)) {
            if (v.length) clean[k] = v;
            return;
        }
        clean[k] = v;
    });
    return clean;
};

/**
 * Normaliza números y devuelve interés en **decimal** (0.60).
 * Acepta interés recibido como 0.60 o 60.
 */
function parsePresupuesto(data) {
    let monto_financiado = toNumber(data.monto_financiado);
    let cantidad_cuotas = toNumber(data.cantidad_cuotas);
    let interes = toNumber(data.interes);
    let valor_por_cuota = toNumber(data.valor_por_cuota);
    let total_a_pagar = toNumber(data.total_a_pagar);

    if (interes > 1) interes = interes / 100; // 60 -> 0.60

    return {
        ...data,
        monto_financiado,
        cantidad_cuotas,
        interes,            // siempre decimal 0..1 para el front
        valor_por_cuota,
        total_a_pagar
    };
}

/* Endpoints */
export const obtenerPresupuestos = async () => {
    const lista = await apiFetch(BASE);
    const arr = Array.isArray(lista) ? lista : [];
    return arr.map(parsePresupuesto);
};

export const crearPresupuesto = (data) => {
    // Dejá que el backend decida si guarda % o decimal; acá solo enviamos limpio.
    return apiFetch(BASE, {
        method: 'POST',
        body: data
    });
};

export const buscarPresupuestos = async ({ id, nombre_destinatario } = {}) => {
    const lista = await apiFetch(BASE, {
        params: sanitizeParams({ id, nombre_destinatario })
    });
    const arr = Array.isArray(lista) ? lista : [];
    return arr.map(parsePresupuesto);
};

export const obtenerPresupuestoPorNumero = async (numero) => {
    const data = await apiFetch(`${BASE}/${numero}`);
    return parsePresupuesto(data);
};

export default {
    obtenerPresupuestos,
    crearPresupuesto,
    buscarPresupuestos,
    obtenerPresupuestoPorNumero
};