import { REPORT_STATUS_ORDER, REPORT_TYPES, isOpenStatus, isReportStatus, type Report, type ReportStatus, type ReportType } from "@/lib/reportTypes";
import { addCalendarDays, argentinaDay, isCalendarDay } from "@/lib/time";

/**
 * Lógica pura de la gestión de reclamos en operaciones: período de la vista, orden de la cola
 * e indicadores del día. No lee la red ni el disco.
 */

export const CLAIM_PERIODS = {
  hoy: { label: "Hoy" },
  ayer: { label: "Ayer" },
  "7d": { label: "7 días" },
  "30d": { label: "30 días" },
  rango: { label: "Rango" },
} as const;

export type ClaimPeriod = keyof typeof CLAIM_PERIODS;
export type ClaimOrder = "prioridad" | "recientes";

export interface ClaimsView {
  period: ClaimPeriod;
  from: string;
  to: string;
  statuses: ReportStatus[];
  type: ReportType | null;
  district: string | null;
  order: ClaimOrder;
}

type RawParams = Record<string, string | string[] | undefined>;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const STATS_WINDOW_DAYS = 30;

function first(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return text === undefined || text === "" ? null : text;
}

export function periodRange(period: Exclude<ClaimPeriod, "rango">, today: string): { from: string; to: string } {
  if (period === "ayer") {
    const yesterday = addCalendarDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (period === "7d") return { from: addCalendarDays(today, -6), to: today };
  if (period === "30d") return { from: addCalendarDays(today, -29), to: today };
  return { from: today, to: today };
}

/**
 * Lee la vista desde la URL. `periodo` es relativo (hoy, ayer, 7d, 30d) para que un enlace compartido
 * siga significando lo mismo mañana; `from`/`to` fijan un rango absoluto. Los valores inválidos se ignoran.
 */
export function claimsViewFromParams(raw: RawParams, today: string): ClaimsView {
  const from = first(raw.from);
  const to = first(raw.to);
  const periodParam = first(raw.periodo);
  let period: ClaimPeriod = "hoy";
  let range = periodRange("hoy", today);
  if ((from && isCalendarDay(from)) || (to && isCalendarDay(to))) {
    const validFrom = from && isCalendarDay(from) ? from : (to as string);
    const validTo = to && isCalendarDay(to) ? to : validFrom;
    period = "rango";
    range = validFrom <= validTo ? { from: validFrom, to: validTo } : { from: validTo, to: validFrom };
  } else if (periodParam === "ayer" || periodParam === "7d" || periodParam === "30d") {
    period = periodParam;
    range = periodRange(periodParam, today);
  }
  const statuses = [...new Set((first(raw.status) ?? "").split(",").filter(isReportStatus))];
  const type = first(raw.type);
  const district = first(raw.district);
  return {
    period,
    ...range,
    statuses: REPORT_STATUS_ORDER.filter((status) => statuses.includes(status)),
    type: type !== null && Object.hasOwn(REPORT_TYPES, type) ? (type as ReportType) : null,
    district: district === null ? null : district.toUpperCase(),
    order: first(raw.orden) === "recientes" ? "recientes" : "prioridad",
  };
}

/** Parámetros de la URL de la vista. Lo que coincide con el valor por defecto no se escribe. */
export function claimsViewParams(view: ClaimsView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.period === "rango") {
    params.set("from", view.from);
    params.set("to", view.to);
  } else if (view.period !== "hoy") {
    params.set("periodo", view.period);
  }
  if (view.statuses.length) params.set("status", view.statuses.join(","));
  if (view.type) params.set("type", view.type);
  if (view.district) params.set("district", view.district);
  if (view.order !== "prioridad") params.set("orden", view.order);
  return params;
}

/** Parámetros que entienden /api/ops/reports y /api/ops/reports.csv: siempre con fechas absolutas. */
export function claimsApiParams(view: ClaimsView): URLSearchParams {
  const params = new URLSearchParams({ from: view.from, to: view.to });
  if (view.statuses.length) params.set("status", view.statuses.join(","));
  if (view.type) params.set("type", view.type);
  if (view.district) params.set("district", view.district);
  return params;
}

const STATUS_RANK: Record<ReportStatus, number> = { new: 0, in_progress: 1, resolved: 2, dismissed: 3 };

/**
 * Orden de atención: primero lo abierto (sin tomar antes que en atención), después agua en viviendas,
 * más confirmaciones y, entre abiertos, el que más espera. Lo cerrado queda al final, lo más reciente arriba.
 */
