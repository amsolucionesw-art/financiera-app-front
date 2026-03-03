// src/pages/ClienteForm.jsx

import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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

const toStrId = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s ? s : "";
};

const ClienteForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const esEdicion = Boolean(id);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      // inputs
      nombre: "",
      apellido: "",
      dni: "",
      email: "",
      telefono: "",
      telefono_secundario: "",
      direccion: "",
      direccion_secundaria: "",
      referencia_direccion: "",
      referencia_secundaria: "",
      provincia: "",
      localidad: "",
      fecha_nacimiento: "",
      fecha_registro: "",
      historial_crediticio: "",
      observaciones: "",

      // selects (SIEMPRE string en el form)
      cobrador: "",
      zona: "",
    },
  });

  const [cobradores, setCobradores] = useState([]);
  const [zonasDisponibles, setZonasDisponibles] = useState([]);

  // ✅ Rol del usuario logueado (centralizado)
  const [rolId, setRolId] = useState(null);

  // ✅ refs para evitar race conditions
  const desiredZonaRef = useRef("");      // zona inicial del cliente (o la última elegida por el usuario)
  const hydratingRef = useRef(false);     // estamos hidratando datos del cliente

  useEffect(() => {
    const rid = getRolId();
    setRolId(rid != null ? Number(rid) : null);
  }, []);

  const esAdmin = Number(rolId) === 1;

  // ✅ Regla: Admin puede editar cliente, pero NO puede editar DNI (solo en edición)
  const bloquearEdicionDni = esEdicion && esAdmin;

  useEffect(() => {
    const cargarCobradores = async () => {
      try {
        const lista = await obtenerCobradoresConZonas();
        setCobradores(Array.isArray(lista) ? lista : []);
      } catch {
        Swal.fire("Error", "No se pudieron cargar los cobradores", "error");
      }
    };

    cargarCobradores();
  }, []);

  // Watch del cobrador/zona (strings)
  const cobradorSeleccionado = useWatch({ control, name: "cobrador" });
  const zonaSeleccionada = useWatch({ control, name: "zona" });

  // ✅ Cargar cliente (solo cuando ya hay cobradores cargados)
  useEffect(() => {
    const cargarCliente = async () => {
      if (!esEdicion) return;
      if (!id) return;
      if (!cobradores || cobradores.length === 0) return;

      try {
        hydratingRef.current = true;

        const cliente = await obtenerClientePorId(id);

        const cobradorId = cliente?.cobradorId ?? cliente?.cobrador ?? "";
        const zonaId = cliente?.zonaId ?? cliente?.zona ?? "";

        const cobradorStr = toStrId(cobradorId);
        const zonaStr = toStrId(zonaId);

        // Guardamos la zona inicial para reenganchar SOLO durante hidratación
        desiredZonaRef.current = zonaStr;

        // Zonas disponibles del cobrador del cliente
        const cobradorEncontrado = cobradores.find((c) => String(c.id) === cobradorStr);
        const zonas = cobradorEncontrado?.zonas || [];
        const zonasArr = Array.isArray(zonas) ? zonas : [];
        setZonasDisponibles(zonasArr);

        // Reset limpio
        reset({
          nombre: cliente?.nombre ?? "",
          apellido: cliente?.apellido ?? "",
          dni: cliente?.dni ?? "",
          email: cliente?.email ?? "",
          telefono: cliente?.telefono ?? "",
          telefono_secundario: cliente?.telefono_secundario ?? "",
          direccion: cliente?.direccion ?? "",
          direccion_secundaria: cliente?.direccion_secundaria ?? "",
          referencia_direccion: cliente?.referencia_direccion ?? "",
          referencia_secundaria: cliente?.referencia_secundaria ?? "",
          provincia: cliente?.provincia ?? "",
          localidad: cliente?.localidad ?? "",
          fecha_nacimiento: (cliente?.fecha_nacimiento ?? "").toString().slice(0, 10),
          fecha_registro: (cliente?.fecha_registro ?? "").toString().slice(0, 10),
          historial_crediticio: cliente?.historial_crediticio ?? "",
          observaciones: cliente?.observaciones ?? "",

          cobrador: cobradorStr,
          zona: zonaStr,
        });

        // Re-pegado defensivo (solo para inicial)
        if (zonaStr) {
          setValue("zona", zonaStr, { shouldValidate: false, shouldDirty: false });
        }
      } catch {
        Swal.fire("Error", "No se pudo cargar el cliente", "error");
      } finally {
        setTimeout(() => {
          hydratingRef.current = false;
        }, 0);
      }
    };

    cargarCliente();
  }, [esEdicion, id, cobradores, reset, setValue]);

  // ✅ Recalcular zonas cuando cambia el cobrador
  useEffect(() => {
    const cobradorStr = toStrId(cobradorSeleccionado);
    const c = cobradores.find((x) => String(x.id) === cobradorStr);

    const zonas = c?.zonas || [];
    const zonasArr = Array.isArray(zonas) ? zonas : [];
    setZonasDisponibles(zonasArr);

    // Si la zona actual ya no existe en las zonas del cobrador, limpiamos zona
    // PERO: NO durante hidratación inicial
    if (hydratingRef.current) return;

    const zonaStr = toStrId(zonaSeleccionada);
    if (zonaStr) {
      const existe = zonasArr.some((z) => String(z.id) === zonaStr);
      if (!existe) {
        setValue("zona", "");
      }
    }
  }, [cobradorSeleccionado, cobradores, setValue, zonaSeleccionada]);

  // ✅ Reenganchar zona SOLO durante hidratación o si el campo está vacío
  // (antes te pisaba la selección del usuario porque 'desiredZonaRef' seguía con la zona vieja)
  useEffect(() => {
    if (!esEdicion) return;

    const desired = toStrId(desiredZonaRef.current);
    if (!desired) return;

    const existe = (zonasDisponibles || []).some((z) => String(z.id) === desired);
    if (!existe) return;

    const current = toStrId(zonaSeleccionada);

    // Solo re-aplicar si estamos hidratando o si el select quedó vacío
    if (hydratingRef.current || current === "") {
      if (current !== desired) {
        setValue("zona", desired, { shouldValidate: false, shouldDirty: false });
      }
    }
  }, [zonasDisponibles, esEdicion, setValue, zonaSeleccionada]);

  const onSubmit = async (data) => {
    try {
      // ✅ Normalización: email opcional (si viene vacío, lo mandamos como null)
      if (Object.prototype.hasOwnProperty.call(data, "email")) {
        const e = (data.email ?? "").toString().trim();
        data.email = e ? e : null;
      }

      // ✅ Normalizar selects a número para backend
      if (Object.prototype.hasOwnProperty.call(data, "cobrador")) {
        data.cobrador = data.cobrador ? Number(data.cobrador) : null;
      }
      if (Object.prototype.hasOwnProperty.call(data, "zona")) {
        data.zona = data.zona ? Number(data.zona) : null;
      }

      if (esEdicion) {
        // ✅ Hardening UX: si admin edita, no mandar "dni"
        if (bloquearEdicionDni) {
          const { dni, ...rest } = data;
          data = rest;
        }

        await actualizarCliente(id, data);
      } else {
        await crearCliente(data);
      }

      Swal.fire("Éxito", esEdicion ? "Cliente actualizado" : "Cliente creado", "success");
      navigate("/clientes");
    } catch (error) {
      console.error("Error al guardar cliente:", error);
      Swal.fire("Error", error?.message || "No se pudo guardar el cliente", "error");
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

        {/* Historial Crediticio */}
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

        {/* ✅ SELECTS CONTROLADOS */}
        <div>
          <label className="block text-sm mb-1">Cobrador</label>
          <Controller
            control={control}
            name="cobrador"
            rules={{ required: "Requerido" }}
            render={({ field }) => (
              <select {...field} className={inputClass}>
                <option value="">Seleccione</option>
                {cobradores.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.nombre_completo}
                  </option>
                ))}
              </select>
            )}
          />
          {errors.cobrador && (
            <p className="text-xs text-red-500">{errors.cobrador.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm mb-1">Zona</label>
          <Controller
            control={control}
            name="zona"
            rules={{ required: "Requerido" }}
            render={({ field }) => (
              <select
                {...field}
                className={inputClass}
                onChange={(e) => {
                  const v = e.target.value;
                  // ✅ IMPORTANTÍSIMO: si el usuario cambia zona, actualizamos el ref
                  // para que ningún efecto “reenganche” la zona vieja.
                  desiredZonaRef.current = toStrId(v);
                  field.onChange(e);
                }}
              >
                <option value="">Seleccione</option>
                {zonasDisponibles.map((z) => (
                  <option key={z.id} value={String(z.id)}>
                    {z.nombre}
                  </option>
                ))}
              </select>
            )}
          />
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