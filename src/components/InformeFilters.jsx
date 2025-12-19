// src/components/InformeFilters.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import Swal from 'sweetalert2';
import { defaultFilters } from '../hooks/useInformeData';
import {
  obtenerCobradoresConZonas,
  obtenerClientes,
  obtenerFormasDePago,
  obtenerZonas
} from '../services/catalogoService';

const inputBase =
  'w-full rounded border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-300';
const labelBase = 'text-xs font-medium text-gray-600';
const groupBase = 'flex flex-col gap-1';

const MODALIDADES = [
  { value: '', label: '– modalidad –' },
  { value: 'comun', label: 'Común' },
  { value: 'progresivo', label: 'Progresivo' },
  { value: 'libre', label: 'Libre' },
  { value: 'refinanciado', label: 'Refinanciado' }
];

// ✅ Default real (backend también cae a esto si no mandás nada)
const DEFAULT_RANGO_CREDITO = 'acreditacion_compromiso';

// ✅ Opciones reales según el modelo Credito:
// - fecha_solicitud
// - fecha_acreditacion
// - fecha_compromiso_pago
const RANGO_FECHA_CREDITO_OPTS = [
  { value: DEFAULT_RANGO_CREDITO, label: 'Acreditación o Compromiso (recomendado)' },
  { value: 'solicitud', label: 'Solicitud' },
  { value: 'acreditacion', label: 'Acreditación' },
  { value: 'compromiso', label: 'Compromiso de pago' }
];

