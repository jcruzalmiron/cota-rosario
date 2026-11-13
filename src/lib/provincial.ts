import { FRESHNESS, readLiveSource } from "@/lib/liveSources";
import { fetchWithRetry } from "@/lib/rain";

/*
 * Alertas del SMN y arroyos urbanos, tomados del sitio «El Niño» del Gobierno de Santa Fe.
 *
 * Decisión de fuente (probado el 13/11/2026, sin credenciales):
 * - https://ws.smn.gob.ar/alerts/type/AL y /AC responden 503 («No server is available»).
 * - https://ws1.smn.gob.ar/v1/warning/alert/... responde 401: pide un JWT que solo entrega la web del SMN.
 * - https://www.smn.gob.ar/alertas responde 403 con el desafío de Cloudflare.
 * - El zip de datos abiertos (ssl.smn.gob.ar/dpd/zipopendata.php?dato=alertas) llega con un archivo vacío.
 * Ningún servicio directo del SMN es usable, así que las alertas se leen del JSON provincial,
 * que las republica por departamento. Se citan como «Servicio Meteorológico Nacional, vía Gobierno de Santa Fe».
 * El JSON provincial no está documentado: por eso cada campo se valida y cualquier forma inesperada
 * se trata como falla de la fuente, nunca como «sin alertas» ni como «arroyo normal».
 */
const BASE = "https://www.santafe.gob.ar/ms/elnino/wp-json/elnino/v1";
export const ALERTS_URL = `${BASE}/alertas`;
export const STREAMS_URL = `${BASE}/parana`;
export const ALERTS_ATTRIBUTION = "Servicio Meteorológico Nacional, vía Gobierno de Santa Fe";

const HOUR_MS = 3_600_000;
const ARGENTINA_OFFSET_MS = 3 * HOUR_MS;
/** Si la provincia dejó de actualizar el listado, «sin alertas» ya no es confiable. */
const ALERTS_FEED_MAX_AGE_MS = 6 * HOUR_MS;
const STREAM_STALE_MS = 36 * HOUR_MS;
const FUTURE_TOLERANCE_MS = 15 * 60_000;
/*
 * Recursos Hídricos fecha la lectura diaria a las 12:00 aunque la publique antes (visto el 13/11/2026 a las 11:37).
 * Se acepta esa fecha nominal del día; una fecha más adelantada se descarta por inválida.
 */
const READING_FUTURE_TOLERANCE_MS = 24 * HOUR_MS;
const DEPARTMENT = "rosario";
const STREAM_NAMES = ["luduena", "saladillo"];
/** Cuencas del Ludueña y del Saladillo del sur santafesino; descarta homónimos del norte (Saladillo Dulce y Amargo). */
const STREAM_BOUNDS = { south: -33.7, north: -32.6, west: -61.9, east: -60.4 };

export type AlertLevel = "amarilla" | "naranja" | "roja";
const SEVERITY: Record<AlertLevel, number> = { roja: 3, naranja: 2, amarilla: 1 };

export interface WeatherAlert {
  level: AlertLevel;
  event: string;
  description: string;
  /** ISO con desplazamiento de Argentina (-03:00). */
  from: string;
  until: string;
  issuedAt: string | null;
  /** Aviso a corto plazo del SMN: fenómeno en curso o inminente, de pocas horas. */
  shortTerm: boolean;
  /** `true` si ya rige; `false` si empieza más tarde. */
  current: boolean;
  instructions: string[];
  /** Departamentos alcanzados, como los informa la fuente. */
  areas: string[];
}

export interface AlertsSnapshot {
  /** Alertas vigentes o próximas que alcanzan al departamento Rosario. Vacío significa «la fuente respondió y no hay». */
  items: WeatherAlert[];
  /** Alertas vigentes o próximas en otros departamentos de Santa Fe. */
  provinceCount: number;
  /** Última actualización del SMN informada por la provincia. */
  smnUpdatedAt: string | null;
  /** Última actualización del listado provincial. */
  updatedAt: string;
  attribution: string;
  fetchedAt: string;
}

export type StreamTrend = "rising" | "falling" | "steady";
export type StreamSource = "Recursos Hídricos Santa Fe" | "INA";

export interface StreamReading {
  id: string;
  stream: string;
  place: string;
  heightM: number;
  /** Hora de la lectura, ISO con desplazamiento de Argentina (-03:00). */
  at: string;
  trend: StreamTrend | null;
  /** Nivel de alerta, solo si la fuente lo informa para esa estación. */
  alertM: number | null;
  series: { at: string; m: number }[];
  source: StreamSource;
  /** La lectura tiene más de 36 horas. */
  stale: boolean;
}

