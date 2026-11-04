import { ConflictError, NotFoundError, ValidationError, type Db, type Queryable } from "../db/db";
import { requireRole, requireSameOrg, type Actor } from "./auth";
import type { Clock } from "./clock";
import { toInstant } from "./extract";
import { cancelJobs, enqueue, type JobHandler } from "./jobs";

/**
 * A1 · CRM de empresas, seguimientos y eventos. Rol propio (`admin_comercial`).
 * No guarda narrativas de intervenciones, datos judicializados ni denunciantes.
 */
export interface TaskRow {
  id: string; company_id: string; title: string; owner: string; due_at: Date;
  status: "pendiente" | "hecha" | "cancelada"; result: string | null; version: number;
}

const reminderKey = (taskId: string, due: Date, channel = "tablero") => `crm:${taskId}:${due.toISOString()}:${channel}`;

/** "Volver a llamar en N días": a las 10:00 de Rosario (la secretaría atiende hasta las 14). */
export function followUpDate(now: Date, days: number, hour = 10): Date {
  return toInstant(new Date(now.getTime() + days * 86_400_000), hour, 0);
}

export class CrmService {
  constructor(private db: Db, private clock: Clock) {}

  private guard(actor: Actor) {
    requireRole(actor, "admin_comercial");
  }

  async createCompany(actor: Actor, input: { name: string; notes?: string }) {
    this.guard(actor);
    if (!input.name.trim()) throw new ValidationError("Falta el nombre de la empresa.");
    const { rows } = await this.db.query<{ id: string }>(
      "INSERT INTO crm_company (organization_id, name, notes, created_at) VALUES ($1,$2,$3,$4) RETURNING id",
      [actor.organizationId, input.name.trim(), input.notes ?? null, this.clock.now()],
    );
    return rows[0].id;
  }

  async addContact(actor: Actor, companyId: string, c: { name: string; role?: string; phone?: string; email?: string }) {
    this.guard(actor);
    await this.companyInOrg(this.db, actor, companyId);
    await this.db.query("INSERT INTO crm_contact (company_id, name, role, phone, email) VALUES ($1,$2,$3,$4,$5)",
      [companyId, c.name, c.role ?? null, c.phone ?? null, c.email ?? null]);
  }

  async logInteraction(actor: Actor, companyId: string, channel: string, summary: string) {
    this.guard(actor);
    await this.companyInOrg(this.db, actor, companyId);
    await this.db.query("INSERT INTO crm_interaction (company_id, at, actor, channel, summary) VALUES ($1,$2,$3,$4,$5)",
      [companyId, this.clock.now(), actor.id, channel, summary]);
  }

  async createTask(actor: Actor, input: { companyId: string; title: string; dueAt: Date; owner?: string }) {
    this.guard(actor);
    return this.db.tx(async (q) => {
      await this.companyInOrg(q, actor, input.companyId);
      const { rows } = await q.query<TaskRow>(
        "INSERT INTO crm_task (company_id, title, owner, due_at, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [input.companyId, input.title, input.owner ?? actor.id, input.dueAt, this.clock.now()],
      );
      const task = rows[0];
      await enqueue(q, "crm_reminder", { taskId: task.id, dueAt: new Date(task.due_at).toISOString() }, reminderKey(task.id, new Date(task.due_at)), new Date(task.due_at));
      return task;
    });
  }

  /** Reprogramar cancela el aviso pendiente anterior y conserva historial. */
  async reschedule(actor: Actor, taskId: string, expectedVersion: number, dueAt: Date, owner?: string) {
    this.guard(actor);
    return this.db.tx(async (q) => {
      const task = await this.lockTask(q, actor, taskId, expectedVersion);
      if (task.status !== "pendiente") throw new ValidationError("Sólo se reprograma una tarea pendiente.");
      const { rows } = await q.query<TaskRow>(
        "UPDATE crm_task SET due_at=$2, owner=COALESCE($3, owner), version=version+1 WHERE id=$1 RETURNING *",
        [taskId, dueAt, owner ?? null],
      );
      const key = reminderKey(taskId, dueAt);
      await cancelJobs(q, `crm:${taskId}:`, key);
      await enqueue(q, "crm_reminder", { taskId, dueAt: dueAt.toISOString() }, key, dueAt);
      await q.query("INSERT INTO crm_interaction (company_id, at, actor, channel, summary) VALUES ($1,$2,$3,'sistema',$4)",
        [task.company_id, this.clock.now(), actor.id, `Tarea "${task.title}" reprogramada de ${new Date(task.due_at).toISOString()} a ${dueAt.toISOString()}`]);
      return rows[0];
    });
  }

