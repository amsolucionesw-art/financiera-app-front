// src/pages/Informes.jsx

import { useMemo, useCallback } from 'react';
import { Download } from 'lucide-react';
import { useInformeData } from '../hooks/useInformeData';
import InformeFilters from '../components/InformeFilters';
import InformeTable from '../components/InformeTable';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const Informes = () => {
    const {
        data,
        isFetching,
        columns,
        filters,
        setFilters,
        resetFilters,
        // exportExcel, // ← dejamos de usar el export del hook (cliente) para priorizar el backend
        hasSearched,
    } = useInformeData();

    const hasResults = Array.isArray(data) && data.length > 0;

    /** 
     * Construye los params para exportar XLSX desde el backend de la MISMA forma
     * en que el hook arma los params para la consulta (clave para no “mismatch”):
     * - Si hay {desde,hasta} → enviamos `fechaVencimiento=YYYY-MM-DD,YYYY-MM-DD`
     * - Si hoy === true → enviamos hoy=true
     * - Quitamos claves vacías
     */
    const exportParams = useMemo(() => {
        const f = filters || {};
        const {
            desde,
            hasta,
            hoy,
            ...rest
        } = f;

        const params = {
            ...rest,
            // Igual que en el hook: si hay rango lo mapeamos a "fechaVencimiento"
            ...(desde || hasta
                ? { fechaVencimiento: `${desde || ''},${hasta || ''}` }
                : {}),
            ...(hoy ? { hoy: true } : {}),
            format: 'xlsx',
            title: 'Informe'
        };

        // Limpiar vacíos
        Object.keys(params).forEach((k) => {
            if (params[k] === '' || params[k] == null) delete params[k];
        });

        return params;
    }, [filters]);

    /**
     * Descarga Excel desde el backend abriendo una nueva pestaña con la query.
     * Respeta todos los filtros actuales (los mismos que usa el hook para consultar).
     */
    const onExportBackend = useCallback(() => {
        if (!hasResults) return;
        const qs = new URLSearchParams();
        Object.entries(exportParams).forEach(([k, v]) => {
            // booleanos/arrays seguros
            if (Array.isArray(v)) {
                v.forEach((item) => qs.append(k, item));
            } else if (typeof v === 'boolean') {
                qs.set(k, v ? 'true' : 'false');
            } else {
                qs.set(k, String(v));
            }
        });
        // Endpoint único: /informes
        const url = `${API_URL}/informes?${qs.toString()}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    }, [exportParams, hasResults]);

    return (
        <section className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-xl font-semibold sm:text-2xl">Informes</h1>

                {/* Acciones superiores en desktop; bajan en mobile */}
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={onExportBackend}
                        disabled={!hasResults || isFetching}
                        className="inline-flex items-center gap-2 rounded-md border border-green-600/80 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 shadow-sm hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Exportar a Excel"
                        title="Exportar a Excel"
                    >
                        <Download size={16} />
                        <span className="hidden sm:inline">Exportar a Excel</span>
                        <span className="sm:hidden">Exportar</span>
                    </button>

                    {isFetching && (
                        <span className="text-xs text-gray-500">Cargando…</span>
                    )}
                </div>
            </header>

            {/* Filtros */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
                <InformeFilters
                    filters={filters}
                    onApply={setFilters}
                    onReset={resetFilters}
                />
            </div>

            {/* Estado vacío / tabla */}
            <div className="min-h-[120px]">
                {/* Solo mostrar mensaje o tabla si ya se pulsó "Buscar" */}
                {hasSearched && !isFetching && !hasResults && (
                    <p className="py-8 text-center text-sm text-gray-500">
                        No se encontraron registros para estos filtros.
                    </p>
                )}

                {hasSearched && hasResults && (
                    <div className="rounded-lg border border-gray-200 bg-white p-2 sm:p-3">
                        <InformeTable
                            data={data}
                            columns={columns}
                            loading={isFetching}
                        />
                    </div>
                )}
            </div>
        </section>
    );
};

export default Informes;