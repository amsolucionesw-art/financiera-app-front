// src/components/PresupuestoCard.jsx

import React from 'react';
import {
    BadgeDollarSign,
    ListOrdered,
    PercentCircle,
    CalendarClock,
    CalendarDays,
    X,
    Download
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const PresupuestoCard = ({ presupuesto, onClose }) => {
    const {
        numero,
        nombre_destinatario,
        fecha_creacion,
        monto_financiado,
        cantidad_cuotas,
        valor_por_cuota,
        total_a_pagar,
        tipo_credito
    } = presupuesto;

    // Calcula el interés real a partir de los montos almacenados
    const interestDecimal = total_a_pagar / monto_financiado - 1;
    const percent = Math.round(interestDecimal * 100);

    const fmtMoneda = (v) =>
        v.toLocaleString('es-AR', { minimumFractionDigits: 2 });
    const fmtFecha = (str) =>
        new Date(str).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

    const generarFechas = () => {
        const n = cantidad_cuotas;
        const hoy = new Date();
        return Array.from({ length: n }, (_, i) => {
            const f = new Date(hoy);
            if (tipo_credito === 'mensual') f.setMonth(f.getMonth() + i + 1);
            else if (tipo_credito === 'quincenal') f.setDate(f.getDate() + (i + 1) * 15);
            else /* semanal */              f.setDate(f.getDate() + (i + 1) * 7);
            return fmtFecha(f);
        });
    };

    const fechas = generarFechas();

    const descargarPDF = async () => {
        const doc = new jsPDF();
        const img = new Image();
        img.src = '/logosye.png';
        await new Promise((r) => (img.onload = r));
        doc.addImage(img, 'PNG', 14, 10, 40, 20);

        doc.setFontSize(16);
        doc.text('Simulación de Crédito', 60, 35);

        let y = 45;
        doc.setFontSize(11);
        doc.text(`Presupuesto #${numero}`, 14, y); y += 7;
        doc.text(`A nombre de: ${nombre_destinatario}`, 14, y); y += 7;
        doc.text(`Fecha de creación: ${fmtFecha(fecha_creacion)}`, 14, y); y += 7;
        doc.text(`Monto financiado: $${fmtMoneda(monto_financiado)}`, 14, y); y += 7;
        doc.text(`Cantidad de cuotas: ${cantidad_cuotas}`, 14, y); y += 7;
        doc.text(`Interés aplicado: ${percent}%`, 14, y); y += 7;
        doc.text(`Valor por cuota: $${fmtMoneda(valor_por_cuota)}`, 14, y); y += 7;
        doc.text(`Total a pagar: $${fmtMoneda(total_a_pagar)}`, 14, y); y += 7;
        doc.text(`Tipo de crédito: ${tipo_credito}`, 14, y);

        autoTable(doc, {
            startY: y + 10,
            head: [['# Cuota', 'Fecha de Vencimiento']],
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

            <div className="flex justify-center mb-6">
                <img src="/logosye.png" alt="Logo" className="h-12" />
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
                <div className="flex items-center gap-2">
                    <CalendarClock className="text-yellow-600" size={18} />
                    <p>{fmtFecha(fecha_creacion)}</p>
                </div>
                <div className="space-y-1">
                    <p className="font-medium">Tipo crédito:</p>
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
                    <PercentCircle className="text-purple-600" size={18} />
                    <span>Interés aplicado:</span>
                    <strong>{percent}%</strong>
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

