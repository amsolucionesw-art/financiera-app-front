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

const fix2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

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

    // Constantes de negocio para LIBRE
    const TASA_LIBRE_PCT = 60;            // 60% por ciclo (fijo)
    const MORA_DIARIA_LIBRE_PCT = 2.5;    // 2,5% diario sobre deuda (capital + interés) desde el vencimiento
    const LIBRE_MAX_CICLOS = 3;

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
    // - Se simula 1 ciclo (1 “cuota abierta”) con interés incluido
    // - Aclaración: puede extenderse hasta 3 ciclos (proyección informativa)
    useEffect(() => {
        if (modalidad === "libre") {
            if (tipo !== "mensual") setTipo("mensual");
            if (cuotas !== "1") setCuotas("1");
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

    const montoNum = parseFloat(monto);
    const montoValido = Number.isFinite(montoNum) && montoNum > 0;

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

    // Vencimientos (común/progresivo: según cantidad de cuotas; libre: 1 ciclo)
    const generarFechasVencimiento = () => {
        const c = modalidad === "libre" ? 1 : parseInt(cuotas, 10);
        if (isNaN(c) || c <= 0) return [];

        const base = new Date();
        const dias =
            modalidad === "libre"
                ? 30
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

    // Vencimientos para proyección LIBRE (hasta 3 ciclos)
    const generarFechasLibreProyeccion = () => {
        const base = new Date();
        return Array.from({ length: LIBRE_MAX_CICLOS }, (_, i) => {
            const venc = addDays(base, 30 * (i + 1));
            return formatoFecha(venc);
        });
    };

    const fechas = generarFechasVencimiento();
    const fechasLibre = generarFechasLibreProyeccion();

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
    const itemLabel = modalidad === "libre" ? "Ciclo" : "Cuota";

    // Proyección Libre: cada ciclo cierra con 60% sobre el capital del ciclo.
    // Si no paga al vencimiento, la mora diaria (2,5%) corre sobre la deuda de ese ciclo (capital+interés).
    // El “capital” del ciclo siguiente pasa a ser la deuda del ciclo anterior (capitalización por ciclo).
    const calcularLibreProyeccion = (capitalBase, maxCycles = LIBRE_MAX_CICLOS) => {
        const cap0 = Number(capitalBase);
        if (!Number.isFinite(cap0) || cap0 <= 0) return [];

        let capitalCiclo = fix2(cap0);
        const out = [];

        for (let ciclo = 1; ciclo <= maxCycles; ciclo++) {
            const interesMonto = fix2(capitalCiclo * (TASA_LIBRE_PCT / 100));
            const totalCiclo = fix2(capitalCiclo + interesMonto);
            const moraDiaria = fix2(totalCiclo * (MORA_DIARIA_LIBRE_PCT / 100));

            out.push({
                ciclo,
                capitalCiclo,
                interesMonto,
                totalCiclo,
                moraDiaria
            });

            // Capital del próximo ciclo = deuda del ciclo actual (capital + interés)
            capitalCiclo = totalCiclo;
        }

        return out;
    };

    /* ========= Simulación de montos según modalidad =========
       - LIBRE: 1 ciclo (cuota abierta) con 60% incluido.
                Se muestra proyección hasta 3 ciclos (informativa).
                Mora diaria: 2,5% sobre (capital + interés) desde el vencimiento.
       - COMÚN / PROGRESIVO: interés proporcional mínimo 60%, igual criterio que backend.
       - PROGRESIVO: cuotas crecientes según fórmula n(n+1)/2.
    */

    const calcularSimulacion = () => {
        const capital = parseFloat(monto);
        const c = modalidad === "libre" ? 1 : parseInt(cuotas, 10);

        if (isNaN(capital) || isNaN(c) || c <= 0 || capital <= 0) {
            return {
                total: 0,
                interesPct: 0,
                cuotasDetalle: [],
                libreProyeccion: [],
                moraDiariaMonto: 0
            };
        }

        // === LIBRE ===
        if (modalidad === "libre") {
            const libreProyeccion = calcularLibreProyeccion(capital, LIBRE_MAX_CICLOS);
            const ciclo1 = libreProyeccion[0];

            const total = ciclo1 ? ciclo1.totalCiclo : 0;
            const cuotasDetalle = [{ numero: 1, importe: total }];

            return {
                total,
                interesPct: TASA_LIBRE_PCT,
                cuotasDetalle,
                libreProyeccion,
                moraDiariaMonto: ciclo1 ? ciclo1.moraDiaria : 0
            };
        }

        // === COMÚN / PROGRESIVO ===
        const interestPct = calcularInteresProporcionalMin60(tipo, c);
        const total = Number((capital * (1 + interestPct / 100)).toFixed(2));

        let cuotasDetalle = [];

        if (modalidad === "progresivo") {
            const sum = (c * (c + 1)) / 2;
            let acumulado = 0;

            for (let i = 1; i <= c; i++) {
                const importeRaw = total * (i / sum);
                const importe = parseFloat(importeRaw.toFixed(2));
                cuotasDetalle.push({ numero: i, importe });
                acumulado += importe;
            }

            const diff = parseFloat((total - acumulado).toFixed(2));
            if (cuotasDetalle.length > 0) {
                const last = cuotasDetalle[cuotasDetalle.length - 1];
                last.importe = parseFloat((last.importe + diff).toFixed(2));
            }
        } else {
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

        return {
            total,
            interesPct: interestPct,
            cuotasDetalle,
            libreProyeccion: [],
            moraDiariaMonto: 0
        };
    };

    const { total, interesPct, cuotasDetalle, libreProyeccion, moraDiariaMonto } = calcularSimulacion();

    const porCuota =
        cuotasDetalle && cuotasDetalle.length > 0 ? cuotasDetalle[0].importe : 0;

    /* ========= Crear presupuesto + PDF ========= */

    const handleCrearYDescargar = async () => {
        const { total, interesPct, cuotasDetalle, libreProyeccion, moraDiariaMonto } = calcularSimulacion();
        if (!total || !cuotasDetalle || cuotasDetalle.length === 0) {
            console.warn("Datos insuficientes para crear presupuesto");
            return;
        }

        const payload = {
            numero,
            nombre_destinatario: nombre,
            fecha_creacion: fechaCreacion.toISOString().split("T")[0],
            monto_financiado: parseFloat(monto),
            cantidad_cuotas: modalidad === "libre" ? 1 : parseInt(cuotas, 10),
            interes: interesPct, // para estadísticas internas
            valor_por_cuota: cuotasDetalle[0]?.importe || 0,
            total_a_pagar: total,
            tipo_credito: modalidad === "libre" ? "mensual" : tipo,
            modalidad_credito: modalidad,
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
            const scale = hasSize ? Math.min(MAX_W / img.width, MAX_H / img.height, 1) : 1;
            const w = hasSize ? img.width * scale : MAX_W;
            const h = hasSize ? img.height * scale : MAX_H;
            const x = (PAGE_W - w) / 2;

            doc.addImage(img, "PNG", x, 10, w, h);

            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text("Simulación de Crédito", PAGE_W / 2, 10 + h + 10, { align: "center" });
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

        if (modalidad === "libre") {
            doc.text(`Tasa del ciclo: ${TASA_LIBRE_PCT.toFixed(2)}%`, 14, y); y += 7;
            doc.text(
                `Mora diaria desde venc.: ${MORA_DIARIA_LIBRE_PCT.toFixed(2)}% sobre (capital+interés) = $${formatoMoneda(moraDiariaMonto)}`,
                14,
                y
            ); y += 7;
            doc.text(`Ciclos posibles: hasta ${LIBRE_MAX_CICLOS} (se simula 1 ciclo)`, 14, y); y += 7;
        } else if (interesPct) {
            doc.text(`Interés total aplicado: ${interesPct.toFixed(2)}%`, 14, y); y += 7;
        }

        doc.text(`Cantidad de ${modalidad === "libre" ? "ciclos" : "cuotas"}: ${modalidad === "libre" ? "1" : cuotas}`, 14, y); y += 7;
        doc.text(`Total a pagar: $${formatoMoneda(total)}`, 14, y); y += 7;

        // Tabla principal (detalle simulado)
        autoTable(doc, {
            startY: y + 5,
            head: [[`# ${itemLabel}`, "Fecha (estimada)", "Importe"]],
            body: cuotasDetalle.map((q, i) => [
                q.numero,
                fechas[i] || "—",
                `$${formatoMoneda(q.importe)}`
            ])
        });

        // Proyección Libre (informativa) hasta 3 ciclos
        if (modalidad === "libre" && Array.isArray(libreProyeccion) && libreProyeccion.length > 0) {
            const nextY = (doc.lastAutoTable?.finalY || (y + 20)) + 8;

            autoTable(doc, {
                startY: nextY,
                head: [[
                    "Ciclo",
                    "Venc. estimado",
                    "Capital ciclo",
                    "Interés (60%)",
                    "Deuda al cierre",
                    "Mora diaria (2,5%)*"
                ]],
                body: libreProyeccion.map((row, idx) => [
                    row.ciclo,
                    fechasLibre[idx] || "—",
                    `$${formatoMoneda(row.capitalCiclo)}`,
                    `$${formatoMoneda(row.interesMonto)}`,
                    `$${formatoMoneda(row.totalCiclo)}`,
                    `$${formatoMoneda(row.moraDiaria)}`
                ])
            });

            const footY = (doc.lastAutoTable?.finalY || nextY) + 6;
            doc.setFontSize(9);
            doc.text("*La mora diaria corre desde el vencimiento del ciclo si no se paga.", 14, footY);
            doc.setFontSize(11);
        }

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
                        value={modalidad === "libre" ? 1 : cuotas}
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
                            En crédito Libre se simula 1 ciclo. Puede extenderse hasta {LIBRE_MAX_CICLOS} ciclos (se muestra proyección).
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
                        <option value="comun">Plan de Cuotas Fijas (Común)</option>
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
                            La modalidad Libre opera mensualmente (hasta {LIBRE_MAX_CICLOS} ciclos).
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
                    <strong>Fecha de creación:</strong> {formatoFecha(fechaCreacion)}
                </p>

                <p className="flex items-center gap-2">
                    <ListOrdered className="text-blue-600" size={18} />
                    <strong>Plan de crédito:</strong> {planLabel}
                </p>

                <p className="flex items-center gap-2">
                    <CalendarClock className="text-yellow-600" size={18} />
                    <strong>Periodicidad:</strong> {capitalizarTipo(modalidad === "libre" ? "mensual" : tipo)}
                </p>

                {modalidad === "libre" && (
                    <>
                        <p className="flex items-center gap-2">
                            <ListOrdered className="text-blue-600" size={18} />
                            <strong>Tasa del ciclo:</strong> {TASA_LIBRE_PCT.toFixed(2)}%
                        </p>
                        <p className="flex items-center gap-2">
                            <ListOrdered className="text-blue-600" size={18} />
                            <strong>Mora diaria desde vencimiento:</strong>{" "}
                            {MORA_DIARIA_LIBRE_PCT.toFixed(2)}% sobre (capital+interés) = ${formatoMoneda(moraDiariaMonto)}
                        </p>
                        <p className="text-xs text-gray-500">
                            Nota: la mora diaria corre si no se paga al vencimiento del ciclo. Se simula 1 ciclo; proyección informativa hasta {LIBRE_MAX_CICLOS}.
                        </p>
                    </>
                )}

                <p className="flex items-center gap-2">
                    <BadgeDollarSign className="text-green-600" size={18} />
                    <strong>Total a pagar:</strong> ${formatoMoneda(total)}
                </p>

                {modalidad !== "libre" && interesPct ? (
                    <p className="flex items-center gap-2">
                        <ListOrdered className="text-blue-600" size={18} />
                        <strong>Interés total aplicado:</strong> {interesPct.toFixed(2)}%
                    </p>
                ) : null}

                <p className="flex items-center gap-2">
                    <ListOrdered className="text-blue-600" size={18} />
                    <strong>Valor por {modalidad === "libre" ? "ciclo" : "cuota"}:</strong>{" "}
                    {cuotasDetalle && cuotasDetalle.length > 0
                        ? `$${formatoMoneda(porCuota)}`
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
                            Detalle:
                        </div>
                        <ul className="list-disc ml-6 space-y-1">
                            {cuotasDetalle.map((q, i) => (
                                <li key={q.numero}>
                                    {itemLabel} {q.numero}: {fechas[i] || "—"} – ${formatoMoneda(q.importe)}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Proyección informativa LIBRE (hasta 3 ciclos) */}
                {modalidad === "libre" && Array.isArray(libreProyeccion) && libreProyeccion.length > 0 && (
                    <div className="pt-3">
                        <div className="flex items-center gap-2 mb-1 text-sm font-medium text-gray-600">
                            <CalendarDays className="text-indigo-600" size={18} />
                            Proyección (si se extiende hasta {LIBRE_MAX_CICLOS} ciclos):
                        </div>
                        <ul className="list-disc ml-6 space-y-1">
                            {libreProyeccion.map((row, idx) => (
                                <li key={row.ciclo}>
                                    Ciclo {row.ciclo} (venc. {fechasLibre[idx] || "—"}): deuda al cierre ${formatoMoneda(row.totalCiclo)} — mora diaria ${formatoMoneda(row.moraDiaria)}
                                </li>
                            ))}
                        </ul>
                        <p className="mt-1 text-xs text-gray-500">
                            *La mora diaria (2,5%) aplica sobre la deuda del ciclo vencido (capital + interés) desde el día posterior al vencimiento.
                        </p>
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
                                            `${itemLabel} ${q.numero}: ${fechas[i] || "—"} – $${formatoMoneda(q.importe)}`
                                    )
                                    .join("\n")
                                : "Sin detalle calculado.";

                        const proyLibreTxt =
                            modalidad === "libre" && Array.isArray(libreProyeccion) && libreProyeccion.length > 0
                                ? "\n\n📈 Proyección (hasta 3 ciclos):\n" +
                                libreProyeccion
                                    .map((row, idx) =>
                                        `- Ciclo ${row.ciclo} (venc. ${fechasLibre[idx] || "—"}): $${formatoMoneda(row.totalCiclo)} | mora diaria $${formatoMoneda(row.moraDiaria)}`
                                    )
                                    .join("\n") +
                                "\n*La mora diaria corre desde el vencimiento del ciclo si no se paga."
                                : "";

                        const extraLibre =
                            modalidad === "libre"
                                ? `\n- Tasa del ciclo: ${TASA_LIBRE_PCT.toFixed(2)}%` +
                                `\n- Mora diaria desde venc.: ${MORA_DIARIA_LIBRE_PCT.toFixed(2)}% sobre (capital+interés) = $${formatoMoneda(moraDiariaMonto)}` +
                                `\n- Ciclos posibles: hasta ${LIBRE_MAX_CICLOS} (se simula 1 ciclo)`
                                : "";

                        const resumen = `
💰 Simulación de Crédito:
- Presupuesto #: ${numero}
- A nombre de: ${nombre || "—"}
- Emitido por: ${emitidoPor || "—"}
- Plan de crédito: ${planLabel}
- Periodicidad: ${capitalizarTipo(modalidad === "libre" ? "mensual" : tipo)}
- Cantidad de ${modalidad === "libre" ? "ciclos" : "cuotas"}: ${modalidad === "libre" ? "1" : cuotas}
- Total a pagar: $${formatoMoneda(total)}${modalidad !== "libre" && interesPct
                                ? `\n- Interés total aplicado: ${interesPct.toFixed(2)}%`
                                : ""
                            }${extraLibre}

🗓️ Detalle:
${resumenCuotas}${proyLibreTxt}
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


