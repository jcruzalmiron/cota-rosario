import { cache } from "react";
import { fetchDischarge, fetchRain, type DischargeSnapshot, type RainSnapshot } from "@/lib/rain";
import { fetchRiver, type RiverSnapshot } from "@/lib/river";
import { fetchWeather, type WeatherNow } from "@/lib/weather";
import { assessRisk, type RiskAssessment } from "@/lib/risk";
import type { SOURCES } from "@/lib/sources";

export type SourceId = keyof typeof SOURCES;

export interface SourceFailure {
  source: SourceId;
  message: string;
  at: string;
}

export interface Status {
  risk: RiskAssessment;
  river: RiverSnapshot | null;
  rain: RainSnapshot | null;
  discharge: DischargeSnapshot | null;
  weather: WeatherNow | null;
  failures: SourceFailure[];
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Error desconocido";
}

function settle<T>(source: SourceId, result: PromiseSettledResult<T>, failures: SourceFailure[]): T | null {
  if (result.status === "fulfilled") {
    return result.value;
  }
  failures.push({ source, message: describe(result.reason), at: new Date().toISOString() });
  return null;
}

export const loadStatus = cache(async function loadStatus(): Promise<Status> {
  const [riverResult, rainResult, dischargeResult, weatherResult] = await Promise.allSettled([fetchRiver(), fetchRain(), fetchDischarge(), fetchWeather()]);
  const failures: SourceFailure[] = [];
  const river = settle("ina", riverResult, failures);
  const rain = settle("openMeteo", rainResult, failures);
  const discharge = settle("glofas", dischargeResult, failures);
  const weather = settle("weather", weatherResult, failures);
  return { risk: assessRisk(river, rain, { now: new Date() }), river, rain, discharge, weather, failures };
});
