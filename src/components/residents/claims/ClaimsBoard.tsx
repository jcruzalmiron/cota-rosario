"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { requestSheet } from "@/components/BottomSheet";
import { PointMap, type MapPoint } from "@/components/PointMap";
import { ReportGlyph } from "@/components/reports/ReportGlyph";
import { BUTTON, ClaimCard } from "@/components/residents/claims/ClaimCard";
import { ClaimHistory } from "@/components/residents/claims/ClaimHistory";
import { useClaims, useMyReports, type MyReport } from "@/components/residents/claims/useClaims";
import { NavGlyph } from "@/components/shell/NavGlyph";
import { Workspace } from "@/components/shell/Workspace";
import { CLAIMS_API, CLAIM_PRESETS, CLAIM_STATUS, dayLabel, filterClaims, groupByDay, placeLabel, presetRange, rangeLabel, rangeProblem, toggled, totalClaims, type ClaimPreset, type ClaimRange } from "@/lib/claims";
import { REPORT_HREF } from "@/lib/navigation";
import { MAX_REPORT_ROWS, REPORT_TYPES, isOpenStatus, type Report, type ReportStatus, type ReportType } from "@/lib/reportTypes";

const MAP_POINTS_MAX = 500;
const MAIN_STATUSES: readonly ReportStatus[] = ["new", "in_progress", "resolved"];
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const CHIP = `flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${FOCUS}`;
const CHIP_ON = "border-ink bg-ink text-ground";
const CHIP_OFF = "border-rule text-ink-soft hover:border-ink-soft hover:text-ink";

type ConfirmNotice = { id: string; message: string } | null;

function MyReportItem({ item, today, onForget, onShow }: { item: MyReport; today: string; onForget: () => void; onShow: (report: Report) => void }) {
  const forget = (
    <button type="button" onClick={onForget} className={BUTTON}>
      Quitar de mi lista
    </button>
  );
  if (item.status === "ready") {
    return (
      <ClaimCard
        report={item.report}
        today={today}
        eyebrow="Tu reporte"
        actions={
          <>
            <button type="button" onClick={() => onShow(item.report)} className={`${BUTTON} lg:hidden`}>
              Ver en el mapa
            </button>
            {forget}
          </>
        }
      />
    );
  }
  const message = item.status === "loading" ? "Consultando cómo sigue tu reporte…" : item.status === "gone" ? "Este reporte ya no está en el registro." : "No pudimos consultar cómo sigue este reporte. Probá de nuevo en un rato.";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-rule px-4 py-3">
      <p role="status" className="min-w-0 flex-1 text-sm text-ink-soft">
        {message}
      </p>
      {item.status === "loading" ? null : forget}
    </div>
  );
}

