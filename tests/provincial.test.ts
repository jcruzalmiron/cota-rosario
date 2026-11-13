import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { alertsFromResponse, streamFromStation, streamsFromResponse } from "../src/lib/provincial";

// Respuestas reales del 13/11/2026 (11:37 de Argentina). El listado de arroyos está recortado, sin alterar valores.
const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const ALERTS = load("provincial-alertas-2026-11-13.json");
const STREAMS = load("provincial-parana-2026-11-13.json");
const NOW = Date.parse("2026-11-13T11:40:00-03:00");

type Raw = Record<string, unknown>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
/** Copia de la respuesta real con las alertas reemplazadas. Las alertas con Rosario son de prueba: ese día no había ninguna. */
function withAlerts(alerts: Raw[]): Raw {
  return { ...clone(ALERTS), alertas: alerts };
}
function alert(overrides: Raw): Raw {
  return { ...clone(ALERTS.alertas[2]), ...overrides };
}
const station = (id: string | number): Raw => clone(STREAMS.otros.find((item: Raw) => item.id === id));

test("the real snapshot has no Rosario alert: empty list, not a failure", () => {
  const out = alertsFromResponse(ALERTS, NOW);
  assert.deepEqual(out.items, []);
  // De las siete alertas reales, la de General López vigente hasta las 11:55 sigue activa y todas las demás también.
  assert.equal(out.provinceCount, 7);
  assert.equal(out.smnUpdatedAt, "2026-11-13T10:56:00-03:00");
  assert.equal(out.updatedAt, "2026-11-13T11:35:46-03:00");
  assert.match(out.attribution, /Servicio Meteorológico Nacional, vía Gobierno de Santa Fe/);
});

test("a response with no alerts at all is an empty list, not a failure", () => {
  const out = alertsFromResponse(withAlerts([]), NOW);
  assert.deepEqual(out.items, []);
  assert.equal(out.provinceCount, 0);
});

test("only alerts that reach the Rosario department are listed, ignoring accents and case", () => {
  const out = alertsFromResponse(withAlerts([
    alert({ departamentos: ["Caseros", "ROSARIO "] }),
    alert({ departamentos: ["San Lorenzo"] }),
    alert({ departamentos: ["Villa del Rosario"] }),
    alert({ departamentos: ["Rosário"], nivel: "Naranja" }),
  ]), NOW);
  assert.equal(out.items.length, 2);
  assert.equal(out.provinceCount, 2);
  assert.deepEqual(out.items.map((item) => item.level), ["naranja", "amarilla"]);
  assert.deepEqual(out.items[0].areas, ["Rosário"]);
  const yellow = out.items[1];
  assert.deepEqual(yellow.areas, ["Caseros", "ROSARIO"]);
  assert.equal(yellow.event, "Tormentas");
  assert.equal(yellow.from, "2026-11-13T12:00:00-03:00");
  assert.equal(yellow.until, "2026-11-13T23:59:59-03:00");
  assert.equal(yellow.issuedAt, "2026-11-13T08:21:56-03:00");
  assert.equal(yellow.shortTerm, false);
  assert.ok(yellow.instructions.length > 0);
});

test("expired alerts are dropped, including when the cached response is read later", () => {
  const data = withAlerts([
    alert({ departamentos: ["Rosario"], desde: "2026-11-13T09:00:00-03:00", hasta: "2026-11-13T11:00:00-03:00" }),
    alert({ departamentos: ["Rosario"], desde: "2026-11-13T09:55:00-03:00", hasta: "2026-11-13T11:55:00-03:00", corto_plazo: true }),
    alert({ departamentos: ["Caseros"], desde: "2026-11-13T09:00:00-03:00", hasta: "2026-11-13T11:00:00-03:00" }),
  ]);
  const out = alertsFromResponse(data, NOW);
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].shortTerm, true);
  assert.equal(out.items[0].current, true);
  assert.equal(out.provinceCount, 0);
  assert.deepEqual(alertsFromResponse(data, NOW + 20 * 60_000).items, []);
});

