import type { ReactNode } from "react";
import { Motion } from "@/components/motion/Motion";
import { districtLabel } from "@/lib/opsClaims";
import type { DemandHorizon, DemandModel } from "@/lib/forecast/demand";

const PERCENT = 100;
const CHART_W = 600;
const CHART_H = 240;
const CURVE_SAMPLES = 40;
const Y_TICKS = 4;
const X_TICKS = 5;

function niceCeil(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * magnitude;
}

/** Rango bajo–alto con el valor esperado marcado, sobre una escala compartida entre horizontes. */
export function DemandRangeBar({ horizon, scaleMax }: { horizon: DemandHorizon; scaleMax: number }) {
  const position = (value: number) => `${Math.min(PERCENT, (value / Math.max(scaleMax, 1)) * PERCENT)}%`;
  const width = Math.max(0, ((horizon.high - horizon.low) / Math.max(scaleMax, 1)) * PERCENT);
  return (
    <div data-reveal>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="meta">Próximas {horizon.horizonHours} h{horizon.horizonHours === 48 ? " · acumulado" : ""}</p>
        <p className="readout text-xs text-ink-soft">{horizon.rainMm.toFixed(1)} mm previstos</p>
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2.5">
        <span className="readout text-5xl font-medium tabular-nums text-ink">{horizon.expected}</span>
        <span className="text-sm text-ink-soft">{horizon.expected === 1 ? "intervención esperada" : "intervenciones esperadas"}</span>
      </p>
      <div className="relative mt-4 h-2.5 rounded-full bg-rule-soft" role="img" aria-label={`Rango de ${horizon.low} a ${horizon.high}, valor esperado ${horizon.expected}`}>
        <span className="absolute inset-y-0 rounded-full bg-water/45" style={{ left: position(horizon.low), width: `${Math.max(width, 1)}%` }} />
        <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded bg-ink" style={{ left: position(horizon.expected) }} />
      </div>
      <p className="readout mt-2 flex justify-between text-xs text-ink-soft">
        <span>bajo {horizon.low}</span>
        <span>alto {horizon.high}</span>
      </p>
      {horizon.extrapolated ? <p className="mt-2 text-xs leading-relaxed text-watch">La lluvia prevista supera el máximo mensual de la serie: el valor es una extrapolación.</p> : null}
    </div>
  );
}

