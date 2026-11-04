import { ConflictError, NotFoundError, ValidationError, type Db, type Queryable } from "../db/db";
import { requireRole, requireSameOrg, type Actor } from "./auth";
import type { Clock } from "./clock";
import { classifyLocation, normalizePhone, validateIntake, DEFAULT_INTAKE_RULES, type IntakeDraft, type IntakeRules } from "./intake";

export type IncidentStatus =
  | "nuevo"
  | "en_revision"
  | "asignado"
  | "derivacion_pendiente"
  | "derivado"
  | "cerrado";

/** Transiciones permitidas (masterplan §2.4). La urgencia es un atributo aparte. */
const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  nuevo: ["en_revision"],
  en_revision: ["asignado", "cerrado"],
  asignado: ["derivacion_pendiente", "cerrado"],
  derivacion_pendiente: ["derivado", "en_revision"],
  derivado: ["cerrado"],
  cerrado: ["en_revision"],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface IncidentRow {
  id: string;
  organization_id: string;
  origin: string;
  category: string | null;
  priority_suggested: number | null;
  priority_confirmed: number | null;
  description: string | null;
  location_text: string | null;
  location_precision: string | null;
  status: IncidentStatus;
  intake_complete: boolean;
  assigned_to: string | null;
  duplicate_of: string | null;
  created_at: Date;
  updated_at: Date;
  version: number;
}

export interface CreateIncidentInput extends IntakeDraft {
  origin: "llamada" | "radio" | "whatsapp" | "cota" | "manual";
  priority?: number | null;
}

export class IncidentService {
  constructor(
    private db: Db,
    private clock: Clock,
    private rules: IntakeRules = DEFAULT_INTAKE_RULES,
  ) {}

