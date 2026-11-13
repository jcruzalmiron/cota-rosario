import { MAX_REPORT_RANGE_DAYS, type Report, type ReportCounts, type ReportStatus, type ReportType } from "@/lib/reportTypes";
import { addCalendarDays, argentinaDay, argentinaTime, isCalendarDay } from "@/lib/time";

/*
 * Reclamos del lado de los vecinos: rangos de fechas, textos del seguimiento,
 * «Mis reportes» guardados en el dispositivo y el histórico mensual de Defensa Civil.
 * Todo puro: no lee archivos ni consulta la red.
 */

export const CLAIMS_API = "/api/reports";

export type ClaimPreset = "today" | "yesterday" | "week" | "month" | "custom";

export const CLAIM_PRESETS: readonly { id: ClaimPreset; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "week", label: "7 días" },
  { id: "month", label: "30 días" },
  { id: "custom", label: "Elegir fechas" },
];

export interface ClaimRange {
  from: string;
  to: string;
}

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

/** Rango de cada atajo, contado en días argentinos e incluyendo hoy. */
export function presetRange(preset: Exclude<ClaimPreset, "custom">, today: string): ClaimRange {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const day = addCalendarDays(today, -1);
      return { from: day, to: day };
    }
    case "week":
      return { from: addCalendarDays(today, -(WEEK_DAYS - 1)), to: today };
    case "month":
      return { from: addCalendarDays(today, -(MONTH_DAYS - 1)), to: today };
  }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Devuelve el motivo por el que un rango elegido a mano no se puede consultar, o `null` si sirve. */
export function rangeProblem(range: ClaimRange, today: string): string | null {
  if (!isCalendarDay(range.from) || !isCalendarDay(range.to)) {
    return "Elegí las dos fechas.";
  }
  if (range.from > range.to) {
    return "La primera fecha tiene que ser anterior a la segunda.";
  }
  if (range.to > today) {
    return "No se pueden consultar fechas futuras.";
  }
  if (daysBetween(range.from, range.to) + 1 > MAX_REPORT_RANGE_DAYS) {
    return "El rango máximo es de un año. Achicalo y probá de nuevo.";
  }
  return null;
}

export function claimsUrl(range: ClaimRange): string {
  return `${CLAIMS_API}?${new URLSearchParams({ from: range.from, to: range.to })}`;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"] as const;

/** «hoy», «ayer» o «12 nov» (con el año si no es el actual). */
export function dayLabel(day: string, today: string): string {
  if (day === today) {
    return "hoy";
  }
  if (day === addCalendarDays(today, -1)) {
    return "ayer";
  }
  const [year, month, date] = day.split("-");
  const short = `${Number(date)} ${MONTHS[Number(month) - 1]}`;
  return year === today.slice(0, 4) ? short : `${short} ${year}`;
}

/** «hoy», «del 7 nov a hoy» o «del 1 ene 2021 al 31 mar 2021». */
export function rangeLabel(range: ClaimRange, today: string): string {
  if (range.from === range.to) {
    return dayLabel(range.from, today);
  }
  const until = dayLabel(range.to, today);
  return `del ${dayLabel(range.from, today)} ${until === "hoy" || until === "ayer" ? "a" : "al"} ${until}`;
}

/** «14:02» si fue hoy; si no, «ayer 14:02» o «12 nov 14:02». */
export function momentLabel(iso: string, today: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) {
    return "—";
  }
  const day = argentinaDay(time);
  return day === today ? argentinaTime(iso) : `${dayLabel(day, today)} ${argentinaTime(iso)}`;
}

/** Tiempo transcurrido en lenguaje llano: «recién», «hace 12 min», «hace 3 h», «hace 2 días». */
export function ago(iso: string, now: number): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) {
    return "sin hora";
  }
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 1) {
    return "recién";
  }
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `hace ${hours} h`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

export type ClaimTone = "waiting" | "progress" | "done" | "closed";

/** Cómo se nombra cada estado para un vecino y con qué color se dibuja en la lista y el mapa. */
export const CLAIM_STATUS: Record<ReportStatus, { label: string; plural: string; step: string; tone: ClaimTone; color: string; meaning: string }> = {
  new: { label: "En espera", plural: "En espera", step: "Recibido", tone: "waiting", color: "#5f9bb8", meaning: "Lo recibimos y todavía nadie lo tomó." },
  in_progress: { label: "En atención", plural: "En atención", step: "En atención", tone: "progress", color: "#d2a13a", meaning: "Operaciones lo está atendiendo." },
  resolved: { label: "Resuelto", plural: "Resueltos", step: "Resuelto", tone: "done", color: "#5c9e7a", meaning: "Operaciones lo dio por resuelto." },
  dismissed: { label: "Descartado", plural: "Descartados", step: "Descartado", tone: "closed", color: "#929aa6", meaning: "Operaciones lo revisó y lo cerró sin intervenir." },
};

export interface ClaimStep {
  status: ReportStatus;
  label: string;
  at: string;
}

