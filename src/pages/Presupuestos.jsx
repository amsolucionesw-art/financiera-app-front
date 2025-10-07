// src/pages/Presupuestos.jsx

import React, { useState } from "react";
import { Search } from "lucide-react";
import { obtenerPresupuestoPorNumero } from "../services/presupuestoService";
import PresupuestoCard from "../components/PresupuestoCard";

const Presupuestos = () => {
    const [filtroId, setFiltroId] = useState("");
    const [presupuesto, setPresupuesto] = useState(null);
    const [error, setError] = useState("");

    const handleBuscar = async () => {
        setError("");
        setPresupuesto(null);
        const idTrim = filtroId.trim();
        if (!idTrim) {
            setError("Ingresá un ID válido");
            return;
        }
        try {
            const data = await obtenerPresupuestoPorNumero(idTrim);
            if (data && data.numero !== undefined) {
                setPresupuesto(data);
            } else {
                setError("No se encontró ningún presupuesto con ese número.");
            }
        } catch (err) {
            console.error("Error al buscar presupuesto por número:", err);
            setError("Error al buscar el presupuesto.");
        }
    };

    return (
        <section className="p-6 max-w-xl mx-auto bg-white rounded-xl shadow-lg ring-1 ring-gray-200 animate-fade-in space-y-6">
            <h1 className="text-2xl font-semibold text-gray-800">Buscar Presupuesto</h1>

            <div className="flex flex-col sm:flex-row gap-4">
                <input
                    type="text"
                    value={filtroId}
                    onChange={(e) => setFiltroId(e.target.value)}
                    placeholder="Número de presupuesto"
                    className="flex-1 rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                    onClick={handleBuscar}
                    className="inline-flex items-center gap-2 bg-blue-600 text-white font-medium px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                    <Search size={16} /> Buscar
                </button>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            {presupuesto && (
                <PresupuestoCard
                    presupuesto={presupuesto}
                    onClose={() => setPresupuesto(null)}
                />
            )}
        </section>
    );
};

export default Presupuestos;


