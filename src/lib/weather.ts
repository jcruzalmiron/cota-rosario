import { fetchWithRetry } from "@/lib/rain";
import { ROSARIO } from "@/lib/sources";
import { sourceTime } from "@/lib/time";
import { probability, requireRecent } from "@/lib/dataChecks";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEZONE = "America/Argentina/Buenos_Aires";
const PROBABILITY_HOURS = 6;

export type WeatherIcon = "sol" | "nubes" | "nublado" | "niebla" | "llovizna" | "lluvia" | "tormenta" | "granizo";

export interface WeatherNow {
  temperatura: number;
  sensacion: number;
  humedad: number;
  presion: number;
  viento: number;
  lluviaAhora: number;
  probabilidadLluvia: number | null;
  ventanaHoras: number;
  codigo: number;
  descripcion: string;
  icono: WeatherIcon;
  medidoEn: string;
  consultadoEn: string;
}

interface CurrentResponse {
  utc_offset_seconds: number;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    surface_pressure: number;
    wind_speed_10m: number;
    precipitation: number;
    weather_code: number;
  };
  hourly: { time: string[]; precipitation_probability: number[] };
}

const WMO: { codigos: number[]; descripcion: string; icono: WeatherIcon }[] = [
  { codigos: [0], descripcion: "Despejado", icono: "sol" },
  { codigos: [1, 2], descripcion: "Parcialmente nublado", icono: "nubes" },
  { codigos: [3], descripcion: "Nublado", icono: "nublado" },
  { codigos: [45, 48], descripcion: "Niebla", icono: "niebla" },
  { codigos: [51, 53, 55, 56, 57], descripcion: "Llovizna", icono: "llovizna" },
  { codigos: [61, 63, 80, 81], descripcion: "Lluvia", icono: "lluvia" },
  { codigos: [65, 82], descripcion: "Lluvia intensa", icono: "lluvia" },
  { codigos: [66, 67, 71, 73, 75, 77, 85, 86], descripcion: "Precipitación helada", icono: "granizo" },
  { codigos: [95], descripcion: "Tormenta", icono: "tormenta" },
  { codigos: [96, 99], descripcion: "Tormenta con granizo", icono: "granizo" },
];

function describe(codigo: number): { descripcion: string; icono: WeatherIcon } {
  const match = WMO.find((entry) => entry.codigos.includes(codigo));
  return match ? { descripcion: match.descripcion, icono: match.icono } : { descripcion: "Sin descripción", icono: "nubes" };
}

export async function fetchWeather(): Promise<WeatherNow> {
  const params = new URLSearchParams({
    latitude: String(ROSARIO.lat),
    longitude: String(ROSARIO.lon),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,wind_speed_10m,precipitation,weather_code",
    hourly: "precipitation_probability",
    forecast_days: "2",
    timezone: TIMEZONE,
  });
  const response = await fetchWithRetry(`${FORECAST_URL}?${params}`, "Open-Meteo");
  const data = (await response.json()) as CurrentResponse;
  const medidoEn = sourceTime(data.current.time, data.utc_offset_seconds);
  requireRecent(medidoEn, 2 * 3_600_000, "Clima de Open-Meteo");
  const ahora = Date.parse(medidoEn);
  for (const value of [data.current.temperature_2m, data.current.apparent_temperature, data.current.relative_humidity_2m, data.current.surface_pressure, data.current.wind_speed_10m, data.current.weather_code, data.current.precipitation]) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("El clima actual tiene datos faltantes.");
  }
  const proximas = data.hourly.time
    .map((hora, index) => ({ t: Date.parse(sourceTime(hora, data.utc_offset_seconds)), p: probability(data.hourly.precipitation_probability[index]) }))
    .filter((entry) => entry.t >= ahora - 3_600_000)
    .slice(0, PROBABILITY_HOURS);
  const { descripcion, icono } = describe(data.current.weather_code);
  return {
    temperatura: Math.round(data.current.temperature_2m),
    sensacion: Math.round(data.current.apparent_temperature),
    humedad: Math.round(data.current.relative_humidity_2m),
    presion: Math.round(data.current.surface_pressure),
    viento: Math.round(data.current.wind_speed_10m),
    lluviaAhora: data.current.precipitation,
    probabilidadLluvia: proximas.length === PROBABILITY_HOURS && proximas.every((entry) => entry.p !== null) ? Math.max(...proximas.map((entry) => entry.p!)) : null,
    ventanaHoras: PROBABILITY_HOURS,
    codigo: data.current.weather_code,
    descripcion,
    icono,
    medidoEn,
    consultadoEn: new Date().toISOString(),
  };
}
