import { NotFoundError, ValidationError, ForbiddenError, type Db, type Queryable } from "../db/db";
import { requireRole, requireSameOrg, type Actor } from "./auth";
import type { Clock } from "./clock";
import { extractPlace, extractTime, extractUnits, splitSentences, toInstant } from "./extract";
import {
  allFields, contradictions, missingFields, questionsFor, renderReport,
  type FieldValue, type TemplateSchema, type Values,
} from "./report-template";

interface TemplateRow { id: number; kind: string; version: number; status: string; schema: TemplateSchema }
interface RevisionRow {
  id: number; organization_id: string; intervention_id: string; template_id: number; revision_no: number;
  field_values: Values; status: string; author: string; approver: string | null; rendered: string | null; checksum: string | null;
}

const READ_ROLES = ["operador", "jefe_guardia", "revisor_informes"] as const;

const TIME_FIELDS: [RegExp, string][] = [
  [/\b(aviso|llamad|alert)/i, "hora_aviso"],
  [/\b(sal(e|i[oó]|ida|imos)|despach)/i, "hora_salida"],
  [/\b(lleg|arrib)/i, "hora_arribo"],
  [/\b(finaliz|termin|retir|regres|retorn)/i, "hora_finalizacion"],
];

/** Candidatos desde el relato libre. Cada valor guarda el fragmento que lo respalda. */
export function prefillFromText(text: string, base: Date): Values {
  const values: Values = {};
  const units = new Set<string>();
  for (const s of splitSentences(text)) {
    const t = extractTime(s);
    if (t) {
      const hit = TIME_FIELDS.find(([re, key]) => re.test(s) && !values[key]);
      if (hit) values[hit[1]] = { value: toInstant(base, t.hh, t.mm).toISOString(), source: "operador", evidence: s };
    }
    const place = extractPlace(s);
    if (place && !values.lugar) values.lugar = { value: place, source: "operador", evidence: s };
    for (const unit of extractUnits(s)) units.add(unit);
  }
  if (units.size) values.moviles = { value: [...units], source: "operador", evidence: "unidades mencionadas en el relato" };
  return values;
}

export class ReportService {
  constructor(private db: Db, private clock: Clock) {}

  async ensureTemplate(kind: string, version: number, schema: TemplateSchema, status: "pendiente_validacion" | "aprobada") {
    await this.db.query(
      `INSERT INTO report_template (kind, version, status, schema) VALUES ($1,$2,$3,$4) ON CONFLICT (kind, version) DO NOTHING`,
      [kind, version, status, JSON.stringify(schema)],
    );
  }

  private async latestTemplate(q: Queryable, kind: string) {
    const t = (await q.query<TemplateRow>(
      "SELECT * FROM report_template WHERE kind=$1 AND status <> 'retirada' ORDER BY version DESC LIMIT 1", [kind])).rows[0];
    if (!t) throw new NotFoundError(`No hay plantilla cargada para ${kind}.`);
    return t;
  }

  /** Inicia un informe desde la descripción libre del operador (texto o transcripción). */
  async start(actor: Actor, input: { interventionId: string; templateKind: string; freeText: string }) {
    requireRole(actor, "operador", "jefe_guardia");
    const now = this.clock.now();
    return this.db.tx(async (q) => {
      const iv = (await q.query<{ organization_id: string; started_at: Date | null; created_at: Date }>(
        "SELECT organization_id, started_at, created_at FROM intervention WHERE id=$1", [input.interventionId])).rows[0];
      if (!iv) throw new NotFoundError("Intervención inexistente.");
      requireSameOrg(actor, iv.organization_id);
      const template = await this.latestTemplate(q, input.templateKind);
      const base = new Date(iv.started_at ?? iv.created_at);
      const fromLog = await this.prefillFromLogbook(q, input.interventionId);
      // Lo registrado en bitácora revisada tiene prioridad sobre lo narrado.
      const values: Values = { ...prefillFromText(input.freeText, base), ...fromLog };
      const prev = (await q.query<{ n: number }>(
        "SELECT COALESCE(max(revision_no),0)::int AS n FROM report_revision WHERE intervention_id=$1", [input.interventionId])).rows[0].n;
      return this.insertRevision(q, actor, template, input.interventionId, prev + 1, values, now);
    });
  }

