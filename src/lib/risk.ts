import type { RainSnapshot } from "@/lib/rain";
import type { RiverSnapshot, RiverStation } from "@/lib/river";

export type RiskLevel = "normal" | "watch" | "alert" | "critical";

export const RISK_ORDER: RiskLevel[] = ["normal", "watch", "alert", "critical"];

export const RISK_LABEL: Record<RiskLevel, string> = {
  normal: "Sin señales elevadas",
  watch: "Atención",
  alert: "Alerta",
  critical: "Crítico",
};

const WATCH_MARGIN_METERS = 0.5;
const RAIN_WATCH_MM = 15;
const RAIN_ALERT_MM = 25;
const RAIN_CRITICAL_MM = 30;
/** Códigos de las zonas oficiales de áreas inundables (cuencas del Ludueña y el Saladillo). */
export const OFFICIAL_ZONES = ["A", "B", "C", "D", "1", "2", "3"] as const;
/** Igual a FRESHNESS.hourlyRain.staleMs: pasado ese plazo el pronóstico no se usa como señal. */
export const RAIN_MAX_AGE_MS = 60 * 60 * 1000;

export interface RiskFactor {
  id: "river" | "rain";
  level: RiskLevel | null;
  title: string;
  detail: string;
  measured: string;
  threshold: string;
  official: boolean;
  available: boolean;
}

/**
 * Estado de la señal usada para una zona. "sin_senales_elevadas" es una lectura
 * válida bajo umbral; "ausente" y "vencida" significan que no hay lectura.
 */
export type SignalStatus = "elevada" | "sin_senales_elevadas" | "ausente" | "vencida";

export interface ZoneSignal {
  source: "lluvia_pronostico_regional";
  scope: "regional";
  status: SignalStatus;
  level: RiskLevel | null;
  at: string | null;
}

/**
 * Lectura por zona oficial. La exposición es fija (polígono oficial); el color
 * (`level`) sólo surge de una señal con ámbito aplicable. La altura del Paraná
 * es el indicador de su estación y no colorea las cuencas de los arroyos.
 */
export interface ZoneAssessment {
  zone: string;
  level: RiskLevel | null;
  exposure: "area_inundable_oficial";
  signal: ZoneSignal;
  basis: string;
}

export interface RiskAssessment {
  level: RiskLevel | null;
  reason: string;
  factors: RiskFactor[];
  zones: ZoneAssessment[];
  incomplete: boolean;
  noData: boolean;
  assessedAt: string;
}

export function hasUsableThresholds(station: Pick<RiverStation, "alert" | "evacuation">): boolean {
  return station.alert !== null && Number.isFinite(station.alert) && station.alert > 0;
}

function worst(levels: RiskLevel[]): RiskLevel {
  return levels.reduce((accumulated, level) => (RISK_ORDER.indexOf(level) > RISK_ORDER.indexOf(accumulated) ? level : accumulated), "normal");
}

function rainLevel(mm: number): RiskLevel {
  return mm >= RAIN_CRITICAL_MM ? "critical" : mm >= RAIN_ALERT_MM ? "alert" : mm >= RAIN_WATCH_MM ? "watch" : "normal";
}

function riverLevel(meters: number, alert: number, evacuation: number | null): RiskLevel {
  if (evacuation !== null && evacuation > 0 && meters >= evacuation) {
    return "critical";
  }
  if (meters >= alert) {
    return "alert";
  }
  if (meters >= alert - WATCH_MARGIN_METERS) {
    return "watch";
  }
  return "normal";
}

