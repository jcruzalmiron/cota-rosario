import { GRADE_FILL } from "@/components/status";
import { GRADE_LABEL, timelinePeak, type TimelineStep } from "@/lib/zoneAlert";

const ZONE = "America/Argentina/Buenos_Aires";
// Zona horaria fija: el texto es idéntico en servidor y cliente.
const dayHour = new Intl.DateTimeFormat("es-AR", { timeZone: ZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const hourOnly = new Intl.DateTimeFormat("es-AR", { timeZone: ZONE, hour: "2-digit", hourCycle: "h23" });
const TICK_EVERY = 12;

function when(hour: string): string {
  const parsed = Date.parse(hour);
  return Number.isFinite(parsed) ? dayHour.format(parsed).replace(",", "") : hour;
}

/** Frase corta: cuándo llega al grado más alto y cuándo baja. */
export function timelineSentence(steps: readonly TimelineStep[]): string | null {
  const peak = timelinePeak(steps);
  if (!peak) return null;
  const label = GRADE_LABEL[peak.grade].toLowerCase();
  if (peak.flat) return peak.grade === 0 ? "Sin cambios previstos en 48 h." : `Se mantiene en ${label} las próximas 48 h.`;
  const starts = peak.from === steps[0].hour ? `Ahora en ${label}` : `Sube a ${label} el ${when(peak.from)}`;
  return peak.until ? `${starts}; baja desde el ${when(peak.until)}.` : `${starts} y sigue así hasta el final del pronóstico.`;
}

interface GradeTimelineProps {
  steps: readonly TimelineStep[];
  /** Compacta: sólo la tira, sin frase ni horas. */
  compact?: boolean;
}

export function GradeTimeline({ steps, compact = false }: GradeTimelineProps) {
  if (!steps.length) return null;
  const sentence = timelineSentence(steps);
  return (
    <div className="flex flex-col gap-1">
      {compact || !sentence ? null : <p className="text-xs leading-snug text-ink-soft">{sentence}</p>}
      <div className={`flex gap-px overflow-hidden rounded-sm ${compact ? "h-1.5" : "h-2.5"}`} role="img" aria-label={sentence ?? "Grado previsto por hora"}>
        {steps.map((step) => (
          <span key={step.hour} className="flex-1" style={{ background: GRADE_FILL[step.grade], opacity: step.grade === 0 ? 0.45 : 1 }} title={`${when(step.hour)} · ${GRADE_LABEL[step.grade]}`} />
        ))}
      </div>
      {compact ? null : (
        <div className="flex justify-between" aria-hidden="true">
          {steps
            .filter((_, index) => index % TICK_EVERY === 0)
            .map((step) => (
              <span key={step.hour} className="readout text-[0.625rem] text-ink-faint">
                {hourOnly.format(Date.parse(step.hour))} h
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
