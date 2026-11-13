import type { AlertLevel, AlertsSnapshot, WeatherAlert } from "@/lib/provincial";
import { whenLabel } from "@/lib/residents";

const SMN_ALERTS_URL = "https://www.smn.gob.ar/alertas";

const LEVEL: Record<AlertLevel, { color: string; meaning: string }> = {
  amarilla: { color: "var(--watch)", meaning: "Puede complicar tus actividades de todos los días." },
  naranja: { color: "var(--alert)", meaning: "Fenómeno peligroso para las personas y los bienes." },
  roja: { color: "var(--critical)", meaning: "Fenómeno excepcional. Seguí las indicaciones oficiales." },
};

function period(alert: WeatherAlert, now: number): string {
  return alert.current ? `Rige hasta ${whenLabel(alert.until, now)}` : `Empieza ${whenLabel(alert.from, now)} y sigue hasta ${whenLabel(alert.until, now)}`;
}

function AlertItem({ alert, now }: { alert: WeatherAlert; now: number }) {
  const level = LEVEL[alert.level];
  return (
    <article className="rounded-xl border border-rule bg-panel/70 p-4" style={{ borderLeftWidth: 4, borderLeftColor: level.color }}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="meta" style={{ color: level.color }}>
          Alerta {alert.level} · SMN
        </span>
        {alert.shortTerm ? (
          <span className="rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold text-ground" style={{ background: level.color }}>
            Ya está pasando o es inminente
          </span>
        ) : null}
      </p>
      <h2 className="mt-2 text-lg font-semibold leading-snug text-ink">{alert.event}</h2>
      <p className="readout mt-1 text-xs text-ink">{period(alert, now)}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{alert.description || level.meaning}</p>
      {alert.instructions.length ? (
        <details className="group mt-3 border-t border-rule-soft">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
            Qué hacer
            <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <ul className="flex flex-col gap-2 pb-1">
            {alert.instructions.map((instruction) => (
              <li key={instruction} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
                <span className="mt-2.5 h-px w-3 shrink-0 bg-ink-faint" aria-hidden="true" />
                {instruction}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

/** Alertas oficiales del SMN para Rosario. Si no se pudieron consultar, se dice; no se muestra como «sin alertas». */
export function OfficialAlerts({ alerts, now }: { alerts: AlertsSnapshot | null; now: number }) {
  if (alerts === null) {
    return (
      <p role="status" className="mx-5 mb-6 rounded-xl border border-dashed border-rule px-4 py-3 text-sm leading-relaxed text-ink-soft">
        No pudimos revisar las alertas oficiales del SMN. Miralas en{" "}
        <a href={SMN_ALERTS_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-rule underline-offset-4">
          smn.gob.ar/alertas
        </a>
        .
      </p>
    );
  }
  if (alerts.items.length === 0) {
    return null;
  }
  return (
    <section aria-label="Alertas oficiales para Rosario" className="flex flex-col gap-3 px-5 pb-6">
      {alerts.items.map((alert) => (
        <AlertItem key={`${alert.level}-${alert.event}-${alert.from}`} alert={alert} now={now} />
      ))}
      <p className="text-[0.6875rem] leading-relaxed text-ink-faint">Fuente: {alerts.attribution}.</p>
    </section>
  );
}
