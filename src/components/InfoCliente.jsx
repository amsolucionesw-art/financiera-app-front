// src/components/InfoCliente.jsx
import { useMemo } from "react";
import {
    User,
    CreditCard,
    Phone,
    Mail,
    MapPin,
    BadgeDollarSign,
    StickyNote,
    LocateIcon,
    ShieldCheck,
    Star
} from "lucide-react";

const InfoCliente = ({ cliente }) => {
    if (!cliente) return null;

    // Helper para mostrar dato textual
    const dato = (valor) => (valor !== undefined && valor !== null && `${valor}`.trim() !== "" ? valor : "—");

    // 🟢 Puntaje crediticio (seguro ante null/undefined/NaN)
    const { puntajeTexto, puntajeColor, puntajeValor } = useMemo(() => {
        const raw = Number(cliente.puntaje_crediticio);
        if (!Number.isFinite(raw)) {
            return { puntajeTexto: "Sin puntaje", puntajeColor: "bg-gray-100 text-gray-600", puntajeValor: "—" };
        }
        if (raw > 70) return { puntajeTexto: "Apto", puntajeColor: "bg-green-100 text-green-700", puntajeValor: raw };
        if (raw >= 40) return { puntajeTexto: "Riesgo Medio", puntajeColor: "bg-yellow-100 text-yellow-700", puntajeValor: raw };
        return { puntajeTexto: "Riesgoso", puntajeColor: "bg-red-100 text-red-700", puntajeValor: raw };
    }, [cliente.puntaje_crediticio]);

    // 🟢 Historial (case-insensitive)
    const historialBadge = useMemo(() => {
        const h = (cliente.historial_crediticio || "").toString().toLowerCase();
        const aprobado = h === "aprobado" || h === "bueno" || h === "apto";
        return {
            texto: dato(cliente.historial_crediticio),
            clase: aprobado ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        };
    }, [cliente.historial_crediticio]);

    // 🟢 Teléfonos (soporta distintos nombres de campos sin romper layout)
    const telPrimario =
        cliente.telefono ??
        cliente.telefono_1 ??
        cliente.telefono_principal ??
        null;

    const telSecundario =
        cliente.telefono_secundario ??
        cliente.telefono_2 ??
        null;

    // 🟢 Direcciones (principal + secundaria + referencias)
    const dirPrincipal = cliente.direccion ?? cliente.direccion_1 ?? null;
    const refPrincipal = cliente.referencia_direccion ?? cliente.referencia_direccion_1 ?? null;

    const dirSecundaria = cliente.direccion_secundaria ?? cliente.direccion_2 ?? null;
    const refSecundaria = cliente.referencia_secundaria ?? cliente.referencia_direccion_2 ?? null;

    // 🟢 Zona y cobrador (nombres posibles según tus modelos)
    const zonaNombre = cliente.clienteZona?.nombre ?? cliente.zona?.nombre ?? cliente.zona_nombre ?? null;
    const cobradorNombre =
        cliente.cobradorUsuario?.nombre_completo ??
        cliente.cobrador?.nombre_completo ??
        cliente.cobrador_nombre ??
        null;

    return (
        <section className="rounded-xl bg-white p-6 shadow ring-1 ring-gray-200">
            <header className="mb-6 flex items-center gap-2 border-b border-gray-100 pb-2">
                <User className="text-green-600" size={20} />
                <h2 className="text-lg font-semibold tracking-tight">Datos del Cliente</h2>
            </header>

            <ul className="grid gap-y-4 gap-x-6 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <li className="order-1 flex items-center gap-2">
                    <User size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Nombre:</span>
                    <span className="truncate text-gray-800">
                        {dato([cliente.nombre, cliente.apellido].filter(Boolean).join(" "))}
                    </span>
                </li>

                <li className="order-2 flex items-center gap-2">
                    <CreditCard size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">DNI:</span>
                    <span className="text-gray-800">{dato(cliente.dni)}</span>
                </li>

                <li className="order-3 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Historial:</span>
                    <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${historialBadge.clase}`}
                    >
                        {historialBadge.texto}
                    </span>
                </li>

                {/* Puntaje crediticio */}
                <li className="order-3 flex items-center gap-2">
                    <Star size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Puntaje:</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${puntajeColor}`}>
                        {puntajeValor} — {puntajeTexto}
                    </span>
                </li>

                <li className="order-4 flex items-center gap-2">
                    <Phone size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Teléfono:</span>
                    <span className="text-gray-800">{dato(telPrimario)}</span>
                </li>

                <li className="order-5 flex items-center gap-2">
                    <Phone size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Tel. secundario:</span>
                    <span className="text-gray-800">{dato(telSecundario)}</span>
                </li>

                <li className="order-6 flex items-center gap-2">
                    <Mail size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Email:</span>
                    <span className="truncate text-gray-800">{dato(cliente.email)}</span>
                </li>

                <li className="order-7 flex items-start gap-2">
                    <MapPin size={16} className="mt-0.5 text-gray-500" />
                    <div>
                        <span className="block font-medium text-gray-600">Dirección:</span>
                        <span className="block text-gray-800">{dato(dirPrincipal)}</span>
                        <span className="text-xs text-gray-500">{dato(refPrincipal)}</span>
                    </div>
                </li>

                <li className="order-8 flex items-start gap-2">
                    <MapPin size={16} className="mt-0.5 text-gray-500" />
                    <div>
                        <span className="block font-medium text-gray-600">Dirección 2:</span>
                        <span className="block text-gray-800">{dato(dirSecundaria)}</span>
                        <span className="text-xs text-gray-500">{dato(refSecundaria)}</span>
                    </div>
                </li>

                <li className="order-9 flex items-center gap-2">
                    <LocateIcon size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Zona:</span>
                    <span className="text-gray-800">{dato(zonaNombre)}</span>
                </li>

                <li className="order-10 flex items-center gap-2">
                    <BadgeDollarSign size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-600">Cobrador:</span>
                    <span className="truncate text-gray-800">{dato(cobradorNombre)}</span>
                </li>

                <li className="order-12 flex items-start gap-2 sm:col-span-2 lg:col-span-3">
                    <StickyNote size={16} className="mt-0.5 text-gray-500" />
                    <div>
                        <span className="block font-medium text-gray-600">Observaciones:</span>
                        <span className="whitespace-pre-line text-gray-800">{dato(cliente.observaciones)}</span>
                    </div>
                </li>
            </ul>
        </section>
    );
};

export default InfoCliente;