test("current alerts go first, then by severity", () => {
  const rosario = { departamentos: ["Rosario"] };
  const out = alertsFromResponse(withAlerts([
    alert({ ...rosario, nivel: "roja", desde: "2026-11-13T18:00:00-03:00", hasta: "2026-11-14T06:00:00-03:00" }),
    alert({ ...rosario, nivel: "amarilla", desde: "2026-11-13T08:00:00-03:00", hasta: "2026-11-13T20:00:00-03:00" }),
    alert({ ...rosario, nivel: "naranja", desde: "2026-11-13T15:00:00-03:00", hasta: "2026-11-13T21:00:00-03:00" }),
    alert({ ...rosario, nivel: "roja", desde: "2026-11-13T10:00:00-03:00", hasta: "2026-11-13T13:00:00-03:00" }),
    alert({ ...rosario, nivel: "naranja", desde: "2026-11-13T10:00:00-03:00", hasta: "2026-11-13T13:00:00-03:00" }),
  ]), NOW);
  assert.deepEqual(out.items.map((item) => [item.current, item.level]), [[true, "roja"], [true, "naranja"], [true, "amarilla"], [false, "roja"], [false, "naranja"]]);
});

test("alert times in UTC are normalised to Argentina time", () => {
  const out = alertsFromResponse(withAlerts([alert({ departamentos: ["Rosario"], desde: "2026-11-13T15:00:00Z", hasta: "2026-11-14T02:59:59.000Z", emitida: "sin fecha" })]), NOW);
  assert.equal(out.items[0].from, "2026-11-13T12:00:00-03:00");
  assert.equal(out.items[0].until, "2026-11-13T23:59:59-03:00");
  assert.equal(out.items[0].issuedAt, null);
});

test("a malformed alerts payload is a failure, never «no alerts»", () => {
  const broken: unknown[] = [
    null,
    "<html>503</html>",
    [],
    {},
    { ...clone(ALERTS), estado: "error" },
    { ...clone(ALERTS), alertas: undefined },
    { ...clone(ALERTS), alertas: {} },
    { ...clone(ALERTS), actualizado: undefined },
    withAlerts([alert({ nivel: "verde" })]),
    withAlerts([alert({ departamentos: "Rosario" })]),
    withAlerts([alert({ departamentos: [], localidades: [] })]),
    withAlerts([alert({ hasta: "2026-11-13 23:59:59" })]),
    withAlerts([alert({ hasta: undefined })]),
    withAlerts([alert({ evento: "" })]),
    withAlerts([null as unknown as Raw]),
  ];
  for (const data of broken) assert.throws(() => alertsFromResponse(data, NOW), /Alertas del SMN/, JSON.stringify(data)?.slice(0, 80));
});

test("an alerts listing the province stopped updating is a failure", () => {
  assert.throws(() => alertsFromResponse(ALERTS, NOW + 7 * 3_600_000), /fuera de vigencia/);
  assert.throws(() => alertsFromResponse(ALERTS, NOW - 3_600_000), /fuera de vigencia/);
});

test("Ludueña and Saladillo stations are selected by stream name", () => {
  const out = streamsFromResponse(STREAMS, NOW);
  assert.deepEqual(out.items.map((item) => `${item.stream} · ${item.place}`), [
    "Arroyo Ludueña · Club Logaritmo",
    "Arroyo Ludueña · Avenida de Circunvalación",
    "Arroyo Saladillo · Piñero",
    "Arroyo Saladillo · Arroyo Candelaria",
    "Arroyo Saladillo · Arminda, Ruta Provincial 26 S",
    "Arroyo Saladillo · Villada",
  ]);
  assert.equal(out.updatedAt, "2026-11-13T11:10:12-03:00");
  const logaritmo = out.items[0];
  assert.deepEqual({ ...logaritmo, series: logaritmo.series.length }, { id: "rh-53", stream: "Arroyo Ludueña", place: "Club Logaritmo", heightM: 0.01, at: "2026-11-13T12:00:00-03:00", trend: "steady", alertM: null, series: 8, source: "Recursos Hídricos Santa Fe", stale: false });
  assert.deepEqual(logaritmo.series[0], { at: "2026-11-06T12:00:00-03:00", m: 0.02 });
  assert.equal(out.items[1].trend, "falling");
});

test("alert thresholds appear only where the source reports them", () => {
  const byPlace = Object.fromEntries(streamsFromResponse(STREAMS, NOW).items.map((item) => [item.place, item.alertM]));
  assert.deepEqual(byPlace, { "Club Logaritmo": null, "Avenida de Circunvalación": null, "Piñero": 4.82, "Arroyo Candelaria": 4.63, "Arminda, Ruta Provincial 26 S": null, "Villada": 1.92 });
});

