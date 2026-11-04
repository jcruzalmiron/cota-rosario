import { test } from "node:test";
import assert from "node:assert/strict";
import { IncidentService, summaryToCsv } from "../src/domain/incidents";
import { ingresoCompleto, jefe, operador, setup, T0 } from "./helpers";

async function ctx() {
  const { db, clock } = await setup();
  return { clock, incidents: new IncidentService(db, clock) };
}

test("O1: filtros de bandeja, orden por prioridad y paginación con total", async () => {
  const { clock, incidents } = await ctx();
  await incidents.create(operador, { ...ingresoCompleto, priority: 3 });
  clock.advanceMinutes(5);
  await incidents.create(operador, { ...ingresoCompleto, category: "rescate", priority: 1 });
  clock.advanceMinutes(5);
  const sinLugar = (await incidents.create(operador, { origin: "radio", category: "rescate" })).incident;

  const all = await incidents.list(operador);
  assert.equal(all.total, 3);
  assert.equal(all.items[0].priority_confirmed, 1, "prioridad confirmada primero");
  assert.equal(all.items.at(-1)!.id, sinLugar.id, "sin prioridad al final");
  assert.equal((await incidents.list(operador, { category: "rescate" })).total, 2);
  assert.equal((await incidents.list(operador, { priority: 3 })).total, 1);
  assert.deepEqual((await incidents.list(operador, { withoutLocation: true })).items.map((i) => i.id), [sinLugar.id]);
  assert.equal((await incidents.list(operador, { from: new Date(T0.getTime() + 4 * 60_000) })).total, 2);
  const page = await incidents.list(operador, { limit: 1, offset: 1 });
  assert.deepEqual([page.items.length, page.total], [1, 3]);
  assert.equal("phone" in page.items[0], false, "la bandeja no expone contacto");
});

test("O1: 'abiertos' excluye cerrados y marca reabiertos", async () => {
  const { incidents } = await ctx();
  const a = (await incidents.create(operador, ingresoCompleto)).incident;
  const b = (await incidents.create(operador, ingresoCompleto)).incident;
  await incidents.transition(operador, a.id, 1, "en_revision", { reason: "toma" });
  await incidents.transition(operador, a.id, 2, "cerrado", { reason: "resuelto" });
  await incidents.transition(operador, b.id, 1, "en_revision", { reason: "toma" });
  await incidents.transition(operador, b.id, 2, "cerrado", { reason: "falsa alarma" });
  await incidents.transition(jefe, b.id, 3, "en_revision", { reason: "nueva llamada" });
  const open = await incidents.list(operador, { status: "abiertos" });
  assert.deepEqual(open.items.map((i) => [i.id, i.reopened]), [[b.id, true]]);
});

test("O1: resumen incluye reabiertos, sin ubicación, antigüedad y categorías; CSV sin datos personales", async () => {
  const { clock, incidents } = await ctx();
  const a = (await incidents.create(operador, ingresoCompleto)).incident;
  await incidents.create(operador, { origin: "radio", category: "rescate", callerName: "Persona de prueba" });
  await incidents.transition(operador, a.id, 1, "en_revision", { reason: "toma" });
  await incidents.transition(operador, a.id, 2, "cerrado", { reason: "resuelto" });
  await incidents.transition(jefe, a.id, 3, "en_revision", { reason: "reapertura" });
  clock.advanceMinutes(90);
  const s = await incidents.summary(operador, T0, clock.now());
  assert.equal(s.received, 2);
  assert.equal(s.closed, 1);
  assert.equal(s.reopened, 1);
  assert.equal(s.pendingAtCut, 2);
  assert.equal(s.pendingWithoutLocation, 1);
  assert.equal(s.oldestPendingMin, 90);
  assert.deepEqual(s.byCategory.map((c) => c.category).sort(), ["incendio_estructural", "rescate"]);
  const csv = summaryToCsv(s);
  assert.match(csv, /^indicador,valor\n/);
  assert.match(csv, /pendientes sin ubicación,1/);
  assert.doesNotMatch(csv, /Persona de prueba|341/);
});

test("O1: tomar un caso nuevo no exige motivo; cerrar y reabrir sí", async () => {
  const { incidents } = await ctx();
  const a = (await incidents.create(operador, ingresoCompleto)).incident;
  await incidents.transition(operador, a.id, 1, "en_revision");
  await assert.rejects(incidents.transition(operador, a.id, 2, "cerrado"), /motivo/);
  await incidents.transition(operador, a.id, 2, "cerrado", { reason: "resuelto" });
  await assert.rejects(incidents.transition(jefe, a.id, 3, "en_revision"), /motivo/);
});
