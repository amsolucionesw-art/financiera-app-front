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
    // Valores reales (modelo Credito):
    //  - solicitud (fecha_solicitud)
    //  - acreditacion (fecha_acreditacion)
    //  - compromiso (fecha_compromiso_pago)
    //  - acreditacion_compromiso (OR entre acreditacion y compromiso)
    rangoFechaCredito: 'acreditacion_compromiso'
};

/* ---------- Helpers para columnas ---------- */

/**
 * Genera una etiqueta legible a partir de la key del backend.
 * Aplica mapeos específicos para campos frecuentes y, si no hay,
 * hace un "Title Case" de snake_case / camelCase.
 */
const prettyHeader = (key, tipo) => {
    if (!key) return '';

    const k = String(key).toLowerCase();

    // Mapeos específicos por nombre de campo
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

    // Algunas heurísticas por tipo de informe si queremos refinar
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

    // Genérico: transformar snake_case / camelCase en "Title Case"
    const cleaned = key
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase();

    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Decide si una columna debería marcarse como sumable (meta.sum)
 * para ayudar a InformeTable a decidir qué totales mostrar.
 */
const shouldSumColumn = (key) => {
    if (!key) return false;
    const k = String(key).toLowerCase();

    // Exclusiones claras: NO sumar nunca estos campos
    if (/(dni|documento|doc|cuil|cuit)/.test(k)) return false;
    if (/(telefono|tel|celu|celular|movil|whatsapp|wp|contacto)/.test(k)) return false;
    if (/(^id$|_id$|id_)/.test(k)) return false;
    if (/(nro|numero|num)/.test(k)) return false;

    // Inclusiones típicas de montos/cantidades en tu dominio
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
    if (s === 'acreditacion_compromiso' || s === 'acreditacion-o-compromiso' || s === 'acreditacion_compromiso_pago') {
        return 'acreditacion_compromiso';
    }
    // si viene un valor viejo tipo "otorgamiento/actualizacion" u otro: fallback seguro
    return 'acreditacion_compromiso';
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

    // Construcción de params para la API (alineado al backend)
    // - usa query.desde / query.hasta
    // - soporta rangoFechaCredito (solo créditos)
    const apiParams = useMemo(() => {
        if (!appliedFilters) return {};

        const {
            desde,
            hasta,
            hoy,
            tipo,
            rangoFechaCredito,
            ...rest
        } = appliedFilters;

        const params = {
            ...rest,
            tipo,
            ...(desde ? { desde } : {}),
            ...(hasta ? { hasta } : {}),
            ...(hoy ? { hoy: true } : {}),

            // ✅ Solo créditos: qué campo(s) usar para el rango (normalizado)
            ...(tipo === 'creditos'
                ? { rangoFechaCredito: normalizeRangoFechaCredito(rangoFechaCredito) }
                : {})
        };

        // Eliminar claves vacías
        Object.keys(params).forEach((k) => {
            if (params[k] === '' || params[k] == null) delete params[k];
        });

        return params;
    }, [appliedFilters]);

    // React Query: solo activo si hay filtros aplicados
    const { data: rawData = [], isFetching } = useQuery({
        queryKey: ['informes', apiParams],
        queryFn: () =>
            Object.keys(apiParams).length
                ? obtenerInforme(apiParams)
                : Promise.resolve([]),
        enabled: appliedFilters != null
    });

    // Columnas para la tabla
    const columns = useMemo(() => {
        if (rawData.length === 0) return [];

        const tipo = appliedFilters?.tipo || defaultFilters.tipo;
        const keys = Object.keys(rawData[0]);

        return keys.map((key) => {
            const meta = {};
            const kLower = String(key).toLowerCase();

            // Definir formato "raw" para DNI / teléfonos
            if (/(dni|documento|doc|cuil|cuit)/.test(kLower)) {
                meta.format = 'raw';
            }
            if (/(telefono|tel|celu|celular|movil|whatsapp|wp|contacto)/.test(kLower)) {
                meta.format = 'raw';
            }

            meta.sum = shouldSumColumn(key);

            return {
                accessorKey: key,
                header: prettyHeader(key, tipo),
                meta
            };
        });
    }, [rawData, appliedFilters]);

    // Exportar a Excel (modo cliente; hoy no se usa, pero lo dejamos disponible)
    const exportExcel = () => {
        if (rawData.length === 0) return;
        const ws = XLSX.utils.json_to_sheet(rawData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Informe');
        XLSX.writeFile(wb, 'informe.xlsx');
    };

    return {
        data: rawData,
        isFetching,
        columns,
        filters: appliedFilters || defaultFilters,
        setFilters,
        resetFilters,
        exportExcel,
        hasSearched: appliedFilters != null
    };
};
