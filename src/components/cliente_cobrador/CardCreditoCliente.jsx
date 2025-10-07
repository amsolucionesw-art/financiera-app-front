import {
    BadgeDollarSign,
    CheckCircle2,
    Clock,
    ListOrdered,
    XCircle,
    CalendarDays,
    Percent,
    ChevronDown,
} from "lucide-react";
import ListaCuotasCredito from "./ListaCuotasCredito";

const estadoClasses = (estado) => {
    switch (estado?.toLowerCase()) {
        case "pagado":
            return "bg-green-100 text-green-700";
        case "pendiente":
            return "bg-yellow-100 text-yellow-700";
        case "vencido":
            return "bg-red-100 text-red-700";
        default:
            return "bg-gray-100 text-gray-600";
    }
};

const CardCreditoCliente = ({ credito, index, abierto, toggle }) => {
    const tieneDescuento = Number(credito.descuento) > 0;
    const totalSinDescuento = tieneDescuento
        ? Number(credito.monto_total_devolver) + Number(credito.descuento)
        : Number(credito.monto_total_devolver);

    return (
        <article className="rounded-xl border bg-white shadow-sm">
            <header
                onClick={toggle}
                className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50"
            >
                <h4 className="font-semibold text-gray-800 text-base flex items-center gap-2">
                    <BadgeDollarSign size={18} className="text-green-600" />
                    Crédito #{index + 1}
                </h4>
                <ChevronDown
                    className={`h-5 w-5 text-gray-500 transition-transform duration-300 ${
                        abierto ? "rotate-180" : ""
                    }`}
                />
            </header>

            <div
                className={`grid transition-all duration-500 ease-in-out ${
                    abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                } overflow-hidden border-t border-gray-100`}
            >
                <div className="overflow-hidden">
                    <div className="p-4 space-y-4 text-sm text-gray-700">
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <p>
                                <CheckCircle2 size={14} className="inline mr-1 text-gray-500" />
                                <strong>Monto acreditado:</strong>{" "}
                                ${Number(credito.monto_acreditar).toLocaleString()}
                            </p>
                            <p>
                                <Clock size={14} className="inline mr-1 text-gray-500" />
                                <strong>Cuotas:</strong> {credito.cantidad_cuotas}
                            </p>
                            <p>
                                <ListOrdered size={14} className="inline mr-1 text-gray-500" />
                                <strong>Tipo:</strong> {credito.tipo_credito}
                            </p>
                            <p>
                                <XCircle size={14} className="inline mr-1 text-gray-500" />
                                <strong>Total a devolver:</strong>{" "}
                                {tieneDescuento ? (
                                    <>
                                        <span className="line-through text-gray-400 mr-1">
                                            ${totalSinDescuento.toLocaleString()}
                                        </span>
                                        <span className="text-green-700 font-semibold">
                                            ${Number(credito.monto_total_devolver).toLocaleString()}
                                        </span>
                                    </>
                                ) : (
                                    <>${Number(credito.monto_total_devolver).toLocaleString()}</>
                                )}
                            </p>
                            <p>
                                <CalendarDays size={14} className="inline mr-1 text-gray-500" />
                                <strong>Entregado:</strong> {credito.fecha_entrega}
                            </p>
                            {tieneDescuento && (
                                <p>
                                    <Percent size={14} className="inline mr-1 text-green-600" />
                                    <strong>Descuento:</strong>{" "}
                                    ${Number(credito.descuento).toLocaleString()}
                                </p>
                            )}
                            <p>
                                <strong>Estado:</strong>{" "}
                                <span
                                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${estadoClasses(
                                        credito.estado
                                    )}`}
                                >
                                    {credito.estado}
                                </span>
                            </p>
                        </div>

                        {credito.cuotas?.length > 0 && (
                            <div className="pt-2 border-t border-gray-100">
                                <h5 className="font-medium mb-2 text-sm text-gray-800">Cuotas:</h5>
                                <ListaCuotasCredito cuotas={credito.cuotas} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
};

export default CardCreditoCliente;

