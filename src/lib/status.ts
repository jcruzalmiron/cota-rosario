import { cache } from "react";
import { fetchDischarge, fetchRain, type DischargeSnapshot, type RainSnapshot } from "@/lib/rain";
import { fetchRiver, type RiverSnapshot } from "@/lib/river";
import { fetchWeather, type WeatherNow } from "@/lib/weather";
import { fetchAlerts, fetchStreams, type AlertsSnapshot, type StreamsSnapshot } from "@/lib/provincial";
import { assessRisk, type RiskAssessment } from "@/lib/risk";
import type { SOURCES } from "@/lib/sources";
import { listReports } from "@/lib/reports";
import { reportsByZone } from "@/lib/zoneReports";

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
  /** Alertas del SMN para Rosario. `null` es «no se pudo consultar»; `items: []` es «consultado, sin alertas». */
  alerts: AlertsSnapshot | null;
  /** Arroyos Ludueña y Saladillo. `null` es «sin dato», nunca «normal». */
  streams: StreamsSnapshot | null;
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
  const [riverResult, rainResult, dischargeResult, weatherResult, reportsResult, alertsResult, streamsResult] = await Promise.allSettled([fetchRiver(), fetchRain(), fetchDischarge(), fetchWeather(), listReports(), fetchAlerts(), fetchStreams()]);
  const failures: SourceFailure[] = [];
  const river = settle("ina", riverResult, failures);
  const rain = settle("openMeteo", rainResult, failures);
  const discharge = settle("glofas", dischargeResult, failures);
  const weather = settle("weather", weatherResult, failures);
  const alerts = settle("smnAlerts", alertsResult, failures);
  const streams = settle("provincialStreams", streamsResult, failures);
  // Si el archivo de reportes no se puede leer, las zonas se evalúan sin aporte vecinal.
  const byZone = reportsResult.status === "fulfilled" ? reportsByZone(reportsResult.value) : {};
  return { risk: assessRisk(river, rain, { now: new Date(), reportsByZone: byZone }), river, rain, discharge, weather, alerts, streams, failures };
});
