import civilDefense from "../../../public/data/civil-defense.json";
import type { RainOutlook } from "../rain";

/**
 * Demanda esperada de intervenciones por anegamiento (Defensa Civil) y dotación.
 *
 * Todo el módulo es puro y determinista: no lee la red, no usa el reloj ni números
 * aleatorios. El ajuste se hace sobre la serie mensual de `civil-defense.json` y la
 * extrapolación de mes a evento se declara como supuesto en cada resultado.
 */

export interface DemandMonth {
  month: string;
  rainMm: number;
  cases: number;
  byDistrict?: Record<string, number>;
}

export interface DemandRiverMonth { month: string; meters: number }

export interface DemandFitOptions {
  /** Altura mensual del río. Solo entra al modelo si mejora el error LOO. */
  river?: DemandRiverMonth[];
  source?: string;
  endpoints?: string[];
  rainSource?: string;
  rainEndpoint?: string;
  /** Fecha del snapshot de datos; el ajuste es determinista respecto de ese snapshot. */
  computedAt?: string | null;
}

export type DemandModelId = "ratio" | "threshold-power" | "poisson-log1p" | "poisson-log1p-river";

export interface DemandCandidate {
  id: DemandModelId;
  label: string;
  formula: string;
  parameters: number;
  coefficients: Record<string, number>;
  /** Error absoluto medio en validación dejando un mes afuera (casos por mes). */
  looMae: number;
  /** Fracción de meses cuyo valor real cae en el intervalo 10–90 % armado sin ese mes. */
  looCoverage: number;
  chosen: boolean;
}

export interface DemandDistrictShare {
  district: string;
  share: number;
  /** Cuantiles 10 % y 90 % de la proporción mensual (meses con casos suficientes). */
  shareLow: number;
  shareHigh: number;
  cases: number;
}

export interface DemandModelCard {
  title: string;
  dataSource: string;
  endpoints: string[];
  rainSource: string;
  rainEndpoint: string;
  period: { from: string; until: string };
  months: number;
  chosenModel: DemandModelId;
  chosenLabel: string;
  formula: string;
  coefficients: Record<string, number>;
  candidates: DemandCandidate[];
  /** MAE LOO de predecir siempre la media: referencia, no candidato. */
  looMaeMeanReference: number;
  interval: { nominal: number; lowQuantile: number; highQuantile: number; scale: "sqrt"; method: string; looCoverage: number };
  river: { included: boolean; overlappingMonths: number; looMaeWithRiver: number | null; note: string };
  staffingNote: string;
  computedAt: string | null;
  limitations: string[];
}

export interface DemandModel {
  id: DemandModelId;
  coefficients: Record<string, number>;
  /** Cuantiles 10 % y 90 % de los residuos LOO en escala raíz cuadrada. */
  residualQuantiles: { low: number; high: number };
  rainRange: { min: number; max: number };
  districts: DemandDistrictShare[];
  /** Media del río en el ajuste; solo se usa si el río entró al modelo. */
  riverMean: number | null;
  training: { month: string; rainMm: number; cases: number; fitted: number; looPredicted: number }[];
  card: DemandModelCard;
}

export interface DemandRange { expected: number; low: number; high: number }

export interface DemandDistrictEstimate extends DemandRange { district: string; share: number }

export interface DemandHorizon extends DemandRange {
  horizonHours: 24 | 48;
  rainMm: number;
  /** La lluvia del evento supera el máximo mensual observado: el modelo extrapola. */
  extrapolated: boolean;
  districts: DemandDistrictEstimate[];
}

export interface DemandEstimate {
  h24: DemandHorizon;
  h48: DemandHorizon;
  unit: string;
  intervalLabel: string;
  assumptions: string[];
  riverNote: string;
  model: DemandModelId;
}

export const STAFFING_ASSUMED_LABEL = "supuesto a validar con Defensa Civil";

export interface StaffingParams {
  interventionsPerCrewPerShift: number;
  shiftHours: number;
  peoplePerCrew: number;
}

/** Valores de trabajo redondos y conservadores. No son cifras oficiales de Defensa Civil. */
export const DEFAULT_STAFFING_PARAMS: StaffingParams = { interventionsPerCrewPerShift: 4, shiftHours: 8, peoplePerCrew: 3 };

export interface StaffingParam { value: number; assumed: boolean; label: string }

