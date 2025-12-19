// src/components/InfoCreditos.jsx
import React, { useState, useEffect } from "react";
import {
    BadgeDollarSign,
    CheckCircle2,
    Clock,
    XCircle,
    TrendingUp,
    ListOrdered,
    User,
    Percent,
    ChevronDown,
    CalendarDays,
    RefreshCw,
    DollarSign,
    CornerUpLeft,
    FileText,
    Filter,
    Info,
    Printer
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import CuotasTabla from "./CuotasTabla";
import { obtenerRecibosPorCredito } from "../services/reciboService";
import { registrarPagoParcial, pagarCuota, obtenerFormasDePago } from "../services/cuotaService";
import {
    obtenerResumenLibre,
    refinanciarCreditoSeguro,
    previewRefinanciacion,
    obtenerCreditoPorId
} from "../services/creditoService";
import CancelarCreditoModal from "./CancelarCreditoModal";
import { jwtDecode } from "jwt-decode";
import Swal from "sweetalert2";

/* === PDF en el Front === */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ───────── Helpers comunes ───────── */
const money = (n) =>
    Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getPeriodDays = (tipo) => (tipo === "semanal" ? 7 : tipo === "quincenal" ? 15 : 30);
const diffDays = (a, b) => {
    const ms = new Date(a).setHours(0, 0, 0, 0) - new Date(b).setHours(0, 0, 0, 0);
    return Math.floor(ms / 86400000);
};
/** Ciclo actual 1..3 (capped) desde fecha_acreditacion hasta hoy */
const cicloActualDesde = (fecha_acreditacion, tipo_credito) => {
    if (!fecha_acreditacion) return 1;
    const days = Math.max(diffDays(new Date(), fecha_acreditacion), 0);
    const period = getPeriodDays(tipo_credito);
    return Math.min(3, Math.floor(days / period) + 1);
};

const safeLower = (v) => String(v ?? "").trim().toLowerCase();
/** Suma días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD */
const addDaysStr = (dateStr, days) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

/**
 * Calcula las fechas de los 3 ciclos de un crédito LIBRE.
 * Base = fecha_compromiso_pago (preferente) o fecha_acreditacion.
 * Usa la periodicidad (tipo_credito: semanal/quincenal/mensual).
 */
const fechasCiclosLibre = (credito) => {
    if (!credito || safeLower(credito.modalidad_credito) !== "libre") return [];
    const base = credito.fecha_compromiso_pago || credito.fecha_acreditacion;
    if (!base) return [];
    const period = getPeriodDays(credito.tipo_credito);
    if (!period) return [base];

    const c1 = base;
    const c2 = addDaysStr(c1, period);
    const c3 = addDaysStr(c2, period);
    return [c1, c2, c3].filter(Boolean);
};

const parseYMD = (s) => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
};
const between = (dateStr, desde, hasta) => {
    if (!desde && !hasta) return true;
    const d = parseYMD(dateStr);
    if (!d) return false;
    if (desde && d < parseYMD(desde)) return false;
    if (hasta && d > parseYMD(hasta)) return false;
    return true;
};
const tieneCuotasVencidas = (c) =>
    Array.isArray(c?.cuotas) && c.cuotas.some((q) => safeLower(q?.estado) === "vencida");

/* === Listas de filtros (en minúscula para match visual) === */
const ESTADOS = ["pendiente", "parcial", "vencido", "pagado", "refinanciado", "anulado"];
const MODALIDADES = ["comun", "progresivo", "libre"];
const TIPOS = ["semanal", "quincenal", "mensual"];

// Modalidades que pueden refinanciarse (ajustá según negocio)
const MODALIDADES_REFINANCIABLES = ["comun", "progresivo", "libre"];


/* === Estilos por modalidad === */
const badgeByModalidad = (m) => {
    const mm = safeLower(m);
    if (mm === "libre") return "bg-emerald-100 text-emerald-700 border border-emerald-200";
    if (mm === "progresivo") return "bg-violet-100 text-violet-700 border-violet-200";
    return "bg-sky-100 text-sky-700 border-sky-200"; // comun
};
const leftBorderByModalidad = (m) => {
    const mm = safeLower(m);
    if (mm === "libre") return "border-l-4 border-emerald-500";
    if (mm === "progresivo") return "border-l-4 border-violet-500";
    return "border-l-4 border-sky-500"; // comun
};

/* ================== Helpers de impresión (Front) ================== */
const LIBRE_VTO_FICTICIO = "2099-12-31";

/**
 * TOTAL ACTUAL (Front) UNIFICADO
 * Para cada cuota NO pagada, suma: (importe + mora_neta) - pagado
 * donde mora_neta = max(mora_bruta - descuento_mora, 0).
 * En LIBRE, el descuento por cuota NO aplica (desc_mora = 0).
 */
const calcularTotalActualFront = (credito) => {
    if (!credito) return 0;
    let total = 0;
    for (const c of credito.cuotas || []) {
        const estado = String(c.estado || "").toLowerCase();
        if (!["pendiente", "parcial", "vencida"].includes(estado)) continue;

        const importe = Number(c.importe_cuota || 0);
        const pagado = Number(c.monto_pagado_acumulado || 0);
        const moraBruta = Number(c.intereses_vencidos_acumulados || 0);

        const esLibre = String(c.fecha_vencimiento) === LIBRE_VTO_FICTICIO;
        const descMora = esLibre ? 0 : Number(c.descuento_cuota || 0);
        const moraNeta = Math.max(moraBruta - descMora, 0);

        const saldo = Math.max(+((importe + moraNeta) - pagado).toFixed(2), 0);
        total = +(total + saldo).toFixed(2);
    }
    return total;
};

/** Utilidad: base URL del API (dev/prod) */
const getApiBaseUrl = () => {
    const env = (import.meta?.env?.VITE_API_URL || "").trim();
    if (env) return env.replace(/\/+$/, "");
    const isVite = window.location.port === "5173";
    const guess = isVite ? "http://localhost:3000/api" : `${window.location.origin}/api`;
    return guess.replace(/\/+$/, "");
};