  /** Respuestas a las repreguntas. Cada respuesta crea una revisión nueva; las anteriores se conservan. */
  async answer(actor: Actor, revisionId: number, answers: Record<string, FieldValue>) {
    requireRole(actor, "operador", "jefe_guardia");
    const now = this.clock.now();
    return this.db.tx(async (q) => {
      const rev = await this.loadRevision(q, actor, revisionId, true);
      const template = (await q.query<TemplateRow>("SELECT * FROM report_template WHERE id=$1", [rev.template_id])).rows[0];
      const known = new Set(allFields(template.schema).map((f) => f.key));
      for (const [key, v] of Object.entries(answers)) {
        if (!known.has(key)) throw new ValidationError(`Campo desconocido: ${key}`);
        const field = allFields(template.schema).find((f) => f.key === key)!;
        if (v.unknownReason && !field.allowUnknown) throw new ValidationError(`${field.label} no admite "desconocido".`);
      }
      const latest = (await q.query<{ n: number }>(
        "SELECT max(revision_no)::int AS n FROM report_revision WHERE intervention_id=$1", [rev.intervention_id])).rows[0].n;
      if (latest !== rev.revision_no) throw new ValidationError("Hay una revisión más nueva; respondé sobre la última.");
      return this.insertRevision(q, actor, template, rev.intervention_id, rev.revision_no + 1, { ...rev.field_values, ...answers }, now);
    });
  }

  async observe(actor: Actor, revisionId: number, note: string) {
    requireRole(actor, "revisor_informes");
    if (!note.trim()) throw new ValidationError("La observación requiere un comentario.");
    await this.db.tx(async (q) => {
      await this.loadRevision(q, actor, revisionId, true);
      await q.query("UPDATE report_revision SET status='observado', field_sources = field_sources || $2 WHERE id=$1",
        [revisionId, JSON.stringify({ _observacion: { note, by: actor.id, at: this.clock.now().toISOString() } })]);
    });
  }

  /** Aprobación: exige plantilla aprobada, sin faltantes ni contradicciones y revisor distinto del autor. */
  async approve(actor: Actor, revisionId: number) {
    requireRole(actor, "revisor_informes");
    const now = this.clock.now();
    return this.db.tx(async (q) => {
      const rev = await this.loadRevision(q, actor, revisionId, true);
      const template = (await q.query<TemplateRow>("SELECT * FROM report_template WHERE id=$1", [rev.template_id])).rows[0];
      if (rev.author === actor.id) throw new ForbiddenError("Quien redactó no puede aprobar su propio informe.");
      if (template.status !== "aprobada") {
        throw new ValidationError("La plantilla está pendiente de validación con el circuito real; sólo se emiten borradores.");
      }
      const missing = missingFields(template.schema, rev.field_values);
      const contra = contradictions(template.schema, rev.field_values);
      if (missing.length || contra.length) {
        throw new ValidationError("El informe tiene faltantes o contradicciones.", [
          ...missing.map((f) => ({ field: f.key, message: "Falta" })),
          ...contra.map((c) => ({ field: c.fields.join("+"), message: c.message })),
        ]);
      }
      const { text, checksum } = renderReport(template.schema, rev.field_values, {
        templateKind: template.kind, templateVersion: template.version, templateStatus: template.status, revisionNo: rev.revision_no, final: true,
      });
      await q.query(
        "UPDATE report_revision SET status='aprobado', approver=$2, approved_at=$3, rendered=$4, checksum=$5 WHERE id=$1",
        [revisionId, actor.id, now, text, checksum],
      );
      return { text, checksum };
    });
  }

  /** Exportación: sólo revisiones aprobadas; se puede reexportar con la misma referencia y checksum. */
  async export(actor: Actor, revisionId: number) {
    requireRole(actor, "revisor_informes", "jefe_guardia");
    return this.db.tx(async (q) => {
      const rev = await this.loadRevision(q, actor, revisionId, true);
      if (rev.status !== "aprobado" && rev.status !== "exportado") throw new ValidationError("Sólo se exporta una revisión aprobada.");
      await q.query("UPDATE report_revision SET status='exportado' WHERE id=$1", [revisionId]);
      return { revisionId, text: rev.rendered!, checksum: rev.checksum! };
    });
  }

