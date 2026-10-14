import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRisk } from "../src/lib/risk";
import { buildParte, buildRecomendaciones } from "../src/lib/recomendaciones";
import type { Estado } from "../src/lib/estado";
import type { Kpis } from "../src/lib/kpis";
import type { Predicciones } from "../src/lib/predicciones";

test("resumen y sugerencias no declaran calma sin datos", () => {
  const estado: Estado = { riesgo: assessRisk(null, null), rio: null, lluvia: null, caudal: null, clima: null, fallas: [{ fuente: "ina", mensaje: "Consulta no disponible", en: new Date().toISOString() }] };
  const kpis: Kpis = { rio: null, aguasArriba: [], red: null, lluvia: null, reportes: null, fallas: [], generadoEn: new Date().toISOString() };
  const predicciones: Predicciones = { porDia: [], anegamientos: null, lluvia: null, rio: null, fallas: [], consultas: {}, vigencia: { modelosCalculados: "", defensaCivilHasta: "", lluviaHistoricaHasta: 2025, ultimaMedicionRio: null }, generadoEn: new Date().toISOString() };
  const insumos = { estado, kpis, predicciones };
  assert.equal(buildRecomendaciones(insumos).some((r) => r.id === "calma-preventivo"), false);
  const texto = buildParte(insumos).texto;
  assert.match(texto, /evaluación incompleta/);
  assert.match(texto, /No se pudieron consultar los reportes/);
  assert.match(texto, /Las estimaciones son orientativas/);
  assert.doesNotMatch(texto, /sin riesgo|No hay aportes/);
});
