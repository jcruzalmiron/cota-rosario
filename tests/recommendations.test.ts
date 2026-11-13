import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRisk } from "../src/lib/risk";
import { buildSituationReport, buildRecommendations } from "../src/lib/recommendations";
import type { Status } from "../src/lib/status";
import type { Kpis } from "../src/lib/kpis";
import type { Predictions } from "../src/lib/predictions";

test("summary and suggestions never declare calm without data", () => {
  const status: Status = { risk: assessRisk(null, null), river: null, rain: null, discharge: null, weather: null, alerts: null, streams: null, failures: [{ source: "ina", message: "Consulta no disponible", at: new Date().toISOString() }] };
  const kpis: Kpis = { river: null, upstream: [], network: null, rain: null, reports: null, failures: [], generatedAt: new Date().toISOString() };
  const predictions: Predictions = { byDay: [], flooding: null, rain: null, river: null, failures: [], fetches: {}, validity: { modelsComputedAt: "", civilDefenseUntil: "", historicalRainUntil: 2025, lastRiverReading: null }, generatedAt: new Date().toISOString() };
  const inputs = { status, kpis, predictions };
  assert.equal(buildRecommendations(inputs).some((r) => r.id === "calma-preventivo"), false);
  const text = buildSituationReport(inputs).text;
  assert.match(text, /evaluación incompleta/);
  assert.match(text, /No se pudieron consultar los reportes/);
  assert.match(text, /Las estimaciones son orientativas/);
  assert.doesNotMatch(text, /sin riesgo|No hay aportes/);
});
