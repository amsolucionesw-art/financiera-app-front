import { ChevronDown, Phone, MapPin } from "lucide-react";
import CardCreditoCliente from "./CardCreditoCliente";
import { useState } from "react";

const CardClienteCobrador = ({ cliente, abierto, setAbierto }) => {
    const [creditoAbierto, setCreditoAbierto] = useState(null);

    const toggle = () => {
        setAbierto((prev) => (prev === cliente.id ? null : cliente.id));
    };

    return (
        <li className="rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden">
            <header
                onClick={toggle}
                className="flex justify-between items-start p-4 cursor-pointer gap-4 flex-col sm:flex-row"
            >
                <div className="space-y-1 text-sm text-gray-700">
                    <h3 className="text-lg font-semibold text-gray-800">
                        {cliente.nombre} {cliente.apellido}
                    </h3>
                    <p>DNI: {cliente.dni}</p>
                    <p className="flex items-center gap-1">
                        <Phone size={14} /> {cliente.telefono || "—"}
                    </p>
                    {cliente.telefono_secundario && (
                        <p className="flex items-center gap-1">
                            <Phone size={14} /> {cliente.telefono_secundario}
                        </p>
                    )}
                    <p className="flex items-start gap-1">
                        <MapPin size={14} className="mt-0.5" /> {cliente.direccion || "—"}
                    </p>
                    {cliente.direccion_secundaria && (
                        <p className="flex items-start gap-1">
                            <MapPin size={14} className="mt-0.5" />
                            {cliente.direccion_secundaria}
                        </p>
                    )}
                    <p>Zona: {cliente?.clienteZona?.nombre || "—"}</p>
                    <p>Créditos: {cliente.creditos?.length || 0}</p>
                </div>
                <ChevronDown
                    className={`h-5 w-5 text-gray-500 transition-transform duration-300 ${
                        abierto === cliente.id ? "rotate-180" : ""
                    }`}
                />
            </header>

            <div
                className={`grid transition-all duration-500 ease-in-out ${
                    abierto === cliente.id
                        ? "grid-rows-[1fr] opacity-100 border-t border-gray-100"
                        : "grid-rows-[0fr] opacity-0"
                } overflow-hidden`}
            >
                <div className="overflow-hidden">
                    <div className="p-4 space-y-4">
                        {cliente.creditos?.length > 0 ? (
                            cliente.creditos.map((credito, i) => (
                                <CardCreditoCliente
                                    key={credito.id}
                                    credito={credito}
                                    index={i}
                                    abierto={creditoAbierto === credito.id}
                                    toggle={() =>
                                        setCreditoAbierto((prev) =>
                                            prev === credito.id ? null : credito.id
                                        )
                                    }
                                />
                            ))
                        ) : (
                            <p className="text-gray-500">
                                Este cliente no tiene créditos registrados.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </li>
    );
};

export default CardClienteCobrador;

