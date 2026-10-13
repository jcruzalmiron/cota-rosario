import modelos from "../../public/data/modelos.json";
import { loadEstado, type Estado, type SourceFailure, type SourceId } from "@/lib/estado";
import { empiricalRank, exceedanceProbability, returnPeriodYears, type ExtremeRainModel } from "@/lib/forecast/gumbel";
import { districtExpectations, expectedCases, splitByDay, type DistrictExpectation, type PoissonModel } from "@/lib/forecast/poisson";
import { ratingCurve, trendProjection, type RatingCurve, type TrendProjection } from "@/lib/forecast/river";
import { fetchDischarge, fetchRainOutlook, type DischargeDay, type RainOutlook } from "@/lib/rain";
import { type RiverReading } from "@/lib/river";
import { mergeRiverHistory } from "@/lib/riverHistory";

const DISCHARGE_HISTORY_DAYS = 210;
const TREND_WINDOW_DAYS = 14;
const HORIZON_DAYS = 7;
const CHART_HISTORY_DAYS = 60;
const ARGENTINA_UTC_OFFSET_HOURS = -3;
const MILLIS_PER_DAY = 86_400_000;
const REFERENCE_DAILY_THRESHOLD_MM = 30;

const poissonModel = modelos.anegamientos as PoissonModel;
const extremeModel = modelos.lluviaExtrema as ExtremeRainModel;

export interface FloodingForecast {
  modo: "exploratorio";
  validacionTemporal: "mensual";
  ventanaDias: number;
  lluvia: { total: number; max2h: number };
  esperadosCiudad: number;
  porDistrito: DistrictExpectation[];
  modelo: Pick<PoissonModel, "formula" | "pseudoR2" | "n" | "validacionCruzada" | "coeficientes" | "variablesUsadas" | "candidatos">;
}

export interface RainForecast {
  dias: RainOutlook["dias"];
  maximoDia: RainOutlook["maximoDia"];
  periodoRetornoAnios: number;
  probabilidadAnual: number;
  rangoHistorico: { mayores: number; total: number };
  cuantiles: ExtremeRainModel["cuantiles"];
  gumbel: ExtremeRainModel["gumbel"];
  periodo: ExtremeRainModel["periodo"];
  climatologia: { mes: number; mediaMm: number; probabilidadDia: number; umbralMm: number };
}

export interface RiverForecast {
  actual: number;
  fecha: string;
  alerta: number | null;
  evacuacion: number | null;
  historia: RiverReading[];
  serieDesde: string;
  tendencia: TrendProjection | null;
  curva: RatingCurve | null;
  caudal: { actual: number | null; dias: DischargeDay[] } | null;
}

export interface DailyForecast {
  fecha: string;
  lluviaMm: number;
  probabilidad: number | null;
  anegamientosEsperados: number | null;
  probabilidadAlMenosUno: number | null;
  rioMetros: number | null;
}

export interface Predicciones {
  porDia: DailyForecast[];
  anegamientos: FloodingForecast | null;
  lluvia: RainForecast | null;
  rio: RiverForecast | null;
  fallas: SourceFailure[];
  consultas: Partial<Record<SourceId, string>>;
  vigencia: { modelosCalculados: string; defensaCivilHasta: string; lluviaHistoricaHasta: number; ultimaMedicionRio: string | null };
  generadoEn: string;
}

function failure(fuente: SourceId, reason: unknown): SourceFailure {
  return { fuente, mensaje: reason instanceof Error ? reason.message : String(reason), en: new Date().toISOString() };
}

function currentMonthInArgentina(): number {
  return new Date(Date.now() + ARGENTINA_UTC_OFFSET_HOURS * 3_600_000).getUTCMonth() + 1;
}

function buildRain(outlook: RainOutlook): RainForecast {
  const mm = outlook.maximoDia.milimetros;
  const climatologia = extremeModel.climatologiaMensual.find((entry) => entry.mes === currentMonthInArgentina());
  return {
    dias: outlook.dias,
    maximoDia: outlook.maximoDia,
    periodoRetornoAnios: Number(returnPeriodYears(extremeModel.gumbel, mm).toFixed(1)),
    probabilidadAnual: Number(exceedanceProbability(extremeModel.gumbel, mm).toFixed(3)),
    rangoHistorico: empiricalRank(extremeModel, mm),
    cuantiles: extremeModel.cuantiles,
    gumbel: extremeModel.gumbel,
    periodo: extremeModel.periodo,
    climatologia: {
      mes: climatologia?.mes ?? 0,
      mediaMm: climatologia?.mediaMm ?? 0,
      probabilidadDia: climatologia?.probabilidadDia[String(REFERENCE_DAILY_THRESHOLD_MM)] ?? 0,
      umbralMm: REFERENCE_DAILY_THRESHOLD_MM,
    },
  };
}

