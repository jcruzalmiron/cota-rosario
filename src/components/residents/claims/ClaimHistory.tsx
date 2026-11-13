"use client";

import { useEffect, useState } from "react";
import { districtName, districtTotals, historyMonths, monthName, overlapsHistory, partialYears, type CivilDefenseHistory, type CivilDefenseMonth, type ClaimRange } from "@/lib/claims";
import { argentinaDay } from "@/lib/time";

const HISTORY_URL = "/data/civil-defense.json";
const MONTHS_SHOWN = 12;

type Loaded = { status: "loading" } | { status: "error" } | { status: "ready"; history: CivilDefenseHistory };

function isHistory(data: unknown): data is CivilDefenseHistory {
  const history = data as Partial<CivilDefenseHistory> | null;
  return typeof history === "object" && history !== null && Array.isArray(history.series) && typeof history.period?.from === "string" && typeof history.districts === "object" && typeof history.city?.total === "number";
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <li className="grid grid-cols-[5.5rem_1fr_2.75rem] items-center gap-2 text-xs">
      <span className="text-ink-soft">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-rule-soft" aria-hidden="true">
        <span className="block h-full rounded-full bg-water" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </span>
      <span className="readout text-right text-ink">{value}</span>
    </li>
  );
}

function MonthRow({ entry }: { entry: CivilDefenseMonth }) {
  const districts = Object.entries(entry.byDistrict).sort((a, b) => b[1] - a[1]);
  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium text-ink first-letter:uppercase">{monthName(entry.month)}</span>
        <span className="readout text-ink">
          {entry.cases} {entry.cases === 1 ? "intervención" : "intervenciones"}
        </span>
      </p>
      <p className="text-xs text-ink-soft">
        Llovieron {entry.rainMm.toFixed(1).replace(".", ",")} mm en el mes.
        {districts.length ? ` Por distrito: ${districts.map(([district, cases]) => `${districtName(district)} ${cases}`).join(" · ")}.` : ""}
      </p>
    </li>
  );
}

/**
 * Contexto anterior al registro de Cota: intervenciones de Defensa Civil por anegamientos.
 * Es un dato mensual y por distrito; no se muestra como reclamos de un día.
 */
export function ClaimHistory({ range }: { range: ClaimRange }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetch(HISTORY_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => active && setLoaded(isHistory(data) ? { status: "ready", history: data } : { status: "error" }))
      .catch(() => active && setLoaded({ status: "error" }));
    return () => {
      active = false;
    };
  }, []);

  if (loaded.status !== "ready") {
    return loaded.status === "error" ? <p className="px-5 pb-8 text-xs text-ink-faint">No pudimos cargar el historial de Defensa Civil de 2021 a 2024.</p> : null;
  }

  const { history } = loaded;
  const overlaps = overlapsHistory(history, range);
  const months = overlaps ? historyMonths(history, range) : [];
  const totals = districtTotals(history);
  const max = totals[0]?.total ?? 0;
  const partial = partialYears(history);
  const years = `${history.period.from.slice(0, 4)}–${history.period.until.slice(0, 4)}`;

  return (
    <details key={String(overlaps)} open={overlaps} className="group mx-5 mb-8 rounded-xl border border-dashed border-rule">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
        <span className="text-sm text-ink">
          Antes de Cota: historial {years}
          <span className="block text-xs text-ink-faint">Intervenciones de Defensa Civil por anegamientos · por mes y distrito</span>
        </span>
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="flex flex-col gap-4 border-t border-dashed border-rule px-4 py-4">
        <p className="text-sm leading-relaxed text-ink-soft">
          Cota guarda reclamos de vecinos desde que empezó a funcionar. Para los años anteriores existe el registro municipal de salidas de Defensa Civil por anegamientos. <strong className="font-medium text-ink">Se publica por mes y por distrito</strong>: no
          permite ver un día puntual ni saber si cada caso se resolvió.
        </p>

        {overlaps ? (
          months.length ? (
            <section className="flex flex-col gap-3">
              <h3 className="meta">Los meses que elegiste</h3>
              <ul className="flex flex-col divide-y divide-rule-soft">
                {months.slice(0, MONTHS_SHOWN).map((entry) => (
                  <MonthRow key={entry.month} entry={entry} />
                ))}
              </ul>
              {months.length > MONTHS_SHOWN ? <p className="text-xs text-ink-faint">Se muestran los primeros {MONTHS_SHOWN} meses del rango.</p> : null}
            </section>
          ) : (
            <p className="text-sm text-ink-soft">El registro municipal no tiene datos publicados para esos meses.</p>
          )
        ) : null}

        <section className="flex flex-col gap-3">
          <h3 className="meta">Total por distrito · {years}</h3>
          <ul className="flex flex-col gap-2">
            {totals.map((entry) => (
              <Bar key={entry.district} label={districtName(entry.district)} value={entry.total} max={max} />
            ))}
          </ul>
          <p className="readout text-xs text-ink-soft">
            Toda la ciudad: {history.city.total} (
            {Object.entries(history.city.byYear)
              .map(([year, cases]) => `${year}: ${cases}`)
              .join(" · ")}
            )
          </p>
        </section>

        <p className="text-xs leading-relaxed text-ink-faint">
          Fuente: {history.source}, datos abiertos. Período {monthName(history.period.from)} a {monthName(history.period.until)}
          {partial.length ? ` (${partial.map((entry) => `${entry.year} tiene ${entry.months} ${entry.months === 1 ? "mes" : "meses"}`).join("; ")})` : ""}. Copia del {argentinaDay(Date.parse(history.computedAt)).split("-").reverse().join("/")}.
        </p>
      </div>
    </details>
  );
}