export function DistrictDemand({ h24, h48 }: { h24: DemandHorizon; h48: DemandHorizon }) {
  const max = Math.max(1, ...h48.districts.map((district) => district.high));
  const byDistrict24 = new Map(h24.districts.map((district) => [district.district, district]));
  return (
    <Motion>
      <ul className="flex flex-col gap-4">
        {h48.districts.map((district) => {
          const day = byDistrict24.get(district.district);
          return (
            <li key={district.district} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]" data-reveal>
              <span className="text-sm text-ink">{districtLabel(district.district)}</span>
              <span className="relative h-2.5 rounded-full bg-rule-soft" role="img" aria-label={`${districtLabel(district.district)}: ${district.expected} esperadas en 48 h, rango ${district.low} a ${district.high}`}>
                <span className="absolute inset-y-0 rounded-full bg-water/35" style={{ left: `${(district.low / max) * PERCENT}%`, width: `${Math.max(((district.high - district.low) / max) * PERCENT, 0.5)}%` }} />
                <span className="absolute inset-y-0 left-0 rounded-full bg-water" style={{ width: `${(district.expected / max) * PERCENT}%` }} data-grow-x />
              </span>
              <span className="readout col-start-2 whitespace-nowrap text-xs text-ink-soft sm:col-start-3 sm:text-right">
                48 h <span className="text-ink">{district.expected}</span> ({district.low}–{district.high}) · 24 h <span className="text-ink">{day?.expected ?? "—"}</span>
              </span>
              <span className="col-start-2 text-[0.6875rem] text-ink-faint sm:col-start-2">{(district.share * PERCENT).toFixed(0)} % de las intervenciones históricas</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        Barra llena: esperado a 48 h. Banda clara: rango. El reparto usa la proporción histórica de cada distrito, que cambia mucho de un mes a otro; por eso los rangos por distrito no suman el de la ciudad.
      </p>
    </Motion>
  );
}

interface FitChartProps {
  training: DemandModel["training"];
  curve: (rainMm: number) => number;
  eventRainMm: number | null;
}

/** Lluvia mensual contra intervenciones: cada punto es un mes observado; la línea, el modelo ajustado. */
export function FitChart({ training, curve, eventRainMm }: FitChartProps) {
  const maxRain = Math.max(...training.map((month) => month.rainMm), eventRainMm ?? 0) * 1.05 || 1;
  const maxCases = niceCeil(Math.max(...training.map((month) => Math.max(month.cases, month.fitted)), curve(maxRain)));
  const x = (rain: number) => (rain / maxRain) * PERCENT;
  const y = (cases: number) => (cases / maxCases) * PERCENT;
  const line = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const rain = (maxRain * i) / CURVE_SAMPLES;
    return `${i ? "L" : "M"}${((rain / maxRain) * CHART_W).toFixed(1)} ${(CHART_H - (Math.min(curve(rain), maxCases) / maxCases) * CHART_H).toFixed(1)}`;
  }).join(" ");
  const ticks = Array.from({ length: Y_TICKS + 1 }, (_, i) => (maxCases * i) / Y_TICKS);
  const xStep = niceCeil(maxRain / X_TICKS);
  const xTicks = Array.from({ length: Math.floor(maxRain / xStep) + 1 }, (_, i) => i * xStep);

  return (
    <Motion>
      <figure>
        <div className="flex gap-2">
          <div className="readout relative w-8 shrink-0 text-right text-[0.625rem] text-ink-faint" style={{ height: CHART_H }} aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} className="absolute right-0 translate-y-1/2" style={{ bottom: `${y(tick)}%` }}>
                {tick}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1" style={{ height: CHART_H }}>
            {ticks.map((tick) => (
              <span key={tick} className="absolute inset-x-0 border-t border-rule-soft" style={{ bottom: `${y(tick)}%` }} aria-hidden="true" />
            ))}
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
              {training.map((month) => (
                <line key={month.month} x1={(month.rainMm / maxRain) * CHART_W} x2={(month.rainMm / maxRain) * CHART_W} y1={CHART_H - (month.cases / maxCases) * CHART_H} y2={CHART_H - (month.fitted / maxCases) * CHART_H} stroke="var(--ink-faint)" strokeWidth="1" strokeOpacity="0.45" vectorEffect="non-scaling-stroke" />
              ))}
              <path d={line} fill="none" stroke="var(--watch)" strokeWidth="2" vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray={1} data-draw />
            </svg>
            {eventRainMm !== null && eventRainMm > 0 ? (
              <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-ink-soft" style={{ left: `${x(eventRainMm)}%` }} data-reveal>
                <span className={`readout absolute top-0 whitespace-nowrap rounded bg-ground/85 px-1.5 py-0.5 text-[0.625rem] text-ink-soft ${x(eventRainMm) > 60 ? "right-1" : "left-1"}`}>previsto 48 h · {eventRainMm.toFixed(1)} mm</span>
              </div>
            ) : null}
            {training.map((month) => (
              <span
                key={month.month}
                className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border border-ground bg-water"
                style={{ left: `${x(month.rainMm)}%`, bottom: `${y(month.cases)}%` }}
                title={`${month.month}: ${month.rainMm} mm · ${month.cases} intervenciones · ajuste ${month.fitted} · validación ${month.looPredicted}`}
                data-reveal
              />
            ))}
          </div>
        </div>
        <div className="readout relative ml-10 mt-2 h-9 text-[0.625rem] text-ink-faint" aria-hidden="true">
          {xTicks.map((tick) => (
            <span key={tick} className="absolute -translate-x-1/2" style={{ left: `${x(tick)}%` }}>
              {tick}
            </span>
          ))}
          <span className="absolute right-0 top-4 font-sans">mm de lluvia en el mes</span>
        </div>
        <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.6875rem] text-ink-soft">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-water" aria-hidden="true" />
            un mes observado · intervenciones (eje vertical) y mm de lluvia (eje horizontal)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-watch" aria-hidden="true" />
            modelo ajustado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-px bg-ink-faint" aria-hidden="true" />
            error de cada mes
          </span>
        </figcaption>
      </figure>
    </Motion>
  );
}

export function TrainingMonths({ training }: { training: DemandModel["training"] }) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full min-w-[24rem] border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-ground">
          <tr className="border-b border-rule text-ink-faint">
            <th scope="col" className="py-2 pr-3 font-normal">Mes</th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">Lluvia mm</th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">Intervenciones</th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">Ajuste</th>
            <th scope="col" className="py-2 text-right font-normal">Validación</th>
          </tr>
        </thead>
        <tbody>
          {training.map((month) => (
            <tr key={month.month} className="border-b border-rule-soft">
              <th scope="row" className="readout py-1.5 pr-3 font-normal text-ink-soft">{month.month}</th>
              <td className="readout py-1.5 pr-3 text-right text-ink-soft">{month.rainMm.toFixed(1)}</td>
              <td className="readout py-1.5 pr-3 text-right text-ink">{month.cases}</td>
              <td className="readout py-1.5 pr-3 text-right text-ink-soft">{month.fitted.toFixed(1)}</td>
              <td className="readout py-1.5 text-right text-ink-soft">{month.looPredicted.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type SignalTone = "neutral" | "watch" | "critical" | "missing";

const SIGNAL_BORDER: Record<SignalTone, string> = { neutral: "border-rule", watch: "border-watch", critical: "border-critical", missing: "border-rule border-dashed" };

export function Signal({ title, tone, headline, children }: { title: string; tone: SignalTone; headline: ReactNode; children?: ReactNode }) {
  return (
    <li className={`border-l-2 pl-3.5 ${SIGNAL_BORDER[tone]}`}>
      <p className="meta">{title}</p>
      <p className={`mt-1 text-sm leading-snug ${tone === "missing" ? "text-ink-soft" : tone === "critical" ? "text-critical" : tone === "watch" ? "text-watch" : "text-ink"}`}>{headline}</p>
      {children ? <div className="mt-1.5 text-xs leading-relaxed text-ink-soft">{children}</div> : null}
    </li>
  );
}

export function CardFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="meta">{label}</dt>
      <dd className="text-xs leading-relaxed text-ink-soft">{children}</dd>
    </div>
  );
}