function buildFlooding(outlook: RainOutlook): FloodingForecast {
  const lluvia = { total: outlook.total, max2h: outlook.max2h };
  const esperadosCiudad = expectedCases(poissonModel, lluvia, outlook.ventanaDias);
  const { formula, pseudoR2, n, validacionCruzada, coeficientes, variablesUsadas, candidatos } = poissonModel;
  return {
    modo: "exploratorio",
    validacionTemporal: "mensual",
    ventanaDias: outlook.ventanaDias,
    lluvia,
    esperadosCiudad,
    porDistrito: districtExpectations(poissonModel, esperadosCiudad),
    modelo: { formula, pseudoR2, n, validacionCruzada, coeficientes, variablesUsadas, candidatos },
  };
}

export async function loadPredicciones(input?: Estado | Promise<Estado>): Promise<Predicciones> {
  const [estado, [lluviaResult, caudalResult]] = await Promise.all([input ?? loadEstado(), Promise.allSettled([fetchRainOutlook(), fetchDischarge(DISCHARGE_HISTORY_DAYS)])]);
  const fallas: SourceFailure[] = estado.fallas.filter((falla) => falla.fuente === "ina");
  if (lluviaResult.status === "rejected") {
    fallas.push(failure("openMeteo", lluviaResult.reason));
  }
  if (caudalResult.status === "rejected") {
    fallas.push(failure("glofas", caudalResult.reason));
  }

  const outlook = lluviaResult.status === "fulfilled" ? lluviaResult.value : null;
  const rio = estado.rio;
  const caudal = caudalResult.status === "fulfilled" ? caudalResult.value : null;

  const historia = rio ? mergeRiverHistory(rio.serie) : null;
  const riverForecast: RiverForecast | null =
    rio && historia
      ? {
          actual: rio.estacion.metros,
          fecha: rio.estacion.fecha,
          alerta: rio.estacion.alerta,
          evacuacion: rio.estacion.evacuacion,
          historia: historia.serie.filter((reading) => Date.now() - new Date(reading.fecha).getTime() <= CHART_HISTORY_DAYS * MILLIS_PER_DAY),
          serieDesde: historia.desde,
          tendencia: trendProjection(historia.serie, TREND_WINDOW_DAYS, HORIZON_DAYS, { alerta: rio.estacion.alerta, evacuacion: rio.estacion.evacuacion }),
          curva: caudal ? ratingCurve(historia.serie, caudal.pasado, caudal.dias) : null,
          caudal: caudal ? { actual: caudal.actual, dias: caudal.dias } : null,
        }
      : null;

  let anegamientos: FloodingForecast | null = null;
  if (outlook) {
    try { anegamientos = buildFlooding(outlook); }
    catch (error) { fallas.push(failure("modelos", error)); }
  }
  const porDiaCasos = outlook && anegamientos ? splitByDay(poissonModel, anegamientos.esperadosCiudad, outlook.dias.map((dia) => ({ total: dia.milimetros, max2h: dia.max2h }))) : [];
  const nivelPorDia = new Map([
    ...(riverForecast?.historia.map((lectura) => [lectura.fecha.slice(0, 10), lectura.metros] as const) ?? []),
    ...(riverForecast?.tendencia?.proyeccion.map((punto) => [punto.fecha, punto.metros] as const) ?? []),
  ]);
  const porDia: DailyForecast[] = (outlook?.dias ?? []).map((dia, index) => ({
    fecha: dia.fecha,
    lluviaMm: dia.milimetros,
    probabilidad: dia.probabilidad,
    anegamientosEsperados: porDiaCasos[index] ?? null,
    probabilidadAlMenosUno: null,
    rioMetros: nivelPorDia.get(dia.fecha) ?? null,
  }));

  return {
    porDia,
    anegamientos,
    lluvia: outlook ? buildRain(outlook) : null,
    rio: riverForecast,
    fallas,
    consultas: { ina: rio?.consultadoEn, openMeteo: outlook?.consultadoEn, glofas: caudal?.consultadoEn },
    vigencia: {
      modelosCalculados: modelos.calculado,
      defensaCivilHasta: poissonModel.entrenamiento[poissonModel.entrenamiento.length - 1]?.mes ?? "",
      lluviaHistoricaHasta: extremeModel.periodo.hasta,
      ultimaMedicionRio: rio?.estacion.fecha ?? null,
    },
    generadoEn: new Date().toISOString(),
  };
}
