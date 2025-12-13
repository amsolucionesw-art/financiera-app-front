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
    switch (String(estado || "").toLowerCase()) {
        case "pagado":
            return "bg-green-100 text-green-700";
        case "pendiente":
            return "bg-yellow-100 text-yellow-700";
        case "vencido":
        case "vencida":
            return "bg-red-100 text-red-700";
        case "parcial":
            return "bg-blue-100 text-blue-700";
        case "refinanciado":
            return "bg-red-100 text-red-700";
        case "anulado":
            return "bg-gray-200 text-gray-700";
        default:
            return "bg-gray-100 text-gray-600";
    }
};

const labelModalidad = (m) => {
    const mod = String(m || "").toLowerCase();
    if (mod === "comun") return "Plan de Cuotas Fijas";
    if (mod === "progresivo") return "Progresivo";
    if (mod === "libre") return "Libre";
    return m ? String(m) : "—";
};

const hasValue = (v) => v !== undefined && v !== null && String(v).trim() !== "";

/**
 * ✅ Detecta si un crédito es "refinanciado" (R roja)
 * Estrategia robusta:
 * - estado contiene "refin" (refinanciado/refinanciacion/etc)
 * - flags booleanos típicos
 * - ids típicos que indican "este crédito fue reemplazado/refinanciado hacia otro"
 */
const isRefinanciado = (credito) => {
    const est = String(credito?.estado || "").toLowerCase();
    if (est.includes("refin")) return true;

    const boolFlags = [
        "refinanciado",
        "es_refinanciado",
        "fue_refinanciado",
        "credito_refinanciado",
    ];
    if (boolFlags.some((k) => credito?.[k] === true)) return true;

    const idFlags = [
        "credito_refinanciado_id",
        "credito_nuevo_id",
        "credito_resultante_id",
        "refinanciado_a_credito_id",
        "credito_hijo_id",
    ];
    if (idFlags.some((k) => hasValue(credito?.[k]))) return true;

    return false;
};

/**
 * ✅ Detecta si un crédito fue "creado desde una refinanciación" (R verde)
 * Busca cualquier referencia al crédito anterior/origen.
 */
const getRefinOrigenId = (credito) => {
    const candidatos = [
        "credito_origen_id",
        "credito_anterior_id",
        "credito_padre_id",
        "refinanciado_de_id",
        "refinanciacion_de_id",
        "credito_refinanciacion_origen_id",
        "credito_original_id",
    ];

    for (const k of candidatos) {
        if (hasValue(credito?.[k])) return credito[k];
    }

    return null;
};

const CardCreditoCliente = ({ credito, index, abierto, toggle }) => {
    const tieneDescuento = Number(credito.descuento) > 0;
    const totalSinDescuento = tieneDescuento
        ? Number(credito.monto_total_devolver) + Number(credito.descuento)
        : Number(credito.monto_total_devolver);

    // ✅ Mostrar ID real del crédito (fallback: index+1 si por algún motivo no viene)
    const tituloCredito = credito?.id ? `Crédito #${credito.id}` : `Crédito #${index + 1}`;

    // ✅ Modalidad (preferimos modalidad_credito; fallback por si viene con otro nombre)
    const modalidad =
        credito?.modalidad_credito ??
        credito?.modalidad ??
        credito?.modalidadCredito ??
        null;

    const refinanciado = isRefinanciado(credito);
    const origenRefiId = getRefinOrigenId(credito);

    // Un crédito “hijo” no debería marcarse rojo aunque tenga campos raros: priorizamos lógica
    const hijoDeRefi = !refinanciado && hasValue(origenRefiId);

    return (
        <article className="rounded-xl border bg-white shadow-sm">
            <header
                onClick={toggle}
                className="p-4 cursor-pointer hover:bg-gray-50"
            >
                <div className="flex items-start justify-between gap-3">
                    {/* IZQUIERDA: Título + R badges + Modalidad */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-gray-800 text-base flex items-center gap-2">
                                <BadgeDollarSign size={18} className="text-green-600" />
                                {tituloCredito}
                            </h4>

                            {/* R roja: refinanciado */}
                            {refinanciado && (
                                <span
                                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200"
                                    title="Crédito refinanciado"
                                >
                                    R
                                </span>
                            )}

                            {/* R verde: crédito creado desde refinanciación */}
                            {hijoDeRefi && (
                                <span
                                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 border border-green-200"
                                    title={`Crédito creado desde refinanciación (origen #${origenRefiId})`}
                                >
                                    R
                                </span>
                            )}
                        </div>

                        <div className="mt-1 text-xs sm:text-sm text-gray-600">
                            <strong>Modalidad:</strong> {labelModalidad(modalidad)}
                        </div>
                    </div>

                    {/* DERECHA: Estado + Chevron */}
                    <div className="flex items-center gap-3 shrink-0">
                        <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${estadoClasses(
                                credito?.estado
                            )}`}
                            title="Estado del crédito"
                        >
                            {credito?.estado || "—"}
                        </span>

                        <ChevronDown
                            className={`h-5 w-5 text-gray-500 transition-transform duration-300 ${
                                abierto ? "rotate-180" : ""
                            }`}
                        />
                    </div>
                </div>
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

