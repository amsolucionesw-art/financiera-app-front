import CardClienteCobrador from "./CardClienteCobrador";

const ListaClientesCobrador = ({ clientes, abierto, setAbierto }) => {
    if (!clientes || clientes.length === 0) {
        return <p className="text-gray-500">No se encontraron clientes.</p>;
    }

    return (
        <ul className="space-y-6">
            {clientes.map((cliente) => (
                <CardClienteCobrador
                    key={cliente.id}
                    cliente={cliente}
                    abierto={abierto}
                    setAbierto={setAbierto}
                />
            ))}
        </ul>
    );
};

export default ListaClientesCobrador;
