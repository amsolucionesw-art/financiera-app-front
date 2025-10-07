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
    estadoCuota: '',
    desde: '',
    hasta: '',
    formaPagoId: '',
    hoy: false
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

    // Construcción de params para la API
    const apiParams = useMemo(() => {
        if (!appliedFilters) return {};
        const { desde, hasta, hoy, ...rest } = appliedFilters;
        const params = {
            ...rest,
            ...(desde || hasta
                ? { fechaVencimiento: `${desde || ''},${hasta || ''}` }
                : {}),
            ...(hoy ? { hoy: true } : {})
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
        return Object.keys(rawData[0]).map((key) => ({
            accessorKey: key,
            header: key
        }));
    }, [rawData]);

    // Exportar a Excel
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
