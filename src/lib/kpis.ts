import distritosGeo from "../../public/data/distritos.json";
import modelos from "../../public/data/modelos.json";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { SourceFailure, SourceId } from "@/lib/estado";
import { loadEstado, type Estado } from "@/lib/estado";
import { trendProjection } from "@/lib/forecast/river";
import { featureAt } from "@/lib/lookup";
import { fetchMonthToDateRain, fetchRainBalance, type MonthRain, type RainBalance } from "@/lib/rain";
import { listReports } from "@/lib/reports";
import { REPORT_TYPES, type Report, type ReportType } from "@/lib/reportTypes";
import { hasUsableThresholds } from "@/lib/risk";
import { type RiverReading, type RiverSnapshot, type RiverStation } from "@/lib/river";
import { mergeRiverHistory } from "@/lib/riverHistory";

const UPSTREAM_CHAIN = ["Corrientes", "Goya", "La Paz", "Santa Fe", "Paraná", "Diamante", "San Lorenzo (San Martín)", "Rosario", "Villa Constitución", "San Nicolás"];
const MILLIS_PER_DAY = 86_400_000;
const SPARKLINE_DAYS = 60;
const TREND_WINDOW_DAYS = 14;
const HORIZON_DAYS = 7;
const RECENT_REPORT_HOURS = 6;
const PERCENT = 100;
const CM_PER_M = 100;

export interface RiverKpis {
  actual: number;
  fecha: string;
  variacion24hCm: number | null;
  variacion7dCm: number | null;
  margenAlertaM: number | null;
  diasHastaAlerta: number | null;
  ritmoCmDia: number | null;
  percentil210: number;
  maximo210: RiverReading;
  minimo210: RiverReading;
  sparkline: RiverReading[];
}

export interface UpstreamStation {
  nombre: string;
  rio: string;
  metros: number;
  alerta: number | null;
  evacuacion: number | null;
  tendencia: string;
  margenAlertaM: number | null;
  fecha: string;
  esRosario: boolean;
  esAguasArriba: boolean;
}

export interface NetworkKpis {
  total: number;
  conUmbral: number;
  sobreAlerta: number;
  sobreEvacuacion: number;
  creciendo: number;
  enAlerta: RiverStation[];
}

export interface RainKpis {
  balance: RainBalance;
  mes: MonthRain | null;
  mesNormalMm: number | null;
}

export interface ReportKpis {
  activos: number;
  ultimas6h: number;
  confirmaciones: number;
  porTipo: { tipo: ReportType; etiqueta: string; color: string; cantidad: number }[];
  porDistrito: { distrito: string; cantidad: number }[];
}

export interface Kpis {
  rio: RiverKpis | null;
  aguasArriba: UpstreamStation[];
  red: NetworkKpis | null;
  lluvia: RainKpis | null;
  reportes: ReportKpis | null;
  fallas: SourceFailure[];
  generadoEn: string;
}

type Districts = FeatureCollection<Polygon | MultiPolygon, Record<string, string>>;

const distritos = distritosGeo as Districts;

function failure(fuente: SourceId, reason: unknown): SourceFailure {
  return { fuente, mensaje: reason instanceof Error ? reason.message : String(reason), en: new Date().toISOString() };
}

function readingDaysBefore(serie: RiverReading[], ultimo: RiverReading, days: number): RiverReading | undefined {
  const objetivo = new Date(ultimo.fecha).getTime() - days * MILLIS_PER_DAY;
  return serie
    .filter((reading) => new Date(reading.fecha).getTime() <= objetivo)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
}

function deltaCm(ultimo: RiverReading, anterior: RiverReading | undefined): number | null {
  return anterior ? Math.round((ultimo.metros - anterior.metros) * CM_PER_M) : null;
}

function buildRiver(rio: RiverSnapshot): RiverKpis | null {
  const historia = mergeRiverHistory(rio.serie).serie;
  const ultimo = historia[historia.length - 1];
  if (!ultimo) {
    return null;
  }
  const ordenados = [...historia].sort((a, b) => a.metros - b.metros);
  const debajo = ordenados.filter((reading) => reading.metros < ultimo.metros).length;
  const tendencia = trendProjection(historia, TREND_WINDOW_DAYS, HORIZON_DAYS, { alerta: rio.estacion.alerta });
  return {
    actual: ultimo.metros,
    fecha: ultimo.fecha,
    variacion24hCm: deltaCm(ultimo, readingDaysBefore(historia, ultimo, 1)),
    variacion7dCm: deltaCm(ultimo, readingDaysBefore(historia, ultimo, 7)),
    margenAlertaM: rio.estacion.alerta === null ? null : Number((rio.estacion.alerta - ultimo.metros).toFixed(2)),
    diasHastaAlerta: tendencia?.diasHasta.alerta ?? null,
    ritmoCmDia: tendencia ? Number((tendencia.metrosPorDia * CM_PER_M).toFixed(1)) : null,
    percentil210: Math.round((debajo / historia.length) * PERCENT),
    maximo210: ordenados[ordenados.length - 1],
    minimo210: ordenados[0],
    sparkline: historia.filter((reading) => Date.now() - new Date(reading.fecha).getTime() <= SPARKLINE_DAYS * MILLIS_PER_DAY),
  };
}

