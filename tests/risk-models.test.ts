import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRisk, riskLabel } from "../src/lib/risk";
import type { RiverSnapshot } from "../src/lib/river";
import type { RainSnapshot } from "../src/lib/rain";
import { expectedCases, districtExpectations, splitByDay, type PoissonModel } from "../src/lib/forecast/poisson";
import modelos from "../public/data/modelos.json";

function rain(mm = 0): RainSnapshot { return { horas: [], acumulado24h: mm, picoVentana: { milimetros: mm, desde: "2026-10-13T13:00-03:00", hasta: "2026-10-13T14:00-03:00" }, consultadoEn: "2026-10-13T16:00Z" }; }
function river(alerta: number | null = 5): RiverSnapshot { return { estacion: { nombre: "Rosario", rio: "Paraná", metros: 3, fecha: "2026-10-13T00:00Z", tendencia: "crece", estado: "", alerta, evacuacion: 5.25, aguasBajas: 2, lat: -32.95, lon: -60.64 }, serie: [], margenHastaAlerta: 2, red: [], consultadoEn: "2026-10-13T16:00Z" }; }

test("ausencia total y parcial no se representan como normal", () => {
  const empty = assessRisk(null, null);
  assert.equal(empty.nivel, null);
  assert.equal(empty.sinDatos, true);
  assert.ok(empty.zonas.every((z) => z.nivel === null));
  assert.equal(assessRisk(river(), null).nivel, null);
  assert.equal(assessRisk(null, rain()).nivel, null);
  assert.equal(riskLabel(null), "Evaluación incompleta");
});

test("se conserva una señal elevada aunque falte el otro factor", () => {
  const partial = assessRisk(null, rain(26));
  assert.equal(partial.nivel, "alerta");
  assert.equal(partial.incompleto, true);
  assert.equal(assessRisk(river(), rain()).nivel, "normal");
  const weighted = assessRisk(null, rain(15));
  assert.equal(weighted.zonas.find((zone) => zone.zona === "A")?.nivel, "atencion");
  assert.equal(weighted.zonas.find((zone) => zone.zona === "1")?.nivel, null);
});

test("umbrales ausentes o inválidos no son normales", () => {
  assert.equal(assessRisk(river(null), rain()).nivel, null);
  assert.equal(assessRisk(river(0), rain()).nivel, null);
  assert.equal(assessRisk(river(NaN), rain()).nivel, null);
  assert.equal(assessRisk(river(), { ...rain(), picoVentana: null }).nivel, null);
});

test("repartos ilustrativos conservan el total redondeado y no inventan probabilidades", () => {
  const model = modelos.anegamientos as PoissonModel;
  for (const total of [0, 0.1, 1.2, 17.3, 99.9]) {
    const districts = districtExpectations(model, total);
    const days = splitByDay(model, total, Array.from({ length: 7 }, (_, i) => ({ max2h: i, total: i * 3 })));
    assert.equal(Math.round(districts.reduce((sum, d) => sum + d.esperados, 0) * 10), Math.round(total * 10));
    assert.equal(Math.round(days.reduce((sum, d) => sum + d, 0) * 10), Math.round(total * 10));
    assert.ok(districts.every((d) => d.probabilidadAlMenosUno === null));
  }
});

test("el modelo rechaza escenarios fuera de su rango numérico", () => {
  const model = modelos.anegamientos as PoissonModel;
  assert.throws(() => expectedCases(model, { total: 1e308, max2h: 1e308 }, 7));
});
