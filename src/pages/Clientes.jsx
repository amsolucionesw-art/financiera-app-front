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
} from "lucide-react";
import {
    obtenerClientes,
    eliminarCliente,
} from "../services/clienteService";

const Clientes = () => {
    const [clientes, setClientes] = useState([]);
    const [filtro, setFiltro] = useState("");
    const [cargando, setCargando] = useState(true);
    const navigate = useNavigate();

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

    const handleEliminar = async (id, nombreCompleto) => {
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

    return (
        <section className="mx-auto max-w-6xl px-4 py-6">
            {/* Header */}
            <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-3xl font-semibold tracking-tight">Clientes</h1>
                <Link
                    to="/clientes/nuevo"
                    className="bg-emerald-600 hover:bg-emerald-700 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white shadow transition focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                    <Plus className="size-4" />
                    <span>Nuevo cliente</span>
                </Link>
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
                            clientesFiltrados.map((cliente) => (
                                <tr key={cliente.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">{cliente.nombre}</td>
                                    <td className="px-4 py-3">{cliente.apellido}</td>
                                    <td className="px-4 py-3 font-mono">{cliente.dni}</td>
                                    <td className="px-4 py-3">{cliente.cobradorUsuario?.nombre_completo || "—"}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2 flex-wrap">
                                            <button
                                                onClick={() => navigate(`/creditos/cliente/${cliente.id}`)}
                                                className="inline-flex items-center justify-center rounded-lg border border-blue-600 bg-blue-600/10 p-2 text-blue-600 hover:bg-blue-600/20"
                                            >
                                                <Eye className="size-4" />
                                            </button>
                                            <button
                                                onClick={() => navigate(`/clientes/editar/${cliente.id}`)}
                                                className="inline-flex items-center justify-center rounded-lg border border-yellow-500 bg-yellow-500/10 p-2 text-yellow-600 hover:bg-yellow-500/20"
                                            >
                                                <Pencil className="size-4" />
                                            </button>
                                            <button
                                                onClick={() => handleEliminar(cliente.id, `${cliente.nombre} ${cliente.apellido}`)}
                                                className="inline-flex items-center justify-center rounded-lg border border-red-600 bg-red-600/10 p-2 text-red-600 hover:bg-red-600/20"
                                            >
                                                <Trash2 className="size-4" />
                                            </button>
                                            <button
                                                onClick={() => navigate("/gestion-creditos", { state: { cliente } })}
                                                className="inline-flex items-center justify-center rounded-lg border border-green-600 bg-green-600/10 p-2 text-green-600 hover:bg-green-600/20"
                                            >
                                                <BadgeDollarSign className="size-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Vista alternativa para mobile */}
                <div className="sm:hidden divide-y divide-gray-100">
                    {clientesFiltrados.map((cliente) => (
                        <div key={cliente.id} className="p-4">
                            <p className="text-base font-medium text-gray-900">{cliente.nombre} {cliente.apellido}</p>
                            <p className="text-sm text-gray-600">DNI: {cliente.dni}</p>
                            <p className="text-sm text-gray-500">Cobrador: {cliente.cobradorUsuario?.nombre_completo || "—"}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    onClick={() => navigate(`/creditos/cliente/${cliente.id}`)}
                                    className="rounded-md border border-blue-500 bg-blue-100 px-3 py-1 text-xs text-blue-700 hover:bg-blue-200"
                                >
                                    <Eye className="inline size-3 mr-1" /> Ver
                                </button>
                                <button
                                    onClick={() => navigate(`/clientes/editar/${cliente.id}`)}
                                    className="rounded-md border border-yellow-500 bg-yellow-100 px-3 py-1 text-xs text-yellow-700 hover:bg-yellow-200"
                                >
                                    <Pencil className="inline size-3 mr-1" /> Editar
                                </button>
                                <button
                                    onClick={() => handleEliminar(cliente.id, `${cliente.nombre} ${cliente.apellido}`)}
                                    className="rounded-md border border-red-500 bg-red-100 px-3 py-1 text-xs text-red-700 hover:bg-red-200"
                                >
                                    <Trash2 className="inline size-3 mr-1" /> Eliminar
                                </button>
                                <button
                                    onClick={() => navigate("/gestion-creditos", { state: { cliente } })}
                                    className="rounded-md border border-green-500 bg-green-100 px-3 py-1 text-xs text-green-700 hover:bg-green-200"
                                >
                                    <BadgeDollarSign className="inline size-3 mr-1" /> Créditos
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Clientes;

