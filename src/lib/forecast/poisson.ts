export interface PoissonCandidate {
  variables: string[];
  maeValidacion: number;
  coeficientesNoNegativos: boolean;
}

export interface PoissonModel {
  formula: string;
  variablesUsadas: string[];
  candidatos: PoissonCandidate[];
  coeficientes: { intercepto: number; max2h: number; total: number };
  n: number;
  pseudoR2: number;
  validacionCruzada: { maeModelo: number; maeMedia: number };
  diasPorMes: number;
  participacionDistrito: Record<string, number>;
  entrenamiento: { mes: string; casos: number; max2h: number; total: number; predicho: number }[];
}

export interface RainFeatures {
  max2h: number;
  total: number;
}

export interface DistrictExpectation {
  distrito: string;
  esperados: number;
  probabilidadAlMenosUno: number | null;
}

const ROUNDING = 10;

export function expectedCases(model: PoissonModel, lluvia: RainFeatures, dias: number): number {
  if (![lluvia.max2h, lluvia.total, dias].every((value) => Number.isFinite(value) && value >= 0) || !(model.diasPorMes > 0)) throw new Error("Entradas inválidas para el escenario.");
  const { intercepto, max2h, total } = model.coeficientes;
  const monthly = Math.exp(intercepto + max2h * lluvia.max2h + total * lluvia.total);
  const units = Math.round(monthly * (dias / model.diasPorMes) * ROUNDING);
  if (!Number.isSafeInteger(units)) throw new Error("El escenario está fuera del rango numérico del modelo.");
  return units / ROUNDING;
}

export function splitByDay(model: PoissonModel, total: number, dias: RainFeatures[]): number[] {
  const { max2h, total: totalCoef } = model.coeficientes;
  const scores = dias.map((dia) => max2h * dia.max2h + totalCoef * dia.total);
  const max = Math.max(...scores);
  return allocate(total, scores.map((score) => Math.exp(score - max)));
}

export function districtExpectations(model: PoissonModel, ciudad: number): DistrictExpectation[] {
  const entries = Object.entries(model.participacionDistrito);
  const amounts = allocate(ciudad, entries.map(([, weight]) => weight));
  return entries
    .map(([distrito], i) => {
      const esperados = amounts[i];
      // Monthly validation does not calibrate weekly probabilities by district.
      return { distrito, esperados, probabilidadAlMenosUno: null };
    })
    .sort((a, b) => b.esperados - a.esperados);
}

function allocate(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total) || total < 0 || weights.some((weight) => !Number.isFinite(weight) || weight < 0) || !Number.isFinite(sum) || sum <= 0) throw new Error("El escenario está fuera del rango numérico del modelo.");
  const units = Math.round(total * ROUNDING);
  if (!Number.isSafeInteger(units)) throw new Error("El escenario excede el rango de cálculo.");
  const exact = weights.map((weight) => units * weight / sum);
  const rounded = exact.map(Math.floor);
  const order = exact.map((value, i) => ({ i, remainder: value - rounded[i] })).sort((a, b) => b.remainder - a.remainder);
  const missing = units - rounded.reduce((a, b) => a + b, 0);
  for (let i = 0; i < missing; i++) rounded[order[i % order.length].i]++;
  return rounded.map((value) => value / ROUNDING);
}
