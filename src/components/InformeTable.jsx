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

/**
 * Formatea fechas sin “-1 día” por TZ.
 * Regla:
 * - Si viene como DATEONLY "YYYY-MM-DD" => devolver tal cual.
 * - Si viene como ISO y empieza con "YYYY-MM-DD" => devolver slice(0,10).
 * - Si viene como otra cosa parseable => usar Date (último recurso).
 */
const formatDateSafeYMD = (v) => {
    if (v == null) return '';
    const s = String(v);

    // ✅ DATEONLY exacto: NO convertir a Date()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // ✅ ISO típico: usar la parte de fecha (evita TZ shift)
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);

    // Último recurso: parsear y formatear
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    }

    // Fallback conservador
    return s.length >= 10 ? s.slice(0, 10) : s;
};

/** Formateo por defecto de celdas, con conocimiento de la columna */
const renderValuePretty = (v, column) => {
    if (v == null) return '';

    const colId = column?.id ? String(column.id).toLowerCase() : '';
    const meta = column?.columnDef?.meta || {};

    // 1) Si la columna está marcada explícitamente como "raw" → mostrar tal cual
    if (meta.format === 'raw') {
        return String(v ?? '');
    }

    // 2) Columnas que representan identificadores/textos “numéricos legibles”
    const isDniLikeId = /(dni|documento|doc|cuil|cuit)/.test(colId);
    const isPhoneLikeId = /(telefono|tel|celu|celular|movil|whatsapp|wp|contacto)/.test(colId);
    const isAddressLikeId = /(direccion|domicilio|calle|barrio|localidad|ciudad)/.test(colId);

    if (isDniLikeId || isPhoneLikeId || isAddressLikeId) {
        return String(v ?? '');
    }

    // 3) Fechas (✅ sin corrimiento por zona horaria)
    if (isDateLike(v)) {
        return formatDateSafeYMD(v);
    }

    // 4) Números: formatear bonito (para montos, cantidades, etc.)
    if (isNumberLike(v)) return nf.format(Number(v));

    // 5) Booleanos
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';

    // 6) Texto genérico
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

/**
 * Define si una columna debe participar en los TOTALES.
 * - Primero respeta meta.sum (true/false) si está definido.
 * - Si no está definido, aplica una heurística por nombre de columna (id).
 *   Incluye montos, totales, saldos, intereses, etc.
 *   Excluye DNI, teléfonos, IDs, números de documento, etc.
 */
const isSummableColumn = (col) => {
    const id = String(col.id || '').toLowerCase();
    const meta = col.columnDef?.meta || {};

    // Configuración explícita desde el columnDef
    if (meta.sum === true) return true;
    if (meta.sum === false) return false;

    // Exclusiones claras: no tiene sentido sumar estos campos
    if (/(dni|documento|doc|cuil|cuit)/.test(id)) return false;
    if (/(telefono|tel|celu|celular|movil|whatsapp|wp|contacto)/.test(id)) return false;
    if (/(^id$|_id$|id_cliente|id_credito|id_cuota|id_pago)/.test(id)) return false;
    if (/(nro|numero|num)/.test(id)) return false;

    // Inclusiones típicas de montos/cantidades en tu dominio
    if (/(monto|importe|total|saldo|mora|capital|interes|cuota|pagado|abonado|valor|bruto|neto|costo|precio|cantidad|cant)/.test(id)) {
        return true;
    }

    // Por defecto, no sumar (más conservador que antes)
    return false;
};

const InformeTable = ({ data, columns, loading }) => {
    // Default column: cell renderer que formatea por defecto si no se provee cell custom
    const defaultColumn = useMemo(
        () => ({
            cell: (ctx) => {
                const raw = ctx.getValue();
                return renderValuePretty(raw, ctx.column);
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

    // Conjunto de columnas que SÍ deben sumarse (intersección: numéricas + "sumables")
    const summableColIds = useMemo(() => {
        const set = new Set();
        visibleCols.forEach((col) => {
            const id = col.id;
            if (!numericColIds.has(id)) return;
            if (isSummableColumn(col)) set.add(id);
        });
        return set;
    }, [visibleCols, numericColIds]);

    // Totales por columna (solo columnas sumables) de la PÁGINA ACTUAL
    const totals = useMemo(() => {
        if (!Array.isArray(rows) || rows.length === 0) return {};
        const acc = {};
        visibleCols.forEach((col) => {
            const id = col.id;
            if (!summableColIds.has(id)) return;
            let sum = 0;
            for (let i = 0; i < rows.length; i++) {
                const v = rows[i]?.original?.[id];
                if (isNumberLike(v)) sum += Number(v);
            }
            acc[id] = sum;
        });
        return acc;
    }, [rows, visibleCols, summableColIds]);

    const hasTotals = Object.keys(totals).length > 0;

    // Page helpers
    const canPrev = table.getCanPreviousPage();
    const canNext = table.getCanNextPage();
    const pageIndex = table.getState().pagination.pageIndex;
    const pageCount = table.getPageCount();
    const totalRows = allRows.length;

    return (
        <div
            className="rounded-xl ring-1 ring-gray-200"
            role="region"
            aria-label="Resultados del informe"
        >
            {/* Tabla con scroll interno y header sticky */}
            <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full table-auto divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-100">
                        {headerGroups.map((headerGroup) => (
                            <tr key={headerGroup.id} className="bg-gray-100">
                                {headerGroup.headers.map((header) => {
                                    const id = header.column.id;
                                    const alignClass = numericColIds.has(id)
                                        ? 'text-right'
                                        : 'text-left';
                                    const sortable =
                                        header.column.getCanSort?.() ?? true; // permitir ordenar por defecto
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
                                                    onClick={
                                                        sortable
                                                            ? header.column.getToggleSortingHandler()
                                                            : undefined
                                                    }
                                                    title={sortable ? 'Ordenar' : ''}
                                                >
                                                    {flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                                    {sortable && (
                                                        <SortIndicator column={header.column} />
                                                    )}
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
                                        const alignClass = numericColIds.has(id)
                                            ? 'text-right'
                                            : 'text-left';
                                        return (
                                            <td key={cell.id} className={`px-3 py-2 ${alignClass}`}>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
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
                                    const isSummable = summableColIds.has(id);
                                    const val = totals[id];

                                    return (
                                        <td
                                            key={`t-${id}`}
                                            className={`px-3 py-2 ${
                                                isNumeric && isSummable
                                                    ? 'text-right font-semibold'
                                                    : 'text-left'
                                            } ${idx === 0 ? 'font-semibold' : ''}`}
                                        >
                                            {idx === 0
                                                ? 'Totales (página)'
                                                : isNumeric && isSummable
                                                ? nf.format(val || 0)
                                                : ''}
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
                            Página <strong>{pageIndex + 1}</strong> de{' '}
                            <strong>{Math.max(pageCount, 1)}</strong> ·{' '}
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
                                const v =
                                    e.target.value === 'all'
                                        ? (Array.isArray(data) ? data.length || 1 : 10000)
                                        : Number(e.target.value);
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