export function ClaimsBoard({ today }: { today: string }) {
  const [preset, setPreset] = useState<ClaimPreset>("today");
  const [range, setRange] = useState<ClaimRange>(() => presetRange("today", today));
  const [draft, setDraft] = useState<ClaimRange>(() => presetRange("week", today));
  const [draftProblem, setDraftProblem] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<ReportStatus[]>([]);
  const [types, setTypes] = useState<ReportType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<ConfirmNotice>(null);
  const { state, reload, replace } = useClaims(range);
  const mine = useMyReports();

  const page = state.status === "ready" ? state.page : null;
  const all = page?.reports ?? [];
  const shown = filterClaims(all, { statuses, types });
  const total = page ? totalClaims(page.counts) : 0;
  const filtering = statuses.length > 0 || types.length > 0;
  const period = rangeLabel(range, today);
  const days = groupByDay(shown);
  const selected = shown.find((report) => report.id === selectedId) ?? mine.items.flatMap((item) => (item.status === "ready" && item.report.id === selectedId ? [item.report] : []))[0] ?? null;

  const choosePreset = (next: ClaimPreset) => {
    setPreset(next);
    setSelectedId(null);
    if (next !== "custom") {
      setDraftProblem(null);
      setRange(presetRange(next, today));
    }
  };

  const applyDraft = (event: FormEvent) => {
    event.preventDefault();
    const problem = rangeProblem(draft, today);
    setDraftProblem(problem);
    if (!problem) {
      setSelectedId(null);
      setRange(draft);
    }
  };

  const clearFilters = () => {
    setStatuses([]);
    setTypes([]);
  };

  const showOnMap = (report: Report) => {
    setSelectedId(report.id);
    requestSheet(false);
  };

  const selectFromMap = (id: string) => {
    setSelectedId(id);
    requestSheet(true);
    window.requestAnimationFrame(() => document.getElementById(`reclamo-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  const confirm = async (report: Report) => {
    if (confirming) {
      return;
    }
    setConfirming(report.id);
    setNotice(null);
    try {
      const response = await fetch(`${CLAIMS_API}/${report.id}/confirm`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; report?: Report };
      if (response.ok && data.ok && data.report) {
        replace(data.report);
        setConfirmed((current) => [...current, report.id]);
      } else {
        setNotice({ id: report.id, message: response.status === 409 ? "Este reclamo ya se cerró: no hace falta confirmarlo." : (data.error ?? "No se pudo confirmar. Probá de nuevo.") });
        if (response.status === 409) {
          reload();
        }
      }
    } catch {
      setNotice({ id: report.id, message: "No se pudo confirmar. Revisá tu conexión y probá de nuevo." });
    } finally {
      setConfirming(null);
    }
  };

  const points: MapPoint[] = shown.slice(0, MAP_POINTS_MAX).map((report) => ({
    id: report.id,
    lat: report.lat,
    lon: report.lon,
    color: CLAIM_STATUS[report.status].color,
    label: `${REPORT_TYPES[report.type].label} · ${CLAIM_STATUS[report.status].label} · ${placeLabel(report.district)}`,
    kind: "report",
  }));

  const rail = (
    <div className="flex flex-col">
      <header className="px-5 pb-4 pt-1 lg:pt-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Reclamos</h1>
          <button type="button" onClick={() => requestSheet(false)} className={`-mr-2 flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink lg:hidden ${FOCUS}`}>
            <NavGlyph icon="map" className="size-4" />
            Ver el mapa
          </button>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">Lo que avisaron los vecinos y cómo sigue cada caso.</p>
      </header>

      {mine.items.length ? (
        <section aria-labelledby="my-reports" className="flex flex-col gap-3 px-5 pb-6">
          <h2 id="my-reports" className="meta">
            Tus reportes · guardados en este dispositivo
          </h2>
          {mine.items.map((item) => (
            <MyReportItem key={item.id} item={item} today={today} onForget={() => mine.forget(item.id)} onShow={showOnMap} />
          ))}
        </section>
      ) : null}

      <section aria-label="Filtros" className="hairline flex flex-col gap-3 py-4">
        <div className="flex flex-wrap gap-2 px-5" role="group" aria-label="Período">
          {CLAIM_PRESETS.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={preset === entry.id} onClick={() => choosePreset(entry.id)} className={`${CHIP} ${preset === entry.id ? CHIP_ON : CHIP_OFF}`}>
              {entry.label}
            </button>
          ))}
        </div>

        {preset === "custom" ? (
          <form onSubmit={applyDraft} className="mx-5 flex flex-col gap-3 rounded-xl border border-rule bg-panel/60 p-3">
            <div className="grid grid-cols-2 gap-3">
              {(["from", "to"] as const).map((field) => (
                <label key={field} className="flex min-w-0 flex-col gap-1 text-xs text-ink-soft">
                  {field === "from" ? "Desde" : "Hasta"}
                  <input
                    type="date"
                    value={draft[field]}
                    max={today}
                    onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                    className="min-h-11 w-full min-w-0 rounded-lg border border-rule bg-ground px-2.5 text-sm text-ink [color-scheme:dark] focus:border-ink-soft focus:outline-none"
                  />
                </label>
              ))}
            </div>
            {draftProblem ? (
              <p role="alert" className="text-xs text-watch">
                {draftProblem}
              </p>
            ) : (
              <p className="text-xs text-ink-faint">Hasta un año por consulta. Para 2021–2024 vas a ver el historial mensual de Defensa Civil.</p>
            )}
            <button type="submit" className={`min-h-11 rounded-lg bg-ink px-4 text-sm font-medium text-ground hover:opacity-90 ${FOCUS}`}>
              Ver esas fechas
            </button>
          </form>
        ) : null}

        <div className="grid grid-cols-3 gap-2 px-5" role="group" aria-label="Estado">
          {MAIN_STATUSES.map((status) => {
            const entry = CLAIM_STATUS[status];
            const active = statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                onClick={() => setStatuses((current) => toggled(current, status))}
                className={`flex min-h-16 flex-col items-start justify-center gap-1 rounded-xl border px-3 py-2 text-left transition-colors ${FOCUS} ${active ? "border-ink bg-panel-soft" : "border-rule hover:border-ink-soft"}`}
              >
                <span className="readout text-xl leading-none text-ink">{page ? page.counts[status] : "–"}</span>
                <span className="flex items-center gap-1.5 text-xs leading-tight text-ink-soft">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: entry.color }} aria-hidden="true" />
                  {entry.plural}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 px-5" role="group" aria-label="Tipo de problema">
          {(Object.keys(REPORT_TYPES) as ReportType[]).map((type) => {
            const active = types.includes(type);
            return (
              <button key={type} type="button" aria-pressed={active} onClick={() => setTypes((current) => toggled(current, type))} className={`${CHIP} ${active ? CHIP_ON : CHIP_OFF}`}>
                <ReportGlyph type={type} className="size-4" />
                {REPORT_TYPES[type].label}
              </button>
            );
          })}
          {page && page.counts.dismissed > 0 ? (
            <button type="button" aria-pressed={statuses.includes("dismissed")} onClick={() => setStatuses((current) => toggled(current, "dismissed"))} className={`${CHIP} ${statuses.includes("dismissed") ? CHIP_ON : CHIP_OFF}`}>
              {CLAIM_STATUS.dismissed.plural} · {page.counts.dismissed}
            </button>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="claims-list" aria-live="polite" className="hairline flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="claims-list" className="text-sm font-medium text-ink">
            {state.status === "ready" ? (filtering ? `${shown.length} de ${total} ${total === 1 ? "reclamo" : "reclamos"}` : `${total} ${total === 1 ? "reclamo" : "reclamos"}`) : "Reclamos"} · <span className="text-ink-soft">{period}</span>
          </h2>
          {filtering ? (
            <button type="button" onClick={clearFilters} className={`-my-2 flex min-h-11 items-center text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink ${FOCUS}`}>
              Quitar filtros
            </button>
          ) : null}
        </div>

        {state.status === "loading" ? (
          <p role="status" className="rounded-xl border border-dashed border-rule px-4 py-6 text-center text-sm text-ink-soft">
            Consultando los reclamos…
          </p>
        ) : null}

        {state.status === "error" ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-watch/50 bg-watch/10 px-4 py-4">
            <p className="text-sm leading-relaxed text-ink">No pudimos consultar los reclamos. No sabemos si hubo o no: no lo tomes como que no pasó nada.</p>
            <button type="button" onClick={reload} className={BUTTON}>
              Probar de nuevo
            </button>
          </div>
        ) : null}

        {state.status === "ready" && total === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-rule px-4 py-5">
            <p className="text-[0.9375rem] font-medium text-ink">{range.from === today && range.to === today ? "Hoy nadie reportó problemas en Rosario" : `Nadie reportó problemas ${period}`}</p>
            <p className="text-sm leading-relaxed text-ink-soft">Eso no asegura que no haya agua en alguna cuadra: sólo que nadie avisó por Cota. Si ves algo, avisá vos.</p>
            <Link href={REPORT_HREF} className={`flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-ground hover:opacity-90 ${FOCUS}`}>
              <NavGlyph icon="report" className="size-4" />
              Reportar agua
            </Link>
          </div>
        ) : null}

        {state.status === "ready" && total > 0 && shown.length === 0 ? <p className="rounded-xl border border-dashed border-rule px-4 py-5 text-sm text-ink-soft">Ningún reclamo coincide con esos filtros.</p> : null}

        {days.map((day) => (
          <div key={day.day} className="flex flex-col gap-3">
            {range.from !== range.to ? (
              <h3 className="meta flex items-center gap-3">
                {dayLabel(day.day, today)}
                <span className="h-px flex-1 bg-rule-soft" aria-hidden="true" />
                <span>{day.reports.length}</span>
              </h3>
            ) : null}
            {day.reports.map((report) => (
              <div key={report.id} className="flex flex-col gap-1.5">
                <ClaimCard
                  report={report}
                  today={today}
                  selected={report.id === selectedId}
                  actions={
                    <>
                      <button type="button" onClick={() => showOnMap(report)} className={`${BUTTON} lg:hidden`}>
                        Ver en el mapa
                      </button>
                      <button type="button" onClick={() => setSelectedId(report.id)} className={`${BUTTON} max-lg:hidden`}>
                        Ubicar en el mapa
                      </button>
                      {isOpenStatus(report.status) ? (
                        <button type="button" onClick={() => confirm(report)} disabled={confirming !== null || confirmed.includes(report.id)} className={BUTTON}>
                          {confirming === report.id ? "Enviando…" : confirmed.includes(report.id) ? "Confirmado ✓" : "Yo también lo veo"}
                        </button>
                      ) : null}
                    </>
                  }
                />
                {notice?.id === report.id ? (
                  <p role="alert" className="px-1 text-xs text-watch">
                    {notice.message}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ))}

        {page?.truncated ? <p className="text-xs leading-relaxed text-ink-faint">Se muestran los {MAX_REPORT_ROWS} más recientes del período. Achicá las fechas para ver el resto.</p> : null}
        {shown.length > MAP_POINTS_MAX ? <p className="text-xs leading-relaxed text-ink-faint">El mapa dibuja los {MAP_POINTS_MAX} más recientes.</p> : null}
      </section>

      <ClaimHistory range={range} />
    </div>
  );

  return (
    <Workspace
      sheetOpen
      rail={rail}
      canvas={
        <PointMap
          points={points}
          focus={selected ? { lat: selected.lat, lon: selected.lon } : null}
          fitPoints={!selected && points.length > 0}
          onPointSelect={selectFromMap}
          overlay={
            <p className="pointer-events-none flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-rule bg-panel/90 px-4 py-2 text-xs text-ink-soft shadow-lg backdrop-blur">
              {state.status === "ready" ? (
                points.length ? (
                  MAIN_STATUSES.map((status) => (
                    <span key={status} className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: CLAIM_STATUS[status].color }} aria-hidden="true" />
                      {CLAIM_STATUS[status].label}
                    </span>
                  ))
                ) : (
                  `Sin reclamos para mostrar ${range.from === range.to ? period : "en ese período"}`
                )
              ) : state.status === "error" ? (
                "No pudimos consultar los reclamos"
              ) : (
                "Consultando los reclamos…"
              )}
            </p>
          }
        />
      }
    />
  );
}
