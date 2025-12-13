// src/components/cliente_cobrador/ListaCuotasCredito.jsx

const estadoBadge = (estado) => {
    switch (estado?.toLowerCase()) {
        case "pagada":
            return "bg-green-100 text-green-700";
        case "parcial":
            return "bg-blue-100 text-blue-700";
        case "pendiente":
            return "bg-yellow-100 text-yellow-700";
        case "vencida":
        case "vencido":
            return "bg-red-100 text-red-700";
        default:
            return "bg-gray-100 text-gray-600";
    }
};

const fmtARS = (n) =>
    Number(n || 0).toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const ListaCuotasCredito = ({ cuotas = [] }) => {
    const cuotasOrdenadas = cuotas
        .slice()
        .sort((a, b) => (toNum(a.numero_cuota) || 0) - (toNum(b.numero_cuota) || 0));

    return (
        <ul className="space-y-2 text-sm">
            {cuotasOrdenadas.map((cuota) => {
                const importe = toNum(cuota.importe_cuota);
                const descuento = toNum(cuota.descuento_cuota);
                const pagadoAcum = toNum(cuota.monto_pagado_acumulado);

                // ✅ Mora pendiente (backend)
                const moraPendiente = toNum(cuota.intereses_vencidos_acumulados);

                // ✅ Capital pendiente (cuota “base” pendiente)
                const capitalPendiente = Math.max(importe - descuento - pagadoAcum, 0);

                // ✅ Total a cobrar hoy = cuota + mora
                const totalCobrarHoy = Math.max(capitalPendiente + moraPendiente, 0);

                const mostrarMora = moraPendiente > 0;

                return (
                    <li
                        key={cuota.id}
                        className="flex flex-col gap-2 text-gray-700 py-3 px-3 rounded-lg bg-gray-50 border border-gray-100"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                <span className="font-medium">#{cuota.numero_cuota}</span>

                                <span className="text-gray-500 text-xs">
                                    Vence: {cuota.fecha_vencimiento || "—"}
                                </span>

                                <span
                                    className={`text-xs px-2 py-0.5 rounded font-medium ${estadoBadge(
                                        cuota.estado
                                    )}`}
                                >
                                    {cuota.estado || "—"}
                                </span>
                            </div>

                            <div className="text-right">
                                <div className="text-xs text-gray-500">Total a cobrar hoy</div>
                                <div className="font-semibold text-gray-800">
                                    {fmtARS(totalCobrarHoy)}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="rounded-md bg-white border border-gray-100 px-3 py-2">
                                <div className="text-xs text-gray-500">Capital pendiente</div>
                                <div className="font-medium">{fmtARS(capitalPendiente)}</div>
                                {(descuento > 0 || pagadoAcum > 0) && (
                                    <div className="text-[11px] text-gray-500 mt-1">
                                        {descuento > 0 ? `Desc.: ${fmtARS(descuento)}` : null}
                                        {descuento > 0 && pagadoAcum > 0 ? " · " : null}
                                        {pagadoAcum > 0 ? `Pagado: ${fmtARS(pagadoAcum)}` : null}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-md bg-white border border-gray-100 px-3 py-2">
                                <div className="text-xs text-gray-500">Mora pendiente</div>
                                <div className={`font-medium ${mostrarMora ? "text-red-700" : ""}`}>
                                    {fmtARS(moraPendiente)}
                                </div>
                                <div className="text-[11px] text-gray-500 mt-1">
                                    Campo: intereses_vencidos_acumulados
                                </div>
                            </div>

                            <div className="rounded-md bg-white border border-gray-100 px-3 py-2">
                                <div className="text-xs text-gray-500">Cuota a cobrar</div>
                                <div className="font-semibold text-gray-800">{fmtARS(totalCobrarHoy)}</div>
                                <div className="text-[11px] text-gray-500 mt-1">
                                    (capital + mora)
                                </div>
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
};

export default ListaCuotasCredito;


