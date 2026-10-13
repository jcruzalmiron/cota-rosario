import { fetchDischarge, fetchRain, type DischargeSnapshot, type RainSnapshot } from "@/lib/rain";
import { fetchRiver, type RiverSnapshot } from "@/lib/river";
import { fetchWeather, type WeatherNow } from "@/lib/weather";
import { assessRisk, type RiskAssessment } from "@/lib/risk";
import type { SOURCES } from "@/lib/sources";

export type SourceId = keyof typeof SOURCES;

export interface SourceFailure {
  fuente: SourceId;
  mensaje: string;
  en: string;
}

export interface Estado {
  riesgo: RiskAssessment;
  rio: RiverSnapshot | null;
  lluvia: RainSnapshot | null;
  caudal: DischargeSnapshot | null;
  clima: WeatherNow | null;
  fallas: SourceFailure[];
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Error desconocido";
}

function settle<T>(fuente: SourceId, result: PromiseSettledResult<T>, fallas: SourceFailure[]): T | null {
  if (result.status === "fulfilled") {
    return result.value;
  }
  fallas.push({ fuente, mensaje: describe(result.reason), en: new Date().toISOString() });
  return null;
}

export async function loadEstado(): Promise<Estado> {
  const [rioResult, lluviaResult, caudalResult, climaResult] = await Promise.allSettled([fetchRiver(), fetchRain(), fetchDischarge(), fetchWeather()]);
  const fallas: SourceFailure[] = [];
  const rio = settle("ina", rioResult, fallas);
  const lluvia = settle("openMeteo", lluviaResult, fallas);
  const caudal = settle("glofas", caudalResult, fallas);
  const clima = settle("clima", climaResult, fallas);
  return { riesgo: assessRisk(rio, lluvia), rio, lluvia, caudal, clima, fallas };
}