  async complete(actor: Actor, taskId: string, expectedVersion: number, result: string) {
    this.guard(actor);
    if (!result.trim()) throw new ValidationError("Registrá el resultado de la gestión.");
    return this.db.tx(async (q) => {
      await this.lockTask(q, actor, taskId, expectedVersion);
      await cancelJobs(q, `crm:${taskId}:`);
      const { rows } = await q.query<TaskRow>(
        "UPDATE crm_task SET status='hecha', result=$2, version=version+1 WHERE id=$1 RETURNING *", [taskId, result]);
      return rows[0];
    });
  }

  /** Tablero: vencidas, próximas (7 días) y avisos emitidos. Es el respaldo si falla un canal. */
  async board(actor: Actor) {
    this.guard(actor);
    const now = this.clock.now();
    const { rows } = await this.db.query<TaskRow & { company: string; reminded: boolean }>(
      `SELECT t.*, c.name AS company, EXISTS (SELECT 1 FROM crm_reminder r WHERE r.task_id=t.id AND r.due_at=t.due_at) AS reminded
       FROM crm_task t JOIN crm_company c ON c.id=t.company_id
       WHERE c.organization_id=$1 AND t.status='pendiente' AND t.due_at <= $2 ORDER BY t.due_at`,
      [actor.organizationId, new Date(now.getTime() + 7 * 86_400_000)],
    );
    return {
      vencidas: rows.filter((t) => new Date(t.due_at) <= now),
      proximas: rows.filter((t) => new Date(t.due_at) > now),
    };
  }

  reminderHandler(): JobHandler {
    return async (job) => {
      const { taskId, dueAt } = job.payload as { taskId: string; dueAt: string };
      const task = (await this.db.query<TaskRow>("SELECT * FROM crm_task WHERE id=$1", [taskId])).rows[0];
      if (!task || task.status !== "pendiente" || new Date(task.due_at).toISOString() !== dueAt) return; // obsoleto
      await this.db.query(
        "INSERT INTO crm_reminder (task_id, due_at, fired_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [taskId, task.due_at, this.clock.now()],
      );
    };
  }

  // ── Eventos y reservas de mesas ─────────────────────────────────────────

  async createEvent(actor: Actor, input: { name: string; startsAt?: Date | null; venue?: string; tableCapacity: number }) {
    this.guard(actor);
    if (!Number.isInteger(input.tableCapacity) || input.tableCapacity < 0) throw new ValidationError("Capacidad inválida.");
    const { rows } = await this.db.query<{ id: string }>(
      "INSERT INTO crm_event (organization_id, name, starts_at, venue, table_capacity, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [actor.organizationId, input.name, input.startsAt ?? null, input.venue ?? null, input.tableCapacity, this.clock.now()],
    );
    return rows[0].id;
  }

  /** Reserva con control de capacidad en transacción (bloqueo del evento). */
  async reserve(actor: Actor, input: { eventId: string; holderLabel: string; tables: number; companyId?: string; provisionalHours?: number }) {
    this.guard(actor);
    if (!Number.isInteger(input.tables) || input.tables <= 0) throw new ValidationError("Cantidad de mesas inválida.");
    const now = this.clock.now();
    return this.db.tx(async (q) => {
      const ev = await this.lockEvent(q, actor, input.eventId);
      await this.expireProvisional(q, input.eventId, now);
      const used = await this.usedTables(q, input.eventId);
      if (used + input.tables > ev.table_capacity) {
        throw new ConflictError(`Sin capacidad: quedan ${ev.table_capacity - used} mesas.`);
      }
      const expires = input.provisionalHours ? new Date(now.getTime() + input.provisionalHours * 3_600_000) : null;
      const { rows } = await q.query<{ id: string; status: string }>(
        `INSERT INTO crm_reservation (event_id, company_id, holder_label, tables, status, expires_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id, status`,
        [input.eventId, input.companyId ?? null, input.holderLabel, input.tables, expires ? "provisoria" : "confirmada", expires, now],
      );
      return rows[0];
    });
  }

