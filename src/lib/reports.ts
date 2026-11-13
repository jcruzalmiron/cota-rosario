import { cache } from "react";
import { mkdir, readFile, writeFile, rename, stat, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import districts from "../../public/data/districts.json";
import { featureAt } from "@/lib/lookup";
import { argentinaDay, isCalendarDay } from "@/lib/time";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import {
  DESCRIPTION_MAX_CHARS,
  MAX_REPORT_RANGE_DAYS,
  MAX_REPORT_ROWS,
  PRIVATE_NOTE_MAX_CHARS,
  PUBLIC_NOTE_MAX_CHARS,
  REPORT_TRANSITIONS,
  REPORT_TTL_HOURS,
  REPORT_TYPES,
  isOpenStatus,
  isReportStatus,
  type OpsReport,
  type Report,
  type ReportCounts,
  type ReportHistoryEntry,
  type ReportPage,
  type ReportStatus,
  type ReportTimelineStep,
  type ReportType,
} from "@/lib/reportTypes";

export { REPORT_TTL_HOURS, REPORT_TYPES, type OpsReport, type Report, type ReportPage, type ReportStatus, type ReportType };

export interface NewReportInput {
  lat: unknown;
  lon: unknown;
  type: unknown;
  description?: unknown;
  web?: unknown;
}

export interface ReportFilter {
  from: string;
  to: string;
  statuses: ReportStatus[] | null;
  types: ReportType[] | null;
  districts: string[] | null;
}

export interface StatusChangeInput {
  status: unknown;
  note?: unknown;
  publicNote?: unknown;
}

const BOUNDS = { south: -33.1, north: -32.8, west: -60.85, east: -60.55 };
const MAX_OPEN_REPORTS = 500;
const REPORTS_PER_IP_PER_HOUR = 5;
const CONFIRMATIONS_PER_IP_PER_HOUR = 20;
const MAX_CONFIRMATIONS_PER_REPORT = 100;
const STORE_CACHE_MS = 5_000;
const MILLIS_PER_HOUR = 3_600_000;
const MILLIS_PER_DAY = 86_400_000;
const NEIGHBOUR = "vecino";
const DATA_DIR = process.env.COTA_DATA_DIR ?? "data";
const STORE_FILE = path.join(DATA_DIR, "reports.json");
const LEGACY_STORE_FILE = path.join(DATA_DIR, "reportes.json");
const LEGACY_REPORT_TYPES: Record<string, ReportType> = { calle: "street", vivienda: "home", desague: "drain", corte: "closure" };

const ipActivity = new Map<string, { reports: number[]; confirmations: number[] }>();
interface StoredReport extends Omit<Report, "timeline"> {
  history: ReportHistoryEntry[];
  confirmationsBy: string[];
}
const city = districts as FeatureCollection<Polygon | MultiPolygon, Record<string, string>>;
const DISTRICT_NAMES = city.features.map((feature) => feature.properties.district);
let queue: Promise<unknown> = Promise.resolve();
let storeCache: { at: number; version: string; reports: StoredReport[] } | null = null;

export class ReportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Reclamo abierto y cargado dentro de la ventana del mapa (REPORT_TTL_HOURS). */
export function isOnMapNow(report: Pick<Report, "createdAt" | "status">, now = Date.now()): boolean {
  return isOpenStatus(report.status) && now - new Date(report.createdAt).getTime() < REPORT_TTL_HOURS * MILLIS_PER_HOUR;
}

function districtAt(lat: number, lon: number): string | null {
  return featureAt(city, lat, lon)?.properties.district ?? null;
}

function fromLegacyRow(row: Record<string, unknown>): Record<string, unknown> {
  if (!("tipo" in row)) {
    return row;
  }
  const { tipo, creadoEn, descripcion, confirmaciones, ...rest } = row;
  return { ...rest, type: LEGACY_REPORT_TYPES[String(tipo)] ?? tipo, createdAt: creadoEn, description: descripcion, confirmations: confirmaciones };
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isHistoryEntry(entry: unknown): entry is ReportHistoryEntry {
  if (!entry || typeof entry !== "object") return false;
  const { status, at, by, note } = entry as Record<string, unknown>;
  return isReportStatus(status) && isIsoDate(at) && typeof by === "string" && (note === undefined || typeof note === "string");
}

function isStoredReport(row: Record<string, unknown>): boolean {
  const confirmationsBy = row.confirmationsBy;
  return (
    typeof row.id === "string" &&
    typeof row.type === "string" &&
    Object.hasOwn(REPORT_TYPES, row.type) &&
    Number.isFinite(row.lat) &&
    Number.isFinite(row.lon) &&
    isIsoDate(row.createdAt) &&
    typeof row.description === "string" &&
    Number.isInteger(row.confirmations) &&
    (row.confirmations as number) >= 0 &&
    (confirmationsBy === undefined || (Array.isArray(confirmationsBy) && confirmationsBy.every((key: unknown) => typeof key === "string"))) &&
    (row.status === undefined || isReportStatus(row.status)) &&
    (row.statusAt === undefined || isIsoDate(row.statusAt)) &&
    (row.resolvedAt === undefined || isIsoDate(row.resolvedAt)) &&
    (row.district === undefined || row.district === null || typeof row.district === "string") &&
    (row.publicNote === undefined || typeof row.publicNote === "string") &&
    (row.history === undefined || (Array.isArray(row.history) && row.history.every(isHistoryEntry)))
  );
}

/** Completa los registros anteriores al seguimiento: quedan como nuevos, con su distrito y un historial inicial. */
function withTracking(row: Record<string, unknown>): StoredReport {
  const base = row as unknown as Partial<StoredReport> & Pick<StoredReport, "id" | "lat" | "lon" | "type" | "description" | "createdAt" | "confirmations">;
  const status = base.status ?? "new";
  const statusAt = base.statusAt ?? base.createdAt;
  const history = base.history && base.history.length > 0 ? base.history : [{ status: "new" as const, at: base.createdAt, by: NEIGHBOUR }, ...(status === "new" ? [] : [{ status, at: statusAt, by: "migración" }])];
  return {
    id: base.id,
    lat: base.lat,
    lon: base.lon,
    type: base.type,
    description: base.description,
    createdAt: base.createdAt,
    confirmations: base.confirmations,
    status,
    statusAt,
    ...(base.resolvedAt ? { resolvedAt: base.resolvedAt } : {}),
    district: base.district === undefined ? districtAt(base.lat, base.lon) : base.district,
    ...(base.publicNote ? { publicNote: base.publicNote } : {}),
    history,
    confirmationsBy: base.confirmationsBy ?? [],
  };
}

async function readStoreFile(): Promise<string> {
  try {
    return await readFile(STORE_FILE, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    return readFile(LEGACY_STORE_FILE, "utf8");
  }
}

async function readStore(): Promise<StoredReport[]> {
  try {
    const parsed = JSON.parse(await readStoreFile()) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Invalid store");
    return parsed.map((stored: unknown) => {
      if (!stored || typeof stored !== "object") throw new Error("Invalid report in store");
      const row = fromLegacyRow(stored as Record<string, unknown>);
      if (!isStoredReport(row)) throw new Error("Invalid report in store");
      return withTracking(row);
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    console.error("Could not read the report store:", error instanceof Error ? error.name : "Error");
    throw new ReportError("Los reportes no están disponibles; no se puede afirmar que no haya aportes.", 503);
  }
}

async function writeStore(reports: StoredReport[]): Promise<void> {
  storeCache = null;
  await mkdir(DATA_DIR, { recursive: true });
  const temporary = `${STORE_FILE}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(reports), { flag: "wx", mode: 0o600 });
    await rename(temporary, STORE_FILE);
    await unlink(LEGACY_STORE_FILE).catch(() => undefined);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function storeVersion(): Promise<string> {
  try {
    const { mtimeMs, size } = await stat(STORE_FILE);
    return `${mtimeMs}:${size}`;
  } catch {
    return "missing";
  }
}

/** Lectura para consultas: reutiliza el último contenido mientras el archivo no cambie. Las escrituras siempre releen. */
async function loadStore(): Promise<StoredReport[]> {
  const cached = storeCache;
  const version = await storeVersion();
  if (cached && Date.now() - cached.at < STORE_CACHE_MS && version === cached.version) {
    return cached.reports;
  }
  const reports = await readStore();
  if ((await storeVersion()) === version) storeCache = { at: Date.now(), version, reports };
  return reports;
}

/** Seguimiento público: sólo los cambios de estado, sin operador ni notas internas. */
function timelineOf(history: ReportHistoryEntry[]): ReportTimelineStep[] {
  return history.reduce<ReportTimelineStep[]>((steps, entry) => (steps.at(-1)?.status === entry.status ? steps : [...steps, { status: entry.status, at: entry.at }]), []);
}

/** Vista pública: sin historial privado, sin operador y sin claves de confirmación. Un reclamo descartado no publica su texto. */
function publicReport(report: StoredReport): Report {
  const { id, lat, lon, type, description, createdAt, confirmations, status, statusAt, resolvedAt, district, publicNote, history } = report;
  return {
    id,
    lat,
    lon,
    type,
    description: status === "dismissed" ? "" : description,
    createdAt,
    confirmations,
    status,
    statusAt,
    ...(resolvedAt ? { resolvedAt } : {}),
    district,
    ...(publicNote ? { publicNote } : {}),
    timeline: timelineOf(history),
  };
}

function opsReport(report: StoredReport): OpsReport {
  const { description, history } = report;
  return { ...publicReport(report), description, history: history.map((entry) => ({ ...entry })) };
}

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

function recent(times: number[], now: number): number[] {
  return times.filter((time) => now - time < MILLIS_PER_HOUR);
}

function enforceRate(ip: string, kind: "reports" | "confirmations", limit: number, now: number): void {
  for (const [key, activity] of ipActivity) {
    const cleaned = { reports: recent(activity.reports, now), confirmations: recent(activity.confirmations, now) };
    if (cleaned.reports.length + cleaned.confirmations.length === 0) ipActivity.delete(key);
    else ipActivity.set(key, cleaned);
  }
  if (!ipActivity.has(ip) && ipActivity.size >= 5000) throw new ReportError("La protección de envíos está ocupada; probá más tarde.", 503);
  const activity = ipActivity.get(ip) ?? { reports: [], confirmations: [] };
  const recentHits = recent(activity[kind], now);
  if (recentHits.length >= limit) {
    throw new ReportError("Demasiados envíos desde esta conexión; probá de nuevo en un rato.", 429);
  }
  ipActivity.set(ip, { ...activity, [kind]: [...recentHits, now] });
}

function toCoordinate(value: unknown, min: number, max: number, name: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ReportError(`${name} fuera de Rosario.`);
  }
  return Number(number.toFixed(5));
}

/** Texto libre en una sola línea, sin etiquetas ni caracteres de control. */
export function cleanText(value: unknown, maxChars: number, name: string): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new ReportError(`${name} tiene que ser texto.`);
  }
  const text = value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > maxChars) {
    throw new ReportError(`${name} no puede superar ${maxChars} caracteres.`);
  }
  return text;
}

export function validateReport(input: NewReportInput): Pick<Report, "lat" | "lon" | "type" | "description"> {
  if (typeof input.web === "string" && input.web.length > 0) {
    throw new ReportError("Envío rechazado.");
  }
  if (typeof input.type !== "string" || !Object.hasOwn(REPORT_TYPES, input.type)) {
    throw new ReportError("Elegí qué estás viendo.");
  }
  const lat = toCoordinate(input.lat, BOUNDS.south, BOUNDS.north, "La latitud");
  const lon = toCoordinate(input.lon, BOUNDS.west, BOUNDS.east, "La longitud");
  if (!featureAt(city, lat, lon)) throw new ReportError("El punto está fuera del área de Rosario cubierta por Cota.");
  return {
    lat,
    lon,
    type: input.type as ReportType,
    description: cleanText(input.description, DESCRIPTION_MAX_CHARS, "La descripción"),
  };
}

function newestFirst(a: { createdAt: string }, b: { createdAt: string }): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/** Reclamos abiertos de las últimas REPORT_TTL_HOURS: lo que muestran el mapa y los indicadores. */
export async function listReports(): Promise<Report[]> {
  const now = Date.now();
  return (await loadStore()).filter((report) => isOnMapNow(report, now)).sort(newestFirst).map(publicReport);
}

function listParam<T extends string>(value: string | null, isValid: (item: string) => item is T, message: string): T[] | null {
  if (value === null) return null;
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (items.length === 0 || !items.every(isValid)) throw new ReportError(message);
  return [...new Set(items)] as T[];
}

/**
 * Lee from, to, status, type y (sólo operaciones) district. Sin fechas vale el día argentino de hoy;
 * con una sola fecha, ese único día.
 */
export function parseReportFilter(params: URLSearchParams, options: { allowDistrict?: boolean; now?: number } = {}): ReportFilter {
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const today = argentinaDay(options.now);
  const from = fromParam ?? toParam ?? today;
  const to = toParam ?? fromParam ?? today;
  if (!isCalendarDay(from) || !isCalendarDay(to)) throw new ReportError("Las fechas tienen que tener el formato AAAA-MM-DD.");
  if (from > to) throw new ReportError("La fecha inicial no puede ser posterior a la final.");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MILLIS_PER_DAY + 1;
  if (days > MAX_REPORT_RANGE_DAYS) throw new ReportError(`El rango no puede superar ${MAX_REPORT_RANGE_DAYS} días.`);
  const statuses = listParam(params.get("status"), isReportStatus, "Estado inválido. Usá new, in_progress, resolved o dismissed.");
  const types = listParam(params.get("type"), (item): item is ReportType => Object.hasOwn(REPORT_TYPES, item), "Tipo de reclamo inválido.");
  const districtParam = options.allowDistrict ? params.get("district") : null;
  const districtFilter = listParam(districtParam === null ? null : districtParam.toUpperCase(), (item): item is string => DISTRICT_NAMES.includes(item), "Distrito inválido.");
  return { from, to, statuses, types, districts: districtFilter };
}

async function selectReports(filter: ReportFilter): Promise<{ rows: StoredReport[]; counts: ReportCounts; truncated: boolean }> {
  const inRange = (await loadStore()).filter((report) => {
    const day = argentinaDay(Date.parse(report.createdAt));
    return (
      day >= filter.from &&
      day <= filter.to &&
      (!filter.types || filter.types.includes(report.type)) &&
      (!filter.districts || (report.district !== null && filter.districts.includes(report.district)))
    );
  });
  const counts: ReportCounts = { new: 0, in_progress: 0, resolved: 0, dismissed: 0 };
  for (const report of inRange) counts[report.status] += 1;
  const matching = inRange.filter((report) => !filter.statuses || filter.statuses.includes(report.status)).sort(newestFirst);
  return { rows: matching.slice(0, MAX_REPORT_ROWS), counts, truncated: matching.length > MAX_REPORT_ROWS };
}

/** Reclamos por día argentino de carga, más nuevos primero. `counts` cuenta por estado antes de aplicar el filtro de estado. */
export async function queryReports(filter: ReportFilter): Promise<ReportPage> {
  const { rows, counts, truncated } = await selectReports(filter);
  return { from: filter.from, to: filter.to, counts, truncated, reports: rows.map(publicReport) };
}

export async function queryOpsReports(filter: ReportFilter): Promise<ReportPage<OpsReport>> {
  const { rows, counts, truncated } = await selectReports(filter);
  return { from: filter.from, to: filter.to, counts, truncated, reports: rows.map(opsReport) };
}

export async function getReport(id: string): Promise<Report> {
  const report = (await loadStore()).find((candidate) => candidate.id === id);
  if (!report) throw new ReportError("No encontramos ese reclamo.", 404);
  return publicReport(report);
}

export function createReport(input: NewReportInput, ip: string): Promise<Report> {
  return serialized(async () => {
    const now = Date.now();
    const data = validateReport(input);
    const reports = await readStore();
    if (reports.filter((report) => isOpenStatus(report.status)).length >= MAX_OPEN_REPORTS) {
      throw new ReportError("Hay demasiados reportes activos ahora mismo.", 503);
    }
    enforceRate(ip, "reports", REPORTS_PER_IP_PER_HOUR, now);
    const createdAt = new Date(now).toISOString();
    const report: StoredReport = {
      id: randomUUID(),
      ...data,
      createdAt,
      confirmations: 0,
      status: "new",
      statusAt: createdAt,
      district: districtAt(data.lat, data.lon),
      history: [{ status: "new", at: createdAt, by: NEIGHBOUR }],
      confirmationsBy: [],
    };
    await writeStore([...reports, report]);
    return publicReport(report);
  });
}

export function confirmReport(id: string, ip: string): Promise<Report> {
  return serialized(async () => {
    const now = Date.now();
    const reports = await readStore();
    const target = reports.find((report) => report.id === id);
    if (!target) {
      throw new ReportError("No encontramos ese reporte.", 404);
    }
    if (!isOpenStatus(target.status)) {
      throw new ReportError(target.status === "resolved" ? "Ese reclamo ya está resuelto; no se puede confirmar." : "Ese reclamo fue descartado; no se puede confirmar.", 409);
    }
    const observer = createHash("sha256").update(`${id}:${ip}`).digest("hex");
    if (target.confirmationsBy.includes(observer) || target.confirmationsBy.length >= MAX_CONFIRMATIONS_PER_REPORT) return publicReport(target);
    enforceRate(ip, "confirmations", CONFIRMATIONS_PER_IP_PER_HOUR, now);
    const updated = { ...target, confirmations: target.confirmations + 1, confirmationsBy: [...target.confirmationsBy, observer] };
    await writeStore(reports.map((report) => (report.id === id ? updated : report)));
    return publicReport(updated);
  });
}

/**
 * Cambio de estado hecho por un operador. Con el mismo estado sólo actualiza las notas.
 * `publicNote` ausente conserva la anterior; vacía, la borra.
 */
export function updateReportStatus(id: string, input: StatusChangeInput, by: string): Promise<OpsReport> {
  return serialized(async () => {
    if (!isReportStatus(input.status)) throw new ReportError("Estado inválido. Usá new, in_progress, resolved o dismissed.");
    const status = input.status;
    const note = cleanText(input.note, PRIVATE_NOTE_MAX_CHARS, "La nota interna");
    const publicNote = input.publicNote === undefined ? undefined : cleanText(input.publicNote, PUBLIC_NOTE_MAX_CHARS, "La nota pública");
    const reports = await readStore();
    const target = reports.find((report) => report.id === id);
    if (!target) throw new ReportError("No encontramos ese reclamo.", 404);
    const sameStatus = target.status === status;
    if (sameStatus && !note && (publicNote === undefined || publicNote === (target.publicNote ?? ""))) {
      throw new ReportError("El reclamo ya está en ese estado y no hay notas para guardar.", 409);
    }
    if (!sameStatus && !REPORT_TRANSITIONS[target.status].includes(status)) {
      throw new ReportError("Ese cambio de estado no está permitido.", 409);
    }
    const at = new Date().toISOString();
    const { resolvedAt: previousResolvedAt, publicNote: previousNote, ...rest } = target;
    const nextNote = publicNote === undefined ? previousNote : publicNote;
    const resolvedAt = status !== "resolved" ? undefined : sameStatus ? (previousResolvedAt ?? at) : at;
    const updated: StoredReport = {
      ...rest,
      status,
      statusAt: sameStatus ? target.statusAt : at,
      ...(resolvedAt ? { resolvedAt } : {}),
      ...(nextNote ? { publicNote: nextNote } : {}),
      history: [...target.history, { status, at, by, ...(note ? { note } : {}) }],
    };
    await writeStore(reports.map((report) => (report.id === id ? updated : report)));
    return opsReport(updated);
  });
}

export const listReportsForRequest = cache(listReports);
