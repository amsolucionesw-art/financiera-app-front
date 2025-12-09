// src/components/CreditItem.jsx
import { useMemo } from 'react';
import { Trash2, Eye, Ban } from 'lucide-react';
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

// Etiqueta visible según modalidad (sin cambiar el value esperado por el backend)
const modalidadLabel = (mod = '') => {
    const m = (mod || '').toLowerCase();
    if (m === 'comun') return 'Plan de Cuotas Fijas';
    if (m === 'progresivo') return 'Progresivo';
    if (m === 'libre') return 'Libre';
    return mod || '—';
};

const Button = ({ children, className = '', title, onClick, ariaLabel, disabled = false }) => (
    <button
        onClick={onClick}
        title={title}
        aria-label={ariaLabel || title}
        disabled={disabled}
        className={[
            'inline-flex items-center justify-center gap-2',
            'h-9 px-3 rounded-md',
            'text-xs sm:text-sm',
            'transition focus:outline-none focus:ring-2',
            disabled ? 'opacity-50 cursor-not-allowed' : '',
            className
        ].join(' ')}
    >
        {children}
    </button>
);

const CreditItem = ({ c, onDelete, onView }) => {
    const montoTotal = c.monto_total_devolver ?? c.monto ?? c.monto_acreditar ?? 0;
    const saldoActual = c.saldo_actual ?? null;
    const totalActual = Number.isFinite(Number(c.total_actual)) ? Number(c.total_actual) : null;

    const tipo = c.tipo_credito ?? '';
    const cuotas = c.cantidad_cuotas ?? null;
    const modalidad = c.modalidad_credito ?? '';
    const isLibre = String(modalidad).toLowerCase() === 'libre';

    const fechaAcred = c.fecha_acreditacion ? String(c.fecha_acreditacion).split('T')[0] : null;

    // Rol → número seguro
    const token = localStorage.getItem('token');
    const decoded = useMemo(() => {
        try { return token ? jwtDecode(token) : {}; } catch { return {}; }
    }, [token]);
    const rol_id = useMemo(
        () => Number(decoded?.rol_id ?? decoded?.rolId ?? decoded?.roleId ?? NaN),
        [decoded]
    );
    const esSuperAdmin = rol_id === 0;

    const estado = c.estado ?? '—';
    const estaAnulado = String(estado).toLowerCase() === 'anulado';

    // Indicadores de refinanciación
    const esNuevoRefinanciado = Boolean(c.id_credito_origen);                 // R verde
    const esCreditoRefinanciadoOriginal = String(estado).toLowerCase() === 'refinanciado'; // R roja

    // Bloquear acciones de eliminación/solicitud en el crédito original refinanciado o anulado
    const bloquearAcciones = estaAnulado || esCreditoRefinanciadoOriginal;

    return (
        <section className="grid grid-cols-1 gap-4 rounded-xl bg-white p-4 shadow ring-1 ring-gray-200 md:grid-cols-12 md:items-center">
            {/* Col izquierda: info (9) */}
            <div className="min-w-0 md:col-span-9">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-6">
                    {/* Monto / saldos */}
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

                        {totalActual !== null && !Number.isNaN(totalActual) && (
                            <div className="text-[11px] sm:text-xs text-gray-500">
                                TOTAL ACTUAL:{' '}
                                <span
                                    className="font-semibold text-gray-800"
                                    title="Suma de principal pendiente + mora (o capital + mora en Libre)"
                                >
                                    {formatARS(totalActual)}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Estado + plan + modalidad */}
                    <div className="min-w-0 space-y-2">
                        {/* Estado + Modalidad + Indicadores R */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Estado */}
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-medium ring-1 ring-inset ${estadoBadgeClasses(
                                    estado
                                )}`}
                                title={`Estado: ${estado}`}
                            >
                                {estado}
                            </span>

                            {/* Modalidad (texto actualizado) */}
                            {modalidad && (
                                <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-medium ring-1 ring-inset ${modalidadBadgeClasses(
                                        modalidad
                                    )}`}
                                    title={`Modalidad: ${modalidadLabel(modalidad)}`}
                                >
                                    {modalidadLabel(modalidad)}
                                </span>
                            )}

                            {/* Indicadores R */}
                            {esNuevoRefinanciado && (
                                <span
                                    title={`Nuevo crédito refinanciado (R verde). Origen: #${c.id_credito_origen ?? 'N/D'}`}
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-extrabold leading-none text-white"
                                >
                                    R
                                </span>
                            )}
                            {esCreditoRefinanciadoOriginal && (
                                <span
                                    title="Crédito original refinanciado (R roja). Las acciones están deshabilitadas."
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[11px] font-extrabold leading-none text-white"
                                >
                                    R
                                </span>
                            )}

                            {/* Etiqueta extra si es nuevo refinanciado para referenciar origen */}
                            {esNuevoRefinanciado && c.id_credito_origen && (
                                <span
                                    className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                                    title={`Refinanciado desde crédito #${c.id_credito_origen}`}
                                >
                                    Refi de #{c.id_credito_origen}
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
                    <div className="min-w-0 break-words text-[11px] sm:text-xs text-gray-500">
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

            {/* Col derecha: acciones (solo eliminar / solicitar anulación / ver) */}
            <div className="flex flex-wrap items-center justify-start gap-2 md:col-span-3 md:justify-end">
                {!estaAnulado &&
                    (esSuperAdmin ? (
                        <Button
                            onClick={() => onDelete(c)}  // Eliminar (superadmin)
                            title={
                                bloquearAcciones
                                    ? 'Eliminar deshabilitado: crédito refinanciado / anulado'
                                    : 'Eliminar crédito'
                            }
                            disabled={bloquearAcciones}
                            className="border border-red-500 bg-red-50 text-red-700 hover:bg-red-100 focus:ring-red-500"
                        >
                            <Trash2 size={16} />
                            <span className="hidden md:inline whitespace-nowrap">Eliminar</span>
                        </Button>
                    ) : (
                        <Button
                            onClick={() => onDelete(c)}  // Solicitar anulación (admin)
                            title={
                                bloquearAcciones
                                    ? 'Solicitar anulación deshabilitado: crédito refinanciado / anulado'
                                    : 'Solicitar anulación'
                            }
                            disabled={bloquearAcciones}
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
                    Este crédito está <span className="font-medium">anulado</span>. No es posible solicitar acciones adicionales. Podés revisar su ficha para ver el historial.
                </div>
            )}

            {esCreditoRefinanciadoOriginal && (
                <div className="md:col-span-12 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                    Este crédito fue <span className="font-semibold">refinanciado</span>. Las acciones están deshabilitadas. Usá el nuevo crédito (marcado con{' '}
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-extrabold leading-none text-white align-middle">R</span>{' '}
                    verde) para continuar la gestión.
                </div>
            )}
        </section>
    );
};

export default CreditItem;

