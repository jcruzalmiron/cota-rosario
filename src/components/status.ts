import type { RiskLevel } from "@/lib/risk";
import type { AlertGrade } from "@/lib/zoneAlert";

export const RISK_FILL: Record<RiskLevel, string> = {
  normal: "#46a06b",
  watch: "#cf9a2f",
  alert: "#d4713a",
  critical: "#d4483f",
};

export function riskColor(level: RiskLevel | null | undefined): string {
  return level ? RISK_FILL[level] : "#98a2b3";
}

/** Escala de seis pasos para las zonas: verde, verde oliva, ámbar, naranja, rojo anaranjado, rojo. */
export const GRADE_FILL: Record<AlertGrade, string> = {
  0: "#46a06b",
  1: "#93a83f",
  2: "#cf9a2f",
  3: "#d4713a",
  4: "#d4573a",
  5: "#b8322c",
};

/** Color por grado cuando existe; si no, el del nivel (escenarios viejos o vistas sin grado). */
export function zoneColor(grade: AlertGrade | null | undefined, level: RiskLevel | null | undefined): string {
  return grade !== null && grade !== undefined ? GRADE_FILL[grade] : riskColor(level);
}

export const RISK_TEXT: Record<RiskLevel, string> = {
  normal: "text-normal",
  watch: "text-watch",
  alert: "text-alert",
  critical: "text-critical",
};

export const RISK_BORDER: Record<RiskLevel, string> = {
  normal: "border-normal",
  watch: "border-watch",
  alert: "border-alert",
  critical: "border-critical",
};
