import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRisk } from "../src/lib/risk";
import { sourceSignals } from "../src/lib/placeSignals";
import type { RainSnapshot } from "../src/lib/rain";
import type { RiverSnapshot } from "../src/lib/river";

const NOW = new Date("2026-11-04T18:00:00Z");

function river(meters: number): RiverSnapshot {
  const station = { name: "Rosario", river: "Paraná", meters, date: "2026-11-04T09:00:00-03:00", trend: "crece", status: "", alert: 5, evacuation: 5.3, lowWater: 1.6, lat: -32.9, lon: -60.6 };
  return { station, series: [], marginToAlert: 5 - meters, network: [], fetchedAt: NOW.toISOString() };
}

function rain(peak: number, fetchedAt = NOW.toISOString()): RainSnapshot {
  return { hours: [], accumulated24h: peak, peakWindow: { millimeters: peak, from: fetchedAt, until: fetchedAt }, fetchedAt };
}

const byId = (signals: ReturnType<typeof sourceSignals>) => Object.fromEntries(signals.map((s) => [s.id, s]));

test("un Paraná crítico figura como señal elevada pero no colorea las zonas", () => {
  const r = river(5.5);
  const p = rain(0);
  const s = byId(sourceSignals(assessRisk(r, p, { now: NOW }), r, p));
  assert.equal(s.river.status, "elevada");
  assert.equal(s.river.colorsZones, false);
  assert.equal(s.rain.status, "sin_senales_elevadas");
  assert.equal(s.rain.colorsZones, true);
});

test("lluvia vencida y río ausente se distinguen de una lectura baja", () => {
  const p = rain(0, "2026-11-04T15:00:00Z");
  const s = byId(sourceSignals(assessRisk(null, p, { now: NOW }), null, p));
  assert.equal(s.rain.status, "vencida");
  assert.equal(s.rain.value, "—");
  assert.equal(s.river.status, "ausente");
  assert.equal(s.river.at, null);
});

test("la estación del Ludueña se muestra como no conectada, sin valor ni hora", () => {
  const s = byId(sourceSignals(assessRisk(null, null, { now: NOW }), null, null));
  assert.equal(s["ludueña"].status, "no_conectada");
  assert.equal(s["ludueña"].at, null);
  assert.equal(s["ludueña"].colorsZones, false);
});
