// src/pages/ClienteForm.jsx

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, X } from "lucide-react";
import Swal from "sweetalert2";
import {
  crearCliente,
  obtenerClientePorId,
  actualizarCliente,
} from "../services/clienteService";
import { obtenerCobradoresConZonas } from "../services/usuarioService";
import { getRolId } from "../services/authService";

const ClienteForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const esEdicion = Boolean(id);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm();

  const [cobradores, setCobradores] = useState([]);
  const [zonasDisponibles, setZonasDisponibles] = useState([]);

  // ✅ Rol del usuario logueado (centralizado)
  const [rolId, setRolId] = useState(null);

  useEffect(() => {
    // Leemos el rol desde authService (evita duplicación y manejo manual de tokens)
    const rid = getRolId();
    setRolId(rid != null ? Number(rid) : null);
  }, []);

  const esSuperadmin = Number(rolId) === 0;
  const esAdmin = Number(rolId) === 1;

  // ✅ Regla: Admin puede editar cliente, pero NO puede editar DNI (número) (solo en edición)
  const bloquearEdicionDni = esEdicion && esAdmin;

  useEffect(() => {
    const cargarCobradores = async () => {
      try {
        const lista = await obtenerCobradoresConZonas();
        setCobradores(lista);
      } catch {
        Swal.fire("Error", "No se pudieron cargar los cobradores", "error");
      }
    };

    cargarCobradores();
  }, []);

  useEffect(() => {
    const cargarCliente = async () => {
      if (!esEdicion || cobradores.length === 0) return;

      try {
        const cliente = await obtenerClientePorId(id);
        Object.entries(cliente).forEach(([k, v]) => setValue(k, v ?? ""));

        const idCobrador = parseInt(cliente.cobrador);
        const cobradorEncontrado = cobradores.find((c) => c.id === idCobrador);
        if (cobradorEncontrado) {
          setZonasDisponibles(cobradorEncontrado.zonas || []);
        }
      } catch {
        Swal.fire("Error", "No se pudo cargar el cliente", "error");
      }
    };

    cargarCliente();
  }, [esEdicion, id, cobradores, setValue]);

  const cobradorSeleccionado = useWatch({ control, name: "cobrador" });

  useEffect(() => {
    const c = cobradores.find((x) => x.id === parseInt(cobradorSeleccionado));
    setZonasDisponibles(c ? c.zonas : []);
  }, [cobradorSeleccionado, cobradores]);

  const onSubmit = async (data) => {
    try {
      // ✅ Normalización: email opcional (si viene vacío, lo mandamos como null)
      if (Object.prototype.hasOwnProperty.call(data, "email")) {
        const e = (data.email ?? "").toString().trim();
        data.email = e ? e : null;
      }

      if (esEdicion) {
        // ✅ Hardening UX: si admin edita, forzamos a no mandar "dni" aunque esté deshabilitado (por si algún browser/autofill)
        if (bloquearEdicionDni) {
          const { dni, ...rest } = data;
          data = rest;
        }

        await actualizarCliente(id, data);
      } else {
        await crearCliente(data);
      }

      Swal.fire(
        "Éxito",
        esEdicion ? "Cliente actualizado" : "Cliente creado",
        "success"
      );
      navigate("/clientes");
    } catch (error) {
      console.error("Error al guardar cliente:", error);
      Swal.fire(
        "Error",
        error?.message || "No se pudo guardar el cliente",
        "error"
      );
    }
  };

  const inputClass =
    "w-full rounded-md border-gray-300 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-blue-200";

  const inputClassDisabled =
    inputClass + " bg-gray-100 text-gray-600 cursor-not-allowed";

  return (
    <div className="max-w-2xl mx-auto bg-white shadow ring-1 ring-gray-200 rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-6">
        {esEdicion ? "Editar Cliente" : "Nuevo Cliente"}
      </h2>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {[
          "nombre",
          "apellido",
          "dni",
          "email",
          "telefono",
          "telefono_secundario",
          "direccion",
          "direccion_secundaria",
          "referencia_direccion",
          "referencia_secundaria",
          "provincia",
          "localidad",
          "fecha_nacimiento",
          "fecha_registro",
        ].map((name) => {
          const label = name
            .replace("_", " ")
            .replace(/\b\w/g, (l) => l.toUpperCase());

          const type =
            name === "email"
              ? "email"
              : name.includes("fecha")
              ? "date"
              : "text";

          const baseRequired = [
            "nombre",
            "apellido",
            "dni",
            "telefono",
            "direccion",
            "fecha_nacimiento",
            "fecha_registro",
          ].includes(name);

          // ✅ DNI requerido solo cuando NO está bloqueado (creación o superadmin)
          const required =
            baseRequired && !(name === "dni" && bloquearEdicionDni);

          const isDni = name === "dni";
          const disabled = isDni && bloquearEdicionDni;

          return (
            <div key={name} className="md:col-span-1">
              <label className="block text-sm mb-1">{label}</label>

              <input
                type={type}
                disabled={disabled}
                {...register(name, required ? { required: "Requerido" } : {})}
                className={disabled ? inputClassDisabled : inputClass}
              />

              {isDni && bloquearEdicionDni && (
                <p className="text-xs text-gray-500 mt-1">
                  El rol admin no puede modificar el DNI.
                </p>
              )}

              {errors[name] && (
                <p className="text-xs text-red-500">{errors[name].message}</p>
              )}
            </div>
          );
        })}

        {/* Nuevo campo: Historial Crediticio */}
        <div className="md:col-span-1">
          <label className="block text-sm mb-1">Historial Crediticio</label>
          <select
            {...register("historial_crediticio", { required: "Requerido" })}
            className={inputClass}
          >
            <option value="">Seleccione</option>
            <option value="Aprobado">Aprobado</option>
            <option value="Desaprobado">Desaprobado</option>
          </select>
          {errors.historial_crediticio && (
            <p className="text-xs text-red-500">
              {errors.historial_crediticio.message}
            </p>
          )}
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Observaciones</label>
          <textarea
            {...register("observaciones")}
            className={inputClass}
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Cobrador</label>
          <select
            {...register("cobrador", { required: "Requerido" })}
            className={inputClass}
          >
            <option value="">Seleccione</option>
            {cobradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre_completo}
              </option>
            ))}
          </select>
          {errors.cobrador && (
            <p className="text-xs text-red-500">{errors.cobrador.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm mb-1">Zona</label>
          <select
            {...register("zona", { required: "Requerido" })}
            className={inputClass}
          >
            <option value="">Seleccione</option>
            {zonasDisponibles.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
          {errors.zona && (
            <p className="text-xs text-red-500">{errors.zona.message}</p>
          )}
        </div>

        <div className="md:col-span-2 flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => navigate("/clientes")}
            className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-4 py-2 text-sm hover:bg-gray-300"
          >
            <X size={16} /> Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-70"
          >
            <CheckCircle2 size={16} />{" "}
            {esEdicion ? "Actualizar" : "Crear"} Cliente
          </button>
        </div>
      </form>
    </div>
  );
};

export default ClienteForm;