export interface StaffingLevels { low: number; expected: number; high: number }

export interface StaffingResult {
  horizonHours: number;
  /** Turnos que entran en el horizonte (horizonte / horas por turno, hacia arriba). */
  shifts: number;
  params: Record<keyof StaffingParams, StaffingParam>;
  /** Cuadrillas simultáneas por turno. */
  crews: StaffingLevels;
  /** Personas simultáneas por turno (cuadrillas × personas por cuadrilla). */
  people: StaffingLevels;
  /** Personas-turno en todo el horizonte. */
  personShifts: StaffingLevels;
  formula: string;
  assumptions: string[];
}

const LOW_QUANTILE = 0.1;
const HIGH_QUANTILE = 0.9;
const THRESHOLD_GRID = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const POWER_GRID = [0.5, 0.75, 1, 1.25, 1.5, 2];
const MIN_MONTHS = 12;
const MIN_RIVER_MONTHS = 12;
const MIN_CASES_FOR_SHARE = 10;
const LABELS: Record<DemandModelId, string> = {
  "ratio": "Línea base: casos por mm",
  "threshold-power": "Potencia con umbral",
  "poisson-log1p": "Poisson sobre log(1 + lluvia)",
  "poisson-log1p-river": "Poisson sobre log(1 + lluvia) y altura del río",
};
const FORMULAS: Record<DemandModelId, string> = {
  "ratio": "casos = k · lluvia",
  "threshold-power": "casos = k · max(0, lluvia − r0)^p",
  "poisson-log1p": "casos = exp(b0 + b1 · ln(1 + lluvia))",
  "poisson-log1p-river": "casos = exp(b0 + b1 · ln(1 + lluvia) + b2 · (río − media))",
};
/** Orden de simplicidad: ante un empate en el MAE LOO gana el que aparece antes. */
const SIMPLICITY: DemandModelId[] = ["ratio", "poisson-log1p", "threshold-power", "poisson-log1p-river"];

interface Row { rain: number; cases: number; river: number }
type Predictor = (rain: number, river: number) => number;
interface Fit { coefficients: Record<string, number>; predict: Predictor }
type Fitter = (rows: Row[]) => Fit;

function fitRatio(rows: Row[]): Fit {
  const rain = rows.reduce((acc, row) => acc + row.rain, 0);
  const k = rain > 0 ? rows.reduce((acc, row) => acc + row.cases, 0) / rain : 0;
  return { coefficients: { k }, predict: (mm) => k * mm };
}

function fitThresholdPower(rows: Row[]): Fit {
  let best = { r0: 0, p: 1, k: 0, sse: Infinity };
  for (const r0 of THRESHOLD_GRID) {
    for (const p of POWER_GRID) {
      const x = rows.map((row) => Math.max(0, row.rain - r0) ** p);
      const xx = x.reduce((acc, value) => acc + value * value, 0);
      if (!(xx > 0)) continue;
      const k = Math.max(0, x.reduce((acc, value, i) => acc + value * rows[i].cases, 0) / xx);
      const sse = rows.reduce((acc, row, i) => acc + (row.cases - k * x[i]) ** 2, 0);
      if (sse < best.sse - 1e-9) best = { r0, p, k, sse };
    }
  }
  const { r0, p, k } = best;
  return { coefficients: { k, r0, p }, predict: (mm) => k * Math.max(0, mm - r0) ** p };
}

function solve(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col] / a[col][col];
      for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

/** Regresión de Poisson con enlace logarítmico por mínimos cuadrados reponderados (IRLS). */
function poissonIrls(design: number[][], y: number[]): number[] {
  const p = design[0].length;
  const mean = Math.max(y.reduce((acc, value) => acc + value, 0) / y.length, 0.5);
  let beta = [Math.log(mean), ...new Array<number>(p - 1).fill(0)];
  for (let iteration = 0; iteration < 100; iteration++) {
    const xtwx = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const xtwz = new Array<number>(p).fill(0);
    for (let i = 0; i < y.length; i++) {
      const eta = Math.min(30, Math.max(-30, design[i].reduce((acc, value, j) => acc + value * beta[j], 0)));
      const mu = Math.exp(eta);
      const z = eta + (y[i] - mu) / mu;
      for (let j = 0; j < p; j++) {
        xtwz[j] += design[i][j] * mu * z;
        for (let k = 0; k < p; k++) xtwx[j][k] += design[i][j] * mu * design[i][k];
      }
    }
    const next = solve(xtwx, xtwz);
    if (!next || next.some((value) => !Number.isFinite(value))) break;
    const change = Math.max(...next.map((value, j) => Math.abs(value - beta[j])));
    beta = next;
    if (change < 1e-10) break;
  }
  return beta;
}