  async view(actor: Actor, revisionId: number) {
    requireRole(actor, ...READ_ROLES);
    const rev = await this.loadRevision(this.db, actor, revisionId, false);
    const template = (await this.db.query<TemplateRow>("SELECT * FROM report_template WHERE id=$1", [rev.template_id])).rows[0];
    const draft = renderReport(template.schema, rev.field_values, {
      templateKind: template.kind, templateVersion: template.version, templateStatus: template.status, revisionNo: rev.revision_no, final: false,
    });
    return {
      revision: rev,
      template: { kind: template.kind, version: template.version, status: template.status },
      questions: questionsFor(template.schema, rev.field_values),
      contradictions: contradictions(template.schema, rev.field_values),
      draft: rev.rendered ?? draft.text,
    };
  }

  /**
   * Sugerencias desde casos anteriores aprobados del mismo tipo: sólo QUÉ preguntar
   * (campos opcionales que se suelen completar), nunca valores de otro caso.
   */
  async suggestFromPrevious(actor: Actor, templateKind: string, values: Values) {
    requireRole(actor, ...READ_ROLES);
    const { rows } = await this.db.query<{ field_values: Values; schema: TemplateSchema }>(
      `SELECT r.field_values, t.schema FROM report_revision r JOIN report_template t ON t.id=r.template_id
       WHERE r.organization_id=$1 AND t.kind=$2 AND r.status IN ('aprobado','exportado')`,
      [actor.organizationId, templateKind],
    );
    if (!rows.length) return [];
    const counts = new Map<string, number>();
    for (const r of rows) for (const [k, v] of Object.entries(r.field_values)) if (v.value) counts.set(k, (counts.get(k) ?? 0) + 1);
    const fields = allFields(rows[0].schema);
    return fields
      .filter((f) => !f.required && !values[f.key] && (counts.get(f.key) ?? 0) / rows.length >= 0.5)
      .map((f) => ({ field: f.key, question: `En casos similares suele completarse "${f.label}". ${f.question}` }));
  }

  private async prefillFromLogbook(q: Queryable, interventionId: string): Promise<Values> {
    const { rows } = await q.query<{ at: Date; action: string; unit: string | null; evidence: { excerpt: string } }>(
      "SELECT at, action, unit, evidence FROM log_event WHERE intervention_id=$1 AND status='aceptado' AND at IS NOT NULL ORDER BY at, id",
      [interventionId],
    );
    const values: Values = {};
    const first = (action: string) => rows.find((r) => r.action === action);
    const set = (key: string, r?: (typeof rows)[number]) => {
      if (r) values[key] = { value: new Date(r.at).toISOString(), source: "registro", evidence: `bitácora: ${r.evidence.excerpt}` };
    };
    set("hora_salida", first("salida"));
    set("hora_arribo", first("arribo"));
    set("hora_finalizacion", [...rows].reverse().find((r) => r.action === "retorno"));
    const units = [...new Set(rows.map((r) => r.unit).filter(Boolean) as string[])];
    if (units.length) values.moviles = { value: units, source: "registro", evidence: "bitácora revisada" };
    const actions = rows.filter((r) => !["salida", "arribo", "retorno"].includes(r.action));
    if (actions.length) values.acciones = { value: actions.map((r) => r.evidence.excerpt), source: "registro", evidence: "bitácora revisada" };
    return values;
  }

  private async insertRevision(q: Queryable, actor: Actor, template: TemplateRow, interventionId: string, revisionNo: number, values: Values, now: Date) {
    const missing = missingFields(template.schema, values);
    const status = missing.length ? "incompleto" : "listo_para_revisar";
    const sources = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { source: v.source, evidence: v.evidence ?? null }]));
    const { rows } = await q.query<RevisionRow>(
      `INSERT INTO report_revision (organization_id, intervention_id, template_id, revision_no, field_values, field_sources, status, author, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [actor.organizationId, interventionId, template.id, revisionNo, JSON.stringify(values), JSON.stringify(sources), status, actor.id, now],
    );
    return {
      revision: rows[0],
      questions: questionsFor(template.schema, values),
      contradictions: contradictions(template.schema, values),
    };
  }

  private async loadRevision(q: Queryable, actor: Actor, id: number, lock: boolean) {
    const rev = (await q.query<RevisionRow>(`SELECT * FROM report_revision WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id])).rows[0];
    if (!rev) throw new NotFoundError("Revisión inexistente.");
    requireSameOrg(actor, rev.organization_id);
    return rev;
  }
}
