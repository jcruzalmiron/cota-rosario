"use client";

import { useState } from "react";
import { haceCuanto, type ReportsState } from "@/components/reports/useReports";
import { DESCRIPTION_MAX_CHARS, REPORT_TYPES, REPORT_TTL_HOURS, type ReportType } from "@/lib/reportTypes";
const LIST_LIMIT = 8;

interface ReportPanelProps {
  estado: ReportsState;
  soloLectura?: boolean;
}

export function ReportPanel({ estado, soloLectura = false }: ReportPanelProps) {
  const { reportes, colocando, borrador, enviando, error, disponible, confirmados, confirmando, colocarCentro, empezarColocacion, cancelar, actualizarBorrador, enviar, confirmar } = estado;
  const [listaAbierta, setListaAbierta] = useState(false);

  return (
    <div className="pointer-events-auto flex w-full max-w-xs flex-col gap-2">
      <div className="flex flex-col overflow-hidden rounded-md border border-rule bg-panel/95 shadow-xl backdrop-blur">
        {colocando ? (
          <div className="flex flex-col gap-3 px-3 py-3 text-sm">
            {borrador ? (
              <>
                <p className="text-xs text-ink-soft">Marcaste un punto. ¿Qué estás viendo ahí?</p>
                <p className="readout text-xs text-ink-faint">{borrador.lat.toFixed(5)}, {borrador.lon.toFixed(5)}</p>
                <p className="text-xs text-ink-soft">Tu reporte será público. Describí lo que observás sin incluir nombres ni datos personales.</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(REPORT_TYPES) as ReportType[]).map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => actualizarBorrador({ tipo })}
                      aria-pressed={borrador.tipo === tipo}
                      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                        borrador.tipo === tipo ? "border-ink text-ink" : "border-rule text-ink-soft hover:text-ink"
                      }`}
                    >
                      <span className="size-2 shrink-0 rounded-full" style={{ background: REPORT_TYPES[tipo].color }} aria-hidden="true" />
                      {REPORT_TYPES[tipo].etiqueta}
                    </button>
                  ))}
                </div>
                <label className="flex flex-col gap-1">
                  <span className="meta">Detalle (opcional)</span>
                  <input
                    value={borrador.descripcion}
                    maxLength={DESCRIPTION_MAX_CHARS}
                    onChange={(event) => actualizarBorrador({ descripcion: event.target.value })}
                    placeholder="Ej.: cubre el cordón en Mendoza y Ovidio Lagos"
                    className="rounded-md border border-rule bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-ink-faint focus:border-ink-soft"
                  />
                </label>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={cancelar} className="text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={enviar}
                    disabled={enviando}
                    className="rounded-md border border-ink px-3 py-1.5 text-xs text-ink transition-colors hover:bg-ink hover:text-ground disabled:opacity-50"
                  >
                    {enviando ? "Enviando" : "Enviar reporte"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-ink">Tocá el mapa donde está el agua.</p>
                <p className="text-xs text-ink-soft">Podés acercar el mapa antes para apuntar a la cuadra exacta.</p>
                <button type="button" onClick={colocarCentro} className="rounded-md border border-rule px-3 py-2 text-left text-xs text-ink">Usar el centro visible del mapa</button>
                <p className="text-xs text-ink-soft">Con teclado, mové el mapa con las flechas y seleccioná su centro.</p>
                <button type="button" onClick={cancelar} className="self-start text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
                  Cancelar
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2 py-2">
            {soloLectura ? (
              <button
                type="button"
                onClick={() => setListaAbierta((current) => !current)}
                aria-expanded={listaAbierta}
                className="flex flex-1 items-center gap-2 rounded-md border border-rule px-3 py-1.5 text-sm text-ink transition-colors hover:border-ink-soft"
                title={`Reportes de vecinos en las últimas ${REPORT_TTL_HOURS} h`}
              >
                <span className="size-2 rounded-full bg-water" aria-hidden="true" />
                Reportes de vecinos
                <span className="readout ml-auto text-xs text-ink-soft">{disponible === true ? reportes.length : "—"}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={empezarColocacion}
                  className="flex flex-1 items-center gap-2 rounded-md border border-rule px-3 py-1.5 text-sm text-ink transition-colors hover:border-ink-soft"
                >
                  <span className="size-2 rounded-full bg-water" aria-hidden="true" />
                  Reportar agua en mi cuadra
                </button>
                <button
                  type="button"
                  onClick={() => setListaAbierta((current) => !current)}
                  aria-expanded={listaAbierta}
                  className="readout shrink-0 rounded-md border border-rule px-2 py-1.5 text-xs text-ink-soft transition-colors hover:text-ink"
                  title={`Reportes de vecinos en las últimas ${REPORT_TTL_HOURS} h`}
                >
                  {disponible === true ? reportes.length : "—"}
                </button>
              </>
            )}
          </div>
        )}
        {error ? <p className="border-t border-rule px-3 py-2 text-xs text-alerta">{error}</p> : null}
      </div>

      {listaAbierta && !colocando ? (
        <div className="flex max-h-64 flex-col overflow-y-auto rounded-md border border-rule bg-panel/95 shadow-xl backdrop-blur">
          {reportes.length === 0 ? (
            <p className="px-3 py-3 text-xs text-ink-soft">{disponible === null ? "Consultando aportes…" : disponible === false ? "Consulta no disponible; no podemos afirmar que no haya aportes." : `No hay aportes registrados en ${REPORT_TTL_HOURS} horas. Esto no descarta agua en la zona.`}</p>
          ) : (
            reportes.slice(0, LIST_LIMIT).map((reporte) => (
              <div key={reporte.id} className="flex items-start gap-2 border-b border-rule-soft px-3 py-2 text-xs last:border-b-0">
                <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: REPORT_TYPES[reporte.tipo].color }} aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-ink">
                    {REPORT_TYPES[reporte.tipo].etiqueta} <span className="text-ink-faint">· {haceCuanto(reporte.creadoEn)}</span>
                  </span>
                  {reporte.descripcion ? <span className="truncate text-ink-soft">{reporte.descripcion}</span> : null}
                </div>
                <button
                  type="button"
                  onClick={() => confirmar(reporte.id)}
                  disabled={confirmando !== null || confirmados.includes(reporte.id)}
                  className="readout shrink-0 text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink disabled:opacity-60"
                  title="Yo también lo veo"
                >
                  {confirmando === reporte.id ? "…" : confirmados.includes(reporte.id) ? "Confirmado" : `Confirmar · ${reporte.confirmaciones}`}
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
