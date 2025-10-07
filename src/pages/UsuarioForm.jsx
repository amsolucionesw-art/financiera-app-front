import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { CheckCircle2, X } from 'lucide-react';
import Swal from 'sweetalert2';
import {
    obtenerUsuarioPorId,
    crearUsuario,
    actualizarUsuario,
    obtenerZonas,
    obtenerMiPerfil
} from '../services/usuarioService';

const UsuarioForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const esEdicion = Boolean(id);

    const {
        register,
        control,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting }
    } = useForm();

    const [usuario, setUsuario] = useState(null);
    const [zonas, setZonas] = useState([]);
    const [miPerfil, setMiPerfil] = useState(null);

    const rolSeleccionado = useWatch({ control, name: 'rol_id' });

    useEffect(() => {
        const cargarDatos = async () => {
            try {
                const perfil = await obtenerMiPerfil();
                setMiPerfil(perfil || null);

                if (esEdicion) {
                    // ⬇️ ACA estaba el bug: NO usar res.data (ya viene “desenvuelto” por apiClient)
                    const data = await obtenerUsuarioPorId(id);
                    if (!data) {
                        throw new Error('Usuario no encontrado');
                    }

                    setUsuario(data);

                    reset({
                        nombre_completo: data.nombre_completo || '',
                        // soporta ambas propiedades según backend (nombre_usuario o username)
                        nombre_usuario: data.nombre_usuario ?? data.username ?? '',
                        password: '',
                        rol_id: data.rol_id != null ? String(data.rol_id) : '',
                        zona_ids: Array.isArray(data.zonas)
                            ? data.zonas.map(z => String(z.id))
                            : []
                    });
                }
            } catch (e) {
                console.error('Error cargando perfil/usuario:', e);
                Swal.fire('Error', 'No se pudo cargar el usuario o perfil', 'error');
            }
        };

        cargarDatos();
    }, [esEdicion, id, reset]);

    useEffect(() => {
        if (rolSeleccionado === '2') {
            obtenerZonas()
                .then(data => setZonas(Array.isArray(data) ? data : []))
                .catch(() => Swal.fire('Error', 'No se cargaron zonas', 'error'));
        } else {
            setZonas([]);
        }
    }, [rolSeleccionado]);

    const rolesDisponibles = useMemo(() => {
        const base = [
            { id: 1, nombre: 'admin' },
            { id: 2, nombre: 'cobrador' }
        ];
        if (miPerfil?.rol_id === 0) {
            base.unshift({ id: 0, nombre: 'super_admin' });
        }
        return base;
    }, [miPerfil]);

    const onSubmit = async (data) => {
        try {
            if (data.rol_id === '2' && (!data.zona_ids || data.zona_ids.length === 0)) {
                return Swal.fire('Error', 'Selecciona al menos una zona para el cobrador', 'warning');
            }

            const payload = {
                nombre_completo: data.nombre_completo,
                nombre_usuario: data.nombre_usuario,
                password: data.password,
                rol_id: parseInt(data.rol_id, 10),
                ...(data.zona_ids ? { zona_ids: data.zona_ids.map(z => parseInt(z, 10)) } : {})
            };

            if (esEdicion) {
                await actualizarUsuario(id, payload);
                Swal.fire('Éxito', 'Usuario actualizado', 'success');
            } else {
                await crearUsuario(payload);
                Swal.fire('Éxito', 'Usuario creado', 'success');
            }

            navigate('/usuarios');
        } catch (err) {
            console.error('Error guardando usuario:', err);
            Swal.fire('Error', err.message || 'No se pudo guardar el usuario', 'error');
        }
    };

    const inputClass =
        'w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-blue-200';

    return (
        <div className="max-w-3xl mx-auto bg-white shadow ring-1 ring-gray-200 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-6 text-center sm:text-left">
                {esEdicion ? 'Editar Usuario' : 'Nuevo Usuario'}
            </h2>
            <form
                onSubmit={handleSubmit(onSubmit)}
                autoComplete="off"
                className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4"
            >
                {/* Nombre Completo */}
                <div>
                    <label className="block text-sm mb-1">Nombre Completo</label>
                    <input
                        {...register('nombre_completo', { required: 'Requerido' })}
                        className={inputClass}
                        placeholder="Nombre completo"
                        autoComplete="off"
                    />
                    {errors.nombre_completo && (
                        <p className="text-xs text-red-500 mt-0.5">{errors.nombre_completo.message}</p>
                    )}
                </div>

                {/* Nombre de Usuario */}
                <div>
                    <label className="block text-sm mb-1">Usuario</label>
                    <input
                        {...register('nombre_usuario', { required: 'Requerido' })}
                        className={inputClass}
                        placeholder="Nombre de usuario"
                        autoComplete="off"
                    />
                    {errors.nombre_usuario && (
                        <p className="text-xs text-red-500 mt-0.5">{errors.nombre_usuario.message}</p>
                    )}
                </div>

                {/* Contraseña */}
                <div className="sm:col-span-2">
                    <label className="block text-sm mb-1">
                        {esEdicion ? 'Nueva Contraseña (opcional)' : 'Contraseña'}
                    </label>
                    <input
                        type="password"
                        {...register('password', {
                            required: !esEdicion && 'Requerido'
                        })}
                        className={inputClass}
                        placeholder={esEdicion ? 'Nueva contraseña' : 'Contraseña'}
                        autoComplete="new-password"
                    />
                    {errors.password && (
                        <p className="text-xs text-red-500 mt-0.5">{errors.password.message}</p>
                    )}
                </div>

                {/* Rol */}
                <div>
                    <label className="block text-sm mb-1">Rol</label>
                    {esEdicion ? (
                        <div className="py-2 px-3 bg-gray-100 rounded-md text-sm text-gray-800">
                            {rolesDisponibles.find(r => r.id === usuario?.rol_id)?.nombre ?? 'Sin rol'}
                        </div>
                    ) : (
                        <select
                            {...register('rol_id', { required: 'Requerido' })}
                            className={inputClass}
                        >
                            <option value="">Seleccione un rol</option>
                            {rolesDisponibles.map(r => (
                                <option key={r.id} value={String(r.id)}>
                                    {r.nombre}
                                </option>
                            ))}
                        </select>
                    )}
                    {errors.rol_id && (
                        <p className="text-xs text-red-500 mt-0.5">{errors.rol_id.message}</p>
                    )}
                </div>

                {/* Zonas para Cobrador (Select Múltiple) */}
                {rolSeleccionado === '2' && (
                    <Controller
                        name="zona_ids"
                        control={control}
                        rules={{ required: 'Requerido' }}
                        render={({ field }) => {
                            const selectedValues = field.value ?? [];

                            return (
                                <div className="sm:col-span-2">
                                    <label className="block text-sm mb-2">Zonas asignadas</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {zonas.map(z => {
                                            const value = String(z.id);
                                            const isChecked = selectedValues.includes(value);

                                            return (
                                                <label key={z.id} className="flex items-center gap-2 text-sm">
                                                    <input
                                                        type="checkbox"
                                                        value={value}
                                                        checked={isChecked}
                                                        onChange={e => {
                                                            const v = e.target.value;
                                                            let newValues = [...selectedValues];

                                                            if (e.target.checked) {
                                                                if (!newValues.includes(v)) newValues.push(v);
                                                            } else {
                                                                newValues = newValues.filter(x => x !== v);
                                                            }

                                                            field.onChange(newValues);
                                                        }}
                                                    />
                                                    {z.nombre}
                                                </label>
                                            );
                                        })}
                                    </div>
                                    {errors.zona_ids && (
                                        <p className="text-xs text-red-500 mt-0.5">{errors.zona_ids.message}</p>
                                    )}
                                </div>
                            );
                        }}
                    />
                )}

                {/* Botones */}
                <div className="sm:col-span-2 flex flex-col sm:flex-row justify-end gap-3 pt-4">
                    <button
                        type="button"
                        onClick={() => navigate('/usuarios')}
                        className="inline-flex items-center justify-center rounded-md bg-gray-200 px-4 py-2 text-sm hover:bg-gray-300"
                    >
                        <X size={16} /> Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-70"
                    >
                        <CheckCircle2 size={16} /> {esEdicion ? 'Actualizar' : 'Crear'} Usuario
                    </button>
                </div>
            </form>
        </div>
    );
};

export default UsuarioForm;