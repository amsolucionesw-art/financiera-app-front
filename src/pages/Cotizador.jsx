// src/pages/Cotizador.jsx
import { useState, useRef, useEffect } from "react";
import {
    Calculator,
    BadgeDollarSign,
    ListOrdered,
    PercentCircle,
    CalendarClock,
    CalendarDays,
    Download,
    Printer,
    Send
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { crearPresupuesto, obtenerPresupuestos } from "../services/presupuestoService";

const Cotizador = () => {
    const [monto, setMonto] = useState("");
    const [cuotas, setCuotas] = useState("");
    const [tipo, setTipo] = useState("mensual");
    const [nombre, setNombre] = useState("");
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
        new Intl.NumberFormat("es-AR").format(v);

    const formatoFecha = (f) =>
        f.toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });

    const calcularTotal = () => {
        const m = parseFloat(monto);
        const c = parseInt(cuotas, 10);
        if (isNaN(m) || isNaN(c) || c <= 0) return 0;
        return m * (1 + 0.6);
    };

    const calcularPorCuota = () => {
        const total = calcularTotal();
        const c = parseInt(cuotas, 10);
        if (isNaN(c) || c <= 0) return 0;
        return total / c;
    };

    const generarFechasVencimiento = () => {
        const c = parseInt(cuotas, 10);
        if (isNaN(c) || c <= 0) return [];
        const hoy = new Date();
        return Array.from({ length: c }, (_, i) => {
            const f = new Date(hoy);
            if (tipo === "mensual") f.setMonth(f.getMonth() + i + 1);
            if (tipo === "quincenal") f.setDate(f.getDate() + (i + 1) * 15);
            if (tipo === "semanal") f.setDate(f.getDate() + (i + 1) * 7);
            return formatoFecha(f);
        });
    };

    const fechas = generarFechasVencimiento();

    // Crea el presupuesto en el backend y luego genera el PDF con offsets ajustados
    const handleCrearYDescargar = async () => {
        const total = calcularTotal();
        const porCuota = calcularPorCuota();
        const payload = {
            numero,
            nombre_destinatario: nombre,
            fecha_creacion: fechaCreacion.toISOString().split("T")[0],
            monto_financiado: parseFloat(monto),
            cantidad_cuotas: parseInt(cuotas, 10),
            interes: 0.6,
            valor_por_cuota: porCuota,
            total_a_pagar: total,
            tipo_credito: tipo
        };

        let creado;
        try {
            creado = await crearPresupuesto(payload);
        } catch (err) {
            console.error("Error al crear presupuesto:", err);
            return;
        }

        const doc = new jsPDF();
        const img = new Image();
        img.src = "/logosye.png";
        await new Promise((r) => (img.onload = r));

        // Dibujo el logo en (14,10) con altura 20px
        doc.addImage(img, "PNG", 14, 10, 40, 20);

        // Título desplazado para quedar por debajo del logo
        doc.setFontSize(16);
        doc.text("Simulación de Crédito", 60, 35);

        // Offset inicial Y por debajo del título
        let y = 45;
        doc.setFontSize(11);
        doc.text(`Presupuesto #${creado.numero}`, 14, y); y += 7;
        doc.text(`A nombre de: ${nombre}`, 14, y); y += 7;
        doc.text(`Fecha de creación: ${formatoFecha(fechaCreacion)}`, 14, y); y += 7;
        doc.text(`Monto financiado: $${formatoMoneda(monto)}`, 14, y); y += 7;
        doc.text(`Cantidad de cuotas: ${cuotas}`, 14, y); y += 7;
        doc.text(`Interés aplicado: 60%`, 14, y); y += 7;
        doc.text(`Valor por cuota: $${formatoMoneda(porCuota)}`, 14, y); y += 7;
        doc.text(`Total a pagar: $${formatoMoneda(total)}`, 14, y); y += 7;
        doc.text(`Tipo de crédito: ${tipo}`, 14, y);

        autoTable(doc, {
            startY: y + 10,
            head: [["# Cuota", "Fecha de Vencimiento"]],
            body: fechas.map((f, i) => [i + 1, f])
        });

        doc.save(`presupuesto_${creado.numero}.pdf`);

        // Preparo el siguiente número para el próximo presupuesto
        setNumero((prev) => prev + 1);
    };

    return (
        <section className="p-6 max-w-xl mx-auto bg-white rounded-xl shadow-lg ring-1 ring-gray-200 animate-fade-in">
            <header className="mb-5 flex items-center gap-2 border-b pb-3">
                <Calculator className="text-green-600" />
                <h2 className="text-xl font-semibold text-gray-800">
                    Cotizador de Créditos
                </h2>
            </header>

            <div className="grid gap-5 text-sm">
                <div>
                    <label className="block text-gray-700 font-medium">Monto a financiar</label>
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
                    <label className="block text-gray-700 font-medium">Cantidad de cuotas</label>
                    <input
                        type="number"
                        value={cuotas}
                        onChange={(e) => setCuotas(e.target.value)}
                        placeholder="Ej: 12"
                        className={`w-full mt-1 rounded border px-3 py-2 focus:outline-none ${cuotasValidas
                                ? "border-gray-300 focus:ring-2 focus:ring-green-500"
                                : "border-red-400"
                            }`}
                    />
                </div>

                <div>
                    <label className="block text-gray-700 font-medium">A nombre de:</label>
                    <input
                        type="text"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Nombre del destinatario"
                        className="w-full mt-1 rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                </div>

                <div>
                    <label className="block text-gray-700 font-medium">Interés</label>
                    <input
                        type="text"
                        value="60%"
                        readOnly
                        className="w-full mt-1 rounded border border-gray-300 px-3 py-2 bg-gray-100 text-gray-600"
                    />
                </div>

                <div>
                    <label className="block text-gray-700 font-medium">Tipo de crédito</label>
                    <select
                        value={tipo}
                        onChange={(e) => setTipo(e.target.value)}
                        className="w-full mt-1 rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                        <option value="mensual">Mensual</option>
                        <option value="quincenal">Quincenal</option>
                        <option value="semanal">Semanal</option>
                    </select>
                </div>
            </div>

            <div ref={printRef} className="mt-6 p-5 border rounded bg-gray-50 text-gray-700 space-y-2 text-sm">
                <div className="flex justify-center mb-4">
                    <img src="/logosye.png" alt="Logo" className="h-12" />
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
                    <CalendarClock className="text-yellow-600" size={18} />
                    <strong>Fecha de creación:</strong> {formatoFecha(fechaCreacion)}
                </p>

                <p className="flex items-center gap-2">
                    <BadgeDollarSign className="text-green-600" size={18} />
                    <strong>Total a pagar:</strong> ${formatoMoneda(calcularTotal())}
                </p>
                <p className="flex items-center gap-2">
                    <ListOrdered className="text-blue-600" size={18} />
                    <strong>Valor por cuota:</strong> ${formatoMoneda(calcularPorCuota())}
                </p>
                <p className="flex items-center gap-2">
                    <PercentCircle className="text-purple-600" size={18} />
                    <strong>Interés aplicado:</strong> 60%
                </p>
                <p className="flex items-center gap-2">
                    <CalendarClock className="text-yellow-600" size={18} />
                    <strong>Tipo de crédito:</strong> {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                </p>

                {fechas.length > 0 && (
                    <div className="pt-3">
                        <div className="flex items-center gap-2 mb-1 text-sm font-medium text-gray-600">
                            <CalendarDays className="text-indigo-600" size={18} />
                            Próximas fechas de vencimiento:
                        </div>
                        <ul className="list-disc ml-6 space-y-1">
                            {fechas.map((f, i) => (
                                <li key={i}>
                                    Cuota {i + 1}: {f}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

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
                        const resumen = `
💰 Simulación de Crédito:
- Presupuesto #: ${numero}
- A nombre de: ${nombre}
- Monto financiado: $${formatoMoneda(monto)}
- Cantidad de cuotas: ${cuotas}
- Interés aplicado: 60%
- Valor por cuota: $${formatoMoneda(calcularPorCuota())}
- Total a pagar: $${formatoMoneda(calcularTotal())}
- Tipo de crédito: ${tipo}

🗓️ Fechas de vencimiento:
${fechas.map((f, i) => `Cuota ${i + 1}: ${f}`).join("\n")}
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
