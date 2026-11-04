import { test } from "node:test";
import assert from "node:assert/strict";
import { ConflictError, ForbiddenError, ValidationError } from "../src/db/db";
import { GuardService, currentAlertWindow, DEFAULT_ALERT_RULE } from "../src/domain/guard";
import { IncidentService } from "../src/domain/incidents";
import { JobRunner } from "../src/domain/jobs";
import { ingresoCompleto, jefe, operador, operador2, operadorOtroCuartel, setup, T0 } from "./helpers";

async function ctx() {
  const { db, clock } = await setup();
  const incidents = new IncidentService(db, clock);
  const guard = new GuardService(db, clock);
  const runner = new JobRunner(db, clock, { guard_alert_check: guard.alertHandler() });
  return { db, clock, incidents, guard, runner };
}

const openAlerts = async (db: Awaited<ReturnType<typeof ctx>>["db"]) =>
  (await db.query<{ id: number; resolved_at: Date | null }>("SELECT id, resolved_at FROM guard_alert ORDER BY id")).rows;

test("O2: llamada incompleta queda guardada y el despacho devuelve faltantes", async () => {
  const { incidents, guard } = await ctx();
  const { incident, issues } = await incidents.create(operador, { origin: "llamada", locationText: "Calle de Prueba 1234" });
  assert.equal(incident.intake_complete, false);
  assert.deepEqual(issues.map((i) => i.field), ["denunciante", "telefono"]);
  await assert.rejects(
    guard.dispatch(operador, { incidentId: incident.id, mobileCode: "M-1", idempotencyKey: "k1" }),
    (e: ValidationError) => e instanceof ValidationError && e.fields.map((f) => f.field).join() === "denunciante,telefono",
  );
});

test("O2: excepción de jefatura queda auditada y habilita el despacho", async () => {
  const { db, incidents, guard } = await ctx();
  const { incident } = await incidents.create(operador, { origin: "llamada", anonymous: true, locationText: "Avenida A y Calle B" });
  await assert.rejects(incidents.authorizeIntakeException(operador, incident.id, "llamada cortada"), ForbiddenError);
  await incidents.authorizeIntakeException(jefe, incident.id, "llamada cortada, sin teléfono");
  const { dispatch } = await guard.dispatch(operador, { incidentId: incident.id, mobileCode: "M-1", idempotencyKey: "k1" });
  assert.equal(dispatch.status, "activo");
  const exc = (await db.query("SELECT completed_at FROM intake_exception")).rows[0];
  assert.equal(exc.completed_at, null, "la tarea de completado sigue abierta");
});

test("O2: reintento de confirmación no despacha dos veces", async () => {
  const { db, incidents, guard } = await ctx();
  const { incident } = await incidents.create(operador, ingresoCompleto);
  const a = await guard.dispatch(operador, { incidentId: incident.id, mobileCode: "M-1", idempotencyKey: "same" });
  const b = await guard.dispatch(operador, { incidentId: incident.id, mobileCode: "M-1", idempotencyKey: "same" });
  assert.equal(a.dispatch.id, b.dispatch.id);
  assert.equal(b.replayed, true);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM dispatch")).rows[0].n, 1);
  const inc = await incidents.get(operador, incident.id);
  assert.equal(inc.incident.status, "asignado");
});

test("O1: dos operadores editando el mismo incidente reciben conflicto de versión", async () => {
  const { incidents } = await ctx();
  const { incident } = await incidents.create(operador, ingresoCompleto);
  await incidents.transition(operador, incident.id, 1, "en_revision", { reason: "toma de caso" });
  await assert.rejects(incidents.transition(operador2, incident.id, 1, "en_revision", { reason: "x" }), ConflictError);
});

test("O1: otro cuartel no ve el detalle", async () => {
  const { incidents } = await ctx();
  const { incident } = await incidents.create(operador, ingresoCompleto);
  await assert.rejects(incidents.get(operadorOtroCuartel, incident.id), ForbiddenError);
  assert.equal((await incidents.list(operadorOtroCuartel)).total, 0);
});