function fitPoisson(rows: Row[]): Fit {
  const [b0, b1] = poissonIrls(rows.map((row) => [1, Math.log1p(row.rain)]), rows.map((row) => row.cases));
  return { coefficients: { b0, b1 }, predict: (mm) => Math.exp(b0 + b1 * Math.log1p(mm)) };
}

function fitPoissonRiver(rows: Row[]): Fit {
  const riverMean = rows.reduce((acc, row) => acc + row.river, 0) / rows.length;
  const [b0, b1, b2] = poissonIrls(rows.map((row) => [1, Math.log1p(row.rain), row.river - riverMean]), rows.map((row) => row.cases));
  return { coefficients: { b0, b1, b2, riverMean }, predict: (mm, river) => Math.exp(b0 + b1 * Math.log1p(mm) + b2 * (river - riverMean)) };
}

const FITTERS: Record<DemandModelId, Fitter> = { "ratio": fitRatio, "threshold-power": fitThresholdPower, "poisson-log1p": fitPoisson, "poisson-log1p-river": fitPoissonRiver };

function predictorFor(id: DemandModelId, c: Record<string, number>): Predictor {
  if (id === "ratio") return (mm) => c.k * mm;
  if (id === "threshold-power") return (mm) => c.k * Math.max(0, mm - c.r0) ** c.p;
  if (id === "poisson-log1p") return (mm) => Math.exp(c.b0 + c.b1 * Math.log1p(mm));
  return (mm, river) => Math.exp(c.b0 + c.b1 * Math.log1p(mm) + c.b2 * (river - c.riverMean));
}

/** Cuantil con interpolación lineal (tipo 7). */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function sqrtBand(predicted: number, low: number, high: number): { low: number; high: number } {
  const root = Math.sqrt(Math.max(0, predicted));
  return { low: Math.max(0, root + low) ** 2, high: Math.max(0, root + high) ** 2 };
}

interface Loo { predictions: number[]; mae: number; coverage: number; residuals: number[] }

function leaveOneOut(rows: Row[], fitter: Fitter): Loo {
  const predictions = rows.map((row, i) => Math.max(0, fitter(rows.filter((_, j) => j !== i)).predict(row.rain, row.river)));
  const mae = predictions.reduce((acc, value, i) => acc + Math.abs(rows[i].cases - value), 0) / rows.length;
  const residuals = predictions.map((value, i) => Math.sqrt(rows[i].cases) - Math.sqrt(value));
  // La cobertura se mide con cuantiles que no vieron el residuo del mes evaluado.
  const covered = rows.filter((row, i) => {
    const others = residuals.filter((_, j) => j !== i);
    const band = sqrtBand(predictions[i], quantile(others, LOW_QUANTILE), quantile(others, HIGH_QUANTILE));
    return row.cases >= band.low && row.cases <= band.high;
  }).length;
  return { predictions, mae, coverage: covered / rows.length, residuals };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundCoefficients(coefficients: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(coefficients).map(([key, value]) => [key, Number(value.toPrecision(6))]));
}

function districtShares(series: DemandMonth[]): DemandDistrictShare[] {
  const totals = new Map<string, number>();
  for (const month of series) for (const [district, cases] of Object.entries(month.byDistrict ?? {})) totals.set(district, (totals.get(district) ?? 0) + cases);
  const all = [...totals.values()].reduce((acc, value) => acc + value, 0);
  if (!(all > 0)) return [];
  const usable = series.map((month) => ({ byDistrict: month.byDistrict ?? {}, total: Object.values(month.byDistrict ?? {}).reduce((acc, value) => acc + value, 0) })).filter((month) => month.total >= MIN_CASES_FOR_SHARE);
  return [...totals.entries()].map(([district, cases]) => {
    const share = cases / all;
    const monthly = usable.map((month) => (month.byDistrict[district] ?? 0) / month.total);
    const shareLow = monthly.length > 0 ? Math.min(share, quantile(monthly, LOW_QUANTILE)) : share;
    const shareHigh = monthly.length > 0 ? Math.max(share, quantile(monthly, HIGH_QUANTILE)) : share;
    return { district, share, shareLow, shareHigh, cases };
  }).sort((a, b) => b.share - a.share || a.district.localeCompare(b.district));
}

