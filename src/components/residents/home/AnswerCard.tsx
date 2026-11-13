import { AnswerActions, ShowMapButton } from "@/components/residents/home/AnswerActions";
import type { AnswerTone, ResidentAnswer } from "@/lib/residents";
import { argentinaTime } from "@/lib/time";

const TONE_COLOR: Record<AnswerTone, string> = {
  calm: "var(--normal)",
  watch: "var(--watch)",
  alert: "var(--alert)",
  critical: "var(--critical)",
  unknown: "var(--ink-faint)",
};

const TONE_WORD: Record<AnswerTone, string> = {
  calm: "Tranquilo",
  watch: "Atención",
  alert: "Alerta",
  critical: "Riesgo alto",
  unknown: "Sin datos",
};

/** La respuesta a «¿tengo que hacer algo hoy?»: titular, una razón, acciones y qué hacer. */
export function AnswerCard({ answer, assessedAt }: { answer: ResidentAnswer; assessedAt: string }) {
  const color = TONE_COLOR[answer.tone];
  const urgent = answer.tone === "alert" || answer.tone === "critical";
  return (
    <section aria-labelledby="answer-title" className="relative px-5 pb-6 pt-1 lg:pt-6">
      <div className="flex items-center justify-between gap-3">
        <p className="meta flex min-w-0 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
          <span className="truncate">
            <span style={{ color }}>{TONE_WORD[answer.tone]}</span> · hoy {argentinaTime(assessedAt)}
          </span>
        </p>
        <ShowMapButton />
      </div>
      <h1 id="answer-title" className="mt-3 text-balance text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-ink">
        {answer.headline}
      </h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{answer.why}</p>

      <AnswerActions actions={answer.actions} />

      <details open={urgent} className="group mt-4 rounded-xl border border-rule-soft bg-panel/60">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
          {urgent ? "Qué hacer si entra agua" : "Qué conviene hacer hoy"}
          <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <ol className="flex flex-col gap-2.5 px-4 pb-4 pt-1">
          {answer.tips.map((tip, index) => (
            <li key={tip} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
              <span className="readout mt-0.5 text-xs text-ink-faint" aria-hidden="true">
                {index + 1}
              </span>
              {tip}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