export function triageOrder<T extends Pick<Report, "status" | "type" | "confirmations" | "createdAt" | "statusAt">>(reports: readonly T[]): T[] {
  return [...reports].sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    if (!isOpenStatus(a.status)) return b.statusAt.localeCompare(a.statusAt);
    const homes = Number(b.type === "home") - Number(a.type === "home");
    if (homes !== 0) return homes;
    if (a.confirmations !== b.confirmations) return b.confirmations - a.confirmations;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function newestFirst<T extends Pick<Report, "createdAt">>(reports: readonly T[]): T[] {
  return [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface ClaimStats {
  /** Abiertos sin tomar, de cualquier fecha. */
  waiting: number;
  /** En atención ahora, de cualquier fecha. */
  inProgress: number;
  /** Cargados hoy (día argentino), en cualquier estado. */
  receivedToday: number;
  resolvedToday: number;
  dismissedToday: number;
  /** Tiempo medio entre la carga y la resolución de los resueltos hoy. `null` si hoy no se resolvió ninguno. */
  meanResolveMsToday: number | null;
  /** Lo mismo para los resueltos en los últimos 30 días. */
  meanResolveMsRecent: number | null;
  resolvedRecent: number;
  /** El reclamo abierto que más espera. */
  oldestOpen: { id: string; createdAt: string; waitMs: number; status: ReportStatus } | null;
  /** Agua en viviendas entre los abiertos. */
  openHomes: number;
  /** Todo lo que COTA registró en la ventana consultada. */
  total: number;
  resolvedTotal: number;
  firstAt: string | null;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : null;
}

function resolveMs(report: Pick<Report, "createdAt" | "resolvedAt">): number | null {
  if (!report.resolvedAt) return null;
  const elapsed = Date.parse(report.resolvedAt) - Date.parse(report.createdAt);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

export function claimStats(reports: readonly Report[], now = Date.now()): ClaimStats {
  const today = argentinaDay(now);
  const dayOf = (iso: string) => argentinaDay(Date.parse(iso));
  const open = reports.filter((report) => isOpenStatus(report.status));
  const resolved = reports.filter((report) => report.status === "resolved" && report.resolvedAt);
  const resolvedToday = resolved.filter((report) => dayOf(report.resolvedAt as string) === today);
  const resolvedRecent = resolved.filter((report) => now - Date.parse(report.resolvedAt as string) < STATS_WINDOW_DAYS * DAY_MS);
  const durations = (list: readonly Report[]) => list.map(resolveMs).filter((value): value is number => value !== null);
  const oldest = [...open].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const firstAt = reports.reduce<string | null>((earliest, report) => (earliest === null || report.createdAt < earliest ? report.createdAt : earliest), null);
  return {
    waiting: open.filter((report) => report.status === "new").length,
    inProgress: open.filter((report) => report.status === "in_progress").length,
    receivedToday: reports.filter((report) => dayOf(report.createdAt) === today).length,
    resolvedToday: resolvedToday.length,
    dismissedToday: reports.filter((report) => report.status === "dismissed" && dayOf(report.statusAt) === today).length,
    meanResolveMsToday: mean(durations(resolvedToday)),
    meanResolveMsRecent: mean(durations(resolvedRecent)),
    resolvedRecent: resolvedRecent.length,
    oldestOpen: oldest ? { id: oldest.id, createdAt: oldest.createdAt, waitMs: Math.max(0, now - Date.parse(oldest.createdAt)), status: oldest.status } : null,
    openHomes: open.filter((report) => report.type === "home").length,
    total: reports.length,
    resolvedTotal: reports.filter((report) => report.status === "resolved").length,
    firstAt,
  };
}

/** Duración legible: «menos de 1 min», «12 min», «3 h 20 min», «2 d 4 h». */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < MINUTE_MS) return "menos de 1 min";
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)} min`;
  if (ms < DAY_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
    return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  }
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  return hours ? `${days} d ${hours} h` : `${days} d`;
}

/** Una duración partida en número y unidad, para las cifras grandes del encabezado. */
export function durationFigure(ms: number): { value: number; unit: string; decimals: number } {
  if (ms < HOUR_MS) return { value: Math.max(0, Math.round(ms / MINUTE_MS)), unit: "min", decimals: 0 };
  if (ms < DAY_MS) return { value: ms / HOUR_MS, unit: "h", decimals: 1 };
  return { value: ms / DAY_MS, unit: "días", decimals: 1 };
}

export function districtLabel(district: string | null): string {
  return district ? district.charAt(0) + district.slice(1).toLowerCase() : "Sin distrito";
}
