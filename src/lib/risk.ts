import type { RainSnapshot } from "@/lib/rain";
import type { RiverSnapshot, RiverStation } from "@/lib/river";

export type RiskLevel = "normal" | "atencion" | "alerta" | "critico";

export const RISK_ORDER: RiskLevel[] = ["normal", "atencion", "alerta", "critico"];

export const RISK_LABEL: Record<RiskLevel, string> = {
  normal: "Sin señales elevadas",
  atencion: "Atención",
  alerta: "Alerta",
  critico: "Crítico",
};

const ATENCION_MARGIN_METERS = 0.5;
const RAIN_ATENCION_MM = 15;
const RAIN_ALERTA_MM = 25;
const RAIN_CRITICO_MM = 30;
const ZONE_RAIN_SENSITIVITY: Record<string, number> = { A: 1, B: 1, C: 0.9, D: 0.9, "1": 0.8, "2": 0.8, "3": 0.8 };

export interface RiskFactor {
  clave: "rio" | "lluvia";
  nivel: RiskLevel | null;
  titulo: string;
  detalle: string;
  medida: string;
  umbral: string;
  oficial: boolean;
  disponible: boolean;
}

export interface RiskAssessment {
  nivel: RiskLevel | null;
  motivo: string;
  factores: RiskFactor[];
  zonas: { zona: string; nivel: RiskLevel | null }[];
  incompleto: boolean;
  sinDatos: boolean;
  evaluadoEn: string;
}

export function hasUsableThresholds(station: Pick<RiverStation, "alerta" | "evacuacion">): boolean {
  return station.alerta !== null && Number.isFinite(station.alerta) && station.alerta > 0;
}

function worst(levels: RiskLevel[]): RiskLevel {
  return levels.reduce((accumulated, level) => (RISK_ORDER.indexOf(level) > RISK_ORDER.indexOf(accumulated) ? level : accumulated), "normal");
}

function rainLevel(mm: number): RiskLevel {
  return mm >= RAIN_CRITICO_MM ? "critico" : mm >= RAIN_ALERTA_MM ? "alerta" : mm >= RAIN_ATENCION_MM ? "atencion" : "normal";
}

function riverLevel(metros: number, alerta: number, evacuacion: number | null): RiskLevel {
  if (evacuacion !== null && evacuacion > 0 && metros >= evacuacion) {
    return "critico";
  }
  if (metros >= alerta) {
    return "alerta";
  }
  if (metros >= alerta - ATENCION_MARGIN_METERS) {
    return "atencion";
  }
  return "normal";
}

function riverFactor(river: RiverSnapshot | null): RiskFactor {
  if (!river || !Number.isFinite(river.estacion.metros)) {
    return {
      clave: "rio",
      nivel: null,
      titulo: "Altura del Paraná",
      detalle: "El INA no respondió. La altura del río no entra en esta evaluación.",
      medida: "sin dato",
      umbral: "—",
      oficial: true,
      disponible: false,
    };
  }

  const { estacion, margenHastaAlerta } = river;
  const medida = `${estacion.metros.toFixed(2)} m · ${estacion.tendencia || "sin tendencia"}`;

  if (!hasUsableThresholds(estacion)) {
    return {
      clave: "rio",
      nivel: null,
      titulo: "Altura del Paraná",
      detalle: "El INA no publica niveles de alerta válidos para esta estación, así que la altura no suma al riesgo.",
      medida,
      umbral: "sin umbral publicado",
      oficial: true,
      disponible: false,
    };
  }

  const alerta = estacion.alerta as number;
  const nivel = riverLevel(estacion.metros, alerta, estacion.evacuacion);
  const detalle =
    nivel === "normal"
      ? `Faltan ${margenHastaAlerta?.toFixed(2)} m para el nivel de alerta del INA.`
      : nivel === "atencion"
        ? `Está a menos de ${ATENCION_MARGIN_METERS.toFixed(2)} m del nivel de alerta.`
        : nivel === "alerta"
          ? "Superó el nivel de alerta declarado por el INA."
          : "Superó el nivel de evacuación declarado por el INA.";

  return {
    clave: "rio",
    nivel,
    titulo: "Altura del Paraná",
    detalle,
    medida,
    umbral: `alerta ${alerta.toFixed(2)} m · evacuación ${estacion.evacuacion?.toFixed(2) ?? "—"} m`,
    oficial: true,
    disponible: true,
  };
}

