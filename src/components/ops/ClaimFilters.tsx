"use client";

import { useState, type FormEvent } from "react";
import { STATUS_COLOR } from "@/components/ops/claimStatus";
import { BUTTON_PLAIN, FIELD, chipClass } from "@/components/ops/ui";
import { CLAIM_PERIODS, districtLabel, type ClaimOrder, type ClaimPeriod, type ClaimsView } from "@/lib/opsClaims";
import { MAX_REPORT_RANGE_DAYS, REPORT_STATUSES, REPORT_STATUS_ORDER, REPORT_TYPES, type ReportCounts, type ReportStatus, type ReportType } from "@/lib/reportTypes";

interface ClaimFiltersProps {
  view: ClaimsView;
  counts: ReportCounts | null;
  districts: readonly string[];
  today: string;
  pending: boolean;
  onChange: (next: ClaimsView) => void;
}

const PERIODS = Object.keys(CLAIM_PERIODS) as ClaimPeriod[];
const TYPES = Object.keys(REPORT_TYPES) as ReportType[];

export function ClaimFilters({ view, counts, districts, today, pending, onChange }: ClaimFiltersProps) {
  const [rangeOpen, setRangeOpen] = useState(view.period === "rango");
  const [from, setFrom] = useState(view.from);
  const [to, setTo] = useState(view.to);
  const showRange = rangeOpen || view.period === "rango";

  const pickPeriod = (period: ClaimPeriod) => {
    if (period === "rango") {
      setFrom(view.from);
      setTo(view.to);
      setRangeOpen(true);
      return;
    }
    setRangeOpen(false);
    onChange({ ...view, period });
  };

  const applyRange = (event: FormEvent) => {
    event.preventDefault();
    if (from && to) {
      onChange({ ...view, period: "rango", from: from <= to ? from : to, to: from <= to ? to : from });
    }
  };

  const toggleStatus = (status: ReportStatus) => {
    const statuses = view.statuses.includes(status) ? view.statuses.filter((item) => item !== status) : [...view.statuses, status];
    onChange({ ...view, statuses: REPORT_STATUS_ORDER.filter((item) => statuses.includes(item)) });
  };

  return (
    <div className={`flex flex-col gap-4 transition-opacity ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      <div role="group" aria-label="Período" className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
        {PERIODS.map((period) => {
          const active = period === "rango" ? showRange : !showRange && view.period === period;
          return (
            <button key={period} type="button" aria-pressed={active} onClick={() => pickPeriod(period)} className={chipClass(active)}>
              {CLAIM_PERIODS[period].label}
            </button>
          );
        })}
      </div>

      {showRange ? (
        <form onSubmit={applyRange} className="grid grid-cols-2 items-end gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-ink-soft">
            Desde
            <input type="date" className={`${FIELD} readout`} value={from} max={today} onChange={(event) => setFrom(event.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-ink-soft">
            Hasta
            <input type="date" className={`${FIELD} readout`} value={to} max={today} onChange={(event) => setTo(event.target.value)} required />
          </label>
          <p className="col-span-2 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-faint">
            <span>Por fecha de carga, hora de Argentina. Hasta {MAX_REPORT_RANGE_DAYS} días por consulta.</span>
            <button type="submit" className={BUTTON_PLAIN} disabled={!from || !to || (view.period === "rango" && from === view.from && to === view.to)}>
              Aplicar rango
            </button>
          </p>
        </form>
      ) : null}

      <div role="group" aria-label="Estado" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={view.statuses.length === 0} onClick={() => onChange({ ...view, statuses: [] })} className={chipClass(view.statuses.length === 0)}>
          Todos
          {counts ? <span className="readout opacity-70">{REPORT_STATUS_ORDER.reduce((acc, status) => acc + counts[status], 0)}</span> : null}
        </button>
        {REPORT_STATUS_ORDER.map((status) => {
          const active = view.statuses.includes(status);
          return (
            <button key={status} type="button" aria-pressed={active} onClick={() => toggleStatus(status)} className={chipClass(active)}>
              <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[status] }} aria-hidden="true" />
              {REPORT_STATUSES[status].label}
              {counts ? <span className="readout opacity-70">{counts[status]}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-xs text-ink-soft">
          Tipo
          <select className={FIELD} value={view.type ?? ""} onChange={(event) => onChange({ ...view, type: (event.target.value || null) as ReportType | null })}>
            <option value="">Todos</option>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {REPORT_TYPES[type].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-ink-soft">
          Distrito
          <select className={FIELD} value={view.district ?? ""} onChange={(event) => onChange({ ...view, district: event.target.value || null })}>
            <option value="">Todos</option>
            {districts.map((district) => (
              <option key={district} value={district}>
                {districtLabel(district)}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 text-xs text-ink-soft sm:col-span-1">
          Orden
          <select className={FIELD} value={view.order} onChange={(event) => onChange({ ...view, order: event.target.value as ClaimOrder })}>
            <option value="prioridad">Prioridad de atención</option>
            <option value="recientes">Más recientes</option>
          </select>
        </label>
      </div>
    </div>
  );
}
