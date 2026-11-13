"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { ClaimFilters } from "@/components/ops/ClaimFilters";
import { ClaimRow, type Claim, type ClaimChange } from "@/components/ops/ClaimRow";
import { STATUS_COLOR } from "@/components/ops/claimStatus";
import { OperatorBar } from "@/components/ops/OperatorBar";
import { BUTTON_PLAIN } from "@/components/ops/ui";
import { PointMap, type MapPoint } from "@/components/PointMap";
import { Workspace } from "@/components/shell/Workspace";
import { claimsApiParams, claimsViewParams, districtLabel, newestFirst, triageOrder, type ClaimStats, type ClaimsView } from "@/lib/opsClaims";
import { MAX_REPORT_ROWS, REPORT_STATUSES, REPORT_STATUS_ORDER, REPORT_TYPES, isOpenStatus, type OpsReport, type ReportCounts } from "@/lib/reportTypes";
import { argentinaDateTime, argentinaDay } from "@/lib/time";

interface ClaimsWorkspaceProps {
  /** Encabezado con los indicadores, renderizado en el servidor. */
  hero: ReactNode;
  view: ClaimsView;
  page: { counts: ReportCounts; truncated: boolean; reports: Claim[] } | null;
  /** Por qué no hay lista: filtro inválido o archivo de reclamos ilegible. */
  pageError: string | null;
  stats: ClaimStats | null;
  statsFrom: string;
  statsTruncated: boolean;
  enabled: boolean;
  disabledMessage: string;
  operator: string | null;
  districts: readonly string[];
  today: string;
  now: number;
}

interface Override {
  basis: string;
  claim: Claim;
}

const SHEET_RELEASE_MS = 400;
const SESSION_EXPIRED = "La sesión venció antes de guardar. El reclamo quedó como estaba.";
const NETWORK_ERROR = "No se pudo guardar: sin conexión con el servidor. El reclamo quedó como estaba.";

function basisOf(claim: Claim): string {
  return `${claim.status}|${claim.statusAt}|${claim.publicNote ?? ""}|${claim.history?.length ?? claim.timeline.length}`;
}

function shortDay(day: string): string {
  const [, month, date] = day.split("-");
  return `${date}/${month}`;
}

function fullDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

function periodText(view: ClaimsView): string {
  return view.from === view.to ? `del ${shortDay(view.from)}` : `del ${shortDay(view.from)} al ${shortDay(view.to)}`;
}

function StatusLegend({ counts }: { counts: Record<string, number> }) {
  return (
    <ul className="glass flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-full px-4 py-2 text-xs text-ink-soft shadow-xl">
      {REPORT_STATUS_ORDER.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: STATUS_COLOR[status] }} aria-hidden="true" />
          {REPORT_STATUSES[status].label}
          <span className="readout text-ink">{counts[status] ?? 0}</span>
        </li>
      ))}
    </ul>
  );
}

