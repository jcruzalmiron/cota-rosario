import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { alertsFromResponse, streamsFromResponse, type AlertsSnapshot, type WeatherAlert } from "../src/lib/provincial";
import type { RainSnapshot } from "../src/lib/rain";
import { rainLine, residentAnswer, riverLine, streamLines, whenLabel } from "../src/lib/residents";
import { assessRisk } from "../src/lib/risk";
import type { RiverSnapshot } from "../src/lib/river";

const NOW = Date.parse("2026-11-13T15:00:00Z");
const BANNED = /datos consultados|evaluación parcial|umbral estimado|grado 0|exposición|señal|open-meteo|glofas/i;

function river(meters: number, trend = "crece"): RiverSnapshot {
  const station = { name: "Rosario", river: "PARANA", meters, date: "2026-11-13T03:00:00Z", trend, status: "normal", alert: 5, evacuation: 5.25, lowWater: 1.64, lat: -32.94, lon: -60.63 };
  return { station, series: [], marginToAlert: 5 - meters, network: [], fetchedAt: "2026-11-13T14:59:00Z" };
}

function rain(peakMm: number): RainSnapshot {
  const hours = Array.from({ length: 48 }, (_, index) => ({ hour: `2026-11-${index < 12 ? "13" : index < 36 ? "14" : "15"}T${String((index + 12) % 24).padStart(2, "0")}:00-03:00`, millimeters: 0, probability: 50 }));
  hours[18].millimeters = peakMm / 2;
  hours[19].millimeters = peakMm / 2;
  return { hours, accumulated24h: peakMm, peakWindow: { millimeters: peakMm, from: hours[18].hour, until: hours[19].hour }, fetchedAt: "2026-11-13T14:59:00Z" };
}

function alerts(items: WeatherAlert[]): AlertsSnapshot {
  return { items, provinceCount: 0, smnUpdatedAt: null, updatedAt: "2026-11-13T11:47:00-03:00", attribution: "SMN", fetchedAt: "2026-11-13T14:59:00Z" };
}

const ORANGE: WeatherAlert = { level: "naranja", event: "Tormentas", description: "", from: "2026-11-13T09:00:00-03:00", until: "2026-11-13T21:00:00-03:00", issuedAt: null, shortTerm: false, current: true, instructions: [], areas: ["Rosario"] };

function answerFor(riverSnapshot: RiverSnapshot | null, rainSnapshot: RainSnapshot | null, alertSnapshot: AlertsSnapshot | null) {
  const risk = assessRisk(riverSnapshot, rainSnapshot);
  return residentAnswer({ risk, river: riverSnapshot, rain: rainSnapshot, alerts: alertSnapshot, now: NOW });
}

test("with everything below reference the answer is calm and says why", () => {
  const answer = answerFor(river(3.2, "baja"), rain(0), alerts([]));
  assert.equal(answer.tone, "calm");
  assert.equal(answer.headline, "Hoy no hace falta que hagas nada");
  assert.match(answer.why, /No se espera lluvia fuerte/);
  assert.match(answer.why, /1,80 m por debajo/);
  assert.deepEqual(answer.actions, ["zone", "report"]);
});

test("missing data is never read as calm", () => {
  const noRiver = answerFor(null, rain(0), alerts([]));
  assert.equal(noRiver.tone, "unknown");
  assert.match(noRiver.why, /No tenemos el dato del río ahora; no podemos asegurar que esté todo bien/);
  const nothing = answerFor(null, null, null);
  assert.equal(nothing.tone, "unknown");
  assert.match(nothing.why, /el dato del río ni el pronóstico de lluvia/);
  const calmWithoutAlerts = answerFor(river(3.2), rain(0), null);
  assert.equal(calmWithoutAlerts.tone, "calm");
  assert.match(calmWithoutAlerts.why, /No pudimos revisar las alertas oficiales/);
});

test("risk leads with its cause and the call button appears only when it is serious", () => {
  const watch = answerFor(river(4.53), rain(22.6), alerts([]));
  assert.equal(watch.tone, "watch");
  assert.match(watch.why, /^Se espera lluvia fuerte mañana a las 06:00\./);
  assert.match(watch.why, /menos de medio metro de su nivel de alerta y sigue subiendo/);
  assert.ok(!watch.actions.includes("call"));
  const critical = answerFor(river(5.4), rain(0), alerts([]));
  assert.equal(critical.tone, "critical");
  assert.equal(critical.actions[0], "call");
  assert.ok(!/No se espera/.test(critical.why));
});

