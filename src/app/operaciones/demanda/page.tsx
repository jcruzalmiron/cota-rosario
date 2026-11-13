import type { Metadata } from "next";
import Link from "next/link";
import { CardFact, DemandRangeBar, DistrictDemand, FitChart, Signal, TrainingMonths, type SignalTone } from "@/components/ops/demand";
import { StaffingPlanner } from "@/components/ops/StaffingPlanner";
import { PanelPage, PanelSection } from "@/components/panel/PanelBlocks";
import { SectionHero, type HeroFigure } from "@/components/panel/SectionHero";
import { defaultDemandModel, demandFromOutlook, estimateDemand, monthlyExpected, type DemandEstimate } from "@/lib/forecast/demand";
import { OPS_CLAIMS_HREF } from "@/lib/navigation";
import { claimStats, type ClaimStats } from "@/lib/opsClaims";
import type { StreamTrend } from "@/lib/provincial";
import { fetchRainBalance, fetchRainOutlook, type RainBalance } from "@/lib/rain";
import { queryReports } from "@/lib/reports";
import { loadStatus } from "@/lib/status";
import { addCalendarDays, argentinaDateTime, argentinaDay } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demanda · Operaciones · Cota" };

const OWN_DATA_WINDOW_DAYS = 365;
const MARGIN_WARNING_M = 0.5;
const PERCENT = 100;
const STREAM_TREND: Record<StreamTrend, string> = { rising: "subiendo", falling: "bajando", steady: "estable" };
const ALERT_TONE: Record<string, SignalTone> = { amarilla: "watch", naranja: "watch", roja: "critical" };

