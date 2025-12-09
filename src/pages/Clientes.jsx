// src/pages/Clientes.jsx

import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import {
    Plus,
    Search,
    Eye,
    Pencil,
    Trash2,
    BadgeDollarSign,
    Upload,
    FileDown,
    FileSpreadsheet,
    X,
    CheckCircle2,
    AlertTriangle
} from "lucide-react";
import {
    obtenerClientes,
    eliminarCliente,
    descargarPlantillaImport,
    obtenerColumnasImport,
    importarClientes
} from "../services/clienteService";
import { jwtDecode } from "jwt-decode";

const Clientes = () => {
    const [clientes, setClientes] = useState([]);
    const [filtro, setFiltro] = useState("");
    const [cargando, setCargando] = useState(true);
    const navigate = useNavigate();

    // ─────────────────────────────────────────────────────
    // Roles / permisos
    // ─────────────────────────────────────────────────────
    const token = localStorage.getItem("token");
    let rol_id = null;
    try {
        rol_id = token ? (jwtDecode(token)?.rol_id ?? null) : null;
    } catch {
        rol_id = null;
    }

    const esSuperAdmin = rol_id === 0;
    const esAdmin = rol_id === 1;
    const esCobrador = rol_id === 2;

    const puedeCrearClientes = esSuperAdmin || esAdmin;          // crear clientes
    const puedeCrearCreditos = esSuperAdmin || esAdmin;          // crear créditos
    const puedeEditarClientes = esSuperAdmin;                    // editar clientes SOLO super admin
    const puedeEliminarClientes = esSuperAdmin || esAdmin;       // eliminar clientes super admin + admin
    const puedeVerCreditos = esSuperAdmin || esAdmin;            // ver créditos
    const puedeUsarImportador = esSuperAdmin || esAdmin;         // importación masiva: super admin + admin

    // ─────────────────────────────────────────────────────
    // Estados para Importación
    // ─────────────────────────────────────────────────────
    const [mostrarImportador, setMostrarImportador] = useState(false);
    const [columnas, setColumnas] = useState(null); // { required, optional, aliases, types, ... }
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);   // { summary, rows }
    const [cargandoImport, setCargandoImport] = useState(false);

    // ─────────────────────────────────────────────────────
    // Paginación listado de clientes
    // ─────────────────────────────────────────────────────
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    const cargarClientes = async () => {
        try {
            setCargando(true);
            const data = await obtenerClientes();
            setClientes(data);
        } catch (error) {
            console.error("Error al cargar clientes:", error.message);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        cargarClientes();
    }, []);

    // Si cambia el filtro o el listado, vuelvo a la página 1
    useEffect(() => {
        setCurrentPage(1);
    }, [filtro, clientes.length]);

    // ─────────────────────────────────────────────────────
    // Importación: helpers
    // ─────────────────────────────────────────────────────
    const abrirImportador = async () => {
        if (!puedeUsarImportador) {
            Swal.fire(
                "Sin permisos",
                "Solo el Super Administrador o Administrador pueden usar la importación masiva de clientes.",
                "info"
            );
            return;
        }
        setMostrarImportador(true);
        if (!columnas) {
            try {
                const def = await obtenerColumnasImport();
                setColumnas(def);
            } catch (e) {
                console.error(e);
                Swal.fire("Error", "No se pudieron obtener las columnas de importación.", "error");
            }
        }
    };

    const cerrarImportador = () => {
        setMostrarImportador(false);
        setFile(null);
        setPreview(null);
    };

    const handleDescargarPlantilla = async (format = "xlsx") => {
        try {
            await descargarPlantillaImport({ format, filename: "plantilla_import_clientes", download: true });
        } catch (e) {
            Swal.fire("Error", e.message || "No se pudo descargar la plantilla.", "error");
        }
    };

    const handleFileChange = (e) => {
        const f = e.target.files?.[0] || null;
        setFile(f);
        setPreview(null); // al cambiar archivo, limpiar preview previa
    };

    const handlePrevisualizar = async () => {
        if (!file) {
            Swal.fire("Atención", "Seleccioná un archivo CSV/XLSX antes de previsualizar.", "info");
            return;
        }
        setCargandoImport(true);
        try {
            const res = await importarClientes(file, { dryRun: true });
            setPreview(res);
            // feedback
            const { created, updated, errors } = res.summary || {};
            Swal.fire(
                "Previsualización lista",
                `Altas: ${created || 0} · Actualizaciones: ${updated || 0} · Errores: ${errors || 0}`,
                "success"
            );
        } catch (e) {
            Swal.fire("Error", e.message || "No se pudo previsualizar la importación.", "error");
        } finally {
            setCargandoImport(false);
        }
    };

    const handleCommit = async () => {
        if (!file) {
            Swal.fire("Atención", "Seleccioná un archivo CSV/XLSX antes de importar.", "info");
            return;
        }
        const ok = await Swal.fire({
            title: "¿Importar definitivamente?",
            text: "Se crearán/actualizarán los clientes mostrados en la previsualización.",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Sí, importar",
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#16a34a",
            cancelButtonColor: "#ccc",
            customClass: {
                popup: "rounded-xl shadow-lg border border-gray-200",
                confirmButton: "bg-green-600 hover:bg-green-700 focus:ring-green-500",
                cancelButton: "bg-gray-200 hover:bg-gray-300 text-gray-800 focus:ring-gray-400",
            },
        });

        if (!ok.isConfirmed) return;

        setCargandoImport(true);
        try {
            const res = await importarClientes(file, { dryRun: false });
            const { created, updated, errors } = res.summary || {};
            Swal.fire(
                "Importación realizada",
                `Altas: ${created || 0} · Actualizaciones: ${updated || 0} · Errores: ${errors || 0}`,
                errors ? "warning" : "success"
            );
            // Refrescar listado principal
            await cargarClientes();
            // Mantengo el resumen visible y el archivo por si quieren volver a revisar
            setPreview(res);
        } catch (e) {
            Swal.fire("Error", e.message || "No se pudo realizar la importación.", "error");
        } finally {
            setCargandoImport(false);
        }
    };

    const handleEliminar = async (id, nombreCompleto) => {
        if (!puedeEliminarClientes) {
            Swal.fire(
                "Sin permisos",
                "Solo el Super Administrador o Administrador pueden eliminar clientes.",
                "info"
            );
            return;
        }

        const confirmacion = await Swal.fire({
            title: "¿Eliminar cliente?",
            text: `Se eliminará permanentemente a ${nombreCompleto}.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Sí, eliminar",
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#e11d48",
            cancelButtonColor: "#ccc",
            customClass: {
                popup: "rounded-xl shadow-lg border border-gray-200",
                confirmButton: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
                cancelButton: "bg-gray-200 hover:bg-gray-300 text-gray-800 focus:ring-gray-400",
            },
        });

        if (!confirmacion.isConfirmed) return;

        try {
            await eliminarCliente(id);
            await cargarClientes();
            Swal.fire("Eliminado", "El cliente ha sido eliminado.", "success");
        } catch (error) {
            Swal.fire("Error", "No se pudo eliminar el cliente.", "error");
        }
    };

    const clientesFiltrados = useMemo(() => {
        const term = filtro.toLowerCase();
        return clientes.filter((c) => {
            const texto = `${c.nombre} ${c.apellido} ${c.dni} ${c.cobradorUsuario?.nombre_completo || ""}`.toLowerCase();
            return texto.includes(term);
        });
    }, [clientes, filtro]);

    // Paginación sobre clientes filtrados
    const totalPages = useMemo(() => {
        if (!clientesFiltrados || clientesFiltrados.length === 0) return 1;
        return Math.ceil(clientesFiltrados.length / rowsPerPage);
    }, [clientesFiltrados.length]);

    const paginatedClientes = useMemo(() => {
        if (!clientesFiltrados || clientesFiltrados.length === 0) return [];
        const start = (currentPage - 1) * rowsPerPage;
        return clientesFiltrados.slice(start, start + rowsPerPage);
    }, [clientesFiltrados, currentPage]);

    // Asegurar que currentPage no se pase del máximo si baja la cantidad de clientes
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [totalPages, currentPage]);

    const startIndex =
        clientesFiltrados && clientesFiltrados.length > 0
            ? (currentPage - 1) * rowsPerPage + 1
            : 0;
    const endIndex =
        clientesFiltrados && clientesFiltrados.length > 0
            ? Math.min(currentPage * rowsPerPage, clientesFiltrados.length)
            : 0;

    // ─────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────
    return (
        <section className="mx-auto max-w-6xl px-4 py-6">
            {/* Header */}
            <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-3xl font-semibold tracking-tight">Clientes</h1>

                <div className="flex flex-wrap gap-2">
                    {puedeUsarImportador && (
                        <button
                            onClick={abrirImportador}
                            className="bg-indigo-600 hover:bg-indigo-700 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white shadow transition focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        >
                            <Upload className="size-4" />
                            <span>Importar</span>
                        </button>
                    )}

                    {puedeCrearClientes && (
                        <Link
                            to="/clientes/nuevo"
                            className="bg-emerald-600 hover:bg-emerald-700 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white shadow transition focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                            <Plus className="size-4" />
                            <span>Nuevo cliente</span>
                        </Link>
                    )}
                </div>
            </header>

            {/* Buscador */}
            <div className="relative mb-6">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <Search className="size-4 text-gray-400" />
                </span>
                <input
                    type="text"
                    placeholder="Buscar por nombre, apellido, DNI o cobrador..."
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
            </div>

            {/* ─────────────────────────────────────────────────────
                BLOQUE IMPORTADOR (acordeón simple dentro de la página)
               ───────────────────────────────────────────────────── */}
            {mostrarImportador && puedeUsarImportador && (
                <div className="mb-6 rounded-xl border border-indigo-200 bg-white p-4 shadow-sm ring-1 ring-indigo-100">
                    <div className="mb-3 flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-semibold text-indigo-900">Importar clientes (CSV/XLSX)</h2>
                            <p className="text-sm text-indigo-700/80">
                                Descargá la plantilla, completala y subila para previsualizar. Luego confirmá la importación.
                            </p>
                        </div>
                        <button
                            onClick={cerrarImportador}
                            className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"
                            title="Cerrar"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    {/* Acciones: descargar plantilla */}
                    <div className="mb-4 flex flex-wrap gap-2">
                        <button
                            onClick={() => handleDescargarPlantilla("xlsx")}
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                        >
                            <FileSpreadsheet className="size-4" />
                            Descargar plantilla XLSX
                        </button>
                        <button
                            onClick={() => handleDescargarPlantilla("csv")}
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                        >
                            <FileDown className="size-4" />
                            Descargar plantilla CSV
                        </button>
                    </div>

                    {/* Definición de columnas (si está disponible) */}
                    {columnas && (
                        <div className="mb-4 grid gap-4 md:grid-cols-3">
                            <div className="rounded-lg border border-gray-200 p-3">
                                <h3 className="mb-2 text-sm font-semibold">Requeridas</h3>
                                <ul className="text-sm text-gray-700 list-disc pl-4">
                                    {columnas.required?.map((c) => (
                                        <li key={c}>{c}</li>
                                    ))}
                                </ul>
                            </div>
                            <div className="rounded-lg border border-gray-200 p-3">
                                <h3 className="mb-2 text-sm font-semibold">Opcionales</h3>
                                <div className="text-sm text-gray-700">
                                    <span className="block">
                                        {columnas.optional?.join(", ")}
                                    </span>
                                </div>
                            </div>
                            <div className="rounded-lg border border-gray-200 p-3">
                                <h3 className="mb-2 text-sm font-semibold">Notas</h3>
                                <ul className="text-sm text-gray-700 list-disc pl-4">
                                    {columnas.notes?.map((n, idx) => <li key={idx}>{n}</li>)}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Selector de archivo */}
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
                        <label
                            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                        >
                            <Upload className="size-4" />
                            <span>{file ? file.name : "Seleccionar archivo CSV/XLSX"}</span>
                            <input
                                type="file"
                                accept=".csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </label>

                        <div className="flex gap-2">
                            <button
                                disabled={cargandoImport}
                                onClick={handlePrevisualizar}
                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white shadow hover:bg-indigo-700 disabled:opacity-60"
                            >
                                <Eye className="size-4" />
                                {cargandoImport ? "Procesando..." : "Previsualizar"}
                            </button>

                            <button
                                disabled={cargandoImport || !preview}
                                onClick={handleCommit}
                                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white shadow hover:bg-emerald-700 disabled:opacity-60"
                            >
                                <CheckCircle2 className="size-4" />
                                Importar definitivamente
                            </button>
                        </div>
                    </div>

                    {/* Resultados de previsualización / importación */}
                    {preview && (
                        <div className="mt-4">
                            <div className="mb-3 text-sm text-gray-700">
                                <span className="font-medium">Resumen:</span>{" "}
                                Total: {preview.summary?.total || 0} · Altas: {preview.summary?.created || 0} ·
                                Actualizaciones: {preview.summary?.updated || 0} ·
                                Errores: {preview.summary?.errors || 0} ·
                                Modo: {preview.summary?.dryRun ? "Previsualización" : "Importado"}
                            </div>

                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="min-w-full divide-y divide-gray-100 text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium">#</th>
                                            <th className="px-3 py-2 text-left font-medium">DNI</th>
                                            <th className="px-3 py-2 text-left font-medium">Acción</th>
                                            <th className="px-3 py-2 text-left font-medium">Estado</th>
                                            <th className="px-3 py-2 text-left font-medium">Errores</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {preview.rows?.map((r) => {
                                            const isOk = r.status === "ok";
                                            const hasErrors = r.errors && r.errors.length > 0;
                                            return (
                                                <tr key={r.index} className="hover:bg-gray-50">
                                                    <td className="px-3 py-2">{r.index}</td>
                                                    <td className="px-3 py-2 font-mono">{r.dni || "—"}</td>
                                                    <td className="px-3 py-2">
                                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs
                                                            ${r.action === "create" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" :
                                                                r.action === "update" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200" :
                                                                    "bg-gray-50 text-gray-600 ring-1 ring-gray-200"}`}>
                                                            {r.action || "—"}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {isOk ? (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-200">
                                                                <CheckCircle2 className="size-3" /> OK
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 ring-1 ring-red-200">
                                                                <AlertTriangle className="size-3" /> Error
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {hasErrors ? (
                                                            <ul className="list-disc pl-5 text-red-700">
                                                                {r.errors.map((e, ix) => <li key={ix}>{e}</li>)}
                                                            </ul>
                                                        ) : (
                                                            <span className="text-gray-500">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="overflow-x-auto rounded-xl bg-white shadow ring-1 ring-gray-200">
                {/* Tabla para desktop */}
                <table className="hidden min-w-full divide-y divide-gray-100 text-sm sm:table">
                    <thead className="bg-gray-50 text-gray-600">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">Nombre</th>
                            <th className="px-4 py-3 text-left font-medium">Apellido</th>
                            <th className="px-4 py-3 text-left font-medium">DNI</th>
                            <th className="px-4 py-3 text-left font-medium">Cobrador</th>
                            <th className="px-4 py-3 text-left font-medium">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {cargando ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                                    Cargando...
                                </td>
                            </tr>
                        ) : clientesFiltrados.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                                    No se encontraron clientes.
                                </td>
                            </tr>
                        ) : (
                            paginatedClientes.map((cliente) => (
                                <tr key={cliente.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">{cliente.nombre}</td>
                                    <td className="px-4 py-3">{cliente.apellido}</td>
                                    <td className="px-4 py-3 font-mono">{cliente.dni}</td>
                                    <td className="px-4 py-3">{cliente.cobradorUsuario?.nombre_completo || "—"}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2 flex-wrap">
                                            {puedeVerCreditos && (
                                                <button
                                                    onClick={() => navigate(`/creditos/cliente/${cliente.id}`)}
                                                    className="inline-flex items-center justify-center rounded-lg border border-blue-600 bg-blue-600/10 p-2 text-blue-600 hover:bg-blue-600/20"
                                                    title="Ver créditos del cliente"
                                                >
                                                    <Eye className="size-4" />
                                                </button>
                                            )}

                                            {puedeEditarClientes && (
                                                <button
                                                    onClick={() => navigate(`/clientes/editar/${cliente.id}`)}
                                                    className="inline-flex items-center justify-center rounded-lg border border-yellow-500 bg-yellow-500/10 p-2 text-yellow-600 hover:bg-yellow-500/20"
                                                    title="Editar cliente"
                                                >
                                                    <Pencil className="size-4" />
                                                </button>
                                            )}

                                            {puedeEliminarClientes && (
                                                <button
                                                    onClick={() => handleEliminar(cliente.id, `${cliente.nombre} ${cliente.apellido}`)}
                                                    className="inline-flex items-center justify-center rounded-lg border border-red-600 bg-red-600/10 p-2 text-red-600 hover:bg-red-600/20"
                                                    title="Eliminar cliente"
                                                >
                                                    <Trash2 className="size-4" />
                                                </button>
                                            )}

                                            {puedeCrearCreditos && (
                                                <button
                                                    onClick={() => navigate("/gestion-creditos", { state: { cliente } })}
                                                    className="inline-flex items-center justify-center rounded-lg border border-green-600 bg-green-600/10 p-2 text-green-600 hover:bg-green-600/20"
                                                    title="Gestionar créditos del cliente"
                                                >
                                                    <BadgeDollarSign className="size-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Vista alternativa para mobile */}
                <div className="sm:hidden divide-y divide-gray-100">
                    {cargando ? (
                        <div className="p-4 text-center text-gray-500">Cargando...</div>
                    ) : clientesFiltrados.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">No se encontraron clientes.</div>
                    ) : (
                        paginatedClientes.map((cliente) => (
                            <div key={cliente.id} className="p-4">
                                <p className="text-base font-medium text-gray-900">{cliente.nombre} {cliente.apellido}</p>
                                <p className="text-sm text-gray-600">DNI: {cliente.dni}</p>
                                <p className="text-sm text-gray-500">Cobrador: {cliente.cobradorUsuario?.nombre_completo || "—"}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {puedeVerCreditos && (
                                        <button
                                            onClick={() => navigate(`/creditos/cliente/${cliente.id}`)}
                                            className="rounded-md border border-blue-500 bg-blue-100 px-3 py-1 text-xs text-blue-700 hover:bg-blue-200"
                                        >
                                            <Eye className="inline size-3 mr-1" /> Ver créditos
                                        </button>
                                    )}
                                    {puedeEditarClientes && (
                                        <button
                                            onClick={() => navigate(`/clientes/editar/${cliente.id}`)}
                                            className="rounded-md border border-yellow-500 bg-yellow-100 px-3 py-1 text-xs text-yellow-700 hover:bg-yellow-200"
                                        >
                                            <Pencil className="inline size-3 mr-1" /> Editar
                                        </button>
                                    )}
                                    {puedeEliminarClientes && (
                                        <button
                                            onClick={() => handleEliminar(cliente.id, `${cliente.nombre} ${cliente.apellido}`)}
                                            className="rounded-md border border-red-500 bg-red-100 px-3 py-1 text-xs text-red-700 hover:bg-red-200"
                                        >
                                            <Trash2 className="inline size-3 mr-1" /> Eliminar
                                        </button>
                                    )}
                                    {puedeCrearCreditos && (
                                        <button
                                            onClick={() => navigate("/gestion-creditos", { state: { cliente } })}
                                            className="rounded-md border border-green-500 bg-green-100 px-3 py-1 text-xs text-green-700 hover:bg-green-200"
                                        >
                                            <BadgeDollarSign className="inline size-3 mr-1" /> Créditos
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Controles de paginación (comparten desktop y mobile) */}
                {!cargando && clientesFiltrados && clientesFiltrados.length > 0 && (
                    <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            Mostrando {startIndex}–{endIndex} de {clientesFiltrados.length} clientes
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                            >
                                Anterior
                            </button>
                            <span className="text-xs">
                                Página {currentPage} de {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages || clientesFiltrados.length === 0}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
};

export default Clientes;