export interface StreamsSnapshot {
  items: StreamReading[];
  updatedAt: string | null;
  fetchedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function instant(value: unknown): number | null {
  // Solo fechas con zona explícita («Z» o ±hh:mm): sin zona dependerían del reloj del servidor.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Argentina no tiene horario de verano: la hora local es siempre UTC-3. */
function argentinaIso(ms: number): string {
  return `${new Date(ms - ARGENTINA_OFFSET_MS).toISOString().slice(0, 19)}-03:00`;
}

function sourceIso(value: unknown): string | null {
  const ms = instant(value);
  return ms === null ? null : argentinaIso(ms);
}

function requireOk(data: unknown, label: string): Record<string, unknown> {
  if (!isRecord(data)) throw new Error(`${label}: la respuesta no tiene el formato esperado.`);
  if (data.estado !== "ok") throw new Error(`${label}: la fuente informó estado «${text(data.estado) || "desconocido"}».`);
  return data;
}

interface ParsedAlert extends Omit<WeatherAlert, "current"> {
  fromMs: number;
  untilMs: number;
  rosario: boolean;
}

function parseAlert(raw: unknown, index: number): ParsedAlert {
  const fail = (what: string): never => {
    throw new Error(`Alertas del SMN: la alerta ${index + 1} llegó sin ${what}; no se puede saber si alcanza a Rosario.`);
  };
  if (!isRecord(raw)) return fail("formato válido");
  const level = normalize(text(raw.nivel));
  if (level !== "amarilla" && level !== "naranja" && level !== "roja") return fail("un nivel reconocido");
  const event = text(raw.evento) || fail("el fenómeno");
  const fromMs = instant(raw.desde) ?? fail("fecha de inicio válida");
  const untilMs = instant(raw.hasta) ?? fail("fecha de fin válida");
  if (untilMs < fromMs) return fail("un período coherente");
  if (!Array.isArray(raw.departamentos) || raw.departamentos.some((item) => typeof item !== "string")) return fail("departamentos");
  const areas = strings(raw.departamentos);
  const localities = strings(raw.localidades);
  if (areas.length === 0 && localities.length === 0) return fail("zona");
  return {
    level,
    event,
    description: text(raw.descripcion),
    from: argentinaIso(fromMs),
    until: argentinaIso(untilMs),
    issuedAt: sourceIso(raw.emitida),
    shortTerm: raw.corto_plazo === true,
    instructions: strings(raw.instrucciones),
    areas,
    fromMs,
    untilMs,
    rosario: [...areas, ...localities].some((area) => normalize(area) === DEPARTMENT),
  };
}

/**
 * Convierte la respuesta provincial en las alertas de Rosario. Lanza si la respuesta está mal formada
 * o desactualizada: quien llama debe informar la falla, no mostrar «sin alertas».
 */
export function alertsFromResponse(data: unknown, now = Date.now(), fetchedAt = new Date(now).toISOString()): AlertsSnapshot {
  const body = requireOk(data, "Alertas del SMN");
  if (!Array.isArray(body.alertas)) throw new Error("Alertas del SMN: la respuesta no trae el listado de alertas.");
  const updatedMs = instant(body.actualizado);
  if (updatedMs === null) throw new Error("Alertas del SMN: la respuesta no informa cuándo se actualizó.");
  if (updatedMs > now + FUTURE_TOLERANCE_MS || now - updatedMs > ALERTS_FEED_MAX_AGE_MS) {
    throw new Error(`Alertas del SMN: el listado provincial está fuera de vigencia. Última actualización informada: ${argentinaIso(updatedMs)}.`);
  }
  const active = body.alertas.map(parseAlert).filter((alert) => alert.untilMs >= now);
  const items = active
    .filter((alert) => alert.rosario)
    .sort((a, b) => Number(b.fromMs <= now) - Number(a.fromMs <= now) || SEVERITY[b.level] - SEVERITY[a.level] || a.fromMs - b.fromMs || a.untilMs - b.untilMs)
    .map((alert): WeatherAlert => ({ level: alert.level, event: alert.event, description: alert.description, from: alert.from, until: alert.until, issuedAt: alert.issuedAt, shortTerm: alert.shortTerm, current: alert.fromMs <= now, instructions: alert.instructions, areas: alert.areas }));
  return {
    items,
    provinceCount: active.length - items.length,
    smnUpdatedAt: sourceIso(body.smn_actualizado),
    updatedAt: argentinaIso(updatedMs),
    attribution: ALERTS_ATTRIBUTION,
    fetchedAt,
  };
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const TRENDS: Record<string, StreamTrend> = { crece: "rising", sube: "rising", baja: "falling", estable: "steady" };
const STREAM_SOURCES: Record<string, StreamSource> = { rh: "Recursos Hídricos Santa Fe", ina: "INA" };

/** `niveles` llega como objeto, como arreglo vacío o no llega. Solo se toma un nivel de alerta numérico y positivo. */
function alertLevel(niveles: unknown): number | null {
  if (!isRecord(niveles)) return null;
  const value = finite(niveles.alerta);
  return value !== null && value > 0 ? value : null;
}

function parseSeries(raw: unknown): { at: string; m: number }[] {
  if (!Array.isArray(raw)) return [];
  const points: { ms: number; m: number }[] = [];
  for (const pair of raw) {
    if (!Array.isArray(pair)) continue;
    const ms = instant(pair[0]);
    const m = finite(pair[1]);
    if (ms !== null && m !== null) points.push({ ms, m });
  }
  return points.sort((a, b) => a.ms - b.ms).map(({ ms, m }) => ({ at: argentinaIso(ms), m }));
}

/** Lee una estación del bloque `otros`. Devuelve `null` si le falta la altura, la hora o el origen: no se completa con supuestos. */
export function streamFromStation(raw: unknown, now = Date.now()): StreamReading | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "number" || typeof raw.id === "string" ? String(raw.id) : "";
  const stream = text(raw.rio);
  const heightM = finite(raw.altura);
  const atMs = instant(raw.fecha);
  const source = STREAM_SOURCES[normalize(text(raw.fuente))];
  if (!id || !stream || heightM === null || atMs === null || atMs > now + READING_FUTURE_TOLERANCE_MS || !source) return null;
  return {
    id,
    stream,
    place: text(raw.lugar),
    heightM,
    at: argentinaIso(atMs),
    trend: TRENDS[normalize(text(raw.tendencia))] ?? null,
    alertM: alertLevel(raw.niveles),
    series: parseSeries(raw.serie),
    source,
    stale: now - atMs > STREAM_STALE_MS,
  };
}

function isRosarioStream(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  const name = normalize(text(raw.rio));
  if (!STREAM_NAMES.some((stream) => name.includes(stream))) return false;
  const lat = finite(raw.lat);
  const lng = finite(raw.lng);
  if (lat === null || lng === null) return true;
  return lat >= STREAM_BOUNDS.south && lat <= STREAM_BOUNDS.north && lng >= STREAM_BOUNDS.west && lng <= STREAM_BOUNDS.east;
}

/**
 * Selecciona las estaciones de los arroyos Ludueña y Saladillo por nombre del curso de agua.
 * Lanza si no queda ninguna lectura válida: es «sin dato», nunca «normal».
 */
export function streamsFromResponse(data: unknown, now = Date.now(), fetchedAt = new Date(now).toISOString()): StreamsSnapshot {
  const body = requireOk(data, "Arroyos Ludueña y Saladillo");
  if (!Array.isArray(body.otros)) throw new Error("Arroyos Ludueña y Saladillo: la respuesta no trae el listado de estaciones.");
  const candidates = body.otros.filter(isRosarioStream);
  if (candidates.length === 0) throw new Error("Arroyos Ludueña y Saladillo: la fuente no devolvió estaciones de esos arroyos.");
  const items = candidates.map((station) => streamFromStation(station, now)).filter((reading): reading is StreamReading => reading !== null);
  if (items.length === 0) throw new Error("Arroyos Ludueña y Saladillo: ninguna estación llegó con altura y hora válidas.");
  return { items, updatedAt: sourceIso(body.actualizado), fetchedAt };
}

interface Fetched {
  data: unknown;
  fetchedAt: string;
}

async function fetchJson(url: string, label: string): Promise<unknown> {
  const response = await fetchWithRetry(url, label);
  try {
    return await response.json();
  } catch {
    throw new Error(`${label}: la respuesta no es un JSON válido.`);
  }
}

/*
 * Se guarda la respuesta ya validada y se vuelve a evaluar contra la hora actual en cada lectura:
 * así una alerta vencida o una lectura vieja no sobreviven dentro de la caché.
 */
export async function fetchAlerts(): Promise<AlertsSnapshot> {
  const cached = await readLiveSource<Fetched>("provincial:alerts", FRESHNESS.alerts, async () => {
    const data = await fetchJson(ALERTS_URL, "Alertas del SMN (Gobierno de Santa Fe)");
    alertsFromResponse(data);
    return { data, fetchedAt: new Date().toISOString() };
  });
  return alertsFromResponse(cached.data, Date.now(), cached.fetchedAt);
}

export async function fetchStreams(): Promise<StreamsSnapshot> {
  const cached = await readLiveSource<Fetched>("provincial:streams", FRESHNESS.streams, async () => {
    const data = await fetchJson(STREAMS_URL, "Arroyos (Gobierno de Santa Fe)");
    streamsFromResponse(data);
    return { data, fetchedAt: new Date().toISOString() };
  });
  return streamsFromResponse(cached.data, Date.now(), cached.fetchedAt);
}