/** DESCARGAR FICHA (PDF) 100% EN EL FRONT con jsPDF + autoTable (layout acomodado) */
const descargarFichaPDFFront = async (creditoId) => {
    const token = localStorage.getItem("token");
    const base = getApiBaseUrl();
    const url = `${base}/creditos/${creditoId}`;

    const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (!resp.ok) {
        let msg = `No se pudo obtener el crédito #${creditoId} (${resp.status})`;
        try {
            const data = await resp.json();
            if (data?.message) msg = data.message;
        } catch {
            /* noop */
        }
        throw new Error(msg);
    }

    const json = await resp.json();
    const credito = json?.data || json;
    if (!credito) throw new Error("Respuesta sin datos del crédito.");

    const c = credito;
    const cli = c.cliente || {};
    const cuotas = Array.isArray(c.cuotas) ? c.cuotas : [];
    const totalActual = Number(c.total_actual ?? calcularTotalActualFront(c));
    const fechaEmision = new Date().toISOString().slice(0, 10);

    // 🔹 Origen: venta financiada + detalle de producto (si viene del backend)
    const esVentaFinanciada = Boolean(
        c.origen_venta_manual_financiada ||
        c.venta_manual_id ||
        (c.ventaOrigen && (c.ventaOrigen.id || c.ventaOrigen.venta_manual_id))
    );

    const detalleProductoPDF =
        c.detalle_producto ||
        (c.ventaOrigen &&
            (c.ventaOrigen.detalle_producto ||
                c.ventaOrigen.descripcion ||
                c.ventaOrigen.producto)) ||
        null;

    // Tasa de refinanciación base (P1/P2/P3) — solo informativa / fallback
    const tasaRefiBase =
        c.tasa_refinanciacion !== null &&
            c.tasa_refinanciacion !== undefined &&
            c.tasa_refinanciacion !== ""
            ? Number(c.tasa_refinanciacion)
            : null;

    /**
     * Interés TOTAL aplicado sobre el crédito (no-LIBRE):
     * 1) Si el backend ya envió el total en c.interes, usamos ese valor (ej: 50%).
     * 2) Si no, lo calculamos con monto_acreditar / monto_total_devolver.
     * 3) Si tampoco se puede, caemos a la tasa de refi base (P1/P2/P3).
     */
    const interesTotalPct = (() => {
        const capital = Number(c.monto_acreditar || 0);
        const total = Number(c.monto_total_devolver || 0);

        // 1) Backend ya dejó el total en c.interes (caso refi: 50%, 75%, etc.)
        if (c.interes !== null && c.interes !== undefined && c.interes !== "") {
            return Number(c.interes);
        }

        // 2) Lo calculamos a partir de montos si es posible
        if (capital > 0 && total > capital) {
            const pct = ((total - capital) / capital) * 100;
            return +pct.toFixed(2);
        }

        // 3) Último recurso: usamos la tasa P1/P2/P3 base
        if (tasaRefiBase !== null) return tasaRefiBase;

        return 0;
    })();

    // Tasa visible para LIBRE (por ciclo)
    const tasaLibreFicha = Number(c.interes || 0);



    /* === Si es LIBRE, traemos el resumen del ciclo para mostrar KPIs detallados === */
    let resumenLibre = null;
    if (String(c.modalidad_credito).toLowerCase() === "libre") {
        try {
            resumenLibre = await obtenerResumenLibre(c.id);
        } catch {
            resumenLibre = null;
        }
    }

    /* === Documento === */
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN_X = 40;
    const TOP_GAP = 16;
    const BOTTOM_MARGIN = 40;
    let cursorY = TOP_GAP;

    // Encabezado con logo centrado (manteniendo proporción)
    try {
        const img = new Image();
        img.src = "/logosye.png";
        await new Promise((r) => {
            img.onload = () => r();
            img.onerror = () => r();
        });
        const MAX_W = 160;
        const MAX_H = 64;
        const scale = img.width && img.height ? Math.min(MAX_W / img.width, MAX_H / img.height, 1) : 1;
        const w = img.width ? img.width * scale : MAX_W;
        const h = img.height ? img.height * scale : MAX_H;
        const x = (PAGE_W - w) / 2;
        doc.addImage(img, "PNG", x, cursorY, w, h);
        cursorY += h + 10;
    } catch { }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Ficha de Crédito", MARGIN_X, cursorY + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Emitido: ${fechaEmision}`, PAGE_W - MARGIN_X, cursorY + 6, { align: "right" });

    doc.setDrawColor(225);
    doc.line(MARGIN_X, cursorY + 18, PAGE_W - MARGIN_X, cursorY + 18);
    cursorY += 30;

    // Cliente
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Cliente", MARGIN_X, cursorY);
    cursorY += 8;

    const nombreCompleto =
        [cli.nombre, cli.apellido].filter(Boolean).join(" ") || "-";

    // ✅ Teléfonos según modelo actual (y dejamos compatibilidad con *_1 / *_2 por si vienen)
    const clienteTelefonos =
        [
            cli.telefono,
            cli.telefono_secundario,
            cli.telefono_1,
            cli.telefono_2
        ]
            .filter(Boolean)
            .join(" / ") || "-";

    // ✅ Direcciones + localidad/provincia
    const direccionPrincipal =
        [
            cli.direccion,
            cli.localidad,
            cli.provincia
        ].filter(Boolean).join(" - ") || null;

    const direccionSecundaria =
        [
            cli.direccion_secundaria,
            cli.localidad,
            cli.provincia
        ].filter(Boolean).join(" - ") || null;

    const refPrincipal = cli.referencia_direccion || null;
    const refSecundaria = cli.referencia_secundaria || null;

    // ✅ Observaciones del cliente según modelo
    const clienteObservaciones = cli.observaciones || null;

    let clienteRows = [
        ["Nombre", nombreCompleto],
        ["DNI", cli.dni || "-"],
        ["Teléfono(s)", clienteTelefonos]
    ];

    if (direccionPrincipal) {
        clienteRows.push(["Dirección principal", direccionPrincipal]);
    }

    if (direccionSecundaria) {
        clienteRows.push(["Dirección secundaria", direccionSecundaria]);
    }

    if (refPrincipal) {
        clienteRows.push(["Referencia dirección principal", refPrincipal]);
    }

    if (refSecundaria) {
        clienteRows.push(["Referencia dirección secundaria", refSecundaria]);
    }

    if (clienteObservaciones) {
        clienteRows.push(["Observaciones", String(clienteObservaciones)]);
    }

    autoTable(doc, {
        startY: cursorY,
        theme: "plain",
        styles: { fontSize: 10, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 } },
        columnStyles: {
            0: { cellWidth: 160, fontStyle: "bold", textColor: [71, 85, 105] }
        },
        body: clienteRows.map((r) => [{ content: r[0] }, { content: r[1] }]),
        margin: { left: MARGIN_X, right: MARGIN_X }
    });
    cursorY = doc.lastAutoTable.finalY + 14;


    // Crédito
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Crédito", MARGIN_X, cursorY);
    cursorY += 8;

    const vtosValidos = (Array.isArray(c.cuotas) ? c.cuotas : [])
        .map((ct) => ct.fecha_vencimiento)
        .filter((f) => f && f !== LIBRE_VTO_FICTICIO)
        .sort();
    const primerVto = vtosValidos[0] || (c.fecha_compromiso_pago || "-");
    const ultimoVto = vtosValidos.length ? vtosValidos[vtosValidos.length - 1] : "-";
    const fechasCiclos = fechasCiclosLibre(c);


    let creditoRows = [
        ["ID", c.id ?? "-"],
        ["Estado", String(c.estado || "").toUpperCase()],
        [
            "Modalidad",
            safeLower(c.modalidad_credito) === "comun"
                ? "PLAN DE CUOTAS FIJAS"
                : String(c.modalidad_credito || "").toUpperCase()
        ],
        ["Tipo", String(c.tipo_credito || "").toUpperCase()],
        ["Cuotas", c.cantidad_cuotas ?? "-"],
        ["Solicitud", c.fecha_solicitud || "-"],
        ["Acreditación", c.fecha_acreditacion || "-"],
        ["1er vencimiento", primerVto],
        ["Fecha de fin de crédito", ultimoVto],
        ["Cobrador", c.cobradorCredito?.nombre_completo || "-"]
    ];
    // 🔹 Insertar info de origen y detalle de producto si corresponde
    if (esVentaFinanciada) {
        creditoRows.splice(3, 0, [
            "Origen del crédito",
            "Venta financiada (generado desde venta manual)"
        ]);
    }

    if (esVentaFinanciada && detalleProductoPDF) {
        creditoRows.push(["Detalle del producto", detalleProductoPDF]);
    }


    // ── Fechas de vencimiento por ciclo para LIBRE
    if (safeLower(c.modalidad_credito) === "libre") {
        creditoRows.push(
            ["Vencimiento ciclo 1", fechasCiclos[0] || "-"],
            ["Vencimiento ciclo 2", fechasCiclos[1] || "-"],
            ["Vencimiento ciclo 3", fechasCiclos[2] || "-"]
        );
    }

    autoTable(doc, {
        startY: cursorY,
        theme: "plain",
        styles: { fontSize: 10, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 } },
        columnStyles: { 0: { cellWidth: 160, fontStyle: "bold", textColor: [71, 85, 105] } },
        body: creditoRows.map((r) => [{ content: r[0] }, { content: r[1] }]),
        margin: { left: MARGIN_X, right: MARGIN_X }
    });
    cursorY = doc.lastAutoTable.finalY + 8;

    // KPIs
    if (resumenLibre) {
        autoTable(doc, {
            startY: cursorY,
            head: [["Concepto", "Importe"]],
            body: [
                ["Capital (hoy)", `$ ${money(resumenLibre.saldo_capital)}`],
                ["Interés de ciclo (hoy)", `$ ${money(resumenLibre.interes_pendiente_hoy)}`],
                ["Mora (hoy)", `$ ${money(resumenLibre.mora_pendiente_hoy)}`],
                ["Total liquidación (hoy)", `$ ${money(resumenLibre.total_liquidacion_hoy)}`]
            ],
            styles: { fontSize: 10 },
            headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81] },
            columnStyles: { 0: { cellWidth: 260, fontStyle: "bold" }, 1: { halign: "right" } },
            tableWidth: 420,
            margin: { left: MARGIN_X }
        });
    } else {
        const totMoraAll = +(
            (Array.isArray(c.cuotas) ? c.cuotas : []).reduce(
                (acc, ct) => acc + (Number(ct?.intereses_vencidos_acumulados) || 0),
                0
            ).toFixed(2)
        );

        autoTable(doc, {
            startY: cursorY,
            head: [["Concepto", "Importe"]],
            body: [
                ["Saldo actual declarado", `$ ${money(c.saldo_actual)}`],
                ["Total de mora", `$ ${money(totMoraAll)}`],
                ["TOTAL ACTUAL", `$ ${money(totalActual)}`]
            ],
            styles: { fontSize: 10 },
            headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81] },
            columnStyles: { 0: { cellWidth: 260, fontStyle: "bold" }, 1: { halign: "right" } },
            tableWidth: 420,
            margin: { left: MARGIN_X }
        });
    }
    cursorY = (doc.lastAutoTable?.finalY || cursorY) + 14;

    // Tabla de cuotas (saldo usa descuento SOLO sobre mora)
    const rows = [];
    for (const ct of cuotas) {
        const importe = Number(ct.importe_cuota || 0);
        const pagado = Number(ct.monto_pagado_acumulado || 0);
        const moraBruta = Number(ct.intereses_vencidos_acumulados || 0);

        const esLibreCt = String(ct.fecha_vencimiento) === LIBRE_VTO_FICTICIO;
        const descMora = esLibreCt ? 0 : Number(ct.descuento_cuota || 0);

        // 👉 Mora neta (como en CuotasTabla)
        const moraNeta = Math.max(moraBruta - descMora, 0);

        // Saldo calculado con mora neta
        const saldo = Math.max(+((importe + moraNeta) - pagado).toFixed(2), 0);
        const vto = esLibreCt ? "—" : (ct.fecha_vencimiento || "-");

        const estadoStr = String(ct.estado || "").toUpperCase();

        // 👉 Días de retraso: solo si está vencida y NO es LIBRE
        let diasRetraso = 0;
        if (!esLibreCt && ct.fecha_vencimiento && estadoStr.toLowerCase() === "vencida") {
            diasRetraso = Math.max(
                diffDays(new Date(), ct.fecha_vencimiento),
                0
            );
        }

        rows.push([
            `#${ct.numero_cuota}`,
            vto,
            `$${money(importe)}`,
            `$${money(pagado)}`,
            `$${money(descMora)}`,
            `$${money(moraNeta)}`,    // 👈 Mora neta
            String(diasRetraso),      // 👈 Días de retraso
            `$${money(saldo)}`,
            estadoStr
        ]);
    }

    autoTable(doc, {
        startY: cursorY,
        head: [["#", "Vencimiento", "Importe", "Pagado", "Desc. mora", "Mora neta", "Días de retraso", "Saldo", "Estado"]],
        body: rows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [240, 240, 240], textColor: [30, 30, 30] },
        columnStyles: {
            0: { halign: "left" },
            1: { halign: "left" },
            2: { halign: "right" },
            3: { halign: "right" },
            4: { halign: "right" },
            5: { halign: "right" },
            6: { halign: "right" },
            7: { halign: "right" },
            8: { halign: "left" }
        },
        margin: { left: MARGIN_X, right: MARGIN_X },
        tableWidth: PAGE_W - 2 * MARGIN_X
    });

    let noteY = (doc.lastAutoTable?.finalY || cursorY) + 12;
    if (noteY + 24 > PAGE_H - BOTTOM_MARGIN) {
        doc.addPage();
        noteY = TOP_GAP;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
        "Nota: Esta ficha es informativa. Los importes pueden variar según pagos registrados y recálculos de mora.",
        MARGIN_X,
        noteY
    );

    doc.save(`ficha-credito-${c.id}.pdf`);
};

