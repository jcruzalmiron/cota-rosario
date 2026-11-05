import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRisk, riskLabel } from "../src/lib/risk";
import type { RiverSnapshot } from "../src/lib/river";
import type { RainSnapshot } from "../src/lib/rain";
import { expectedCases, districtExpectations, splitByDay, type PoissonModel } from "../src/lib/forecast/poisson";
import models from "../public/data/models.json";

function rain(mm = 0): RainSnapshot { return { hours: [], accumulated24h: mm, peakWindow: { millimeters: mm, from: "2026-10-13T13:00-03:00", until: "2026-10-13T14:00-03:00" }, fetchedAt: "2026-10-13T16:00Z" }; }
function river(alert: number | null = 5): RiverSnapshot { return { station: { name: "Rosario", river: "Paraná", meters: 3, date: "2026-10-13T00:00Z", trend: "crece", status: "", alert, evacuation: 5.25, lowWater: 2, lat: -32.95, lon: -60.64 }, series: [], marginToAlert: 2, network: [], fetchedAt: "2026-10-13T16:00Z" }; }

test("total and partial absence are never shown as normal", () => {
  const empty = assessRisk(null, null);
  assert.equal(empty.level, null);
  assert.equal(empty.noData, true);
  assert.ok(empty.zones.every((z) => z.level === null));
  const riverOnly = assessRisk(river(), null);
  assert.equal(riverOnly.level, null);
  assert.match(riverOnly.reason, /sin lluvia concentrada\. Altura del Paraná:/);
  const rainOnly = assessRisk(null, rain());
  assert.equal(rainOnly.level, null);
  assert.match(rainOnly.reason, /sin altura del paraná\. Lluvia concentrada:/);
  assert.equal(riskLabel(null), "Evaluación incompleta");
});

test("an elevated signal is kept even when the other factor is missing", () => {
  const partial = assessRisk(null, rain(26));
  assert.equal(partial.level, "alert");
  assert.equal(partial.incomplete, true);
  assert.equal(assessRisk(river(), rain()).level, "normal");
  // Base regional igual para todas; sube un paso sólo donde el mapa municipal de riesgo climático lo respalda.
  const regional = assessRisk(null, rain(15));
  assert.equal(regional.zones.find((zone) => zone.zone === "A")?.grade, 3);
  assert.equal(regional.zones.find((zone) => zone.zone === "1")?.grade, 2);
  assert.equal(regional.zones.find((zone) => zone.zone === "1")?.level, "watch");
});

test("missing or invalid thresholds are not normal", () => {
  assert.equal(assessRisk(river(null), rain()).level, null);
  assert.equal(assessRisk(river(0), rain()).level, null);
  assert.equal(assessRisk(river(NaN), rain()).level, null);
  assert.equal(assessRisk(river(), { ...rain(), peakWindow: null }).level, null);
});

test("illustrative splits keep the rounded total and invent no probabilities", () => {
  const model = models.flooding as PoissonModel;
  for (const total of [0, 0.1, 1.2, 17.3, 99.9]) {
    const districts = districtExpectations(model, total);
    const days = splitByDay(model, total, Array.from({ length: 7 }, (_, i) => ({ max2h: i, total: i * 3 })));
    assert.equal(Math.round(districts.reduce((sum, d) => sum + d.expected, 0) * 10), Math.round(total * 10));
    assert.equal(Math.round(days.reduce((sum, d) => sum + d, 0) * 10), Math.round(total * 10));
    assert.ok(districts.every((d) => d.probabilityAtLeastOne === null));
  }
});

test("the model rejects scenarios outside its numeric range", () => {
  const model = models.flooding as PoissonModel;
  assert.throws(() => expectedCases(model, { total: 1e308, max2h: 1e308 }, 7));
});
