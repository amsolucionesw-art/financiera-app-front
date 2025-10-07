
const Creditos = () => {
    

    const clientesFiltrados = clientes.filter(c =>
        `${c.nombre} ${c.apellido} ${c.dni}`.toLowerCase().includes(filtro.toLowerCase())
    );

    return (
        <div className="p-4 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Créditos</h1>

            <input
                type="text"
                placeholder="Buscar cliente por nombre, apellido o DNI..."
                className="w-full p-2 border rounded mb-4"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
            />

            
        </div>
    );
};

export default Creditos;