test("O1: cierre y reapertura cuentan correctamente a distintas fechas de corte", async () => {
  const { clock, incidents } = await ctx();
  const { incident } = await incidents.create(operador, ingresoCompleto);
  await incidents.transition(operador, incident.id, 1, "en_revision", { reason: "revisión" });
  clock.advanceMinutes(60);
  await incidents.transition(operador, incident.id, 2, "cerrado", { reason: "falsa alarma" });
  const tClosed = clock.now();
  clock.advanceMinutes(60);
  await incidents.transition(jefe, incident.id, 3, "en_revision", { reason: "reapertura por nueva llamada" });
  const atClose = await incidents.summary(operador, T0, tClosed);
  assert.deepEqual([atClose.received, atClose.closed, atClose.pendingAtCut], [1, 1, 0]);
  const later = await incidents.summary(operador, T0, clock.now());
  assert.deepEqual([later.closed, later.pendingAtCut], [1, 1]);
});

test("O3: regla pura del límite de 10 minutos", () => {
  const w = currentAlertWindow({ dispatched_at: T0, last_valid_update_at: null, status: "activo" }, DEFAULT_ALERT_RULE)!;
  assert.equal(w.dueAt.getTime() - T0.getTime(), 10 * 60_000);
  assert.equal(currentAlertWindow({ dispatched_at: T0, last_valid_update_at: T0, status: "activo" }, DEFAULT_ALERT_RULE), null);
  assert.equal(
    currentAlertWindow({ dispatched_at: T0, last_valid_update_at: T0, status: "activo" }, { ...DEFAULT_ALERT_RULE, followUpMin: 15 })!.dueAt.getTime() - T0.getTime(),
    15 * 60_000,
  );
});

test("O3: sin novedad el aviso sale a los 10 minutos, ni antes ni dos veces", async () => {
  const { db, clock, incidents, guard, runner } = await ctx();
  const { incident } = await incidents.create(operador, ingresoCompleto);
  await guard.dispatch(operador, { incidentId: incident.id, mobileCode: "M-1", idempotencyKey: "k" });
  clock.advanceMinutes(9);
  await runner.runOnce();
  assert.equal((await openAlerts(db)).length, 0);
  clock.advanceMinutes(1);
  await runner.runOnce();
  assert.equal((await openAlerts(db)).length, 1);
  clock.advanceMinutes(5);
  await runner.runOnce();
  assert.equal((await openAlerts(db)).length, 1, "sin duplicar");
  const board = await guard.board(operador);
  assert.equal(board[0].elapsedMin, 15);
  assert.ok(board[0].open_alert_id);
  assert.equal(board[0].eta, null, "ETA pendiente sin base validada");
});

test("O3: novedad antes del límite evita el aviso; llegada tardía de radio no retrocede el reloj", async () => {
  const { db, clock, incidents, guard, runner } = await ctx();
  const rule = { ...DEFAULT_ALERT_RULE, followUpMin: 15 };
  const g = new GuardService(db, clock, rule);
  const r = new JobRunner(db, clock, { guard_alert_check: g.alertHandler() });
  const { incident } = await incidents.create(operador, ingresoCompleto);
  const { dispatch } = await g.dispatch(operador, { incidentId: incident.id, mobileCode: "M-1", idempotencyKey: "k" });
  clock.advanceMinutes(8);
  await g.recordUpdate(operador, { dispatchId: dispatch.id, kind: "novedad", channel: "radio", sourceKey: "u1" });
  // Novedad observada a los 3 min pero recibida después: no debe reiniciar el reloj hacia atrás.
  await g.recordUpdate(operador, { dispatchId: dispatch.id, kind: "novedad", channel: "radio", sourceKey: "u0", observedAt: new Date(T0.getTime() + 3 * 60_000) });
  clock.advanceMinutes(4); // minuto 12
  await r.runOnce();
  assert.equal((await openAlerts(db)).length, 0);
  clock.advanceMinutes(11); // minuto 23 = 8 + 15
  await r.runOnce();
  assert.equal((await openAlerts(db)).length, 1, "seguimiento desde la última novedad válida");
  void guard; void runner;
});

