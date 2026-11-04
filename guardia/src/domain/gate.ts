import { createHmac, timingSafeEqual } from "node:crypto";
import { NotFoundError, ValidationError, type Db, type Queryable } from "../db/db";
import { requireRole, type Actor } from "./auth";
import { minutes, type Clock } from "./clock";

/**
 * O4 · Entrada y salida de camiones. Primer corte: registro manual y QR firmado.
 * El QR identifica el móvil; la sesión identifica al operador; el portón se elige en pantalla.
 * La cámara (futuro) usa el mismo registro con estado `pendiente_revision`.
 */
export interface GateRule {
  version: string;
  /** Un segundo escaneo del mismo móvil y sentido dentro de esta ventana es duplicado. */
  doubleScanWindowMin: number;
  /** Carga demorada: hasta cuánto hacia atrás se acepta la hora del hecho. */
  maxBackdateMin: number;
  /** Ventana para vincular una salida con un despacho del mismo móvil. */
  dispatchLinkWindowMin: number;
}

export const DEFAULT_GATE_RULE: GateRule = {
  version: "2026-11-04.v1-propuesta",
  doubleScanWindowMin: 2,
  maxBackdateMin: 24 * 60,
  dispatchLinkWindowMin: 30,
};

export type Direction = "salida" | "entrada";

export interface MovementRow {
  id: number;
  organization_id: string;
  vehicle_id: string;
  gate_id: string;
  direction: Direction;
  occurred_at: Date;
  received_at: Date;
  source: "qr" | "manual" | "camara";
  operator: string;
  status: "confirmado" | "duplicado" | "corregido" | "pendiente_revision" | "descartado";
  duplicate_of: number | null;
  corrected_from: number | null;
  dispatch_id: string | null;
  reason: string | null;
}

// ── QR firmado ────────────────────────────────────────────────────────────
// Formato: GB1.<organización>.<código de móvil>.<firma>. No contiene datos personales.

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

function sign(secret: string, org: string, code: string) {
  return createHmac("sha256", secret).update(`GB1|${org}|${code}`).digest("base64url").slice(0, 22);
}

export function qrPayload(secret: string, organizationId: string, vehicleCode: string): string {
  if (!secret) throw new Error("QR_SECRET no configurado.");
  return `GB1.${b64(organizationId)}.${b64(vehicleCode)}.${sign(secret, organizationId, vehicleCode)}`;
}

export function verifyQr(secret: string, payload: string): { organizationId: string; vehicleCode: string } | null {
  const parts = payload.trim().split(".");
  if (parts.length !== 4 || parts[0] !== "GB1" || !secret) return null;
  try {
    const org = unb64(parts[1]);
    const code = unb64(parts[2]);
    const expected = Buffer.from(sign(secret, org, code));
    const given = Buffer.from(parts[3]);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return { organizationId: org, vehicleCode: code };
  } catch {
    return null;
  }
}

// ── Servicio ──────────────────────────────────────────────────────────────

export class GateService {
  constructor(
    private db: Db,
    private clock: Clock,
    private qrSecret: string,
    private rule: GateRule = DEFAULT_GATE_RULE,
  ) {}

