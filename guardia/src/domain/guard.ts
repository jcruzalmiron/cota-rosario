import { NotFoundError, ValidationError, type Db, type Queryable } from "../db/db";
import { requireRole, requireSameOrg, type Actor } from "./auth";
import { minutes, type Clock } from "./clock";
import { DEFAULT_INTAKE_RULES, validateIntake, type IntakeRules } from "./intake";
import { lockIncident, logEvent } from "./incidents";
import { cancelJobs, enqueue, type JobHandler } from "./jobs";

/**
 * O3 · Regla de aviso por falta de novedad.
 * - Primer aviso: `firstAlertMin` desde el despacho si no hubo novedad válida.
 * - Seguimiento: `followUpMin` desde la última novedad válida. `null` = sin seguimiento
 *   automático hasta que jefatura acuerde la regla (pendiente en el relevamiento).
 */
export interface AlertRule {
  version: string;
  firstAlertMin: number;
  followUpMin: number | null;
}

export const DEFAULT_ALERT_RULE: AlertRule = {
  version: "2026-11-04.v1-propuesta",
  firstAlertMin: 10,
  followUpMin: null,
};

export type UpdateKind = "novedad" | "arribo" | "panorama" | "retorno";

export interface DispatchRow {
  id: string;
  organization_id: string;
  incident_id: string;
  mobile_code: string;
  operator: string;
  dispatched_at: Date;
  external_ref: string | null;
  status: "activo" | "en_lugar" | "retornado" | "cancelado";
  arrived_at: Date | null;
  panorama_pending: boolean;
  last_valid_update_at: Date | null;
  update_seq: number;
}

/** Ventana vigente del reloj de aviso. Función pura para probar límites. */
export function currentAlertWindow(d: Pick<DispatchRow, "dispatched_at" | "last_valid_update_at" | "status">, rule: AlertRule) {
  if (d.status === "retornado" || d.status === "cancelado") return null;
  if (!d.last_valid_update_at) {
    const start = new Date(d.dispatched_at);
    return { windowStart: start, dueAt: new Date(start.getTime() + minutes(rule.firstAlertMin)) };
  }
  if (rule.followUpMin == null) return null;
  const start = new Date(d.last_valid_update_at);
  return { windowStart: start, dueAt: new Date(start.getTime() + minutes(rule.followUpMin)) };
}

const alertJobKey = (dispatchId: string, windowStart: Date) => `alerta:${dispatchId}:${windowStart.toISOString()}`;

export class GuardService {
  constructor(
    private db: Db,
    private clock: Clock,
    private rule: AlertRule = DEFAULT_ALERT_RULE,
    private intakeRules: IntakeRules = DEFAULT_INTAKE_RULES,
  ) {}