function rainFactor(rain: RainSnapshot | null): RiskFactor {
  if (!rain) {
    return {
      clave: "lluvia",
      nivel: null,
      titulo: "Lluvia concentrada",
      detalle: "Open-Meteo no respondió. La lluvia no entra en esta evaluación.",
      medida: "sin dato",
      umbral: "—",
      oficial: false,
      disponible: false,
    };
  }

  if (!rain.picoVentana || !Number.isFinite(rain.picoVentana.milimetros) || rain.picoVentana.milimetros < 0 || !Number.isFinite(rain.acumulado24h) || rain.acumulado24h < 0) return rainFactor(null);
  const pico = rain.picoVentana.milimetros;
  const nivel = rainLevel(pico);
  const detalle =
    nivel === "normal"
      ? "La lluvia prevista está por debajo de los umbrales orientativos."
      : `Se pronostican ${pico.toFixed(1)} mm en dos horas: supera el umbral orientativo del panel.`;

  return {
    clave: "lluvia",
    nivel,
    titulo: "Lluvia concentrada",
    detalle,
    medida: `${pico.toFixed(1)} mm en 2 h · ${rain.acumulado24h.toFixed(1)} mm en 24 h`,
    umbral: `atención ${RAIN_ATENCION_MM} mm · alerta ${RAIN_ALERTA_MM} mm · crítico ${RAIN_CRITICO_MM} mm`,
    oficial: false,
    disponible: true,
  };
}

export function assessRisk(river: RiverSnapshot | null, rain: RainSnapshot | null): RiskAssessment {
  const factores = [riverFactor(river), rainFactor(rain)];
  const disponibles = factores.filter((factor) => factor.disponible);
  const sinDatos = disponibles.length === 0;
  const incompleto = disponibles.length < factores.length;
  const conocido = worst(disponibles.map((factor) => factor.nivel!));
  const nivel = sinDatos || (incompleto && conocido === "normal") ? null : conocido;
  const dominante = disponibles.find((factor) => factor.nivel === conocido);
  const caidas = factores.filter((factor) => !factor.disponible).map((factor) => factor.titulo.toLowerCase());

  const motivoBase =
    conocido === "normal"
      ? "El río y la lluvia están por debajo de los umbrales de referencia. Consultá también las condiciones de tu zona."
      : `${dominante?.titulo}: ${dominante?.detalle}`;

  const motivo = sinDatos
    ? "Ninguna fuente respondió. No se puede evaluar el riesgo ahora mismo."
    : incompleto
      ? `Evaluación parcial, sin ${caidas.join(" ni ")}. ${motivoBase}`
      : motivoBase;

  const picoLluvia = rain?.picoVentana?.milimetros ?? 0;
  const zonas = Object.entries(ZONE_RAIN_SENSITIVITY).map(([zona, peso]) => {
    const conocidoZona = worst([...(factores[1].disponible ? [rainLevel(picoLluvia * peso)] : []), ...(factores[0].nivel ? [factores[0].nivel] : [])]);
    return { zona, nivel: sinDatos || (incompleto && conocidoZona === "normal") ? null : conocidoZona };
  });

  return { nivel, motivo, factores, zonas, incompleto, sinDatos, evaluadoEn: new Date().toISOString() };
}

export interface SimulationInput {
  metros: number;
  alerta: number;
  evacuacion: number | null;
  picoLluviaMm: number;
}

export interface SimulationResult {
  nivel: RiskLevel;
  rio: RiskLevel;
  lluvia: RiskLevel;
  zonas: { zona: string; nivel: RiskLevel }[];
}

export function simulate({ metros, alerta, evacuacion, picoLluviaMm }: SimulationInput): SimulationResult {
  const rio = riverLevel(metros, alerta, evacuacion);
  const lluvia = rainLevel(picoLluviaMm);
  const zonas = Object.entries(ZONE_RAIN_SENSITIVITY).map(([zona, peso]) => ({
    zona,
    nivel: worst([rainLevel(picoLluviaMm * peso), rio]),
  }));
  return { nivel: worst([rio, lluvia]), rio, lluvia, zonas };
}

export const RAIN_THRESHOLDS = { atencion: RAIN_ATENCION_MM, alerta: RAIN_ALERTA_MM, critico: RAIN_CRITICO_MM };

export function riskLabel(nivel: RiskLevel | null | undefined): string {
  return nivel ? RISK_LABEL[nivel] : "Evaluación incompleta";
}
