// src/pages/ProveedorForm.jsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import Swal from 'sweetalert2';
import {
    crearProveedor,
    actualizarProveedor,
} from '../services/proveedorService';

// Utilidad simple de “string seguro”
const s = (v) => (v ?? '').toString();

// Campos por defecto
const DEFAULT_VALUES = {
    nombre_razon_social: '',
    cuil_cuit: '',
    telefono: '',
    email: '',
    rubro: '',
    direccion: '',
    ciudad: '',
    provincia: '',
    codigo_postal: '',
    notas: '',
    activo: true,
};

/**
 * Componente de formulario de Proveedor en modal.
 * Reutilizable para "crear" y "editar".
 *
 * Props:
 * - isOpen: boolean → mostrar/ocultar modal
 * - onClose: function → cerrar modal sin guardar
 * - onSaved: function(proveedorGuardado) → callback al guardar OK
 * - initialData: objeto con proveedor (si es edición)
 * - title: string opcional; si no se envía, se infiere por modo
 */
export default function ProveedorForm({
    isOpen = false,
    onClose,
    onSaved,
    initialData = null,
    title,
}) {
    const editMode = Boolean(initialData?.id);

    const [values, setValues] = useState(DEFAULT_VALUES);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState({});

    // Título dinámico si no se provee por props
    const heading = useMemo(
        () => title || (editMode ? 'Editar proveedor' : 'Nuevo proveedor'),
        [title, editMode]
    );

    // Prefill si estamos editando
    useEffect(() => {
        if (initialData) {
            setValues({
                nombre_razon_social: s(initialData.nombre_razon_social),
                cuil_cuit: s(initialData.cuil_cuit),
                telefono: s(initialData.telefono),
                email: s(initialData.email),
                rubro: s(initialData.rubro),
                direccion: s(initialData.direccion),
                ciudad: s(initialData.ciudad),
                provincia: s(initialData.provincia),
                codigo_postal: s(initialData.codigo_postal),
                notas: s(initialData.notas),
                activo:
                    typeof initialData.activo === 'boolean'
                        ? initialData.activo
                        : true,
            });
        } else {
            setValues(DEFAULT_VALUES);
        }
    }, [initialData]);

    // Cerrar con “Esc”
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    // 🔒 Bloqueo de scroll del body mientras el modal está abierto
    useEffect(() => {
        if (!isOpen) return;
        document.body.classList.add('overflow-hidden');
        return () => {
            document.body.classList.remove('overflow-hidden');
        };
    }, [isOpen]);

    // Validación mínima
    const validate = useCallback((vals) => {
        const e = {};
        if (!s(vals.nombre_razon_social).trim()) {
            e.nombre_razon_social = 'Este campo es obligatorio.';
        }
        if (s(vals.email).trim()) {
            const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vals.email);
            if (!ok) e.email = 'Email inválido.';
        }
        if (s(vals.cuil_cuit).trim()) {
            const ok = /^[0-9\-\.]+$/.test(vals.cuil_cuit);
            if (!ok) e.cuil_cuit = 'Solo números, puntos o guiones.';
        }
        return e;
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setValues((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? Boolean(checked) : value,
        }));
    };

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        const eMap = validate(values);
        setErrors(eMap);
        if (Object.keys(eMap).length > 0) {
            Swal.fire({
                icon: 'error',
                title: 'Revisá los datos',
                text: 'Hay campos con errores o faltantes.',
            });
            return;
        }
        try {
            setSubmitting(true);
            const payload = { ...values };

            let saved;
            if (editMode) {
                saved = await actualizarProveedor(initialData.id, payload);
            } else {
                saved = await crearProveedor(payload);
            }

            Swal.fire({
                icon: 'success',
                title: editMode ? 'Proveedor actualizado' : 'Proveedor creado',
                timer: 1400,
                showConfirmButton: false,
            });

            onSaved?.(saved);
            onClose?.();
        } catch (err) {
            console.error(err);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: err?.message || 'No se pudo guardar el proveedor.',
            });
        } finally {
            setSubmitting(false);
        }
    };

    // Cerrar con click en backdrop
    const handleBackdrop = (e) => {
        if (e.target.dataset?.backdrop) onClose?.();
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 bg-black/50 overflow-y-auto"
            data-backdrop
            onClick={handleBackdrop}
            aria-modal="true"
            role="dialog"
        >
            {/* Wrapper para centrar y permitir scroll del overlay si hiciera falta */}
            <div className="flex min-h-full items-center justify-center p-4">
                {/* Contenedor del modal (no scrollea) */}
                <div
                    className="w-full max-w-2xl rounded-lg bg-white shadow-xl pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header (fijo arriba) */}
                    <div className="flex items-center justify-between border-b px-5 py-3 bg-white">
                        <h2 className="text-base sm:text-lg font-semibold">{heading}</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100"
                            aria-label="Cerrar"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Form como contenedor flex con cuerpo scrolleable + footer fijo */}
                    <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
                        {/* Cuerpo scrolleable */}
                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            {/* grid responsive */}
                            <fieldset disabled={submitting}>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    {/* nombre / razón social */}
                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-xs font-medium text-gray-700">
                                            Nombre / Razón social *
                                        </label>
                                        <input
                                            type="text"
                                            name="nombre_razon_social"
                                            value={values.nombre_razon_social}
                                            onChange={handleChange}
                                            autoComplete="organization"
                                            className={`w-full rounded-md border px-3 py-2 outline-none focus:ring ${
                                                errors.nombre_razon_social
                                                    ? 'border-red-400 focus:ring-red-200'
                                                    : 'border-gray-300 focus:ring-gray-200'
                                            }`}
                                            placeholder="Ej: Proveedor S.A."
                                        />
                                        {errors.nombre_razon_social && (
                                            <p className="mt-1 text-xs text-red-600">
                                                {errors.nombre_razon_social}
                                            </p>
                                        )}
                                    </div>

                                    {/* CUIT/CUIL */}
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-gray-700">CUIT / CUIL</label>
                                        <input
                                            type="text"
                                            name="cuil_cuit"
                                            value={values.cuil_cuit}
                                            onChange={handleChange}
                                            autoComplete="off"
                                            className={`w-full rounded-md border px-3 py-2 outline-none focus:ring ${
                                                errors.cuil_cuit
                                                    ? 'border-red-400 focus:ring-red-200'
                                                    : 'border-gray-300 focus:ring-gray-200'
                                            }`}
                                            placeholder="Ej: 20-12345678-3"
                                        />
                                        {errors.cuil_cuit && (
                                            <p className="mt-1 text-xs text-red-600">{errors.cuil_cuit}</p>
                                        )}
                                    </div>

                                    {/* Rubro */}
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-gray-700">Rubro</label>
                                        <input
                                            type="text"
                                            name="rubro"
                                            value={values.rubro}
                                            onChange={handleChange}
                                            autoComplete="off"
                                            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring focus:ring-gray-200"
                                            placeholder="Ej: Informática, Librería…"
                                        />
                                    </div>

                                    {/* Teléfono */}
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-gray-700">Teléfono</label>
                                        <input
                                            type="tel"
                                            name="telefono"
                                            value={values.telefono}
                                            onChange={handleChange}
                                            autoComplete="tel"
                                            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring focus:ring-gray-200"
                                            placeholder="Ej: +54 381 555-1234"
                                        />
                                    </div>

                                    {/* Email */}
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-gray-700">Email</label>
                                        <input
                                            type="email"
                                            name="email"
                                            value={values.email}
                                            onChange={handleChange}
                                            autoComplete="email"
                                            className={`w-full rounded-md border px-3 py-2 outline-none focus:ring ${
                                                errors.email
                                                    ? 'border-red-400 focus:ring-red-200'
                                                    : 'border-gray-300 focus:ring-gray-200'
                                            }`}
                                            placeholder="contacto@proveedor.com"
                                        />
                                        {errors.email && (
                                            <p className="mt-1 text-xs text-red-600">{errors.email}</p>
                                        )}
                                    </div>

                                    {/* Dirección */}
                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-xs font-medium text-gray-700">Dirección</label>
                                        <input
                                            type="text"
                                            name="direccion"
                                            value={values.direccion}
                                            onChange={handleChange}
                                            autoComplete="street-address"
                                            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring focus:ring-gray-200"
                                            placeholder="Calle 123, Piso/Depto…"
                                        />
                                    </div>

                                    {/* Ciudad / Provincia / CP */}
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-gray-700">Ciudad</label>
                                        <input
                                            type="text"
                                            name="ciudad"
                                            value={values.ciudad}
                                            onChange={handleChange}
                                            autoComplete="address-level2"
                                            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring focus:ring-gray-200"
                                            placeholder="Ej: San Miguel de Tucumán"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-gray-700">Provincia</label>
                                        <input
                                            type="text"
                                            name="provincia"
                                            value={values.provincia}
                                            onChange={handleChange}
                                            autoComplete="address-level1"
                                            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring focus:ring-gray-200"
                                            placeholder="Ej: Tucumán"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-gray-700">Código Postal</label>
                                        <input
                                            type="text"
                                            name="codigo_postal"
                                            value={values.codigo_postal}
                                            onChange={handleChange}
                                            autoComplete="postal-code"
                                            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring focus:ring-gray-200"
                                            placeholder="Ej: 4000"
                                        />
                                    </div>

                                    {/* Activo (con ayuda) */}
                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-xs font-medium text-gray-700">Estado</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                id="activo"
                                                type="checkbox"
                                                name="activo"
                                                checked={Boolean(values.activo)}
                                                onChange={handleChange}
                                                className="h-4 w-4 rounded border-gray-300"
                                            />
                                            <label htmlFor="activo" className="text-sm font-medium">
                                                Activo
                                            </label>
                                        </div>
                                        <p className="mt-1 text-[11px] text-gray-500 leading-snug">
                                            Si está <b>destildado</b>, el proveedor queda “inactivo/archivado”.
                                            En la UI lo podés ocultar de listados y selects por defecto (según filtro).
                                        </p>
                                    </div>

                                    {/* Notas */}
                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-xs font-medium text-gray-700">Notas</label>
                                        <textarea
                                            name="notas"
                                            value={values.notas}
                                            onChange={handleChange}
                                            rows={3}
                                            className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring focus:ring-gray-200"
                                            placeholder="Observaciones internas…"
                                        />
                                    </div>
                                </div>
                            </fieldset>
                        </div>

                        {/* Footer fijo (siempre visible) */}
                        <div className="flex items-center justify-end gap-2 border-t px-5 py-3 bg-white">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                                {submitting ? (editMode ? 'Guardando…' : 'Creando…') : (editMode ? 'Guardar cambios' : 'Crear proveedor')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

