import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, X } from "lucide-react";
import Swal from "sweetalert2";
import {
  crearCliente,
  obtenerClientePorId,
  actualizarCliente,
  subirDniFoto,
} from "../services/clienteService";
import { obtenerCobradoresConZonas } from "../services/usuarioService";

const ClienteForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const esEdicion = Boolean(id);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm();

  const [cobradores, setCobradores] = useState([]);
  const [zonasDisponibles, setZonasDisponibles] = useState([]);
  const [dniFoto, setDniFoto] = useState(null);
  const [dniFotoUrl, setDniFotoUrl] = useState(null);

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
        setDniFotoUrl(cliente.dni_foto || null);

        const idCobrador = parseInt(cliente.cobrador);
        const cobradorEncontrado = cobradores.find(c => c.id === idCobrador);
        if (cobradorEncontrado) {
          setZonasDisponibles(cobradorEncontrado.zonas || []);
        }
      } catch {
        Swal.fire("Error", "No se pudo cargar el cliente", "error");
      }
    };

    cargarCliente();
  }, [esEdicion, id, cobradores]);

  const cobradorSeleccionado = useWatch({ control, name: "cobrador" });

  useEffect(() => {
    const c = cobradores.find(x => x.id === parseInt(cobradorSeleccionado));
    setZonasDisponibles(c ? c.zonas : []);
  }, [cobradorSeleccionado, cobradores]);

  const onSubmit = async (data) => {
    try {
      let clienteId = id;
      let nuevaFotoUrl = dniFotoUrl;

      if (esEdicion) {
        if (!data.dni_foto && dniFotoUrl) {
          data.dni_foto = dniFotoUrl.split("/").pop();
        }
        await actualizarCliente(id, data);
      } else {
        const res = await crearCliente(data);
        clienteId = res.id;
      }

      if (dniFoto && clienteId) {
        const uploadRes = await subirDniFoto(clienteId, dniFoto);
        nuevaFotoUrl = uploadRes?.url ?? dniFotoUrl;
        setDniFotoUrl(nuevaFotoUrl);
      }

      Swal.fire("Éxito", esEdicion ? "Cliente actualizado" : "Cliente creado", "success");
      navigate("/clientes");
    } catch (error) {
      console.error("Error al guardar cliente:", error);
      Swal.fire("Error", "No se pudo guardar el cliente", "error");
    }
  };

  const inputClass =
    "w-full rounded-md border-gray-300 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-blue-200";

  return (
    <div className="max-w-2xl mx-auto bg-white shadow ring-1 ring-gray-200 rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-6">
        {esEdicion ? "Editar Cliente" : "Nuevo Cliente"}
      </h2>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          "fecha_registro"
        ].map((name) => {
          const label = name
            .replace("_", " ")
            .replace(/\b\w/g, (l) => l.toUpperCase());
          const type = name.includes("fecha") ? "date" : "text";
          const required = ["nombre", "apellido", "dni", "telefono", "direccion", "fecha_nacimiento", "fecha_registro"].includes(name);
          return (
            <div key={name} className="md:col-span-1">
              <label className="block text-sm mb-1">{label}</label>
              <input
                type={type}
                {...register(name, required ? { required: "Requerido" } : {})}
                className={inputClass}
              />
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
            <p className="text-xs text-red-500">{errors.historial_crediticio.message}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Observaciones</label>
          <textarea {...register("observaciones")} className={inputClass} rows={3} />
        </div>

        <div>
          <label className="block text-sm mb-1">Cobrador</label>
          <select {...register("cobrador", { required: "Requerido" })} className={inputClass}>
            <option value="">Seleccione</option>
            {cobradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre_completo}</option>
            ))}
          </select>
          {errors.cobrador && <p className="text-xs text-red-500">{errors.cobrador.message}</p>}
        </div>

        <div>
          <label className="block text-sm mb-1">Zona</label>
          <select {...register("zona", { required: "Requerido" })} className={inputClass}>
            <option value="">Seleccione</option>
            {zonasDisponibles.map((z) => (
              <option key={z.id} value={z.id}>{z.nombre}</option>
            ))}
          </select>
          {errors.zona && <p className="text-xs text-red-500">{errors.zona.message}</p>}
        </div>

        {dniFotoUrl && (
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Foto actual del DNI:</label>
            <img
              src={dniFotoUrl}
              alt="DNI"
              className="max-w-xs rounded-md border border-gray-200"
            />
          </div>
        )}

        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Subir nueva foto del DNI</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files[0];
              if (!file) return;

              const validTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
              const maxSize = 2 * 1024 * 1024;

              if (!validTypes.includes(file.type)) {
                Swal.fire("Formato inválido", "Solo se permiten imágenes JPG, PNG o WEBP", "error");
                return;
              }

              if (file.size > maxSize) {
                Swal.fire("Archivo demasiado grande", "La imagen no puede superar los 2MB", "error");
                return;
              }

              setDniFoto(file);
            }}
            className="text-sm"
          />
        </div>

        <div className="md:col-span-2 flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => navigate("/clientes")}
            className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-4 py-2 text-sm hover:bg-gray-300">
            <X size={16} /> Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-70">
            <CheckCircle2 size={16} /> {esEdicion ? "Actualizar" : "Crear"} Cliente
          </button>
        </div>
      </form>
    </div>
  );
};

export default ClienteForm;