interface RainInput {
  estimate: DemandEstimate;
  /** Cómo se armó la ventana de lluvia. */
  window: string;
  fetchedAt: string;
  balance: RainBalance | null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

/** Lluvia prevista real: primero la ventana móvil de 24 y 48 h; si falla, el pronóstico por día calendario. */
async function loadRainInput(): Promise<{ input: RainInput | null; failure: string | null }> {
  const model = defaultDemandModel();
  try {
    const balance = await fetchRainBalance();
    return { input: { estimate: estimateDemand(model, balance.expected24h, balance.expected48h), window: "ventana móvil desde la hora actual", fetchedAt: balance.fetchedAt, balance }, failure: null };
  } catch (balanceError: unknown) {
    try {
      const outlook = await fetchRainOutlook();
      return { input: { estimate: demandFromOutlook(outlook, model), window: "días calendario (hoy y mañana), no ventana móvil", fetchedAt: outlook.fetchedAt, balance: null }, failure: null };
    } catch (outlookError: unknown) {
      return { input: null, failure: `${message(balanceError)} · ${message(outlookError)}` };
    }
  }
}

async function loadOwnClaims(): Promise<{ stats: ClaimStats; truncated: boolean; from: string } | null> {
  const now = Date.now();
  const today = argentinaDay(now);
  const from = addCalendarDays(today, -OWN_DATA_WINDOW_DAYS);
  try {
    const page = await queryReports({ from, to: today, statuses: null, types: null, districts: null });
    return { stats: claimStats(page.reports, now), truncated: page.truncated, from };
  } catch (error: unknown) {
    console.warn("Own claims unavailable for demand:", error instanceof Error ? error.name : "Error");
    return null;
  }
}

function range(low: number, high: number): string {
  return low === high ? `${low}` : `${low}–${high}`;
}

export default async function DemandPage() {
  const model = defaultDemandModel();
  const { card } = model;
  const [status, rain, own] = await Promise.all([loadStatus(), loadRainInput(), loadOwnClaims()]);
  const estimate = rain.input?.estimate ?? null;
  const { river, streams, alerts } = status;
  const failureOf = (source: string) => status.failures.find((failure) => failure.source === source);
  const openClaims = own ? own.stats.waiting + own.stats.inProgress : null;
  const chosen = card.candidates.find((candidate) => candidate.chosen);
  const margin = river?.marginToAlert ?? null;

  const figures: HeroFigure[] = [
    { label: "Intervenciones · 24 h", value: estimate?.h24.expected ?? null, detail: estimate ? `rango ${range(estimate.h24.low, estimate.h24.high)} · ${estimate.h24.rainMm.toFixed(1)} mm previstos` : "pronóstico de lluvia no disponible", tone: estimate && estimate.h24.expected > 0 ? "watch" : "neutral" },
    { label: "Intervenciones · 48 h", value: estimate?.h48.expected ?? null, detail: estimate ? `rango ${range(estimate.h48.low, estimate.h48.high)} · ${estimate.h48.rainMm.toFixed(1)} mm · acumulado` : "pronóstico de lluvia no disponible", tone: estimate && estimate.h48.expected > 0 ? "watch" : "neutral" },
    { label: "Error típico del modelo", value: chosen?.looMae ?? null, prefix: "±", detail: "intervenciones por mes, en validación" },
    { label: "Reclamos abiertos", value: openClaims, detail: own ? (own.stats.openHomes ? `${own.stats.openHomes} con agua en viviendas` : "cargados por vecinos, sin cerrar") : "registro no disponible", tone: openClaims ? "watch" : "neutral" },
  ];

  return (
    <PanelPage>
      <SectionHero pattern="summary" meta="Estimación orientativa · lluvia prevista" title="Demanda" figures={figures}>
        Cuántas intervenciones por anegamiento esperar con la lluvia prevista y cuánta gente haría falta para cubrirlas. Es una estimación gruesa para dimensionar la guardia: no es un pronóstico oficial ni reemplaza el criterio de Defensa Civil.
      </SectionHero>

      {estimate && rain.input ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <PanelSection title="Intervenciones esperadas" note={`${estimate.unit.charAt(0).toUpperCase()}${estimate.unit.slice(1)} · ${estimate.intervalLabel}. Lluvia de Open-Meteo, ${rain.input.window}; consulta ${argentinaDateTime(rain.input.fetchedAt)}.`}>
              <div className="flex flex-col gap-8">
                <DemandRangeBar horizon={estimate.h24} scaleMax={estimate.h48.high} />
                <DemandRangeBar horizon={estimate.h48} scaleMax={estimate.h48.high} />
                <p className="border-l-2 border-watch pl-3 text-xs leading-relaxed text-ink-soft">
                  El modelo se ajustó con totales mensuales y acá se aplica a un evento de pocas horas. No ve la intensidad: ante una tormenta concentrada conviene planificar con el valor alto. El rango no incluye el error del pronóstico de lluvia.
                </p>
              </div>
            </PanelSection>
            <PanelSection title="Dotación para cubrirla" className="lg:border-l lg:border-rule-soft" note="Cuadrillas y personas por turno según la demanda estimada. Los tres supuestos se pueden cambiar.">
              <StaffingPlanner h24={estimate.h24} h48={estimate.h48} />
            </PanelSection>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <PanelSection title="Por distrito · próximas 48 h">
              <DistrictDemand h24={estimate.h24} h48={estimate.h48} />
            </PanelSection>
            <PanelSection title="Señales que pueden subir la demanda" className="lg:border-l lg:border-rule-soft" note="No entran en el número: el modelo sólo usa la lluvia prevista. Sirven para decidir si planificar con el valor alto.">
              <ul className="flex flex-col gap-5">
                <Signal
                  title="Alertas del SMN · departamento Rosario"
                  tone={!alerts ? "missing" : alerts.items.length ? (alerts.items.some((alert) => alert.level === "roja") ? "critical" : "watch") : "neutral"}
                  headline={!alerts ? "Sin dato: no se pudo consultar. No significa que no haya alertas." : alerts.items.length ? `${alerts.items.length} ${alerts.items.length === 1 ? "alerta vigente o próxima" : "alertas vigentes o próximas"}` : "Sin alertas vigentes ni próximas"}
                >
                  {alerts?.items.length ? (
                    <ul className="flex flex-col gap-1">
                      {alerts.items.map((alert) => (
                        <li key={`${alert.event}-${alert.from}`}>
                          <span className={ALERT_TONE[alert.level] === "critical" ? "text-critical" : "text-watch"}>{alert.level}</span> · {alert.event} · {alert.current ? "rige" : "desde"} {argentinaDateTime(alert.from)} hasta {argentinaDateTime(alert.until)}
                          {alert.shortTerm ? " · aviso a corto plazo" : ""}
                        </li>
                      ))}
                    </ul>
                  ) : alerts ? (
                    <p>{alerts.attribution} · consulta {argentinaDateTime(alerts.fetchedAt)}.</p>
                  ) : (
                    <p>{failureOf("smnAlerts")?.message ?? "La fuente no respondió."}</p>
                  )}
                </Signal>

                <Signal
                  title="Paraná en Rosario"
                  tone={!river ? "missing" : margin !== null && margin <= 0 ? "critical" : margin !== null && margin <= MARGIN_WARNING_M ? "watch" : "neutral"}
                  headline={river ? `${river.station.meters.toFixed(2)} m · ${river.station.trend || "sin tendencia informada"}${margin !== null ? ` · ${margin > 0 ? `${margin.toFixed(2)} m bajo la alerta` : `${Math.abs(margin).toFixed(2)} m sobre la alerta`}` : ""}` : "Sin dato del río: no se puede afirmar que esté normal."}
                >
                  <p>{estimate.riverNote}</p>
                  {river ? <p className="mt-1 text-ink-faint">INA · lectura del {river.station.date.slice(0, 10)}.</p> : null}
                </Signal>

                <Signal
                  title="Arroyos Ludueña y Saladillo"
                  tone={!streams || streams.items.length === 0 ? "missing" : streams.items.some((stream) => !stream.stale && stream.alertM !== null && stream.heightM >= stream.alertM) ? "critical" : streams.items.some((stream) => !stream.stale && stream.trend === "rising") ? "watch" : "neutral"}
                  headline={!streams || streams.items.length === 0 ? "Sin dato de los arroyos: no se puede afirmar que estén normales." : `${streams.items.filter((stream) => !stream.stale && stream.trend === "rising").length} de ${streams.items.length} estaciones subiendo`}
                >
                  {streams?.items.length ? (
                    <ul className="flex flex-col gap-1">
                      {streams.items.map((stream) => (
                        <li key={stream.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span>
                            {stream.stream} · {stream.place}
                          </span>
                          <span className="readout text-ink">
                            {stream.heightM.toFixed(2)} m
                            <span className={`ml-2 font-sans ${stream.stale ? "text-watch" : "text-ink-soft"}`}>
                              {stream.stale ? `lectura vieja · ${argentinaDateTime(stream.at)}` : `${stream.trend ? STREAM_TREND[stream.trend] : "sin tendencia"}${stream.alertM !== null ? ` · alerta ${stream.alertM.toFixed(2)} m` : ""}`}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{failureOf("provincialStreams")?.message ?? "La fuente no trajo estaciones."}</p>
                  )}
                </Signal>

                <Signal
                  title="Lluvia ya caída"
                  tone={rain.input.balance ? "neutral" : "missing"}
                  headline={rain.input.balance ? `${rain.input.balance.fallen24h.toFixed(1)} mm en 24 h · ${rain.input.balance.fallen72h.toFixed(1)} mm en 72 h` : "Sin dato de la lluvia caída en las últimas horas."}
                >
                  <p>Con el suelo y los desagües ya cargados, la misma lluvia genera más anegamientos. Dato modelado por Open-Meteo, no un pluviómetro.</p>
                </Signal>

                <Signal
                  title="Reclamos de vecinos abiertos"
                  tone={!own ? "missing" : own.stats.openHomes ? "critical" : openClaims ? "watch" : "neutral"}
                  headline={!own ? "Sin dato: el registro de reclamos no respondió." : `${own.stats.waiting} sin tomar · ${own.stats.inProgress} en atención`}
                >
                  <p>
                    Trabajo que ya está en la cola y compite por las mismas cuadrillas.{" "}
                    <Link href={OPS_CLAIMS_HREF} className="text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">
                      Abrir la cola de reclamos
                    </Link>
                  </p>
                </Signal>
              </ul>
            </PanelSection>
          </div>
        </>
      ) : (
        <PanelSection title="Intervenciones esperadas">
          <div className="border-l-2 border-watch pl-3 text-xs leading-relaxed text-ink-soft">
            <p className="text-watch">No hay pronóstico de lluvia utilizable, así que no se puede estimar la demanda.</p>
            <p className="mt-1">Sin el dato no se muestra ningún número: una estimación en cero sería engañosa. Actualizar la vista vuelve a consultar.</p>
            {rain.failure ? (
              <details className="mt-2">
                <summary className="cursor-pointer">Detalle de la fuente</summary>
                <p className="mt-1">{rain.failure}</p>
              </details>
            ) : null}
          </div>
        </PanelSection>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <PanelSection title={`Evidencia · ${card.months} meses de lluvia e intervenciones`} note={`${card.dataSource}. Período ${card.period.from} a ${card.period.until}. Cada punto es un mes; la línea es el modelo elegido.`}>
          <FitChart training={model.training} curve={(mm) => monthlyExpected(model, mm)} eventRainMm={estimate?.h48.rainMm ?? null} />
          <details className="group mt-5 text-xs text-ink-soft">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 transition-colors hover:text-ink lg:min-h-0 [&::-webkit-details-marker]:hidden">
              <span className="inline-block transition-transform group-open:rotate-90" aria-hidden="true">▸</span>
              Ver los {card.months} meses en tabla
            </summary>
            <div className="mt-3">
              <TrainingMonths training={model.training} />
            </div>
          </details>
        </PanelSection>

        <PanelSection title="Ficha del modelo" className="lg:border-l lg:border-rule-soft">
          <dl className="flex flex-col gap-4">
            <CardFact label="Modelo elegido">
              <span className="text-ink">{card.chosenLabel}</span> · <span className="readout">{card.formula}</span>
              {Object.entries(card.coefficients).map(([name, value]) => (
                <span key={name} className="readout"> · {name} = {value}</span>
              ))}
            </CardFact>
            <CardFact label="Error en validación (un mes afuera)">
              <table className="mt-1 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule text-ink-faint">
                    <th scope="col" className="py-1.5 pr-3 font-normal">Candidato</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-normal">Error medio</th>
                    <th scope="col" className="py-1.5 text-right font-normal">Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {card.candidates.map((candidate) => (
                    <tr key={candidate.id} className="border-b border-rule-soft">
                      <th scope="row" className={`py-1.5 pr-3 font-normal ${candidate.chosen ? "text-ink" : ""}`}>
                        {candidate.label}
                        {candidate.chosen ? <span className="ml-1.5 rounded-full border border-rule px-1.5 py-px text-[0.625rem] text-ink-soft">elegido</span> : null}
                      </th>
                      <td className={`readout py-1.5 pr-3 text-right ${candidate.chosen ? "text-ink" : ""}`}>{candidate.looMae.toFixed(1)}</td>
                      <td className="readout py-1.5 text-right">{(candidate.looCoverage * PERCENT).toFixed(0)} %</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="py-1.5 pr-3 font-normal text-ink-faint">Referencia: predecir siempre la media</th>
                    <td className="readout py-1.5 pr-3 text-right text-ink-faint">{card.looMaeMeanReference.toFixed(1)}</td>
                    <td className="readout py-1.5 text-right text-ink-faint">—</td>
                  </tr>
                </tbody>
              </table>
              <span className="mt-2 block">Error medio en intervenciones por mes. Es un modelo grueso: se elige el más simple que gana en validación.</span>
            </CardFact>
            <CardFact label="Rango">
              {card.interval.method} Cubre el {(card.interval.looCoverage * PERCENT).toFixed(0)} % de los meses en validación (nominal {(card.interval.nominal * PERCENT).toFixed(0)} %).
            </CardFact>
            <CardFact label="Río">{card.river.note}</CardFact>
            <CardFact label="Datos">
              {card.dataSource} · {card.months} meses ({card.period.from} a {card.period.until}). Lluvia: {card.rainSource}.{card.computedAt ? ` Snapshot del ${card.computedAt.slice(0, 10)}.` : ""}
            </CardFact>
            <CardFact label="Límites">
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {card.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </CardFact>
            {estimate ? (
              <CardFact label="Supuestos de esta estimación">
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  {estimate.assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
              </CardFact>
            ) : null}
          </dl>
        </PanelSection>
      </div>

      <PanelSection title="Calibración con datos propios">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="readout text-4xl font-medium tabular-nums text-ink">{own ? own.stats.total : "—"}</span>
            <span className="text-sm text-ink-soft">
              {own ? (own.stats.total === 1 ? "reclamo registrado por COTA" : "reclamos registrados por COTA") : "registro de reclamos no disponible"}
              {own?.stats.firstAt ? ` desde el ${argentinaDateTime(own.stats.firstAt)}` : ""}
              {own ? ` · ${own.stats.resolvedTotal} ${own.stats.resolvedTotal === 1 ? "resuelto" : "resueltos"}` : ""}
            </span>
          </p>
          <p className="max-w-2xl text-xs leading-relaxed text-ink-soft">
            Hoy la estimación usa sólo el histórico municipal de Defensa Civil, que termina en {card.period.until}. Los reclamos propios todavía no recalibran el modelo: cuando haya suficientes eventos de lluvia con reclamos resueltos y fechados, se podrá ajustar la relación por evento en vez de por mes.
            {own ? ` Se cuentan los cargados desde el ${own.from.slice(8, 10)}/${own.from.slice(5, 7)}/${own.from.slice(0, 4)}${own.truncated ? " (tope de consulta alcanzado: hay más)" : ""}.` : ""}
          </p>
        </div>
      </PanelSection>
    </PanelPage>
  );
}