  /** Confirmación manual, opcionalmente con referencia de pago única (conciliación por referencia). */
  async confirm(actor: Actor, reservationId: string, paymentRef?: string) {
    this.guard(actor);
    const now = this.clock.now();
    return this.db.tx(async (q) => {
      const r = (await q.query<{ event_id: string; status: string }>(
        "SELECT event_id, status FROM crm_reservation WHERE id=$1", [reservationId])).rows[0];
      if (!r) throw new NotFoundError("Reserva inexistente.");
      await this.lockEvent(q, actor, r.event_id);
      await this.expireProvisional(q, r.event_id, now);
      const fresh = (await q.query<{ status: string }>("SELECT status FROM crm_reservation WHERE id=$1", [reservationId])).rows[0];
      if (fresh.status !== "provisoria" && fresh.status !== "confirmada") {
        throw new ValidationError(`La reserva está ${fresh.status}; cargala de nuevo si hay capacidad.`);
      }
      if (paymentRef) {
        const dup = (await q.query("SELECT id FROM crm_reservation WHERE payment_ref=$1 AND id<>$2", [paymentRef, reservationId])).rows[0];
        if (dup) throw new ConflictError("La referencia de pago ya está asociada a otra reserva.");
      }
      await q.query("UPDATE crm_reservation SET status='confirmada', expires_at=NULL, payment_ref=COALESCE($2,payment_ref), updated_at=$3 WHERE id=$1",
        [reservationId, paymentRef ?? null, now]);
    });
  }

  async cancelReservation(actor: Actor, reservationId: string) {
    this.guard(actor);
    await this.db.tx(async (q) => {
      const r = (await q.query<{ event_id: string }>("SELECT event_id FROM crm_reservation WHERE id=$1", [reservationId])).rows[0];
      if (!r) throw new NotFoundError("Reserva inexistente.");
      await this.lockEvent(q, actor, r.event_id);
      await q.query("UPDATE crm_reservation SET status='cancelada', updated_at=$2 WHERE id=$1", [reservationId, this.clock.now()]);
    });
  }

  async eventSummary(actor: Actor, eventId: string) {
    this.guard(actor);
    return this.db.tx(async (q) => {
      const ev = await this.lockEvent(q, actor, eventId);
      await this.expireProvisional(q, eventId, this.clock.now());
      const { rows } = await q.query<{ status: string; n: number }>(
        "SELECT status, COALESCE(sum(tables),0)::int AS n FROM crm_reservation WHERE event_id=$1 GROUP BY status", [eventId]);
      const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
      const provisoria = by.provisoria ?? 0;
      const confirmada = by.confirmada ?? 0;
      return { capacidad: ev.table_capacity, provisoria, confirmada, disponible: ev.table_capacity - provisoria - confirmada };
    });
  }

  private async expireProvisional(q: Queryable, eventId: string, now: Date) {
    await q.query(
      "UPDATE crm_reservation SET status='vencida', updated_at=$2 WHERE event_id=$1 AND status='provisoria' AND expires_at <= $2",
      [eventId, now],
    );
  }

  private async usedTables(q: Queryable, eventId: string) {
    return (await q.query<{ n: number }>(
      "SELECT COALESCE(sum(tables),0)::int AS n FROM crm_reservation WHERE event_id=$1 AND status IN ('provisoria','confirmada')",
      [eventId])).rows[0].n;
  }

  private async lockEvent(q: Queryable, actor: Actor, eventId: string) {
    const ev = (await q.query<{ organization_id: string; table_capacity: number }>(
      "SELECT organization_id, table_capacity FROM crm_event WHERE id=$1 FOR UPDATE", [eventId])).rows[0];
    if (!ev) throw new NotFoundError("Evento inexistente.");
    requireSameOrg(actor, ev.organization_id);
    return ev;
  }

  private async companyInOrg(q: Queryable, actor: Actor, companyId: string) {
    const c = (await q.query<{ organization_id: string }>("SELECT organization_id FROM crm_company WHERE id=$1", [companyId])).rows[0];
    if (!c) throw new NotFoundError("Empresa inexistente.");
    requireSameOrg(actor, c.organization_id);
  }

  private async lockTask(q: Queryable, actor: Actor, taskId: string, expectedVersion: number) {
    const t = (await q.query<TaskRow & { organization_id: string }>(
      "SELECT t.*, c.organization_id FROM crm_task t JOIN crm_company c ON c.id=t.company_id WHERE t.id=$1 FOR UPDATE OF t", [taskId])).rows[0];
    if (!t) throw new NotFoundError("Tarea inexistente.");
    requireSameOrg(actor, t.organization_id);
    if (t.version !== expectedVersion) throw new ConflictError("La tarea cambió; recargá el tablero.", t.version);
    return t;
  }
}