/** Recorrido público del reclamo. Si volvió a «nuevo» después de otro estado, se lee «Reabierto». */
export function claimSteps(report: Pick<Report, "timeline" | "createdAt" | "status" | "statusAt">): ClaimStep[] {
  const timeline = report.timeline.length ? report.timeline : [{ status: "new" as const, at: report.createdAt }];
  return timeline.map((step, index) => ({ status: step.status, at: step.at, label: step.status === "new" && index > 0 ? "Reabierto" : CLAIM_STATUS[step.status].step }));
}

const DISTRICT_NAMES: Record<string, string> = {
  CENTRO: "Centro",
  NORTE: "Norte",
  NOROESTE: "Noroeste",
  OESTE: "Oeste",
  SUDOESTE: "Sudoeste",
  SUR: "Sur",
};

export function districtName(district: string): string {
  return DISTRICT_NAMES[district.toUpperCase()] ?? district.charAt(0).toUpperCase() + district.slice(1).toLowerCase();
}

/** Lugar aproximado del reclamo. No se publica la dirección exacta en la lista. */
export function placeLabel(district: string | null): string {
  return district ? `Distrito ${districtName(district)}` : "Rosario";
}

export interface ClaimFilter {
  statuses: readonly ReportStatus[];
  types: readonly ReportType[];
}

/** Un filtro vacío deja pasar todo. */
export function filterClaims<T extends Pick<Report, "status" | "type">>(reports: readonly T[], filter: ClaimFilter): T[] {
  return reports.filter((report) => (filter.statuses.length === 0 || filter.statuses.includes(report.status)) && (filter.types.length === 0 || filter.types.includes(report.type)));
}

export function toggled<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}

export function totalClaims(counts: ReportCounts): number {
  return counts.new + counts.in_progress + counts.resolved + counts.dismissed;
}

export interface ClaimDay<T> {
  day: string;
  reports: T[];
}

/** Agrupa por día argentino conservando el orden recibido (el más nuevo primero). */
export function groupByDay<T extends Pick<Report, "createdAt">>(reports: readonly T[]): ClaimDay<T>[] {
  const days: ClaimDay<T>[] = [];
  for (const report of reports) {
    const day = argentinaDay(Date.parse(report.createdAt));
    const last = days.at(-1);
    if (last && last.day === day) {
      last.reports.push(report);
    } else {
      days.push({ day, reports: [report] });
    }
  }
  return days;
}

/* «Mis reportes»: sólo los identificadores, guardados en el dispositivo. */

export const MY_REPORTS_KEY = "cota:my-reports";
export const MY_REPORTS_MAX = 12;
const ID_PATTERN = /^[0-9a-f-]{36}$/;

export function parseMyReports(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const ids = parsed.filter((item): item is string => typeof item === "string" && ID_PATTERN.test(item));
    return [...new Set(ids)].slice(0, MY_REPORTS_MAX);
  } catch {
    return [];
  }
}

/** Suma un reporte al principio y recorta la lista a los más recientes. */
export function rememberReport(ids: readonly string[], id: string): string[] {
  if (!ID_PATTERN.test(id)) {
    return [...ids];
  }
  return [id, ...ids.filter((entry) => entry !== id)].slice(0, MY_REPORTS_MAX);
}

export function forgetReport(ids: readonly string[], id: string): string[] {
  return ids.filter((entry) => entry !== id);
}

/* Histórico de Defensa Civil: mensual y por distrito. Nunca se presenta como reclamos diarios. */

export interface CivilDefenseMonth {
  month: string;
  rainMm: number;
  cases: number;
  byDistrict: Record<string, number>;
}

export interface CivilDefenseHistory {
  source: string;
  period: { from: string; until: string };
  monthsPerYear: Record<string, number>;
  districts: Record<string, { total: number; byYear: Record<string, number> }>;
  city: { total: number; byYear: Record<string, number> };
  series: CivilDefenseMonth[];
  computedAt: string;
}

/** Meses del histórico que toca el rango pedido. Vacío si el rango queda fuera del período publicado. */
export function historyMonths(history: Pick<CivilDefenseHistory, "series">, range: ClaimRange): CivilDefenseMonth[] {
  const from = range.from.slice(0, 7);
  const to = range.to.slice(0, 7);
  return history.series.filter((entry) => entry.month >= from && entry.month <= to);
}

/** ¿El rango pide días que el histórico mensual cubre? */
export function overlapsHistory(history: Pick<CivilDefenseHistory, "period">, range: ClaimRange): boolean {
  return range.from.slice(0, 7) <= history.period.until && range.to.slice(0, 7) >= history.period.from;
}

export function monthName(month: string): string {
  const [year, index] = month.split("-");
  return `${MONTH_NAMES[Number(index) - 1] ?? month} de ${year}`;
}

export function districtTotals(history: Pick<CivilDefenseHistory, "districts">): { district: string; total: number }[] {
  return Object.entries(history.districts)
    .map(([district, entry]) => ({ district, total: entry.total }))
    .sort((a, b) => b.total - a.total);
}

/** Años sin los doce meses publicados, para aclararlo junto a los totales. */
export function partialYears(history: Pick<CivilDefenseHistory, "monthsPerYear">): { year: string; months: number }[] {
  return Object.entries(history.monthsPerYear)
    .filter(([, months]) => months < 12)
    .map(([year, months]) => ({ year, months }));
}
