// src/pages/Usuarios.jsx

import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import {
    obtenerUsuarios,
    eliminarUsuario,
    obtenerMiPerfil,
} from "../services/usuarioService";
import {
    obtenerZonas,
    crearZona,
    actualizarZona,
    eliminarZona,
} from "../services/zonaService";
import {
    obtenerFormasDePago,
    crearFormaDePago,
    actualizarFormaDePago,
    eliminarFormaDePago,
} from "../services/formaPagoService";

const ROWS_PER_PAGE = 10;

const Usuarios = () => {
    /* ===== Usuarios ===== */
    const [usuarios, setUsuarios] = useState([]);
    const [filtro, setFiltro] = useState("");
    const [loading, setLoading] = useState(true);
    const [miPerfil, setMiPerfil] = useState(null);
    const [currentPageUsuarios, setCurrentPageUsuarios] = useState(1);
    const navigate = useNavigate();

    const cargarUsuarios = async () => {
        try {
            setLoading(true);
            const data = await obtenerUsuarios();
            setUsuarios(data);
        } catch (err) {
            console.error("Error al obtener usuarios:", err);
        } finally {
            setLoading(false);
        }
    };

    const cargarMiPerfil = async () => {
        try {
            const perfil = await obtenerMiPerfil();
            setMiPerfil(perfil);
        } catch (err) {
            console.error("Error al obtener perfil:", err);
        }
    };

    useEffect(() => {
        cargarUsuarios();
        cargarMiPerfil();
        cargarZonas();       // zonas
        cargarFormasPago();  // formas de pago
    }, []);

    // ─────────────────────────────────────────
    // Permisos sobre USUARIOS según miPerfil
    // ─────────────────────────────────────────
    const rolActual = miPerfil?.rol_id;

    // Solo SUPER ADMIN puede crear / editar / eliminar usuarios
    const puedeCrearUsuarios = rolActual === 0;
    const puedeEditarUsuarios = rolActual === 0;
    const puedeEliminarUsuarios = rolActual === 0;

    const handleEliminar = async (usuario) => {
        if (!puedeEliminarUsuarios) {
            return Swal.fire(
                "Sin permisos",
                "Solo el Super Administrador puede eliminar usuarios.",
                "info"
            );
        }

        if (usuario.rol_id === 0) {
            return Swal.fire(
                "Acción no permitida",
                "No se puede eliminar un usuario con rol super_admin.",
                "warning"
            );
        }

        const { isConfirmed } = await Swal.fire({
            title: "¿Eliminar usuario?",
            text: "Esta acción no se puede deshacer",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Sí, eliminar",
            confirmButtonColor: "#e11d48",
            cancelButtonText: "Cancelar",
            customClass: {
                popup: "rounded-xl shadow-lg border border-gray-200 dark:border-gray-700",
                confirmButton: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
                cancelButton: "bg-gray-200 hover:bg-gray-300 text-gray-800 focus:ring-gray-400",
            },
        });

        if (!isConfirmed) return;

        try {
            await eliminarUsuario(usuario.id);
            await cargarUsuarios();
            Swal.fire("¡Eliminado!", "El usuario fue eliminado.", "success");
        } catch (err) {
            const mensaje = err.message?.includes("clientes asignados")
                ? "No se puede eliminar un cobrador con clientes asignados"
                : err.message || "No se pudo eliminar el usuario.";
            Swal.fire("Error", mensaje, "error");
        }
    };

    const usuariosFiltrados = useMemo(() => {
        const term = filtro.toLowerCase();
        return usuarios.filter((u) => {
            const texto = `${u.nombre_completo} ${u.username ?? u.nombre_usuario} ${u.rol?.nombre_rol}`.toLowerCase();
            return texto.includes(term);
        });
    }, [usuarios, filtro]);

    const totalPagesUsuarios = useMemo(() => {
        if (!usuariosFiltrados || usuariosFiltrados.length === 0) return 1;
        return Math.ceil(usuariosFiltrados.length / ROWS_PER_PAGE);
    }, [usuariosFiltrados.length]);

    const paginatedUsuarios = useMemo(() => {
        if (!usuariosFiltrados || usuariosFiltrados.length === 0) return [];
        const start = (currentPageUsuarios - 1) * ROWS_PER_PAGE;
        return usuariosFiltrados.slice(start, start + ROWS_PER_PAGE);
    }, [usuariosFiltrados, currentPageUsuarios]);

    useEffect(() => {
        // Si cambia filtro o listado, volvemos a la primera página
        setCurrentPageUsuarios(1);
    }, [filtro, usuarios.length]);

    useEffect(() => {
        if (currentPageUsuarios > totalPagesUsuarios) {
            setCurrentPageUsuarios(totalPagesUsuarios);
        }
    }, [totalPagesUsuarios, currentPageUsuarios]);

    const startIndexUsuarios =
        usuariosFiltrados && usuariosFiltrados.length > 0
            ? (currentPageUsuarios - 1) * ROWS_PER_PAGE + 1
            : 0;
    const endIndexUsuarios =
        usuariosFiltrados && usuariosFiltrados.length > 0
            ? Math.min(currentPageUsuarios * ROWS_PER_PAGE, usuariosFiltrados.length)
            : 0;

    /* ===== Zonas ===== */
    const [zonas, setZonas] = useState([]);
    const [filtroZonas, setFiltroZonas] = useState("");
    const [loadingZonas, setLoadingZonas] = useState(true);
    const [currentPageZonas, setCurrentPageZonas] = useState(1);

    const puedeGestionarZonas = useMemo(() => {
        const rol = miPerfil?.rol_id;
        return rol === 0 || rol === 1; // crear/editar: superadmin y admin
    }, [miPerfil]);

    const puedeEliminarZonas = useMemo(() => miPerfil?.rol_id === 0, [miPerfil]); // eliminar: solo superadmin

    const cargarZonas = async () => {
        try {
            setLoadingZonas(true);
            const data = await obtenerZonas();
            setZonas(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Error al obtener zonas:", err);
        } finally {
            setLoadingZonas(false);
        }
    };

    const handleCrearZona = async () => {
        const { value: nombre, isConfirmed } = await Swal.fire({
            title: "Nueva zona",
            input: "text",
            inputLabel: "Nombre de la zona",
            inputPlaceholder: "Ej: Centro",
            showCancelButton: true,
            confirmButtonText: "Crear",
            cancelButtonText: "Cancelar",
            inputValidator: (val) => {
                if (!val || !String(val).trim()) return "El nombre es obligatorio";
                if (String(val).trim().length > 80) return "El nombre es muy largo";
                return null;
            },
        });

        if (!isConfirmed) return;

        try {
            await crearZona({ nombre: String(nombre).trim() });
            await cargarZonas();
            Swal.fire("Listo", "Zona creada exitosamente", "success");
        } catch (err) {
            const status = err?.status;
            const msg = err?.message || "Error al crear zona";
            if (status === 409) {
                Swal.fire("Duplicado", "Ya existe una zona con ese nombre", "warning");
            } else if (status === 400) {
                Swal.fire("Datos inválidos", msg, "warning");
            } else {
                Swal.fire("Error", msg, "error");
            }
        }
    };

    const handleEditarZona = async (z) => {
        const { value: nombre, isConfirmed } = await Swal.fire({
            title: "Editar zona",
            input: "text",
            inputLabel: "Nombre de la zona",
            inputValue: z?.nombre ?? "",
            showCancelButton: true,
            confirmButtonText: "Guardar",
            cancelButtonText: "Cancelar",
            inputValidator: (val) => {
                if (!val || !String(val).trim()) return "El nombre es obligatorio";
                if (String(val).trim().length > 80) return "El nombre es muy largo";
                return null;
            },
        });

        if (!isConfirmed) return;

        try {
            await actualizarZona(z.id, { nombre: String(nombre).trim() });
            await cargarZonas();
            Swal.fire("Listo", "Zona actualizada", "success");
        } catch (err) {
            const status = err?.status;
            const msg = err?.message || "Error al actualizar zona";
            if (status === 409) {
                Swal.fire("Duplicado", "Ya existe otra zona con ese nombre", "warning");
            } else if (status === 400) {
                Swal.fire("Datos inválidos", msg, "warning");
            } else if (status === 404) {
                Swal.fire("No encontrada", "La zona no existe", "warning");
            } else {
                Swal.fire("Error", msg, "error");
            }
        }
    };

    const handleEliminarZona = async (z) => {
        const { isConfirmed } = await Swal.fire({
            title: "¿Eliminar zona?",
            text: `Se eliminará la zona "${z?.nombre}".`,
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Sí, eliminar",
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#e11d48",
        });
        if (!isConfirmed) return;

        try {
            await eliminarZona(z.id);
            await cargarZonas();
            Swal.fire("Eliminada", "La zona fue eliminada", "success");
        } catch (err) {
            const status = err?.status;
            const msg = err?.message || "Error al eliminar zona";
            if (status === 400 && /asignada a clientes/i.test(msg)) {
                Swal.fire("No permitido", "No se puede eliminar la zona porque está asignada a clientes", "warning");
            } else if (status === 404) {
                Swal.fire("No encontrada", "La zona no existe", "warning");
            } else {
                Swal.fire("Error", msg, "error");
            }
        }
    };

    const zonasFiltradas = useMemo(() => {
        const term = (filtroZonas || "").toLowerCase();
        return zonas.filter((z) => (z?.nombre || "").toLowerCase().includes(term));
    }, [zonas, filtroZonas]);

    const totalPagesZonas = useMemo(() => {
        if (!zonasFiltradas || zonasFiltradas.length === 0) return 1;
        return Math.ceil(zonasFiltradas.length / ROWS_PER_PAGE);
    }, [zonasFiltradas.length]);

    const paginatedZonas = useMemo(() => {
        if (!zonasFiltradas || zonasFiltradas.length === 0) return [];
        const start = (currentPageZonas - 1) * ROWS_PER_PAGE;
        return zonasFiltradas.slice(start, start + ROWS_PER_PAGE);
    }, [zonasFiltradas, currentPageZonas]);

    useEffect(() => {
        setCurrentPageZonas(1);
    }, [filtroZonas, zonas.length]);

    useEffect(() => {
        if (currentPageZonas > totalPagesZonas) {
            setCurrentPageZonas(totalPagesZonas);
        }
    }, [totalPagesZonas, currentPageZonas]);

    const startIndexZonas =
        zonasFiltradas && zonasFiltradas.length > 0
            ? (currentPageZonas - 1) * ROWS_PER_PAGE + 1
            : 0;
    const endIndexZonas =
        zonasFiltradas && zonasFiltradas.length > 0
            ? Math.min(currentPageZonas * ROWS_PER_PAGE, zonasFiltradas.length)
            : 0;

    /* ===== Formas de pago ===== */
    const [formasPago, setFormasPago] = useState([]);
    const [filtroFormas, setFiltroFormas] = useState("");
    const [loadingFormas, setLoadingFormas] = useState(true);
    const [currentPageFormas, setCurrentPageFormas] = useState(1);

    const puedeGestionarFormas = useMemo(() => {
        const rol = miPerfil?.rol_id;
        return rol === 0 || rol === 1; // crear/editar: superadmin y admin
    }, [miPerfil]);

    const puedeEliminarFormas = useMemo(() => miPerfil?.rol_id === 0, [miPerfil]); // eliminar: solo superadmin (opcional)

    const cargarFormasPago = async () => {
        try {
            setLoadingFormas(true);
            const data = await obtenerFormasDePago();
            setFormasPago(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Error al obtener formas de pago:", err);
        } finally {
            setLoadingFormas(false);
        }
    };

    const handleCrearFormaPago = async () => {
        const { value: nombre, isConfirmed } = await Swal.fire({
            title: "Nueva forma de pago",
            input: "text",
            inputLabel: "Nombre de la forma de pago",
            inputPlaceholder: "Ej: Efectivo, Transferencia, Débito...",
            showCancelButton: true,
            confirmButtonText: "Crear",
            cancelButtonText: "Cancelar",
            inputValidator: (val) => {
                if (!val || !String(val).trim()) return "El nombre es obligatorio";
                if (String(val).trim().length > 80) return "El nombre es muy largo";
                return null;
            },
        });

        if (!isConfirmed) return;

        try {
            await crearFormaDePago({ nombre: String(nombre).trim() });
            await cargarFormasPago();
            Swal.fire("Listo", "Forma de pago creada exitosamente", "success");
        } catch (err) {
            const status = err?.status;
            const msg = err?.message || "Error al crear la forma de pago";
            if (status === 409) {
                Swal.fire("Duplicado", "Ya existe una forma de pago con ese nombre", "warning");
            } else if (status === 400) {
                Swal.fire("Datos inválidos", msg, "warning");
            } else {
                Swal.fire("Error", msg, "error");
            }
        }
    };

    const handleEditarFormaPago = async (f) => {
        const { value: nombre, isConfirmed } = await Swal.fire({
            title: "Editar forma de pago",
            input: "text",
            inputLabel: "Nombre de la forma de pago",
            inputValue: f?.nombre ?? "",
            showCancelButton: true,
            confirmButtonText: "Guardar",
            cancelButtonText: "Cancelar",
            inputValidator: (val) => {
                if (!val || !String(val).trim()) return "El nombre es obligatorio";
                if (String(val).trim().length > 80) return "El nombre es muy largo";
                return null;
            },
        });

        if (!isConfirmed) return;

        try {
            await actualizarFormaDePago(f.id, { nombre: String(nombre).trim() });
            await cargarFormasPago();
            Swal.fire("Listo", "Forma de pago actualizada", "success");
        } catch (err) {
            const status = err?.status;
            const msg = err?.message || "Error al actualizar la forma de pago";
            if (status === 409) {
                Swal.fire("Duplicado", "Ya existe otra forma de pago con ese nombre", "warning");
            } else if (status === 400) {
                Swal.fire("Datos inválidos", msg, "warning");
            } else if (status === 404) {
                Swal.fire("No encontrada", "La forma de pago no existe", "warning");
            } else {
                Swal.fire("Error", msg, "error");
            }
        }
    };

    const handleEliminarFormaPago = async (f) => {
        const { isConfirmed } = await Swal.fire({
            title: "¿Eliminar forma de pago?",
            text: `Se eliminará la forma de pago "${f?.nombre}".`,
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Sí, eliminar",
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#e11d48",
        });
        if (!isConfirmed) return;

        try {
            await eliminarFormaDePago(f.id);
            await cargarFormasPago();
            Swal.fire("Eliminada", "La forma de pago fue eliminada", "success");
        } catch (err) {
            const status = err?.status;
            const msg = err?.message || "Error al eliminar la forma de pago";
            if (
                status === 409 ||
                /asociad[ao] a pagos/i.test(msg) ||
                /movimientos de caja/i.test(msg)
            ) {
                Swal.fire(
                    "No permitido",
                    "No se puede eliminar la forma de pago porque está asociada a pagos, cuotas o movimientos de caja.",
                    "warning"
                );
            } else if (status === 404) {
                Swal.fire("No encontrada", "La forma de pago no existe", "warning");
            } else {
                Swal.fire("Error", msg, "error");
            }
        }
    };

    const formasFiltradas = useMemo(() => {
        const term = (filtroFormas || "").toLowerCase();
        return formasPago.filter((f) => (f?.nombre || "").toLowerCase().includes(term));
    }, [formasPago, filtroFormas]);

    const totalPagesFormas = useMemo(() => {
        if (!formasFiltradas || formasFiltradas.length === 0) return 1;
        return Math.ceil(formasFiltradas.length / ROWS_PER_PAGE);
    }, [formasFiltradas.length]);

    const paginatedFormas = useMemo(() => {
        if (!formasFiltradas || formasFiltradas.length === 0) return [];
        const start = (currentPageFormas - 1) * ROWS_PER_PAGE;
        return formasFiltradas.slice(start, start + ROWS_PER_PAGE);
    }, [formasFiltradas, currentPageFormas]);

    useEffect(() => {
        setCurrentPageFormas(1);
    }, [filtroFormas, formasPago.length]);

    useEffect(() => {
        if (currentPageFormas > totalPagesFormas) {
            setCurrentPageFormas(totalPagesFormas);
        }
    }, [totalPagesFormas, currentPageFormas]);

    const startIndexFormas =
        formasFiltradas && formasFiltradas.length > 0
            ? (currentPageFormas - 1) * ROWS_PER_PAGE + 1
            : 0;
    const endIndexFormas =
        formasFiltradas && formasFiltradas.length > 0
            ? Math.min(currentPageFormas * ROWS_PER_PAGE, formasFiltradas.length)
            : 0;

    return (
        <section className="mx-auto max-w-6xl px-4 py-6">
            {/* Encabezado Usuarios */}
            <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-3xl font-semibold tracking-tight">Usuarios</h1>
                {puedeCrearUsuarios && (
                    <Link
                        to="/usuarios/nuevo"
                        className="bg-emerald-600 hover:bg-emerald-700 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white shadow transition focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                        <Plus className="size-4" />
                        <span>Nuevo usuario</span>
                    </Link>
                )}
            </header>

            {/* Buscador Usuarios */}
            <div className="relative mb-6">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <Search className="size-4 text-gray-400" />
                </span>
                <input
                    type="text"
                    placeholder="Buscar por nombre, usuario o rol..."
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
            </div>

            {/* Tabla Usuarios - Desktop + Mobile */}
            <div className="overflow-x-auto rounded-xl bg-white shadow ring-1 ring-gray-200">
                {loading ? (
                    <div className="p-6 text-center text-gray-500">Cargando...</div>
                ) : usuariosFiltrados.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">No se encontraron usuarios.</div>
                ) : (
                    <table className="hidden min-w-full divide-y divide-gray-100 text-sm sm:table">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium">Nombre</th>
                                <th className="px-4 py-3 text-left font-medium">Usuario</th>
                                <th className="px-4 py-3 text-left font-medium">Rol</th>
                                <th className="px-4 py-3 text-left font-medium">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {paginatedUsuarios.map((u) => (
                                <tr key={u.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">{u.nombre_completo}</td>
                                    <td className="px-4 py-3">{u.username ?? u.nombre_usuario}</td>
                                    <td className="px-4 py-3">
                                        <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                                            {u.rol?.nombre_rol}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            {puedeEditarUsuarios && (
                                                <button
                                                    onClick={() => navigate(`/usuarios/${u.id}/editar`)}
                                                    className="inline-flex items-center justify-center rounded-lg border border-yellow-500 bg-yellow-500/10 p-2 text-yellow-600 transition hover:bg-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                                >
                                                    <Pencil className="size-4" />
                                                </button>
                                            )}
                                            {puedeEliminarUsuarios && (
                                                <button
                                                    onClick={() => handleEliminar(u)}
                                                    disabled={u.rol_id === 0}
                                                    className="inline-flex items-center justify-center rounded-lg border border-red-600 bg-red-600/10 p-2 text-red-600 transition hover:bg-red-600/20 focus:outline-none focus:ring-2 focus:ring-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    <Trash2 className="size-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Usuarios - Mobile */}
                <div className="sm:hidden divide-y divide-gray-200">
                    {loading ? (
                        <div className="p-4 text-center text-gray-500">Cargando...</div>
                    ) : usuariosFiltrados.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">No se encontraron usuarios.</div>
                    ) : (
                        paginatedUsuarios.map((u) => (
                            <div key={u.id} className="p-4">
                                <p className="text-base font-medium text-gray-900">{u.nombre_completo}</p>
                                <p className="text-sm text-gray-600">{u.username ?? u.nombre_usuario}</p>
                                <p className="mt-1 text-sm text-gray-500">
                                    Rol{" "}
                                    <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                        {u.rol?.nombre_rol}
                                    </span>
                                </p>
                                <div className="mt-3 flex gap-2">
                                    {puedeEditarUsuarios && (
                                        <button
                                            onClick={() => navigate(`/usuarios/${u.id}/editar`)}
                                            className="inline-flex items-center justify-center rounded-md border border-yellow-500 bg-yellow-100 px-3 py-1 text-xs text-yellow-700 hover:bg-yellow-200"
                                        >
                                            <Pencil className="mr-1 size-3" /> Editar
                                        </button>
                                    )}
                                    {puedeEliminarUsuarios && (
                                        <button
                                            onClick={() => handleEliminar(u)}
                                            disabled={u.rol_id === 0}
                                            className="inline-flex items-center justify-center rounded-md border border-red-500 bg-red-100 px-3 py-1 text-xs text-red-700 hover:bg-red-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <Trash2 className="mr-1 size-3" /> Eliminar
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Paginación Usuarios */}
                {!loading && usuariosFiltrados && usuariosFiltrados.length > 0 && (
                    <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            Mostrando {startIndexUsuarios}–{endIndexUsuarios} de {usuariosFiltrados.length} usuarios
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setCurrentPageUsuarios((p) => Math.max(1, p - 1))}
                                disabled={currentPageUsuarios === 1}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                            >
                                Anterior
                            </button>
                            <span className="text-xs">
                                Página {currentPageUsuarios} de {totalPagesUsuarios}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCurrentPageUsuarios((p) => Math.min(totalPagesUsuarios, p + 1))}
                                disabled={currentPageUsuarios === totalPagesUsuarios || usuariosFiltrados.length === 0}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ============================ */}
            {/*        SECCIÓN: ZONAS        */}
            {/* ============================ */}
            <div className="mt-10">
                <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-2xl font-semibold tracking-tight">Zonas</h2>

                    {puedeGestionarZonas && (
                        <button
                            onClick={handleCrearZona}
                            className="bg-indigo-600 hover:bg-indigo-700 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white shadow transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                            <Plus className="size-4" />
                            <span>Nueva zona</span>
                        </button>
                    )}
                </header>

                {/* Buscador Zonas */}
                <div className="relative mb-6">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                        <Search className="size-4 text-gray-400" />
                    </span>
                    <input
                        type="text"
                        placeholder="Buscar por nombre de zona..."
                        value={filtroZonas}
                        onChange={(e) => setFiltroZonas(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                </div>

                <div className="overflow-x-auto rounded-xl bg-white shadow ring-1 ring-gray-200">
                    {loadingZonas ? (
                        <div className="p-6 text-center text-gray-500">Cargando...</div>
                    ) : zonasFiltradas.length === 0 ? (
                        <div className="p-6 text-center text-gray-500">No se encontraron zonas.</div>
                    ) : (
                        <table className="hidden min-w-full divide-y divide-gray-100 text-sm sm:table">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium">Nombre</th>
                                    <th className="px-4 py-3 text-left font-medium">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paginatedZonas.map((z) => (
                                    <tr key={z.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">{z.nombre}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                {puedeGestionarZonas && (
                                                    <button
                                                        onClick={() => handleEditarZona(z)}
                                                        className="inline-flex items-center justify-center rounded-lg border border-yellow-500 bg-yellow-500/10 p-2 text-yellow-600 transition hover:bg-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                                    >
                                                        <Pencil className="size-4" />
                                                    </button>
                                                )}
                                                {puedeEliminarZonas && (
                                                    <button
                                                        onClick={() => handleEliminarZona(z)}
                                                        className="inline-flex items-center justify-center rounded-lg border border-red-600 bg-red-600/10 p-2 text-red-600 transition hover:bg-red-600/20 focus:outline-none focus:ring-2 focus:ring-red-600"
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Zonas - Mobile */}
                    <div className="sm:hidden divide-y divide-gray-200">
                        {loadingZonas ? (
                            <div className="p-4 text-center text-gray-500">Cargando...</div>
                        ) : zonasFiltradas.length === 0 ? (
                            <div className="p-4 text-center text-gray-500">No se encontraron zonas.</div>
                        ) : (
                            paginatedZonas.map((z) => (
                                <div key={z.id} className="p-4">
                                    <p className="text-base font-medium text-gray-900">{z.nombre}</p>
                                    <div className="mt-3 flex gap-2">
                                        {puedeGestionarZonas && (
                                            <button
                                                onClick={() => handleEditarZona(z)}
                                                className="inline-flex items-center justify-center rounded-md border border-yellow-500 bg-yellow-100 px-3 py-1 text-xs text-yellow-700 hover:bg-yellow-200"
                                            >
                                                <Pencil className="mr-1 size-3" /> Editar
                                            </button>
                                        )}
                                        {puedeEliminarZonas && (
                                            <button
                                                onClick={() => handleEliminarZona(z)}
                                                className="inline-flex items-center justify-center rounded-md border border-red-500 bg-red-100 px-3 py-1 text-xs text-red-700 hover:bg-red-200"
                                            >
                                                <Trash2 className="mr-1 size-3" /> Eliminar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Paginación Zonas */}
                    {!loadingZonas && zonasFiltradas && zonasFiltradas.length > 0 && (
                        <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                Mostrando {startIndexZonas}–{endIndexZonas} de {zonasFiltradas.length} zonas
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setCurrentPageZonas((p) => Math.max(1, p - 1))}
                                    disabled={currentPageZonas === 1}
                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                                >
                                    Anterior
                                </button>
                                <span className="text-xs">
                                    Página {currentPageZonas} de {totalPagesZonas}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPageZonas((p) => Math.min(totalPagesZonas, p + 1))}
                                    disabled={currentPageZonas === totalPagesZonas || zonasFiltradas.length === 0}
                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ================================== */}
            {/*      SECCIÓN: FORMAS DE PAGO      */}
            {/* ================================== */}
            <div className="mt-10">
                <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-2xl font-semibold tracking-tight">Formas de pago</h2>

                    {puedeGestionarFormas && (
                        <button
                            onClick={handleCrearFormaPago}
                            className="bg-sky-600 hover:bg-sky-700 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white shadow transition focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        >
                            <Plus className="size-4" />
                            <span>Nueva forma de pago</span>
                        </button>
                    )}
                </header>

                {/* Buscador Formas de pago */}
                <div className="relative mb-6">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                        <Search className="size-4 text-gray-400" />
                    </span>
                    <input
                        type="text"
                        placeholder="Buscar por nombre de forma de pago..."
                        value={filtroFormas}
                        onChange={(e) => setFiltroFormas(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm shadow-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                </div>

                <div className="overflow-x-auto rounded-xl bg-white shadow ring-1 ring-gray-200">
                    {loadingFormas ? (
                        <div className="p-6 text-center text-gray-500">Cargando...</div>
                    ) : formasFiltradas.length === 0 ? (
                        <div className="p-6 text-center text-gray-500">No se encontraron formas de pago.</div>
                    ) : (
                        <table className="hidden min-w-full divide-y divide-gray-100 text-sm sm:table">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium">Nombre</th>
                                    <th className="px-4 py-3 text-left font-medium">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paginatedFormas.map((f) => (
                                    <tr key={f.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">{f.nombre}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                {puedeGestionarFormas && (
                                                    <button
                                                        onClick={() => handleEditarFormaPago(f)}
                                                        className="inline-flex items-center justify-center rounded-lg border border-yellow-500 bg-yellow-500/10 p-2 text-yellow-600 transition hover:bg-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                                    >
                                                        <Pencil className="size-4" />
                                                    </button>
                                                )}
                                                {puedeEliminarFormas && (
                                                    <button
                                                        onClick={() => handleEliminarFormaPago(f)}
                                                        className="inline-flex items-center justify-center rounded-lg border border-red-600 bg-red-600/10 p-2 text-red-600 transition hover:bg-red-600/20 focus:outline-none focus:ring-2 focus:ring-red-600"
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Formas de pago - Mobile */}
                    <div className="sm:hidden divide-y divide-gray-200">
                        {loadingFormas ? (
                            <div className="p-4 text-center text-gray-500">Cargando...</div>
                        ) : formasFiltradas.length === 0 ? (
                            <div className="p-4 text-center text-gray-500">No se encontraron formas de pago.</div>
                        ) : (
                            paginatedFormas.map((f) => (
                                <div key={f.id} className="p-4">
                                    <p className="text-base font-medium text-gray-900">{f.nombre}</p>
                                    <div className="mt-3 flex gap-2">
                                        {puedeGestionarFormas && (
                                            <button
                                                onClick={() => handleEditarFormaPago(f)}
                                                className="inline-flex items-center justify-center rounded-md border border-yellow-500 bg-yellow-100 px-3 py-1 text-xs text-yellow-700 hover:bg-yellow-200"
                                            >
                                                <Pencil className="mr-1 size-3" /> Editar
                                            </button>
                                        )}
                                        {puedeEliminarFormas && (
                                            <button
                                                onClick={() => handleEliminarFormaPago(f)}
                                                className="inline-flex items-center justify-center rounded-md border border-red-500 bg-red-100 px-3 py-1 text-xs text-red-700 hover:bg-red-200"
                                            >
                                                <Trash2 className="mr-1 size-3" /> Eliminar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Paginación Formas de pago */}
                    {!loadingFormas && formasFiltradas && formasFiltradas.length > 0 && (
                        <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                Mostrando {startIndexFormas}–{endIndexFormas} de {formasFiltradas.length} formas de pago
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setCurrentPageFormas((p) => Math.max(1, p - 1))}
                                    disabled={currentPageFormas === 1}
                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                                >
                                    Anterior
                                </button>
                                <span className="text-xs">
                                    Página {currentPageFormas} de {totalPagesFormas}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPageFormas((p) => Math.min(totalPagesFormas, p + 1))}
                                    disabled={currentPageFormas === totalPagesFormas || formasFiltradas.length === 0}
                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default Usuarios;