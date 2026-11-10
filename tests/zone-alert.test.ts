import { test } from "node:test";
import assert from "node:assert/strict";
import type { FeatureCollection, Polygon } from "geojson";
import { gradeLevel, gradeZone, rainGrade, rainWindows, timelinePeak, zoneSensitivity, zoneTimeline, type ZoneSensitivity } from "../src/lib/zoneAlert";
import { timelineSentence } from "../src/components/GradeTimeline";
import { assessRisk, simulate } from "../src/lib/risk";
import { reportsByZone } from "../src/lib/zoneReports";
import type { Report } from "../src/lib/reportTypes";
import type { RainSnapshot } from "../src/lib/rain";

const SENSITIVE: ZoneSensitivity = { mediumOrHighShare: 0.99, coverage: "suficiente", moreSensitive: true };
const PLAIN: ZoneSensitivity = { mediumOrHighShare: 0.3, coverage: "suficiente", moreSensitive: false };
const none = { riverLevel: null, sensitivity: PLAIN, reports: null };

test("la lluvia da la base con seis pasos y respeta los umbrales orientativos previos", () => {
  assert.deepEqual([0, 7.5, 15, 25, 30].map(rainGrade), [0, 1, 2, 3, 5]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((grade) => gradeLevel(grade as 0)), ["normal", "watch", "watch", "alert", "alert", "critical"]);
});

test("el Paraná solo nunca pinta una zona; con lluvia de atención suma un paso como supuesto", () => {
  assert.equal(gradeZone({ ...none, rainPeakMm: 0, riverLevel: "critical" }).grade, 0);
  assert.equal(gradeZone({ ...none, rainPeakMm: 10, riverLevel: "critical" }).grade, 1, "con lluvia leve no se amplifica");
  const amplified = gradeZone({ ...none, rainPeakMm: 16, riverLevel: "alert" });
  assert.equal(amplified.grade, 3);
  assert.equal(amplified.contributions.find((item) => item.source === "rio")?.kind, "supuesto");
  assert.equal(gradeZone({ ...none, rainPeakMm: 16, riverLevel: "watch" }).grade, 2, "el río en atención no suma");
});

test("la sensibilidad del mapa municipal sólo suma cuando ya hay lluvia", () => {
  assert.equal(gradeZone({ ...none, sensitivity: SENSITIVE, rainPeakMm: 0 }).grade, 0);
  assert.equal(gradeZone({ ...none, sensitivity: SENSITIVE, rainPeakMm: 8 }).grade, 2);
  assert.equal(gradeZone({ ...none, sensitivity: SENSITIVE, rainPeakMm: 31, riverLevel: "critical" }).grade, 5, "tope en 5");
});

test("los reportes vecinales activos pintan aun sin lluvia y los fuertes suben un paso", () => {
  const one = gradeZone({ ...none, rainPeakMm: 0, reports: { count: 1, homes: 0, confirmations: 0 } });
  assert.equal(one.grade, 1);
  assert.equal(one.contributions.at(-1)?.kind, "observacion_vecinal");
  assert.equal(gradeZone({ ...none, rainPeakMm: 0, reports: { count: 1, homes: 1, confirmations: 2 } }).grade, 2);
  assert.equal(gradeZone({ ...none, rainPeakMm: 26, reports: { count: 3, homes: 0, confirmations: 0 } }).grade, 4);
  assert.equal(gradeZone({ ...none, rainPeakMm: null, reports: { count: 2, homes: 0, confirmations: 0 } }).grade, 1, "sin pronóstico, sólo reportes");
  assert.equal(gradeZone({ ...none, rainPeakMm: null }).grade, null, "sin pronóstico ni reportes queda gris");
});

test("la sensibilidad sale del mapa municipal y no se marca con cobertura insuficiente", () => {
  assert.equal(zoneSensitivity("A")?.moreSensitive, true);
  assert.equal(zoneSensitivity("2")?.moreSensitive, false);
  assert.equal(zoneSensitivity("D")?.coverage, "insuficiente");
  assert.equal(zoneSensitivity("D")?.moreSensitive, false);
});