test("`niveles` as object, empty array or missing is normalised", () => {
  const carcarana = station(2204);
  assert.deepEqual(carcarana.niveles, []);
  assert.equal(streamFromStation(carcarana, NOW)?.alertM, null);
  const leyes = station(2833);
  assert.equal("niveles" in leyes, false);
  assert.equal(streamFromStation(leyes, NOW)?.alertM, null);
  assert.equal(streamFromStation(station("rh-36"), NOW)?.alertM, 4.82);
  for (const niveles of [null, "4.82", [4.82], { alerta: "4.82" }, { alerta: 0 }, { alerta: Number.NaN }]) {
    assert.equal(streamFromStation({ ...station("rh-36"), niveles }, NOW)?.alertM, null);
  }
});

test("readings in UTC («Z») and in -03:00 are both read as the same instant in Argentina time", () => {
  const leyes = streamFromStation(station(2833), NOW);
  assert.equal(station(2833).fecha, "2026-11-13T13:00:00Z");
  assert.equal(leyes?.at, "2026-11-13T10:00:00-03:00");
  assert.equal(leyes?.source, "INA");
  assert.equal(leyes?.trend, "rising");
  assert.deepEqual(leyes?.series[0], { at: "2026-11-05T00:00:00-03:00", m: 7.21 });
  assert.equal(streamFromStation({ ...station("rh-53"), fecha: "2026-11-13T15:00:00Z" }, NOW + 4 * 3_600_000)?.at, "2026-11-13T12:00:00-03:00");
  // Sin serie: la estación se conserva con la lista vacía.
  assert.deepEqual(streamFromStation(station(7236), NOW)?.series, []);
});

test("a reading older than 36 hours is flagged as stale", () => {
  const at = Date.parse("2026-11-13T12:00:00-03:00");
  assert.equal(streamFromStation(station("rh-53"), at + 36 * 3_600_000)?.stale, false);
  assert.equal(streamFromStation(station("rh-53"), at + 36 * 3_600_000 + 1)?.stale, true);
  assert.ok(streamsFromResponse(STREAMS, at + 48 * 3_600_000).items.every((item) => item.stale));
});

test("a station without height, time or known origin is left out instead of guessed", () => {
  for (const patch of [{ altura: null }, { altura: "0.47" }, { fecha: "13/11/2026 12:00" }, { fecha: "2026-11-13T12:00:00" }, { fuente: "otra" }, { rio: "" }]) {
    assert.equal(streamFromStation({ ...station("rh-37"), ...patch }, NOW), null, JSON.stringify(patch));
  }
  assert.equal(streamFromStation({ ...station("rh-37"), tendencia: "desconocida" }, NOW)?.trend, null);
  const partial = clone(STREAMS);
  partial.otros.find((item: Raw) => item.id === "rh-37").altura = null;
  assert.equal(streamsFromResponse(partial, NOW).items.length, 5);
});

test("a homonymous stream outside the Rosario basins is not taken", () => {
  const data = clone(STREAMS);
  data.otros.push({ ...station("rh-36"), id: "rh-999", rio: "Arroyo Saladillo Dulce", lat: -30.9, lng: -60.6 });
  assert.equal(streamsFromResponse(data, NOW).items.some((item) => item.id === "rh-999"), false);
});

test("a malformed streams payload is a failure, never «normal»", () => {
  const noStreams = clone(STREAMS);
  noStreams.otros = noStreams.otros.filter((item: Raw) => !/Ludue|Saladillo/.test(String(item.rio)));
  const allBroken = clone(STREAMS);
  for (const item of allBroken.otros) item.altura = null;
  const broken: unknown[] = [null, "<html>", [], {}, { ...clone(STREAMS), estado: "error" }, { ...clone(STREAMS), otros: undefined }, { ...clone(STREAMS), otros: {} }, { ...clone(STREAMS), otros: [] }, noStreams, allBroken];
  for (const data of broken) assert.throws(() => streamsFromResponse(data, NOW), /Arroyos Ludueña y Saladillo/, JSON.stringify(data)?.slice(0, 80));
});
