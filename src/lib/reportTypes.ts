import { distanceMeters } from "@/lib/places";
export const REPORT_TYPES = {
  street: { label: "Calle anegada", color: "#5f9bb8" },
  home: { label: "Agua en viviendas", color: "#dc5449" },
  drain: { label: "Desagüe tapado", color: "#d2a13a" },
  closure: { label: "Calle cortada", color: "#db7c45" },
} as const;

export type ReportType = keyof typeof REPORT_TYPES;

export const REPORT_STATUSES = {
  new: { label: "Nuevo" },
  in_progress: { label: "En atención" },
  resolved: { label: "Resuelto" },
  dismissed: { label: "Descartado" },
} as const;

export type ReportStatus = keyof typeof REPORT_STATUSES;

export const REPORT_STATUS_ORDER = ["new", "in_progress", "resolved", "dismissed"] as const satisfies readonly ReportStatus[];
export const OPEN_REPORT_STATUSES = ["new", "in_progress"] as const satisfies readonly ReportStatus[];

/** Cambios de estado que puede hacer un operador. */
export const REPORT_TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  new: ["in_progress", "resolved", "dismissed"],
  in_progress: ["resolved", "dismissed", "new"],
  resolved: ["in_progress"],
  dismissed: ["new"],
};

export function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && Object.hasOwn(REPORT_STATUSES, value);
}

export function isOpenStatus(status: ReportStatus): boolean {
  return status === "new" || status === "in_progress";
}

/** Paso público del seguimiento: qué estado y desde cuándo, sin quién ni notas internas. */
export interface ReportTimelineStep {
  status: ReportStatus;
  at: string;
}

export interface Report {
  id: string;
  lat: number;
  lon: number;
  type: ReportType;
  description: string;
  createdAt: string;
  confirmations: number;
  status: ReportStatus;
  /** Desde cuándo está en el estado actual (ISO). */
  statusAt: string;
  resolvedAt?: string;
  /** Distrito municipal del punto, calculado al crear el reclamo. */
  district: string | null;
  /** Respuesta visible para los vecinos, escrita por operaciones. */
  publicNote?: string;
  timeline: ReportTimelineStep[];
}

/** Entrada privada del historial: sólo la ve operaciones. */
export interface ReportHistoryEntry {
  status: ReportStatus;
  at: string;
  by: string;
  note?: string;
}

export interface OpsReport extends Report {
  history: ReportHistoryEntry[];
}

export type ReportCounts = Record<ReportStatus, number>;

export interface ReportPage<T extends Report = Report> {
  from: string;
  to: string;
  counts: ReportCounts;
  truncated: boolean;
  reports: T[];
}

/** Ventana del mapa y de los indicadores: reclamos abiertos cargados en estas horas. */
export const REPORT_TTL_HOURS = 24;
export const DESCRIPTION_MAX_CHARS = 140;
export const PUBLIC_NOTE_MAX_CHARS = 140;
export const PRIVATE_NOTE_MAX_CHARS = 280;
export const MAX_REPORT_RANGE_DAYS = 366;
export const MAX_REPORT_ROWS = 2000;

export interface NearbyReport {
  report: Report;
  meters: number;
}

export function reportsNear(reports: readonly Report[], point: { lat: number; lon: number }, radiusMeters: number): NearbyReport[] {
  return reports
    .map((report) => ({ report, meters: distanceMeters(point, report) }))
    .filter((entry) => entry.meters <= radiusMeters)
    .sort((a, b) => a.meters - b.meters);
}
