import { CLIMATE_CATEGORY_LABEL, formatDistance, type ClimateCategory, type Finding, type TerrainMeta } from "@/lib/lookup";
import type { RiskLevel } from "@/lib/risk";

export type FactKey = "official" | "climateRisk" | "relief" | "history";
export type FactTone = "neutral" | "watch" | "alert" | "critical";

export interface PlaceFact {
  id: FactKey;
  title: string;
  verdict: string;
  tone: FactTone;
  detail: string;
}

const CLIMATE_TONE: Record<ClimateCategory, FactTone> = { "very low": "neutral", "low": "neutral", "medium": "watch", "high": "alert" };
const LEVEL_TONE: Record<RiskLevel, FactTone> = { normal: "watch", watch: "watch", alert: "alert", critical: "critical" };
const TERRAIN_DECIMALS = 1;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function officialMapFact(finding: Finding): PlaceFact {
  if (finding.inside) {
    return {
      id: "official",
      title: "Mapa oficial",
      verdict: `Zona ${finding.zone ?? "—"}`,
      tone: finding.level ? LEVEL_TONE[finding.level] : "watch",
      detail: finding.basis ?? "Dentro del área inundable del Ludueña o el Saladillo.",
    };
  }
  return {
    id: "official",
    title: "Mapa oficial",
    verdict: "Fuera",
    tone: "neutral",
    detail: finding.nearest ? `Zona oficial más cercana: ${finding.nearest.zone}, a ${formatDistance(finding.nearest.meters)}.` : "Lejos de las áreas inundables oficiales.",
  };
}

function reliefFact(terrain: NonNullable<Finding["terrain"]>, meta: TerrainMeta | null): PlaceFact {
  const surroundings = meta ? ` en ${meta.windowMeters} m a la redonda` : "";
  if (terrain.status === "low") {
    const meters = meta && terrain.meters >= meta.maxScaleMeters ? `más de ${meta.maxScaleMeters} m` : `${terrain.meters.toFixed(TERRAIN_DECIMALS)} m`;
    return { id: "relief", title: "Relieve", verdict: `${meters} abajo`, tone: "watch", detail: `Más bajo que la mediana del entorno${surroundings}: ahí el agua tiende a juntarse.` };
  }
  if (terrain.status === "flat") {
    return { id: "relief", title: "Relieve", verdict: "No es un bajo", tone: "neutral", detail: `A la altura de su entorno${surroundings}.` };
  }
  return { id: "relief", title: "Relieve", verdict: "Sin lectura", tone: "neutral", detail: "En manzanas densas el modelo de terreno no aporta una lectura." };
}

export function placeFacts(finding: Finding, meta: TerrainMeta | null): PlaceFact[] {
  const facts: (PlaceFact | null)[] = [
    officialMapFact(finding),
    finding.climateRisk
      ? { id: "climateRisk", title: "Lluvias torrenciales", verdict: capitalize(CLIMATE_CATEGORY_LABEL[finding.climateRisk]), tone: CLIMATE_TONE[finding.climateRisk], detail: "Mapa municipal de riesgo climático 2024." }
      : null,
    finding.terrain ? reliefFact(finding.terrain, meta) : null,
    finding.district
      ? {
          id: "history",
          title: "Historial del distrito",
          verdict: `${finding.district.share} %`,
          tone: "neutral",
          detail: `de las intervenciones por anegamientos registradas 2021–2024${finding.district.peakMonth ? `; su peor mes tuvo ${finding.district.peakMonth.cases} casos` : ""}. No es el riesgo de esta dirección.`,
        }
      : null,
  ];
  return facts.filter((fact): fact is PlaceFact => fact !== null);
}
