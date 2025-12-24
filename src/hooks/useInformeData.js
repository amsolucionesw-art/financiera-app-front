// src/hooks/useInformeData.js

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { obtenerInforme } from '../services/InformeService';

/* ---------- Filtros por defecto ---------- */
export const defaultFilters = {
    tipo: 'clientes',
    zonaId: '',
    cobradorId: '',
    clienteId: '',
    conCreditosPendientes: false,
    estadoCredito: '',
    estadoCuota: '',
    modalidad: '',
    q: '',
    desde: '',
    hasta: '',
    formaPagoId: '',
    hoy: false,

    // ✅ Selector del tipo de fecha para armar rango (solo créditos)
    rangoFechaCredito: 'acreditacion_compromiso'
};

/* ---------- Helpers para columnas ---------- */

/**
 * Genera una etiqueta legible a partir de la key del backend.
 */
const prettyHeader = (key, tipo) => {
    if (!key) return '';

    const k = String(key).toLowerCase();

    const mapGenerico = {
        id: 'ID',
        dni: 'DNI',
        cuil: 'CUIL',
        cuit: 'CUIT',
        telefono: 'Teléfono',
        telefono_secundario: 'Teléfono secundario',
        zona: 'Zona',
        zona_nombre: 'Zona',
        cobrador: 'Cobrador',
        cobrador_nombre: 'Cobrador',
        cliente: 'Cliente',
        cliente_nombre: 'Nombre cliente',
        cliente_apellido: 'Apellido cliente',
        fecha: 'Fecha',
        fecha_alta: 'Fecha alta',
        fecha_registro: 'Fecha registro',
        fecha_otorgamiento: 'Fecha otorgamiento',
        fecha_vencimiento: 'Fecha vencimiento',
        fecha_primera_cuota: 'Fecha 1ª cuota',
        monto: 'Monto',
        monto_total: 'Monto total',
        monto_credito: 'Monto crédito',
        importe: 'Importe',
        total: 'Total',
        total_actual: 'Total actual',
        capital: 'Capital',
        capital_pendiente: 'Capital pendiente',
        capital_pagado: 'Capital pagado',
        interes: 'Interés',
        interes_total: 'Interés total',
        interes_acumulado: 'Interés acumulado',
        interes_vencidos_acumulados: 'Interés vencidos acum.',
        mora: 'Mora',
        mora_neta: 'Mora neta',

        // ✅ Mora acumulada (monto)
        // Nota: en backend dejamos mora_diaria_monto como "mora acumulada hasta hoy".
        mora_diaria: 'Mora acumulada',
        mora_diaria_monto: 'Mora acumulada',
        mora_diaria_actual: 'Mora acumulada',
        moraDiaria: 'Mora acumulada',
        moraDiariaMonto: 'Mora acumulada',
        moraDiariaActual: 'Mora acumulada',

        // ✅ Mora por día (si la llegan a mostrar)
        mora_por_dia_monto: 'Mora por día',
        mora_por_dia: 'Mora por día',
        moraPorDiaMonto: 'Mora por día',
        moraPorDia: 'Mora por día',
        mora_dia: 'Mora por día',
        moraDia: 'Mora por día',

        // ✅ Días de atraso (si la llegan a mostrar)
        dias_atraso: 'Días atraso',
        diasAtraso: 'Días atraso',

        saldo: 'Saldo',
        saldo_actual: 'Saldo actual',
        estado: 'Estado',
        estado_credito: 'Estado crédito',
        estado_cuota: 'Estado cuota',
        modalidad: 'Modalidad',
        numero_cuota: 'N° cuota',
        cuota_numero: 'N° cuota',
        cantidad_cuotas: 'Cantidad de cuotas',
        cuotas_pendientes: 'Cuotas pendientes',
        cuotas_pagadas: 'Cuotas pagadas',
        cuotas_vencidas: 'Cuotas vencidas',
        valor_cuota: 'Valor cuota',
        pagado: 'Pagado',
        abonado: 'Abonado'
    };

    if (mapGenerico[k]) return mapGenerico[k];

    if (tipo === 'clientes') {
        if (k.includes('cliente') && k.includes('nombre')) return 'Nombre cliente';
        if (k.includes('cliente') && k.includes('apellido')) return 'Apellido cliente';
    }

    if (tipo === 'creditos') {
        if (k === 'id_credito' || k === 'credito_id') return 'ID crédito';
    }

    if (tipo === 'cuotas') {
        if (k === 'id_cuota' || k === 'cuota_id') return 'ID cuota';
    }

    const cleaned = key
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase();

    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Decide si una columna debería marcarse como sumable (meta.sum)
 */
const shouldSumColumn = (key) => {
    if (!key) return false;
    const k = String(key).toLowerCase();

    if (/(dni|documento|doc|cuil|cuit)/.test(k)) return false;
    if (/(telefono|tel|celu|celular|movil|whatsapp|wp|contacto)/.test(k)) return false;
    if (/(^id$|_id$|id_)/.test(k)) return false;
    if (/(nro|numero|num)/.test(k)) return false;

    if (/(monto|importe|total|saldo|mora|capital|interes|cuota|valor|bruto|neto|costo|precio)/.test(k)) {
        return true;
    }
    if (/(cantidad|cant)/.test(k)) {
        return true;
    }

    return false;
};

/* ---------- Normalizador de rangoFechaCredito (defensivo) ---------- */
const normalizeRangoFechaCredito = (v) => {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'solicitud') return 'solicitud';
    if (s === 'acreditacion' || s === 'fecha_acreditacion') return 'acreditacion';
    if (s === 'compromiso' || s === 'fecha_compromiso_pago') return 'compromiso';
    if (
        s === 'acreditacion_compromiso' ||
        s === 'acreditacion-o-compromiso' ||
        s === 'acreditacion_compromiso_pago'
    ) {
        return 'acreditacion_compromiso';
    }
    return 'acreditacion_compromiso';
};