test("O3: varios móviles, reenvío duplicado, arribo sin panorama y resolución por novedad", async () => {
  const { db, clock, incidents, guard, runner } = await ctx();
  const { incident } = await incidents.create(operador, ingresoCompleto);
  const a = (await guard.dispatch(operador, { incidentId: incident.id, mobileCode: "M-1", idempotencyKey: "a" })).dispatch;
  const b = (await guard.dispatch(operador, { incidentId: incident.id, mobileCode: "M-2", idempotencyKey: "b" })).dispatch;
  clock.advanceMinutes(6);
  const arr = await guard.recordUpdate(operador, { dispatchId: a.id, kind: "arribo", channel: "radio", sourceKey: "a-arr" });
  assert.equal(arr.dispatch.panorama_pending, true, "arribo sin panorama queda pendiente");
  const again = await guard.recordUpdate(operador, { dispatchId: a.id, kind: "arribo", channel: "radio", sourceKey: "a-arr" });
  assert.equal(again.replayed, true);
  clock.advanceMinutes(4);
  await runner.runOnce();
  const alerts = (await db.query<{ dispatch_id: string }>("SELECT dispatch_id FROM guard_alert")).rows;
  assert.deepEqual(alerts.map((x) => x.dispatch_id), [b.id], "sólo el móvil sin novedad");
  await guard.recordUpdate(operador, { dispatchId: b.id, kind: "novedad", channel: "radio", sourceKey: "b-1", body: "en camino" });
  assert.notEqual((await openAlerts(db))[0].resolved_at, null);
  await guard.recordUpdate(operador, { dispatchId: a.id, kind: "panorama", channel: "radio", sourceKey: "a-pan", body: "humo en planta baja" });
  const board = await guard.board(operador);
  assert.equal(board.find((x) => x.id === a.id)!.panorama_pending, false);
});

test("O3: worker caído — la reserva vence y otro worker emite el aviso pendiente", async () => {
  const { db, clock, incidents, guard } = await ctx();
  const crashing = new JobRunner(db, clock, { guard_alert_check: async () => { throw new Error("no debería correr"); } }, 30_000);
  const { incident } = await incidents.create(operador, ingresoCompleto);
  await guard.dispatch(operador, { incidentId: incident.id, mobileCode: "M-1", idempotencyKey: "k" });
  clock.advanceMinutes(10);
  const claimed = await crashing.claim(); // reserva y "se cae" sin terminar
  assert.equal(claimed.length, 1);
  const healthy = new JobRunner(db, clock, { guard_alert_check: guard.alertHandler() });
  assert.equal((await healthy.runOnce()).done, 0, "la reserva sigue vigente");
  clock.advanceMinutes(1);
  assert.equal((await healthy.runOnce()).done, 1);
  assert.equal((await openAlerts(db)).length, 1);
});

test("O3: retorno cierra el reloj y el acuse se registra aparte", async () => {
  const { db, clock, incidents, guard, runner } = await ctx();
  const { incident } = await incidents.create(operador, ingresoCompleto);
  const { dispatch } = await guard.dispatch(operador, { incidentId: incident.id, mobileCode: "M-1", idempotencyKey: "k" });
  clock.advanceMinutes(10);
  await runner.runOnce();
  const [alert] = await openAlerts(db);
  assert.equal(await guard.acknowledgeAlert(operador, alert.id), true);
  assert.equal(await guard.acknowledgeAlert(operadorOtroCuartel, alert.id), false);
  const ack = (await db.query("SELECT acked_by, resolved_at FROM guard_alert")).rows[0];
  assert.equal(ack.acked_by, "op-1");
  assert.equal(ack.resolved_at, null, "acusar no es una novedad del móvil");
  await guard.recordUpdate(operador, { dispatchId: dispatch.id, kind: "retorno", channel: "radio", sourceKey: "ret" });
  clock.advanceMinutes(60);
  await runner.runOnce();
  assert.equal((await guard.board(operador)).length, 0);
  await assert.rejects(guard.recordUpdate(operador, { dispatchId: dispatch.id, kind: "novedad", channel: "radio", sourceKey: "late" }), ValidationError);
});