test("assessRisk aplica reportes por zona y el simulador usa las mismas reglas sin reportes", () => {
  const rain: RainSnapshot = { hours: [], accumulated24h: 0, peakWindow: { millimeters: 0, from: "x", until: "x" }, fetchedAt: "2026-11-04T13:00:00.000Z" };
  const risk = assessRisk(null, rain, { reportsByZone: { "2": { count: 1, homes: 1, confirmations: 0 } } });
  assert.equal(risk.zones.find((zone) => zone.zone === "2")?.grade, 2);
  assert.equal(risk.zones.find((zone) => zone.zone === "3")?.grade, 0);
  assert.match(risk.reason, /grado más alto hoy es atención/, "el titular no contradice al mapa");
  const scenario = simulate({ meters: 5.2, alert: 5, evacuation: 5.3, rainPeakMm: 16 });
  assert.equal(scenario.zones.find((zone) => zone.zone === "A")?.grade, 4, "lluvia de atención + zona sensible + Paraná en alerta");
  assert.equal(scenario.zones.find((zone) => zone.zone === "3")?.grade, 3);
});

test("los reportes se agrupan por la zona que los contiene; los de afuera no cuentan", () => {
  const square: Polygon = { type: "Polygon", coordinates: [[[-60.7, -33], [-60.6, -33], [-60.6, -32.9], [-60.7, -32.9], [-60.7, -33]]] };
  const collection: FeatureCollection<Polygon, Record<string, string>> = { type: "FeatureCollection", features: [{ type: "Feature", geometry: square, properties: { zone: "2" } }] };
  const report = (lat: number, lon: number, type: Report["type"], confirmations = 0): Report => ({ id: `${lat}${lon}${type}`, lat, lon, type, description: "", createdAt: "2026-11-04T12:00:00.000Z", confirmations });
  const grouped = reportsByZone([report(-32.95, -60.65, "home", 2), report(-32.95, -60.66, "street"), report(-32.5, -60.65, "home")], collection);
  assert.deepEqual(grouped, { "2": { count: 2, homes: 1, confirmations: 2 } });
});

test("la línea de tiempo dice cuándo sube y cuándo baja, y su máximo coincide con el grado de la zona", () => {
  const start = Date.parse("2026-11-04T03:00:00.000Z");
  const mm = [0, 0, 0, 9, 9, 1, 0, 0];
  const hours = mm.map((millimeters, index) => ({ hour: new Date(start + index * 3_600_000).toISOString(), millimeters, probability: null }));
  const windows = rainWindows(hours);
  assert.deepEqual(windows.map((w) => w.millimeters), [0, 0, 9, 18, 10, 1, 0]);
  const steps = zoneTimeline(windows, { riverLevel: null, sensitivity: SENSITIVE, reports: null });
  assert.deepEqual(steps.map((s) => s.grade), [0, 0, 2, 3, 2, 0, 0]);
  const peak = timelinePeak(steps)!;
  assert.deepEqual([peak.grade, peak.from, peak.until, peak.flat], [3, hours[3].hour, hours[4].hour, false]);
  assert.match(timelineSentence(steps)!, /^Sube a alerta el .*; baja desde el /);
  assert.equal(timelineSentence(zoneTimeline(rainWindows(hours.slice(0, 3)), { riverLevel: null, sensitivity: PLAIN, reports: null })), "Sin cambios previstos en 48 h.");
  const rain: RainSnapshot = { hours, accumulated24h: 19, peakWindow: { millimeters: 18, from: hours[3].hour, until: hours[4].hour }, fetchedAt: hours[0].hour };
  for (const zone of assessRisk(null, rain).zones) assert.equal(timelinePeak(zone.timeline)?.grade, zone.grade);
  assert.deepEqual(assessRisk(null, null).zones[0].timeline, []);
});
