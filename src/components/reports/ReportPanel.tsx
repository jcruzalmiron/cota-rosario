"use client";

import Link from "next/link";
import { useState } from "react";
import { ReportGlyph } from "@/components/reports/ReportGlyph";
import { howLongAgo, type ReportsState } from "@/components/reports/useReports";
import { CLAIMS_HREF, REPORT_HREF } from "@/lib/navigation";
import { REPORT_TYPES, REPORT_TTL_HOURS } from "@/lib/reportTypes";

const LIST_LIMIT = 8;
const DROP_PATH = "M12 3.5c-3 4-6 7.4-6 10.6a6 6 0 0 0 12 0c0-3.2-3-6.6-6-10.6Z";

interface ReportPanelProps {
  status: ReportsState;
  readOnly?: boolean;
  className?: string;
}

function countLine(available: boolean | null, total: number): string {
  if (available === null) {
    return "Consultando reportes…";
  }
  if (available === false) {
    return "No se pudieron consultar";
  }
  return total === 0 ? `Ninguno sin resolver en ${REPORT_TTL_HOURS} h` : `${total} sin resolver en ${REPORT_TTL_HOURS} h`;
}

function emptyLine(available: boolean | null): string {
  if (available === null) {
    return "Consultando reportes…";
  }
  if (available === false) {
    return "No pudimos consultar los reportes; no sabemos si hay o no.";
  }
  return `Nadie avisó nada que siga sin resolver en las últimas ${REPORT_TTL_HOURS} horas. Eso no descarta agua en tu cuadra.`;
}

function ReportList({ status }: { status: ReportsState }) {
  const { reports, available, confirmed, confirming, confirm } = status;
  if (reports.length === 0) {
    return <p className="px-4 py-3 text-xs leading-relaxed text-ink-soft">{emptyLine(available)}</p>;
  }
  return (
    <ul className="flex flex-col">
      {reports.slice(0, LIST_LIMIT).map((report) => {
        const type = REPORT_TYPES[report.type];
        const isConfirmed = confirmed.includes(report.id);
        return (
          <li key={report.id} className="flex items-start gap-3 border-t border-rule-soft px-4 py-3 first:border-t-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-rule bg-ground" style={{ color: type.color }}>
              <ReportGlyph type={report.type} className="size-[1.125rem]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm text-ink">{type.label}</span>
              <span className="text-[0.6875rem] text-ink-faint">{howLongAgo(report.createdAt)}</span>
              {report.description ? <span className="line-clamp-2 text-xs text-ink-soft">{report.description}</span> : null}
            </span>
            <button
              type="button"
              onClick={() => confirm(report.id)}
              disabled={confirming !== null || isConfirmed}
              title="Yo también lo veo"
              className={`readout shrink-0 rounded-full border px-2.5 py-1 text-[0.6875rem] transition-colors disabled:cursor-default ${isConfirmed ? "border-normal/50 bg-normal/10 text-normal" : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink"}`}
            >
              {confirming === report.id ? "…" : isConfirmed ? "Confirmado" : `Lo veo · ${report.confirmations}`}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ReportPanel({ status, readOnly = false, className = "max-w-xs" }: ReportPanelProps) {
  const { reports, error, available } = status;
  const [isListOpen, setListOpen] = useState(false);
  const total = available === true ? reports.length : null;

  return (
    <div className={`pointer-events-auto flex w-full flex-col overflow-hidden rounded-xl border border-rule bg-panel/95 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.7)] backdrop-blur-xl ${className}`}>
      <button type="button" onClick={() => setListOpen((current) => !current)} aria-expanded={isListOpen} className="group flex items-center gap-3 px-3 py-2.5 text-left">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-rule bg-ground text-water">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <path d={DROP_PATH} />
          </svg>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm text-ink">Reportes de vecinos</span>
          <span className="text-[0.6875rem] text-ink-faint">{countLine(available, reports.length)}</span>
        </span>
        {total !== null && total > 0 ? <span className="readout flex min-w-6 items-center justify-center rounded-full bg-water/20 px-1.5 text-xs leading-6 text-water">{total}</span> : null}
        <svg viewBox="0 0 24 24" className={`size-4 shrink-0 text-ink-faint transition-transform duration-200 group-hover:text-ink ${isListOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isListOpen ? (
        <div className="max-h-72 overflow-y-auto overscroll-contain border-t border-rule-soft">
          <ReportList status={status} />
          <Link href={CLAIMS_HREF} className="flex min-h-11 items-center justify-between gap-3 border-t border-rule-soft px-4 text-xs text-ink-soft hover:text-ink">
            Ver todos los reclamos y cómo siguen
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : null}

      {readOnly ? null : (
        <div className="border-t border-rule-soft p-2.5">
          <Link href={REPORT_HREF} className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-ground transition-opacity hover:opacity-90">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={DROP_PATH} />
              <path d="M12 11v5M9.5 13.5h5" />
            </svg>
            Reportar agua en mi cuadra
          </Link>
        </div>
      )}

      {error ? <p className="border-t border-rule-soft px-4 py-2 text-xs text-alert">{error}</p> : null}
    </div>
  );
}
