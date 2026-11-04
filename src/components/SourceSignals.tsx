import type { Finding } from "@/lib/lookup";
import { SOURCE_STATUS_LABEL, type SourceSignal, type SourceStatus } from "@/lib/placeSignals";
import { riskColor } from "@/components/status";

const STATUS_TEXT: Record<SourceStatus, string> = {
  elevada: "text-alert",
  sin_senales_elevadas: "text-normal",
  ausente: "text-ink-faint",
  vencida: "text-watch",
  no_conectada: "text-ink-faint",
};

const timeFormat = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const dayFormat = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "short" });
const clockFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Hora del dato; las lecturas diarias (medianoche en Rosario) se muestran sólo con la fecha. */
function when(at: string | null): string | null {
  if (!at) return null;
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) return at;
  return clockFormat.format(parsed) === "00:00" ? `${dayFormat.format(parsed)} (lectura diaria)` : timeFormat.format(parsed);
}

function Dot({ status, level }: { status: SourceStatus; level: SourceSignal["level"] }) {
  const solid = status === "elevada" || status === "sin_senales_elevadas";
  return (
    <span
      className="mt-1.5 size-2 shrink-0 rounded-full"
      style={solid ? { background: riskColor(level) } : { boxShadow: "inset 0 0 0 1.5px var(--ink-faint)" }}
      aria-hidden="true"
    />
  );
}

/**
 * Ficha del lugar con exposición y señales separadas: qué se sabe del lugar
 * (fijo) y qué dice cada fuente ahora, con su ámbito y su hora.
 */
export function SourceSignals({ signals, finding, simulated, className = "border-t border-rule px-4 py-3" }: { signals: SourceSignal[]; finding: Finding; simulated: boolean; className?: string }) {
  return (
    <section className={`flex flex-col gap-3 text-sm ${className}`} aria-label="Exposición y señales del lugar">
      <div>
        <h3 className="meta">Exposición del lugar</h3>
        <p className="mt-1 text-ink">
          {finding.inside ? (
            <>
              Área inundable oficial, <span className="readout">zona {finding.zone}</span>
            </>
          ) : (
            "Fuera de las áreas inundables oficiales"
          )}
          {finding.neighbourhood ? <span className="text-ink-soft"> · barrio {finding.neighbourhood.toLowerCase()}</span> : null}
        </p>
        <p className="text-xs leading-snug text-ink-faint">Es una condición fija del mapa oficial: no cambia con el clima del día.</p>
      </div>

      <div>
        <h3 className="meta">Señales por fuente{simulated ? " · reales, no del escenario" : ""}</h3>
        <ul className="mt-1.5 flex flex-col divide-y divide-rule-soft">
          {signals.map((signal) => {
            const at = when(signal.at);
            return (
              <li key={signal.id} className="flex gap-2.5 py-2">
                <Dot status={signal.status} level={signal.level} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-ink">{signal.title}</span>
                    <span className={`text-xs font-medium ${STATUS_TEXT[signal.status]}`}>{SOURCE_STATUS_LABEL[signal.status]}</span>
                  </div>
                  {signal.value !== "—" ? <span className="readout text-xs text-ink">{signal.value}</span> : null}
                  <span className="text-xs leading-snug text-ink-faint">{signal.scope}</span>
                  {at || signal.colorsZones ? (
                    <span className="text-[0.6875rem] text-ink-soft">
                      {[at ? `Dato: ${at}` : null, signal.colorsZones ? "define el color de las zonas" : null].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
