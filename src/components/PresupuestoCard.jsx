// src/components/PresupuestoCard.jsx

import React from "react";
import {
    BadgeDollarSign,
    ListOrdered,
    CalendarClock,
    CalendarDays,
    X,
    Download
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PresupuestoCard = ({ presupuesto, onClose }) => {
    const {
        numero,
        nombre_destinatario,
        fecha_creacion,
        cantidad_cuotas,
        valor_por_cuota,
        total_a_pagar,
        tipo_credito,        // periodicidad: mensual / quincenal / semanal
        modalidad_credito,   // plan: comun / progresivo / libre
        emitido_por          // quién emite el presupuesto
    } = presupuesto;

    const fmtMoneda = (v) =>
        Number(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const fmtFecha = (str) =>
        new Date(str).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });

    const planLabel = (() => {
        const raw = String(modalidad_credito || "").toLowerCase();
        if (raw === "libre") return "LIBRE";
        if (raw === "comun") return "PLAN DE CUOTAS FIJAS";
        if (raw === "progresivo") return "PROGRESIVO";
        return modalidad_credito || "—";
    })();

    const generarFechas = () => {
        const n = cantidad_cuotas;
        const hoy = new Date();
        return Array.from({ length: n }, (_, i) => {
            const f = new Date(hoy);
            if (tipo_credito === "mensual") f.setMonth(f.getMonth() + i + 1);
            else if (tipo_credito === "quincenal") f.setDate(f.getDate() + (i + 1) * 15);
            else /* semanal u otros */ f.setDate(f.getDate() + (i + 1) * 7);
            return fmtFecha(f);
        });
    };

    const fechas = generarFechas();

    const descargarPDF = async () => {
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
            // Si falla la imagen, al menos ponemos el título
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text("Simulación de Crédito", PAGE_W / 2, 25, { align: "center" });
        }

        let y = 10 + 40; // después del logo/título
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);

        doc.text(`Presupuesto #${numero}`, 14, y);
        y += 7;
        doc.text(`A nombre de: ${nombre_destinatario}`, 14, y);
        y += 7;
        doc.text(`Emitido por: ${emitido_por || "—"}`, 14, y);
        y += 7;
        doc.text(`Fecha de creación: ${fmtFecha(fecha_creacion)}`, 14, y);
        y += 7;
        doc.text(`Plan de crédito: ${planLabel}`, 14, y);
        y += 7;
        doc.text(`Periodicidad: ${tipo_credito}`, 14, y);
        y += 7;
        doc.text(`Cantidad de cuotas: ${cantidad_cuotas}`, 14, y);
        y += 7;
        doc.text(`Valor por cuota: $${fmtMoneda(valor_por_cuota)}`, 14, y);
        y += 7;
        doc.text(`Total a pagar: $${fmtMoneda(total_a_pagar)}`, 14, y);

        autoTable(doc, {
            startY: y + 10,
            head: [["# Cuota", "Fecha de Vencimiento"]],
            body: fechas.map((f, i) => [i + 1, f])
        });

        doc.save(`presupuesto_${numero}.pdf`);
    };

    return (
        <div className="p-6 sm:p-8 max-w-xl mx-auto bg-white rounded-xl shadow-lg ring-1 ring-gray-200 animate-fade-in relative">
            <button
                onClick={onClose}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
            >
                <X size={20} />
            </button>

            {/* Logo acomodado en front (centrado, manteniendo proporción) */}
            <div className="flex justify-center mb-6">
                <img
                    src="/logosye.png"
                    alt="Logo"
                    className="h-12 w-auto object-contain"
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-gray-700 text-sm">
                <div className="space-y-1">
                    <p className="font-medium">Presupuesto #</p>
                    <p>{numero}</p>
                </div>
                <div className="space-y-1">
                    <p className="font-medium">A nombre de:</p>
                    <p>{nombre_destinatario}</p>
                </div>
                <div className="space-y-1">
                    <p className="font-medium">Emitido por:</p>
                    <p>{emitido_por || "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                    <CalendarClock className="text-yellow-600" size={18} />
                    <p>{fmtFecha(fecha_creacion)}</p>
                </div>
                <div className="space-y-1">
                    <p className="font-medium">Plan de crédito:</p>
                    <p className="capitalize">{planLabel}</p>
                </div>
                <div className="space-y-1">
                    <p className="font-medium">Periodicidad:</p>
                    <p className="capitalize">{tipo_credito}</p>
                </div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-gray-700 text-sm">
                <p className="flex items-center gap-2">
                    <BadgeDollarSign className="text-green-600" size={18} />
                    <span>Total a pagar:</span>
                    <strong>${fmtMoneda(total_a_pagar)}</strong>
                </p>
                <p className="flex items-center gap-2">
                    <ListOrdered className="text-blue-600" size={18} />
                    <span>Valor por cuota:</span>
                    <strong>${fmtMoneda(valor_por_cuota)}</strong>
                </p>
                <p className="flex items-center gap-2">
                    <ListOrdered className="text-gray-600" size={18} />
                    <span>Cuotas:</span>
                    <strong>{cantidad_cuotas}</strong>
                </p>
            </div>

            {fechas.length > 0 && (
                <div className="mt-6 text-gray-700 text-sm">
                    <p className="font-medium flex items-center gap-2 mb-2">
                        <CalendarDays className="text-indigo-600" size={18} />
                        Próximas fechas de vencimiento:
                    </p>
                    <ul className="list-disc ml-6 space-y-1">
                        {fechas.map((f, i) => (
                            <li key={i}>
                                Cuota {i + 1}: {f}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="mt-6 flex justify-end">
                <button
                    onClick={descargarPDF}
                    className="inline-flex items-center gap-2 bg-green-600 text-white text-sm font-medium px-4 py-2 rounded hover:bg-green-700 transition"
                >
                    <Download size={16} />
                    Descargar PDF
                </button>
            </div>
        </div>
    );
};

export default PresupuestoCard;

