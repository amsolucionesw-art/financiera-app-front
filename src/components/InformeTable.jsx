// src/components/InformeTable.jsx

import React, { useMemo, useState } from 'react';
import {
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable
} from '@tanstack/react-table';

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** Heurística simple para números */
const isNumberLike = (v) =>
    typeof v === 'number' ||
    (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)));

/** Heurística simple para fechas YYYY-MM-DD o ISO */
const isDateLike = (v) => {
    if (v == null || typeof v !== 'string') return false;
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
    // ISO con tiempo
    if (!Number.isNaN(Date.parse(v))) return true;
    return false;
};

/** Formateo por defecto de celdas */
const renderValuePretty = (v) => {
    if (v == null) return '';
    if (isNumberLike(v)) return nf.format(Number(v));
    if (isDateLike(v)) {
        // mostrar sólo YYYY-MM-DD
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dd}`;
        }
        // si vino ya como YYYY-MM-DD
        return v.slice(0, 10);
    }
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    return String(v);
};

const SortIndicator = ({ column }) => {
    const dir = column.getIsSorted(); // 'asc' | 'desc' | false
    return (
        <span className="ml-1 inline-block text-gray-500">
            {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '↕'}
        </span>
    );
};

const InformeTable = ({ data, columns, loading }) => {
    // Default column: cell renderer que formatea por defecto si no se provee cell custom
    const defaultColumn = useMemo(
        () => ({
            cell: (ctx) => {
                const raw = ctx.getValue();
                return renderValuePretty(raw);
            }
        }),
        []
    );

    // Estado local para orden y paginado
    const [sorting, setSorting] = useState([]);
    const [pageSize, setPageSize] = useState(25);

    const table = useReactTable({
        data,
        columns,
        defaultColumn,
        state: {
            sorting
        },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: {
            pagination: { pageIndex: 0, pageSize }
        }
    });

    // Sincronizar pageSize con el estado local y la tabla
    useMemo(() => {
        table.setPageSize(pageSize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize]);

    const headerGroups = table.getHeaderGroups();
    const rows = table.getRowModel().rows; // filas de la PÁGINA ACTUAL (sorted + paginadas)
    const allRows = table.getPrePaginationRowModel().rows; // filas después de sort, antes de paginar
    const visibleCols = table.getVisibleFlatColumns();
    const colCount = visibleCols.length;

    // Detectar cuáles columnas son numéricas (basado en dataset completo para consistencia)
    const numericColIds = useMemo(() => {
        if (!Array.isArray(data) || data.length === 0) return new Set();
        const set = new Set();
        visibleCols.forEach((col) => {
            const id = col.id;
            // buscamos primer valor no nulo
            for (let i = 0; i < data.length; i++) {
                const rowVal = data[i]?.[id];
                if (rowVal !== null && rowVal !== undefined && rowVal !== '') {
                    if (isNumberLike(rowVal)) set.add(id);
                    break;
                }
            }
        });
        return set;
    }, [data, visibleCols]);

    // Totales por columna (numéricas) de la PÁGINA ACTUAL
    const totals = useMemo(() => {
        if (!Array.isArray(rows) || rows.length === 0) return {};
        const acc = {};
        visibleCols.forEach((col) => {
            const id = col.id;
            if (!numericColIds.has(id)) return;
            let sum = 0;
            for (let i = 0; i < rows.length; i++) {
                const v = rows[i]?.original?.[id];
                if (isNumberLike(v)) sum += Number(v);
            }
            acc[id] = sum;
        });
        return acc;
    }, [rows, visibleCols, numericColIds]);

    const hasTotals = Object.keys(totals).length > 0;

    // Page helpers
    const canPrev = table.getCanPreviousPage();
    const canNext = table.getCanNextPage();
    const pageIndex = table.getState().pagination.pageIndex;
    const pageCount = table.getPageCount();
    const totalRows = allRows.length;

    return (
        <div className="overflow-hidden rounded-xl ring-1 ring-gray-200" role="region" aria-label="Resultados del informe">
            {/* Tabla */}
            <div className="overflow-auto">
                <table className="min-w-full table-auto divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-100">
                        {headerGroups.map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    const id = header.column.id;
                                    const alignClass = numericColIds.has(id) ? 'text-right' : 'text-left';
                                    const sortable = header.column.getCanSort?.() ?? true; // permitir ordenar por defecto
                                    return (
                                        <th
                                            key={header.id}
                                            scope="col"
                                            className={`sticky top-0 z-10 bg-gray-100 px-3 py-2 font-medium ${alignClass}`}
                                        >
                                            {header.isPlaceholder ? null : (
                                                <button
                                                    type="button"
                                                    className={`group inline-flex items-center ${alignClass} hover:opacity-80`}
                                                    onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                                                    title={sortable ? 'Ordenar' : ''}
                                                >
                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                    {sortable && <SortIndicator column={header.column} />}
                                                </button>
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                        ))}
                    </thead>

                    <tbody className="divide-y divide-gray-200 bg-white">
                        {loading ? (
                            <tr>
                                <td colSpan={colCount} className="px-3 py-6 text-center">
                                    Cargando…
                                </td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={colCount} className="px-3 py-6 text-center">
                                    No se encontraron registros.
                                </td>
                            </tr>
                        ) : (
                            rows.map((row) => (
                                <tr key={row.id} className="odd:bg-white even:bg-gray-50">
                                    {row.getVisibleCells().map((cell) => {
                                        const id = cell.column.id;
                                        const alignClass = numericColIds.has(id) ? 'text-right' : 'text-left';
                                        return (
                                            <td key={cell.id} className={`px-3 py-2 ${alignClass}`}>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>

                    {/* Totales (si aplica) */}
                    {rows.length > 0 && hasTotals && (
                        <tfoot className="bg-gray-50">
                            <tr>
                                {visibleCols.map((col, idx) => {
                                    const id = col.id;
                                    const isNumeric = numericColIds.has(id);
                                    const val = totals[id];
                                    return (
                                        <td
                                            key={`t-${id}`}
                                            className={`px-3 py-2 ${isNumeric ? 'text-right font-semibold' : 'text-left'} ${idx === 0 ? 'font-semibold' : ''
                                                }`}
                                        >
                                            {idx === 0 ? 'Totales (página)' : isNumeric ? nf.format(val || 0) : ''}
                                        </td>
                                    );
                                })}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {/* Paginación */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200 bg-white p-3 sm:flex-row">
                <div className="text-xs text-gray-600">
                    {totalRows > 0 ? (
                        <>
                            Página <strong>{pageIndex + 1}</strong> de <strong>{Math.max(pageCount, 1)}</strong> ·{' '}
                            <span className="hidden sm:inline">Filas totales: </span>
                            <strong>{nf.format(totalRows)}</strong>
                        </>
                    ) : (
                        <>Sin filas</>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-gray-600">
                        Filas por página:{' '}
                        <select
                            className="rounded border px-2 py-1 text-xs"
                            value={pageSize}
                            onChange={(e) => {
                                const v = e.target.value === 'all' ? (Array.isArray(data) ? data.length || 1 : 10000) : Number(e.target.value);
                                setPageSize(v);
                                table.setPageIndex(0);
                            }}
                        >
                            {[10, 25, 50, 100].map((n) => (
                                <option key={n} value={n}>
                                    {n}
                                </option>
                            ))}
                            <option value="all">Todos</option>
                        </select>
                    </label>

                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                            onClick={() => table.setPageIndex(0)}
                            disabled={!canPrev}
                            title="Primera página"
                        >
                            ⏮
                        </button>
                        <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                            onClick={() => table.previousPage()}
                            disabled={!canPrev}
                            title="Anterior"
                        >
                            ◀
                        </button>
                        <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                            onClick={() => table.nextPage()}
                            disabled={!canNext}
                            title="Siguiente"
                        >
                            ▶
                        </button>
                        <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                            onClick={() => table.setPageIndex(pageCount - 1)}
                            disabled={!canNext}
                            title="Última página"
                        >
                            ⏭
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InformeTable;