/* ---------- Helpers: Mora acumulada (cuotas) ---------- */

/**
 * Parse robusto de montos:
 * - soporta "$ 1.234,56", "1,234.56", "1234,56", "1234.56"
 * - ignora símbolos, letras, espacios
 * - usa el ÚLTIMO '.' o ',' como separador decimal
 */
const parseMoneyFlexible = (value) => {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    let s = String(value).trim();
    if (!s) return null;

    // deja solo dígitos, separadores y signo
    s = s.replace(/[^\d.,-]/g, '');
    if (!s || s === '-' || s === ',' || s === '.') return null;

    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    const decPos = Math.max(lastComma, lastDot);

    let intPart = s;
    let decPart = '';

    if (decPos >= 0) {
        intPart = s.slice(0, decPos);
        decPart = s.slice(decPos + 1);
    }

    // sacar miles del entero
    intPart = intPart.replace(/[.,]/g, '');

    // normalizar decimal
    const normalized =
        (intPart === '' ? '0' : intPart) + (decPart ? `.${decPart}` : '');

    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
};

const pickMoraDiariaMonto = (row) => {
    if (!row || typeof row !== 'object') return null;

    // 1) Candidatos exactos (por compatibilidad)
    // (aunque se llame "diaria", en backend ahora es acumulada)
    const candidates = [
        'mora_diaria_monto',
        'mora_diaria',
        'moraDiariaMonto',
        'moraDiaria',
        'mora_diaria_actual',
        'moraDiariaActual',

        // si alguno devuelve acumulada bajo otro nombre viejo
        'mora_acumulada',
        'mora_acumulada_monto',
        'moraAcumulada',
        'moraAcumuladaMonto'
    ];

    for (const k of candidates) {
        if (Object.prototype.hasOwnProperty.call(row, k)) {
            const n = parseMoneyFlexible(row[k]);
            if (n !== null) return n;
        }
    }

    // 2) Si viene anidado (ej: mora_diaria: { monto: ... })
    const nestedCandidates = ['mora_diaria', 'moraDiaria', 'mora_acumulada', 'moraAcumulada'];
    for (const k of nestedCandidates) {
        const v = row[k];
        if (v && typeof v === 'object') {
            const n1 = parseMoneyFlexible(v.monto ?? v.monto_ars ?? v.monto_pesos ?? v.valor ?? v.importe);
            if (n1 !== null) return n1;
        }
    }

    // 3) Heurística por nombre de key: “mora” + (“diaria” o “acumulada”), evitando %/pct
    const keys = Object.keys(row);
    for (const k of keys) {
        const kl = String(k).toLowerCase();
        const looksLikeMoraMoney =
            kl.includes('mora') &&
            (kl.includes('diaria') || kl.includes('acumulada')) &&
            !/(pct|porc|porcentaje|%)/.test(kl);

        if (!looksLikeMoraMoney) continue;

        const n = parseMoneyFlexible(row[k]);
        if (n !== null) return n;
    }

    return null;
};