export function ClaimsWorkspace({ hero, view, page, pageError, stats, statsFrom, statsTruncated, enabled, disabledMessage, operator, districts, today, now }: ClaimsWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expired, setExpired] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState<boolean | undefined>(true);
  const sheetTimer = useRef<number | null>(null);

  /** Pide abrir o cerrar la hoja en celular y enseguida suelta el pedido, para que el gesto de la persona vuelva a mandar. */
  const requestSheet = useCallback((open: boolean) => {
    setSheetOpen(open);
    if (sheetTimer.current !== null) window.clearTimeout(sheetTimer.current);
    sheetTimer.current = window.setTimeout(() => setSheetOpen(undefined), SHEET_RELEASE_MS);
  }, []);

  useEffect(() => {
    sheetTimer.current = window.setTimeout(() => setSheetOpen(undefined), SHEET_RELEASE_MS);
    return () => {
      if (sheetTimer.current !== null) window.clearTimeout(sheetTimer.current);
    };
  }, []);

  const canManage = enabled && operator !== null && !expired;
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  const claims = useMemo(() => {
    const merged = (page?.reports ?? []).map((claim) => {
      const override = overrides[claim.id];
      return override && override.basis === basisOf(claim) ? override.claim : claim;
    });
    return view.order === "recientes" ? newestFirst(merged) : triageOrder(merged);
  }, [page, overrides, view.order]);

  const shownCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const claim of claims) counts[claim.status] = (counts[claim.status] ?? 0) + 1;
    return counts;
  }, [claims]);

  const points: MapPoint[] = useMemo(
    () =>
      claims.map((claim) => ({
        id: claim.id,
        lat: claim.lat,
        lon: claim.lon,
        color: STATUS_COLOR[claim.status],
        label: `${REPORT_TYPES[claim.type].label} · ${REPORT_STATUSES[claim.status].label} · ${districtLabel(claim.district)}`,
        kind: "report" as const,
      })),
    [claims],
  );

  const selectedClaim = selected ? claims.find((claim) => claim.id === selected) : undefined;
  const openShown = claims.filter((claim) => isOpenStatus(claim.status)).length;
  const openElsewhere = stats ? Math.max(0, stats.waiting + stats.inProgress - openShown) : 0;

  const navigate = (next: ClaimsView) => {
    const query = claimsViewParams(next).toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };

  const showAllOpen = () => {
    if (!stats?.oldestOpen) return;
    navigate({ ...view, period: "rango", from: argentinaDay(Date.parse(stats.oldestOpen.createdAt)), to: today, statuses: ["new", "in_progress"], type: null, district: null });
  };

  const change = async (claim: Claim, input: ClaimChange) => {
    const source = page?.reports.find((item) => item.id === claim.id) ?? claim;
    const basis = basisOf(source);
    const at = new Date().toISOString();
    const publicNote = input.publicNote === undefined ? claim.publicNote : input.publicNote || undefined;
    const { publicNote: previousNote, resolvedAt: previousResolvedAt, ...rest } = claim;
    void previousNote;
    const optimistic: Claim = {
      ...rest,
      status: input.status,
      statusAt: input.status === claim.status ? claim.statusAt : at,
      ...(input.status === "resolved" ? { resolvedAt: previousResolvedAt ?? at } : {}),
      ...(publicNote ? { publicNote } : {}),
      ...(claim.history && operator ? { history: [...claim.history, { status: input.status, at, by: operator, ...(input.note ? { note: input.note } : {}) }] } : {}),
    };
    const previous = overrides[claim.id];
    const rollback = () =>
      setOverrides((current) => {
        const next = { ...current };
        if (previous) next[claim.id] = previous;
        else delete next[claim.id];
        return next;
      });
    const fail = (message: string) => {
      rollback();
      setErrors((current) => ({ ...current, [claim.id]: message }));
    };

    setOverrides((current) => ({ ...current, [claim.id]: { basis, claim: optimistic } }));
    setSaving((current) => ({ ...current, [claim.id]: true }));
    setErrors((current) => {
      const next = { ...current };
      delete next[claim.id];
      return next;
    });
    try {
      const response = await fetch(`/api/ops/reports/${claim.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; report?: OpsReport } | null;
      if (response.status === 401) {
        setExpired(true);
        fail(SESSION_EXPIRED);
        return;
      }
      if (!response.ok || !body?.report) {
        fail(body?.error ?? "No se pudo guardar el cambio. El reclamo quedó como estaba.");
        if (response.status === 409 || response.status === 404) refresh();
        return;
      }
      setOverrides((current) => ({ ...current, [claim.id]: { basis, claim: body.report as OpsReport } }));
      refresh();
    } catch {
      fail(NETWORK_ERROR);
    } finally {
      setSaving((current) => {
        const next = { ...current };
        delete next[claim.id];
        return next;
      });
    }
  };

  const locate = (id: string) => {
    setSelected(id);
    requestSheet(false);
  };

  const pickFromMap = (id: string) => {
    setSelected(id);
    setExpanded(id);
    requestSheet(true);
    requestAnimationFrame(() => document.querySelector(`[data-claim="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  const total = page ? REPORT_STATUS_ORDER.reduce((acc, status) => acc + page.counts[status], 0) : 0;
  const csvHref = `/api/ops/reports.csv?${claimsApiParams(view)}`;

  const rail = (
    <div className="flex flex-col">
      {hero}

      {stats === null ? (
        <p className="hairline px-5 py-4 text-xs leading-relaxed text-watch">No se pudieron calcular los indicadores: el registro de reclamos no respondió. Esto no significa que no haya reclamos.</p>
      ) : statsTruncated ? (
        <p className="hairline px-5 py-4 text-xs leading-relaxed text-watch">
          Los indicadores usan los {MAX_REPORT_ROWS} reclamos más recientes desde el {fullDay(statsFrom)}; hay más en el registro.
        </p>
      ) : null}

      <OperatorBar
        enabled={enabled}
        disabledMessage={disabledMessage}
        operator={expired ? null : operator}
        expired={expired}
        onLogin={() => {
          setExpired(false);
          refresh();
        }}
        onLogout={refresh}
      />

      <section className="hairline px-5 py-5" aria-label="Filtros">
        <ClaimFilters key={`${view.period}-${view.from}-${view.to}`} view={view} counts={page?.counts ?? null} districts={districts} today={today} pending={pending} onChange={navigate} />
      </section>

      <section className="hairline" aria-label="Cola de reclamos">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
          <h2 className="text-[0.8125rem] text-ink-soft" aria-live="polite">
            <span className="readout text-ink">{claims.length}</span> {claims.length === 1 ? "reclamo" : "reclamos"} {periodText(view)}
            {page && claims.length !== total ? <span className="text-ink-faint"> · de {total} en el período</span> : null}
          </h2>
          {canManage ? (
            <a href={csvHref} download className={BUTTON_PLAIN}>
              Exportar CSV
            </a>
          ) : (
            <span className="text-xs text-ink-faint" title="La exportación incluye el historial interno">
              CSV: requiere ingresar
            </span>
          )}
        </div>

        {pageError ? (
          <p role="alert" className="mx-5 mb-4 border-l-2 border-watch pl-3 text-xs leading-relaxed text-watch">
            {pageError}
          </p>
        ) : null}
        {page?.truncated ? (
          <p className="mx-5 mb-4 border-l-2 border-watch pl-3 text-xs leading-relaxed text-ink-soft">
            Se muestran los {MAX_REPORT_ROWS} más recientes. Acotá el período o los filtros para ver el resto.
          </p>
        ) : null}
        {openElsewhere > 0 ? (
          <div className="mx-5 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-critical/40 bg-critical/10 px-3 py-2.5">
            <p className="text-xs leading-snug text-ink">
              {openElsewhere === 1 ? "Hay 1 reclamo abierto" : `Hay ${openElsewhere} reclamos abiertos`} fuera de esta vista.
            </p>
            <button type="button" className={BUTTON_PLAIN} onClick={showAllOpen}>
              Ver todos los abiertos
            </button>
          </div>
        ) : null}

        {claims.length ? (
          <ul className="border-t border-rule-soft">
            {claims.map((claim) => (
              <ClaimRow
                key={claim.id}
                claim={claim}
                now={now}
                canManage={canManage}
                saving={Boolean(saving[claim.id])}
                error={errors[claim.id] ?? null}
                selected={selected === claim.id}
                expanded={expanded === claim.id}
                onToggle={() => {
                  setExpanded((current) => (current === claim.id ? null : claim.id));
                  setSelected(claim.id);
                }}
                onLocate={() => locate(claim.id)}
                onChange={(input) => void change(claim, input)}
              />
            ))}
          </ul>
        ) : page ? (
          <p className="border-t border-rule-soft px-5 py-8 text-sm leading-relaxed text-ink-soft">
            {total === 0 ? `No se cargó ningún reclamo ${periodText(view)} con estos filtros.` : "Ningún reclamo del período tiene los estados elegidos."} Que no haya reclamos no descarta agua en la calle.
          </p>
        ) : null}
      </section>

      <p className="hairline px-5 py-5 text-xs leading-relaxed text-ink-faint">
        El período filtra por fecha de carga (hora de Argentina). Los indicadores de arriba cuentan todo lo registrado desde el {fullDay(statsFrom)}. Tiempos calculados a las {argentinaDateTime(new Date(now).toISOString())}. Lo que ven los vecinos, sin historial interno: <span className="readout">/api/reports</span>.
      </p>
    </div>
  );

  return (
    <Workspace
      sheetOpen={sheetOpen}
      rail={rail}
      canvas={<PointMap points={points} fitPoints focus={selectedClaim ? { lat: selectedClaim.lat, lon: selectedClaim.lon } : null} onPointSelect={pickFromMap} overlay={<StatusLegend counts={shownCounts} />} />}
    />
  );
}
