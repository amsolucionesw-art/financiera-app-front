// src/pages/ClientesCobrador.jsx
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { obtenerClientesPorCobrador } from "../services/clienteService";
import { jwtDecode } from "jwt-decode";
import { Search, RefreshCw } from "lucide-react";
import ListaClientesCobrador from "../components/cliente_cobrador/ListaClientesCobrador";

const ClientesCobrador = () => {
    const [clientes, setClientes] = useState([]);
    const [filtro, setFiltro] = useState("");
    const [abierto, setAbierto] = useState(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // ✅ refs para evitar re-fetch “nervioso” y reordenamientos visuales
    const clientesRef = useRef([]);
    const lastFetchAtRef = useRef(0);
    const hiddenAtRef = useRef(null);
    const inFlightRef = useRef(false);

    useEffect(() => {
        clientesRef.current = clientes;
    }, [clientes]);

    const sortString = (v) => String(v || "").toLowerCase().trim();
    const sortByIdAsc = (a, b) => Number(a?.id || 0) - Number(b?.id || 0);

    const sortClientesEstable = (arr) => {
        return (arr || []).slice().sort((a, b) => {
            const apA = sortString(a?.apellido);
            const apB = sortString(b?.apellido);
            if (apA !== apB) return apA.localeCompare(apB);

            const noA = sortString(a?.nombre);
            const noB = sortString(b?.nombre);
            if (noA !== noB) return noA.localeCompare(noB);

            return sortByIdAsc(a, b);
        });
    };

    const sortCreditosEstable = (arr) => {
        // ✅ refinanciados al final para que no “ensucien” la vista operativa de cobro
        const prioEstado = (c) => {
            const est = String(c?.estado || "").toLowerCase();
            if (est.includes("refin")) return 99;
            return 0;
        };

        return (arr || []).slice().sort((a, b) => {
            const pa = prioEstado(a);
            const pb = prioEstado(b);
            if (pa !== pb) return pa - pb;
            return sortByIdAsc(a, b);
        });
    };

    /* ============================================================
     * ✅ Normalización REFI (porque acá NO pasa por creditoService.js)
     * - R ROJA  : estado === 'refinanciado'
     * - R VERDE : tiene id_credito_origen (o alias)
     *
     * Esto deja los campos/flags listos para que ListaClientesCobrador
     * (o el componente de la tarjeta) pinte la "R" verde.
     * ============================================================ */
    const normalizeRefiFieldsCredito = (credito) => {
        if (!credito || typeof credito !== "object") return credito;

        const origenRaw =
            credito.id_credito_origen ??
            credito.credito_origen_id ??
            credito.creditoOrigenId ??
            credito.idCreditoOrigen ??
            null;

        const origenId = Number(origenRaw);
        const tieneOrigen = Number.isFinite(origenId) && origenId > 0;

        // Alias consistente (para UI)
        if (credito.credito_origen_id === undefined) {
            credito.credito_origen_id = tieneOrigen ? origenId : null;
        }
        if (credito.id_credito_origen === undefined) {
            credito.id_credito_origen = tieneOrigen ? origenId : null;
        }

        const estado = String(credito.estado || "").toLowerCase();
        credito.es_credito_refinanciado = estado === "refinanciado";
        credito.es_credito_de_refinanciacion = tieneOrigen;

        return credito;
    };

    const cargarClientes = useCallback(async ({ silent = false } = {}) => {
        // evita llamadas solapadas (focus + visibility + manual)
        if (inFlightRef.current) return;
        inFlightRef.current = true;

        try {
            const yaHayData = (clientesRef.current || []).length > 0;

            if (!silent || !yaHayData) {
                setLoading(true);
            }
            setError("");

            const token = localStorage.getItem("token");
            if (!token) throw new Error("No hay sesión activa. Volvé a iniciar sesión.");

            const decoded = jwtDecode(token);
            const cobradorId = decoded?.id;
            if (!cobradorId) throw new Error("No se pudo identificar el cobrador en el token.");

            // 1) Traemos todos los clientes del cobrador
            const data = await obtenerClientesPorCobrador(cobradorId);

            // 2) Estados que el cobrador debe ver
            // ✅ IMPORTANTE: agregamos "refinanciado" (antes lo estabas filtrando afuera)
            const estadosPermitidos = new Set(["pendiente", "vencido", "parcial", "refinanciado"]);

            const procesados = sortClientesEstable(Array.isArray(data) ? data : [])
                .map((cliente) => {
                    const creditosFiltrados = sortCreditosEstable(
                        (cliente.creditos || [])
                            .map((cred) => normalizeRefiFieldsCredito({ ...(cred || {}) }))
                            .filter((cred) =>
                                estadosPermitidos.has(String(cred?.estado || "").toLowerCase())
                            )
                    );

                    return {
                        ...cliente,
                        creditos: creditosFiltrados
                    };
                })
                .filter((cliente) => (cliente.creditos || []).length > 0);

            setClientes(procesados);
            lastFetchAtRef.current = Date.now();
        } catch (e) {
            console.error("Error al obtener clientes del cobrador:", e);
            setClientes([]);
            setError(e?.message || "Error al obtener clientes del cobrador.");
        } finally {
            setLoading(false);
            inFlightRef.current = false;
        }
    }, []);

    // Carga inicial
    useEffect(() => {
        cargarClientes({ silent: false });
    }, [cargarClientes]);

    // ✅ Auto-refresh controlado: evita “reacomodos” por recargar cada focus
    useEffect(() => {
        const MIN_STALE_MS_FOCUS = 60_000;     // si refrescó hace < 60s, no refrescar en focus
        const MIN_HIDDEN_MS_REFRESH = 15_000;  // si estuvo oculto >= 15s, refrescar al volver

        const onFocus = () => {
            const now = Date.now();
            const last = lastFetchAtRef.current || 0;
            if (now - last < MIN_STALE_MS_FOCUS) return;
            cargarClientes({ silent: true });
        };

        const onVisibilityChange = () => {
            if (document.hidden) {
                hiddenAtRef.current = Date.now();
                return;
            }

            const hiddenAt = hiddenAtRef.current;
            hiddenAtRef.current = null;

            if (hiddenAt && Date.now() - hiddenAt >= MIN_HIDDEN_MS_REFRESH) {
                cargarClientes({ silent: true });
            }
        };

        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [cargarClientes]);

    // Búsqueda por nombre, apellido o DNI
    const clientesFiltrados = useMemo(() => {
        const q = filtro.trim().toLowerCase();
        if (!q) return clientes;

        return clientes.filter((c) => {
            const campo = `${c.nombre || ""} ${c.apellido || ""} ${c.dni || ""}`.toLowerCase();
            return campo.includes(q);
        });
    }, [clientes, filtro]);

    return (
        <section className="p-4">
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-semibold text-gray-800">Mis Clientes</h2>

                    <button
                        type="button"
                        onClick={() => cargarClientes({ silent: false })}
                        disabled={loading}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm shadow-sm bg-white hover:bg-gray-50 transition ${
                            loading ? "opacity-60 cursor-not-allowed" : ""
                        }`}
                        title="Recargar"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                        {loading ? "Actualizando..." : "Recargar"}
                    </button>
                </div>

                <div className="flex items-center border rounded-lg px-3 py-2 shadow-sm bg-white w-full sm:w-80">
                    <Search className="w-4 h-4 text-gray-500 mr-2" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o DNI..."
                        value={filtro}
                        onChange={(e) => setFiltro(e.target.value)}
                        className="outline-none text-sm w-full text-gray-700"
                    />
                </div>
            </header>

            {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            ) : loading && clientes.length === 0 ? (
                <p className="text-gray-500">Cargando clientes...</p>
            ) : clientesFiltrados.length === 0 ? (
                <p className="text-gray-500">No se encontraron clientes.</p>
            ) : (
                <ListaClientesCobrador
                    clientes={clientesFiltrados}
                    abierto={abierto}
                    setAbierto={setAbierto}
                />
            )}
        </section>
    );
};

export default ClientesCobrador;


