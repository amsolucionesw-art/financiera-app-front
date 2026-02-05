// src/components/InfoCreditos.jsx
import React, { useState, useEffect, useRef } from "react";
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
    obtenerCreditoPorId,
    obtenerResumenLibreNormalizado
} from "../services/creditoService";
import CancelarCreditoModal from "./CancelarCreditoModal";
import RecibosModal from "./creditos/modals/RecibosModal.jsx";
import PagoLibreModal from "./creditos/modals/PagoLibreModal.jsx";
import RefinanciarCreditoModal from "./creditos/modals/RefinanciarCreditoModal.jsx";
import CreditosFiltros from "./creditos/CreditosFiltros.jsx";
import CreditoCard from "./creditos/CreditoCard.jsx";
import { jwtDecode } from "jwt-decode";
import Swal from "sweetalert2";

import { descargarFichaPDFFront } from "../services/pdf/creditoFichaFront.js";

// Helpers puros extraídos (sin React) — ver src/utils/creditos/creditosHelpers.js
import {
    money,
    getPeriodDays,
    diffDays,
    cicloActualDesde,
    safeLower,
    addDaysStr,
    fechasCiclosLibre,
    parseYMD,
    between,
    tieneCuotasVencidas,
    ESTADOS,
    MODALIDADES,
    TIPOS,
    MODALIDADES_REFINANCIABLES,
    badgeByModalidad,
    leftBorderByModalidad,
    LIBRE_VTO_FICTICIO,
    calcularTotalActualFront
} from "../utils/creditos/creditosHelpers.js";

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

    // ✅ Override local anti-“piso” por props:
    // Si refrescamos un crédito puntual por ID, guardamos ese objeto acá y SIEMPRE tiene prioridad
    // sobre lo que venga por props en el useEffect.
    const creditosOverrideRef = useRef({}); // { [id]: creditoFresh }

    // Reemplaza en lista el crédito refrescado desde backend
    // (devuelve el crédito fresco para poder decidir flujos sin depender del estado async)
    const refreshCreditoEnLista = async (id) => {
        try {
            const resp = await obtenerCreditoPorId(id);
            const fresh = resp?.data ?? resp; // ← normaliza apiFetch (data directa o anidada)
            if (!fresh) return null;

            // ✅ Guardamos override para que no lo pise el sync desde props
            creditosOverrideRef.current[id] = fresh;

            setLista((prev) => prev.map((c) => (c.id === id ? fresh : c)));
            return fresh;
        } catch (e) {
            console.error("No se pudo refrescar crédito", id, e);
            return null;
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

    // ✅ Sincroniza lista con props respetando filtros aplicados,
    // pero aplicando OVERRIDES locales (prioridad: override > props).
    useEffect(() => {
        const baseRaw = Array.isArray(creditos) ? creditos : [];

        // 1) base desde props (filtrada o no)
        const base = filtrosAplicados ? filtrarLocal(baseRaw, filtrosAplicados) : baseRaw;

        // 2) merge con overrides para evitar “piso” luego de pagos parciales
        const merged = (base || []).map((c) => creditosOverrideRef.current?.[c.id] ?? c);

        setLista(merged);
    }, [creditos, filtrosAplicados]); // eslint-disable-line

    const aplicarFiltros = () => {
        setAplicando(true);
        setAbierto(null);
        try {
            setFiltrosAplicados({ ...filtros });
            const base = Array.isArray(creditos) ? creditos : [];
            const filtrada = filtrarLocal(base, filtros);

            // merge overrides también acá (por coherencia)
            const merged = filtrada.map((c) => creditosOverrideRef.current?.[c.id] ?? c);

            setLista(merged);
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

    // Evita condiciones de carrera (toggle rápido / múltiples fetches):
    // guardamos un contador por crédito y solo aplicamos el resultado más reciente.
    const resumenLibreReqRef = useRef({});

    // 🔹 Garantiza tener resumenLibre antes de abrir el modal
    // (si está cargando, devolvemos lo último disponible y evitamos "parpadeo")
    const ensureResumenLibre = async (creditoId) => {
        const entry = resumenLibreMap[creditoId];
        if (entry?.data) return entry.data;
        // Si ya está en loading, no disparamos otro fetch; devolvemos lo que haya.
        if (entry?.loading) return entry?.data ?? null;
        return await refreshResumenLibre(creditoId);
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

    // ✅ FIX: acepta (credito) o ({ credito })
    const abrirRefiDesdeUI = async (arg) => {
        const credito = arg?.credito ?? arg;
        if (!credito?.id) return;

        // refresco puntual (evita abrir con datos viejos)
        const fresh = await refreshCreditoEnLista(credito.id);
        const creditoFinal = fresh || credito;

        const modalidad = safeLower(creditoFinal?.modalidad_credito);
        let resumenData = null;

        if (modalidad === "libre") {
            resumenData = await ensureResumenLibre(creditoFinal.id);
        }

        setRefi({
            open: true,
            credito: creditoFinal,
            resumenLibre: resumenData
        });
    };

    // ✅ FIX: acepta (credito) o ({ credito })
    const abrirCancelarDesdeUI = async (arg) => {
        const credito = arg?.credito ?? arg;
        if (!credito) return;

        const modalidad = safeLower(credito?.modalidad_credito);

        if (modalidad === "libre") {
            await Swal.fire({
                icon: "info",
                title: "Crédito LIBRE",
                text: "La cancelación de un crédito LIBRE se gestiona desde el flujo de pago/cancelación LIBRE. Si necesitás habilitar cancelación directa desde aquí, lo implementamos en un paso separado."
            });
            return;
        }

        setCancelarModal({ open: true, credito });
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
        const prevSeq = resumenLibreReqRef.current[id] || 0;
        const seq = prevSeq + 1;
        resumenLibreReqRef.current[id] = seq;

        // ✅ Importante anti-parpadeo: NO borramos la data previa.
        setResumenLibreMap((prev) => {
            const prevEntry = prev[id] || {};
            return {
                ...prev,
                [id]: { loading: true, error: null, data: prevEntry.data ?? null }
            };
        });

        try {
            // ✅ Un solo contrato para UI: normalizado + cache TTL interno
            const data = await obtenerResumenLibreNormalizado(id);

            // Si hay una request más nueva, ignoramos este resultado.
            if (resumenLibreReqRef.current[id] !== seq) return null;

            setResumenLibreMap((prev) => ({
                ...prev,
                [id]: { loading: false, error: null, data }
            }));
            return data;
        } catch (e) {
            if (resumenLibreReqRef.current[id] !== seq) return null;
            setResumenLibreMap((prev) => {
                const prevEntry = prev[id] || {};
                return {
                    ...prev,
                    [id]: {
                        loading: false,
                        error: e?.message || "Error al obtener resumen",
                        data: prevEntry.data ?? null
                    }
                };
            });
            return null;
        }
    };

    // 🔔 Solo refresca cuando ABRÍS el acordeón
    // (sin async adentro de setState → menos renders raros y menos parpadeo)
    const toggleAcordeon = async (id) => {
        const abriendo = abierto !== id;
        if (!abriendo) {
            setAbierto(null);
            return;
        }

        setAbierto(id);

        // Refresco puntual de crédito y resumen LIBRE, manteniendo data anterior visible.
        const fresh = await refreshCreditoEnLista(id);
        const modalidad = safeLower(
            fresh?.modalidad_credito ?? (lista || []).find((x) => x.id === id)?.modalidad_credito
        );
        if (modalidad === "libre") {
            await refreshResumenLibre(id);
        }
    };

    // ✅ Helper: aplica datos frescos si el modal los devuelve (mejor que refetch a ciegas)
    const aplicarFreshDesdeModal = ({ creditoFresh = null, resumenFresh = null } = {}) => {
        if (creditoFresh?.id) {
            creditosOverrideRef.current[creditoFresh.id] = creditoFresh;
            setLista((prev) => prev.map((c) => (c.id === creditoFresh.id ? creditoFresh : c)));
        }
        if (resumenFresh && creditoFresh?.id) {
            setResumenLibreMap((prev) => ({
                ...prev,
                [creditoFresh.id]: { loading: false, error: null, data: resumenFresh }
            }));
        }
    };

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold tracking-tight">Créditos</h3>
            </div>

            {/* ===== Bloque de filtros ===== */}
            <CreditosFiltros
                filtros={filtros}
                setFiltros={setFiltros}
                aplicando={aplicando}
                onAplicar={aplicarFiltros}
                onLimpiar={limpiarFiltros}
            />

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
                lista.map((c) => (
                    <CreditoCard
                        key={c.id}
                        credito={c}
                        abiertoId={abierto}
                        onToggle={toggleAcordeon}
                        resumen={resumenLibreMap?.[c.id] ?? null}
                        puedeImpactarPagos={puedeImpactarPagos}
                        puedeCancelar={puedeCancelar}
                        onAbrirRecibos={abrirRecibos}
                        onAbrirPagoLibre={abrirPagoLibreDesdeUI}
                        onAbrirRefi={abrirRefiDesdeUI}
                        onAbrirCancelar={abrirCancelarDesdeUI}
                        onImprimirFicha={descargarFichaPDFFront}
                        refetchCreditos={refetchCreditos}
                        estadoClasses={estadoClasses}
                    />
                ))
            )}

            {/* Modal de Recibos */}
            <RecibosModal
                open={recibosModal.open}
                creditoId={recibosModal.credito?.id}
                items={recibosModal.items}
                loading={recibosModal.loading}
                error={recibosModal.error}
                onClose={cerrarRecibos}
            />

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
                    onSuccess={async (payload) => {
                        // Cerramos modal
                        setPagoLibre({
                            open: false,
                            credito: null,
                            cuotaLibreId: null,
                            modo: "parcial",
                            resumenLibre: null
                        });

                        // ✅ Soportamos:
                        // - onSuccess(creditoId)
                        // - onSuccess({ creditoId })
                        // - onSuccess({ credito, resumen_libre })
                        const creditoId =
                            (typeof payload === "number" || typeof payload === "string")
                                ? Number(payload)
                                : Number(payload?.creditoId ?? payload?.credito?.id ?? payload?.id ?? payload?.credito_ui?.id ?? 0);

                        const creditoFreshFromModal =
                            payload?.credito_ui || payload?.credito || null;

                        const resumenFreshFromModal =
                            payload?.resumen_libre || payload?.resumenLibre || null;

                        // 1) Si el modal ya trae datos frescos, aplicarlos ya (sin esperar refetch)
                        if (creditoFreshFromModal?.id) {
                            aplicarFreshDesdeModal({
                                creditoFresh: creditoFreshFromModal,
                                resumenFresh: resumenFreshFromModal
                            });
                        }

                        // 2) Luego forzamos refresh puntual (fuente de verdad: back)
                        if (creditoId) {
                            await refreshCreditoEnLista(creditoId);
                            await refreshResumenLibre(creditoId);
                        }

                        // 3) Finalmente pedimos al padre que sincronice su lista (si quiere),
                        // pero ahora ya no nos pisa porque tenemos override.
                        await refetchCreditos?.();
                    }}
                />
            )}

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