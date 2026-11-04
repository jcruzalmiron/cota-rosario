import { NotFoundError, ValidationError, ConflictError, type Db } from "../db/db";
import { requireRole, requireSameOrg, type Actor } from "./auth";
import type { Clock } from "./clock";
import { extractAction, extractPlace, extractTime, extractUnit, splitSentences, toInstant, type Evidence } from "./extract";

export interface LogEventRow {
  id: number;
  intervention_id: string;
  at: Date | null;
  action: string | null;
  unit: string | null;
  place: string | null;
  evidence: Evidence;
  status: "candidato" | "aceptado" | "rechazado";
  author: string;
  version: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Transcripción: interfaz para un proveedor local (p. ej. faster-whisper) o autorizado.
 * Deshabilitada por defecto; sin proveedor configurado la carga por texto sigue disponible.
 */
export interface Transcriber {
  transcribe(audioRef: string): Promise<TranscriptSegment[]>;
}

const BITACORA_ROLES = ["operador", "jefe_guardia"] as const;

export class LogbookService {
  constructor(private db: Db, private clock: Clock) {}

  async createIntervention(actor: Actor, input: { title: string; incidentId?: string; externalRef?: string; startedAt?: Date }) {
    requireRole(actor, ...BITACORA_ROLES);
    if (!input.title.trim()) throw new ValidationError("Falta el título de la intervención.");
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO intervention (organization_id, incident_id, external_ref, title, started_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [actor.organizationId, input.incidentId ?? null, input.externalRef ?? null, input.title, input.startedAt ?? null, this.clock.now()],
    );
    return rows[0].id;
  }

  /** Texto libre → eventos candidatos, uno por oración con contenido operativo. */
  async addText(actor: Actor, interventionId: string, entryRef: string, text: string) {
    return this.addSegments(actor, interventionId, splitSentences(text).map((s) => ({ text: s, evidence: { source: "texto" as const, ref: entryRef, excerpt: s } })));
  }

  /** Segmentos de transcripción → candidatos que apuntan al tramo de audio. */
  async addTranscript(actor: Actor, interventionId: string, audioRef: string, segments: TranscriptSegment[]) {
    return this.addSegments(actor, interventionId, segments.map((s) => ({
      text: s.text,
      evidence: { source: "audio" as const, ref: audioRef, start: s.start, end: s.end, excerpt: s.text },
    })));
  }

  private async addSegments(actor: Actor, interventionId: string, parts: { text: string; evidence: Evidence }[]) {
    requireRole(actor, ...BITACORA_ROLES);
    const now = this.clock.now();
    return this.db.tx(async (q) => {
      const iv = (await q.query<{ organization_id: string; started_at: Date | null; created_at: Date }>(
        "SELECT organization_id, started_at, created_at FROM intervention WHERE id=$1", [interventionId])).rows[0];
      if (!iv) throw new NotFoundError("Intervención inexistente.");
      requireSameOrg(actor, iv.organization_id);
      const base = iv.started_at ?? iv.created_at;
      const created: LogEventRow[] = [];
      for (const p of parts) {
        const action = extractAction(p.text);
        const time = extractTime(p.text);
        if (!action && !time) continue; // sin contenido operativo reconocible
        const { rows } = await q.query<LogEventRow>(
          `INSERT INTO log_event (intervention_id, at, action, unit, place, evidence, author, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [interventionId, time ? toInstant(new Date(base), time.hh, time.mm) : null, action, extractUnit(p.text),
            extractPlace(p.text), JSON.stringify(p.evidence), actor.id, now],
        );
        created.push(rows[0]);
      }
      return created;
    });
  }

  /** Revisión: aceptar, rechazar o corregir un candidato con control de versión. */
  async review(actor: Actor, eventId: number, expectedVersion: number, change: {
    status?: "aceptado" | "rechazado"; at?: Date | null; action?: string; unit?: string | null; place?: string | null;
  }) {
    requireRole(actor, "jefe_guardia");
    return this.db.tx(async (q) => {
      const ev = (await q.query<LogEventRow & { organization_id: string }>(
        `SELECT e.*, i.organization_id FROM log_event e JOIN intervention i ON i.id=e.intervention_id WHERE e.id=$1 FOR UPDATE OF e`,
        [eventId])).rows[0];
      if (!ev) throw new NotFoundError("Evento inexistente.");
      requireSameOrg(actor, ev.organization_id);
      if (ev.version !== expectedVersion) throw new ConflictError("El evento cambió; recargá la cronología.", ev.version);
      const next = {
        at: change.at !== undefined ? change.at : ev.at,
        action: change.action ?? ev.action,
        unit: change.unit !== undefined ? change.unit : ev.unit,
        place: change.place !== undefined ? change.place : ev.place,
        status: change.status ?? ev.status,
      };
      if (next.status === "aceptado" && (!next.at || !next.action)) {
        throw new ValidationError("Para aceptar un evento falta hora o acción.", [
          ...(!next.at ? [{ field: "hora", message: "Hora pendiente" }] : []),
          ...(!next.action ? [{ field: "accion", message: "Acción pendiente" }] : []),
        ]);
      }
      const { rows } = await q.query<LogEventRow>(
        `UPDATE log_event SET at=$2, action=$3, unit=$4, place=$5, status=$6, version=version+1 WHERE id=$1 RETURNING *`,
        [eventId, next.at, next.action, next.unit, next.place, next.status],
      );
      return rows[0];
    });
  }

  /** Cronología: ordenada por hora; los eventos sin hora quedan al final marcados como pendientes. */
  async timeline(actor: Actor, interventionId: string) {
    requireRole(actor, ...BITACORA_ROLES, "revisor_informes");
    const iv = (await this.db.query<{ organization_id: string }>("SELECT organization_id FROM intervention WHERE id=$1", [interventionId])).rows[0];
    if (!iv) throw new NotFoundError("Intervención inexistente.");
    requireSameOrg(actor, iv.organization_id);
    const { rows } = await this.db.query<LogEventRow>(
      "SELECT * FROM log_event WHERE intervention_id=$1 AND status <> 'rechazado' ORDER BY at NULLS LAST, id", [interventionId]);
    return rows.map((e) => ({
      ...e,
      pendientes: [!e.at && "hora", !e.action && "accion", !e.unit && "unidad", !e.place && "lugar"].filter(Boolean) as string[],
    }));
  }

  /** Exportación provisional (hasta validar el contrato real de Bravo/Brau): sólo eventos aceptados. */
  async exportProvisional(actor: Actor, interventionId: string, format: "json" | "csv") {
    const events = (await this.timeline(actor, interventionId)).filter((e) => e.status === "aceptado");
    const rows = events.map((e) => ({
      hora: e.at ? new Date(e.at).toISOString() : "",
      accion: e.action ?? "",
      unidad: e.unit ?? "",
      lugar: e.place ?? "",
      evidencia: e.evidence.source === "audio" ? `${e.evidence.ref}@${e.evidence.start}-${e.evidence.end}s` : e.evidence.ref,
    }));
    if (format === "json") return JSON.stringify({ intervencion: interventionId, formato: "provisional-v1", eventos: rows }, null, 2);
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    return ["hora,accion,unidad,lugar,evidencia", ...rows.map((r) => Object.values(r).map(esc).join(","))].join("\n");
  }
}
