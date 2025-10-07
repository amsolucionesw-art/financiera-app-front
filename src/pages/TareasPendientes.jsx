import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
    obtenerTareasPendientes,
    aprobarTarea,
    rechazarTarea
} from '../services/tareasService';

const TareasPendientes = () => {
    const [tareas, setTareas] = useState([]);
    const [cargando, setCargando] = useState(true);

    const { checkTareasPendientes } = useOutletContext(); // <- lo traemos del layout (Dashboard)

    const cargarTareas = async () => {
        try {
            setCargando(true);
            const data = await obtenerTareasPendientes();
            setTareas(data);
        } catch (err) {
            console.error('Error al cargar tareas:', err.message);
            Swal.fire('Error', 'No se pudieron cargar las tareas pendientes', 'error');
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        cargarTareas();
    }, []);

    const confirmarAccion = async (id, accion) => {
        const result = await Swal.fire({
            title: `${accion === 'aprobar' ? '¿Aprobar' : '¿Rechazar'} tarea?`,
            text: `Esta acción no se puede deshacer`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: accion === 'aprobar' ? '#16a34a' : '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: accion === 'aprobar' ? 'Sí, aprobar' : 'Sí, rechazar'
        });

        if (result.isConfirmed) {
            try {
                if (accion === 'aprobar') {
                    await aprobarTarea(id);
                } else {
                    await rechazarTarea(id);
                }

                await cargarTareas();           // recargar lista
                await checkTareasPendientes(); // 🔴 actualiza el punto rojo en el sidebar
                Swal.fire('Éxito', `Tarea ${accion}ada correctamente`, 'success');
            } catch (err) {
                console.error(`Error al ${accion} tarea:`, err.message);
                Swal.fire('Error', `No se pudo ${accion} la tarea`, 'error');
            }
        }
    };

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Tareas pendientes</h1>

            {cargando ? (
                <p className="text-gray-500">Cargando tareas...</p>
            ) : tareas.length === 0 ? (
                <p className="text-gray-500">No hay tareas pendientes</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-300 rounded-lg">
                        <thead>
                            <tr className="bg-gray-100 text-left text-sm font-semibold text-gray-700">
                                <th className="px-4 py-2 border-b">Tipo</th>
                                <th className="px-4 py-2 border-b">Datos</th>
                                <th className="px-4 py-2 border-b">Creado por</th>
                                <th className="px-4 py-2 border-b">Fecha</th>
                                <th className="px-4 py-2 border-b">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tareas.map((tarea) => (
                                <tr key={tarea.id} className="text-sm border-t hover:bg-gray-50">
                                    <td className="px-4 py-2 capitalize">{tarea.tipo.replace('_', ' ')}</td>
                                    <td className="px-4 py-2 text-gray-700">
                                        <pre className="whitespace-pre-wrap text-xs bg-gray-100 p-2 rounded">
                                            {JSON.stringify(tarea.datos, null, 2)}
                                        </pre>
                                    </td>
                                    <td className="px-4 py-2">
                                        {tarea.creador?.nombre_completo || 'Desconocido'}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-600">
                                        {new Date(tarea.fechaCreacion).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2 flex gap-2">
                                        <button
                                            onClick={() => confirmarAccion(tarea.id, 'aprobar')}
                                            className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1 rounded"
                                        >
                                            Aprobar
                                        </button>
                                        <button
                                            onClick={() => confirmarAccion(tarea.id, 'rechazar')}
                                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1 rounded"
                                        >
                                            Rechazar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default TareasPendientes;