/**
 * Hook que:
 * 1. Mantiene un estado interno de "filtros aplicados" (null = no buscado aún).
 * 2. Solo dispara la consulta cuando se aplica al menos una búsqueda.
 * 3. Oculta la tabla cuando resetear filtros deja `appliedFilters` en null.
 */
export const useInformeData = () => {
    const [appliedFilters, setAppliedFilters] = useState(null);

    const setFilters = (newFilters) => {
        setAppliedFilters(newFilters);
    };

    const resetFilters = () => {
        setAppliedFilters(null);
    };

    const apiParams = useMemo(() => {
        if (!appliedFilters) return {};

        const { desde, hasta, hoy, tipo, rangoFechaCredito, ...rest } = appliedFilters;

        const params = {
            ...rest,
            tipo,
            ...(desde ? { desde } : {}),
            ...(hasta ? { hasta } : {}),
            ...(hoy ? { hoy: true } : {}),
            ...(tipo === 'creditos'
                ? { rangoFechaCredito: normalizeRangoFechaCredito(rangoFechaCredito) }
                : {})
        };

        Object.keys(params).forEach((k) => {
            if (params[k] === '' || params[k] == null) delete params[k];
        });

        return params;
    }, [appliedFilters]);

    const { data: rawData = [], isFetching } = useQuery({
        queryKey: ['informes', apiParams],
        queryFn: () =>
            Object.keys(apiParams).length ? obtenerInforme(apiParams) : Promise.resolve([]),
        enabled: appliedFilters != null
    });

    const tipoActual = appliedFilters?.tipo || defaultFilters.tipo;

    // ✅ Normalizar data para CUOTAS: asegurar mora_diaria_monto (acumulada) como número
    const data = useMemo(() => {
        if (!Array.isArray(rawData) || rawData.length === 0) return rawData;

        if (tipoActual !== 'cuotas') return rawData;

        return rawData.map((row) => {
            const picked = pickMoraDiariaMonto(row);

            const existing = parseMoneyFlexible(row?.mora_diaria_monto);
            const finalVal = existing !== null ? existing : picked;

            return {
                ...row,
                mora_diaria_monto: finalVal ?? null
            };
        });
    }, [rawData, tipoActual]);

    // Columnas para la tabla
    const columns = useMemo(() => {
        if (!data || data.length === 0) return [];

        const tipo = tipoActual;
        const keys = Object.keys(data[0]);
        const baseKeys = keys.slice();

        // Forzar la columna normalizada en CUOTAS
        if (tipo === 'cuotas' && !baseKeys.includes('mora_diaria_monto')) {
            baseKeys.push('mora_diaria_monto');
        }

        return baseKeys.map((key) => {
            const meta = {};
            const kLower = String(key).toLowerCase();

            if (/(dni|documento|doc|cuil|cuit)/.test(kLower)) meta.format = 'raw';
            if (/(telefono|tel|celu|celular|movil|whatsapp|wp|contacto)/.test(kLower)) meta.format = 'raw';

            meta.sum = shouldSumColumn(key);

            return {
                accessorKey: key,
                header: prettyHeader(key, tipo),
                meta
            };
        });
    }, [data, tipoActual]);

    const exportExcel = () => {
        if (!data || data.length === 0) return;
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Informe');
        XLSX.writeFile(wb, 'informe.xlsx');
    };

    return {
        data,
        isFetching,
        columns,
        filters: appliedFilters || defaultFilters,
        setFilters,
        resetFilters,
        exportExcel,
        hasSearched: appliedFilters != null
    };
};
