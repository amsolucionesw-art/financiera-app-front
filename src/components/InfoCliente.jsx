import { useState } from "react";
import {
    User,
    CreditCard,
    Phone,
    Mail,
    MapPin,
    BadgeDollarSign,
    StickyNote,
    LocateIcon,
    Image as ImageIcon,
    ShieldCheck,
    Star
} from "lucide-react";
import ImagenModal from "./ImagenModal";

const InfoCliente = ({ cliente }) => {
    const [modalAbierto, setModalAbierto] = useState(false);
    if (!cliente) return null;

    const dato = (valor) => (valor ? valor : "—");

    // 🟢 Calcular categoría visual del puntaje
    const obtenerCategoriaPuntaje = (puntaje) => {
        if (puntaje > 70) return { texto: "Apto", color: "bg-green-100 text-green-700" };
        if (puntaje >= 40) return { texto: "Riesgo Medio", color: "bg-yellow-100 text-yellow-700" };
        return { texto: "Riesgoso", color: "bg-red-100 text-red-700" };
    };

    const categoria = obtenerCategoriaPuntaje(cliente.puntaje_crediticio);

    return (
        <section className="rounded-xl bg-white p-6 shadow ring-1 ring-gray-200">
            <header className="mb-6 flex items-center gap-2 border-b border-gray-100 pb-2">
                <User className="text-green-600" size={20} />
                <h2 className="text-lg font-semibold tracking-tight">Datos del Cliente</h2>
            </header>

            <ul className="grid gap-y-4 gap-x-6 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <li className="flex items-center gap-2 order-1">
                    <User size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Nombre:</span>
                    <span className="truncate text-gray-800">{dato(`${cliente.nombre} ${cliente.apellido}`)}</span>
                </li>

                <li className="flex items-center gap-2 order-2">
                    <CreditCard size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">DNI:</span>
                    <span className="text-gray-800">{dato(cliente.dni)}</span>
                </li>

                <li className="flex items-center gap-2 order-3">
                    <ShieldCheck size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Historial:</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold
                    ${cliente.historial_crediticio === "Aprobado"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                        {dato(cliente.historial_crediticio)}
                    </span>
                </li>

                {/* Puntaje crediticio */}
                <li className="flex items-center gap-2 order-3">
                    <Star size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Puntaje:</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${categoria.color}`}>
                        {cliente.puntaje_crediticio} — {categoria.texto}
                    </span>
                </li>

                <li className="flex items-center gap-2 order-4">
                    <Phone size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Teléfono:</span>
                    <span className="text-gray-800">{dato(cliente.telefono)}</span>
                </li>

                <li className="flex items-center gap-2 order-5">
                    <Phone size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Tel. secundario:</span>
                    <span className="text-gray-800">{dato(cliente.telefono_secundario)}</span>
                </li>

                <li className="flex items-center gap-2 order-6">
                    <Mail size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Email:</span>
                    <span className="truncate text-gray-800">{dato(cliente.email)}</span>
                </li>

                <li className="flex items-start gap-2 order-7">
                    <MapPin size={16} className="text-gray-500 mt-0.5" />
                    <div>
                        <span className="font-medium text-gray-600 block">Dirección:</span>
                        <span className="text-gray-800 block">{dato(cliente.direccion)}</span>
                        <span className="text-xs text-gray-500">{dato(cliente.referencia_direccion)}</span>
                    </div>
                </li>

                <li className="flex items-start gap-2 order-8">
                    <MapPin size={16} className="text-gray-500 mt-0.5" />
                    <div>
                        <span className="font-medium text-gray-600 block">Dirección 2:</span>
                        <span className="text-gray-800 block">{dato(cliente.direccion_secundaria)}</span>
                        <span className="text-xs text-gray-500">{dato(cliente.referencia_secundaria)}</span>
                    </div>
                </li>

                <li className="flex items-center gap-2 order-9">
                    <LocateIcon size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Zona:</span>
                    <span className="text-gray-800">{dato(cliente.clienteZona?.nombre)}</span>
                </li>

                <li className="flex items-center gap-2 order-10">
                    <BadgeDollarSign size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Cobrador:</span>
                    <span className="truncate text-gray-800">{dato(cliente.cobradorUsuario?.nombre_completo)}</span>
                </li>

                {cliente.dni_foto && (
                    <li className="flex items-center gap-2 justify-start order-11">
                        <ImageIcon size={16} className="text-gray-500" />
                        <span className="font-medium text-gray-600">DNI:</span>
                        <button
                            onClick={() => setModalAbierto(true)}
                            className="ml-2 rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                        >
                            Ver foto
                        </button>
                    </li>
                )}

                <li className="flex items-start gap-2 sm:col-span-2 lg:col-span-3 order-12">
                    <StickyNote size={16} className="text-gray-500 mt-0.5" />
                    <div>
                        <span className="font-medium text-gray-600 block">Observaciones:</span>
                        <span className="text-gray-800 whitespace-pre-line">{dato(cliente.observaciones)}</span>
                    </div>
                </li>
            </ul>

            <ImagenModal
                url={cliente.dni_foto}
                visible={modalAbierto}
                onClose={() => setModalAbierto(false)}
            />
        </section>
    );
};

export default InfoCliente;


