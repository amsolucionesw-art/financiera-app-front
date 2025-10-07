import { useEffect, useState } from "react";
import { obtenerClientesPorCobrador } from "../services/clienteService";
import { jwtDecode } from "jwt-decode";
import { Search } from "lucide-react";
import ListaClientesCobrador from "../components/cliente_cobrador/ListaClientesCobrador";

const ClientesCobrador = () => {
    const [clientes, setClientes] = useState([]);
    const [filtro, setFiltro] = useState("");
    const [abierto, setAbierto] = useState(null);

    useEffect(() => {
        const cargarClientes = async () => {
            try {
                const token = localStorage.getItem("token");
                const { id } = jwtDecode(token);

                // 1. Traemos todos los clientes del cobrador
                const data = await obtenerClientesPorCobrador(id);

                // 2. Para cada cliente, filtramos sus créditos por estado
                const procesados = data
                    .map((cliente) => ({
                        ...cliente,
                        creditos: (cliente.creditos || []).filter(
                            (cred) =>
                                cred.estado === "pendiente" ||
                                cred.estado === "vencido"
                        )
                    }))
                    // 3. Quitamos los clientes que, tras filtrar, no tengan créditos
                    .filter((cliente) => cliente.creditos.length > 0);

                setClientes(procesados);
            } catch (error) {
                console.error(
                    "Error al obtener clientes del cobrador:",
                    error.message
                );
            }
        };
        cargarClientes();
    }, []);

    // Búsqueda por nombre, apellido o DNI
    const clientesFiltrados = clientes.filter((c) => {
        const campo = `${c.nombre} ${c.apellido} ${c.dni}`.toLowerCase();
        return campo.includes(filtro.toLowerCase());
    });

    return (
        <section className="p-4">
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">
                    Mis Clientes
                </h2>
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

            {clientesFiltrados.length === 0 ? (
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