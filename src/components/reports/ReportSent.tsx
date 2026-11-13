import Link from "next/link";
import { CLAIMS_HREF, EMERGENCY_PHONE } from "@/lib/navigation";

const STEPS = ["Recibido", "En atención", "Resuelto"] as const;
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

interface ReportSentProps {
  onAnother: () => void;
  /** `false` si el navegador no dejó guardar el reporte en «Tus reportes». */
  tracked?: boolean;
}

export function ReportSent({ onAnother, tracked = true }: ReportSentProps) {
  return (
    <section className="flex flex-col items-center px-5 py-10 text-center sm:px-5">
      <span className="relative flex size-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-normal/20 [animation-iteration-count:2] motion-reduce:hidden" aria-hidden="true" />
        <span className="relative flex size-16 items-center justify-center rounded-full border border-normal/60 bg-normal/15 text-normal">
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12 5 5 9-10" />
          </svg>
        </span>
      </span>
      <p className="meta mt-6">Reporte enviado</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Gracias por avisar</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
        Operaciones ya lo recibió y otros vecinos pueden confirmarlo.{" "}
        {tracked ? "Lo guardamos en este dispositivo para que sigas cómo lo atienden." : "Este navegador no deja guardarlo, pero lo vas a encontrar en los reclamos de hoy."}
      </p>

      <ol className="mt-5 flex items-center gap-2 text-xs" aria-label="Cómo sigue tu reporte">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            {index > 0 ? <span className="h-px w-4 bg-rule" aria-hidden="true" /> : null}
            <span className={`flex items-center gap-1.5 ${index === 0 ? "text-ink" : "text-ink-faint"}`}>
              <span className={`size-2 rounded-full ${index === 0 ? "bg-water" : "border border-ink-faint"}`} aria-hidden="true" />
              {step}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
        <Link href={CLAIMS_HREF} className={`flex min-h-12 items-center justify-center rounded-xl bg-ink px-4 text-sm font-medium text-ground hover:opacity-90 ${FOCUS}`}>
          Seguí el estado en Reclamos
        </Link>
        <button type="button" onClick={onAnother} className={`min-h-12 rounded-xl border border-rule px-4 text-sm text-ink hover:border-ink-soft ${FOCUS}`}>
          Reportar otra cosa
        </button>
      </div>
      <a href={`tel:${EMERGENCY_PHONE}`} className={`mt-4 flex min-h-11 items-center text-xs leading-relaxed text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink ${FOCUS}`}>
        Un reporte no reemplaza el aviso a Defensa Civil. Si hay riesgo para personas, llamá al {EMERGENCY_PHONE}
      </a>
    </section>
  );
}
