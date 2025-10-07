// src/components/InformeFilters.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
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
    defaultValues: filters
  });

  // Mantener el form sincronizado si cambian filtros externos
  useEffect(() => {
    reset(filters);
  }, [filters, reset]);

  const tipo = useWatch({ control, name: 'tipo' });
  const hoy = useWatch({ control, name: 'hoy' });

  const showCliente = tipo === 'creditos' || tipo === 'cuotas';
  const showEstadoCredito = tipo === 'creditos';
  const showModalidad = tipo === 'creditos';
  const showEstadoCuota = tipo === 'cuotas';
  const showHoy = tipo === 'cuotas';
  const showRangoFechas = tipo === 'cuotas';
  const showFormaPago = tipo === 'cuotas';
  const showSearchQ = tipo === 'creditos' || tipo === 'cuotas';

  const applyFilters = (values) => {
    const params = { ...values };

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

    if (!showRangoFechas) {
      delete params.desde;
      delete params.hasta;
    }
    if (params.hoy) {
      delete params.desde;
      delete params.hasta;
    }

    onApply(params);
  };

  const resetAll = () => {
    reset(defaultFilters);
    onReset();
  };

  const qPlaceholder = useMemo(
    () =>
      tipo === 'creditos'
        ? 'Buscar cliente por nombre/apellido…'
        : 'Buscar por nombre/apellido…',
    [tipo]
  );

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

      {/* Búsqueda libre por cliente */}
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

      {/* Solo vencimientos hoy */}
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

      {/* Rango fechas */}
      {showRangoFechas && (
        <>
          <div className={groupBase}>
            <label className={labelBase}>Desde</label>
            <Controller
              control={control}
              name="desde"
              render={({ field }) => (
                <input
                  {...field}
                  type="date"
                  className={inputBase}
                  disabled={!!hoy}
                  title={hoy ? 'Deshabilitado al seleccionar "Solo vencimientos hoy"' : ''}
                />
              )}
            />
          </div>
          <div className={groupBase}>
            <label className={labelBase}>Hasta</label>
            <Controller
              control={control}
              name="hasta"
              render={({ field }) => (
                <input
                  {...field}
                  type="date"
                  className={inputBase}
                  disabled={!!hoy}
                  title={hoy ? 'Deshabilitado al seleccionar "Solo vencimientos hoy"' : ''}
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