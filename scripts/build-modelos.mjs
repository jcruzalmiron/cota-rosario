import { readFile, writeFile } from "node:fs/promises";

const ARCHIVE_API = "https://archive-api.open-meteo.com/v1/archive";
const ROSARIO = { lat: -32.9468, lon: -60.6393 };
const TIMEZONE = "America/Argentina/Cordoba";
const OUT_DIR = "public/data";
const DEFENSA_CIVIL_FILE = `${OUT_DIR}/defensa-civil.json`;
const CLIMATOLOGY_FROM = 1940;
const DAYS_PER_MONTH = 30.4;
const IRLS_ITERATIONS = 50;
const IRLS_TOLERANCE = 1e-8;
const EULER_MASCHERONI = 0.5772156649;
const RETURN_PERIODS_YEARS = [2, 5, 10, 25, 50, 100];
const DAILY_THRESHOLDS_MM = [20, 30, 50];
const CANDIDATE_FEATURE_SETS = [["total"], ["max2h"], ["max2h", "total"]];
const ALL_FEATURES = ["max2h", "total"];

async function fetchArchive(params) {
  const query = new URLSearchParams({ latitude: String(ROSARIO.lat), longitude: String(ROSARIO.lon), timezone: TIMEZONE, ...params, models: "era5" });
  const response = await fetch(`${ARCHIVE_API}?${query}`);
  if (!response.ok) {
    throw new Error(`Open-Meteo archive devolvió ${response.status}`);
  }
  return response.json();
}

