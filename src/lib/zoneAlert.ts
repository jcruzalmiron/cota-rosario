import sensitivityData from "../../public/data/zone-sensitivity.json";
import type { RiskLevel } from "@/lib/risk";

/**
 * Grado de alerta por zona oficial (0–5), con criterios versionados y explícitos.
 * Cada punto queda registrado con su fuente y su tipo de dato para que el mapa
 * pueda explicar por qué pinta cada zona. Los criterios son provisorios: no
 * están calibrados con eventos medidos (ver docs/criterios-alerta-zonas.md).
 */
export type AlertGrade = 0 | 1 | 2 | 3 | 4 | 5;

export const ALERT_CRITERIA_VERSION = "v0-provisorio";
export const MAX_GRADE: AlertGrade = 5;

export const GRADE_LABEL: Record<AlertGrade, string> = {
  0: "Sin señales elevadas",
  1: "Leve",
  2: "Atención",
  3: "Alerta",
  4: "Alerta alta",
  5: "Crítico",
};

export const GRADES: AlertGrade[] = [0, 1, 2, 3, 4, 5];

/** Lluvia concentrada prevista (mm en 2 h). 15/25/30 son los umbrales orientativos ya usados por el panel. */
export const RAIN_GRADE_STEPS = { leve: 7.5, watch: 15, alert: 25, critical: 30 } as const;

export type ContributionSource = "lluvia" | "sensibilidad" | "rio" | "reportes";
export type ContributionKind = "pronostico" | "mapa_oficial" | "supuesto" | "observacion_vecinal";

export interface ZoneContribution {
  source: ContributionSource;
  kind: ContributionKind;
  points: number;
  text: string;
}

export interface ZoneReports {
  count: number;
  /** Reportes de "agua en viviendas". */
  homes: number;
  confirmations: number;
}

export interface ZoneSensitivity {
  mediumOrHighShare: number;
  coverage: "suficiente" | "insuficiente";
  moreSensitive: boolean;
}

export interface ZoneGradeInput {
  /** Pico previsto en 2 h; null si el pronóstico falta o venció. */
  rainPeakMm: number | null;
  /** Nivel del Paraná según los umbrales del INA; null si no hay lectura válida. */
  riverLevel: RiskLevel | null;
  sensitivity: ZoneSensitivity | null;
  reports: ZoneReports | null;
}

export interface ZoneGrade {
  grade: AlertGrade | null;
  contributions: ZoneContribution[];
}

const SENSITIVITY = sensitivityData as { reference: { mediumOrHighShare: number }; zones: Record<string, ZoneSensitivity> };

export function zoneSensitivity(zone: string): ZoneSensitivity | null {
  return SENSITIVITY.zones[zone] ?? null;
}

export function sensitivityReference(): number {
  return SENSITIVITY.reference.mediumOrHighShare;
}

export function rainGrade(mm: number): AlertGrade {
  if (mm >= RAIN_GRADE_STEPS.critical) return 5;
  if (mm >= RAIN_GRADE_STEPS.alert) return 3;
  if (mm >= RAIN_GRADE_STEPS.watch) return 2;
  if (mm >= RAIN_GRADE_STEPS.leve) return 1;
  return 0;
}

/** Reportes fuertes: uno de agua en viviendas o tres de cualquier tipo en la zona, en las últimas 24 h. */
export const STRONG_REPORTS = { homes: 1, any: 3 } as const;

function clamp(value: number): AlertGrade {
  return Math.max(0, Math.min(MAX_GRADE, value)) as AlertGrade;
}

const percent = (value: number) => `${Math.round(value * 100)} %`;

/**
 * Reglas (v0):
 * 1. Base: lluvia concentrada prevista (regional, igual para todas las zonas).
 * 2. +1 si la zona es más sensible según el mapa municipal de riesgo climático y la base es al menos "Leve".
 * 3. +1 si el Paraná está en alerta o evacuación (INA) y la base es al menos "Atención". El río solo nunca pinta.
 * 4. Reportes vecinales activos dentro de la zona: con alguno, mínimo "Leve"; con reportes fuertes, +1 y mínimo "Atención".
 * Sin pronóstico y sin reportes, la zona queda sin grado (gris).
 */
