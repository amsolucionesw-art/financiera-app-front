// src/pages/Informes.jsx

import { useMemo, useCallback } from 'react';
import { Download } from 'lucide-react';
import { useInformeData } from '../hooks/useInformeData';
import InformeFilters from '../components/InformeFilters';
import InformeTable from '../components/InformeTable';

/**
 * Construye base de API de forma robusta:
 * - Si VITE_API_URL ya termina con VITE_API_PREFIX, NO duplica.
 * - Si VITE_API_URL no incluye el prefijo, lo agrega.
 * - Evita /api/api y evita pegarle a /informes sin /api cuando corresponde.
 */
const RAW_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const PREFIX = (import.meta.env.VITE_API_PREFIX || '/api').replace(/\/+$/, '');
const API_BASE = PREFIX && !RAW_BASE.endsWith(PREFIX) ? `${RAW_BASE}${PREFIX}` : RAW_BASE;

const Informes = () => {
    const {
        data,
        isFetching,
        columns,
        filters,
        setFilters,
        resetFilters,
        hasSearched,
    } = useInformeData();

    const hasResults = Array.isArray(data) && data.length > 0;

    /**
     * Params para export backend:
     * - manda desde/hasta (backend los usa así)
     * - manda hoy=true si corresponde
     * - manda rangoFechaCredito SOLO si tipo=creditos
     * - limpia vacíos
     */
    const exportParams = useMemo(() => {
        const f = filters || {};
        const {
            tipo,
            desde,
            hasta,
            hoy,
            rangoFechaCredito,
            ...rest
        } = f;

        const params = {
            ...rest,
            tipo,
            ...(desde ? { desde } : {}),
            ...(hasta ? { hasta } : {}),
            ...(hoy ? { hoy: true } : {}),
            ...(tipo === 'creditos' && rangoFechaCredito ? { rangoFechaCredito } : {}),
            format: 'xlsx',
            title: 'Informe',
        };

        Object.keys(params).forEach((k) => {
            if (params[k] === '' || params[k] == null) delete params[k];
        });

        return params;
    }, [filters]);

    /**
     * Descarga Excel desde el backend abriendo una nueva pestaña con la query.
     */
    const onExportBackend = useCallback(() => {
        if (!hasResults) return;

        const qs = new URLSearchParams();
        Object.entries(exportParams).forEach(([k, v]) => {
            if (Array.isArray(v)) {
                v.forEach((item) => qs.append(k, item));
            } else if (typeof v === 'boolean') {
                qs.set(k, v ? 'true' : 'false');
            } else {
                qs.set(k, String(v));
            }
        });

        const url = `${API_BASE}/informes?${qs.toString()}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    }, [exportParams, hasResults]);

    return (
        <section className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-xl font-semibold sm:text-2xl">Informes</h1>

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

            <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
                <InformeFilters
                    filters={filters}
                    onApply={setFilters}
                    onReset={resetFilters}
                />
            </div>

            <div className="min-h-[120px]">
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