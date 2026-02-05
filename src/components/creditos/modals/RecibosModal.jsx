// src/components/creditos/modals/RecibosModal.jsx
import React from "react";
import { Link } from "react-router-dom";
import { money } from "../../../utils/creditos/creditosHelpers.js";

export default function RecibosModal({
    open,
    creditoId,
    items = [],
    loading = false,
    error = null,
    onClose
}) {
    if (!open) return null;

    return (
        <section className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="relative w-full max-w-3xl rounded-xl bg-white shadow p-6">
                <header className="mb-4 flex items-center justify-between border-b pb-2">
                    <h4 className="text-lg font-semibold">
                        Recibos del crédito #{creditoId ?? "—"}
                    </h4>
                    <button
                        onClick={onClose}
                        className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                    >
                        Cerrar
                    </button>
                </header>

                {loading ? (
                    <p className="text-sm text-gray-600">Cargando...</p>
                ) : error ? (
                    <p className="text-sm text-red-600">{error}</p>
                ) : items.length === 0 ? (
                    <p className="text-sm text-gray-600">
                        No hay recibos para este crédito.
                    </p>
                ) : (
                    <div className="overflow-auto max-h-[60vh] rounded border">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium">
                                        # Recibo
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Fecha
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Hora
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Cuota
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Importe
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Concepto
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Medio
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Acción
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {items.map((r) => (
                                    <tr
                                        key={r.numero_recibo}
                                        className="odd:bg-white even:bg-gray-50"
                                    >
                                        <td className="px-3 py-2 font-mono">
                                            {r.numero_recibo}
                                        </td>
                                        <td className="px-3 py-2">{r.fecha}</td>
                                        <td className="px-3 py-2">{r.hora}</td>
                                        <td className="px-3 py-2">
                                            #{r.cuota?.numero_cuota ?? "—"}
                                        </td>
                                        <td className="px-3 py-2">
                                            ${money(r.monto_pagado)}
                                        </td>
                                        <td
                                            className="px-3 py-2 truncate max-w-[260px]"
                                            title={r.concepto}
                                        >
                                            {r.concepto}
                                        </td>
                                        <td className="px-3 py-2">
                                            {r.medio_pago}
                                        </td>
                                        <td className="px-3 py-2">
                                            <Link
                                                to={`/recibo/${r.numero_recibo}`}
                                                className="text-blue-600 hover:underline"
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Ver
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}