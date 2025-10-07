const estadoBadge = (estado) => {
    switch (estado?.toLowerCase()) {
        case "pagada":
            return "bg-green-100 text-green-700";
        case "pendiente":
            return "bg-yellow-100 text-yellow-700";
        case "vencida":
            return "bg-red-100 text-red-700";
        default:
            return "bg-gray-100 text-gray-600";
    }
};

const ListaCuotasCredito = ({ cuotas = [] }) => {
    const cuotasOrdenadas = cuotas
        .slice()
        .sort((a, b) => a.numero_cuota - b.numero_cuota);

    return (
        <ul className="space-y-2 text-sm">
            {cuotasOrdenadas.map((cuota) => (
                <li
                    key={cuota.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-gray-700 py-2 px-3 rounded-lg bg-gray-50 border border-gray-100"
                >
                    <div className="flex items-center gap-4">
                        <span className="font-medium">#{cuota.numero_cuota}</span>
                        <span>${Number(cuota.importe_cuota).toFixed(2)}</span>
                        <span className="text-gray-500 text-xs">
                            Vence: {cuota.fecha_vencimiento}
                        </span>
                    </div>
                    <span
                        className={`text-xs px-2 py-0.5 rounded font-medium self-start sm:self-center ${estadoBadge(
                            cuota.estado
                        )}`}
                    >
                        {cuota.estado}
                    </span>
                </li>
            ))}
        </ul>
    );
};

export default ListaCuotasCredito;