  async addVehicle(actor: Actor, code: string, label: string) {
    requireRole(actor, "jefe_guardia", "admin_tecnico");
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{1,12}$/.test(clean)) throw new ValidationError("Código de móvil inválido (letras, números y guion).");
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO vehicle (organization_id, code, label) VALUES ($1,$2,$3)
       ON CONFLICT (organization_id, code) DO UPDATE SET label=EXCLUDED.label, active=true RETURNING id`,
      [actor.organizationId, clean, label.trim() || clean],
    );
    return rows[0].id;
  }

  async addGate(actor: Actor, code: string, name: string) {
    requireRole(actor, "jefe_guardia", "admin_tecnico");
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO gate (organization_id, code, name) VALUES ($1,$2,$3)
       ON CONFLICT (organization_id, code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [actor.organizationId, code.trim().toUpperCase(), name.trim()],
    );
    return rows[0].id;
  }

  async inventory(actor: Actor) {
    requireRole(actor, "operador", "jefe_guardia", "admin_tecnico");
    const vehicles = (await this.db.query<{ id: string; code: string; label: string }>(
      "SELECT id, code, label FROM vehicle WHERE organization_id=$1 AND active ORDER BY code", [actor.organizationId])).rows;
    const gates = (await this.db.query<{ id: string; code: string; name: string }>(
      "SELECT id, code, name FROM gate WHERE organization_id=$1 ORDER BY code", [actor.organizationId])).rows;
    return { vehicles, gates };
  }

  /** Códigos QR para imprimir (sólo jefatura o técnico). */
  async qrCodes(actor: Actor) {
    requireRole(actor, "jefe_guardia", "admin_tecnico");
    const { vehicles } = await this.inventory(actor);
    return vehicles.map((v) => ({ ...v, payload: qrPayload(this.qrSecret, actor.organizationId, v.code) }));
  }

  /**
   * Registra un paso por portón. Con QR, el móvil sale del código firmado; en manual, del inventario.
   * Sin sentido explícito, se infiere alternando con el último movimiento confirmado.
   */
  async record(actor: Actor, input: {
    gateId: string; sourceKey: string; source: "qr" | "manual";
    qr?: string; vehicleCode?: string; direction?: Direction; occurredAt?: Date;
  }) {
    requireRole(actor, "operador", "jefe_guardia");
    const received = this.clock.now();
    const occurred = input.occurredAt ?? received;
    if (occurred.getTime() > received.getTime() + minutes(2)) throw new ValidationError("La hora del paso está en el futuro.");
    if (received.getTime() - occurred.getTime() > minutes(this.rule.maxBackdateMin)) {
      throw new ValidationError("La hora del paso es demasiado antigua para carga demorada; pedí una corrección a jefatura.");
    }
    let code = input.vehicleCode?.trim().toUpperCase();
    if (input.source === "qr") {
      const parsed = verifyQr(this.qrSecret, input.qr ?? "");
      if (!parsed) throw new ValidationError("QR inválido o de otro sistema.");
      if (parsed.organizationId !== actor.organizationId) throw new ValidationError("El QR pertenece a otro cuartel.");
      code = parsed.vehicleCode;
    }
    if (!code) throw new ValidationError("Indicá el móvil.");

    return this.db.tx(async (q) => {
      const existing = (await q.query<MovementRow>("SELECT * FROM vehicle_movement WHERE source_key=$1", [input.sourceKey])).rows[0];
      if (existing) return { movement: existing, replayed: true };
      const vehicle = (await q.query<{ id: string; code: string }>(
        "SELECT id, code FROM vehicle WHERE organization_id=$1 AND code=$2 AND active FOR UPDATE", [actor.organizationId, code])).rows[0];
      if (!vehicle) throw new NotFoundError(`El móvil ${code} no está en el inventario.`);
      const gate = (await q.query("SELECT id FROM gate WHERE id=$1 AND organization_id=$2", [input.gateId, actor.organizationId])).rows[0];
      if (!gate) throw new NotFoundError("Portón inexistente.");

      const last = (await q.query<MovementRow>(
        `SELECT * FROM vehicle_movement WHERE vehicle_id=$1 AND status='confirmado' AND occurred_at <= $2
         ORDER BY occurred_at DESC, id DESC LIMIT 1`, [vehicle.id, occurred])).rows[0];
      // Doble escaneo sin sentido explícito: si el último paso confirmado está dentro de la ventana,
      // es el mismo cruce (no se alterna el sentido).
      const lastIsRecent = last && occurred.getTime() - new Date(last.occurred_at).getTime() <= minutes(this.rule.doubleScanWindowMin);
      const direction: Direction = input.direction ?? (lastIsRecent ? last.direction : last?.direction === "salida" ? "entrada" : "salida");

      const twin = (await q.query<MovementRow>(
        `SELECT * FROM vehicle_movement WHERE vehicle_id=$1 AND direction=$2 AND status='confirmado'
         AND occurred_at BETWEEN $3 AND $4 ORDER BY occurred_at LIMIT 1`,
        [vehicle.id, direction, new Date(occurred.getTime() - minutes(this.rule.doubleScanWindowMin)),
          new Date(occurred.getTime() + minutes(this.rule.doubleScanWindowMin))])).rows[0];

      const dispatchId = !twin && direction === "salida" ? await this.dispatchToLink(q, actor.organizationId, vehicle.code, occurred) : null;
      const { rows } = await q.query<MovementRow>(
        `INSERT INTO vehicle_movement (organization_id, vehicle_id, gate_id, direction, occurred_at, received_at, source,
           operator, status, duplicate_of, dispatch_id, source_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [actor.organizationId, vehicle.id, input.gateId, direction, occurred, received, input.source, actor.id,
          twin ? "duplicado" : "confirmado", twin?.id ?? null, dispatchId, input.sourceKey],
      );
      return { movement: rows[0], replayed: false };
    });
  }

  /** Vincula sólo si hay exactamente un despacho activo del móvil en la ventana y sin salida ya vinculada. */
  private async dispatchToLink(q: Queryable, org: string, mobileCode: string, at: Date): Promise<string | null> {
    const { rows } = await q.query<{ id: string }>(
      `SELECT d.id FROM dispatch d
       WHERE d.organization_id=$1 AND upper(d.mobile_code)=$2 AND d.status IN ('activo','en_lugar')
         AND d.dispatched_at BETWEEN $3 AND $4
         AND NOT EXISTS (SELECT 1 FROM vehicle_movement m WHERE m.dispatch_id=d.id AND m.status='confirmado')`,
      [org, mobileCode.toUpperCase(), new Date(at.getTime() - minutes(this.rule.dispatchLinkWindowMin)), new Date(at.getTime() + minutes(5))],
    );
    return rows.length === 1 ? rows[0].id : null;
  }

  /** Corrección de jefatura: conserva el original (estado `corregido`) y crea el movimiento nuevo. */
  async correct(actor: Actor, movementId: number, change: { direction?: Direction; occurredAt?: Date; discard?: boolean }, reason: string) {
    requireRole(actor, "jefe_guardia");
    if (!reason.trim()) throw new ValidationError("La corrección requiere motivo.");
    return this.db.tx(async (q) => {
      const m = (await q.query<MovementRow>(
        "SELECT * FROM vehicle_movement WHERE id=$1 AND organization_id=$2 FOR UPDATE", [movementId, actor.organizationId])).rows[0];
      if (!m) throw new NotFoundError("Movimiento inexistente.");
      if (m.status === "corregido" || m.status === "descartado") throw new ValidationError("Ese movimiento ya fue corregido.");
      await q.query("UPDATE vehicle_movement SET status=$2, reason=$3 WHERE id=$1",
        [movementId, change.discard ? "descartado" : "corregido", reason]);
      if (change.discard) return null;
      const { rows } = await q.query<MovementRow>(
        `INSERT INTO vehicle_movement (organization_id, vehicle_id, gate_id, direction, occurred_at, received_at, source,
           operator, status, corrected_from, dispatch_id, reason, source_key)
         VALUES ($1,$2,$3,$4,$5,$6,'manual',$7,'confirmado',$8,$9,$10,$11) RETURNING *`,
        [m.organization_id, m.vehicle_id, m.gate_id, change.direction ?? m.direction, change.occurredAt ?? m.occurred_at,
          this.clock.now(), actor.id, m.id, m.dispatch_id, reason, `correccion:${m.id}`],
      );
      return rows[0];
    });
  }

  /** Cronología del portón: movimientos con móvil, portón y, si existe, vínculo confirmado con un despacho. */
  async timeline(actor: Actor, from: Date, to: Date) {
    requireRole(actor, "operador", "jefe_guardia");
    const { rows } = await this.db.query<MovementRow & { vehicle_code: string; gate_name: string; incident_location: string | null }>(
      `SELECT m.*, v.code AS vehicle_code, g.name AS gate_name, i.location_text AS incident_location
       FROM vehicle_movement m JOIN vehicle v ON v.id=m.vehicle_id JOIN gate g ON g.id=m.gate_id
       LEFT JOIN dispatch d ON d.id=m.dispatch_id LEFT JOIN incident i ON i.id=d.incident_id
       WHERE m.organization_id=$1 AND m.occurred_at BETWEEN $2 AND $3
       ORDER BY m.occurred_at DESC, m.id DESC`,
      [actor.organizationId, from, to],
    );
    return rows;
  }
}