const QUALITATIVE_RIVER_NOTE = "El río no entra en el cálculo. Con el Paraná alto los desagües descargan peor, así que la demanda real puede acercarse al valor alto del rango o superarlo: tratarlo como factor de escalamiento cualitativo.";

function assertSeries(series: DemandMonth[]): void {
  if (!Array.isArray(series) || series.length < MIN_MONTHS) throw new Error(`Se necesitan al menos ${MIN_MONTHS} meses para ajustar la demanda.`);
  for (const month of series) {
    if (typeof month.month !== "string" || !Number.isFinite(month.rainMm) || month.rainMm < 0 || !Number.isFinite(month.cases) || month.cases < 0) throw new Error(`Mes inválido en la serie de demanda: ${JSON.stringify(month.month)}.`);
  }
  if (!series.some((month) => month.rainMm > 0) || !series.some((month) => month.cases > 0)) throw new Error("La serie no tiene lluvia o casos para ajustar.");
}

export function fitDemandModel(series: DemandMonth[], options: DemandFitOptions = {}): DemandModel {
  assertSeries(series);
  const ordered = [...series].sort((a, b) => a.month.localeCompare(b.month));
  const riverByMonth = new Map((options.river ?? []).filter((entry) => Number.isFinite(entry.meters)).map((entry) => [entry.month, entry.meters]));
  const rows: Row[] = ordered.map((month) => ({ rain: month.rainMm, cases: month.cases, river: riverByMonth.get(month.month) ?? Number.NaN }));

  const ids: DemandModelId[] = ["ratio", "threshold-power", "poisson-log1p"];
  const loo = new Map<DemandModelId, Loo>(ids.map((id) => [id, leaveOneOut(rows, FITTERS[id])]));
  const fits = new Map<DemandModelId, Fit>(ids.map((id) => [id, FITTERS[id](rows)]));
  const byMae = [...ids].sort((a, b) => (loo.get(a) as Loo).mae - (loo.get(b) as Loo).mae || SIMPLICITY.indexOf(a) - SIMPLICITY.indexOf(b));
  let chosen = byMae[0];

  // El río se prueba solo en los meses donde hay altura, contra el mejor modelo sin río en esos mismos meses.
  const overlap = rows.filter((row) => Number.isFinite(row.river));
  let riverIncluded = false;
  let looMaeWithRiver: number | null = null;
  let riverNote: string;
  if (overlap.length >= MIN_RIVER_MONTHS && overlap.length === rows.length) {
    const withRiver = leaveOneOut(rows, fitPoissonRiver);
    looMaeWithRiver = withRiver.mae;
    if (withRiver.mae < (loo.get(chosen) as Loo).mae) {
      riverIncluded = true;
      chosen = "poisson-log1p-river";
      ids.push(chosen);
      loo.set(chosen, withRiver);
      fits.set(chosen, fitPoissonRiver(rows));
      riverNote = `La altura mensual del río mejora el error LOO (${round(withRiver.mae, 1)} casos por mes) y entra al modelo.`;
    } else {
      riverNote = `Se probó la altura mensual del río y no mejora el error LOO (${round(withRiver.mae, 1)} contra ${round((loo.get(chosen) as Loo).mae, 1)} casos por mes). ${QUALITATIVE_RIVER_NOTE}`;
    }
  } else if (overlap.length > 0) {
    riverNote = `La serie del río cubre ${overlap.length} de ${rows.length} meses: no alcanza para probar si mejora el modelo. ${QUALITATIVE_RIVER_NOTE}`;
  } else {
    riverNote = `No hay altura del río en los meses de la serie de intervenciones, así que no se pudo probar si mejora el modelo. ${QUALITATIVE_RIVER_NOTE}`;
  }

  const chosenLoo = loo.get(chosen) as Loo;
  const chosenFit = fits.get(chosen) as Fit;
  const mean = rows.reduce((acc, row) => acc + row.cases, 0) / rows.length;
  const meanLoo = rows.reduce((acc, row) => acc + Math.abs(row.cases - (mean * rows.length - row.cases) / (rows.length - 1)), 0) / rows.length;
  const candidates: DemandCandidate[] = ids.map((id) => ({
    id,
    label: LABELS[id],
    formula: FORMULAS[id],
    parameters: Object.keys((fits.get(id) as Fit).coefficients).filter((key) => key !== "riverMean").length,
    coefficients: roundCoefficients((fits.get(id) as Fit).coefficients),
    looMae: round((loo.get(id) as Loo).mae, 2),
    looCoverage: round((loo.get(id) as Loo).coverage, 3),
    chosen: id === chosen,
  }));
  const coefficients = roundCoefficients(chosenFit.coefficients);
  const riverMean = riverIncluded ? coefficients.riverMean : null;
  const rains = rows.map((row) => row.rain);
  const lastYear = ordered[ordered.length - 1].month.slice(0, 4);
  const lastYearMonths = ordered.filter((month) => month.month.startsWith(lastYear)).length;

  const card: DemandModelCard = {
    title: "Demanda esperada de intervenciones por anegamiento",
    dataSource: options.source ?? "Serie mensual provista al ajuste",
    endpoints: options.endpoints ?? [],
    rainSource: options.rainSource ?? "Lluvia mensual provista al ajuste",
    rainEndpoint: options.rainEndpoint ?? "",
    period: { from: ordered[0].month, until: ordered[ordered.length - 1].month },
    months: ordered.length,
    chosenModel: chosen,
    chosenLabel: LABELS[chosen],
    formula: FORMULAS[chosen],
    coefficients,
    candidates,
    looMaeMeanReference: round(meanLoo, 2),
    interval: {
      nominal: HIGH_QUANTILE - LOW_QUANTILE,
      lowQuantile: LOW_QUANTILE,
      highQuantile: HIGH_QUANTILE,
      scale: "sqrt",
      method: "Cuantiles 10 % y 90 % de los residuos de la validación dejando un mes afuera, en escala raíz cuadrada.",
      looCoverage: round(chosenLoo.coverage, 3),
    },
    river: { included: riverIncluded, overlappingMonths: overlap.length, looMaeWithRiver: looMaeWithRiver === null ? null : round(looMaeWithRiver, 2), note: riverNote },
    staffingNote: `Los parámetros de dotación por defecto (${DEFAULT_STAFFING_PARAMS.interventionsPerCrewPerShift} intervenciones por cuadrilla y turno, turnos de ${DEFAULT_STAFFING_PARAMS.shiftHours} h, ${DEFAULT_STAFFING_PARAMS.peoplePerCrew} personas por cuadrilla) son valores de trabajo, no cifras oficiales: cada uno es un ${STAFFING_ASSUMED_LABEL}.`,
    computedAt: options.computedAt ?? null,
    limitations: [
      "Granularidad mensual: la serie no distingue una tormenta concentrada de varios días de lluvia débil, y el modelo no ve la intensidad.",
      `Pocos datos: ${ordered.length} meses${lastYearMonths < 12 ? `, y de ${lastYear} solo ${lastYearMonths === 1 ? "hay un mes" : `hay ${lastYearMonths} meses`}` : ""}.`,
      "La lluvia mensual sale de un reanálisis (archivo de Open-Meteo) en un punto de la ciudad, no de un pluviómetro.",
      "Los casos son intervenciones atendidas y registradas por Defensa Civil, no el total de anegamientos ocurridos.",
      "El rango describe el error histórico del modelo mensual; no incluye el error del pronóstico de lluvia.",
      "El reparto por distrito usa proporciones históricas, que cambian mucho de un mes a otro.",
    ],
  };

  const full = predictorFor(chosen, coefficients);
  return {
    id: chosen,
    coefficients,
    residualQuantiles: { low: Number(quantile(chosenLoo.residuals, LOW_QUANTILE).toPrecision(6)), high: Number(quantile(chosenLoo.residuals, HIGH_QUANTILE).toPrecision(6)) },
    rainRange: { min: Math.min(...rains), max: Math.max(...rains) },
    districts: districtShares(ordered),
    riverMean,
    training: ordered.map((month, i) => ({ month: month.month, rainMm: month.rainMm, cases: month.cases, fitted: round(Math.max(0, full(rows[i].rain, rows[i].river)), 1), looPredicted: round(chosenLoo.predictions[i], 1) })),
    card,
  };
}

