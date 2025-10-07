// src/components/CreditItem.jsx
import { useMemo } from 'react';
import { Pencil, Trash2, Eye, Ban } from 'lucide-react';
import { jwtDecode } from 'jwt-decode';

const formatARS = (n) =>
    Number(n || 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

const estadoBadgeClasses = (estadoRaw) => {
    const estado = (estadoRaw || '').toLowerCase();
    switch (estado) {
        case 'pagado':
            return 'bg-green-100 text-green-700 ring-green-200';
        case 'pendiente':
            return 'bg-yellow-100 text-yellow-700 ring-yellow-200';
        case 'vencido':
            return 'bg-red-100 text-red-700 ring-red-200';
        case 'anulado':
            return 'bg-gray-100 text-gray-600 ring-gray-200';
        case 'refinanciado':
            return 'bg-purple-100 text-purple-700 ring-purple-200';
        default:
            return 'bg-blue-100 text-blue-700 ring-blue-200';
    }
};

const modalidadBadgeClasses = (mod = '') => {
    const m = (mod || '').toLowerCase();
    switch (m) {
        case 'libre':
            return 'bg-sky-100 text-sky-700 ring-sky-200';
        case 'progresivo':
            return 'bg-amber-100 text-amber-700 ring-amber-200';
        case 'comun':
        default:
            return 'bg-slate-100 text-slate-700 ring-slate-200';
    }
};

const Button = ({ children, className = '', title, onClick, ariaLabel }) => (
    <button
        onClick={onClick}
        title={title}
        aria-label={ariaLabel || title}
        className={[
            'inline-flex items-center justify-center gap-2',
            'h-9 px-3 rounded-md',
            'text-xs sm:text-sm',
            'transition focus:outline-none focus:ring-2',
            className
        ].join(' ')}
    >
        {children}
    </button>
);

const CreditItem = ({ c, onEdit, onDelete, onView }) => {
    const montoTotal = c.monto_total_devolver ?? c.monto ?? c.monto_acreditar ?? 0;
    const saldoActual = c.saldo_actual ?? null;

    const tipo = c.tipo_credito ?? '';
    const cuotas = c.cantidad_cuotas ?? null;
    const modalidad = c.modalidad_credito ?? '';
    const isLibre = String(modalidad).toLowerCase() === 'libre';

    const fechaAcred = c.fecha_acreditacion ? String(c.fecha_acreditacion).split('T')[0] : null;

    // Rol → número seguro
    const token = localStorage.getItem('token');
    const decoded = useMemo(() => (token ? jwtDecode(token) : {}), [token]);
    const rol_id = useMemo(
        () => Number(decoded?.rol_id ?? decoded?.rolId ?? decoded?.roleId ?? NaN),
        [decoded]
    );
    const esSuperAdmin = rol_id === 0;

    const estado = c.estado ?? '—';
    const estaAnulado = String(estado).toLowerCase() === 'anulado';

    return (
        <section className="grid grid-cols-1 gap-4 rounded-xl bg-white p-4 shadow ring-1 ring-gray-200 md:grid-cols-12 md:items-center">
            {/* Col izquierda: info (9) */}
            <div className="md:col-span-9 min-w-0">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
                    {/* Monto */}
                    <div className="min-w-0">
                        <div className="text-xs sm:text-sm text-gray-600">
                            {isLibre ? 'Total (ciclo de referencia)' : 'Total a devolver'}
                        </div>
                        <div className="text-base sm:text-lg md:text-xl font-semibold text-gray-900">
                            {formatARS(montoTotal)}
                        </div>
                        {saldoActual !== null && (
                            <div className="text-[11px] sm:text-xs text-gray-500">
                                Saldo actual:{' '}
                                <span className="font-medium text-gray-700">{formatARS(saldoActual)}</span>
                            </div>
                        )}
                    </div>

                    {/* Estado + plan + modalidad */}
                    <div className="min-w-0 space-y-2">
                        {/* Estado */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-medium ring-1 ring-inset ${estadoBadgeClasses(
                                    estado
                                )}`}
                                title={`Estado: ${estado}`}
                            >
                                {estado}
                            </span>

                            {modalidad && (
                                <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-medium ring-1 ring-inset ${modalidadBadgeClasses(
                                        modalidad
                                    )}`}
                                    title={`Modalidad: ${modalidad}`}
                                >
                                    {modalidad}
                                </span>
                            )}
                        </div>

                        {/* Plan */}
                        <div className="text-[11px] sm:text-xs text-gray-600">
                            {tipo ? (
                                <span className="inline-block">
                                    Plan:{' '}
                                    <span className="font-medium text-gray-800 capitalize">{tipo}</span>
                                    {cuotas ? (
                                        <>
                                            {' '}
                                            · <span className="font-medium">{cuotas}</span> cuota(s)
                                            {isLibre ? ' (abierta)' : ''}
                                        </>
                                    ) : null}
                                </span>
                            ) : (
                                <span className="inline-block text-gray-500">Plan no especificado</span>
                            )}
                        </div>

                        {/* Interés (total o por ciclo) */}
                        <div className="text-[11px] sm:text-xs text-gray-600">
                            {isLibre ? (
                                <>
                                    Interés por ciclo:{' '}
                                    <span className="font-medium text-gray-800">{Number(c.interes ?? 0)}%</span>
                                </>
                            ) : (
                                <>
                                    Interés total:{' '}
                                    <span className="font-medium text-gray-800">{Number(c.interes ?? 0)}%</span>
                                </>
                            )}
                        </div>

                        {/* Fecha acreditación */}
                        {fechaAcred && (
                            <div className="text-[11px] sm:text-xs text-gray-600">
                                Acreditado: <span className="font-medium text-gray-800">{fechaAcred}</span>
                            </div>
                        )}
                    </div>

                    {/* Observaciones (resumidas) */}
                    <div className="min-w-0 text-[11px] sm:text-xs text-gray-500 break-words">
                        {c.observaciones ? (
                            <>
                                <span className="font-medium text-gray-700">Observaciones: </span>
                                <span className="text-gray-600">{c.observaciones}</span>
                            </>
                        ) : (
                            '—'
                        )}
                    </div>
                </div>

                {c.id && (
                    <div className="mt-2 text-[10px] sm:text-[11px] text-gray-400">ID crédito: #{c.id}</div>
                )}
            </div>

            {/* Col derecha: acciones (3) */}
            <div className="md:col-span-3 flex flex-wrap items-center justify-start gap-2 md:justify-end">
                {!estaAnulado && (
                    <Button
                        onClick={() => onEdit(c)}
                        title="Editar crédito"
                        className="border border-yellow-500 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 focus:ring-yellow-500"
                    >
                        <Pencil size={16} />
                        <span className="hidden md:inline">Editar</span>
                    </Button>
                )}

                {!estaAnulado &&
                    (esSuperAdmin ? (
                        <Button
                            onClick={() => onDelete(c.id)}
                            title="Eliminar crédito"
                            className="border border-red-500 bg-red-50 text-red-700 hover:bg-red-100 focus:ring-red-500"
                        >
                            <Trash2 size={16} />
                            <span className="hidden md:inline whitespace-nowrap">Eliminar</span>
                        </Button>
                    ) : (
                        <Button
                            onClick={() => onDelete(c.id)}
                            title="Solicitar anulación"
                            className="border border-orange-500 bg-orange-50 text-orange-700 hover:bg-orange-100 focus:ring-orange-500"
                        >
                            <Ban size={16} />
                            <span className="hidden md:inline whitespace-nowrap">Solicitar anulación</span>
                        </Button>
                    ))}

                <Button
                    onClick={() => onView(c)}
                    title="Ver ficha"
                    className="border border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100 focus:ring-blue-500"
                >
                    <Eye size={16} />
                    <span className="hidden md:inline whitespace-nowrap">Ver ficha</span>
                </Button>
            </div>

            {estaAnulado && (
                <div className="md:col-span-12 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 ring-1 ring-gray-200">
                    Este crédito está <span className="font-medium">anulado</span>. No es posible editarlo ni
                    solicitar acciones adicionales. Podés revisar su ficha para ver el historial.
                </div>
            )}
        </section>
    );
};

export default CreditItem;
