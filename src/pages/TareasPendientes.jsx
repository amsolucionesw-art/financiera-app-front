// src/pages/TareasPendientes.jsx
import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
    obtenerTareasPendientes,
    aprobarTarea,
    rechazarTarea
} from '../services/tareasService';

/* ===== Helpers ===== */
const safeToObject = (datos) => {
    if (!datos) return {};
    if (typeof datos === 'object') return datos;
    try {
        return JSON.parse(datos);
    } catch {
        return { raw: String(datos) };
    }
};

const formatFecha = (dateLike) => {
    if (!dateLike) return '-';
    const d = new Date(dateLike);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const TipoBadge = ({ tipo }) => {
    const t = (tipo || '').toLowerCase();
    const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset';
    const map = {
        anular_credito: `${base} bg-rose-100 text-rose-700 ring-rose-200`,
        editar_credito: `${base} bg-amber-100 text-amber-700 ring-amber-200`,
        otro: `${base} bg-slate-100 text-slate-700 ring-slate-200`
    };
    return <span className={map[t] || map.otro}>{t.replaceAll('_', ' ') || 'tarea'}</span>;
};

const DatosTarea = ({ tarea }) => {
    const datos = safeToObject(tarea?.datos);
    const tipo = (tarea?.tipo || '').toLowerCase();

    // Render específico para anulación de crédito
    if (tipo === 'anular_credito') {
        const creditoId = datos?.creditoId || datos?.credito_id || datos?.id_credito;
        const clienteNombre = datos?.cliente?.nombre_completo || datos?.clienteNombre || '-';
        const motivo = datos?.motivo || '-';

        return (
            <div className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-600">Crédito:</span>
                    {/* Si tenés una ruta definida para ver el crédito, reemplazá este span por <Link to={`/creditos/${creditoId}`}> */}
                    {creditoId ? (
                        <span className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-blue-700 ring-1 ring-blue-200">
                            #{creditoId}
                        </span>
                    ) : (
                        <span className="text-gray-700">-</span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-600">Cliente:</span>
                    <span className="font-medium text-gray-800">{clienteNombre}</span>
                </div>

                <div>
                    <div className="text-gray-600">Motivo:</div>
                    <div className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2 text-gray-800 ring-1 ring-gray-200">
                        {motivo}
                    </div>
                </div>
            </div>
        );
    }

    // Fallback: muestro JSON colapsable
    const pretty = JSON.stringify(datos, null, 2);
    return (
        <details className="group rounded border border-gray-200 bg-gray-50">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm text-gray-700 group-open:border-b group-open:bg-white">
                Ver datos
            </summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap bg-white p-3 text-xs text-gray-800">
                {pretty}
            </pre>
        </details>
    );
};

const TareasPendientes = () => {
    const [tareas, setTareas] = useState([]);
    const [cargando, setCargando] = useState(true);

    // <- lo traemos del layout (Dashboard)
    const { checkTareasPendientes } = useOutletContext() || { checkTareasPendientes: async () => {} };

    const cargarTareas = async () => {
        try {
            setCargando(true);
            const data = await obtenerTareasPendientes();
            setTareas(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error al cargar tareas:', err?.message || err);
            Swal.fire('Error', 'No se pudieron cargar las tareas pendientes', 'error');
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        cargarTareas();
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

                await cargarTareas();            // recargar lista
                await checkTareasPendientes();   // 🔴 actualiza el punto rojo en el sidebar
                Swal.fire('Éxito', `Tarea ${accion}ada correctamente`, 'success');
            } catch (err) {
                console.error(`Error al ${accion} tarea:`, err?.message || err);
                Swal.fire('Error', `No se pudo ${accion} la tarea`, 'error');
            }
        }
    };

    return (
        <div className="p-4">
            <h1 className="mb-4 text-2xl font-bold">Tareas pendientes</h1>

            {cargando ? (
                <p className="text-gray-500">Cargando tareas...</p>
            ) : tareas.length === 0 ? (
                <p className="text-gray-500">No hay tareas pendientes</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full rounded-lg border border-gray-200 bg-white">
                        <thead>
                            <tr className="bg-gray-50 text-left text-sm font-semibold text-gray-700">
                                <th className="border-b px-4 py-2">Tipo</th>
                                <th className="border-b px-4 py-2">Datos</th>
                                <th className="border-b px-4 py-2">Creado por</th>
                                <th className="border-b px-4 py-2">Fecha</th>
                                <th className="border-b px-4 py-2">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tareas.map((tarea) => {
                                const fecha = tarea?.fechaCreacion || tarea?.createdAt || tarea?.fecha || null;
                                const creador = tarea?.creador?.nombre_completo || 'Desconocido';

                                return (
                                    <tr key={tarea.id} className="border-t text-sm hover:bg-gray-50">
                                        <td className="px-4 py-2">
                                            <TipoBadge tipo={tarea.tipo} />
                                        </td>
                                        <td className="px-4 py-2 align-top">
                                            <DatosTarea tarea={tarea} />
                                        </td>
                                        <td className="px-4 py-2">{creador}</td>
                                        <td className="px-4 py-2">
                                            <span className="inline-flex items-center rounded bg-slate-50 px-2 py-0.5 text-[12px] text-slate-700 ring-1 ring-slate-200">
                                                {formatFecha(fecha)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2">
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => confirmarAccion(tarea.id, 'aprobar')}
                                                    className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                                                >
                                                    Aprobar
                                                </button>
                                                <button
                                                    onClick={() => confirmarAccion(tarea.id, 'rechazar')}
                                                    className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                                                >
                                                    Rechazar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default TareasPendientes;