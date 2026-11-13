import Link from "next/link";
import { totalClaims } from "@/lib/claims";
import { CLAIMS_HREF } from "@/lib/navigation";
import type { ReportCounts } from "@/lib/reportTypes";

function Figure({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="readout text-2xl leading-none text-ink">{value}</span>
      <span className="flex items-center gap-1.5 text-xs text-ink-soft">
        {color ? <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" /> : null}
        {label}
      </span>
    </span>
  );
}

/** Reclamos de vecinos cargados hoy. `counts` nulo significa que no se pudieron consultar. */
export function TodayClaims({ counts }: { counts: ReportCounts | null }) {
  const total = counts ? totalClaims(counts) : 0;
  return (
    <section aria-labelledby="today-claims" className="hairline px-5 py-5">
      <Link
        href={CLAIMS_HREF}
        className="group -mx-2 flex flex-col gap-3 rounded-xl px-2 py-1 transition-colors hover:bg-panel/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span className="flex items-center justify-between gap-3">
          <span id="today-claims" className="meta">
            Hoy en Rosario · reclamos de vecinos
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-ink-soft group-hover:text-ink">
            Ver todos
            <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">
              →
            </span>
          </span>
        </span>
        {counts === null ? (
          <span className="text-sm leading-relaxed text-ink-soft">No pudimos consultar los reclamos de hoy. Eso no quiere decir que no haya.</span>
        ) : total === 0 ? (
          <span className="text-sm leading-relaxed text-ink-soft">Hoy nadie reportó problemas. Si ves agua en tu cuadra, sé el primero en avisar.</span>
        ) : (
          <span className="grid grid-cols-3 gap-3">
            <Figure value={total} label={total === 1 ? "recibido" : "recibidos"} />
            <Figure value={counts.in_progress} label="en atención" color="var(--watch)" />
            <Figure value={counts.resolved} label={counts.resolved === 1 ? "resuelto" : "resueltos"} color="var(--normal)" />
          </span>
        )}
      </Link>
    </section>
  );
}
