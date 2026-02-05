// src/components/creditos/CreditosFiltros.jsx
import React from "react";
import { Filter, RefreshCw } from "lucide-react";

import { ESTADOS, MODALIDADES, TIPOS } from "../../utils/creditos/creditosHelpers.js";

const CreditosFiltros = ({ filtros, setFiltros, aplicando, onAplicar, onLimpiar }) => {
    return (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-gray-700">
                <Filter size={16} />
                <span className="font-semibold">Filtros de historial</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <label className="text-sm">
                    <span className="block text-gray-600 mb-1">Estado</span>
                    <select
                        className="w-full rounded-md border px-3 py-2 bg-white"
                        value={filtros.estado}
                        onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}
                    >
                        <option value="">(Todos)</option>
                        {ESTADOS.map((x) => (
                            <option key={x} value={x}>
                                {x}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="text-sm">
                    <span className="block text-gray-600 mb-1">Modalidad</span>
                    <select
                        className="w-full rounded-md border px-3 py-2 bg-white"
                        value={filtros.modalidad}
                        onChange={(e) => setFiltros((f) => ({ ...f, modalidad: e.target.value }))}
                    >
                        <option value="">(Todas)</option>
                        {MODALIDADES.map((x) => (
                            <option key={x} value={x}>
                                {x}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="text-sm">
                    <span className="block text-gray-600 mb-1">Tipo</span>
                    <select
                        className="w-full rounded-md border px-3 py-2 bg-white"
                        value={filtros.tipo}
                        onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}
                    >
                        <option value="">(Todos)</option>
                        {TIPOS.map((x) => (
                            <option key={x} value={x}>
                                {x}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="text-sm">
                    <span className="block text-gray-600 mb-1">Desde</span>
                    <input
                        type="date"
                        className="w-full rounded-md border px-3 py-2"
                        value={filtros.desde}
                        onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))}
                    />
                </label>

                <label className="text-sm">
                    <span className="block text-gray-600 mb-1">Hasta</span>
                    <input
                        type="date"
                        className="w-full rounded-md border px-3 py-2"
                        value={filtros.hasta}
                        onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
                    />
                </label>

                <label className="text-sm flex items-end">
                    <div className="flex items-center gap-2">
                        <input
                            id="soloVencidas"
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300"
                            checked={Boolean(filtros.soloVencidas)}
                            onChange={(e) =>
                                setFiltros((f) => ({
                                    ...f,
                                    soloVencidas: e.target.checked
                                }))
                            }
                        />
                        <span className="text-gray-700">Solo con cuotas vencidas</span>
                    </div>
                </label>
            </div>

            <div className="mt-3 flex items-center gap-2">
                <button
                    className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    onClick={onAplicar}
                    disabled={aplicando}
                    title="Aplicar filtros"
                >
                    {aplicando ? "Aplicando…" : "Aplicar"}
                </button>

                <button
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                    onClick={onLimpiar}
                    disabled={aplicando}
                    title="Limpiar filtros"
                >
                    <RefreshCw size={14} /> Limpiar
                </button>
            </div>
        </section>
    );
};

export default CreditosFiltros;
