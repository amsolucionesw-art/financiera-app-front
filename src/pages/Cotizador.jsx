// src/pages/Cotizador.jsx
import { useState, useRef, useEffect } from "react";
import {
    Calculator,
    BadgeDollarSign,
    ListOrdered,
    CalendarClock,
    CalendarDays,
    Download,
    Printer,
    Send
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { crearPresupuesto, obtenerPresupuestos } from "../services/presupuestoService";

/* ========= Helpers numéricos / de negocio (alineados con backend) ========= */

const periodLengthFromTipo = (tipo) => {
    if (tipo === "semanal") return 4;
    if (tipo === "quincenal") return 2;
    return 1; // mensual u otros
};

const calcularInteresProporcionalMin60 = (tipo, cantidad_cuotas) => {
    const n = Math.max(Number(cantidad_cuotas) || 0, 1);
    const pl = periodLengthFromTipo(tipo);
    const proporcional = 60 * (n / pl);
    return Math.max(60, proporcional);
};

const fix2 = (n) =>
    Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* ========================= Componente principal ========================= */

const Cotizador = () => {
    const [monto, setMonto] = useState("");
    const [cuotas, setCuotas] = useState("");
    const [tipo, setTipo] = useState("mensual");         // periodicidad: mensual/quincenal/semanal
    const [modalidad, setModalidad] = useState("comun"); // plan: comun/progresivo/libre
    const [nombre, setNombre] = useState("");
    const [emitidoPor, setEmitidoPor] = useState("");
    const [fechaCreacion] = useState(new Date());
    const [numero, setNumero] = useState(1);
    const printRef = useRef();

    // Al montar, cargo todos los presupuestos para decidir el siguiente número
    useEffect(() => {
        const fetchNums = async () => {
            try {
                const lista = await obtenerPresupuestos();
                if (Array.isArray(lista) && lista.length > 0) {
                    const max = Math.max(...lista.map((p) => p.numero), 0);
                    setNumero(max + 1);
                }
            } catch (err) {
                console.error("Error al obtener presupuestos:", err);
            }
        };
        fetchNums();
    }, []);

    // 🔒 Reglas para LIBRE:
    // - Siempre mensual
    // - Siempre 3 cuotas
    useEffect(() => {
        if (modalidad === "libre") {
            if (tipo !== "mensual") {
                setTipo("mensual");
            }
            if (cuotas !== "3") {
                setCuotas("3");
            }
        }
    }, [modalidad, tipo, cuotas]);

    /* ========= Helpers de formato ========= */

    const limpiarNumero = (v) => v.replace(/\./g, "");

    const formatearNumero = (v) =>
        v ? new Intl.NumberFormat("es-AR").format(v) : "";

    const handleMontoChange = (e) => {
        const val = limpiarNumero(e.target.value);
        if (/^\d*$/.test(val)) setMonto(val);
    };

    const montoValido = parseFloat(monto) > 0;
    const cuotasValidas = parseInt(cuotas, 10) > 0;

    const formatoMoneda = (v) =>
        new Intl.NumberFormat("es-AR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number(v || 0));

    const formatoFecha = (f) =>
        f.toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });

    // addDays equivalente al de backend (date-fns/addDays)
    const addDays = (date, days) => {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    };

    // Genera fechas de vencimiento siguiendo la misma regla que el backend:
    // base = hoy, luego +7 / +15 / +30 días por cuota según tipo_credito.
    const generarFechasVencimiento = () => {
        const c = modalidad === "libre" ? 3 : parseInt(cuotas, 10);
        if (isNaN(c) || c <= 0) return [];

        const base = new Date();
        const dias =
            modalidad === "libre"
                ? 30 // Libre siempre mensual en la simulación (3 ciclos mensuales)
                : tipo === "semanal"
                    ? 7
                    : tipo === "quincenal"
                        ? 15
                        : 30;

        return Array.from({ length: c }, (_, i) => {
            const venc = addDays(base, dias * (i + 1));
            return formatoFecha(venc);
        });
    };

    const fechas = generarFechasVencimiento();

    const getPlanLabel = () => {
        const raw = String(modalidad || "").toLowerCase();
        if (raw === "libre") return "LIBRE";
        if (raw === "comun") return "PLAN DE CUOTAS FIJAS";
        if (raw === "progresivo") return "PROGRESIVO";
        return modalidad || "—";
    };

    const capitalizarTipo = (t) =>
        t ? t.charAt(0).toUpperCase() + t.slice(1) : "";

    const planLabel = getPlanLabel();

    /* ========= Simulación de montos según modalidad =========
       - LIBRE: siempre mensual con 3 cuotas, sin interés incorporado (solo capital).
       - COMÚN / PROGRESIVO: interés proporcional mínimo 60%, igual criterio que backend.
       - PROGRESIVO: cuotas crecientes según fórmula n(n+1)/2, como en generarCuotasServicio.
    */

    const calcularSimulacion = () => {
        const capital = parseFloat(monto);
        const c = modalidad === "libre" ? 3 : parseInt(cuotas, 10);

        if (isNaN(capital) || isNaN(c) || c <= 0 || capital <= 0) {
            return { total: 0, interesPct: 0, cuotasDetalle: [] };
        }

        // === LIBRE ===
        // Comercialmente: 3 cuotas mensuales sobre el capital (sin interés incorporado).
        if (modalidad === "libre") {
            const total = fix2(capital);
            const base = Number((total / 3).toFixed(2));
            let cuotasDetalle = [];
            let acumulado = 0;

            for (let i = 1; i <= 3; i++) {
                const importe = base;
                cuotasDetalle.push({ numero: i, importe });
                acumulado += importe;
            }

            const diff = Number((total - acumulado).toFixed(2));
            if (Math.abs(diff) >= 0.01 && cuotasDetalle.length > 0) {
                const last = cuotasDetalle[cuotasDetalle.length - 1];
                last.importe = Number((last.importe + diff).toFixed(2));
            }

            return { total, interesPct: 0, cuotasDetalle };
        }

        // === COMÚN / PROGRESIVO (idéntico a simularPlanCredito del backend) ===

        // Interés proporcional mínimo 60% según tipo y cantidad de cuotas
        const interestPct = calcularInteresProporcionalMin60(tipo, c);

        // Monto total a devolver (M en backend)
        const total = Number((capital * (1 + interestPct / 100)).toFixed(2));

        let cuotasDetalle = [];

        if (modalidad === "progresivo") {
            // PROGRESIVO: misma lógica que generarCuotasServicio en backend
            const sum = (c * (c + 1)) / 2;
            let acumulado = 0;

            for (let i = 1; i <= c; i++) {
                const importeRaw = total * (i / sum);
                const importe = parseFloat(importeRaw.toFixed(2)); // igual a backend
                cuotasDetalle.push({ numero: i, importe });
                acumulado += importe;
            }

            const diff = parseFloat((total - acumulado).toFixed(2));
            if (cuotasDetalle.length > 0) {
                const last = cuotasDetalle[cuotasDetalle.length - 1];
                last.importe = parseFloat((last.importe + diff).toFixed(2));
            }
        } else {
            // COMÚN (PLAN DE CUOTAS FIJAS): misma lógica que backend
            const fija = parseFloat((total / c).toFixed(2));
            let acumulado = 0;

            for (let i = 1; i <= c; i++) {
                const importe = fija;
                cuotasDetalle.push({ numero: i, importe });
                acumulado += importe;
            }

            const diff = parseFloat((total - acumulado).toFixed(2));
            if (cuotasDetalle.length > 0) {
                const last = cuotasDetalle[cuotasDetalle.length - 1];
                last.importe = parseFloat((last.importe + diff).toFixed(2));
            }
        }

        return { total, interesPct: interestPct, cuotasDetalle };
    };

    const { total, interesPct, cuotasDetalle } = calcularSimulacion();
    const porCuota =
        cuotasDetalle && cuotasDetalle.length > 0
            ? cuotasDetalle[0].importe
            : 0;

    /* ========= Crear presupuesto + PDF ========= */

    const handleCrearYDescargar = async () => {
        const { total, interesPct, cuotasDetalle } = calcularSimulacion();
        if (!total || !cuotasDetalle || cuotasDetalle.length === 0) {
            console.warn("Datos insuficientes para crear presupuesto");
            return;
        }

        const payload = {
            numero,
            nombre_destinatario: nombre,
            fecha_creacion: fechaCreacion.toISOString().split("T")[0],
            monto_financiado: parseFloat(monto),
            cantidad_cuotas: modalidad === "libre" ? 3 : parseInt(cuotas, 10),
            interes: interesPct,             // se guarda para estadísticas internas
            valor_por_cuota: cuotasDetalle[0]?.importe || 0,
            total_a_pagar: total,
            tipo_credito: modalidad === "libre" ? "mensual" : tipo, // Libre siempre mensual
            modalidad_credito: modalidad,    // plan
            emitido_por: emitidoPor || null
        };

        let creado;
        try {
            creado = await crearPresupuesto(payload);
        } catch (err) {
            console.error("Error al crear presupuesto:", err);
            return;
        }

        const doc = new jsPDF();
        const PAGE_W = doc.internal.pageSize.getWidth();

        // Logo centrado y escalado
        try {
            const img = new Image();
            img.src = "/logosye.png";
            await new Promise((r) => {
                img.onload = () => r();
                img.onerror = () => r();
            });

            const MAX_W = 60;
            const MAX_H = 25;
            const hasSize = img.width && img.height;
            const scale = hasSize
                ? Math.min(MAX_W / img.width, MAX_H / img.height, 1)
                : 1;
            const w = hasSize ? img.width * scale : MAX_W;
            const h = hasSize ? img.height * scale : MAX_H;
            const x = (PAGE_W - w) / 2;

            doc.addImage(img, "PNG", x, 10, w, h);

            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text("Simulación de Crédito", PAGE_W / 2, 10 + h + 10, {
                align: "center"
            });
        } catch {
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text("Simulación de Crédito", PAGE_W / 2, 25, { align: "center" });
        }

        let y = 10 + 40;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);

        doc.text(`Presupuesto #${creado.numero}`, 14, y); y += 7;
        doc.text(`A nombre de: ${nombre || "—"}`, 14, y); y += 7;
        doc.text(`Emitido por: ${emitidoPor || "—"}`, 14, y); y += 7;
        doc.text(`Fecha de creación: ${formatoFecha(fechaCreacion)}`, 14, y); y += 7;
        doc.text(`Plan de crédito: ${planLabel}`, 14, y); y += 7;
        doc.text(`Periodicidad: ${capitalizarTipo(modalidad === "libre" ? "mensual" : tipo)}`, 14, y); y += 7;
        doc.text(`Cantidad de cuotas: ${modalidad === "libre" ? "3" : cuotas}`, 14, y); y += 7;
        doc.text(`Total a pagar: $${formatoMoneda(total)}`, 14, y); y += 7;
        if (interesPct) {
            doc.text(`Interés total aplicado: ${interesPct.toFixed(2)}%`, 14, y); y += 7;
        }

        autoTable(doc, {
            startY: y + 5,
            head: [["# Cuota", "Fecha de Vencimiento", "Importe"]],
            body: cuotasDetalle.map((q, i) => [
                q.numero,
                fechas[i] || "—",
                `$${formatoMoneda(q.importe)}`
            ])
        });

        doc.save(`presupuesto_${creado.numero}.pdf`);

        setNumero((prev) => prev + 1);
    };

    /* ========================= Render ========================= */

    return (
        <section className="p-6 max-w-xl mx-auto bg-white rounded-xl shadow-lg ring-1 ring-gray-200 animate-fade-in">
            <header className="mb-5 flex items-center gap-2 border-b pb-3">
                <Calculator className="text-green-600" />
                <h2 className="text-xl font-semibold text-gray-800">
                    Cotizador de Créditos
                </h2>
            </header>

            {/* Formulario de entrada */}
            <div className="grid gap-5 text-sm">
                <div>
                    <label className="block text-gray-700 font-medium">
                        Monto a financiar
                    </label>
                    <input
                        type="text"
                        value={formatearNumero(monto)}
                        onChange={handleMontoChange}
                        placeholder="Ej: 10000"
                        className={`w-full mt-1 rounded border px-3 py-2 focus:outline-none ${montoValido
                                ? "border-gray-300 focus:ring-2 focus:ring-green-500"
                                : "border-red-400"
                            }`}
                    />
                </div>

                <div>
                    <label className="block text-gray-700 font-medium">
                        Cantidad de cuotas
                    </label>
                    <input
                        type="number"
                        value={modalidad === "libre" ? 3 : cuotas}
                        onChange={(e) => {
                            if (modalidad !== "libre") {
                                setCuotas(e.target.value);
                            }
                        }}
                        placeholder="Ej: 12"
                        disabled={modalidad === "libre"}
                        className={`w-full mt-1 rounded border px-3 py-2 focus:outline-none ${cuotasValidas
                                ? "border-gray-300 focus:ring-2 focus:ring-green-500"
                                : "border-red-400"
                            } ${modalidad === "libre" ? "bg-gray-100 cursor-not-allowed" : ""}`}
                    />
                    {modalidad === "libre" && (
                        <p className="mt-1 text-xs text-gray-500">
                            En crédito Libre se simulan siempre 3 cuotas mensuales.
                        </p>
                    )}
                </div>

                <div>
                    <label className="block text-gray-700 font-medium">
                        A nombre de:
                    </label>
                    <input
                        type="text"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Nombre del destinatario"
                        className="w-full mt-1 rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                </div>

                <div>
                    <label className="block text-gray-700 font-medium">
                        Emitido por:
                    </label>
                    <input
                        type="text"
                        value={emitidoPor}
                        onChange={(e) => setEmitidoPor(e.target.value)}
                        placeholder="Nombre del asesor / usuario"
                        className="w-full mt-1 rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                </div>

                <div>
                    <label className="block text-gray-700 font-medium">
                        Plan de crédito
                    </label>
                    <select
                        value={modalidad}
                        onChange={(e) => setModalidad(e.target.value)}
                        className="w-full mt-1 rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                        <option value="comun">
                            Plan de Cuotas Fijas (Común)
                        </option>
                        <option value="progresivo">Progresivo</option>
                        <option value="libre">Libre</option>
                    </select>
                </div>

                <div>
                    <label className="block text-gray-700 font-medium">
                        Periodicidad
                    </label>
                    <select
                        value={modalidad === "libre" ? "mensual" : tipo}
                        onChange={(e) => {
                            if (modalidad !== "libre") {
                                setTipo(e.target.value);
                            }
                        }}
                        disabled={modalidad === "libre"}
                        className={`w-full mt-1 rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 ${modalidad === "libre" ? "bg-gray-100 cursor-not-allowed" : ""}`}
                    >
                        <option value="mensual">Mensual</option>
                        <option value="quincenal">Quincenal</option>
                        <option value="semanal">Semanal</option>
                    </select>
                    {modalidad === "libre" && (
                        <p className="mt-1 text-xs text-gray-500">
                            La modalidad Libre opera mensualmente (3 ciclos).
                        </p>
                    )}
                </div>
            </div>

            {/* Vista previa imprimible */}
            <div
                ref={printRef}
                className="mt-6 p-5 border rounded bg-gray-50 text-gray-700 space-y-2 text-sm"
            >
                <div className="flex justify-center mb-4">
                    <img
                        src="/logosye.png"
                        alt="Logo"
                        className="h-12 w-auto object-contain"
                    />
                </div>

                <p className="flex items-center gap-2">
                    <BadgeDollarSign className="text-green-600" size={18} />
                    <strong>Presupuesto #:</strong> {numero}
                </p>

                <p className="flex items-center gap-2">
                    <ListOrdered className="text-blue-600" size={18} />
                    <strong>A nombre de:</strong> {nombre || "—"}
                </p>

                <p className="flex items-center gap-2">
                    <ListOrdered className="text-blue-600" size={18} />
                    <strong>Emitido por:</strong> {emitidoPor || "—"}
                </p>

                <p className="flex items-center gap-2">
                    <CalendarClock className="text-yellow-600" size={18} />
                    <strong>Fecha de creación:</strong>{" "}
                    {formatoFecha(fechaCreacion)}
                </p>

                <p className="flex items-center gap-2">
                    <ListOrdered className="text-blue-600" size={18} />
                    <strong>Plan de crédito:</strong> {planLabel}
                </p>

                <p className="flex items-center gap-2">
                    <CalendarClock className="text-yellow-600" size={18} />
                    <strong>Periodicidad:</strong>{" "}
                    {capitalizarTipo(modalidad === "libre" ? "mensual" : tipo)}
                </p>

                <p className="flex items-center gap-2">
                    <BadgeDollarSign className="text-green-600" size={18} />
                    <strong>Total a pagar:</strong> ${formatoMoneda(total)}
                </p>

                {interesPct ? (
                    <p className="flex items-center gap-2">
                        <ListOrdered className="text-blue-600" size={18} />
                        <strong>Interés total aplicado:</strong>{" "}
                        {interesPct.toFixed(2)}%
                    </p>
                ) : null}

                <p className="flex items-center gap-2">
                    <ListOrdered className="text-blue-600" size={18} />
                    <strong>Valor por cuota:</strong>{" "}
                    {cuotasDetalle && cuotasDetalle.length > 0
                        ? `$${formatoMoneda(cuotasDetalle[0].importe)}`
                        : "—"}
                    {modalidad === "progresivo" && (
                        <span className="text-xs text-gray-500">
                            (cuotas crecientes, ver detalle abajo)
                        </span>
                    )}
                </p>

                {fechas.length > 0 && cuotasDetalle.length > 0 && (
                    <div className="pt-3">
                        <div className="flex items-center gap-2 mb-1 text-sm font-medium text-gray-600">
                            <CalendarDays className="text-indigo-600" size={18} />
                            Detalle de cuotas:
                        </div>
                        <ul className="list-disc ml-6 space-y-1">
                            {cuotasDetalle.map((q, i) => (
                                <li key={q.numero}>
                                    Cuota {q.numero}: {fechas[i] || "—"} – $
                                    {formatoMoneda(q.importe)}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Acciones */}
            <div className="mt-6 flex flex-wrap gap-3 justify-end">
                <button
                    onClick={handleCrearYDescargar}
                    className="inline-flex items-center gap-2 bg-green-600 text-white text-sm font-medium px-4 py-2 rounded hover:bg-green-700 transition"
                >
                    <Download size={16} />
                    Descargar PDF
                </button>

                <button
                    onClick={() => {
                        const printWindow = window.open("", "_blank");
                        printWindow.document.write(
                            `<html><head><title>Resumen de crédito</title></head><body>${printRef.current.innerHTML}</body></html>`
                        );
                        printWindow.document.close();
                        printWindow.focus();
                        printWindow.print();
                        printWindow.close();
                    }}
                    className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded hover:bg-indigo-700 transition"
                >
                    <Printer size={16} />
                    Imprimir
                </button>

                <button
                    onClick={() => {
                        const resumenCuotas =
                            cuotasDetalle && cuotasDetalle.length > 0
                                ? cuotasDetalle
                                    .map(
                                        (q, i) =>
                                            `Cuota ${q.numero}: ${fechas[i] || "—"} – $${formatoMoneda(
                                                q.importe
                                            )}`
                                    )
                                    .join("\n")
                                : "Sin cuotas calculadas.";

                        const resumen = `
💰 Simulación de Crédito:
- Presupuesto #: ${numero}
- A nombre de: ${nombre || "—"}
- Emitido por: ${emitidoPor || "—"}
- Plan de crédito: ${planLabel}
- Periodicidad: ${capitalizarTipo(modalidad === "libre" ? "mensual" : tipo)}
- Cantidad de cuotas: ${modalidad === "libre" ? "3" : cuotas}
- Total a pagar: $${formatoMoneda(total)}${interesPct
                                ? `\n- Interés total aplicado: ${interesPct.toFixed(
                                    2
                                )}%`
                                : ""
                            }

🗓️ Detalle de cuotas:
${resumenCuotas}
                        `.trim();

                        const mensaje = encodeURIComponent(resumen);
                        window.open(`https://wa.me/?text=${mensaje}`, "_blank");
                    }}
                    className="inline-flex items-center gap-2 bg-green-700 text-white text-sm font-medium px-4 py-2 rounded hover:bg-green-800 transition"
                >
                    <Send size={16} />
                    Enviar por WhatsApp
                </button>
            </div>
        </section>
    );
};

export default Cotizador;