export function gradeZone({ rainPeakMm, riverLevel, sensitivity, reports }: ZoneGradeInput): ZoneGrade {
  const contributions: ZoneContribution[] = [];
  let grade: number | null = null;

  if (rainPeakMm !== null) {
    const base = rainGrade(rainPeakMm);
    grade = base;
    contributions.push({
      source: "lluvia",
      kind: "pronostico",
      points: base,
      text: `Lluvia prevista: ${rainPeakMm.toFixed(1)} mm en 2 h para toda la ciudad (${GRADE_LABEL[base].toLowerCase()}).`,
    });

    if (base >= 1 && sensitivity?.moreSensitive) {
      grade += 1;
      contributions.push({
        source: "sensibilidad",
        kind: "mapa_oficial",
        points: 1,
        text: `Zona más sensible: ${percent(sensitivity.mediumOrHighShare)} de su superficie con riesgo medio o alto en el mapa municipal de riesgo climático (promedio de las zonas: ${percent(sensitivityReference())}).`,
      });
    }

    if (base >= 2 && (riverLevel === "alert" || riverLevel === "critical")) {
      grade += 1;
      contributions.push({
        source: "rio",
        kind: "supuesto",
        points: 1,
        text: "Paraná sobre el nivel de alerta del INA mientras llueve: se supone que los arroyos desaguan peor. Supuesto a validar con datos de la cuenca.",
      });
    }
  }

  if (reports && reports.count > 0) {
    const strong = reports.homes >= STRONG_REPORTS.homes || reports.count >= STRONG_REPORTS.any;
    const before = grade ?? 0;
    const after = strong ? Math.max(before + 1, 2) : Math.max(before, 1);
    grade = after;
    const detail = `${reports.count} ${reports.count === 1 ? "reporte vecinal activo" : "reportes vecinales activos"} en la zona${reports.homes ? `, ${reports.homes} con agua en viviendas` : ""}${reports.confirmations ? ` · ${reports.confirmations} ${reports.confirmations === 1 ? "confirmación" : "confirmaciones"}` : ""}. ${reports.count === 1 ? "No verificado" : "No verificados"}.`;
    contributions.push({ source: "reportes", kind: "observacion_vecinal", points: after - before, text: detail });
  }

  return { grade: grade === null ? null : clamp(grade), contributions };
}

export function gradeLevel(grade: AlertGrade | null): RiskLevel | null {
  if (grade === null) return null;
  if (grade === 0) return "normal";
  if (grade <= 2) return "watch";
  if (grade <= 4) return "alert";
  return "critical";
}

export function gradeBasis(grade: ZoneGrade, rainStatus: "elevada" | "sin_senales_elevadas" | "ausente" | "vencida"): string {
  if (grade.grade === null) {
    const why = rainStatus === "vencida" ? "el pronóstico de lluvia está vencido" : "el pronóstico de lluvia no respondió";
    return `Área inundable oficial. Sin señal actual: ${why} y no hay reportes activos en la zona. La exposición se mantiene.`;
  }
  const base = rainStatus === "ausente" || rainStatus === "vencida" ? "sin pronóstico vigente; sólo reportes vecinales" : "base: pronóstico regional de lluvia";
  return `Área inundable oficial. ${GRADE_LABEL[grade.grade]} (${grade.grade}/${MAX_GRADE}), ${base}. Criterios ${ALERT_CRITERIA_VERSION}.`;
}

/** Grado previsto para la ventana de dos horas que empieza en `hour`. */
export interface TimelineStep {
  hour: string;
  grade: AlertGrade;
}

/** Acumulados de dos horas consecutivas, redondeados igual que el pico del pronóstico. */
export function rainWindows(hours: readonly { hour: string; millimeters: number }[]): { hour: string; millimeters: number }[] {
  return hours.slice(0, -1).map((entry, index) => ({ hour: entry.hour, millimeters: Number((entry.millimeters + hours[index + 1].millimeters).toFixed(1)) }));
}

/**
 * Cómo evoluciona el grado de una zona con la lluvia prevista hora por hora.
 * El río y los reportes se toman como están ahora: no hay pronóstico de ellos.
 */
export function zoneTimeline(windows: readonly { hour: string; millimeters: number }[], input: Omit<ZoneGradeInput, "rainPeakMm">): TimelineStep[] {
  return windows.map((window) => ({ hour: window.hour, grade: gradeZone({ ...input, rainPeakMm: window.millimeters }).grade ?? 0 }));
}

export interface TimelinePeak {
  grade: AlertGrade;
  /** Inicio del primer tramo en el grado máximo. */
  from: string;
  /** Primera hora posterior en la que baja; null si sigue hasta el final de la serie. */
  until: string | null;
  /** Si toda la serie tiene el mismo grado. */
  flat: boolean;
}

export function timelinePeak(steps: readonly TimelineStep[]): TimelinePeak | null {
  if (!steps.length) return null;
  const grade = steps.reduce<AlertGrade>((max, step) => (step.grade > max ? step.grade : max), 0);
  const start = steps.findIndex((step) => step.grade === grade);
  const end = steps.findIndex((step, index) => index > start && step.grade < grade);
  return { grade, from: steps[start].hour, until: end === -1 ? null : steps[end].hour, flat: steps.every((step) => step.grade === grade) };
}