  /** Alta manual: guarda siempre el borrador y reporta faltantes sin bloquear. */
  async create(actor: Actor, input: CreateIncidentInput) {
    requireRole(actor, "operador", "jefe_guardia");
    const now = this.clock.now();
    const issues = validateIntake(input, this.rules);
    return this.db.tx(async (q) => {
      const { rows } = await q.query<IncidentRow>(
        `INSERT INTO incident (organization_id, origin, category, priority_confirmed, description,
           location_text, location_precision, intake_complete, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
        [
          actor.organizationId,
          input.origin,
          input.category ?? null,
          input.priority ?? null,
          input.description ?? null,
          input.locationText ?? null,
          classifyLocation(input.locationText),
          issues.length === 0,
          now,
        ],
      );
      const incident = rows[0];
      await q.query(
        `INSERT INTO incident_contact (incident_id, caller_name, phone, anonymous) VALUES ($1,$2,$3,$4)`,
        [incident.id, input.callerName ?? null, normalizePhone(input.phone) ?? input.phone ?? null, !!input.anonymous],
      );
      await logEvent(q, incident.id, "alta", null, "nuevo", 1, now, actor.id, null, {
        faltantes: issues.map((i) => i.field),
        reglas: this.rules.version,
      });
      return { incident, issues };
    });
  }

  /** Completa datos de ingreso con control de versión. */
  async updateIntake(actor: Actor, id: string, expectedVersion: number, patch: IntakeDraft) {
    requireRole(actor, "operador", "jefe_guardia");
    const now = this.clock.now();
    return this.db.tx(async (q) => {
      const current = await lockIncident(q, id, actor);
      assertVersion(current, expectedVersion);
      const contact = (
        await q.query<{ caller_name: string | null; phone: string | null; anonymous: boolean }>(
          "SELECT caller_name, phone, anonymous FROM incident_contact WHERE incident_id = $1",
          [id],
        )
      ).rows[0];
      const merged: IntakeDraft = {
        callerName: patch.callerName ?? contact?.caller_name,
        phone: patch.phone ?? contact?.phone,
        anonymous: patch.anonymous ?? contact?.anonymous,
        locationText: patch.locationText ?? current.location_text,
        category: patch.category ?? current.category,
        description: patch.description ?? current.description,
      };
      const issues = validateIntake(merged, this.rules);
      const version = current.version + 1;
      const { rows } = await q.query<IncidentRow>(
        `UPDATE incident SET category=$2, description=$3, location_text=$4, location_precision=$5,
           intake_complete=$6, updated_at=$7, version=$8 WHERE id=$1 RETURNING *`,
        [id, merged.category ?? null, merged.description ?? null, merged.locationText ?? null,
          classifyLocation(merged.locationText), issues.length === 0, now, version],
      );
      await q.query(
        "UPDATE incident_contact SET caller_name=$2, phone=$3, anonymous=$4 WHERE incident_id=$1",
        [id, merged.callerName ?? null, normalizePhone(merged.phone) ?? merged.phone ?? null, !!merged.anonymous],
      );
      if (issues.length === 0) {
        await q.query(
          "UPDATE intake_exception SET completed_at=$2 WHERE incident_id=$1 AND completed_at IS NULL",
          [id, now],
        );
      }
      await logEvent(q, id, "ingreso_actualizado", current.status, current.status, version, now, actor.id, null, {
        faltantes: issues.map((i) => i.field),
      });
      return { incident: rows[0], issues };
    });
  }

  /**
   * Excepción autorizada (denunciante anónimo, contacto desconocido, ubicación parcial).
   * Sólo jefatura. Queda auditada y como tarea de completado.
   */
  async authorizeIntakeException(actor: Actor, id: string, reason: string) {
    requireRole(actor, "jefe_guardia");
    if (!reason.trim()) throw new ValidationError("La excepción requiere motivo.");
    const now = this.clock.now();
    return this.db.tx(async (q) => {
      const current = await lockIncident(q, id, actor);
      const contact = (
        await q.query<{ caller_name: string | null; phone: string | null; anonymous: boolean }>(
          "SELECT caller_name, phone, anonymous FROM incident_contact WHERE incident_id=$1",
          [id],
        )
      ).rows[0];
      const issues = validateIntake(
        { callerName: contact?.caller_name, phone: contact?.phone, anonymous: contact?.anonymous, locationText: current.location_text },
        this.rules,
      );
      if (issues.length === 0) throw new ValidationError("No hay faltantes que exceptuar.");
      await q.query(
        "INSERT INTO intake_exception (incident_id, missing_fields, reason, actor, at) VALUES ($1,$2,$3,$4,$5)",
        [id, issues.map((i) => i.field), reason, actor.id, now],
      );
      await logEvent(q, id, "excepcion_ingreso", current.status, current.status, current.version, now, actor.id, reason, {
        faltantes: issues.map((i) => i.field),
      });
      return issues;
    });
  }

  async transition(actor: Actor, id: string, expectedVersion: number, to: IncidentStatus, opts: { reason?: string; assignedTo?: string; duplicateOf?: string } = {}) {
    requireRole(actor, "operador", "jefe_guardia");
    if ((to === "cerrado" || to === "en_revision") && !opts.reason?.trim()) {
      throw new ValidationError("Cerrar o reabrir requiere motivo.");
    }
    const now = this.clock.now();
    return this.db.tx(async (q) => {
      const current = await lockIncident(q, id, actor);
      assertVersion(current, expectedVersion);
      if (!canTransition(current.status, to)) {
        throw new ValidationError(`Transición no permitida: ${current.status} → ${to}`);
      }
      if (current.status === "cerrado" && to === "en_revision") requireRole(actor, "jefe_guardia");
      const version = current.version + 1;
      const { rows } = await q.query<IncidentRow>(
        `UPDATE incident SET status=$2, version=$3, updated_at=$4,
           assigned_to = COALESCE($5, assigned_to), duplicate_of = COALESCE($6, duplicate_of)
         WHERE id=$1 RETURNING *`,
        [id, to, version, now, opts.assignedTo ?? null, opts.duplicateOf ?? null],
      );
      await logEvent(q, id, "transicion", current.status, to, version, now, actor.id, opts.reason ?? null, {});
      return rows[0];
    });
  }

  async list(actor: Actor, filter: { status?: IncidentStatus; limit?: number; offset?: number } = {}) {
    requireRole(actor, "operador", "jefe_guardia");
    const { rows } = await this.db.query<IncidentRow>(
      `SELECT * FROM incident WHERE organization_id=$1 AND ($2::text IS NULL OR status=$2)
       ORDER BY COALESCE(priority_confirmed, 9), created_at LIMIT $3 OFFSET $4`,
      [actor.organizationId, filter.status ?? null, Math.min(filter.limit ?? 50, 200), filter.offset ?? 0],
    );
    return rows;
  }

  async get(actor: Actor, id: string) {
    requireRole(actor, "operador", "jefe_guardia");
    const incident = (await this.db.query<IncidentRow>("SELECT * FROM incident WHERE id=$1", [id])).rows[0];
    if (!incident) throw new NotFoundError("Incidente inexistente.");
    requireSameOrg(actor, incident.organization_id);
    const events = (await this.db.query("SELECT * FROM incident_event WHERE incident_id=$1 ORDER BY id", [id])).rows;
    const contact = (await this.db.query("SELECT * FROM incident_contact WHERE incident_id=$1", [id])).rows[0];
    return { incident, events, contact };
  }

  /**
   * Resumen al corte (O1 paso 2). Usa el historial de eventos, no el estado vigente,
   * para que cierres y reaperturas cuenten correctamente a distintas fechas.
   */
  async summary(actor: Actor, from: Date, to: Date) {
    requireRole(actor, "operador", "jefe_guardia");
    const { rows } = await this.db.query<{ received: string; closed: string; pending_at_cut: string }>(
      `WITH status_at_cut AS (
         SELECT DISTINCT ON (e.incident_id) e.incident_id, e.to_status
         FROM incident_event e JOIN incident i ON i.id = e.incident_id
         WHERE i.organization_id = $1 AND e.at <= $3 AND e.to_status IS NOT NULL
         ORDER BY e.incident_id, e.id DESC)
       SELECT
         (SELECT count(*) FROM incident WHERE organization_id=$1 AND created_at >= $2 AND created_at <= $3) AS received,
         (SELECT count(*) FROM incident_event e JOIN incident i ON i.id=e.incident_id
            WHERE i.organization_id=$1 AND e.to_status='cerrado' AND e.at >= $2 AND e.at <= $3) AS closed,
         (SELECT count(*) FROM status_at_cut WHERE to_status <> 'cerrado') AS pending_at_cut`,
      [actor.organizationId, from, to],
    );
    const r = rows[0];
    return { from, to, received: Number(r.received), closed: Number(r.closed), pendingAtCut: Number(r.pending_at_cut) };
  }
}

export async function lockIncident(q: Queryable, id: string, actor: Actor): Promise<IncidentRow> {
  const row = (await q.query<IncidentRow>("SELECT * FROM incident WHERE id=$1 FOR UPDATE", [id])).rows[0];
  if (!row) throw new NotFoundError("Incidente inexistente.");
  requireSameOrg(actor, row.organization_id);
  return row;
}

function assertVersion(row: IncidentRow, expected: number) {
  if (row.version !== expected) {
    throw new ConflictError("El incidente cambió desde que lo abriste. Recargá antes de guardar.", row.version);
  }
}

export async function logEvent(
  q: Queryable, incidentId: string, kind: string, from: string | null, to: string | null,
  version: number, at: Date, actor: string, reason: string | null, data: Record<string, unknown>,
) {
  await q.query(
    `INSERT INTO incident_event (incident_id, kind, from_status, to_status, version, at, actor, reason, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [incidentId, kind, from, to, version, at, actor, reason, JSON.stringify(data)],
  );
}
