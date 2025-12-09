// src/pages/CrearCredito.jsx
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { obtenerCobradoresBasico } from '../services/usuarioService';
import { obtenerClientesBasico, obtenerClientePorId } from '../services/clienteService';
import { crearCredito } from '../services/creditoService';
import CreditForm from '../components/CreditForm';

const inputClass =
    'w-full rounded-md border-gray-300 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-blue-200';

const Select = ({ label, value, onChange, options, placeholder = 'Seleccione…', disabled = false }) => (
    <div>
        <label className="mb-1 block text-sm">{label}</label>
        <select
            className={inputClass}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            disabled={disabled}
        >
            <option value="">{placeholder}</option>
            {options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                    {opt.label}
                </option>
            ))}
        </select>
    </div>
);

const CrearCredito = () => {
    const navigate = useNavigate();
    const params = useParams();                 // soporta /creditos/nuevo/:clienteId
    const [searchParams] = useSearchParams();   // soporta ?clienteId=&cobradorId=

    // Prioridad: path param > querystring
    const pathClienteId = params?.clienteId ? Number(params.clienteId) : null;
    const qsClienteId = searchParams.get('clienteId');
    const qsCobradorId = searchParams.get('cobradorId');

    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    const [cobradores, setCobradores] = useState([]); // {id, nombre_completo}
    const [clientes, setClientes] = useState([]);     // {id, nombre, apellido, cobrador, zona}

    const [cobradorSel, setCobradorSel] = useState(null);
    const [clienteSel, setClienteSel] = useState(null);

    const [enviando, setEnviando] = useState(false);

    const opcionesCobradores = useMemo(
        () => (cobradores || []).map(c => ({ id: c.id, label: c.nombre_completo })),
        [cobradores]
    );

    const opcionesClientes = useMemo(
        () => (clientes || []).map(c => ({ id: c.id, label: [c.apellido, c.nombre].filter(Boolean).join(', ') })),
        [clientes]
    );

    // Carga inicial (cobradores + posibles preselecciones)
    useEffect(() => {
        let mounted = true;

        const cargar = async () => {
            setCargando(true);
            setError('');
            try {
                const _cobradores = await obtenerCobradoresBasico();
                if (!mounted) return;
                setCobradores(Array.isArray(_cobradores) ? _cobradores : []);

                // Preselecciones
                const preClienteId =
                    pathClienteId ?? (qsClienteId ? Number(qsClienteId) : null);
                let preCobradorId = qsCobradorId ? Number(qsCobradorId) : null;

                // Si viene cliente y no viene cobrador, inferimos su cobrador
                if (preClienteId && !preCobradorId) {
                    try {
                        const cli = await obtenerClientePorId(preClienteId);
                        if (cli?.cobradorUsuario?.id) preCobradorId = Number(cli.cobradorUsuario.id);
                    } catch {
                        /* noop */
                    }
                }

                if (preCobradorId) setCobradorSel(preCobradorId);

                const _clientes = await obtenerClientesBasico(
                    preCobradorId ? { cobrador: preCobradorId } : {}
                );
                if (!mounted) return;
                setClientes(Array.isArray(_clientes) ? _clientes : []);

                if (preClienteId) {
                    const exists = (Array.isArray(_clientes) ? _clientes : []).some(c => Number(c.id) === preClienteId);
                    if (!exists) {
                        // si el cliente no entra por filtro, lo agregamos para poder seleccionarlo
                        try {
                            const cli = await obtenerClientePorId(preClienteId);
                            if (cli) {
                                const item = {
                                    id: cli.id,
                                    nombre: cli.nombre,
                                    apellido: cli.apellido,
                                    cobrador: cli.cobrador ?? cli?.cobradorUsuario?.id ?? null,
                                    zona: cli.zona ?? cli?.clienteZona?.id ?? null
                                };
                                setClientes(prev =>
                                    Array.isArray(prev) && prev.some(p => Number(p.id) === Number(item.id))
                                        ? prev
                                        : [...(prev || []), item]
                                );
                            }
                        } catch {
                            /* noop */
                        }
                    }
                    setClienteSel(preClienteId);
                }
            } catch (e) {
                setError(e?.message || 'Error cargando datos');
            } finally {
                if (mounted) setCargando(false);
            }
        };

        cargar();
        return () => { mounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Al cambiar cobrador → recargar clientes filtrados y validar selección previa
    useEffect(() => {
        let mounted = true;
        const fetchClientes = async () => {
            try {
                const resp = await obtenerClientesBasico(
                    cobradorSel == null ? {} : { cobrador: cobradorSel }
                );
                if (!mounted) return;
                const arr = Array.isArray(resp) ? resp : [];
                setClientes(arr);

                if (clienteSel != null) {
                    const pertenece = arr.some(c => Number(c.id) === Number(clienteSel));
                    if (!pertenece) setClienteSel(null);
                }
            } catch (e) {
                if (mounted) setError(e?.message || 'Error cargando clientes');
            }
        };
        fetchClientes();
        return () => { mounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cobradorSel]);

    // Si eligen cliente primero → sincronizar cobrador si aplica
    useEffect(() => {
        if (clienteSel == null) return;
        const cli = (clientes || []).find(c => Number(c.id) === Number(clienteSel));
        if (!cli) return;
        const cobradorDeCliente = cli?.cobrador ? Number(cli.cobrador) : null;
        if (cobradorDeCliente && cobradorSel !== cobradorDeCliente) {
            setCobradorSel(cobradorDeCliente);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clienteSel]);

    const puedeMostrarForm = clienteSel != null && cobradorSel != null;

    const extraerNuevoId = (resp) => {
        if (resp == null) return null;
        if (typeof resp === 'number') return resp;
        if (typeof resp === 'string' && /^\d+$/.test(resp)) return Number(resp);
        if (typeof resp === 'object') {
            if (typeof resp.id === 'number') return resp.id;
            if (resp.data) {
                if (typeof resp.data.id === 'number') return resp.data.id;
                if (resp.data.data && typeof resp.data.data.id === 'number') return resp.data.data.id;
            }
        }
        return null;
    };

    const handleCrear = async (formPayload) => {
        if (!puedeMostrarForm || enviando) return;
        setEnviando(true);
        setError('');
        try {
            const payload = {
                ...formPayload,
                cliente_id: Number(clienteSel),
                cobrador_id: Number(formPayload.cobrador_id || cobradorSel)
            };

            // Nota: CreditForm ya asegura reglas de LIBRE (tipo mensual, 1 cuota, interés=60)
            const resp = await crearCredito(payload);

            const nuevoId = extraerNuevoId(resp);
            if (nuevoId) {
                navigate(`/creditos/${nuevoId}`, { replace: true });
            } else {
                // Fallback: vamos al listado del cliente (ruta existente)
                navigate(`/creditos/cliente/${payload.cliente_id}`, { replace: true });
            }
        } catch (e) {
            setError(e?.message || 'Error al crear crédito');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-4">
            <header className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h1 className="text-lg font-semibold">Crear crédito (modo rápido)</h1>
                <p className="text-sm text-gray-500">
                    Seleccioná primero el cobrador o el cliente. El resto se filtra automáticamente.
                </p>
            </header>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                {error && (
                    <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
                        {error}
                    </div>
                )}
                {cargando ? (
                    <p className="text-sm text-gray-500">Cargando…</p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Select
                            label="Cobrador"
                            value={cobradorSel}
                            onChange={setCobradorSel}
                            options={opcionesCobradores}
                            placeholder="Seleccione cobrador"
                            disabled={enviando}
                        />
                        <Select
                            label="Cliente"
                            value={clienteSel}
                            onChange={setClienteSel}
                            options={opcionesClientes}
                            placeholder={cobradorSel ? 'Clientes del cobrador' : 'Todos los clientes'}
                            disabled={enviando}
                        />
                    </div>
                )}
            </section>

            {puedeMostrarForm && (
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <CreditForm
                        mostrarCobrador={false}     // ocultamos el select interno para no duplicar UI
                        cobradores={cobradores}     // igualmente pasamos la lista por si el form la necesitara
                        defaultValues={{
                            cobrador_id: Number(cobradorSel),
                            modalidad_credito: 'comun',
                            tipo_credito: '',
                            cantidad_cuotas: '',
                            interes: 0
                        }}
                        onCancel={() => setClienteSel(null)}
                        onSubmit={handleCrear}
                        submitting={enviando}
                    />
                </section>
            )}
        </div>
    );
};

export default CrearCredito;