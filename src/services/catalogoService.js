// src/services/index.js  (o el nombre de tu archivo actual)

import { obtenerCobradoresConZonas as _obtenerCobradoresConZonas } from './usuarioService';
import { obtenerClientes as _obtenerClientes } from './clienteService';
import { obtenerFormasDePago as _obtenerFormasDePago } from './cuotaService';
import { obtenerZonas as _obtenerZonas } from './zonaService';

/**
 * Caché en memoria simple con TTL.
 * - Key compuesta por nombre lógico + (opcional) variante
 * - Guardamos: { t: timestampMs, v: valor }
 */
const _mem = new Map();

const _now = () => Date.now();
const _mkKey = (base, variant) => (variant ? `${base}::${variant}` : base);

/**
 * Creador de wrappers con caché.
 * - fetcher: función original (sin args en este caso)
 * - baseKey: nombre lógico del recurso
 */
const withCache = (baseKey, fetcher) => {
    /**
     * @param {object} [opts]
     * @param {boolean} [opts.force=false]  Ignorar caché y refrescar
     * @param {number}  [opts.ttlMs=600000] TTL en ms (default 10 minutos)
     * @param {string}  [opts.variant]      Variante opcional para separar caché (si el día de mañana hay filtros)
     */
    return async (opts = {}) => {
        const { force = false, ttlMs = 10 * 60_000, variant } = opts || {};
        const key = _mkKey(baseKey, variant);

        if (!force) {
            const hit = _mem.get(key);
            if (hit && _now() - hit.t < ttlMs) return hit.v;
        }

        try {
            const v = await fetcher(); // hoy no recibimos args; si mañana hay, se puede adaptar
            _mem.set(key, { t: _now(), v });
            return v;
        } catch (e) {
            // Si falla, no dejemos un valor viejo inválido si force=true
            if (force) _mem.delete(key);
            throw e;
        }
    };
};

/* ==================== Wrappers con caché ==================== */
/** Cobradores con sus zonas (catálogo) */
export const obtenerCobradoresConZonas = withCache(
    'cobradoresConZonas',
    _obtenerCobradoresConZonas
);

/** Clientes (si es una lista frecuente, conviene TTL corto o invalidar tras altas/edits) */
export const obtenerClientes = withCache('clientes', _obtenerClientes);

/** Formas de pago (catálogo clásico) */
export const obtenerFormasDePago = withCache('formasDePago', _obtenerFormasDePago);

/** Zonas (nuevo) */
export const obtenerZonas = withCache('zonas', _obtenerZonas);

/* ==================== Invalidadores (para usar tras altas/edits) ==================== */
export const invalidateCobradoresConZonas = (variant) =>
    _mem.delete(_mkKey('cobradoresConZonas', variant));
export const invalidateClientes = (variant) => _mem.delete(_mkKey('clientes', variant));
export const invalidateFormasDePago = (variant) =>
    _mem.delete(_mkKey('formasDePago', variant));
export const invalidateZonas = (variant) => _mem.delete(_mkKey('zonas', variant));

/* ==================== Bootstrap útil para pantallas ==================== */
/**
 * Trae en paralelo los catálogos más usados.
 * - Podés pasar { force:true } para refrescar todo
 * - ttlMs independiente por si en una pantalla querés TTL distinto
 */
export const bootstrapCatalogos = async (opts = {}) => {
    const [cobradores, clientes, formas, zonas] = await Promise.all([
        obtenerCobradoresConZonas(opts),
        obtenerClientes(opts),
        obtenerFormasDePago(opts),
        obtenerZonas(opts)
    ]);
    return { cobradores, clientes, formas, zonas };
};

/* ==================== (Opcional) Default export cómodo ==================== */
export default {
    obtenerCobradoresConZonas,
    obtenerClientes,
    obtenerFormasDePago,
    obtenerZonas,
    invalidateCobradoresConZonas,
    invalidateClientes,
    invalidateFormasDePago,
    invalidateZonas,
    bootstrapCatalogos
};