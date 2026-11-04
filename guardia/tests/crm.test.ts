import { test } from "node:test";
import assert from "node:assert/strict";
import { ConflictError, ForbiddenError } from "../src/db/db";
import { CrmService, followUpDate } from "../src/domain/crm";
import { JobRunner } from "../src/domain/jobs";
import { comercial, operador, setup, T0 } from "./helpers";

async function ctx() {
  const { db, clock } = await setup();
  const crm = new CrmService(db, clock);
  const runner = new JobRunner(db, clock, { crm_reminder: crm.reminderHandler() });
  return { db, clock, crm, runner };
}
const reminders = async (db: Awaited<ReturnType<typeof ctx>>["db"]) =>
  (await db.query<{ due_at: Date }>("SELECT due_at FROM crm_reminder ORDER BY id")).rows;

test("A1: 'volver a llamar en 7 días' vence a las 10:00 de Rosario", () => {
  assert.equal(followUpDate(T0, 7).toISOString(), "2026-11-11T13:00:00.000Z");
  // 23:30 de Rosario (02:30 UTC del día siguiente) sigue contando desde el día local.
  assert.equal(followUpDate(new Date("2026-11-05T02:30:00Z"), 1).toISOString(), "2026-11-05T13:00:00.000Z");
});

test("A1: el recordatorio aparece una vez en el tablero y reprogramar no deja avisos obsoletos", async () => {
  const { db, clock, crm, runner } = await ctx();
  const company = await crm.createCompany(comercial, { name: "Empresa de prueba" });
  const task = await crm.createTask(comercial, { companyId: company, title: "Volver a llamar", dueAt: followUpDate(T0, 7) });
  const { proximas } = await crm.board(comercial);
  assert.equal(proximas.length, 1);
  const moved = await crm.reschedule(comercial, task.id, 1, followUpDate(T0, 10));
  await assert.rejects(crm.reschedule(comercial, task.id, 1, followUpDate(T0, 12)), ConflictError);
  clock.set(followUpDate(T0, 7));
  await runner.runOnce();
  assert.equal((await reminders(db)).length, 0, "el aviso de la fecha vieja no sale");
  clock.set(followUpDate(T0, 10));
  await runner.runOnce();
  await runner.runOnce();
  const fired = await reminders(db);
  assert.equal(fired.length, 1);
  const board = await crm.board(comercial);
  assert.equal(board.vencidas.length, 1);
  assert.equal(board.vencidas[0].reminded, true);
  await crm.complete(comercial, task.id, moved.version, "Confirmó colaboración");
  assert.equal((await crm.board(comercial)).vencidas.length, 0);
});

test("A1: reservas simultáneas respetan capacidad", async () => {
  const { crm } = await ctx();
  const ev = await crm.createEvent(comercial, { name: "Cena anual (prueba)", tableCapacity: 10 });
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, (_, i) => crm.reserve(comercial, { eventId: ev, holderLabel: `Mesa ${i}`, tables: 2 })),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  assert.ok(results.some((r) => r.status === "rejected" && r.reason instanceof ConflictError));
  assert.deepEqual(await crm.eventSummary(comercial, ev), { capacidad: 10, provisoria: 0, confirmada: 10, disponible: 0 });
});

test("A1: reserva provisoria vence y libera capacidad; referencia de pago única", async () => {
  const { clock, crm } = await ctx();
  const ev = await crm.createEvent(comercial, { name: "Cena anual (prueba)", tableCapacity: 3 });
  const prov = await crm.reserve(comercial, { eventId: ev, holderLabel: "Empresa A", tables: 3, provisionalHours: 48 });
  assert.equal(prov.status, "provisoria");
  await assert.rejects(crm.reserve(comercial, { eventId: ev, holderLabel: "Empresa B", tables: 1 }), ConflictError);
  clock.advanceMinutes(49 * 60);
  assert.deepEqual(await crm.eventSummary(comercial, ev), { capacidad: 3, provisoria: 0, confirmada: 0, disponible: 3 });
  await assert.rejects(crm.confirm(comercial, prov.id), /vencida/);
  const b = await crm.reserve(comercial, { eventId: ev, holderLabel: "Empresa B", tables: 1, provisionalHours: 24 });
  const c = await crm.reserve(comercial, { eventId: ev, holderLabel: "Empresa C", tables: 1 });
  await crm.confirm(comercial, b.id, "MP-TEST-001");
  await assert.rejects(crm.confirm(comercial, c.id, "MP-TEST-001"), ConflictError);
});

test("A1: el CRM tiene permisos separados", async () => {
  const { crm } = await ctx();
  await assert.rejects(crm.createCompany(operador, { name: "X" }), ForbiddenError);
  await assert.rejects(crm.board(operador), ForbiddenError);
});