test("an official SMN alert raises the answer even if the rest is calm or missing", () => {
  const calmButAlert = answerFor(river(3.2), rain(0), alerts([ORANGE]));
  assert.equal(calmButAlert.tone, "alert");
  assert.match(calmButAlert.why, /^Rige una alerta naranja oficial por tormentas\./);
  const upcoming = answerFor(null, null, alerts([{ ...ORANGE, level: "amarilla", current: false, from: "2026-11-14T03:00:00-03:00" }]));
  assert.equal(upcoming.tone, "watch");
  assert.match(upcoming.why, /empieza mañana a las 03:00/);
  assert.match(upcoming.why, /No tenemos/);
});

test("no answer, tip or line uses the banned jargon", () => {
  const cases = [answerFor(river(3.2), rain(0), alerts([])), answerFor(null, null, null), answerFor(river(4.6), rain(22), alerts([ORANGE])), answerFor(river(5.1), rain(27), null), answerFor(river(5.4), rain(31), null)];
  for (const answer of cases) {
    assert.ok(answer.actions.length >= 1 && answer.actions.length <= 3);
    for (const text of [answer.headline, answer.why, ...answer.tips]) {
      assert.ok(!BANNED.test(text), text);
    }
  }
  const risk = assessRisk(null, null);
  for (const line of [riverLine(risk, null, NOW), rainLine(risk, null, NOW), ...streamLines(null, NOW)]) {
    assert.equal(line.tone, "missing");
    assert.equal(line.freshness, null);
    assert.ok(!BANNED.test(line.meaning), line.meaning);
  }
});

test("river and rain lines carry value, meaning and freshness", () => {
  const riverSnapshot = river(4.53);
  const rainSnapshot = rain(22.6);
  const risk = assessRisk(riverSnapshot, rainSnapshot);
  const riverRow = riverLine(risk, riverSnapshot, NOW);
  assert.equal(riverRow.value, "4,53 m · sube");
  assert.equal(riverRow.freshness, "medido hace 12 h");
  assert.equal(riverRow.tone, "watch");
  const rainRow = rainLine(risk, rainSnapshot, NOW);
  assert.equal(rainRow.value, "22,6 mm en 24 h");
  assert.match(rainRow.meaning, /mañana a las 06:00/);
  assert.equal(rainRow.freshness, "pronóstico de hace 1 min");
});

test("stream lines come from the saved provincial response: one per stream, with its reading time", () => {
  const fixture: unknown = JSON.parse(readFileSync(path.join(process.cwd(), "tests", "fixtures", "provincial-parana-2026-11-13.json"), "utf8"));
  const now = Date.parse("2026-11-13T15:00:00Z");
  const lines = streamLines(streamsFromResponse(fixture, now), now);
  assert.deepEqual(lines.map((line) => line.name).sort(), ["Arroyo Ludueña", "Arroyo Saladillo"]);
  for (const line of lines) {
    assert.match(line.value, /^\d+,\d{2} m/);
    assert.match(line.freshness ?? "", /^medido /);
    assert.notEqual(line.tone, "missing");
  }
  const old = streamLines(streamsFromResponse(fixture, now + 3 * 86_400_000), now + 3 * 86_400_000);
  assert.ok(old.every((line) => line.tone === "missing" && line.value === ""));
});

test("alerts fixture parses and whenLabel names today, tomorrow and later days", () => {
  const fixture: unknown = JSON.parse(readFileSync(path.join(process.cwd(), "tests", "fixtures", "provincial-alertas-2026-11-13.json"), "utf8"));
  assert.ok(Array.isArray((fixture as { alertas: unknown[] }).alertas));
  assert.equal(typeof alertsFromResponse, "function");
  assert.equal(whenLabel("2026-11-13T18:00:00-03:00", NOW), "hoy a las 18:00");
  assert.equal(whenLabel("2026-11-14T06:00-03:00", NOW), "mañana a las 06:00");
  assert.equal(whenLabel("2026-11-16T06:00:00-03:00", NOW), "el 16/11 a las 06:00");
  assert.equal(whenLabel("nada", NOW), "en las próximas horas");
});