function riverFactor(river: RiverSnapshot | null): RiskFactor {
  if (!river || !Number.isFinite(river.station.meters)) {
    return {
      id: "river",
      level: null,
      title: "Altura del Paraná",
      detail: "El INA no respondió. La altura del río no entra en esta evaluación.",
      measured: "sin dato",
      threshold: "—",
      official: true,
      available: false,
    };
  }

  const { station, marginToAlert } = river;
  const measured = `${station.meters.toFixed(2)} m · ${station.trend || "sin tendencia"}`;

  if (!hasUsableThresholds(station)) {
    return {
      id: "river",
      level: null,
      title: "Altura del Paraná",
      detail: "El INA no publica niveles de alerta válidos para esta estación, así que la altura no suma al riesgo.",
      measured,
      threshold: "sin umbral publicado",
      official: true,
      available: false,
    };
  }

  const alert = station.alert as number;
  const level = riverLevel(station.meters, alert, station.evacuation);
  const detail =
    level === "normal"
      ? `Faltan ${marginToAlert?.toFixed(2)} m para el nivel de alerta del INA.`
      : level === "watch"
        ? `Está a menos de ${WATCH_MARGIN_METERS.toFixed(2)} m del nivel de alerta.`
        : level === "alert"
          ? "Superó el nivel de alerta declarado por el INA."
          : "Superó el nivel de evacuación declarado por el INA.";

  return {
    id: "river",
    level,
    title: "Altura del Paraná",
    detail,
    measured,
    threshold: `alerta ${alert.toFixed(2)} m · evacuación ${station.evacuation?.toFixed(2) ?? "—"} m`,
    official: true,
    available: true,
  };
}

function rainIsStale(rain: RainSnapshot, now: Date | undefined): boolean {
  if (!now) return false;
  const fetched = Date.parse(rain.fetchedAt);
  return !Number.isFinite(fetched) || now.getTime() - fetched > RAIN_MAX_AGE_MS;
}

function rainFactor(rain: RainSnapshot | null, now?: Date): RiskFactor {
  if (rain && rainIsStale(rain, now)) {
    return {
      id: "rain",
      level: null,
      title: "Lluvia concentrada",
      detail: "El último pronóstico de Open-Meteo está vencido. La lluvia no entra en esta evaluación.",
      measured: "dato vencido",
      threshold: "—",
      official: false,
      available: false,
    };
  }
  if (!rain) {
    return {
      id: "rain",
      level: null,
      title: "Lluvia concentrada",
      detail: "Open-Meteo no respondió. La lluvia no entra en esta evaluación.",
      measured: "sin dato",
      threshold: "—",
      official: false,
      available: false,
    };
  }

  if (!rain.peakWindow || !Number.isFinite(rain.peakWindow.millimeters) || rain.peakWindow.millimeters < 0 || !Number.isFinite(rain.accumulated24h) || rain.accumulated24h < 0) return rainFactor(null);
  const peak = rain.peakWindow.millimeters;
  const level = rainLevel(peak);
  const detail =
    level === "normal"
      ? "La lluvia prevista está por debajo de los umbrales orientativos."
      : `Se pronostican ${peak.toFixed(1)} mm en dos horas: supera el umbral orientativo del panel.`;

  return {
    id: "rain",
    level,
    title: "Lluvia concentrada",
    detail,
    measured: `${peak.toFixed(1)} mm en 2 h · ${rain.accumulated24h.toFixed(1)} mm en 24 h`,
    threshold: `atención ${RAIN_WATCH_MM} mm · alerta ${RAIN_ALERT_MM} mm · crítico ${RAIN_CRITICAL_MM} mm`,
    official: false,
    available: true,
  };
}

/**
 * `now` habilita el control de vigencia del pronóstico (se pasa en producción).
 * Sin `now`, no se evalúa vencimiento (pruebas con datos fijos).
 */
export function assessRisk(river: RiverSnapshot | null, rain: RainSnapshot | null, options: { now?: Date } = {}): RiskAssessment {
  const factors = [riverFactor(river), rainFactor(rain, options.now)];
  const available = factors.filter((factor) => factor.available);
  const noData = available.length === 0;
  const incomplete = available.length < factors.length;
  const known = worst(available.map((factor) => factor.level!));
  const level = noData || (incomplete && known === "normal") ? null : known;
  const dominant = available.find((factor) => factor.level === known);
  const falls = factors.filter((factor) => !factor.available).map((factor) => factor.title.toLowerCase());

  const baseReason =
    known === "normal" && !incomplete
      ? "El río y la lluvia están por debajo de los umbrales de referencia. Consultá también las condiciones de tu zona."
      : `${dominant?.title}: ${dominant?.detail}`;

  const reason = noData
    ? "Ninguna fuente respondió. No se puede evaluar el riesgo ahora mismo."
    : incomplete
      ? `Evaluación parcial, sin ${falls.join(" ni ")}. ${baseReason}`
      : baseReason;

  const zones = zoneAssessments(factors[1], rain, options.now);

  return { level, reason, factors, zones, incomplete, noData, assessedAt: (options.now ?? new Date()).toISOString() };
}