function fresh(fecha: string): boolean {
  const age = Date.now() - Date.parse(fecha);
  return Number.isFinite(age) && age >= -900_000 && age <= 48 * 3_600_000;
}

function buildUpstream(red: RiverStation[]): UpstreamStation[] {
  return UPSTREAM_CHAIN.flatMap((nombre) => {
    const station = red.find((entry) => entry.nombre === nombre && fresh(entry.fecha));
    if (!station) {
      return [];
    }
    const usable = hasUsableThresholds(station);
    return [
      {
        nombre: station.nombre,
        rio: station.rio,
        metros: station.metros,
        alerta: usable ? station.alerta : null,
        evacuacion: usable ? station.evacuacion : null,
        tendencia: station.tendencia,
        margenAlertaM: usable && station.alerta ? Number((station.alerta - station.metros).toFixed(2)) : null,
        fecha: station.fecha,
        esRosario: station.nombre === "Rosario",
        esAguasArriba: UPSTREAM_CHAIN.indexOf(nombre) < UPSTREAM_CHAIN.indexOf("Rosario"),
      },
    ];
  });
}

function buildNetwork(red: RiverStation[]): NetworkKpis {
  const conUmbral = red.filter((station) => fresh(station.fecha) && hasUsableThresholds(station));
  const enAlerta = conUmbral.filter((station) => station.alerta !== null && station.metros >= station.alerta);
  return {
    total: red.length,
    conUmbral: conUmbral.length,
    sobreAlerta: enAlerta.length,
    sobreEvacuacion: conUmbral.filter((station) => station.evacuacion !== null && station.evacuacion > 0 && station.metros >= station.evacuacion).length,
    creciendo: conUmbral.filter((station) => station.tendencia.toLowerCase() === "crece").length,
    enAlerta: enAlerta.sort((a, b) => (a.alerta! - a.metros) - (b.alerta! - b.metros)),
  };
}

function buildReports(reports: Report[]): ReportKpis {
  const limite = Date.now() - RECENT_REPORT_HOURS * 3_600_000;
  const conteoDistrito = reports.reduce<Record<string, number>>((acc, report) => {
    const distrito = featureAt(distritos, report.lat, report.lon)?.properties.distrito ?? "fuera de la ciudad";
    return { ...acc, [distrito]: (acc[distrito] ?? 0) + 1 };
  }, {});
  return {
    activos: reports.length,
    ultimas6h: reports.filter((report) => new Date(report.creadoEn).getTime() >= limite).length,
    confirmaciones: reports.reduce((total, report) => total + report.confirmaciones, 0),
    porTipo: (Object.keys(REPORT_TYPES) as ReportType[]).map((tipo) => ({
      tipo,
      etiqueta: REPORT_TYPES[tipo].etiqueta,
      color: REPORT_TYPES[tipo].color,
      cantidad: reports.filter((report) => report.tipo === tipo).length,
    })),
    porDistrito: Object.entries(conteoDistrito)
      .map(([distrito, cantidad]) => ({ distrito, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad),
  };
}

function monthNormal(mes: string): number | null {
  const numero = Number(mes.slice(5, 7));
  return modelos.lluviaExtrema.climatologiaMensual.find((entry) => entry.mes === numero)?.mediaMm ?? null;
}

export async function loadKpis(input?: Estado | Promise<Estado>): Promise<Kpis> {
  const [estado, [balanceResult, mesResult, reportesResult]] = await Promise.all([input ?? loadEstado(), Promise.allSettled([fetchRainBalance(), fetchMonthToDateRain(), listReports()])]);
  const fallas: SourceFailure[] = [...estado.fallas];
  if (balanceResult.status === "rejected") {
    fallas.push(failure("openMeteo", balanceResult.reason));
  }
  if (mesResult.status === "rejected") fallas.push(failure("openMeteo", mesResult.reason));
  if (reportesResult.status === "rejected") fallas.push(failure("reportes", reportesResult.reason));
  const rio = estado.rio;
  const balance = balanceResult.status === "fulfilled" ? balanceResult.value : null;
  const mes = mesResult.status === "fulfilled" ? mesResult.value : null;
  const reportes = reportesResult.status === "fulfilled" ? reportesResult.value : null;

  return {
    rio: rio ? buildRiver(rio) : null,
    aguasArriba: rio ? buildUpstream(rio.red) : [],
    red: rio ? buildNetwork(rio.red) : null,
    lluvia: balance ? { balance, mes, mesNormalMm: monthNormal(mes?.mes ?? balance.ahoraLocal) } : null,
    reportes: reportes ? buildReports(reportes) : null,
    fallas,
    generadoEn: new Date().toISOString(),
  };
}
