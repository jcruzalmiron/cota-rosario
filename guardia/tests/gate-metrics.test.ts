import { test } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenError, NotFoundError, ValidationError } from "../src/db/db";
import { GateService, qrPayload, verifyQr } from "../src/domain/gate";
import { GuardService } from "../src/domain/guard";
import { IncidentService } from "../src/domain/incidents";
import { JobRunner } from "../src/domain/jobs";
import { breaches, durationStats, MetricsService, percentile, DEFINITIONS } from "../src/domain/metrics";
import { ingresoCompleto, jefe, operador, operadorOtroCuartel, setup, T0 } from "./helpers";

const SECRET = "secreto-de-prueba";

async function ctx() {
  const { db, clock } = await setup();
  const gate = new GateService(db, clock, SECRET);
  await gate.addVehicle(jefe, "m-1", "Autobomba de prueba");
  await gate.addVehicle(jefe, "M-2", "Cisterna de prueba");
  const gateId = await gate.addGate(jefe, "P1", "Portón principal");
  return { db, clock, gate, gateId };
}

test("O4: QR firmado identifica el móvil; alterado, ajeno o de otro cuartel se rechaza", () => {
  const payload = qrPayload(SECRET, "rosario", "M-1");
  assert.deepEqual(verifyQr(SECRET, payload), { organizationId: "rosario", vehicleCode: "M-1" });
  assert.equal(verifyQr("otro-secreto", payload), null);
  assert.equal(verifyQr(SECRET, payload.replace("GB1.", "GB1.x")), null);
  assert.equal(verifyQr(SECRET, "https://ejemplo.test/qr"), null);
  assert.doesNotMatch(payload, /Autobomba/);
});

test("O4: salida y entrada alternan; doble escaneo se concilia como duplicado", async () => {
  const { clock, gate, gateId } = await ctx();
  const qr = qrPayload(SECRET, "rosario", "M-1");
  const a = await gate.record(operador, { gateId, source: "qr", qr, sourceKey: "s1" });
  assert.deepEqual([a.movement.direction, a.movement.status], ["salida", "confirmado"]);
  clock.advanceMinutes(1);
  const dup = await gate.record(operador, { gateId, source: "qr", qr, sourceKey: "s2" });
  assert.deepEqual([dup.movement.direction, dup.movement.status, dup.movement.duplicate_of], ["salida", "duplicado", a.movement.id]);
  const replay = await gate.record(operador, { gateId, source: "qr", qr, sourceKey: "s2" });
  assert.equal(replay.replayed, true);
  clock.advanceMinutes(40);
  const back = await gate.record(operador, { gateId, source: "qr", qr, sourceKey: "s3" });
  assert.deepEqual([back.movement.direction, back.movement.status], ["entrada", "confirmado"]);
});

test("O4: carga manual demorada se ordena por hora del hecho; futura o muy vieja se rechaza", async () => {
  const { clock, gate, gateId } = await ctx();
  clock.advanceMinutes(60);
  const late = await gate.record(operador, { gateId, source: "manual", vehicleCode: "m-2", sourceKey: "m1", occurredAt: new Date(T0.getTime() + 15 * 60_000) });
  assert.equal(new Date(late.movement.occurred_at).toISOString(), new Date(T0.getTime() + 15 * 60_000).toISOString());
  assert.ok(new Date(late.movement.received_at) > new Date(late.movement.occurred_at));
  await assert.rejects(gate.record(operador, { gateId, source: "manual", vehicleCode: "M-2", sourceKey: "m2", occurredAt: new Date(clock.now().getTime() + 10 * 60_000) }), ValidationError);
  await assert.rejects(gate.record(operador, { gateId, source: "manual", vehicleCode: "M-2", sourceKey: "m3", occurredAt: new Date(clock.now().getTime() - 25 * 3_600_000) }), /demasiado antigua/);
  await assert.rejects(gate.record(operador, { gateId, source: "manual", vehicleCode: "X-9", sourceKey: "m4" }), NotFoundError);
});

test("O4: QR de otro cuartel no registra", async () => {
  const { gate, gateId } = await ctx();
  await assert.rejects(gate.record(operador, { gateId, source: "qr", qr: qrPayload(SECRET, "otro", "M-1"), sourceKey: "x" }), /otro cuartel/);
  await assert.rejects(gate.record(operadorOtroCuartel, { gateId, source: "manual", vehicleCode: "M-1", sourceKey: "y" }), NotFoundError);
});