function zoneSignal(rainFactorResult: RiskFactor, rain: RainSnapshot | null, now: Date | undefined): ZoneSignal {
  const base = { source: "lluvia_pronostico_regional" as const, scope: "regional" as const, at: rain?.fetchedAt ?? null };
  if (!rainFactorResult.available) {
    return { ...base, status: rain && rainIsStale(rain, now) ? "vencida" : "ausente", level: null };
  }
  const level = rainFactorResult.level!;
  return { ...base, status: level === "normal" ? "sin_senales_elevadas" : "elevada", level };
}

const SIGNAL_BASIS: Record<SignalStatus, string> = {
  elevada: "Área inundable oficial. Color según el pronóstico regional de lluvia concentrada (no es una medición en la zona).",
  sin_senales_elevadas: "Área inundable oficial. El pronóstico regional de lluvia está por debajo de los umbrales orientativos.",
  ausente: "Área inundable oficial. Sin señal actual: el pronóstico de lluvia no respondió. La exposición se mantiene.",
  vencida: "Área inundable oficial. Sin señal actual: el pronóstico de lluvia está vencido. La exposición se mantiene.",
};

/**
 * Una sola señal con ámbito aplicable hoy: el pronóstico regional de lluvia, igual
 * para todas las zonas (sin ponderadores por código no respaldados). Cuando haya
 * estaciones por cuenca, se suman como señal con su propia cobertura.
 */
function zoneAssessments(rainFactorResult: RiskFactor, rain: RainSnapshot | null, now: Date | undefined): ZoneAssessment[] {
  const signal = zoneSignal(rainFactorResult, rain, now);
  return OFFICIAL_ZONES.map((zone) => ({
    zone,
    level: signal.level,
    exposure: "area_inundable_oficial",
    signal,
    basis: SIGNAL_BASIS[signal.status],
  }));
}

/** Vista mínima de zona que consumen mapa y Mi zona (la del escenario no trae `basis`). */
export interface ZoneView {
  zone: string;
  level: RiskLevel | null;
  basis?: string;
}

export const SCENARIO_BASIS = "Escenario simulado: no es una lectura actual.";

export function zoneReading(zones: ZoneView[], zone: string, simulated = false): { level: RiskLevel | null; basis: string | undefined } {
  const entry = zones.find((candidate) => candidate.zone === zone.trim());
  return { level: entry?.level ?? null, basis: simulated ? SCENARIO_BASIS : entry?.basis };
}

export interface SimulationInput {
  meters: number;
  alert: number;
  evacuation: number | null;
  rainPeakMm: number;
}

export interface SimulationResult {
  level: RiskLevel;
  river: RiskLevel;
  rain: RiskLevel;
  zones: { zone: string; level: RiskLevel }[];
}

/** Escenario: misma regla que la evaluación real. El río no colorea las zonas de los arroyos. */
export function simulate({ meters, alert, evacuation, rainPeakMm }: SimulationInput): SimulationResult {
  const river = riverLevel(meters, alert, evacuation);
  const rain = rainLevel(rainPeakMm);
  const zones = OFFICIAL_ZONES.map((zone) => ({ zone, level: rain }));
  return { level: worst([river, rain]), river, rain, zones };
}

export const RAIN_THRESHOLDS = { watch: RAIN_WATCH_MM, alert: RAIN_ALERT_MM, critical: RAIN_CRITICAL_MM };

export function riskLabel(level: RiskLevel | null | undefined): string {
  return level ? RISK_LABEL[level] : "Evaluación incompleta";
}
