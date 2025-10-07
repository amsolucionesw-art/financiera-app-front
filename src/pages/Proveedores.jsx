// src/pages/Proveedores.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import {
    listarProveedores,
    eliminarProveedor,
} from '../services/proveedorService';
import ProveedorForm from './ProveedorForm';

// Íconos (coherencia con el resto de la app)
import {
    Plus,
    RefreshCw,
    Search,
    Edit3,
    Trash2,
    ChevronLeft,
    ChevronRight,
    Building2,
} from 'lucide-react';

// Tamaño de página por defecto
const PAGE_SIZE = 10;

/* ───────────────── Hook pequeño para debounce ───────────────── */
function useDebouncedValue(value, delay = 300) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

export default function Proveedores() {
    // ======= Estado UI / Filtros =======
    const [search, setSearch] = useState('');
    const [rubro, setRubro] = useState('');
    const [estado, setEstado] = useState('activos'); // 'activos' | 'inactivos' | 'todos'
    const [orderBy, setOrderBy] = useState('nombre_razon_social');
    const [orderDir, setOrderDir] = useState('ASC');

    // Debounce para inputs de texto
    const debouncedSearch = useDebouncedValue(search, 300);
    const debouncedRubro  = useDebouncedValue(rubro, 300);

    // ======= Estado listado =======
    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    // ======= Paginación =======
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [offset, setOffset] = useState(0);

    // ======= Modal (crear/editar) =======
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState(null); // {id, ...campos} o null

    const page = useMemo(() => Math.floor(offset / limit) + 1, [offset, limit]);
    const canPrev = offset > 0;
    const canNext = (offset + limit) < (total || Infinity);

    // Reset a primera página cuando cambian filtros de texto o estado
    useEffect(() => {
        setOffset(0);
    }, [debouncedSearch, debouncedRubro, estado]);

    // Mapea el filtro "estado" a params para la API
    const buildParams = () => {
        const base = {
            search: debouncedSearch.trim(),
            rubro: debouncedRubro.trim(),
            orderBy,
            orderDir,
            limit,
            offset,
        };
        if (estado === 'activos') return { ...base, activo: true };
        if (estado === 'inactivos') return { ...base, activo: false };
        // 'todos' -> sin 'activo' y con incluirTodos=true para que el back no filtre por defecto
        return { ...base, incluirTodos: true };
    };

    // ======= Fetch Listado =======
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setErr('');
            const params = buildParams();
            const res = await listarProveedores(params);

            // Contrato esperado del back: { success, data, count, ... }
            const rows = res?.data ?? res?.rows ?? (Array.isArray(res) ? res : []);
            const count = Number(res?.count ?? res?.total ?? (Array.isArray(res) ? res.length : 0));

            setData(rows);
            setTotal(Number.isFinite(count) ? count : rows.length);
        } catch (e) {
            console.error(e);
            setErr(e?.message || 'No se pudo cargar el listado de proveedores.');
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearch, debouncedRubro, estado, orderBy, orderDir, limit, offset]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ======= Acciones =======
    const handleRefresh = () => fetchData();

    const handleNew = () => {
        setEditing(null);
        setIsModalOpen(true);
    };

    const handleEdit = (row) => {
        setEditing(row);
        setIsModalOpen(true);
    };

    const handleDelete = async (row) => {
        const { isConfirmed } = await Swal.fire({
            icon: 'warning',
            title: 'Eliminar proveedor',
            text: `¿Seguro que querés eliminar a "${row?.nombre_razon_social}"? Esta acción no se puede deshacer.`,
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc2626',
        });
        if (!isConfirmed) return;

        try {
            await eliminarProveedor(row.id);
            Swal.fire({
                icon: 'success',
                title: 'Proveedor eliminado',
                timer: 1300,
                showConfirmButton: false,
            });
            // Si borramos el último de la página, retrocedemos una página para no quedar en vacío
            if (data.length === 1 && offset >= limit) {
                setOffset((o) => o - limit);
            } else {
                fetchData();
            }
        } catch (e) {
            console.error(e);
            Swal.fire({
                icon: 'error',
                title: 'No se pudo eliminar',
                text: e?.message || 'Ocurrió un problema al eliminar el proveedor.',
            });
        }
    };

    const handleSaved = () => {
        // Al guardar (crear/editar), recargamos y cerramos modal (defensivo)
        setIsModalOpen(false);
        fetchData();
    };

    // ======= Helpers UI =======
    const toggleSort = (field) => {
        if (orderBy === field) {
            setOrderDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
        } else {
            setOrderBy(field);
            setOrderDir('ASC');
        }
        // Reset a primera página al cambiar orden
        setOffset(0);
    };

    const goPrev = () => {
        if (!canPrev) return;
        setOffset((o) => Math.max(0, o - limit));
    };

    const goNext = () => {
        if (!total) {
            if (data.length < limit) return;
            setOffset((o) => o + limit);
            return;
        }
        if (!canNext) return;
        setOffset((o) => o + limit);
    };

    const clearFilters = () => {
        setSearch('');
        setRubro('');
        setEstado('activos');
        setOrderBy('nombre_razon_social');
        setOrderDir('ASC');
        setOffset(0);
        setLimit(PAGE_SIZE);
        // No llamamos fetchData aquí: el efecto lo hará con los nuevos estados
    };

    return (
        <div className="mx-auto max-w-7xl px-2 py-4 sm:px-4">
            {/* Header */}
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                    <Building2 className="h-6 w-6" />
                    <h1 className="text-xl font-semibold">Proveedores</h1>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleRefresh}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        title="Actualizar"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Actualizar
                    </button>
                    <button
                        onClick={handleNew}
                        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        <Plus className="h-4 w-4" />
                        Nuevo proveedor
                    </button>
                </div>
            </div>

            {/* Filtros (sin form, filtro en vivo con debounce) */}
            <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-7">
                <div className="sm:col-span-3">
                    <label className="mb-1 block text-sm font-medium">Buscar</label>
                    <div className="relative">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Nombre / Razón social / CUIT / Email / Teléfono"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 outline-none focus:ring focus:ring-gray-200"
                        />
                        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    </div>
                </div>

                <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium">Rubro</label>
                    <input
                        type="text"
                        value={rubro}
                        onChange={(e) => setRubro(e.target.value)}
                        placeholder="Ej: Informática"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring focus:ring-gray-200"
                    />
                </div>

                <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium">Estado</label>
                    <select
                        value={estado}
                        onChange={(e) => setEstado(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring focus:ring-gray-200"
                    >
                        <option value="activos">Activos</option>
                        <option value="inactivos">Inactivos</option>
                        <option value="todos">Todos</option>
                    </select>
                </div>

                <div className="flex items-end gap-2 sm:col-span-7">
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 sm:w-auto"
                    >
                        Limpiar
                    </button>
                </div>
            </div>

            {/* Estado */}
            {err && (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {err}
                </div>
            )}

            {/* Tabla Desktop con scroll horizontal */}
            <div className="hidden rounded-lg border border-gray-200 bg-white sm:block">
                <div className="overflow-x-auto">
                    <table className="min-w-[1100px] divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <Th
                                    active={orderBy === 'nombre_razon_social'}
                                    dir={orderDir}
                                    onClick={() => toggleSort('nombre_razon_social')}
                                >
                                    Nombre / Razón social
                                </Th>
                                <Th
                                    active={orderBy === 'cuil_cuit'}
                                    dir={orderDir}
                                    onClick={() => toggleSort('cuil_cuit')}
                                >
                                    CUIT/CUIL
                                </Th>
                                <Th>Rubro</Th>
                                <Th>Teléfono</Th>
                                <Th>Email</Th>
                                <Th>Ciudad</Th>
                                <Th>Provincia</Th>
                                <Th className="text-right">Acciones</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="p-6 text-center text-sm text-gray-500">
                                        Cargando…
                                    </td>
                                </tr>
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-6 text-center text-sm text-gray-500">
                                        No hay proveedores para mostrar.
                                    </td>
                                </tr>
                            ) : (
                                data.map((row) => (
                                    <tr key={row.id} className="hover:bg-gray-50">
                                        <Td className="font-medium">
                                            {row.nombre_razon_social ?? '—'}
                                            {!row.activo && (
                                                <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                                                    Inactivo
                                                </span>
                                            )}
                                        </Td>
                                        <Td>{row.cuil_cuit || '—'}</Td>
                                        <Td>{row.rubro || '—'}</Td>
                                        <Td>{row.telefono || '—'}</Td>
                                        <Td>
                                            {row.email ? (
                                                <a className="text-blue-600 hover:underline" href={`mailto:${row.email}`}>
                                                    {row.email}
                                                </a>
                                            ) : (
                                                '—'
                                            )}
                                        </Td>
                                        <Td>{row.ciudad || '—'}</Td>
                                        <Td>{row.provincia || '—'}</Td>
                                        <Td className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleEdit(row)}
                                                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                                                    title="Editar"
                                                >
                                                    <Edit3 className="h-4 w-4" />
                                                    Editar
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(row)}
                                                    className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    Eliminar
                                                </button>
                                            </div>
                                        </Td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Cards Mobile */}
            <div className="space-y-3 sm:hidden">
                {loading ? (
                    <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
                        Cargando…
                    </div>
                ) : data.length === 0 ? (
                    <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
                        No hay proveedores para mostrar.
                    </div>
                ) : (
                    data.map((row) => (
                        <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <div className="font-semibold">{row.nombre_razon_social ?? '—'}</div>
                                {!row.activo && (
                                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                                        Inactivo
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                <div className="text-gray-500">CUIT/CUIL</div>
                                <div>{row.cuil_cuit || '—'}</div>

                                <div className="text-gray-500">Rubro</div>
                                <div>{row.rubro || '—'}</div>

                                <div className="text-gray-500">Teléfono</div>
                                <div>{row.telefono || '—'}</div>

                                <div className="text-gray-500">Email</div>
                                <div>
                                    {row.email ? (
                                        <a className="text-blue-600 hover:underline" href={`mailto:${row.email}`}>
                                            {row.email}
                                        </a>
                                    ) : (
                                        '—'
                                    )}
                                </div>

                                <div className="text-gray-500">Ciudad</div>
                                <div>{row.ciudad || '—'}</div>

                                <div className="text-gray-500">Provincia</div>
                                <div>{row.provincia || '—'}</div>
                            </div>

                            <div className="mt-3 flex justify-end gap-2">
                                <button
                                    onClick={() => handleEdit(row)}
                                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                                    title="Editar"
                                >
                                    <Edit3 className="h-4 w-4" />
                                    Editar
                                </button>
                                <button
                                    onClick={() => handleDelete(row)}
                                    className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                                    title="Eliminar"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Eliminar
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Paginación */}
            <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                    Página <span className="font-medium">{page}</span>
                    {total ? (
                        <>
                            {' '}· {Math.min(offset + 1, total)}–{Math.min(offset + data.length, total)} de {total}
                        </>
                    ) : (
                        data.length > 0 && ` · mostrando ${data.length} registros`
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Filas</label>
                    <select
                        value={limit}
                        onChange={(e) => {
                            setLimit(Number(e.target.value) || PAGE_SIZE);
                            setOffset(0);
                        }}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    >
                        {[10, 20, 50, 100].map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={goPrev}
                        disabled={!canPrev}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
                        title="Anterior"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                    </button>
                    <button
                        onClick={goNext}
                        disabled={total ? !canNext : data.length < limit}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
                        title="Siguiente"
                    >
                        Siguiente
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Modal Crear/Editar */}
            <ProveedorForm
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSaved={handleSaved}
                initialData={editing}
            />
        </div>
    );
}

/* ====== Subcomponentes de tabla para ordenar / celdas ====== */

function Th({ children, active = false, dir = 'ASC', onClick, className = '' }) {
    return (
        <th
            onClick={onClick}
            className={
                'cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 ' +
                (active ? 'bg-gray-100 ' : '') +
                className
            }
        >
            <div className="flex items-center gap-1">
                <span>{children}</span>
                {onClick && (
                    <span className="text-gray-400">{active ? (dir === 'ASC' ? '▲' : '▼') : ''}</span>
                )}
            </div>
        </th>
    );
}

function Td({ children, className = '' }) {
    return <td className={'whitespace-nowrap px-4 py-3 text-sm ' + className}>{children}</td>;
}
