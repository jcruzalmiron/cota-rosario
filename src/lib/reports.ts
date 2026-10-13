import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import districts from "../../public/data/distritos.json";
import { featureAt } from "@/lib/lookup";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import { DESCRIPTION_MAX_CHARS, REPORT_TTL_HOURS, REPORT_TYPES, type Report, type ReportType } from "@/lib/reportTypes";

export { REPORT_TTL_HOURS, REPORT_TYPES, type Report, type ReportType };

export interface NewReportInput {
  lat: unknown;
  lon: unknown;
  tipo: unknown;
  descripcion?: unknown;
  web?: unknown;
}

const BOUNDS = { south: -33.1, north: -32.8, west: -60.85, east: -60.55 };
const MAX_ACTIVE_REPORTS = 500;
const REPORTS_PER_IP_PER_HOUR = 5;
const CONFIRMATIONS_PER_IP_PER_HOUR = 20;
const MILLIS_PER_HOUR = 3_600_000;
const DATA_DIR = process.env.COTA_DATA_DIR ?? "data";
const STORE_FILE = path.join(DATA_DIR, "reportes.json");

const ipActivity = new Map<string, { reportes: number[]; confirmaciones: number[] }>();
interface StoredReport extends Report { confirmationsBy: string[] }
const city = districts as FeatureCollection<Polygon | MultiPolygon, Record<string, string>>;
let queue: Promise<unknown> = Promise.resolve();

export class ReportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function isActive(report: Report, now: number): boolean {
  return now - new Date(report.creadoEn).getTime() < REPORT_TTL_HOURS * MILLIS_PER_HOUR;
}

async function readStore(): Promise<StoredReport[]> {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Invalid store");
    return parsed.map((row) => {
      if (!row || typeof row !== "object" || typeof row.id !== "string" || !Object.hasOwn(REPORT_TYPES, row.tipo) || !Number.isFinite(row.lat) || !Number.isFinite(row.lon) || !Number.isFinite(Date.parse(row.creadoEn)) || typeof row.descripcion !== "string" || !Number.isInteger(row.confirmaciones) || row.confirmaciones < 0 || (row.confirmationsBy !== undefined && (!Array.isArray(row.confirmationsBy) || !row.confirmationsBy.every((key: unknown) => typeof key === "string")))) throw new Error("Invalid report in store");
      return { ...row, confirmationsBy: row.confirmationsBy ?? [] } as StoredReport;
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    console.error("No se pudo leer el almacenamiento de reportes:", error instanceof Error ? error.name : "Error");
    throw new ReportError("Los reportes no están disponibles; no se puede afirmar que no haya aportes.", 503);
  }
}

async function writeStore(reports: StoredReport[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const temporary = `${STORE_FILE}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(reports), { flag: "wx", mode: 0o600 });
    await rename(temporary, STORE_FILE);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function publicReport(report: StoredReport): Report {
  const { id, lat, lon, tipo, descripcion, creadoEn, confirmaciones } = report;
  return { id, lat, lon, tipo, descripcion, creadoEn, confirmaciones };
}

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

function recent(times: number[], now: number): number[] {
  return times.filter((time) => now - time < MILLIS_PER_HOUR);
}

function enforceRate(ip: string, kind: "reportes" | "confirmaciones", limit: number, now: number): void {
  for (const [key, activity] of ipActivity) {
    const cleaned = { reportes: recent(activity.reportes, now), confirmaciones: recent(activity.confirmaciones, now) };
    if (cleaned.reportes.length + cleaned.confirmaciones.length === 0) ipActivity.delete(key);
    else ipActivity.set(key, cleaned);
  }
  if (!ipActivity.has(ip) && ipActivity.size >= 5000) throw new ReportError("La protección de envíos está ocupada; probá más tarde.", 503);
  const activity = ipActivity.get(ip) ?? { reportes: [], confirmaciones: [] };
  const window = recent(activity[kind], now);
  if (window.length >= limit) {
    throw new ReportError("Demasiados envíos desde esta conexión; probá de nuevo en un rato.", 429);
  }
  ipActivity.set(ip, { ...activity, [kind]: [...window, now] });
}

function toCoordinate(value: unknown, min: number, max: number, nombre: string): number {
  const numero = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numero) || numero < min || numero > max) {
    throw new ReportError(`${nombre} fuera de Rosario.`);
  }
  return Number(numero.toFixed(5));
}

function cleanDescription(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new ReportError("La descripción tiene que ser texto.");
  }
  const texto = value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (texto.length > DESCRIPTION_MAX_CHARS) {
    throw new ReportError(`La descripción no puede superar ${DESCRIPTION_MAX_CHARS} caracteres.`);
  }
  return texto;
}

export function validateReport(input: NewReportInput): Pick<Report, "lat" | "lon" | "tipo" | "descripcion"> {
  if (typeof input.web === "string" && input.web.length > 0) {
    throw new ReportError("Envío rechazado.");
  }
  if (typeof input.tipo !== "string" || !Object.hasOwn(REPORT_TYPES, input.tipo)) {
    throw new ReportError("Elegí qué estás viendo.");
  }
  const lat = toCoordinate(input.lat, BOUNDS.south, BOUNDS.north, "La latitud");
  const lon = toCoordinate(input.lon, BOUNDS.west, BOUNDS.east, "La longitud");
  if (!featureAt(city, lat, lon)) throw new ReportError("El punto está fuera del área de Rosario cubierta por esta demo.");
  return {
    lat,
    lon,
    tipo: input.tipo as ReportType,
    descripcion: cleanDescription(input.descripcion),
  };
}

export async function listReports(): Promise<Report[]> {
  return serialized(async () => {
    const reports = await readStore();
    const active = reports.filter((report) => isActive(report, Date.now()));
    if (active.length !== reports.length) await writeStore(active);
    return active.map(publicReport).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  });
}

export function createReport(input: NewReportInput, ip: string): Promise<Report> {
  return serialized(async () => {
    const now = Date.now();
    const datos = validateReport(input);
    enforceRate(ip, "reportes", REPORTS_PER_IP_PER_HOUR, now);
    const activos = (await readStore()).filter((report) => isActive(report, now));
    if (activos.length >= MAX_ACTIVE_REPORTS) {
      throw new ReportError("Hay demasiados reportes activos ahora mismo.", 503);
    }
    const report: StoredReport = { id: randomUUID(), ...datos, creadoEn: new Date(now).toISOString(), confirmaciones: 0, confirmationsBy: [] };
    await writeStore([...activos, report]);
    return publicReport(report);
  });
}

export function confirmReport(id: string, ip: string): Promise<Report> {
  return serialized(async () => {
    const now = Date.now();
    const activos = (await readStore()).filter((report) => isActive(report, now));
    const target = activos.find((report) => report.id === id);
    if (!target) {
      throw new ReportError("Ese reporte ya no está activo.", 404);
    }
    const observer = createHash("sha256").update(`${id}:${ip}`).digest("hex");
    if (target.confirmationsBy.includes(observer)) return publicReport(target);
    enforceRate(ip, "confirmaciones", CONFIRMATIONS_PER_IP_PER_HOUR, now);
    const updated = { ...target, confirmaciones: target.confirmaciones + 1, confirmationsBy: [...target.confirmationsBy, observer] };
    await writeStore(activos.map((report) => (report.id === id ? updated : report)));
    return publicReport(updated);
  });
}