test("O4: corrección de jefatura conserva el original con actor y motivo", async () => {
  const { db, gate, gateId } = await ctx();
  const { movement } = await gate.record(operador, { gateId, source: "manual", vehicleCode: "M-1", sourceKey: "k" });
  await assert.rejects(gate.correct(operador, movement.id, { direction: "entrada" }, "error de sentido"), ForbiddenError);
  await assert.rejects(gate.correct(jefe, movement.id, { direction: "entrada" }, " "), ValidationError);
  const fixed = await gate.correct(jefe, movement.id, { direction: "entrada" }, "el móvil volvía");
  assert.deepEqual([fixed!.direction, fixed!.corrected_from, fixed!.operator], ["entrada", movement.id, "jefe-1"]);
  const original = (await db.query("SELECT status, reason FROM vehicle_movement WHERE id=$1", [movement.id])).rows[0];
  assert.deepEqual([original.status, original.reason], ["corregido", "el móvil volvía"]);
  await assert.rejects(gate.correct(jefe, movement.id, { discard: true }, "otra vez"), /ya fue corregido/);
});

test("O4: la salida se vincula al despacho sólo si hay uno inequívoco", async () => {
  const { db, clock, gate, gateId } = await ctx();
  const incidents = new IncidentService(db, clock);
  const guard = new GuardService(db, clock);
  const { incident } = await incidents.create(operador, ingresoCompleto);
  const { dispatch } = await guard.dispatch(operador, { incidentId: incident.id, mobileCode: "M-1", idempotencyKey: "d1" });
  clock.advanceMinutes(2);
  const exit = await gate.record(operador, { gateId, source: "manual", vehicleCode: "M-1", sourceKey: "e1" });
  assert.equal(exit.movement.dispatch_id, dispatch.id);
  const other = await gate.record(operador, { gateId, source: "manual", vehicleCode: "M-2", sourceKey: "e2" });
  assert.equal(other.movement.dispatch_id, null, "sin despacho del móvil no se inventa vínculo");
  const tl = await gate.timeline(operador, T0, clock.now());
  assert.equal(tl.find((m) => m.id === exit.movement.id)!.incident_location, ingresoCompleto.locationText);
});

test("O5: percentiles y exclusiones explícitas", () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([1, 2, 3, 4], 50), 2);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
  const m = durationStats(DEFINITIONS.despachoArribo, [12, null, 18, -1, 20]);
  assert.deepEqual([m.n, m.excluded, m.median, m.max], [3, 2, 18, 20]);
  assert.deepEqual(breaches([m], []), [], "sin umbrales acordados no hay alertas");
  assert.equal(breaches([m], [{ key: "despacho_arribo", field: "median", above: 15 }])[0].value, 18);
});

test("O5: métricas concilian con los eventos de origen", async () => {
  const { db, clock, gate, gateId } = await ctx();
  const incidents = new IncidentService(db, clock);
  const guard = new GuardService(db, clock);
  const runner = new JobRunner(db, clock, { guard_alert_check: guard.alertHandler() });
  const metrics = new MetricsService(db);
  const { incident } = await incidents.create(operador, ingresoCompleto);
  const a = (await guard.dispatch(operador, { incidentId: incident.id, mobileCode: "M-1", idempotencyKey: "a" })).dispatch;
  const b = (await guard.dispatch(operador, { incidentId: incident.id, mobileCode: "M-2", idempotencyKey: "b" })).dispatch;
  await gate.record(operador, { gateId, source: "manual", vehicleCode: "M-1", sourceKey: "g1" });
  clock.advanceMinutes(4);
  await guard.recordUpdate(operador, { dispatchId: a.id, kind: "novedad", channel: "radio", sourceKey: "a1", body: "en camino" });
  clock.advanceMinutes(8); // minuto 12
  await runner.runOnce(); // aviso para M-2 (sin novedad)
  await guard.recordUpdate(operador, { dispatchId: a.id, kind: "arribo", channel: "radio", sourceKey: "a2" });
  clock.advanceMinutes(3);
  const [alert] = (await db.query<{ id: number }>("SELECT id FROM guard_alert")).rows;
  await guard.acknowledgeAlert(operador, alert.id);

  const { metrics: ms } = await metrics.compute(jefe, T0, clock.now());
  const get = (k: string) => ms.find((m) => m.key === k)! as never as Record<string, unknown>;
  assert.deepEqual([get("despacho_arribo").n, get("despacho_arribo").excluded, get("despacho_arribo").median], [1, 1, 12]);
  assert.deepEqual([get("primera_novedad").n, get("primera_novedad").median], [1, 4]);
  assert.deepEqual([get("avisos_acuse").n, get("avisos_acuse").median], [1, 3], "emitido al minuto 12, acusado al 15");
  assert.deepEqual([get("panoramas_pendientes").value, get("panoramas_pendientes").of], [1, 1]);
  assert.deepEqual([get("salidas_sin_despacho").value, get("salidas_sin_despacho").of], [0, 1]);
  void b;
});
