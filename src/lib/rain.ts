import { PARANA_GLOFAS_CELL, ROSARIO } from "@/lib/sources";
import { addCalendarDays, argentinaDay, sourceTime } from "@/lib/time";
import { nonNegative, probability } from "@/lib/dataChecks";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const TIMEZONE = "America/Argentina/Buenos_Aires";
const HOUR_MS = 3_600_000;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(url: string, etiqueta: string): Promise<Response> {
  const attempt = () => fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const first = await attempt().catch(() => null);
  if (first && !RETRY_STATUSES.has(first.status)) {
    if (!first.ok) throw new Error(`${etiqueta} respondió ${first.status}`);
    return first;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const second = await attempt();
  if (!second.ok) throw new Error(`${etiqueta} respondió ${second.status} después del reintento`);
  return second;
}

export interface RainHour { hora: string; milimetros: number; probabilidad: number | null }
export interface RainSnapshot {
  horas: RainHour[];
  acumulado24h: number;
  picoVentana: { milimetros: number; desde: string; hasta: string } | null;
  consultadoEn: string;
}
export interface DischargeDay { fecha: string; caudal: number }
export interface DischargeSnapshot {
  celda: { lat: number; lon: number };
  dias: DischargeDay[];
  pasado: DischargeDay[];
  actual: number | null;
  consultadoEn: string;
}
export interface RainOutlookDay { fecha: string; milimetros: number; probabilidad: number | null; max2h: number }
export interface RainOutlook {
  ventanaDias: number;
  dias: RainOutlookDay[];
  total: number;
  max2h: number;
  maximoDia: RainOutlookDay;
  consultadoEn: string;
}
export interface ForecastResponse {
  utc_offset_seconds: number;
  hourly: { time: string[]; precipitation: (number | null)[]; precipitation_probability?: (number | null)[] };
  daily?: { time: string[]; precipitation_sum: (number | null)[]; precipitation_probability_max?: (number | null)[] };
}
interface FloodResponse { latitude: number; longitude: number; daily: { time: string[]; river_discharge: (number | null)[] } }

function peakWindow(horas: RainHour[]): RainSnapshot["picoVentana"] {
  let best: RainSnapshot["picoVentana"] = null;
  for (let i = 0; i + 1 < horas.length; i++) {
    if (Date.parse(horas[i + 1].hora) - Date.parse(horas[i].hora) !== HOUR_MS) throw new Error("El pronóstico tiene horas faltantes.");
    const mm = horas[i].milimetros + horas[i + 1].milimetros;
    if (!Number.isFinite(mm)) throw new Error("El pico de lluvia está fuera del rango numérico.");
    if (!best || mm > best.milimetros) best = { milimetros: Number(mm.toFixed(1)), desde: horas[i].hora, hasta: horas[i + 1].hora };
  }
  return best;
}

function hours(data: ForecastResponse): { hora: string; index: number }[] {
  if (!Array.isArray(data.hourly?.time) || !Array.isArray(data.hourly.precipitation)) throw new Error("La fuente no devolvió una serie horaria válida.");
  return data.hourly.time.map((hora, index) => ({ hora: sourceTime(hora, data.utc_offset_seconds), index }));
}

export function rainFromResponse(data: ForecastResponse, now = Date.now()): RainSnapshot {
  const wanted = hours(data).filter(({ hora }) => Date.parse(hora) >= now - HOUR_MS).slice(0, 48);
  if (wanted.length !== 48 || Date.parse(wanted[0].hora) > now + HOUR_MS) throw new Error("El pronóstico no cubre las próximas 48 horas desde ahora.");
  const horas = wanted.map(({ hora, index }) => ({ hora, milimetros: nonNegative(data.hourly.precipitation[index], "Lluvia horaria"), probabilidad: probability(data.hourly.precipitation_probability?.[index]) }));
  return { horas, acumulado24h: sum(horas.slice(0, 24).map((hora) => hora.milimetros)), picoVentana: peakWindow(horas), consultadoEn: new Date(now).toISOString() };
}

export async function fetchRain(): Promise<RainSnapshot> {
  const params = forecastParams({ hourly: "precipitation,precipitation_probability", forecast_days: "3" });
  return rainFromResponse(await (await fetchWithRetry(`${FORECAST_URL}?${params}`, "Open-Meteo")).json());
}

export async function fetchDischarge(pastDays = 0): Promise<DischargeSnapshot> {
  const params = new URLSearchParams({ latitude: String(PARANA_GLOFAS_CELL.lat), longitude: String(PARANA_GLOFAS_CELL.lon), daily: "river_discharge", forecast_days: "7", past_days: String(Math.max(1, pastDays)) });
  const data = (await (await fetchWithRetry(`${FLOOD_URL}?${params}`, "GloFAS")).json()) as FloodResponse;
  if (!Array.isArray(data.daily?.time) || !Array.isArray(data.daily.river_discharge)) throw new Error("GloFAS no devolvió una serie diaria válida.");
  const hoy = argentinaDay();
  const pairs = data.daily.time.map((fecha, index) => ({ fecha, value: data.daily.river_discharge[index] }));
  const wanted = pairs.filter((dia) => dia.fecha >= hoy).slice(0, 7);
  if (wanted.length !== 7 || wanted.some((dia, i) => dia.fecha !== addCalendarDays(hoy, i))) throw new Error("El caudal no cubre los próximos siete días.");
  const dias = wanted.map(({ fecha, value }) => ({ fecha, caudal: nonNegative(value, "Caudal pronosticado") }));
  const pasado = pairs.filter((dia) => dia.fecha < hoy && typeof dia.value === "number" && Number.isFinite(dia.value) && dia.value >= 0).map(({ fecha, value }) => ({ fecha, caudal: value as number }));
  return { celda: { lat: data.latitude, lon: data.longitude }, dias, pasado, actual: dias[0].caudal, consultadoEn: new Date().toISOString() };
}

export function outlookFromResponse(data: ForecastResponse, now = Date.now()): RainOutlook {
  const hoy = argentinaDay(now);
  if (!Array.isArray(data.daily?.time) || !Array.isArray(data.daily.precipitation_sum)) throw new Error("La fuente no devolvió días de pronóstico.");
  const daily = data.daily;
  const wanted = daily.time.map((fecha, index) => ({ fecha, index })).filter((dia) => dia.fecha >= hoy).slice(0, 7);
  if (wanted.length !== 7 || wanted.some((dia, i) => dia.fecha !== addCalendarDays(hoy, i))) throw new Error("El pronóstico no cubre los próximos siete días desde hoy.");
  const hourly = hours(data).filter(({ hora }) => hora.slice(0, 10) >= hoy && hora.slice(0, 10) <= wanted[6].fecha).map(({ hora, index }) => ({ hora, milimetros: nonNegative(data.hourly.precipitation[index], "Lluvia horaria de la semana"), probabilidad: null }));
  if (hourly.length !== 7 * 24) throw new Error("La semana tiene horas de lluvia faltantes.");
  const max2hPorDia = new Map<string, number>();
  for (let i = 0; i + 1 < hourly.length; i++) {
    if (Date.parse(hourly[i + 1].hora) - Date.parse(hourly[i].hora) !== HOUR_MS) throw new Error("La semana tiene horas discontinuas.");
    const day = hourly[i].hora.slice(0, 10);
    const mm = hourly[i].milimetros + hourly[i + 1].milimetros;
    if (!Number.isFinite(mm)) throw new Error("El pico semanal está fuera del rango numérico.");
    max2hPorDia.set(day, Math.max(max2hPorDia.get(day) ?? 0, mm));
  }
  const dias = wanted.map(({ fecha, index }) => ({ fecha, milimetros: Number(nonNegative(daily.precipitation_sum[index], "Lluvia diaria").toFixed(1)), probabilidad: probability(daily.precipitation_probability_max?.[index]), max2h: Number((max2hPorDia.get(fecha) ?? 0).toFixed(1)) }));
  return { ventanaDias: 7, dias, total: sum(dias.map((dia) => dia.milimetros)), max2h: Number(Math.max(...dias.map((dia) => dia.max2h)).toFixed(1)), maximoDia: dias.reduce((best, dia) => dia.milimetros > best.milimetros ? dia : best), consultadoEn: new Date(now).toISOString() };
}

export async function fetchRainOutlook(): Promise<RainOutlook> {
  const params = forecastParams({ hourly: "precipitation", daily: "precipitation_sum,precipitation_probability_max", forecast_days: "7" });
  return outlookFromResponse(await (await fetchWithRetry(`${FORECAST_URL}?${params}`, "Open-Meteo")).json());
}

function forecastParams(extra: Record<string, string>): URLSearchParams {
  return new URLSearchParams({ latitude: String(ROSARIO.lat), longitude: String(ROSARIO.lon), timezone: TIMEZONE, ...extra });
}
function sum(values: number[]): number {
  const total = values.reduce((acc, value) => acc + value, 0);
  if (!Number.isFinite(total)) throw new Error("La suma de lluvia está fuera del rango numérico.");
  return Number(total.toFixed(1));
}

export interface RainBalance {
  ahoraLocal: string;
  caido24h: number;
  caido72h: number;
  prevista24h: number;
  prevista48h: number;
  probabilidadMax24h: number | null;
  porDia: { fecha: string; caidoMm: number; previstoMm: number }[];
  consultadoEn: string;
}
export interface MonthRain { mes: string; acumuladoMm: number; diasConDato: number; hasta: string | null; completo: boolean; consultadoEn: string }

export async function fetchRainBalance(): Promise<RainBalance> {
  const params = forecastParams({ hourly: "precipitation,precipitation_probability", past_days: "3", forecast_days: "3" });
  const data = (await (await fetchWithRetry(`${FORECAST_URL}?${params}`, "Open-Meteo")).json()) as ForecastResponse;
  const now = Date.now();
  const boundary = Math.floor(now / HOUR_MS) * HOUR_MS;
  const all = hours(data);
  const past = all.filter(({ hora }) => Date.parse(hora) < boundary).slice(-72);
  const future = all.filter(({ hora }) => Date.parse(hora) >= boundary).slice(0, 48);
  if (past.length !== 72 || future.length !== 48) throw new Error("La serie no cubre 72 horas pasadas y 48 futuras.");
  const rows = [...past, ...future].map(({ hora, index }) => ({ hora, mm: nonNegative(data.hourly.precipitation[index], "Lluvia del balance"), prob: probability(data.hourly.precipitation_probability?.[index]) }));
  peakWindow(rows.map((row) => ({ hora: row.hora, milimetros: row.mm, probabilidad: row.prob })));
  const pasadas = rows.slice(0, 72);
  const futuras = rows.slice(72);
  const probs = futuras.slice(0, 24).map((hora) => hora.prob);
  const dias = [...new Set(rows.map((hora) => hora.hora.slice(0, 10)))];
  return { ahoraLocal: futuras[0].hora.slice(0, 13), caido24h: sum(pasadas.slice(-24).map((hora) => hora.mm)), caido72h: sum(pasadas.map((hora) => hora.mm)), prevista24h: sum(futuras.slice(0, 24).map((hora) => hora.mm)), prevista48h: sum(futuras.map((hora) => hora.mm)), probabilidadMax24h: probs.every((p) => p !== null) ? Math.max(...probs as number[]) : null, porDia: dias.map((fecha) => ({ fecha, caidoMm: sum(pasadas.filter((hora) => hora.hora.startsWith(fecha)).map((hora) => hora.mm)), previstoMm: sum(futuras.filter((hora) => hora.hora.startsWith(fecha)).map((hora) => hora.mm)) })), consultadoEn: new Date(now).toISOString() };
}

export async function fetchMonthToDateRain(): Promise<MonthRain> {
  const hoy = argentinaDay();
  const params = forecastParams({ start_date: `${hoy.slice(0, 7)}-01`, end_date: hoy, daily: "precipitation_sum" });
  const data = await (await fetchWithRetry(`${ARCHIVE_URL}?${params}`, "Archivo de Open-Meteo")).json() as { daily: { time: string[]; precipitation_sum: (number | null)[] } };
  if (!Array.isArray(data.daily?.time) || !Array.isArray(data.daily.precipitation_sum)) throw new Error("El archivo no devolvió días del mes.");
  const rows = data.daily.time.map((fecha, i) => ({ fecha, mm: data.daily.precipitation_sum[i] })).filter((row) => row.fecha.slice(0, 7) === hoy.slice(0, 7) && row.fecha <= hoy && typeof row.mm === "number" && Number.isFinite(row.mm) && row.mm >= 0);
  if (rows.length === 0) throw new Error("No hay lluvia del mes disponible en el archivo.");
  return { mes: hoy.slice(0, 7), acumuladoMm: sum(rows.map((row) => row.mm as number)), diasConDato: rows.length, hasta: rows.at(-1)?.fecha ?? null, completo: rows.length === Number(hoy.slice(-2)), consultadoEn: new Date().toISOString() };
}
