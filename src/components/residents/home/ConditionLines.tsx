import type { ConditionLine, LineTone } from "@/lib/residents";

const TONE_COLOR: Record<LineTone, string> = {
  calm: "var(--normal)",
  watch: "var(--watch)",
  alert: "var(--critical)",
  missing: "var(--ink-faint)",
};

/** El río, la lluvia y los arroyos: un renglón cada uno con el valor, qué significa y de cuándo es. */
export function ConditionLines({ lines }: { lines: readonly ConditionLine[] }) {
  return (
    <section aria-labelledby="conditions" className="hairline px-5 py-5">
      <h2 id="conditions" className="meta">
        El agua, ahora
      </h2>
      <ul className="mt-3 flex flex-col divide-y divide-rule-soft">
        {lines.map((line) => (
          <li key={line.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            {line.tone === "missing" ? (
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full border border-dashed border-ink-faint" aria-hidden="true" />
            ) : (
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: TONE_COLOR[line.tone] }} aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium text-ink">{line.name}</span>
                <span className="readout text-sm text-ink">{line.value || "sin dato"}</span>
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{line.meaning}</p>
              {line.freshness ? <p className="mt-0.5 text-xs text-ink-faint">{line.freshness}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