const InformeFilters = ({ filters, onApply, onReset }) => {
  const [cobradores, setCobradores] = useState([]);
  const [clientesList, setClientesList] = useState([]);
  const [formas, setFormas] = useState([]);
  const [zonas, setZonas] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        setCobradores(await obtenerCobradoresConZonas());
        setClientesList(await obtenerClientes());
        setFormas(await obtenerFormasDePago());
        setZonas(await obtenerZonas());
      } catch (err) {
        console.error('Catálogos:', err);
      }
    })();
  }, []);

  const { control, handleSubmit, reset } = useForm({
    defaultValues: {
      ...filters,
      // defensivo: si no viene, ponemos el recomendado
      rangoFechaCredito: filters?.rangoFechaCredito || DEFAULT_RANGO_CREDITO
    }
  });

  // Mantener el form sincronizado si cambian filtros externos
  useEffect(() => {
    reset({
      ...filters,
      rangoFechaCredito: filters?.rangoFechaCredito || DEFAULT_RANGO_CREDITO
    });
  }, [filters, reset]);

  const tipo = useWatch({ control, name: 'tipo' });
  const hoy = useWatch({ control, name: 'hoy' });

  // ✅ Miramos el selector de rango (solo aplica a créditos, pero lo watch-eamos igual)
  const rangoFechaCredito = useWatch({ control, name: 'rangoFechaCredito' });

  const showCliente = tipo === 'creditos' || tipo === 'cuotas';
  const showEstadoCredito = tipo === 'creditos';
  const showModalidad = tipo === 'creditos';
  const showEstadoCuota = tipo === 'cuotas';
  const showHoy = tipo === 'cuotas';

  // ✅ Rango de fechas para CUOTAS y CRÉDITOS
  const showRangoFechas = tipo === 'cuotas' || tipo === 'creditos';

  // ✅ Selector solo para Créditos
  const showRangoFechaCreditoSelect = tipo === 'creditos';

  const showFormaPago = tipo === 'cuotas';
  const showSearchQ = tipo === 'creditos' || tipo === 'cuotas';

  const applyFilters = (values) => {
    const params = { ...values };
    const tipoActual = params.tipo;

    const isCuotas = tipoActual === 'cuotas';
    const isCreditos = tipoActual === 'creditos';
    const isClientes = tipoActual === 'clientes';

    // ───────────────── Validación de rango de fechas (cuotas y créditos) ─────────────────
    // En cuotas, si "hoy" está activo, ignoramos el rango.
    if (
      (isCuotas || isCreditos) &&
      values.desde &&
      values.hasta &&
      !(isCuotas && values.hoy)
    ) {
      if (values.desde > values.hasta) {
        Swal.fire(
          'Rango de fechas inválido',
          'La fecha "Desde" no puede ser mayor que "Hasta".',
          'warning'
        );
        return;
      }
    }

    // ───────────────── Limpieza según tipo de informe ─────────────────
    if (isClientes) {
      // En clientes no aplican estos filtros
      delete params.estadoCredito;
      delete params.estadoCuota;
      delete params.formaPagoId;
      delete params.hoy;
      delete params.desde;
      delete params.hasta;
      delete params.modalidad;
      delete params.q; // no se usa en clientes en tu backend actual
      delete params.rangoFechaCredito;
    } else if (isCreditos) {
      // En créditos: NO hay cuotas ni forma de pago ni "hoy"
      delete params.estadoCuota;
      delete params.formaPagoId;
      delete params.hoy;
      // ✅ PERMITIMOS desde/hasta para créditos
      // ✅ PERMITIMOS rangoFechaCredito para créditos (con default)
      if (!params.rangoFechaCredito) params.rangoFechaCredito = DEFAULT_RANGO_CREDITO;
    } else if (isCuotas) {
      // En cuotas: no tiene sentido "con créditos pendientes" ni estado de crédito
      delete params.conCreditosPendientes;
      delete params.estadoCredito;
      // Modalidad se filtra a nivel crédito, aquí no se usa directamente
      delete params.modalidad;
      // En cuotas no aplica este selector
      delete params.rangoFechaCredito;
    }

    // ───────────────── Limpieza de campos vacíos / falsy ─────────────────
    if (!params.conCreditosPendientes) delete params.conCreditosPendientes;
    if (!params.hoy) delete params.hoy;
    if (!params.clienteId) delete params.clienteId;
    if (!params.estadoCredito) delete params.estadoCredito;
    if (!params.estadoCuota) delete params.estadoCuota;
    if (!params.formaPagoId) delete params.formaPagoId;
    if (!params.cobradorId) delete params.cobradorId;
    if (!params.modalidad) delete params.modalidad;
    if (!params.q) delete params.q;
    if (!params.zonaId) delete params.zonaId;

    // Selector de rango: si por algún motivo viene vacío, lo sacamos (backend tiene default igual)
    if (!params.rangoFechaCredito) delete params.rangoFechaCredito;

    // Fechas: solo créditos/cuotas. En cuotas, si hoy=true, anula rango.
    if (!(isCuotas || isCreditos)) {
      delete params.desde;
      delete params.hasta;
    }
    if (isCuotas && params.hoy) {
      delete params.desde;
      delete params.hasta;
    }

    onApply(params);
  };

  const resetAll = () => {
    // Reset defensivo: si defaultFilters no incluye rangoFechaCredito, lo inyectamos
    reset({
      ...defaultFilters,
      rangoFechaCredito: DEFAULT_RANGO_CREDITO
    });
    onReset();
  };

  const qPlaceholder = useMemo(
    () =>
      tipo === 'creditos'
        ? 'Nombre, apellido o #crédito…'
        : 'Nombre, apellido o #crédito/#cuota…',
    [tipo]
  );

  // Labels para "Desde/Hasta" según tipo y selector de rango
  const labelDesde = useMemo(() => {
    if (tipo !== 'creditos') return 'Desde';
    switch (String(rangoFechaCredito || DEFAULT_RANGO_CREDITO)) {
      case 'solicitud': return 'Desde (Solicitud)';
      case 'acreditacion': return 'Desde (Acreditación)';
      case 'compromiso': return 'Desde (Compromiso)';
      default: return 'Desde (Acred./Comp.)';
    }
  }, [tipo, rangoFechaCredito]);

  const labelHasta = useMemo(() => {
    if (tipo !== 'creditos') return 'Hasta';
    switch (String(rangoFechaCredito || DEFAULT_RANGO_CREDITO)) {
      case 'solicitud': return 'Hasta (Solicitud)';
      case 'acreditacion': return 'Hasta (Acreditación)';
      case 'compromiso': return 'Hasta (Compromiso)';
      default: return 'Hasta (Acred./Comp.)';
    }
  }, [tipo, rangoFechaCredito]);

  const disableDateByHoy = tipo === 'cuotas' && !!hoy;

  return (
    <form
      onSubmit={handleSubmit(applyFilters)}
      className="grid gap-4 rounded-lg bg-gray-50 p-4 ring-1 ring-gray-200
                 sm:grid-cols-2 lg:grid-cols-4"
    >
      {/* Tipo de informe */}
      <div className={groupBase}>
        <label className={labelBase}>Tipo de informe</label>
        <Controller
          control={control}
          name="tipo"
          render={({ field }) => (
            <select {...field} className={inputBase}>
              <option value="clientes">Clientes</option>
              <option value="creditos">Créditos</option>
              <option value="cuotas">Cuotas</option>
            </select>
          )}
        />
      </div>

      {/* Zona */}
      <div className={groupBase}>
        <label className={labelBase}>Zona</label>
        <Controller
          control={control}
          name="zonaId"
          render={({ field }) => (
            <select {...field} className={inputBase}>
              <option value="">– zona –</option>
              {zonas.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nombre}
                </option>
              ))}
            </select>
          )}
        />
      </div>

      {/* Cobrador */}
      <div className={groupBase}>
        <label className={labelBase}>Cobrador</label>
        <Controller
          control={control}
          name="cobradorId"
          render={({ field }) => (
            <select {...field} className={inputBase}>
              <option value="">– cobrador –</option>
              {cobradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_completo}
                </option>
              ))}
            </select>
          )}
        />
      </div>

      {/* Cliente (créditos/cuotas) */}
      {showCliente && (
        <div className={groupBase}>
          <label className={labelBase}>Cliente</label>
          <Controller
            control={control}
            name="clienteId"
            render={({ field }) => (
              <select {...field} className={inputBase}>
                <option value="">– cliente –</option>
                {clientesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellido}
                  </option>
                ))}
              </select>
            )}
          />
        </div>
      )}

      {/* Búsqueda libre por cliente / crédito */}
      {showSearchQ && (
        <div className={groupBase}>
          <label className={labelBase}>Búsqueda</label>
          <Controller
            control={control}
            name="q"
            render={({ field }) => (
              <input
                {...field}
                type="text"
                placeholder={qPlaceholder}
                className={inputBase}
              />
            )}
          />
        </div>
      )}

      {/* Estado de crédito */}
      {showEstadoCredito && (
        <div className={groupBase}>
          <label className={labelBase}>Estado del crédito</label>
          <Controller
            control={control}
            name="estadoCredito"
            render={({ field }) => (
              <select {...field} className={inputBase}>
                <option value="">– estado crédito –</option>
                <option value="pendiente">Pendiente</option>
                <option value="vencido">Vencido</option>
                <option value="anulado">Anulado</option>
                <option value="pagado">Pagado</option>
              </select>
            )}
          />
        </div>
      )}

      {/* Modalidad */}
      {showModalidad && (
        <div className={groupBase}>
          <label className={labelBase}>Modalidad</label>
          <Controller
            control={control}
            name="modalidad"
            render={({ field }) => (
              <select {...field} className={inputBase}>
                {MODALIDADES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
          />
        </div>
      )}

      {/* ✅ Selector del tipo de fecha para rango (solo Créditos) */}
      {showRangoFechaCreditoSelect && (
        <div className={groupBase}>
          <label className={labelBase}>Rango por fecha</label>
          <Controller
            control={control}
            name="rangoFechaCredito"
            render={({ field }) => (
              <select {...field} className={inputBase}>
                {RANGO_FECHA_CREDITO_OPTS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          />
        </div>
      )}

      {/* Con créditos pendientes */}
      {(tipo === 'clientes' || tipo === 'creditos') && (
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="conCreditosPendientes"
            render={({ field }) => (
              <>
                <input
                  id="conCreditosPendientes"
                  type="checkbox"
                  className="h-4 w-4 accent-blue-600"
                  checked={!!field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
                <label htmlFor="conCreditosPendientes" className="text-sm">
                  {tipo === 'creditos'
                    ? 'Solo créditos pendientes'
                    : 'Con créditos pendientes'}
                </label>
              </>
            )}
          />
        </div>
      )}

      {/* Estado de cuota */}
      {showEstadoCuota && (
        <div className={groupBase}>
          <label className={labelBase}>Estado de la cuota</label>
          <Controller
            control={control}
            name="estadoCuota"
            render={({ field }) => (
              <select {...field} className={inputBase}>
                <option value="">– estado cuota –</option>
                <option value="pendiente">Pendiente</option>
                <option value="parcial">Parcial</option>
                <option value="vencida">Vencida</option>
                <option value="pagada">Pagada</option>
              </select>
            )}
          />
        </div>
      )}

      {/* Solo vencimientos hoy (solo cuotas) */}
      {showHoy && (
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="hoy"
            render={({ field }) => (
              <>
                <input
                  id="soloHoy"
                  type="checkbox"
                  className="h-4 w-4 accent-blue-600"
                  checked={!!field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
                <label htmlFor="soloHoy" className="text-sm">
                  Solo vencimientos hoy
                </label>
              </>
            )}
          />
        </div>
      )}

      {/* Rango fechas (cuotas y créditos) */}
      {showRangoFechas && (
        <>
          <div className={groupBase}>
            <label className={labelBase}>{labelDesde}</label>
            <Controller
              control={control}
              name="desde"
              render={({ field }) => (
                <input
                  {...field}
                  type="date"
                  className={inputBase}
                  disabled={disableDateByHoy}
                  title={
                    disableDateByHoy
                      ? 'Deshabilitado al seleccionar "Solo vencimientos hoy"'
                      : ''
                  }
                />
              )}
            />
          </div>
          <div className={groupBase}>
            <label className={labelBase}>{labelHasta}</label>
            <Controller
              control={control}
              name="hasta"
              render={({ field }) => (
                <input
                  {...field}
                  type="date"
                  className={inputBase}
                  disabled={disableDateByHoy}
                  title={
                    disableDateByHoy
                      ? 'Deshabilitado al seleccionar "Solo vencimientos hoy"'
                      : ''
                  }
                />
              )}
            />
          </div>
        </>
      )}

      {/* Forma de pago */}
      {showFormaPago && (
        <div className={groupBase}>
          <label className={labelBase}>Forma de pago</label>
          <Controller
            control={control}
            name="formaPagoId"
            render={({ field }) => (
              <select {...field} className={inputBase}>
                <option value="">– forma de pago –</option>
                {formas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                  </option>
                ))}
              </select>
            )}
          />
        </div>
      )}

      {/* Botones */}
      <div className="col-span-full flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="submit"
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
        >
          Buscar
        </button>
        <button
          type="button"
          onClick={resetAll}
          className="w-full rounded bg-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-300 sm:w-auto"
        >
          Limpiar
        </button>
      </div>
    </form>
  );
};

export default InformeFilters;