/** Curva mensual ajustada: casos esperados en un mes con esa lluvia total. Sirve para graficar el ajuste. */
export function monthlyExpected(model: DemandModel, rainMm: number): number {
  if (!Number.isFinite(rainMm) || rainMm < 0) throw new Error("La lluvia debe ser un número no negativo.");
  return Math.max(0, predictorFor(model.id, model.coefficients)(rainMm, model.riverMean ?? 0));
}

/** Reparte un entero entre pesos por restos mayores, para que la suma coincida con el total. */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  if (!(sum > 0)) return weights.map(() => 0);
  const exact = weights.map((weight) => total * weight / sum);
  const floors = exact.map(Math.floor);
  const order = exact.map((value, i) => ({ i, remainder: value - floors[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  const missing = total - floors.reduce((acc, value) => acc + value, 0);
  for (let i = 0; i < missing; i++) floors[order[i % order.length].i]++;
  return floors;
}

function horizon(model: DemandModel, horizonHours: 24 | 48, rainMm: number): DemandHorizon {
  // Incremento sobre un mes seco: f(lluvia) − f(0). La base mensual no se le carga al evento.
  const baseline = monthlyExpected(model, 0);
  const monthly = monthlyExpected(model, rainMm);
  const band = sqrtBand(monthly, model.residualQuantiles.low, model.residualQuantiles.high);
  const expected = Math.round(Math.max(0, monthly - baseline));
  const low = Math.min(expected, Math.floor(Math.max(0, band.low - baseline)));
  const high = Math.max(expected, Math.ceil(Math.max(0, band.high - baseline)));
  if (![expected, low, high].every(Number.isSafeInteger)) throw new Error("El escenario está fuera del rango numérico del modelo.");
  const amounts = allocate(expected, model.districts.map((district) => district.share));
  const districts = model.districts.map((district, i) => ({
    district: district.district,
    share: round(district.share, 4),
    expected: amounts[i],
    low: Math.min(amounts[i], Math.floor(low * district.shareLow)),
    high: Math.max(amounts[i], Math.ceil(high * district.shareHigh)),
  }));
  return { horizonHours, rainMm: round(rainMm, 1), expected, low, high, extrapolated: rainMm > model.rainRange.max, districts };
}

/**
 * Intervenciones esperadas para las próximas 24 y 48 h. `rainMm48` es el acumulado de las
 * 48 h completas (incluye las primeras 24), así que el resultado a 48 h también es acumulado.
 */
export function estimateDemand(model: DemandModel, rainMm24: number, rainMm48: number): DemandEstimate {
  if (![rainMm24, rainMm48].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("La lluvia prevista debe ser un número no negativo.");
  const rain48 = Math.max(rainMm24, rainMm48);
  const h24 = horizon(model, 24, rainMm24);
  const h48 = horizon(model, 48, rain48);
  const assumptions = [
    "Supuesto fuerte: el modelo se ajustó con totales mensuales y acá se aplica a un evento. La lluvia acumulada del evento se trata como la lluvia total de un mes, y se informa el incremento de intervenciones respecto de un mes sin lluvia.",
    "El modelo no ve la intensidad: la misma lluvia concentrada en pocas horas suele generar más intervenciones que repartida en un mes, así que ante tormentas intensas conviene mirar el valor alto del rango.",
    "El valor a 48 h es acumulado e incluye las primeras 24 h.",
    "El rango es el 10–90 % de los errores históricos del modelo mensual. No incluye el error del pronóstico de lluvia ni cambios operativos desde 2024.",
    "El reparto por distrito usa las proporciones históricas del período; el rango de cada distrito se ensancha con la variación mensual de su proporción, por eso los rangos por distrito no suman el rango de la ciudad.",
    "Son intervenciones atendidas por Defensa Civil, no todos los anegamientos que puedan ocurrir.",
  ];
  if (model.id === "ratio") assumptions.push(`Con el modelo elegido (casos por mm) esto equivale a un efecto marginal constante de ${round(model.coefficients.k, 2)} intervenciones por cada mm previsto.`);
  if (h24.extrapolated || h48.extrapolated) assumptions.push(`La lluvia prevista supera el máximo mensual de la serie (${model.rainRange.max} mm): el resultado es una extrapolación fuera de lo observado.`);
  return { h24, h48, unit: "intervenciones por anegamiento atendidas", intervalLabel: "rango 10–90 %", assumptions, riverNote: model.card.river.note, model: model.id };
}

let cachedDefault: DemandModel | null = null;

/** Modelo ajustado sobre `public/data/civil-defense.json`. Se calcula una vez por proceso. */
export function defaultDemandModel(): DemandModel {
  cachedDefault ??= fitDemandModel(civilDefense.series as DemandMonth[], {
    source: civilDefense.source,
    endpoints: civilDefense.endpoints,
    rainSource: civilDefense.rain.source,
    rainEndpoint: civilDefense.rain.endpoint,
    computedAt: civilDefense.computedAt,
  });
  return cachedDefault;
}

/**
 * Toma la lluvia de 24 y 48 h del pronóstico semanal. `RainOutlook` trae días calendario
 * (hora de Argentina): 24 h = hoy, 48 h = hoy + mañana. Para una ventana móvil exacta usar
 * `estimateDemand(model, balance.expected24h, balance.expected48h)` con `RainBalance`.
 */
export function demandFromOutlook(outlook: RainOutlook, model: DemandModel = defaultDemandModel()): DemandEstimate {
  if (!Array.isArray(outlook?.days) || outlook.days.length < 2) throw new Error("El pronóstico no trae hoy y mañana.");
  const [today, tomorrow] = outlook.days;
  const estimate = estimateDemand(model, today.millimeters, today.millimeters + tomorrow.millimeters);
  return { ...estimate, assumptions: [...estimate.assumptions, `La lluvia sale del pronóstico por día calendario: 24 h = ${today.date} completo y 48 h = ${today.date} más ${tomorrow.date}; no es una ventana móvil desde ahora.`] };
}

/**
 * Dotación: cuadrillas = ceil(casos / (intervenciones por cuadrilla y turno × turnos)).
 * Todo parámetro que no se pase explícitamente queda marcado como supuesto.
 */
export function staffing(estimate: DemandRange & { horizonHours: number }, params: Partial<StaffingParams> = {}): StaffingResult {
  const merged = { ...DEFAULT_STAFFING_PARAMS, ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)) } as StaffingParams;
  const keys = Object.keys(DEFAULT_STAFFING_PARAMS) as (keyof StaffingParams)[];
  if (keys.some((key) => !Number.isFinite(merged[key]) || merged[key] <= 0)) throw new Error("Los parámetros de dotación deben ser números positivos.");
  if (![estimate.low, estimate.expected, estimate.high].every((value) => Number.isFinite(value) && value >= 0) || !(estimate.horizonHours > 0)) throw new Error("La estimación de demanda es inválida.");
  const shifts = Math.ceil(estimate.horizonHours / merged.shiftHours);
  const capacity = merged.interventionsPerCrewPerShift * shifts;
  const crewsFor = (cases: number) => Math.ceil(cases / capacity);
  const crews = { low: crewsFor(estimate.low), expected: crewsFor(estimate.expected), high: crewsFor(estimate.high) };
  const scale = (levels: StaffingLevels, factor: number): StaffingLevels => ({ low: Math.ceil(levels.low * factor), expected: Math.ceil(levels.expected * factor), high: Math.ceil(levels.high * factor) });
  const people = scale(crews, merged.peoplePerCrew);
  const flagged = Object.fromEntries(keys.map((key) => {
    const assumed = params[key] === undefined;
    return [key, { value: merged[key], assumed, label: assumed ? STAFFING_ASSUMED_LABEL : "valor ingresado" }];
  })) as Record<keyof StaffingParams, StaffingParam>;
  return {
    horizonHours: estimate.horizonHours,
    shifts,
    params: flagged,
    crews,
    people,
    personShifts: scale(people, shifts),
    formula: "cuadrillas = ceil(intervenciones / (intervenciones por cuadrilla y turno × turnos)); personas = cuadrillas × personas por cuadrilla",
    assumptions: [
      `Los valores por defecto son provisorios y no oficiales: cada uno es un ${STAFFING_ASSUMED_LABEL}.`,
      "Se supone que las intervenciones se reparten parejo entre los turnos del horizonte; si se concentran en pocas horas hacen falta más cuadrillas simultáneas.",
      "No contempla traslados, descansos, vehículos ni otras emergencias que compiten por las mismas cuadrillas.",
    ],
  };
}