  /**
   * O2 · Despacho. Bloquea si faltan datos de ingreso y no hay excepción autorizada.
   * Idempotente por `idempotencyKey`: un reintento devuelve el mismo despacho.
   */
  async dispatch(actor: Actor, input: { incidentId: string; mobileCode: string; idempotencyKey: string; externalRef?: string }) {
    requireRole(actor, "operador", "jefe_guardia");
    if (!input.mobileCode.trim()) throw new ValidationError("Falta el móvil.", [{ field: "movil", message: "Indicá el móvil." }]);
    const now = this.clock.now();
    return this.db.tx(async (q) => {
      const existing = (await q.query<DispatchRow>("SELECT * FROM dispatch WHERE idempotency_key=$1", [input.idempotencyKey])).rows[0];
      if (existing) {
        requireSameOrg(actor, existing.organization_id);
        return { dispatch: existing, replayed: true };
      }
      const incident = await lockIncident(q, input.incidentId, actor);
      if (incident.status === "cerrado") throw new ValidationError("El incidente está cerrado.");
      const contact = (await q.query<{ caller_name: string | null; phone: string | null; anonymous: boolean }>(
        "SELECT caller_name, phone, anonymous FROM incident_contact WHERE incident_id=$1", [incident.id])).rows[0];
      const issues = validateIntake(
        { callerName: contact?.caller_name, phone: contact?.phone, anonymous: contact?.anonymous, locationText: incident.location_text },
        this.intakeRules,
      );
      if (issues.length) {
        const exc = (await q.query<{ missing_fields: string[] }>(
          "SELECT missing_fields FROM intake_exception WHERE incident_id=$1 AND completed_at IS NULL ORDER BY id DESC LIMIT 1",
          [incident.id])).rows[0];
        const uncovered = issues.filter((i) => !exc?.missing_fields.includes(i.field));
        if (uncovered.length) {
          throw new ValidationError("Faltan datos obligatorios antes de despachar.", uncovered);
        }
      }
      const { rows } = await q.query<DispatchRow>(
        `INSERT INTO dispatch (organization_id, incident_id, mobile_code, operator, dispatched_at, external_ref, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [actor.organizationId, incident.id, input.mobileCode.trim(), actor.id, now, input.externalRef ?? null, input.idempotencyKey],
      );
      const d = rows[0];
      // Avanza el incidente a "asignado" registrando los pasos intermedios.
      let status = incident.status;
      let version = incident.version;
      for (const next of pathToAssigned(status)) {
        version++;
        await q.query("UPDATE incident SET status=$2, version=$3, updated_at=$4 WHERE id=$1", [incident.id, next, version, now]);
        await logEvent(q, incident.id, "transicion", status, next, version, now, actor.id, "despacho", {});
        status = next;
      }
      await logEvent(q, incident.id, "despacho", status, status, version, now, actor.id, null, {
        movil: d.mobile_code, despacho: d.id, excepcion: issues.length > 0,
      });
      await this.scheduleAlert(q, d);
      return { dispatch: d, replayed: false };
    });
  }

  /** Registra novedad/arribo/panorama/retorno. `sourceKey` deduplica reenvíos. */
  async recordUpdate(actor: Actor, input: {
    dispatchId: string; kind: UpdateKind; observedAt?: Date; channel: "radio" | "app" | "telefono" | "manual";
    body?: string; sourceKey: string;
  }) {
    requireRole(actor, "operador", "jefe_guardia");
    const received = this.clock.now();
    const observed = input.observedAt ?? received;
    if (observed.getTime() > received.getTime() + minutes(2)) {
      throw new ValidationError("La hora observada está en el futuro.");
    }
    return this.db.tx(async (q) => {
      const d = (await q.query<DispatchRow>("SELECT * FROM dispatch WHERE id=$1 FOR UPDATE", [input.dispatchId])).rows[0];
      if (!d) throw new NotFoundError("Despacho inexistente.");
      requireSameOrg(actor, d.organization_id);
      const dup = (await q.query("SELECT id FROM mobile_update WHERE source_key=$1", [input.sourceKey])).rows[0];
      if (dup) return { dispatch: d, replayed: true };
      if (d.status === "retornado" || d.status === "cancelado") {
        throw new ValidationError("El móvil ya no está activo en esta intervención.");
      }
      await q.query(
        `INSERT INTO mobile_update (dispatch_id, kind, observed_at, received_at, actor, channel, body, source_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [d.id, input.kind, observed, received, actor.id, input.channel, input.body ?? null, input.sourceKey],
      );
      const body = (input.body ?? "").trim();
      let status: DispatchRow["status"] = d.status;
      let arrivedAt = d.arrived_at;
      let panoramaPending = d.panorama_pending;
      if (input.kind === "arribo") {
        status = "en_lugar";
        arrivedAt = arrivedAt ?? observed;
        panoramaPending = body.length === 0;
      } else if (input.kind === "panorama" && body) {
        panoramaPending = false;
      } else if (input.kind === "retorno") {
        status = "retornado";
      }
      // Novedad válida: la más reciente por hora observada (una llegada tardía de radio no retrocede el reloj).
      const lastValid = !d.last_valid_update_at || observed > new Date(d.last_valid_update_at) ? observed : d.last_valid_update_at;
      const { rows } = await q.query<DispatchRow>(
        `UPDATE dispatch SET status=$2, arrived_at=$3, panorama_pending=$4, last_valid_update_at=$5, update_seq=update_seq+1
         WHERE id=$1 RETURNING *`,
        [d.id, status, arrivedAt, panoramaPending, lastValid],
      );
      const updated = rows[0];
      await q.query(
        `UPDATE guard_alert SET resolved_at=$2, resolution=$3 WHERE dispatch_id=$1 AND resolved_at IS NULL`,
        [d.id, received, `novedad:${input.kind}`],
      );
      const next = currentAlertWindow(updated, this.rule);
      await cancelJobs(q, `alerta:${d.id}:`, next ? alertJobKey(d.id, next.windowStart) : null);
      await this.scheduleAlert(q, updated);
      return { dispatch: updated, replayed: false };
    });
  }

  async acknowledgeAlert(actor: Actor, alertId: number) {
    requireRole(actor, "operador", "jefe_guardia");
    const now = this.clock.now();
    const { rows } = await this.db.query<{ id: number }>(
      `UPDATE guard_alert a SET acked_at=$2, acked_by=$3 FROM dispatch d
       WHERE a.id=$1 AND d.id=a.dispatch_id AND d.organization_id=$4 AND a.acked_at IS NULL RETURNING a.id`,
      [alertId, now, actor.id, actor.organizationId],
    );
    return rows.length === 1;
  }

  /** Mesa de radio: móviles activos, tiempo transcurrido, panorama pendiente y avisos abiertos. */
  async board(actor: Actor) {
    requireRole(actor, "operador", "jefe_guardia");
    const now = this.clock.now();
    const { rows } = await this.db.query<DispatchRow & { open_alert_id: number | null; alert_acked: boolean | null; location_text: string | null; category: string | null }>(
      `SELECT d.*, i.location_text, i.category, a.id AS open_alert_id, (a.acked_at IS NOT NULL) AS alert_acked
       FROM dispatch d JOIN incident i ON i.id=d.incident_id
       LEFT JOIN LATERAL (SELECT * FROM guard_alert WHERE dispatch_id=d.id AND resolved_at IS NULL ORDER BY id DESC LIMIT 1) a ON true
       WHERE d.organization_id=$1 AND d.status IN ('activo','en_lugar')
       ORDER BY (a.id IS NULL), d.dispatched_at`,
      [actor.organizationId],
    );
    return rows.map((r) => ({
      ...r,
      elapsedMin: Math.floor((now.getTime() - new Date(r.dispatched_at).getTime()) / 60_000),
      sinceLastUpdateMin: r.last_valid_update_at
        ? Math.floor((now.getTime() - new Date(r.last_valid_update_at).getTime()) / 60_000)
        : null,
      // ETA: sin base validada de tiempos por zona se informa como pendiente (no se inventa).
      eta: null as null | { minMin: number; maxMin: number; source: string },
    }));
  }

  private async scheduleAlert(q: Queryable, d: DispatchRow) {
    const w = currentAlertWindow(d, this.rule);
    if (!w) return;
    await enqueue(q, "guard_alert_check", { dispatchId: d.id, windowStart: w.windowStart.toISOString() }, alertJobKey(d.id, w.windowStart), w.dueAt);
  }

  /** Handler del worker. Relee el despacho y descarta jobs obsoletos antes de emitir. */
  alertHandler(): JobHandler {
    return async (job) => {
      const { dispatchId, windowStart } = job.payload as { dispatchId: string; windowStart: string };
      await this.db.tx(async (q) => {
        const d = (await q.query<DispatchRow>("SELECT * FROM dispatch WHERE id=$1 FOR UPDATE", [dispatchId])).rows[0];
        if (!d) return;
        const w = currentAlertWindow(d, this.rule);
        if (!w || w.windowStart.toISOString() !== new Date(windowStart).toISOString()) return; // obsoleto
        const now = this.clock.now();
        if (now < w.dueAt) {
          await enqueue(q, "guard_alert_check", job.payload, `${alertJobKey(d.id, w.windowStart)}:r${job.id}`, w.dueAt);
          return;
        }
        await q.query(
          `INSERT INTO guard_alert (dispatch_id, window_start, due_at, fired_at) VALUES ($1,$2,$3,$4)
           ON CONFLICT (dispatch_id, window_start) DO NOTHING`,
          [d.id, w.windowStart, w.dueAt, now],
        );
      });
    };
  }
}

function pathToAssigned(status: string): ("en_revision" | "asignado")[] {
  if (status === "nuevo") return ["en_revision", "asignado"];
  if (status === "en_revision") return ["asignado"];
  return [];
}
