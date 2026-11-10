import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRisk, OFFICIAL_ZONES, RAIN_MAX_AGE_MS, SCENARIO_BASIS, simulate, zoneReading } from "../src/lib/risk";
import { placeFacts } from "../src/lib/placeFacts";
import type { Finding } from "../src/lib/lookup";
import type { RiverSnapshot } from "../src/lib/river";
import type { RainSnapshot } from "../src/lib/rain";

const FETCHED = "2026-11-04T13:00:00.000Z";
const NOW = new Date("2026-11-04T13:20:00.000Z");

function rain(mm: number, fetchedAt = FETCHED): RainSnapshot {
  return { hours: [], accumulated24h: mm, peakWindow: { millimeters: mm, from: FETCHED, until: FETCHED }, fetchedAt };
}
function river(meters: number): RiverSnapshot {
  return {
    station: { name: "Rosario", river: "Paraná", meters, date: FETCHED, trend: "crece", status: "", alert: 5, evacuation: 5.3, lowWater: 2, lat: -32.95, lon: -60.64 },
    series: [], marginToAlert: 5 - meters, network: [], fetchedAt: FETCHED,
  };
}

test("C1: una crecida del Paraná por sí sola no pinta las cuencas de los arroyos", () => {
  const r = assessRisk(river(5.6), rain(0), { now: NOW });
  assert.equal(r.level, "critical", "el indicador general sigue mostrando el río");
  assert.equal(r.factors.find((f) => f.id === "river")?.level, "critical");
  for (const zone of r.zones) {
    assert.equal(zone.level, "normal");
    assert.equal(zone.signal.status, "sin_senales_elevadas");
  }
});

test("C1: zona con exposición y sin señal conserva la exposición y muestra ausencia", () => {
  const r = assessRisk(river(5.6), null, { now: NOW });
  assert.deepEqual(r.zones.map((z) => z.zone), [...OFFICIAL_ZONES]);
  for (const zone of r.zones) {
    assert.equal(zone.level, null);
    assert.equal(zone.exposure, "area_inundable_oficial");
    assert.equal(zone.signal.status, "ausente");
    assert.match(zone.basis, /exposición se mantiene/);
  }
});

test("C1: 'sin señales elevadas' (0 mm) se distingue de dato ausente y vencido", () => {
  const zero = assessRisk(river(3), rain(0), { now: NOW }).zones[0];
  const missing = assessRisk(river(3), null, { now: NOW }).zones[0];
  const stale = assessRisk(river(3), rain(40, "2026-11-04T11:00:00.000Z"), { now: NOW }).zones[0];
  assert.deepEqual([zero.signal.status, zero.level], ["sin_senales_elevadas", "normal"]);
  assert.deepEqual([missing.signal.status, missing.level], ["ausente", null]);
  assert.deepEqual([stale.signal.status, stale.level], ["vencida", null]);
  assert.notEqual(zero.basis, missing.basis);
  assert.notEqual(missing.basis, stale.basis);
});

test("C1: un pronóstico vencido no cuenta como normal ni como elevado", () => {
  const atLimit = assessRisk(river(3), rain(26, new Date(NOW.getTime() - RAIN_MAX_AGE_MS).toISOString()), { now: NOW });
  assert.equal(atLimit.zones[0].level, "alert", "en el límite sigue vigente");
  const stale = assessRisk(river(3), rain(26, new Date(NOW.getTime() - RAIN_MAX_AGE_MS - 1).toISOString()), { now: NOW });
  assert.equal(stale.level, null, "río normal + lluvia vencida = evaluación incompleta");
  assert.equal(stale.incomplete, true);
  assert.match(stale.reason, /sin lluvia concentrada/);
  assert.equal(stale.factors.find((f) => f.id === "rain")?.measured, "dato vencido");
});

test("C1: lluvia elevada pinta todas las zonas desde la misma base regional, con su fuente y ámbito", () => {
  const r = assessRisk(null, rain(26), { now: NOW });
  assert.ok(r.zones.every((z) => z.level === "alert" && z.signal.scope === "regional" && z.signal.at === FETCHED));
  assert.ok(r.zones.every((z) => z.contributions[0].source === "lluvia" && z.contributions[0].points === 3));
  assert.match(r.zones[0].basis, /pronóstico regional/);
  assert.equal(r.assessedAt, NOW.toISOString());
});

test("C1: el simulador aplica la misma regla y se marca como escenario", () => {
  const s = simulate({ meters: 6, alert: 5, evacuation: 5.3, rainPeakMm: 0 });
  assert.equal(s.river, "critical");
  assert.ok(s.zones.every((z) => z.level === "normal"));
  assert.equal(simulate({ meters: 1, alert: 5, evacuation: 5.3, rainPeakMm: 31 }).zones[0].level, "critical");
  assert.deepEqual(zoneReading(s.zones, "A", true).basis, SCENARIO_BASIS);
  assert.deepEqual([zoneReading(s.zones, " 2 ").level, zoneReading(s.zones, " 2 ").grade, zoneReading(s.zones, " 2 ").basis], ["normal", 0, undefined]);
  assert.deepEqual(zoneReading(s.zones, "Z"), { level: null, grade: null, contributions: [], timeline: [], basis: undefined });
});

test("C1: Mi zona muestra exposición y motivo; fuera del polígono no hereda señal", () => {
  const zones = assessRisk(river(5.6), null, { now: NOW }).zones;
  const base: Omit<Finding, "inside" | "zone"> = { label: "Dirección pública", nearest: null, terrain: null, climateRisk: null, district: null, neighbourhood: null };
  const inside = zoneReading(zones, "A");
  const facts = placeFacts({ ...base, inside: true, zone: "A", level: inside.level, basis: inside.basis }, null);
  const official = facts.find((f) => f.id === "official")!;
  assert.equal(official.verdict, "Zona A");
  assert.equal(official.tone, "watch", "la exposición se sigue señalando sin dato");
  assert.match(official.detail, /Sin señal actual/);
  const outside = placeFacts({ ...base, inside: false, nearest: { zone: "B", meters: 120 } }, null).find((f) => f.id === "official")!;
  assert.deepEqual([outside.verdict, outside.tone], ["Fuera", "neutral"]);
});