/* ───────────────── Modal de Pago para Créditos LIBRE ───────────────── */
const PagoLibreModal = ({
    open,
    onClose,
    credito,
    cuotaLibreId,
    modoInicial = "parcial",
    onSuccess,
    resumenLibre
}) => {
    const navigate = useNavigate();

    // Permisos (desde token)
    const token = localStorage.getItem("token");
    const decoded = token ? jwtDecode(token) : {};
    const rol_id = decoded?.rol_id ?? null;

    const esSuperAdmin = rol_id === 0;
    const esAdmin = rol_id === 1;
    const puedeImpactarPagos = esSuperAdmin || esAdmin; // solo superadmin/admin
    const puedeDescontar = esSuperAdmin;                // descuentos solo superadmin

    const [modo, setModo] = useState(modoInicial); // 'parcial' | 'total'
    const [formas, setFormas] = useState([]);
    const [loadingFormas, setLoadingFormas] = useState(false);

    const [formaPagoId, setFormaPagoId] = useState("");
    const [monto, setMonto] = useState(""); // solo en parcial
    const [descuento, setDescuento] = useState(""); // % solo en total
    const [observacion, setObservacion] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // Datos base desde resumenLibre (coinciden con el recibo)
    const capitalHoy = Number(resumenLibre?.saldo_capital ?? credito?.saldo_actual ?? 0);
    const interesHoy = Number(resumenLibre?.interes_pendiente_hoy ?? 0);
    const moraHoy = Number(resumenLibre?.mora_pendiente_hoy ?? 0);
    const totalLiquidacionHoy = Number(
        resumenLibre?.total_liquidacion_hoy ?? capitalHoy + interesHoy + moraHoy
    );

    // === Preview dinámico de descuento sobre mora (solo modo "total") ===
    const descuentoRaw = Number(String(descuento).replace(",", ".")) || 0;
    const descuentoPct = puedeDescontar
        ? Math.min(100, Math.max(0, descuentoRaw))
        : 0; // si no es superadmin, siempre 0
    const descuentoMoraPesos = (moraHoy * descuentoPct) / 100;
    const totalConDescuento = capitalHoy + interesHoy + (moraHoy - descuentoMoraPesos);

    // ── Helpers de navegación/recibo (locales al modal)
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const numeroDesdeResponse = (resp) =>
        resp?.numero_recibo ??
        resp?.data?.numero_recibo ??
        resp?.recibo?.numero_recibo ??
        resp?.data?.recibo?.numero_recibo ??
        null;
    const ordenarRecibos = (lista = []) =>
        [...lista].sort((a, b) => {
            const na = Number(a?.numero_recibo || 0);
            const nb = Number(b?.numero_recibo || 0);
            if (nb !== na) return nb - na;
            const fa = `${a?.fecha || ""} ${a?.hora || ""}`;
            const fb = `${b?.fecha || ""} ${b?.hora || ""}`;
            return fb.localeCompare(fa);
        });
    const buscarUltimoReciboConPolling = async (creditoId, intentos = 3, delayMs = 600) => {
        for (let i = 0; i < intentos; i++) {
            try {
                const lista = await obtenerRecibosPorCredito(creditoId);
                if (Array.isArray(lista) && lista.length > 0) {
                    const ult = ordenarRecibos(lista)[0];
                    if (ult?.numero_recibo) return ult.numero_recibo;
                }
            } catch {
                /* noop */
            }
            await sleep(delayMs);
        }
        return null;
    };
    const goReciboRobusto = async (numero) => {
        if (!numero) return false;
        try {
            sessionStorage.setItem("last_recibo", String(numero));
        } catch { }
        let ok = false;
        try {
            navigate(`/recibo/${encodeURIComponent(numero)}`, { replace: true });
            ok = true;
        } catch {
            ok = false;
        }
        await sleep(0);
        if (ok) {
            setTimeout(() => {
                if (!/\/recibo\/.+$/.test(window.location.pathname)) {
                    window.location.assign(`/recibo/${encodeURIComponent(numero)}`);
                }
            }, 80);
            return true;
        }
        window.location.assign(`/recibo/${encodeURIComponent(numero)}`);
        return true;
    };

    const ciclo = cicloActualDesde(credito?.fecha_acreditacion, credito?.tipo_credito);
    const parcialBloqueado = ciclo >= 3; // 3er mes => sin abonos parciales

    useEffect(() => {
        if (!open) return;
        setLoadingFormas(true);
        setError(null);
        obtenerFormasDePago()
            .then((data) => setFormas(Array.isArray(data) ? data : []))
            .catch((e) => setError(e?.message || "Error al cargar formas de pago"))
            .finally(() => setLoadingFormas(false));
    }, [open]);

    useEffect(() => {
        if (open) {
            setModo(parcialBloqueado ? "total" : modoInicial);
            setFormaPagoId("");
            setMonto("");
            setDescuento("");
            setObservacion("");
            setError(null);
            setSaving(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, credito?.id, cuotaLibreId, modoInicial, parcialBloqueado]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!cuotaLibreId || !formaPagoId) {
            setError("Seleccioná una forma de pago.");
            return;
        }

        try {
            setSaving(true);
            setError(null);

            let resp = null;
            let resumenAccion = "";

            if (modo === "parcial") {
                if (parcialBloqueado) {
                    setError(
                        "En el 3er mes del crédito LIBRE no se permite abono parcial. Debe realizar pago total."
                    );
                    setSaving(false);
                    return;
                }
                const montoNum = Number(String(monto).replace(",", ".")) || 0;
                if (montoNum <= 0) {
                    setError("Ingresá un monto válido.");
                    setSaving(false);
                    return;
                }

                resumenAccion = `Abono parcial de $${money(montoNum)} sobre el crédito LIBRE #${credito?.id
                    }.\n`;

                const result = await Swal.fire({
                    title: "Confirmar pago",
                    html: `<p style="margin-bottom:6px;">${resumenAccion}</p>
                            <p style="font-size:12px;color:#555;">Forma de pago: ${(formas.find((f) => String(f.id) === String(formaPagoId)) || {})
                            .nombre || ""
                        }</p>`,
                    icon: "question",
                    showCancelButton: true,
                    confirmButtonText: "Sí, confirmar",
                    cancelButtonText: "Cancelar",
                    reverseButtons: true
                });

                if (!result.isConfirmed) {
                    setSaving(false);
                    return;
                }

                resp = await registrarPagoParcial({
                    cuota_id: cuotaLibreId,
                    monto_pagado: montoNum,
                    forma_pago_id: Number(formaPagoId),
                    observacion: observacion || null
                });
            } else {
                // Solo el superadmin puede aplicar descuentos; para el resto siempre 0
                const descBase =
                    descuento === ""
                        ? 0
                        : Number(String(descuento).replace(",", ".")) || 0;
                const desc = puedeDescontar ? descBase : 0;

                if (puedeDescontar && (desc < 0 || desc > 100)) {
                    setError("El descuento debe ser un porcentaje entre 0 y 100.");
                    setSaving(false);
                    return;
                }

                // Validación: no permitir descuento si no hay mora (solo relevante si hay desc > 0)
                if (puedeDescontar && moraHoy <= 0 && desc > 0) {
                    setError("No hay mora generada para aplicar descuento.");
                    setSaving(false);
                    return;
                }

                const descuentoPesos = (moraHoy * desc) / 100;
                const totalConDesc = totalLiquidacionHoy - descuentoPesos;

                resumenAccion = `Liquidación total del crédito LIBRE #${credito?.id}.\n
Capital (hoy): $${money(capitalHoy)}
Interés de ciclo (hoy): $${money(interesHoy)}
Mora (hoy): $${money(moraHoy)}
Total liquidación (hoy): $${money(totalLiquidacionHoy)}
Descuento sobre mora: ${desc}% ($${money(descuentoPesos)})
Total a pagar con descuento: $${money(totalConDesc)}.`;

                const result = await Swal.fire({
                    title: "Confirmar liquidación",
                    html: `<p style="white-space:pre-line;font-size:13px;text-align:left;">${resumenAccion}</p>
                           <p style="font-size:12px;color:#555;margin-top:6px;">Forma de pago: ${(formas.find((f) => String(f.id) === String(formaPagoId)) || {})
                            .nombre || ""
                        }</p>`,
                    icon: "question",
                    showCancelButton: true,
                    confirmButtonText: "Sí, confirmar",
                    cancelButtonText: "Cancelar",
                    reverseButtons: true
                });

                if (!result.isConfirmed) {
                    setSaving(false);
                    return;
                }

                resp = await pagarCuota({
                    cuotaId: cuotaLibreId,
                    forma_pago_id: Number(formaPagoId),
                    observacion: observacion || null,
                    // el backend igual valida, pero enviamos ya el valor según permisos
                    descuento: desc
                });
            }


            // Navegación al recibo (LIBRE) — detecta directo o con polling
            let numero = numeroDesdeResponse(resp);
            if (!numero) {
                numero = await buscarUltimoReciboConPolling(credito.id, 3, 600);
            }

            const creditoId = credito?.id ?? null;

            if (numero) {
                await goReciboRobusto(numero);
            }

            // Avisamos al padre para refrescar datos y cerrar modal
            onSuccess?.(creditoId);
        } catch (e) {
            setError(e?.message || "No se pudo registrar el pago.");
        } finally {
            setSaving(false);
        }
    };
    // Usuarios sin permiso para impactar pagos no ven el modal
    if (!puedeImpactarPagos) return null;

    if (!open) return null;

    return (
        <section className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
            <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
                <header className="flex items-center justify-between border-b px-5 py-4">
                    <h4 className="text-base sm:text-lg font-semibold">
                        Crédito LIBRE #{credito?.id} —{" "}
                        {modo === "parcial" ? "Abono parcial" : "Liquidación total"} (ciclo {ciclo}/3)
                    </h4>
                    <button
                        onClick={onClose}
                        className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                    >
                        Cerrar
                    </button>
                </header>

                <div className="flex-1 min-h-0 px-5 py-4 space-y-4 overflow-y-auto">
                    <div className="flex items-center justify-between gap-2 text-sm text-gray-700">
                        <div className="space-y-1">
                            <div>
                                <span className="font-medium">Capital (hoy):</span>{" "}
                                ${money(capitalHoy)}
                            </div>
                            <div>
                                <span className="font-medium">Interés de ciclo (hoy):</span>{" "}
                                ${money(interesHoy)}
                            </div>
                            <div>
                                <span className="font-medium">Mora (hoy):</span> $
                                {money(moraHoy)}
                            </div>
                            <div>
                                <span className="font-medium">Total liquidación (hoy):</span>{" "}
                                <span className="font-semibold">
                                    ${money(totalLiquidacionHoy)}
                                </span>
                            </div>

                            {modo === "total" && (
                                <>
                                    <div>
                                        <span className="font-medium">
                                            Descuento aplicado sobre mora:
                                        </span>{" "}
                                        {descuentoPct > 0 ? (
                                            <>
                                                {descuentoPct}% → $
                                                {money(descuentoMoraPesos)}
                                            </>
                                        ) : (
                                            "Sin descuento"
                                        )}
                                    </div>
                                    <div>
                                        <span className="font-medium">
                                            Total a pagar con descuento:
                                        </span>{" "}
                                        <span className="font-semibold">
                                            ${money(totalConDescuento)}
                                        </span>
                                    </div>
                                </>
                            )}

                            <div>
                                <span className="font-medium">Periodicidad:</span>{" "}
                                {credito?.tipo_credito}
                            </div>
                            <div>
                                <span className="font-medium">Tasa por ciclo:</span>{" "}
                                {credito?.interes}%
                            </div>
                        </div>
                        <div className="flex rounded-md bg-gray-100 p-1">
                            <button
                                className={`px-3 py-1 rounded-md text-sm ${modo === "parcial"
                                    ? "bg-white shadow"
                                    : "opacity-70 hover:opacity-100"
                                    }`}
                                onClick={() => !parcialBloqueado && setModo("parcial")}
                                disabled={parcialBloqueado}
                                title={
                                    parcialBloqueado
                                        ? "En el 3er mes no se permite abono parcial"
                                        : "Abono parcial"
                                }
                            >
                                Parcial
                            </button>
                            <button
                                className={`px-3 py-1 rounded-md text-sm ${modo === "total"
                                    ? "bg-white shadow"
                                    : "opacity-70 hover:opacity-100"
                                    }`}
                                onClick={() => setModo("total")}
                            >
                                Total
                            </button>
                        </div>
                    </div>

                    <div className="rounded-lg border p-3 bg-gray-50 text-xs text-gray-700">
                        <b>LIBRE:</b> sin vencimientos fijos. El interés es por ciclo sobre el capital y
                        la <b>mora</b> se calcula al <b>2,5% diario del interés del ciclo</b>. Máximo 3 meses;
                        en el 3er mes no se permiten abonos parciales.
                    </div>

                    {parcialBloqueado && (
                        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Estás en el <b>3er mes</b> del crédito LIBRE. Solo se permite{" "}
                            <b>pago total</b>.
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {modo === "parcial" ? (
                                <label className="text-sm">
                                    <span className="block text-gray-600 mb-1">Monto a abonar</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="w-full rounded-md border px-3 py-2"
                                        value={monto}
                                        onChange={(e) => setMonto(e.target.value)}
                                        placeholder="0,00"
                                        required
                                        disabled={parcialBloqueado}
                                    />
                                </label>
                            ) : puedeDescontar ? (
                                <label className="text-sm">
                                    <span className="block text-gray-600 mb-1">Descuento (%)</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        className="w-full rounded-md border px-3 py-2"
                                        value={descuento}
                                        onChange={(e) => setDescuento(e.target.value)}
                                        placeholder="0"
                                    />
                                </label>
                            ) : (
                                <div className="text-xs text-gray-600 self-end">
                                    <span className="block font-medium mb-1">Descuento (%)</span>
                                    <span>0% (solo el superadmin puede aplicar descuentos sobre mora).</span>
                                </div>
                            )}

                            <label className="text-sm">
                                <span className="block text-gray-600 mb-1">Forma de pago</span>
                                <select
                                    className="w-full rounded-md border px-3 py-2 bg-white"
                                    value={formaPagoId}
                                    onChange={(e) => setFormaPagoId(e.target.value)}
                                    required
                                    disabled={loadingFormas}
                                >
                                    <option value="">
                                        {loadingFormas ? "Cargando..." : "Seleccioná una forma de pago"}
                                    </option>
                                    {formas.map((f) => (
                                        <option key={f.id} value={f.id}>
                                            {f.nombre}
                                        </option>
                                    ))}
                                </select>
                            </label>

                        </div>


                        <label className="text-sm block">
                            <span className="block text-gray-600 mb-1">
                                Observación (opcional)
                            </span>
                            <textarea
                                className="w-full rounded-md border px-3 py-2"
                                rows={2}
                                value={observacion}
                                onChange={(e) => setObservacion(e.target.value)}
                                placeholder={
                                    modo === "parcial"
                                        ? "Abono parcial"
                                        : "Liquidación del crédito"
                                }
                            />
                        </label>

                        {error && <div className="text-sm text-red-600">{error}</div>}

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={onClose}
                                disabled={saving}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                                disabled={saving}
                            >
                                {saving
                                    ? "Procesando…"
                                    : modo === "parcial"
                                        ? "Registrar abono"
                                        : "Liquidar crédito"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    );
};
/* ───────────────────────────────────────────────────────────────────── */

/* ───────────────── Modal de Refinanciación ───────────────── */
const RefinanciarCreditoModal = ({
    open,
    onClose,
    credito,
    onSuccess,
    esSuperAdmin,
    resumenLibre
}) => {
    const [opcion, setOpcion] = useState("P1"); // 'P1' | 'P2' | 'manual'
    const [tasaManual, setTasaManual] = useState("");
    const [tipo, setTipo] = useState(credito?.tipo_credito || "mensual");
    const [cuotas, setCuotas] = useState(credito?.cantidad_cuotas || 1);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const puedeUsarManual = !!esSuperAdmin;

    // ¿Es un crédito LIBRE?
    const esLibreRefi = safeLower(credito?.modalidad_credito) === "libre";

    // Mora acumulada a partir de cuotas (para no libres o fallback)
    const moraAcumuladaCuotas = (() => {
        if (!Array.isArray(credito?.cuotas)) return 0;
        return +(
            credito.cuotas.reduce(
                (acc, q) => acc + (Number(q.intereses_vencidos_acumulados || 0) || 0),
                0
            ).toFixed(2)
        );
    })();

    // Capital base desde el crédito
    const capitalBaseCuotas = Number(credito?.saldo_actual || 0);

    // Para LIBRE usamos el resumenLibre si viene; si no, caemos al cálculo por cuotas
    const capitalRefi = esLibreRefi
        ? Number(resumenLibre?.saldo_capital ?? capitalBaseCuotas)
        : capitalBaseCuotas;

    const interesRefi = esLibreRefi
        ? Number(resumenLibre?.interes_pendiente_hoy ?? 0)
        : 0;

    const moraRefi = esLibreRefi
        ? Number(resumenLibre?.mora_pendiente_hoy ?? moraAcumuladaCuotas)
        : moraAcumuladaCuotas;

    // Saldo base de refinanciación:
    // - LIBRE: total_liquidacion_hoy (capital + interés ciclo + mora)
    // - Resto: capital + mora acumulada (como antes)
    const saldoBaseRefi = esLibreRefi
        ? Number(
            resumenLibre?.total_liquidacion_hoy ??
            capitalRefi + interesRefi + moraRefi
        )
        : +(capitalRefi + moraRefi).toFixed(2);

    if (!open) return null;


    const preview = (() => {
        try {
            return previewRefinanciacion({
                saldo: saldoBaseRefi,
                opcion,
                tasaManual,
                tipo_credito: tipo,
                cantidad_cuotas: cuotas
            });
        } catch {
            return null;
        }
    })();

    const submitRefi = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setError(null);

            if (opcion === "manual" && !puedeUsarManual) {
                setError("No tenés permisos para utilizar la opción de tasa manual (P3).");
                setSaving(false);
                return;
            }

            if (opcion === "manual") {
                const t = Number(String(tasaManual).replace(",", ".")) || 0;
                if (t < 0) {
                    setError("La tasa manual debe ser ≥ 0");
                    setSaving(false);
                    return;
                }
            }

            // ⬇️ Ejecutamos la refinanciación contra el backend
            await refinanciarCreditoSeguro(credito, {
                opcion,
                tasaManual:
                    opcion === "manual"
                        ? Number(String(tasaManual).replace(",", "."))
                        : undefined,
                tipo_credito: tipo,
                cantidad_cuotas: Number(cuotas)
            });

            // ⬇️ SweetAlert de éxito (mensaje claro para el usuario)
            await Swal.fire({
                title: "Crédito refinanciado",
                html: `<p style="margin-bottom:4px;">El crédito #${credito?.id} fue refinanciado correctamente.</p>
                        <p style="font-size:12px;color:#555;">Se creó un nuevo crédito en <b>PLAN DE CUOTAS FIJAS</b> con las condiciones seleccionadas.</p>`,
                icon: "success",
                confirmButtonText: "Aceptar"
            });

            onSuccess?.();
            onClose?.();
        } catch (e) {
            // El backend ya envía mensajes como:
            // "Este crédito ya fue refinanciado y no puede volver a refinanciarse."
            setError(e?.message || "No se pudo refinanciar el crédito.");
        } finally {
            setSaving(false);
        }
    };


    return (
        <section className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4">
            <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl">
                <header className="flex items-center justify-between border-b px-5 py-4">
                    <h4 className="text-base sm:text-lg font-semibold">
                        Refinanciar crédito #{credito?.id}
                    </h4>
                    <button
                        onClick={onClose}
                        className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                    >
                        Cerrar
                    </button>
                </header>

                <form onSubmit={submitRefi} className="px-5 py-4 space-y-4">
                    {/* Preview */}
                    <div className="text-sm text-gray-700">
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-2">
                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">
                                    {esLibreRefi ? "Capital (LIBRE hoy)" : "Capital"}
                                </div>
                                <div className="font-semibold">${money(capitalRefi)}</div>
                            </div>
                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">
                                    {esLibreRefi ? "Mora (hoy)" : "Mora acumulada"}
                                </div>
                                <div className="font-semibold">${money(moraRefi)}</div>
                            </div>
                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">Saldo base refi</div>
                                <div className="font-semibold">${money(saldoBaseRefi)}</div>
                            </div>
                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">Tasa mensual</div>
                                <div className="font-semibold">
                                    {preview ? `${preview.tasa_mensual}%` : "—"}
                                </div>
                            </div>
                            <div className="rounded border bg-gray-50 p-2">
                                <div className="text-gray-500">Monto nuevo</div>
                                <div className="font-semibold">
                                    ${money(preview?.total_a_devolver || 0)}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                            Se creará un <b>nuevo crédito (PLAN DE CUOTAS FIJAS)</b> con estas
                            condiciones y el crédito #{credito?.id} quedará marcado como{" "}
                            <b>refinanciado</b>.
                        </div>
                    </div>

                    <fieldset className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label
                            className={`flex items-center gap-2 rounded-md border p-3 ${opcion === "P1"
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-gray-200"
                                }`}
                        >
                            <input
                                type="radio"
                                name="opcion"
                                className="accent-emerald-600"
                                checked={opcion === "P1"}
                                onChange={() => setOpcion("P1")}
                            />
                            <span className="text-sm font-medium">P1 (25% mensual)</span>
                        </label>
                        <label
                            className={`flex items-center gap-2 rounded-md border p-3 ${opcion === "P2"
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-gray-200"
                                }`}
                        >
                            <input
                                type="radio"
                                name="opcion"
                                className="accent-emerald-600"
                                checked={opcion === "P2"}
                                onChange={() => setOpcion("P2")}
                            />
                            <span className="text-sm font-medium">P2 (15% mensual)</span>
                        </label>
                        {puedeUsarManual && (
                            <label
                                className={`flex items-center gap-2 rounded-md border p-3 ${opcion === "manual"
                                    ? "border-emerald-500 bg-emerald-50"
                                    : "border-gray-200"
                                    }`}
                            >
                                <input
                                    type="radio"
                                    name="opcion"
                                    className="accent-emerald-600"
                                    checked={opcion === "manual"}
                                    onChange={() => setOpcion("manual")}
                                />
                                <span className="text-sm font-medium">P3 Manual (% mensual)</span>
                            </label>
                        )}

                    </fieldset>

                    {opcion === "manual" && puedeUsarManual && (
                        <label className="block text-sm">
                            <span className="block text-gray-600 mb-1">
                                Tasa manual (% mensual)
                            </span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-full rounded-md border px-3 py-2"
                                value={tasaManual}
                                onChange={(e) => setTasaManual(e.target.value)}
                                placeholder="Ej: 10"
                                required
                            />
                        </label>
                    )}


                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block text-sm">
                            <span className="block text-gray-600 mb-1">
                                Periodicidad del nuevo crédito
                            </span>
                            <select
                                className="w-full rounded-md border px-3 py-2 bg-white"
                                value={tipo}
                                onChange={(e) => setTipo(e.target.value)}
                                required
                            >
                                <option value="mensual">mensual</option>
                                <option value="semanal">semanal</option>
                                <option value="quincenal">quincenal</option>
                            </select>
                        </label>

                        <label className="block text-sm">
                            <span className="block text-gray-600 mb-1">
                                Cantidad de cuotas
                            </span>
                            <input
                                type="number"
                                min="1"
                                className="w-full rounded-md border px-3 py-2"
                                value={cuotas}
                                onChange={(e) => setCuotas(e.target.value)}
                                required
                            />
                        </label>
                    </div>

                    {/* Cuota estimada */}
                    <div className="text-xs text-gray-700">
                        {preview && (
                            <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="rounded bg-gray-50 border p-2">
                                    <div className="text-gray-600">Tasa por período</div>
                                    <div className="font-semibold">
                                        {preview.tasa_por_periodo}%
                                    </div>
                                </div>
                                <div className="rounded bg-gray-50 border p-2">
                                    <div className="text-gray-600">Cuotas</div>
                                    <div className="font-semibold">
                                        {preview.cantidad_cuotas}
                                    </div>
                                </div>
                                <div className="rounded bg-gray-50 border p-2">
                                    <div className="text-gray-600">Cuota estimada</div>
                                    <div className="font-semibold">
                                        ${money(preview.cuota_estimada)}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {error && <div className="text-sm text-red-600">{error}</div>}

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                            onClick={onClose}
                            disabled={saving}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                            disabled={saving}
                        >
                            {saving ? "Procesando…" : "Refinanciar crédito"}
                        </button>
                    </div>
                </form>
            </div>
        </section>
    );
};
/* ─────────────────────────────────────────────────────────── */

const InfoCreditos = ({ creditos = [], refetchCreditos }) => {
    const [abierto, setAbierto] = useState(null);

    // Rol y permisos
    const token = localStorage.getItem("token");
    const decoded = token ? jwtDecode(token) : {};
    const rol_id = decoded?.rol_id ?? null;

    const esSuperAdmin = rol_id === 0;
    const esAdmin = rol_id === 1;
    const esCobrador = rol_id === 2;

    // Permisos derivados
    const puedeCancelar = esSuperAdmin || esAdmin;          // cancelar crédito
    const puedeVerCreditos = esSuperAdmin || esAdmin;       // visualización de créditos
    const puedeImpactarPagos = esSuperAdmin || esAdmin;     // impactar pagos
    const puedeDescontar = esSuperAdmin;                    // descuentos
    const puedeRefiP3Manual = esSuperAdmin;                 // refinanciación P3 manual

    // Restricción: el cobrador NO puede ver créditos
    if (!puedeVerCreditos) {
        return (
            <section className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600 shadow-sm">
                <p>No tenés permisos para visualizar los créditos de este cliente.</p>
            </section>
        );
    }

    // ===== Filtros de historial =====
    const initialFiltros = {
        estado: "",
        modalidad: "",
        tipo: "",
        desde: "",
        hasta: "",
        soloVencidas: false
    };
    const [filtros, setFiltros] = useState(initialFiltros);
    const [filtrosAplicados, setFiltrosAplicados] = useState(null); // snapshot de filtros aplicados
    const [aplicando, setAplicando] = useState(false);

    // Lista visible
    const [lista, setLista] = useState(Array.isArray(creditos) ? creditos : []);

    // Reemplaza en lista el crédito refrescado desde backend
    const refreshCreditoEnLista = async (id) => {
        try {
            const resp = await obtenerCreditoPorId(id);
            const fresh = resp?.data ?? resp; // ← normaliza apiFetch (data directa o anidada)
            if (!fresh) return;
            setLista((prev) => prev.map((c) => (c.id === id ? fresh : c)));
        } catch (e) {
            console.error("No se pudo refrescar crédito", id, e);
        }
    };

    // Filtrado local (puede reutilizar snapshot)
    const filtrarLocal = (base, fx = filtros) => {
        const est = safeLower(fx.estado);
        const mod = safeLower(fx.modalidad);
        const tip = safeLower(fx.tipo);
        const d = fx.desde || null;
        const h = fx.hasta || null;
        const soloV = Boolean(fx.soloVencidas);

        return (base || []).filter((c) => {
            if (est && safeLower(c?.estado) !== est) return false;
            if (mod && safeLower(c?.modalidad_credito) !== mod) return false;
            if (tip && safeLower(c?.tipo_credito) !== tip) return false;

            const fechaBase = c?.fecha_solicitud || c?.fecha_acreditacion;
            if (!between(fechaBase, d, h)) return false;

            if (soloV && !tieneCuotasVencidas(c)) return false;

            return true;
        });
    };

    // Sincroniza lista con props respetando filtros aplicados
    useEffect(() => {
        const base = Array.isArray(creditos) ? creditos : [];
        if (filtrosAplicados) {
            setLista(filtrarLocal(base, filtrosAplicados));
        } else {
            setLista(base);
        }
    }, [creditos, filtrosAplicados]); // eslint-disable-line

    const aplicarFiltros = () => {
        setAplicando(true);
        setAbierto(null);
        try {
            setFiltrosAplicados({ ...filtros });
            const base = Array.isArray(creditos) ? creditos : [];
            setLista(filtrarLocal(base, filtros));
        } finally {
            setAplicando(false);
        }
    };

    const limpiarFiltros = async () => {
        setFiltros(initialFiltros);
        setFiltrosAplicados(null);
        setAplicando(true);
        setAbierto(null);
        try {
            if (typeof refetchCreditos === "function") {
                try {
                    await refetchCreditos();
                } catch {
                    /* noop */
                }
            }
        } finally {
            setAplicando(false);
        }
    };

    // Modal de recibos
    const [recibosModal, setRecibosModal] = useState({
        open: false,
        credito: null,
        items: [],
        loading: false,
        error: null
    });

    // Modal cancelar crédito
    const [cancelarModal, setCancelarModal] = useState({
        open: false,
        credito: null
    });

    // Modal pago libre
    const [pagoLibre, setPagoLibre] = useState({
        open: false,
        credito: null,
        cuotaLibreId: null,
        modo: "parcial",
        resumenLibre: null
    });

    // Modal refinanciación
    const [refi, setRefi] = useState({
        open: false,
        credito: null,
        resumenLibre: null
    });


    // Resumen LIBRE por crédito: { [id]: { loading, error, data } }
    const [resumenLibreMap, setResumenLibreMap] = useState({});

    // 🔹 Garantiza tener resumenLibre antes de abrir el modal
    const ensureResumenLibre = async (creditoId) => {
        const cached = resumenLibreMap[creditoId]?.data;
        if (cached) return cached;
        try {
            const data = await obtenerResumenLibre(creditoId);
            setResumenLibreMap((prev) => ({
                ...prev,
                [creditoId]: { loading: false, error: null, data }
            }));
            return data;
        } catch (e) {
            setResumenLibreMap((prev) => ({
                ...prev,
                [creditoId]: {
                    loading: false,
                    error: e?.message || "Error al obtener resumen",
                    data: null
                }
            }));
            return null;
        }
    };

    // 🔹 Abre modal de pago LIBRE siempre con resumen cargado (si es posible)
    const abrirPagoLibreDesdeUI = async ({ credito, cuotaLibreId, modo }) => {
        if (!cuotaLibreId || !credito?.id) return;
        const resumenData = await ensureResumenLibre(credito.id);
        setPagoLibre({
            open: true,
            credito,
            cuotaLibreId,
            modo,
            resumenLibre: resumenData
        });
    };

    const abrirRecibos = async (credito) => {
        setRecibosModal({ open: true, credito, items: [], loading: true, error: null });
        try {
            const data = await obtenerRecibosPorCredito(credito.id);
            setRecibosModal((prev) => ({
                ...prev,
                items: Array.isArray(data) ? data : [],
                loading: false
            }));
            // refresco puntual tras consultar
            await refreshCreditoEnLista(credito.id);
        } catch (e) {
            setRecibosModal((prev) => ({
                ...prev,
                error: e?.message || "Error al cargar recibos",
                loading: false
            }));
        }
    };

    const cerrarRecibos = () => {
        setRecibosModal({
            open: false,
            credito: null,
            items: [],
            loading: false,
            error: null
        });
    };

    const estadoClasses = (estado) => {
        switch ((estado || "").toLowerCase()) {
            case "pagado":
                return "bg-green-100 text-green-700";
            case "pendiente":
                return "bg-yellow-100 text-yellow-700";
            case "vencido":
                return "bg-red-100 text-red-700";
            case "refinanciado":
                return "bg-rose-100 text-rose-700";
            default:
                return "bg-gray-100 text-gray-600";
        }
    };

    // Refresca (o carga) el resumen LIBRE de un crédito específico
    const refreshResumenLibre = async (id) => {
        setResumenLibreMap((prev) => ({
            ...prev,
            [id]: { loading: true, error: null, data: null }
        }));
        try {
            const data = await obtenerResumenLibre(id);
            setResumenLibreMap((prev) => ({
                ...prev,
                [id]: { loading: false, error: null, data }
            }));
        } catch (e) {
            setResumenLibreMap((prev) => ({
                ...prev,
                [id]: {
                    loading: false,
                    error: e?.message || "Error al obtener resumen",
                    data: null
                }
            }));
        }
    };

    // 🔔 Solo refresca cuando ABRÍS el acordeón
    const toggleAcordeon = async (id) => {
        setAbierto((prev) => {
            const abriendo = prev !== id; // si es distinto, se está abriendo ese id
            (async () => {
                if (abriendo) {
                    await refreshCreditoEnLista(id);
                    const credito = (lista || []).find((x) => x.id === id);
                    if (credito?.modalidad_credito === "libre") {
                        await refreshResumenLibre(id);
                    }
                }
            })();
            return abriendo ? id : null;
        });
    };

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold tracking-tight">Créditos</h3>
            </div>

            {/* ===== Bloque de filtros ===== */}
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3 text-gray-700">
                    <Filter size={16} />
                    <span className="font-semibold">Filtros de historial</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                    <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Estado</span>
                        <select
                            className="w-full rounded-md border px-3 py-2 bg-white"
                            value={filtros.estado}
                            onChange={(e) =>
                                setFiltros((f) => ({ ...f, estado: e.target.value }))
                            }
                        >
                            <option value="">(Todos)</option>
                            {ESTADOS.map((x) => (
                                <option key={x} value={x}>
                                    {x}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Modalidad</span>
                        <select
                            className="w-full rounded-md border px-3 py-2 bg-white"
                            value={filtros.modalidad}
                            onChange={(e) =>
                                setFiltros((f) => ({ ...f, modalidad: e.target.value }))
                            }
                        >
                            <option value="">(Todas)</option>
                            {MODALIDADES.map((x) => (
                                <option key={x} value={x}>
                                    {x}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Tipo</span>
                        <select
                            className="w-full rounded-md border px-3 py-2 bg-white"
                            value={filtros.tipo}
                            onChange={(e) =>
                                setFiltros((f) => ({ ...f, tipo: e.target.value }))
                            }
                        >
                            <option value="">(Todos)</option>
                            {TIPOS.map((x) => (
                                <option key={x} value={x}>
                                    {x}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Desde</span>
                        <input
                            type="date"
                            className="w-full rounded-md border px-3 py-2"
                            value={filtros.desde}
                            onChange={(e) =>
                                setFiltros((f) => ({ ...f, desde: e.target.value }))
                            }
                        />
                    </label>
                    <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Hasta</span>
                        <input
                            type="date"
                            className="w-full rounded-md border px-3 py-2"
                            value={filtros.hasta}
                            onChange={(e) =>
                                setFiltros((f) => ({ ...f, hasta: e.target.value }))
                            }
                        />
                    </label>
                    <label className="text-sm flex items-end">
                        <div className="flex items-center gap-2">
                            <input
                                id="soloVencidas"
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300"
                                checked={filtros.soloVencidas}
                                onChange={(e) =>
                                    setFiltros((f) => ({
                                        ...f,
                                        soloVencidas: e.target.checked
                                    }))
                                }
                            />
                            <span className="text-gray-700">Solo con cuotas vencidas</span>
                        </div>
                    </label>
                </div>

                <div className="mt-3 flex items-center gap-2">
                    <button
                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                        onClick={aplicarFiltros}
                        disabled={aplicando}
                        title="Aplicar filtros"
                    >
                        {aplicando ? "Aplicando…" : "Aplicar"}
                    </button>
                    <button
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                        onClick={limpiarFiltros}
                        disabled={aplicando}
                        title="Limpiar filtros"
                    >
                        <RefreshCw size={14} /> Limpiar
                    </button>
                </div>
            </section>

            {/* ===== Resultados / estado vacío ===== */}
            {!Array.isArray(lista) || lista.length === 0 ? (
                <section className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600 shadow-sm">
                    {filtrosAplicados ? (
                        <div className="space-y-3">
                            <p>No se encontraron créditos que coincidan con los filtros aplicados.</p>
                            <button
                                onClick={limpiarFiltros}
                                className="inline-flex items-center gap-2 rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
                            >
                                <RefreshCw size={14} /> Limpiar filtros
                            </button>
                        </div>
                    ) : (
                        <p>Este cliente no tiene créditos registrados.</p>
                    )}
                </section>
            ) : (
                lista.map((c) => {
                    const esLibre = c.modalidad_credito === "libre";
                    const tieneDescuento = !esLibre && Number(c.descuento) > 0;

                    // 🔹 Marca si viene de una venta financiada + detalle del producto
                    const esVentaFinanciada = Boolean(
                        c.origen_venta_manual_financiada ||
                        c.venta_manual_id ||
                        (c.ventaOrigen && (c.ventaOrigen.id || c.ventaOrigen.venta_manual_id))
                    );

                    const detalleProducto =
                        c.detalle_producto ||
                        (c.ventaOrigen &&
                            (c.ventaOrigen.detalle_producto ||
                                c.ventaOrigen.descripcion ||
                                c.ventaOrigen.producto)) ||
                        "";

                    // Tasa base visible:
                    // - Si existe tasa_refinanciacion, usamos esa (refi)
                    // - Si no, usamos el interés original del crédito
                    const tasaVisible =
                        c.tasa_refinanciacion !== null &&
                            c.tasa_refinanciacion !== undefined &&
                            c.tasa_refinanciacion !== ""
                            ? Number(c.tasa_refinanciacion)
                            : Number(c.interes);

                    // Interés TOTAL aplicado sobre el crédito que mostramos en ficha.
                    // Regla de negocio:
                    // - Para créditos refinanciados (tienen id_credito_origen):
                    //     * La tasa (P1/P2/manual) es MENSUAL.
                    //     * Convertimos cuotas a "meses equivalentes" según el tipo_credito:
                    //         mensual   => meses = cuotas
                    //         quincenal => meses = cuotas / 2
                    //         semanal   => meses = cuotas / 4
                    //     * Interés total = tasaVisible * mesesEquivalentes
                    // - Para el resto, usamos (monto_total_devolver - monto_acreditar) / monto_acreditar * 100,
                    //   y si no se puede, caemos en la tasaVisible.
                    const interesTotalPct = (() => {
                        // Créditos LIBRE nunca usan este campo como "interés total"
                        if (safeLower(c.modalidad_credito) === "libre") {
                            return Number(tasaVisible || 0);
                        }

                        const tasaBase = Number(tasaVisible || 0);
                        if (tasaBase <= 0) return 0;

                        const cuotasNum = Number(c.cantidad_cuotas || 0);

                        // 🟢 Caso especial: crédito NUEVO generado por refinanciación
                        if (c.id_credito_origen && cuotasNum > 0) {
                            let mesesEquivalentes = cuotasNum;
                            const tipo = safeLower(c.tipo_credito);

                            if (tipo === "quincenal") {
                                // 2 quincenas ≈ 1 mes
                                mesesEquivalentes = cuotasNum / 2;
                            } else if (tipo === "semanal") {
                                // 4 semanas ≈ 1 mes
                                mesesEquivalentes = cuotasNum / 4;
                            }
                            const total = tasaBase * mesesEquivalentes;
                            return +total.toFixed(2);
                        }

                        // 🔁 Fallback general para créditos viejos / normales
                        const capital = Number(c.monto_acreditar || 0);
                        const total = Number(c.monto_total_devolver || 0);

                        if (!capital || total <= capital) {
                            return Number(tasaBase || 0);
                        }

                        const pct = ((total - capital) / capital) * 100;
                        return +pct.toFixed(2);
                    })();


                    // Tasa visible para LIBRE (por ciclo, lo que vos cargás como interes en el crédito libre)
                    const tasaLibreFicha = Number(c.interes || 0);


                    // Estimación rápida para NO libre (visual)
                    let principalPendiente = 0;

                    let moraAcumNeta = 0;
                    if (!esLibre && Array.isArray(c.cuotas)) {
                        for (const q of c.cuotas) {
                            const imp = Number(q.importe_cuota || 0);
                            const pag = Number(q.monto_pagado_acumulado || 0);
                            const moraBr = Number(q.intereses_vencidos_acumulados || 0);
                            const descM = Number(q.descuento_cuota || 0);
                            const moraNet = Math.max(moraBr - descM, 0);

                            // Estimación simple: principal pendiente sin restar descuentos de cuota
                            principalPendiente += Math.max(imp - pag, 0);
                            moraAcumNeta += moraNet;
                        }
                    }

                    // Cuota abierta LIBRE
                    const cuotaLibre = esLibre
                        ? (c.cuotas || []).find((q) => q.numero_cuota === 1) ||
                        (c.cuotas || [])[0]
                        : null;

                    // Resumen libre cacheado
                    const resumen = resumenLibreMap[c.id];

                    // Ciclo actual (1..3)
                    const ciclo = esLibre
                        ? cicloActualDesde(c.fecha_acreditacion, c.tipo_credito)
                        : null;
                    const parcialBloqueado = esLibre && ciclo >= 3;
                    const fechasCiclosCard = esLibre ? fechasCiclosLibre(c) : [];

                    // R (nuevo refi / origen refi)
                    // - Verde: crédito NUEVO generado por refinanciación y aún vigente
                    // - Rojo: crédito que quedó marcado como "refinanciado" (cerrado)
                    const esOrigenRefi = safeLower(c.estado) === "refinanciado";
                    const esNuevoRefi = !esOrigenRefi && Boolean(c.id_credito_origen);


                    // Botón refinanciar (habilitado si no está pagado/anulado, y es comun)
                    const estadoLower = safeLower(c.estado);

                    const modalidadLower = safeLower(c.modalidad_credito);

                    // Puede refinanciarse si:
                    // - La modalidad está en la lista configurada
                    // - Tiene saldo pendiente
                    // - No está pagado / anulado / marcado como refinanciado
                    const puedeRefinanciar =
                        MODALIDADES_REFINANCIABLES.includes(modalidadLower) &&
                        Number(c.saldo_actual) > 0 &&
                        !["pagado", "anulado", "refinanciado"].includes(estadoLower);

                    // Total del ciclo (LIBRE)
                    const totalCicloLibreHoy = esLibre
                        ? resumen?.data?.total_liquidacion_hoy ??
                        c.monto_total_devolver ??
                        Number(c.saldo_actual || 0)
                        : null;

                    // Saldo total actual (de backend si viene, o calculado en front)
                    const totalActualCard = Number(
                        c.total_actual ?? calcularTotalActualFront(c)
                    );

                    // Para tachado si hubo % global (no-libre)
                    const totalSinDescuento = tieneDescuento
                        ? Number(
                            (
                                (Number(c.monto_total_devolver) || 0) /
                                (1 - Number(c.descuento) / 100)
                            ).toFixed(2)
                        )
                        : Number(c.monto_total_devolver);

                    // Primer y último vencimiento reales (ignorando vencimiento ficticio de LIBRE)
                    const vtosValidosCard = Array.isArray(c.cuotas)
                        ? c.cuotas
                            .map((q) => q.fecha_vencimiento)
                            .filter((f) => f && f !== LIBRE_VTO_FICTICIO)
                            .sort()
                        : [];
                    const primerVtoCard =
                        vtosValidosCard[0] || c.fecha_compromiso_pago || "—";
                    const ultimoVtoCard =
                        vtosValidosCard.length > 0
                            ? vtosValidosCard[vtosValidosCard.length - 1]
                            : "—";

                    return (
                        <article
                            key={c.id}
                            className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md ${leftBorderByModalidad(
                                c.modalidad_credito
                            )}`}
                        >
                            <header
                                className="flex flex-wrap items-center justify-between gap-2 p-4 sm:p-6"
                                onClick={() => toggleAcordeon(c.id)}
                            >
                                <div className="flex items-center gap-2 text-lg font-semibold">
                                    <BadgeDollarSign size={18} /> Crédito #{c.id}
                                    <span
                                        className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${badgeByModalidad(
                                            c.modalidad_credito
                                        )}`}
                                    >
                                        {safeLower(c.modalidad_credito) === "comun"
                                            ? "PLAN DE CUOTAS FIJAS"
                                            : c.modalidad_credito?.toUpperCase()}
                                    </span>
                                    {esNuevoRefi && (
                                        <span
                                            title="Nuevo crédito generado por refinanciación"
                                            className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-[11px] font-extrabold leading-none text-white"
                                            style={{ transform: "translateY(-2px)" }}
                                        >
                                            R
                                        </span>
                                    )}
                                    {esOrigenRefi && (
                                        <span
                                            title="Crédito original (marcado como refinanciado)"
                                            className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[11px] font-extrabold leading-none text-white"
                                            style={{ transform: "translateY(-2px)" }}
                                        >
                                            R
                                        </span>
                                    )}

                                    {esLibre && (
                                        <span className="text-xs text-emerald-700 ml-2">
                                            (ciclo {ciclo}/3)
                                        </span>
                                    )}
                                    {esVentaFinanciada && (
                                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                            <BadgeDollarSign size={12} />
                                            Venta financiada
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    {/* Acciones para LIBRE (pago solo superadmin/admin) */}
                                    {/* Acciones para LIBRE (pago solo superadmin/admin) */}
                                    {esLibre &&
                                        !["pagado", "refinanciado"].includes(estadoLower) &&
                                        puedeImpactarPagos && (
                                            <>
                                                <button
                                                    className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium ${parcialBloqueado
                                                        ? "border-gray-300 text-gray-400 bg-white cursor-not-allowed"
                                                        : "border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50"
                                                        }`}
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!cuotaLibre?.id || parcialBloqueado) return;
                                                        await abrirPagoLibreDesdeUI({
                                                            credito: c,
                                                            cuotaLibreId: cuotaLibre.id,
                                                            modo: "parcial"
                                                        });
                                                    }}
                                                    title={
                                                        parcialBloqueado
                                                            ? "En el 3er mes no se permite abono parcial"
                                                            : "Registrar abono parcial (Crédito libre)"
                                                    }
                                                    disabled={parcialBloqueado}
                                                >
                                                    Abono parcial
                                                </button>

                                                <button
                                                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!cuotaLibre?.id) return;
                                                        await abrirPagoLibreDesdeUI({
                                                            credito: c,
                                                            cuotaLibreId: cuotaLibre.id,
                                                            modo: "total"
                                                        });
                                                    }}
                                                    title="Liquidar crédito (Crédito libre)"
                                                >
                                                    Liquidar crédito
                                                </button>
                                            </>
                                        )}



                                    {/* Botón Refinanciar */}
                                    {puedeRefinanciar && (
                                        <button
                                            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                                            onClick={async (e) => {
                                                e.stopPropagation();

                                                let dataResumen = null;
                                                // Si el crédito es LIBRE, nos aseguramos de tener el resumen
                                                if (safeLower(c.modalidad_credito) === "libre") {
                                                    dataResumen = await ensureResumenLibre(c.id);
                                                }

                                                setRefi({
                                                    open: true,
                                                    credito: c,
                                                    resumenLibre: dataResumen
                                                });
                                            }}
                                            title="Refinanciar crédito (PLAN DE CUOTAS FIJAS)"
                                        >
                                            Refinanciar crédito
                                        </button>
                                    )}

                                    {/* Botón Ver recibos */}
                                    <button
                                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            abrirRecibos(c);
                                        }}
                                        title="Ver recibos del crédito"
                                    >
                                        <FileText size={14} /> Ver recibos
                                    </button>

                                    {/* Botón Descargar ficha (PDF en Front) */}
                                    <button
                                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                                await descargarFichaPDFFront(c.id);
                                            } catch (err) {
                                                alert(
                                                    err?.message ||
                                                    "No se pudo generar la ficha."
                                                );
                                            }
                                        }}
                                        title="Descargar ficha (PDF)"
                                    >
                                        <Printer size={14} /> Descargar ficha
                                    </button>

                                    {/* Botón Cancelar crédito (no-libre) */}
                                    {puedeCancelar &&
                                        c.estado !== "pagado" &&
                                        !esLibre &&
                                        String(c.estado).toLowerCase() !== "refinanciado" && (
                                            <button
                                                className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCancelarModal({
                                                        open: true,
                                                        credito: c
                                                    });
                                                }}
                                                title="Cancelar crédito (pago anticipado)"
                                            >
                                                Cancelar crédito
                                            </button>
                                        )}

                                    <span
                                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ${estadoClasses(
                                            c.estado
                                        )}`}
                                    >
                                        {c.estado}
                                    </span>
                                    <ChevronDown
                                        size={18}
                                        className={`transition-transform duration-300 ${abierto === c.id ? "rotate-180" : ""
                                            }`}
                                    />
                                </div>
                            </header>

                            {/* Leyenda según modalidad + Resumen Libre */}
                            {abierto === c.id && c.estado !== "pagado" && (c.modalidad_credito === "libre" ? (
                                <div className="mx-4 mb-2 rounded border bg-emerald-50 border-emerald-100 p-3 text-xs text-gray-800">
                                    <div className="mb-1">
                                        <b>Crédito libre:</b> sin vencimientos fijos. El interés es
                                        por <b>ciclo</b> sobre el <b>capital</b> y la{" "}
                                        <b>mora</b> se calcula al <b>2,5% diario del interés del ciclo</b>.
                                        Máximo 3 meses; en el 3er mes no se permiten abonos parciales.
                                    </div>
                                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        <div>
                                            <span className="font-medium">Vencimiento ciclo 1:</span>{" "}
                                            <span>{fechasCiclosCard[0] || "—"}</span>
                                        </div>
                                        <div>
                                            <span className="font-medium">Vencimiento ciclo 2:</span>{" "}
                                            <span>{fechasCiclosCard[1] || "—"}</span>
                                        </div>
                                        <div>
                                            <span className="font-medium">Vencimiento ciclo 3:</span>{" "}
                                            <span>{fechasCiclosCard[2] || "—"}</span>
                                        </div>
                                    </div>

                                    {resumen?.loading ? (
                                        <div className="mt-1 italic text-emerald-700">
                                            Calculando resumen del ciclo…
                                        </div>
                                    ) : resumen?.error ? (
                                        <div className="mt-1 text-red-600">
                                            {resumen.error}
                                        </div>
                                    ) : resumen?.data ? (
                                        <div className="mt-1 grid grid-cols-1 sm:grid-cols-5 gap-2">
                                            <div className="rounded bg-white border p-2">
                                                <div className="text-gray-600">Ciclo</div>
                                                <div className="font-semibold">{ciclo}/3</div>
                                            </div>
                                            <div className="rounded bg-white border p-2">
                                                <div className="text-gray-600">
                                                    Capital (hoy)
                                                </div>
                                                <div className="font-semibold">
                                                    ${money(resumen.data.saldo_capital)}
                                                </div>
                                            </div>
                                            <div className="rounded bg-white border p-2">
                                                <div className="text-gray-600">
                                                    Interés de ciclo (hoy)
                                                </div>
                                                <div className="font-semibold">
                                                    ${money(
                                                        resumen.data.interes_pendiente_hoy
                                                    )}
                                                </div>
                                            </div>
                                            <div className="rounded bg-white border p-2">
                                                <div className="text-gray-600">
                                                    Mora (hoy)
                                                </div>
                                                <div className="font-semibold">
                                                    ${money(
                                                        resumen.data.mora_pendiente_hoy
                                                    )}
                                                </div>
                                            </div>
                                            <div className="rounded bg-white border p-2">
                                                <div className="text-gray-600">
                                                    Total liquidación (hoy)
                                                </div>
                                                <div className="font-semibold">
                                                    ${money(
                                                        resumen.data.total_liquidacion_hoy
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="mx-4 mb-2 text-xs text-gray-600">
                                    <div className="inline-flex items-center gap-1">
                                        <Info size={14} className="text-sky-600" />
                                        <span>
                                            Interés <b>proporcional (mín. 60%)</b> según períodos (
                                            {c.tipo_credito}). Estimación (hoy): Capital pendiente $
                                            {money(principalPendiente)} + Mora (neta) $
                                            {money(moraAcumNeta)}.
                                        </span>
                                    </div>
                                </div>
                            ))}

                            <div
                                className={`grid transition-all duration-500 ease-in-out ${abierto === c.id
                                    ? "grid-rows-[1fr] opacity-100 border-t border-gray-200"
                                    : "grid-rows-[0fr] opacity-0"
                                    } overflow-hidden`}
                            >
                                <div className="overflow-hidden">
                                    <div className="space-y-4 p-4 sm:p-6 pt-0">
                                        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                                            <div
                                                className="flex flex-wrap items-center gap-2"
                                                title={
                                                    esLibre
                                                        ? "LIBRE: sin vencimientos fijos. El interés es por ciclo sobre el capital y la mora se calcula al 2,5% diario del interés del ciclo (máximo 3 meses)."
                                                        : "Interés total aplicado sobre el capital del crédito (incluye todas las cuotas)."
                                                }
                                            >
                                                <TrendingUp
                                                    size={16}
                                                    className="text-gray-500"
                                                />
                                                <dt className="font-medium text-gray-600">
                                                    {c.modalidad_credito === "libre"
                                                        ? "Tasa por ciclo:"
                                                        : "Interés total:"}
                                                </dt>
                                                <dd className="font-mono text-gray-800">
                                                    {c.modalidad_credito === "libre"
                                                        ? `${tasaLibreFicha}%`
                                                        : `${interesTotalPct}%`}
                                                </dd>

                                            </div>



                                            {c.modalidad_credito !== "libre" && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Clock
                                                        size={16}
                                                        className="text-gray-500"
                                                    />
                                                    <dt className="font-medium text-gray-600">
                                                        Cuotas:
                                                    </dt>
                                                    <dd className="font-mono text-gray-800">
                                                        {c.cantidad_cuotas}
                                                    </dd>
                                                </div>
                                            )}

                                            <div className="flex flex-wrap items-center gap-2">
                                                <ListOrdered
                                                    size={16}
                                                    className="text-gray-500"
                                                />
                                                <dt className="font-medium text-gray-600">
                                                    Tipo:
                                                </dt>
                                                <dd className="text-gray-800">
                                                    {c.tipo_credito}
                                                </dd>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <RefreshCw
                                                    size={16}
                                                    className="text-gray-500"
                                                />
                                                <dt className="font-medium text-gray-600">
                                                    Modalidad:
                                                </dt>
                                                <dd className="text-gray-800">
                                                    {safeLower(
                                                        c.modalidad_credito
                                                    ) === "comun"
                                                        ? "PLAN DE CUOTAS FIJAS"
                                                        : c.modalidad_credito}
                                                </dd>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <DollarSign
                                                    size={16}
                                                    className="text-gray-500"
                                                />
                                                <dt className="font-medium text-gray-600">
                                                    Capital:
                                                </dt>
                                                <dd className="font-mono text-gray-800">
                                                    ${money(c.saldo_actual)}
                                                </dd>
                                            </div>

                                            {/* Saldo total actual (principal + mora neta de cuotas no pagadas) */}
                                            <div className="flex flex-wrap items-center gap-2">
                                                <BadgeDollarSign
                                                    size={16}
                                                    className="text-gray-500"
                                                />
                                                <dt className="font-medium text-gray-600">
                                                    Saldo total actual:
                                                </dt>
                                                <dd className="font-mono text-gray-900 font-semibold">
                                                    ${money(totalActualCard)}
                                                </dd>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <CheckCircle2
                                                    size={16}
                                                    className="text-gray-500"
                                                />
                                                <dt className="font-medium text-gray-600">
                                                    Monto acreditado:
                                                </dt>
                                                <dd className="font-mono text-gray-800">
                                                    ${money(c.monto_acreditar)}
                                                </dd>
                                            </div>
                                            {esVentaFinanciada && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <FileText size={16} className="text-gray-500" />
                                                    <dt className="font-medium text-gray-600">
                                                        Detalle del producto:
                                                    </dt>
                                                    <dd className="text-gray-800">
                                                        {detalleProducto || "Venta financiada"}
                                                    </dd>
                                                </div>
                                            )}

                                            <div className="flex flex-wrap items-center gap-2">
                                                <XCircle
                                                    size={16}
                                                    className="text-gray-500"
                                                />
                                                <dt className="font-medium text-gray-600">
                                                    {c.modalidad_credito === "libre"
                                                        ? "Total del ciclo (hoy):"
                                                        : "Total a devolver:"}
                                                </dt>
                                                <dd className="font-mono text-gray-800">
                                                    {c.modalidad_credito === "libre" ? (
                                                        <>${money(totalCicloLibreHoy)}</>
                                                    ) : tieneDescuento ? (
                                                        <>
                                                            <span className="mr-2 text-sm text-gray-500 line-through">
                                                                ${money(
                                                                    totalSinDescuento
                                                                )}
                                                            </span>
                                                            <span className="font-semibold text-green-700">
                                                                $
                                                                {money(
                                                                    c.monto_total_devolver
                                                                )}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            $
                                                            {money(
                                                                c.monto_total_devolver
                                                            )}
                                                        </>
                                                    )}
                                                </dd>
                                            </div>

                                            {Number(c.interes_acumulado) > 0 && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <TrendingUp
                                                        size={16}
                                                        className="text-gray-500"
                                                    />
                                                    <dt className="font-medium text-gray-600">
                                                        Intereses acumulados:
                                                    </dt>
                                                    <dd className="font-mono text-gray-800">
                                                        ${money(c.interes_acumulado)}
                                                    </dd>
                                                </div>
                                            )}

                                            {c.id_credito_origen && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <CornerUpLeft
                                                        size={16}
                                                        className="text-gray-500"
                                                    />
                                                    <dt className="font-medium text-gray-600">
                                                        Refinanciado de:
                                                    </dt>
                                                    <dd className="text-gray-800">
                                                        #{c.id_credito_origen}
                                                    </dd>
                                                </div>
                                            )}

                                            <div className="flex flex-wrap items-center gap-2">
                                                <User
                                                    size={16}
                                                    className="text-gray-500"
                                                />
                                                <dt className="font-medium text-gray-600">
                                                    Cobrador:
                                                </dt>
                                                <dd className="text-gray-800">
                                                    {c.cobradorCredito
                                                        ?.nombre_completo ?? "—"}
                                                </dd>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <CalendarDays
                                                    size={16}
                                                    className="text-gray-500"
                                                />
                                                <dt className="font-medium text-gray-600">
                                                    Fecha de solicitud:
                                                </dt>
                                                <dd className="text-gray-800">
                                                    {c.fecha_solicitud}
                                                </dd>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <CalendarDays
                                                    size={16}
                                                    className="text-gray-500"
                                                />
                                                <dt className="font-medium text-gray-600">
                                                    Fecha de acreditación:
                                                </dt>
                                                <dd className="text-gray-800">
                                                    {c.fecha_acreditacion}
                                                </dd>
                                            </div>

                                            {c.modalidad_credito !== "libre" && (
                                                <>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <CalendarDays
                                                            size={16}
                                                            className="text-gray-500"
                                                        />
                                                        <dt className="font-medium text-gray-600">
                                                            Primer vencimiento:
                                                        </dt>
                                                        <dd className="text-gray-800">
                                                            {primerVtoCard}
                                                        </dd>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <CalendarDays
                                                            size={16}
                                                            className="text-gray-500"
                                                        />
                                                        <dt className="font-medium text-gray-600">
                                                            Fin de crédito:
                                                        </dt>
                                                        <dd className="text-gray-800">
                                                            {ultimoVtoCard}
                                                        </dd>
                                                    </div>
                                                </>
                                            )}

                                            {c.modalidad_credito !== "libre" &&
                                                tieneDescuento && (
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Percent
                                                            size={16}
                                                            className="text-green-600"
                                                        />
                                                        <dt className="font-medium text-gray-600">
                                                            Descuento:
                                                        </dt>
                                                        <dd className="font-semibold text-green-700">
                                                            {c.descuento}%
                                                        </dd>
                                                    </div>
                                                )}
                                        </dl>

                                        <section>
                                            <h5 className="mb-2 font-semibold text-gray-700">
                                                Detalle de cuotas
                                            </h5>

                                            {c.modalidad_credito === "libre" ? (
                                                <div className="rounded-lg border p-4 bg-white text-sm">
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                        <div>
                                                            <span className="text-gray-500">
                                                                Cuota:
                                                            </span>{" "}
                                                            <span className="font-medium">
                                                                #1 (abierta)
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">
                                                                Importe (capital):
                                                            </span>{" "}
                                                            <span className="font-medium">
                                                                $
                                                                {money(
                                                                    cuotaLibre?.importe_cuota ??
                                                                    0
                                                                )}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">
                                                                Vencimiento:
                                                            </span>{" "}
                                                            <span className="font-medium">
                                                                Sin vencimiento
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {estadoLower !== "pagado" &&
                                                        estadoLower !== "refinanciado" &&
                                                        puedeImpactarPagos && (
                                                            <div className="mt-3 flex gap-2">
                                                                <button
                                                                    className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium ${parcialBloqueado
                                                                        ? "border-gray-300 text-gray-400 bg-white cursor-not-allowed"
                                                                        : "border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50"
                                                                        }`}
                                                                    onClick={async () => {
                                                                        if (!cuotaLibre?.id || parcialBloqueado) return;
                                                                        await abrirPagoLibreDesdeUI({
                                                                            credito: c,
                                                                            cuotaLibreId: cuotaLibre.id,
                                                                            modo: "parcial"
                                                                        });
                                                                    }}
                                                                    disabled={parcialBloqueado}
                                                                >
                                                                    Abono parcial
                                                                </button>
                                                                <button
                                                                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                                                    onClick={async () => {
                                                                        if (!cuotaLibre?.id) return;
                                                                        await abrirPagoLibreDesdeUI({
                                                                            credito: c,
                                                                            cuotaLibreId: cuotaLibre.id,
                                                                            modo: "total"
                                                                        });
                                                                    }}
                                                                >
                                                                    Liquidar crédito
                                                                </button>
                                                            </div>
                                                        )}


                                                </div>
                                            ) : (
                                                <CuotasTabla
                                                    cuotas={c.cuotas}
                                                    interesCredito={c.interes}
                                                    refetch={refetchCreditos}
                                                    creditoEstado={c.estado}
                                                />
                                            )}
                                        </section>
                                    </div>
                                </div>
                            </div>
                        </article>
                    );
                })
            )}

            {/* Modal de Recibos */}
            {recibosModal.open && (
                <section className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="relative w-full max-w-3xl rounded-xl bg-white shadow p-6">
                        <header className="mb-4 flex items-center justify-between border-b pb-2">
                            <h4 className="text-lg font-semibold">
                                Recibos del crédito #{recibosModal.credito?.id}
                            </h4>
                            <button
                                onClick={cerrarRecibos}
                                className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                            >
                                Cerrar
                            </button>
                        </header>

                        {recibosModal.loading ? (
                            <p className="text-sm text-gray-600">Cargando...</p>
                        ) : recibosModal.error ? (
                            <p className="text-sm text-red-600">
                                {recibosModal.error}
                            </p>
                        ) : recibosModal.items.length === 0 ? (
                            <p className="text-sm text-gray-600">
                                No hay recibos para este crédito.
                            </p>
                        ) : (
                            <div className="overflow-auto max-h-[60vh] rounded border">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium">
                                                # Recibo
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium">
                                                Fecha
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium">
                                                Hora
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium">
                                                Cuota
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium">
                                                Importe
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium">
                                                Concepto
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium">
                                                Medio
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium">
                                                Acción
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {recibosModal.items.map((r) => (
                                            <tr
                                                key={r.numero_recibo}
                                                className="odd:bg-white even:bg-gray-50"
                                            >
                                                <td className="px-3 py-2 font-mono">
                                                    {r.numero_recibo}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {r.fecha}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {r.hora}
                                                </td>
                                                <td className="px-3 py-2">
                                                    #{r.cuota?.numero_cuota ?? "—"}
                                                </td>
                                                <td className="px-3 py-2">
                                                    ${money(r.monto_pagado)}
                                                </td>
                                                <td
                                                    className="px-3 py-2 truncate max-w-[260px]"
                                                    title={r.concepto}
                                                >
                                                    {r.concepto}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {r.medio_pago}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Link
                                                        to={`/recibo/${r.numero_recibo}`}
                                                        className="text-blue-600 hover:underline"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Ver
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Modal de Cancelación (no-libre) */}
            {cancelarModal.open && (
                <CancelarCreditoModal
                    credito={cancelarModal.credito}
                    onClose={() =>
                        setCancelarModal({ open: false, credito: null })
                    }
                    onSuccess={() => {
                        setCancelarModal({ open: false, credito: null });
                        refetchCreditos?.();
                    }}
                />
            )}

            {/* Modal de Pago Libre */}
            {pagoLibre.open && (
                <PagoLibreModal
                    open={pagoLibre.open}
                    credito={pagoLibre.credito}
                    cuotaLibreId={pagoLibre.cuotaLibreId}
                    modoInicial={pagoLibre.modo}
                    resumenLibre={pagoLibre.resumenLibre}
                    onClose={() =>
                        setPagoLibre({
                            open: false,
                            credito: null,
                            cuotaLibreId: null,
                            modo: "parcial",
                            resumenLibre: null
                        })
                    }
                    onSuccess={async (creditoId) => {
                        // Cerramos modal y refrescamos datos
                        setPagoLibre({
                            open: false,
                            credito: null,
                            cuotaLibreId: null,
                            modo: "parcial",
                            resumenLibre: null
                        });

                        await refetchCreditos?.();
                        if (creditoId) {
                            await refreshCreditoEnLista(creditoId);
                            await refreshResumenLibre(creditoId);
                        }
                    }}
                />
            )}

            {/* Modal de Refinanciación */}
            {/* Modal de Refinanciación */}
            {refi.open && (
                <RefinanciarCreditoModal
                    open={refi.open}
                    credito={refi.credito}
                    resumenLibre={refi.resumenLibre} // 👈 resumen para LIBRE (si existe)
                    esSuperAdmin={esSuperAdmin}      // solo superadmin puede usar P3 manual
                    onClose={() =>
                        setRefi({ open: false, credito: null, resumenLibre: null })
                    }
                    onSuccess={async () => {
                        await refetchCreditos?.();
                        if (refi.credito?.id) await refreshCreditoEnLista(refi.credito.id);
                        setRefi({ open: false, credito: null, resumenLibre: null });
                    }}
                />
            )}

        </section>
    );
};

export default InfoCreditos;