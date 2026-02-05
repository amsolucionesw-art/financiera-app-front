// src/services/pdf/creditoFichaFront.js
// PDF de ficha de crédito generado en el Front (jsPDF + autoTable)

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import {
  money,
  safeLower,
  fechasCiclosLibre,
  diffDays,
  LIBRE_VTO_FICTICIO,
  calcularTotalActualFront
} from "../../utils/creditos/creditosHelpers.js";

/** Utilidad: base URL del API (dev/prod) */
export const getApiBaseUrl = () => {
    const env = (import.meta?.env?.VITE_API_URL || "").trim();
    if (env) return env.replace(/\/+$/, "");
    const isVite = window.location.port === "5173";
    const guess = isVite ? "http://localhost:3000/api" : `${window.location.origin}/api`;
    return guess.replace(/\/+$/, "");
};

/** DESCARGAR FICHA (PDF) 100% EN EL FRONT con jsPDF + autoTable (layout acomodado) */
export const descargarFichaPDFFront = async (creditoId) => {
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
