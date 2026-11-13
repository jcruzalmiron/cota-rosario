import type { ReactNode } from "react";
import { Motion } from "@/components/motion/Motion";
import { riskColor } from "@/components/status";
import type { RiskLevel } from "@/lib/risk";

export type HeroPattern = "summary" | "river" | "rain" | "forecast" | "reports" | "simulator";
export type FigureTone = "neutral" | "watch" | "alert" | "critical";

export interface HeroFigure {
  label: string;
  value: number | null;
  decimals?: number;
  unit?: string;
  detail?: string;
  tone?: FigureTone;
  prefix?: string;
}

interface SectionHeroProps {
  pattern: HeroPattern;
  meta: string;
  title: string;
  children?: ReactNode;
  figures?: HeroFigure[];
  level?: RiskLevel | null;
  status?: string;
}

const TONE_TEXT: Record<FigureTone, string> = {
  neutral: "text-ink",
  watch: "text-watch",
  alert: "text-alert",
  critical: "text-critical",
};

const WAVE_ROWS = 7;
const WAVE_GAP = 26;
const RAIN_STREAKS = 46;
const SCATTER_DOTS = 60;
const TIMELINE_TICKS = 28;

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  // Redondeado: Math.sin puede diferir en el último bit entre Node y el navegador y romper la hidratación.
  return Math.round((x - Math.floor(x)) * 1e4) / 1e4;
}

function Pattern({ pattern }: { pattern: HeroPattern }) {
  const common = "pointer-events-none absolute inset-0 h-full w-full";
  if (pattern === "river") {
    return (
      <svg className={`${common} text-water opacity-[0.16]`} viewBox="0 0 800 220" preserveAspectRatio="none" aria-hidden="true">
        {Array.from({ length: WAVE_ROWS }, (_, row) => {
          const y = 30 + row * WAVE_GAP;
          return <path key={row} d={`M0 ${y} C 100 ${y - 12}, 200 ${y + 12}, 300 ${y} S 500 ${y - 12}, 600 ${y} S 750 ${y + 10}, 800 ${y}`} fill="none" stroke="currentColor" strokeWidth={row === 3 ? 1.4 : 0.8} />;
        })}
      </svg>
    );
  }
  if (pattern === "rain") {
    return (
      <svg className={`${common} text-water opacity-[0.18]`} viewBox="0 0 800 220" preserveAspectRatio="none" aria-hidden="true">
        {Array.from({ length: RAIN_STREAKS }, (_, i) => {
          const x = pseudoRandom(i + 1) * 820;
          const y = pseudoRandom(i + 101) * 200;
          const length = 12 + pseudoRandom(i + 201) * 26;
          return <line key={i} x1={x} y1={y} x2={x - length * 0.28} y2={y + length} stroke="currentColor" strokeWidth="1" strokeLinecap="round" />;
        })}
      </svg>
    );
  }
  if (pattern === "reports") {
    return (
      <svg className={`${common} opacity-[0.22]`} viewBox="0 0 800 220" preserveAspectRatio="none" aria-hidden="true">
        {Array.from({ length: SCATTER_DOTS }, (_, i) => (
          <circle key={i} cx={pseudoRandom(i + 7) * 800} cy={pseudoRandom(i + 307) * 220} r={1 + pseudoRandom(i + 607) * 2.2} fill={i % 9 === 0 ? "var(--critical)" : i % 5 === 0 ? "var(--watch)" : "var(--water)"} />
        ))}
      </svg>
    );
  }
  if (pattern === "simulator") {
    return <div className={`${common} opacity-[0.35] [background-image:linear-gradient(var(--rule-soft)_1px,transparent_1px),linear-gradient(90deg,var(--rule-soft)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(90deg,transparent,black_35%,black)]`} aria-hidden="true" />;
  }
  if (pattern === "forecast") {
    return (
      <svg className={`${common} text-ink-faint opacity-[0.25]`} viewBox="0 0 800 220" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="180" x2="800" y2="180" stroke="currentColor" strokeWidth="1" />
        {Array.from({ length: TIMELINE_TICKS }, (_, i) => (
          <line key={i} x1={i * 30 + 10} y1={i % 4 === 0 ? 160 : 172} x2={i * 30 + 10} y2="180" stroke="currentColor" strokeWidth="1" />
        ))}
      </svg>
    );
  }
  return <div className={`${common} opacity-[0.4] [background-image:radial-gradient(var(--rule)_1px,transparent_1.2px)] [background-size:16px_16px] [mask-image:linear-gradient(90deg,transparent,black_45%,black)]`} aria-hidden="true" />;
}

export function SectionHero({ pattern, meta, title, children, figures = [], level, status }: SectionHeroProps) {
  return (
    <Motion className="relative overflow-hidden border-b border-rule-soft">
      <Pattern pattern={pattern} />
      <div className="relative px-5 pb-6 pt-7">
        <p className="meta" data-reveal>
          {meta}
        </p>
        <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold tracking-tight text-ink" data-reveal>
          {title}
          {status ? (
            <span className="flex items-center gap-2 rounded-full border border-rule bg-ground/60 px-2.5 py-0.5 text-xs font-normal text-ink-soft">
              <span className="size-1.5 rounded-full" style={{ background: riskColor(level ?? null) }} aria-hidden="true" />
              {status}
            </span>
          ) : null}
        </h1>
        {children ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft" data-reveal>
            {children}
          </p>
        ) : null}
        {figures.length ? (
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
            {figures.map((figure) => (
              <div key={figure.label} className="flex min-w-0 flex-col gap-1" data-reveal>
                <dt className="meta truncate">{figure.label}</dt>
                <dd className="flex items-baseline gap-1.5">
                  {figure.prefix ? <span className={`readout text-2xl ${TONE_TEXT[figure.tone ?? "neutral"]}`}>{figure.prefix}</span> : null}
                  {figure.value === null ? (
                    <span className="readout text-3xl text-ink-faint">—</span>
                  ) : (
                    <span className={`readout text-3xl font-medium tabular-nums sm:text-4xl ${TONE_TEXT[figure.tone ?? "neutral"]}`} data-count={figure.value} data-decimals={figure.decimals ?? 0}>
                      {figure.value.toFixed(figure.decimals ?? 0)}
                    </span>
                  )}
                  {figure.unit ? <span className="text-sm text-ink-soft">{figure.unit}</span> : null}
                </dd>
                {figure.detail ? <p className="text-xs leading-snug text-ink-faint">{figure.detail}</p> : null}
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </Motion>
  );
}
