import type { ReactNode } from "react";
import { ReportGlyph } from "@/components/reports/ReportGlyph";
import { CLAIM_STATUS, claimSteps, momentLabel, placeLabel } from "@/lib/claims";
import { REPORT_TYPES, isOpenStatus, type Report, type ReportStatus } from "@/lib/reportTypes";

export const BUTTON = "flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-rule px-3 text-sm text-ink transition-colors hover:border-ink-soft active:bg-panel-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default disabled:opacity-60";

export function StatusChip({ status }: { status: ReportStatus }) {
  const entry = CLAIM_STATUS[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-ink" style={{ borderColor: `${entry.color}99`, background: `${entry.color}26` }}>
      <span className="size-1.5 rounded-full" style={{ background: entry.color }} aria-hidden="true" />
      {entry.label}
    </span>
  );
}

/** Recibido 14:02 → En atención 14:30 → Resuelto 16:10 */
function Timeline({ report, today }: { report: Report; today: string }) {
  const steps = claimSteps(report);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5" aria-label="Seguimiento del reclamo">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li key={`${step.status}-${step.at}`} className="flex items-center gap-2">
            {index > 0 ? <span className="h-px w-3 bg-ink-faint" aria-hidden="true" /> : null}
            <span className={`flex items-center gap-1.5 text-xs ${last ? "text-ink" : "text-ink-soft"}`}>
              <span className="size-2 shrink-0 rounded-full" style={last ? { background: CLAIM_STATUS[step.status].color } : { boxShadow: `inset 0 0 0 1.5px ${CLAIM_STATUS[step.status].color}` }} aria-hidden="true" />
              {step.label}
              <span className="readout text-ink-soft">{momentLabel(step.at, today)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface ClaimCardProps {
  report: Report;
  today: string;
  selected?: boolean;
  /** Etiqueta sobre el título, por ejemplo «Tu reporte». */
  eyebrow?: string;
  actions?: ReactNode;
}

export function ClaimCard({ report, today, selected = false, eyebrow, actions }: ClaimCardProps) {
  const type = REPORT_TYPES[report.type];
  const status = CLAIM_STATUS[report.status];
  return (
    <article
      id={`reclamo-${report.id}`}
      className={`flex flex-col gap-3 rounded-xl border bg-panel/60 p-4 transition-[border-color,box-shadow] ${selected ? "border-ink-soft shadow-[0_0_0_1px_var(--ink-soft)]" : "border-rule"}`}
      style={{ borderLeftWidth: 3, borderLeftColor: status.color }}
    >
      <header className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-rule bg-ground" style={{ color: type.color }}>
          <ReportGlyph type={report.type} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="meta mb-0.5 text-[0.6875rem]">{eyebrow}</p> : null}
          <h3 className="text-[0.9375rem] font-medium leading-snug text-ink">{type.label}</h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            {placeLabel(report.district)} · <span className="readout">{momentLabel(report.createdAt, today)}</span>
          </p>
        </div>
        <StatusChip status={report.status} />
      </header>

      {report.description ? <p className="text-sm leading-relaxed text-ink-soft">«{report.description}»</p> : null}

      <Timeline report={report} today={today} />
      {isOpenStatus(report.status) && report.timeline.length <= 1 ? <p className="text-xs leading-relaxed text-ink-faint">{status.meaning}</p> : null}

      {report.publicNote ? (
        <p className="rounded-lg border border-rule-soft bg-ground/70 px-3 py-2.5 text-sm leading-relaxed text-ink">
          <span className="meta mb-1 block text-[0.6875rem]">Respuesta de operaciones</span>
          {report.publicNote}
        </p>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-xs text-ink-soft">
          {report.confirmations === 0 ? "Sin confirmaciones de otros vecinos" : report.confirmations === 1 ? "1 vecino más lo confirmó" : `${report.confirmations} vecinos más lo confirmaron`}
        </p>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </footer>
    </article>
  );
}
