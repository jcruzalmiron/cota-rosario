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
const ZONE_RAIN_SENSITIVITY: Record<string, number> = { A: 1, B: 1, C: 0.9, D: 0.9, "1": 0.8, "2": 0.8, "3": 0.8 };

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

export interface RiskAssessment {
  level: RiskLevel | null;
  reason: string;
  factors: RiskFactor[];
  zones: { zone: string; level: RiskLevel | null }[];
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

function rainFactor(rain: RainSnapshot | null): RiskFactor {
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

export function assessRisk(river: RiverSnapshot | null, rain: RainSnapshot | null): RiskAssessment {
  const factors = [riverFactor(river), rainFactor(rain)];
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

  const rainPeak = rain?.peakWindow?.millimeters ?? 0;
  const zones = Object.entries(ZONE_RAIN_SENSITIVITY).map(([zone, weight]) => {
    const knownZone = worst([...(factors[1].available ? [rainLevel(rainPeak * weight)] : []), ...(factors[0].level ? [factors[0].level] : [])]);
    return { zone, level: noData || (incomplete && knownZone === "normal") ? null : knownZone };
  });

  return { level, reason, factors, zones, incomplete, noData, assessedAt: new Date().toISOString() };
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

export function simulate({ meters, alert, evacuation, rainPeakMm }: SimulationInput): SimulationResult {
  const river = riverLevel(meters, alert, evacuation);
  const rain = rainLevel(rainPeakMm);
  const zones = Object.entries(ZONE_RAIN_SENSITIVITY).map(([zone, weight]) => ({
    zone,
    level: worst([rainLevel(rainPeakMm * weight), river]),
  }));
  return { level: worst([river, rain]), river, rain, zones };
}

export const RAIN_THRESHOLDS = { watch: RAIN_WATCH_MM, alert: RAIN_ALERT_MM, critical: RAIN_CRITICAL_MM };

export function riskLabel(level: RiskLevel | null | undefined): string {
  return level ? RISK_LABEL[level] : "Evaluación incompleta";
}