function lastDayOfMonth(mes) {
  const [anio, month] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(anio, month, 0)).getUTCDate()).padStart(2, "0")}`;
}

function monthlyFeatures(hourly) {
  if (!Array.isArray(hourly?.time) || hourly.time.length === 0 || hourly.time.length !== hourly.precipitation?.length || hourly.precipitation.some((mm) => typeof mm !== "number" || !Number.isFinite(mm) || mm < 0)) throw new Error("El archivo horario tiene valores faltantes o inválidos; no se ajusta el modelo con ceros.");
  const byMonth = new Map();
  hourly.time.forEach((hora, index) => {
    const mes = hora.slice(0, 7);
    const mm = hourly.precipitation[index] ?? 0;
    const entry = byMonth.get(mes) ?? { total: 0, max2h: 0, previous: 0 };
    const window = entry.previous + mm;
    byMonth.set(mes, { total: entry.total + mm, max2h: Math.max(entry.max2h, window), previous: mm });
  });
  return Object.fromEntries([...byMonth].map(([mes, { total, max2h }]) => [mes, { total: Number(total.toFixed(1)), max2h: Number(max2h.toFixed(1)) }]));
}

function solve(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    const pivot = a.slice(col).reduce((best, row, index) => (Math.abs(row[col]) > Math.abs(a[best][col]) ? index + col : best), col);
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = 0; row < n; row += 1) {
      if (row !== col) {
        const factor = a[row][col] / a[col][col];
        a[row] = a[row].map((value, k) => value - factor * a[col][k]);
      }
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

function fitPoisson(rows, features) {
  const design = rows.map((row) => [1, ...features.map((feature) => row[feature])]);
  const y = rows.map((row) => row.casos);
  const k = design[0].length;
  let beta = new Array(k).fill(0);
  beta[0] = Math.log(Math.max(1e-3, y.reduce((sum, value) => sum + value, 0) / y.length));
  for (let iteration = 0; iteration < IRLS_ITERATIONS; iteration += 1) {
    const mu = design.map((x) => Math.exp(x.reduce((sum, value, j) => sum + value * beta[j], 0)));
    const gradient = new Array(k).fill(0);
    const hessian = Array.from({ length: k }, () => new Array(k).fill(0));
    design.forEach((x, i) => {
      for (let a = 0; a < k; a += 1) {
        gradient[a] += x[a] * (y[i] - mu[i]);
        for (let b = 0; b < k; b += 1) {
          hessian[a][b] += x[a] * x[b] * mu[i];
        }
      }
    });
    const step = solve(hessian, gradient);
    beta = beta.map((value, j) => value + step[j]);
    if (Math.max(...step.map(Math.abs)) < IRLS_TOLERANCE) {
      break;
    }
  }
  return beta;
}

function predictPoisson(beta, features, row) {
  return Math.exp(beta[0] + features.reduce((sum, feature, j) => sum + beta[j + 1] * row[feature], 0));
}

function evaluateCandidate(rows, features) {
  const beta = fitPoisson(rows, features);
  const looErrors = rows.map((held, index) => {
    const others = rows.filter((_, j) => j !== index);
    return Math.abs(held.casos - predictPoisson(fitPoisson(others, features), features, held));
  });
  return { features, beta, looMae: looErrors.reduce((sum, value) => sum + value, 0) / looErrors.length, plausible: beta.slice(1).every((value) => value >= 0) };
}

function deviance(rows, predict) {
  return 2 * rows.reduce((sum, row) => {
    const mu = predict(row);
    return sum + (row.casos > 0 ? row.casos * Math.log(row.casos / mu) : 0) - (row.casos - mu);
  }, 0);
}

function fitGumbel(maxima) {
  const n = maxima.length;
  const mean = maxima.reduce((sum, value) => sum + value, 0) / n;
  const variance = maxima.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const beta = (Math.sqrt(variance) * Math.sqrt(6)) / Math.PI;
  return { mu: mean - EULER_MASCHERONI * beta, beta, n };
}

function gumbelQuantile({ mu, beta }, returnPeriod) {
  return mu - beta * Math.log(-Math.log(1 - 1 / returnPeriod));
}

const defensaCivil = JSON.parse(await readFile(DEFENSA_CIVIL_FILE, "utf8"));
const meses = defensaCivil.serie.map((entry) => entry.mes);
const [hourlyArchive, dailyArchive] = await Promise.all([
  fetchArchive({ start_date: `${meses[0]}-01`, end_date: lastDayOfMonth(meses[meses.length - 1]), hourly: "precipitation" }),
  fetchArchive({ start_date: `${CLIMATOLOGY_FROM}-01-01`, end_date: `${new Date().getUTCFullYear() - 1}-12-31`, daily: "precipitation_sum" }),
]);

const features = monthlyFeatures(hourlyArchive.hourly);
const rows = defensaCivil.serie.map((entry) => ({ mes: entry.mes, casos: entry.casos, ...features[entry.mes] })).filter((row) => Number.isFinite(row.max2h));
const candidates = CANDIDATE_FEATURE_SETS.map((features) => evaluateCandidate(rows, features));
const chosen = candidates.filter((candidate) => candidate.plausible).sort((a, b) => a.looMae - b.looMae)[0];
if (!chosen) {
  throw new Error("Ningún modelo candidato tiene coeficientes no negativos");
}
const { features: FEATURES, beta, looMae } = chosen;
const coeficientes = Object.fromEntries(ALL_FEATURES.map((feature) => [feature, FEATURES.includes(feature) ? beta[FEATURES.indexOf(feature) + 1] : 0]));
const predict = (row) => predictPoisson(beta, FEATURES, row);
const nullMean = rows.reduce((sum, row) => sum + row.casos, 0) / rows.length;
const devianceModel = deviance(rows, predict);
const devianceNull = deviance(rows, () => nullMean);
const naiveMae = rows.reduce((sum, row) => sum + Math.abs(row.casos - nullMean), 0) / rows.length;

const totalCiudad = Object.values(defensaCivil.distritos).reduce((sum, distrito) => sum + distrito.total, 0);
const participacionDistrito = Object.fromEntries(
  Object.entries(defensaCivil.distritos).map(([distrito, { total }]) => [distrito, Number((total / totalCiudad).toFixed(4))]),
);

const annualMaxima = new Map();
const dailyByMonth = new Map();
dailyArchive.daily.time.forEach((fecha, index) => {
  const mm = dailyArchive.daily.precipitation_sum[index];
  if (mm === null || mm === undefined) {
    return;
  }
  const anio = fecha.slice(0, 4);
  annualMaxima.set(anio, Math.max(annualMaxima.get(anio) ?? 0, mm));
  const month = Number(fecha.slice(5, 7));
  const bucket = dailyByMonth.get(month) ?? { dias: 0, total: 0, sobre: DAILY_THRESHOLDS_MM.map(() => 0) };
  dailyByMonth.set(month, {
    dias: bucket.dias + 1,
    total: bucket.total + mm,
    sobre: bucket.sobre.map((count, t) => count + (mm >= DAILY_THRESHOLDS_MM[t] ? 1 : 0)),
  });
});
const maximosAnuales = [...annualMaxima].map(([anio, mm]) => ({ anio: Number(anio), mm: Number(mm.toFixed(1)) }));
const gumbel = fitGumbel(maximosAnuales.map((entry) => entry.mm));
const climatologiaMensual = [...dailyByMonth]
  .sort((a, b) => a[0] - b[0])
  .map(([mes, bucket]) => ({
    mes,
    mediaMm: Number(((bucket.total / bucket.dias) * DAYS_PER_MONTH).toFixed(1)),
    probabilidadDia: Object.fromEntries(DAILY_THRESHOLDS_MM.map((umbral, t) => [umbral, Number((bucket.sobre[t] / bucket.dias).toFixed(4))])),
  }));

const salida = {
  anegamientos: {
    nombre: "Anegamientos mensuales atendidos por Defensa Civil en función de la lluvia",
    formula: `λ = exp(β0${FEATURES.map((feature, j) => ` + β${j + 1}·${feature}`).join("")}) · días/30,4`,
    variables: { max2h: "mayor acumulado en 2 horas del período, mm", total: "lluvia total del período, mm" },
    variablesUsadas: FEATURES,
    candidatos: candidates.map(({ features, looMae: mae, plausible }) => ({ variables: features, maeValidacion: Number(mae.toFixed(1)), coeficientesNoNegativos: plausible })),
    coeficientes: { intercepto: beta[0], ...coeficientes },
    n: rows.length,
    devianzaNula: Number(devianceNull.toFixed(1)),
    devianza: Number(devianceModel.toFixed(1)),
    pseudoR2: Number((1 - devianceModel / devianceNull).toFixed(3)),
    validacionCruzada: { maeModelo: Number(looMae.toFixed(1)), maeMedia: Number(naiveMae.toFixed(1)) },
    diasPorMes: DAYS_PER_MONTH,
    participacionDistrito,
    entrenamiento: rows.map((row) => ({ ...row, predicho: Number(predict(row).toFixed(1)) })),
    lluvia: { fuente: "Open-Meteo archivo histórico (ERA5), horario", endpoint: ARCHIVE_API },
  },
  lluviaExtrema: {
    nombre: "Máximo diario anual de lluvia, distribución de Gumbel",
    formula: "F(x) = exp(−exp(−(x − μ)/β)) · μ y β por momentos",
    gumbel: { mu: Number(gumbel.mu.toFixed(2)), beta: Number(gumbel.beta.toFixed(2)), n: gumbel.n },
    periodo: { desde: maximosAnuales[0].anio, hasta: maximosAnuales[maximosAnuales.length - 1].anio },
    cuantiles: RETURN_PERIODS_YEARS.map((periodoAnios) => ({ periodoAnios, mm: Number(gumbelQuantile(gumbel, periodoAnios).toFixed(1)) })),
    maximosAnuales,
    umbralesDiarios: DAILY_THRESHOLDS_MM,
    climatologiaMensual,
    fuente: "Open-Meteo archivo histórico (ERA5), diario",
  },
  calculado: new Date().toISOString(),
};
await writeFile(`${OUT_DIR}/modelos.json`, JSON.stringify(salida, null, 2));

console.log(`candidatos: ${candidates.map((c) => `[${c.features.join("+")}] LOO ${c.looMae.toFixed(1)}${c.plausible ? "" : " (coef. negativo)"}`).join(" · ")}`);
console.log(`elegido [${FEATURES.join("+")}] n=${rows.length} · β0 ${beta[0].toFixed(3)} · ${FEATURES.map((f, j) => `β_${f} ${beta[j + 1].toFixed(4)}`).join(" · ")} · pseudo-R² ${salida.anegamientos.pseudoR2} · LOO MAE ${looMae.toFixed(1)} vs media ${naiveMae.toFixed(1)}`);
for (const row of rows.slice().sort((a, b) => b.casos - a.casos).slice(0, 6)) {
  console.log(`  ${row.mes}: ${row.casos} casos · max2h ${row.max2h} mm · total ${row.total} mm · predicho ${predict(row).toFixed(0)}`);
}
console.log(`Gumbel μ ${gumbel.mu.toFixed(1)} β ${gumbel.beta.toFixed(1)} n=${gumbel.n} · cuantiles ${salida.lluviaExtrema.cuantiles.map((q) => `T${q.periodoAnios}=${q.mm}`).join(" ")}`);
console.log("climatología:", climatologiaMensual.map((m) => `${m.mes}:${m.mediaMm}mm/${(m.probabilidadDia[30] * 100).toFixed(1)}%`).join(" "));
